"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, Database } from "lucide-react";
import { KemoMark } from "@/components/kemo-mark";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
};

type KnowledgeStats = {
  totalDocs: number;
  totalChars: number;
  lastUpdated: string | null;
};

export function AgentChatPanel({
  locale,
  theme = "dark",
  jobCount = 0,
  artifactCount = 0,
}: {
  locale: string;
  theme?: "light" | "dark";
  jobCount?: number;
  artifactCount?: number;
}) {
  const isZh = locale !== "en";
  const isDark = theme === "dark";
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<KnowledgeStats>({
    totalDocs: jobCount + artifactCount,
    totalChars: (jobCount > 0 || artifactCount > 0) ? (jobCount + artifactCount) * 1850 : 0,
    lastUpdated: null,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 初始及 Props 变更时同步加载数据
  useEffect(() => {
    setStats({
      totalDocs: jobCount + artifactCount,
      totalChars: (jobCount > 0 || artifactCount > 0) ? (jobCount + artifactCount) * 1850 : 0,
      lastUpdated: null,
    });
  }, [jobCount, artifactCount]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json();
      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: data.answer || (isZh ? "抱歉，暂时无法回答。" : "Sorry, I cannot answer right now."),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errMsg: ChatMessage = {
        id: `e-${Date.now()}`,
        role: "assistant",
        content: isZh ? "网络错误，请稍后重试。" : "Network error. Please try again.",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, isZh]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 主题色 (基于 Minimal Vercel/Apple 设计规范)
  const shellBg = "bg-background";
  const panelBg = "bg-card border border-border shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]";
  const inputBg = "bg-background border border-border text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-foreground focus:border-foreground transition-all";
  const headingColor = "text-foreground font-sans font-semibold tracking-tight";
  const mutedColor = "text-muted-foreground font-sans text-sm";
  const accentColor = "text-foreground";
  const userBubble = "bg-[#111111] text-[#ffffff] border border-transparent";
  const aiBubble = "bg-[#f2f2f2] text-[#111111] border border-transparent";
  const sendBtnClass = "bg-[#111111] hover:bg-[#333333] text-white transition-colors duration-200";

  return (
    <div className={`flex h-full min-h-screen flex-col ${shellBg}`}>
      {/* 顶部知识库状态栏 */}
      <div className={`flex items-center justify-between border-b px-8 py-4 ${isDark ? "border-white/8" : "border-[#dacfc3]"}`}>
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${isDark ? "border-[#48F9DB]/20 bg-[#00dcbf]/10" : "border-[#d8c0ab] bg-[#fff1e1]"}`}>
            <Database className={`h-4 w-4 ${accentColor}`} />
          </div>
          <div>
            <p className={`text-xs font-black uppercase tracking-[0.18em] ${mutedColor}`}>
              {isZh ? "知识库" : "Knowledge Base"}
            </p>
            <p className={`text-sm font-semibold ${headingColor}`}>
              {stats.totalDocs} {isZh ? "篇文档已索引" : "documents indexed"}
              {stats.totalChars > 0 && (
                <span className={`ml-2 text-xs ${mutedColor}`}>
                  {Math.round(stats.totalChars / 10000)}{isZh ? "万字" : "0K chars"}
                </span>
              )}
            </p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${isDark ? "border-[#48F9DB]/18 bg-[#00dcbf]/8 text-[#48F9DB]" : "border-[#d8c0ab] bg-[#fff1e1] text-[#8a5a3c]"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${isDark ? "bg-[#48F9DB]" : "bg-[#8a5a3c]"}`} />
          {isZh ? "就绪" : "Ready"}
        </span>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-6 xl:px-12">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border ${isDark ? "border-white/8 bg-white/[0.03]" : "border-[#dacfc3] bg-white/80"}`}>
              <KemoMark className={`h-8 w-8 ${accentColor}`} />
            </div>
            <h2 className={`text-2xl font-extrabold tracking-[-0.03em] ${headingColor}`}>
              {isZh ? "Kemo 知识 Agent" : "Kemo Knowledge Agent"}
            </h2>
            <p className={`mt-3 max-w-md text-center text-sm leading-7 ${mutedColor}`}>
              {isZh
                ? "所有访谈记录都是我的知识库。问我任何关于已有访谈内容的问题，我会从中寻找答案。"
                : "All your interview records form my knowledge base. Ask me anything about your existing interviews."}
            </p>
            {/* 快捷问题示例 */}
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {(isZh
                ? ["最近的访谈都聊了什么?", "哪位嘉宾被访谈次数最多?", "帮我总结所有项目的核心观点"]
                : ["What were my recent interviews about?", "Which guest was interviewed the most?", "Summarize all project insights"]
              ).map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setInput(example);
                    inputRef.current?.focus();
                  }}
                  className={`rounded-full border px-4 py-2 text-sm transition-all hover:scale-[1.02] ${isDark ? "border-white/10 bg-white/[0.03] text-[#c7d2cf] hover:bg-white/[0.06]" : "border-[#dacfc3] bg-white/80 text-[#6f6258] hover:bg-[#fff8f0]"}`}
                >
                  <Sparkles className="mr-1.5 inline-block h-3.5 w-3.5 opacity-60" />
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl border px-5 py-3.5 text-sm leading-7 ${msg.role === "user" ? userBubble : aiBubble}`}
                >
                  {msg.role === "assistant" && (
                    <div className={`mb-2 flex items-center gap-1.5 text-xs font-bold ${accentColor}`}>
                      <KemoMark className="h-3.5 w-3.5" />
                      Kemo Agent
                    </div>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className={`flex items-center gap-2 rounded-2xl border px-5 py-3.5 ${aiBubble}`}>
                  <Loader2 className={`h-4 w-4 animate-spin ${accentColor}`} />
                  <span className={`text-sm ${mutedColor}`}>{isZh ? "正在检索知识库..." : "Searching knowledge base..."}</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 底部输入框 */}
      <div className={`border-t px-6 py-5 xl:px-12 ${isDark ? "border-white/8" : "border-[#dacfc3]"}`}>
        <div className={`mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border p-2 ${panelBg}`}>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isZh ? "问我关于访谈记录的任何问题..." : "Ask me anything about your interviews..."}
            className={`max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border-0 bg-transparent px-4 py-2.5 text-sm leading-6 outline-none ${inputBg.split(" ").filter(c => c.startsWith("text-") || c.startsWith("placeholder:")).join(" ")}`}
            style={{ background: "transparent" }}
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-40 ${sendBtnClass}`}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
