#!/usr/bin/env python3
"""
Long-audio pipeline (real calls only):
Qwen3-ASR (DashScope) -> split into ~20-min segments -> sequential GPT with memory.
First run can emit speaker mapping draft; rerun with --speaker-map to confirm.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.error import HTTPError
from urllib.request import Request, urlopen

DEFAULT_DASHSCOPE_BASE = "https://dashscope.aliyuncs.com/api/v1"
DEFAULT_OPENAI_BASE = "https://api.openai.com/v1"
FILETRANS_MODEL = "qwen3-asr-flash-filetrans"


def load_env_file(path: str) -> None:
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            raw = line.strip()
            if not raw or raw.startswith("#"):
                continue
            if raw.startswith("export "):
                raw = raw[len("export ") :]
            if "=" not in raw:
                continue
            key, val = raw.split("=", 1)
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val


def http_json(
    url: str,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    payload: Optional[Dict[str, Any]] = None,
    timeout: int = 60,
) -> Tuple[int, Any]:
    data = None
    final_headers = headers.copy() if headers else {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        final_headers["Content-Type"] = "application/json"

    req = Request(url, data=data, headers=final_headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except HTTPError as err:
        body = err.read().decode("utf-8")
        try:
            return err.code, json.loads(body)
        except json.JSONDecodeError:
            return err.code, body


def start_transcription(
    audio_url: str,
    api_key: str,
    base_url: str,
    language: Optional[str],
) -> str:
    endpoint = f"{base_url}/services/audio/asr/transcription"
    body: Dict[str, Any] = {
        "model": FILETRANS_MODEL,
        "input": {"file_url": audio_url},
        "parameters": {"channel_id": [0], "enable_words": True},
    }
    if language:
        body["parameters"]["language"] = language

    status, res = http_json(
        endpoint,
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "X-DashScope-Async": "enable"},
        payload=body,
    )

    if status >= 400:
        raise RuntimeError(f"ASR submit failed: {res}")

    task_id = res.get("output", {}).get("task_id")
    if not task_id:
        raise RuntimeError(f"ASR response missing task_id: {res}")
    return task_id


def poll_transcription(
    task_id: str,
    api_key: str,
    base_url: str,
    poll_interval: int,
    max_attempts: int,
) -> Dict[str, Any]:
    endpoint = f"{base_url}/tasks/{task_id}"
    for attempt in range(1, max_attempts + 1):
        status, res = http_json(
            endpoint,
            method="GET",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        if status >= 400:
            raise RuntimeError(f"ASR poll failed: {res}")

        task_status = res.get("output", {}).get("task_status")
        if task_status == "SUCCEEDED":
            return res
        if task_status == "FAILED":
            raise RuntimeError(f"ASR task failed: {res}")
        time.sleep(poll_interval)

    raise RuntimeError("ASR polling timeout")


def fetch_transcription(task_res: Dict[str, Any]) -> Dict[str, Any]:
    transcription_url = task_res.get("output", {}).get("result", {}).get("transcription_url")
    if transcription_url:
        status, res = http_json(transcription_url, method="GET")
        if status >= 400:
            raise RuntimeError(f"Fetch transcription failed: {res}")
        return res
    return task_res


def first_non_none(*vals: Any) -> Any:
    for v in vals:
        if v is not None:
            return v
    return None


def extract_sentences(trans_json: Dict[str, Any]) -> List[Dict[str, Any]]:
    sentences: List[Dict[str, Any]] = []
    transcripts = trans_json.get("transcripts")

    if isinstance(transcripts, list):
        for t in transcripts:
            if isinstance(t, dict) and isinstance(t.get("sentences"), list):
                for s in t["sentences"]:
                    if not isinstance(s, dict):
                        continue
                    text = s.get("text") or ""
                    start = first_non_none(
                        s.get("begin_time"),
                        s.get("start_time"),
                        s.get("start"),
                        s.get("offset"),
                    )
                    end = first_non_none(
                        s.get("end_time"),
                        s.get("stop_time"),
                        s.get("end"),
                    )
                    sentences.append({"text": text, "start": start, "end": end})
            elif isinstance(t, dict) and isinstance(t.get("text"), str):
                sentences.append({"text": t["text"], "start": None, "end": None})

    if not sentences:
        # fallback to any top-level text
        text = (
            trans_json.get("output", {}).get("text")
            or trans_json.get("output", {}).get("result", {}).get("text")
            or trans_json.get("text")
            or trans_json.get("transcript")
        )
        if isinstance(text, str) and text.strip():
            sentences.append({"text": text, "start": None, "end": None})
    return sentences


def normalize_times(sentences: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    times = []
    for s in sentences:
        for key in ("start", "end"):
            val = s.get(key)
            if isinstance(val, (int, float)):
                times.append(val)
    if not times:
        return sentences

    max_t = max(times)
    # Heuristic: <= 100000 -> seconds, otherwise ms
    if max_t <= 100000:
        factor = 1.0
    else:
        factor = 0.001

    for s in sentences:
        if isinstance(s.get("start"), (int, float)):
            s["start_sec"] = s["start"] * factor
        if isinstance(s.get("end"), (int, float)):
            s["end_sec"] = s["end"] * factor
    return sentences


def split_segments(
    sentences: List[Dict[str, Any]],
    segment_minutes: int,
    force_segments: int,
) -> List[str]:
    sentences = normalize_times(sentences)

    has_time = any(s.get("start_sec") is not None for s in sentences)
    if has_time:
        seg_sec = segment_minutes * 60
        segments: List[str] = []
        cur: List[str] = []
        seg_start: Optional[float] = None
        for s in sentences:
            text = s.get("text") or ""
            start = s.get("start_sec")
            if seg_start is None and start is not None:
                seg_start = start
            if start is not None and seg_start is not None and (start - seg_start) >= seg_sec and cur:
                segments.append("".join(cur).strip())
                cur = []
                seg_start = start
            cur.append(text)
        if cur:
            segments.append("".join(cur).strip())
        if segments:
            return segments

    # Fallback: split by text length
    full_text = "".join([s.get("text") or "" for s in sentences]).strip()
    if not full_text:
        return []
    chunk_count = max(1, force_segments)
    chunk_size = max(1, math.ceil(len(full_text) / chunk_count))
    return [full_text[i : i + chunk_size] for i in range(0, len(full_text), chunk_size)]


def load_prompt(prompt_dir: str, name: str) -> str:
    path = os.path.join(prompt_dir, name)
    with open(path, "r", encoding="utf-8") as f:
        return f.read().strip()


def render_prompt(template: str, vars_map: Dict[str, str]) -> str:
    def repl(match: re.Match) -> str:
        key = match.group(1)
        return vars_map.get(key, "")

    return re.sub(r"\{\{(\w+)\}\}", repl, template)


def safe_json_parse(text: str) -> Dict[str, Any]:
    if not text:
        return {}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                return {}
    return {}


def parse_response_text(res: Dict[str, Any]) -> str:
    if isinstance(res.get("output_text"), str):
        return res["output_text"]
    output = res.get("output")
    if isinstance(output, list) and output:
        content = output[0].get("content")
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    return item["text"]
    return json.dumps(res, ensure_ascii=False)


def call_openai(prompt: str, api_key: str, base_url: str, model: str, temperature: float) -> str:
    endpoint = f"{base_url}/responses"
    payload = {"model": model, "input": prompt, "temperature": temperature}
    status, res = http_json(
        endpoint,
        method="POST",
        headers={"Authorization": f"Bearer {api_key}"},
        payload=payload,
        timeout=120,
    )
    if status >= 400:
        raise RuntimeError(f"OpenAI call failed: {res}")
    return parse_response_text(res)


def last_sentences_from_text(text: str, n: int = 3) -> str:
    text = text.strip()
    if not text:
        return ""
    parts = re.split(r"(?<=[。！？!?])\s*", text)
    parts = [p for p in parts if p.strip()]
    return " ".join(parts[-n:]) if parts else text[-200:]


def update_memory(prev: str, new: str, max_chars: int) -> str:
    if not new:
        return prev
    combined = (prev + "\n" + new).strip()
    if len(combined) <= max_chars:
        return combined
    return combined[-max_chars:]


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def load_speaker_map(value: Optional[str]) -> Tuple[Dict[str, str], bool]:
    if not value:
        return {}, False

    raw = value
    if os.path.exists(value):
        with open(value, "r", encoding="utf-8") as f:
            raw = f.read()

    try:
        data = json.loads(raw)
        if isinstance(data, dict):
            cleaned: Dict[str, str] = {}
            for k, v in data.items():
                if isinstance(k, str):
                    cleaned[k] = "" if v is None else str(v)
            return cleaned, True
    except json.JSONDecodeError:
        pass

    raise RuntimeError("Invalid --speaker-map (must be JSON or path to JSON file)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Long-audio pipeline (real APIs).")
    parser.add_argument("--audio-url", required=True, help="Public or signed URL to audio file.")
    parser.add_argument("--segment-minutes", type=int, default=20)
    parser.add_argument("--segments", type=int, default=6)
    parser.add_argument("--language", default="zh")
    parser.add_argument("--out-dir", default="outputs/long_audio")
    parser.add_argument("--prompt-dir", default="prompts")
    parser.add_argument("--poll-interval", type=int, default=3)
    parser.add_argument("--max-poll", type=int, default=120)
    parser.add_argument("--max-memory-chars", type=int, default=1200)
    parser.add_argument("--openai-model", default=None)
    parser.add_argument("--openai-base-url", default=None)
    parser.add_argument(
        "--speaker-map",
        default=None,
        help="JSON string or path to JSON file for confirmed speaker mapping.",
    )
    args = parser.parse_args()

    load_env_file(".env.local")

    dashscope_key = os.getenv("DASHSCOPE_API_KEY", "")
    dashscope_base = os.getenv("DASHSCOPE_API_BASE_URL", DEFAULT_DASHSCOPE_BASE)
    openai_key = os.getenv("OPENAI_API_KEY", "")
    openai_base = args.openai_base_url or os.getenv("OPENAI_BASE_URL", DEFAULT_OPENAI_BASE)
    openai_model = args.openai_model or os.getenv("OPENAI_MODEL", "gpt-5.2")

    if not dashscope_key:
        raise RuntimeError("Missing DASHSCOPE_API_KEY")
    if not openai_key:
        raise RuntimeError("Missing OPENAI_API_KEY")

    ensure_dir(args.out_dir)

    speaker_map_data, speaker_map_confirmed = load_speaker_map(args.speaker_map)
    speaker_map_text = (
        json.dumps(speaker_map_data, ensure_ascii=False) if speaker_map_data else ""
    )

    # Step 1: transcribe & split
    task_id = start_transcription(
        audio_url=args.audio_url,
        api_key=dashscope_key,
        base_url=dashscope_base,
        language=args.language,
    )
    task_res = poll_transcription(
        task_id=task_id,
        api_key=dashscope_key,
        base_url=dashscope_base,
        poll_interval=args.poll_interval,
        max_attempts=args.max_poll,
    )
    trans_json = fetch_transcription(task_res)
    with open(os.path.join(args.out_dir, "transcription.json"), "w", encoding="utf-8") as f:
        json.dump(trans_json, f, ensure_ascii=False, indent=2)

    sentences = extract_sentences(trans_json)
    segments = split_segments(sentences, args.segment_minutes, args.segments)
    if not segments:
        raise RuntimeError("No transcript segments produced")

    # Load prompts
    segment_template = load_prompt(args.prompt_dir, "segment_context_loop.md")

    # Step 2: init memory
    context_memory = ""
    last_sentences = ""

    # Step 3: sequential loop
    segment_texts: List[str] = []
    all_uncertain_terms: List[Dict[str, Any]] = []
    final_title = ""
    total = len(segments)
    for idx, segment in enumerate(segments, start=1):
        progress = int(round(idx / total * 100))
        prompt = render_prompt(
            segment_template,
            {
                "segment_index": str(idx),
                "segment_total": str(total),
                "progress": str(progress),
                "prev_summary": context_memory,
                "prev_tail": last_sentences,
                "segment_text": segment,
                "speaker_map": speaker_map_text,
                "speaker_map_confirmed": "true" if speaker_map_confirmed else "false",
            },
        )

        raw = call_openai(
            prompt=prompt,
            api_key=openai_key,
            base_url=openai_base,
            model=openai_model,
            temperature=0.2,
        )
        data = safe_json_parse(raw)

        needs_confirmation = bool(data.get("needs_confirmation"))
        if needs_confirmation and not speaker_map_confirmed:
            speaker_map_draft = data.get("speaker_map_draft") or {}
            confirm_question = data.get("confirm_question") or "请确认每个说话人是谁（姓名/称呼）？"
            title = (data.get("title") or "").strip()
            uncertain_terms = data.get("uncertain_terms") or []

            with open(
                os.path.join(args.out_dir, "speaker_map_draft.json"),
                "w",
                encoding="utf-8",
            ) as f:
                json.dump(
                    {
                        "title": title,
                        "speaker_map_draft": speaker_map_draft,
                        "confirm_question": confirm_question,
                    },
                    f,
                    ensure_ascii=False,
                    indent=2,
                )
            with open(
                os.path.join(args.out_dir, "uncertain_terms.json"),
                "w",
                encoding="utf-8",
            ) as f:
                json.dump(uncertain_terms, f, ensure_ascii=False, indent=2)

            print("Speaker mapping confirmation required.")
            print(f"Review {args.out_dir}/speaker_map_draft.json and rerun with --speaker-map.")
            return

        if idx == 1:
            final_title = (data.get("title") or "").strip()

        uncertain_terms = data.get("uncertain_terms") or []
        if isinstance(uncertain_terms, list):
            all_uncertain_terms.extend([t for t in uncertain_terms if isinstance(t, dict)])

        segment_text = (data.get("segment_text") or "").strip()
        if not segment_text:
            segment_text = raw.strip()
        segment_summary = (data.get("segment_summary") or "")[:4000]
        tail = data.get("tail_sentences") or last_sentences_from_text(segment_text)

        segment_texts.append(segment_text)
        context_memory = update_memory(context_memory, segment_summary, args.max_memory_chars)
        last_sentences = tail

        with open(os.path.join(args.out_dir, f"segment_{idx:02d}.json"), "w", encoding="utf-8") as f:
            json.dump(data or {"raw": raw}, f, ensure_ascii=False, indent=2)
        with open(os.path.join(args.out_dir, f"segment_{idx:02d}.md"), "w", encoding="utf-8") as f:
            f.write(segment_text + "\n")

    full_body = "\n\n".join(segment_texts).strip()
    with open(os.path.join(args.out_dir, "body.md"), "w", encoding="utf-8") as f:
        f.write(full_body + "\n")

    final_doc_parts = []
    if final_title:
        final_doc_parts.append(f"# {final_title}")
    final_doc_parts.append(full_body)
    final_doc = "\n\n".join([p for p in final_doc_parts if p]).strip() + "\n"

    if all_uncertain_terms:
        with open(os.path.join(args.out_dir, "uncertain_terms.json"), "w", encoding="utf-8") as f:
            json.dump(all_uncertain_terms, f, ensure_ascii=False, indent=2)
    with open(os.path.join(args.out_dir, "final_package.md"), "w", encoding="utf-8") as f:
        f.write(final_doc)

    print("Done. Output dir:", args.out_dir)


if __name__ == "__main__":
    main()
