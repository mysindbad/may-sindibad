"use client";

import { useRef, useState, type FormEvent } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button, Input } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatWindow() {
  const { dict } = useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function sendMessage(text: string) {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(null);

    const optimisticId = `local-${Date.now()}`;
    setMessages((prev) => [...prev, { id: optimisticId, role: "user", content: text }]);
    setInput("");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId, localHour: new Date().getHours() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? dict.common.somethingWentWrong);
        return;
      }

      setConversationId(data.conversationId);

      if (!data.configured) {
        setNotConfigured(true);
        return;
      }

      if (data.assistantMessage) {
        setMessages((prev) => [...prev, { id: data.assistantMessage.id, role: "assistant", content: data.assistantMessage.content }]);
      } else if (data.error) {
        setError(data.error);
      }
    } catch {
      setError(dict.errors.network);
    } finally {
      setSending(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  const suggestions = [dict.ai.emptySuggestion1, dict.ai.emptySuggestion2, dict.ai.emptySuggestion3];

  return (
    <div className="mx-auto flex h-[calc(100dvh-136px)] max-w-2xl flex-col px-4 py-4 md:h-[calc(100dvh-64px)]">
      <div className="mb-3">
        <h1 className="text-lg font-semibold text-brand-950 dark:text-sand-50">✨ {dict.ai.title}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">{dict.ai.scopeNotice}</p>
      </div>

      <div
        ref={scrollRef}
        className={messages.length === 0 && !notConfigured ? "flex flex-1 items-center overflow-y-auto" : "flex-1 space-y-3 overflow-y-auto pb-4"}
      >
        {messages.length === 0 && !notConfigured && (
          <div className="w-full rounded-3xl border border-dashed border-brand-900/15 bg-white/60 p-6 text-center dark:border-white/15 dark:bg-white/5">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-800 to-sky-500 text-2xl">
              🧞
            </span>
            <p className="mb-3 text-sm font-medium text-brand-950 dark:text-sand-50">{dict.ai.emptyTitle}</p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendMessage(s)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-start text-sm text-brand-800 hover:bg-slate-50 dark:border-white/15 dark:bg-brand-900 dark:text-sky-300 dark:hover:bg-brand-900/70"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[80%] rounded-2xl rounded-br-sm bg-brand-800 px-4 py-2.5 text-sm text-white"
                  : "max-w-[80%] rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-sm text-brand-950 shadow-[var(--shadow-card)] dark:bg-brand-900 dark:text-sand-50"
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {sending && <p className="text-xs text-slate-400 dark:text-slate-500">{dict.ai.thinking}</p>}

        {notConfigured && (
          <InlineAlert tone="warning">
            <strong className="block">{dict.ai.notConfiguredTitle}</strong>
            {dict.ai.notConfiguredBody}
          </InlineAlert>
        )}

        {error && <InlineAlert tone="error">{error}</InlineAlert>}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-brand-900/8 pt-3 dark:border-white/10">
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={dict.ai.placeholder} aria-label={dict.ai.placeholder} disabled={sending} />
        <Button type="submit" loading={sending} disabled={!input.trim()}>
          {dict.ai.send}
        </Button>
      </form>
    </div>
  );
}
