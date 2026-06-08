import { buildArtifactPrompt } from "../src/lib/providers/llmProvider";
import type { ArtifactKind } from "../src/lib/workspace";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const baseInput = {
  transcriptText: "Interviewer: What changed after launch?\nGuest: Retention improved after onboarding was simplified.",
  glossaryTerms: ["retention"],
  uncertainTerms: [],
  sourceContext: "Project source context",
  clarificationContext: "Clarified onboarding means first-session product setup.",
  title: "Retention Interview",
  guestName: "Guest A",
  interviewerName: "Kemo",
  publishScriptText: "Kemo: What changed after launch?\nGuest A: Retention improved after onboarding was simplified.",
};

const interviewArtifacts: Array<{ kind: ArtifactKind; promptFile: string }> = [
  { kind: "quick_summary", promptFile: "quick_summary.md" },
  { kind: "inspiration_questions", promptFile: "inspiration_questions.md" },
  { kind: "ic_qa", promptFile: "ic_qa.md" },
  { kind: "wechat_article", promptFile: "wechat_article.md" },
];

async function main() {
  for (const { kind, promptFile } of interviewArtifacts) {
    const prompt = await buildArtifactPrompt(kind, baseInput);
    assert(
      prompt.includes("[KEMO_BUSINESS_SKILL:skills/00-interview-editor/SKILL.md]"),
      `${kind} did not load the interview editor skill`,
    );
    assert(prompt.includes("# 访谈对话整理编辑器"), `${kind} prompt is missing interview editor skill content`);
    assert(prompt.includes(`[KEMO_FORMAT_PROMPT:prompts/${promptFile}]`), `${kind} did not load ${promptFile}`);
    assert(prompt.includes(baseInput.publishScriptText), `${kind} did not receive the canonical publish script`);
    console.log(`PASS ${kind} -> 00-interview-editor + ${promptFile}`);
  }

  const liveMeetingPrompt = await buildArtifactPrompt("live_meeting_editor", baseInput);
  assert(liveMeetingPrompt.includes("Live Meeting Editor"), "live_meeting_editor did not load 03-live-meeting-editor");
  console.log("PASS live_meeting_editor -> 03-live-meeting-editor");

  const liveCoachPrompt = await buildArtifactPrompt("live_question_coach", baseInput);
  assert(liveCoachPrompt.includes("实时提问搭档"), "live_question_coach did not load 04-live-question-coach");
  console.log("PASS live_question_coach -> 04-live-question-coach");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
