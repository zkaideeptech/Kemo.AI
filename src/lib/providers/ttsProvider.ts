const DEFAULT_TTS_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";

export async function synthesizePodcastAudio({
  script,
  title,
}: {
  script: string;
  title: string;
}) {
  const apiKey = process.env.DASHSCOPE_API_KEY || "";
  const baseUrl = process.env.DASHSCOPE_TTS_BASE_URL || DEFAULT_TTS_BASE_URL;
  const model = process.env.DASHSCOPE_TTS_MODEL || "qwen-tts-latest";

  if (!apiKey) {
    throw new Error("Missing DASHSCOPE_API_KEY");
  }

  const res = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model,
      input: {
        text: script,
        title,
      },
      parameters: {
        format: "mp3",
        voice: process.env.DASHSCOPE_TTS_VOICE || "longxiaochun_v2",
      },
    }),
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json?.message || `TTS request failed with ${res.status}`);
  }

  const audioUrl =
    json?.output?.audio?.url ||
    json?.output?.audio_url ||
    json?.output?.result?.audio_url ||
    null;

  if (!audioUrl) {
    throw new Error("DashScope TTS did not return an audio URL");
  }

  return {
    audioUrl,
    raw: json,
  };
}
