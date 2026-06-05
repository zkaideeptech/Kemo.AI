import { formatLiveQuestionCoachPreview } from "../src/lib/live/questionCoachPreview";

const fallback = "继续采集中，问题建议稍后更新。";
const forbiddenTokens = ["heartbeat_id", "pool_a", "pool_b", "current_state", "operations"];

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertNoInternalJson(label: string, text: string) {
  for (const token of forbiddenTokens) {
    assert(!text.includes(token), `${label} leaked internal token '${token}': ${text}`);
  }
  assert(!text.trim().startsWith("{"), `${label} rendered a raw JSON object: ${text}`);
}

function runCase(label: string, content: string, expected: string[]) {
  const preview = formatLiveQuestionCoachPreview({ content, summary: content.slice(0, 180) }, fallback);
  assertNoInternalJson(label, preview);

  for (const value of expected) {
    assert(preview.includes(value), `${label} missing '${value}': ${preview}`);
  }

  console.log(`PASS ${label} - ${preview}`);
}

runCase(
  "pool A and pool B suggestions",
  JSON.stringify({
    heartbeat_id: 6,
    pool_a: {
      items: [
        {
          title: "商业化节奏",
          narrative: "受访者提到今年会开始收费。",
          follow_up: "你们今年收费的第一个客户会从哪类场景开始?",
        },
      ],
      callback_to_pool_b: {
        ref_id: 3,
        how_to_ask: "刚才提到渠道伙伴，这块具体怎么分成?",
      },
    },
    pool_b: {
      operations: [
        {
          op: "add",
          id: 9,
          question: "团队什么时候全员加入?",
          how_to_ask: "核心团队现在各自的 all in 时间表是什么?",
        },
      ],
      current_state: [
        {
          id: 1,
          question: "毛利率目标是多少?",
          how_to_ask: "如果规模化以后，毛利率能到什么水平?",
          status: "pending",
        },
      ],
    },
  }),
  ["商业化节奏", "今年收费", "渠道伙伴"]
);

runCase(
  "empty fallback draft",
  JSON.stringify({
    heartbeat_id: 7,
    pool_a: { items: [], callback_to_pool_b: null },
    pool_b: { operations: [], current_state: [] },
  }),
  [fallback]
);

runCase("json-like malformed content", '{"heartbeat_id":8,"pool_a":', [fallback]);

runCase("plain text passthrough", "继续追问客户的付费意愿和预算来源。", ["继续追问客户"]);
