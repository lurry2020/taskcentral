import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Loader2, MessageCircle, Minus, Send, Settings, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/ui/Markdown";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/queries";

const CHAT_OPEN_KEY = "taskcentral-chat-open";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

function initialOpenState(): boolean {
  try {
    return localStorage.getItem(CHAT_OPEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function ChatWidget() {
  const [open, setOpen] = useState(initialOpenState);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const { data: settings } = useSettings();

  const configured = Boolean(
    settings?.llm_enabled && settings.llm_base_url.trim() && settings.llm_model.trim(),
  );

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_OPEN_KEY, String(open));
    } catch {
      // Storage can be unavailable in private or locked-down browser contexts.
    }
  }, [open]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, open]);

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || sending || !configured) return;
    const userMessage: ChatMessage = { id: nextId.current++, role: "user", content };
    const outgoing = [...messages, userMessage];
    setMessages(outgoing);
    setDraft("");
    setError(null);
    setSending(true);
    try {
      const response = await api.post<{ content: string }>("/chat", {
        messages: outgoing.map(({ role, content: text }) => ({ role, content: text })),
        context_path: window.location.pathname,
      });
      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: "assistant", content: response.content },
      ]);
    } catch (err) {
      setError((err as Error).message || "The local AI request failed.");
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-linear-to-b from-accent to-accent-deep text-white shadow-(--shadow-pop) ring-1 ring-inset ring-line-strong transition-all hover:scale-105 hover:from-accent-hover hover:to-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-95"
        aria-label="Open Task Central chat"
        aria-expanded="false"
        aria-controls="taskcentral-chat"
        title="Open chat"
      >
        <MessageCircle className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  return (
    <section
      id="taskcentral-chat"
      className="pop-in fixed bottom-4 right-4 z-40 flex h-[24rem] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[20rem] flex-col overflow-hidden rounded-2xl bg-surface shadow-(--shadow-pop) ring-1 ring-line-strong"
      aria-label="Task Central chat"
    >
      <header className="flex h-13 shrink-0 items-center gap-3 border-b border-border bg-surface-2 px-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-hover">
          <Bot className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">Task Central Assistant</h2>
        </div>
        {messages.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            aria-label="Clear chat"
            title="Clear chat"
            disabled={sending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setOpen(false)}
          aria-label="Minimize chat"
          title="Minimize chat"
        >
          <Minus className="h-4 w-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!configured ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-info-soft text-info">
              <Settings className="h-4.5 w-4.5" aria-hidden />
            </div>
            <p className="mt-3 text-sm font-medium">Connect a local AI</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Choose an Ollama or OpenAI-compatible local model in Settings before starting a
              conversation.
            </p>
            <Link
              to="/settings"
              className="mt-3 inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-info ring-1 ring-inset ring-info/25 transition-colors hover:bg-info-soft"
            >
              Open Settings
            </Link>
          </div>
        ) : messages.length === 0 ? (
          <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-3 ring-1 ring-inset ring-line">
            <p className="text-xs leading-relaxed text-text">
              Hi! Ask me how to use, configure, or troubleshoot Task Central.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-white"
                    : "max-w-[92%] rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2.5 ring-1 ring-inset ring-line"
                }
              >
                {message.role === "assistant" ? (
                  <Markdown
                    content={message.content}
                    className="text-xs leading-relaxed [&_p]:my-1.5 [&_pre]:my-2 [&_pre]:p-2.5"
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-xs leading-relaxed">{message.content}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {sending && (
          <div className="mt-3 flex max-w-[88%] items-center gap-2 rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-3 text-xs text-muted ring-1 ring-inset ring-line">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Thinking…
          </div>
        )}
        {error && (
          <div
            className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-xs leading-relaxed text-accent-hover ring-1 ring-inset ring-accent/25"
            role="alert"
          >
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-border bg-surface-2/70 p-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
            disabled={!configured || sending}
            placeholder={configured ? "Ask about Task Central…" : "Configure local AI in Settings"}
            aria-label="Chat message"
            className="max-h-24 min-h-9 min-w-0 flex-1 resize-none rounded-lg bg-fill px-3 py-2 text-xs leading-relaxed text-text placeholder:text-faint ring-1 ring-inset ring-line transition-all focus:bg-fill-hover focus:outline-none focus:ring-2 focus:ring-accent/45 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <Button
            type="button"
            variant="primary"
            size="icon"
            onClick={() => void sendMessage()}
            disabled={!configured || sending || !draft.trim()}
            aria-label="Send message"
            title="Send message"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
        {configured && (
          <p className="mt-1.5 text-center text-[10px] text-faint">
            Local model responses may be inaccurate. Verify important actions.
          </p>
        )}
      </div>
    </section>
  );
}
