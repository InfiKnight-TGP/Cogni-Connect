"use client";

import { useState } from "react";
import { Search, Loader2, Trash2 } from "lucide-react";
import ReadAloud from "@/components/interaction/ReadAloud";
import DictationButton from "@/components/interaction/DictationButton";
import { usePreferences, useTranslate } from "@/components/interaction/InteractionProvider";
import { API_URL, apiFetch } from "@/lib/api";
import { formatFriendlyDate } from "@/lib/date-format";

export type AnswerData = {
  answer: string;
  grounded: boolean;
  summary?: string;
  sources: {
    memory_id: string;
    title: string;
    date?: string;
    dateLabel?: string;
    label?: string;
  }[];
};

function AnswerCard({
  answer,
  onSource,
  onClear,
}: {
  answer: AnswerData;
  onSource?: (id: string) => void;
  onClear?: () => void;
}) {
  const { t, language } = useTranslate();
  const { preferences } = usePreferences();
  const isGrounded = answer.grounded;

  return (
    <div
      className={`mt-4 rounded-2xl border-2 p-5 transition ${
        isGrounded
          ? "border-primary/30 bg-card shadow-sm"
          : "border-border/80 bg-muted/30 shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-xl font-medium leading-relaxed text-foreground">
          {answer.answer}
        </p>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            {t("Clear")}
          </button>
        )}
      </div>

      {!isGrounded && answer.summary && (
        <div className="mt-4 rounded-xl border border-border bg-card/60 p-4">
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            {t("About this memory:")}
          </p>
          <p className="mt-1 text-lg text-foreground">{answer.summary}</p>
        </div>
      )}

      {!isGrounded && (
        <p className="mt-3 text-sm italic text-muted-foreground">
          {t("Try: Tell me about this video")}
        </p>
      )}

      {isGrounded && answer.sources && answer.sources.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {answer.sources.map((source) => {
            const formattedDate = formatFriendlyDate(source.date, language) || source.dateLabel || source.label;
            return (
              <button
                type="button"
                key={source.memory_id}
                onClick={() => onSource?.(source.memory_id)}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-border bg-background px-4 py-1.5 text-sm font-semibold transition hover:border-primary hover:bg-muted"
              >
                <span>{source.title}</span>
                {formattedDate && (
                  <span className="font-normal text-muted-foreground">
                    • {formattedDate}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        <ReadAloud
          text={
            answer.summary
              ? `${answer.answer}. ${answer.summary}`
              : answer.answer
          }
          autoRead={preferences.readAloud}
        />
      </div>
    </div>
  );
}

interface MemoryAskPanelProps {
  scope: "memory" | "all";
  memoryId?: string;
  onSelectMemory?: (id: string) => void;
  allowScopeToggle?: boolean;
  onScopeChange?: (scope: "memory" | "all") => void;
  title?: string;
  subtitle?: string;
  chips?: string[];
  maxHistory?: number;
}

export default function MemoryAskPanel({
  scope,
  memoryId,
  onSelectMemory,
  allowScopeToggle = false,
  onScopeChange,
  title,
  subtitle,
  chips = [],
  maxHistory = 5,
}: MemoryAskPanelProps) {
  const { t } = useTranslate();
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<AnswerData | null>(null);
  const [asking, setAsking] = useState(false);
  const [history, setHistory] = useState<{ q: string; a: string }[]>([]);
  const [error, setError] = useState("");

  const ask = async (questionText = query) => {
    const clean = questionText.trim();
    if (!clean) return;
    setQuery(clean);
    setAsking(true);
    setError("");
    try {
      const payload: Record<string, string> = { question: clean, scope };
      if (scope === "memory" && memoryId) {
        payload.memory_id = memoryId;
      }
      const response = await apiFetch(`${API_URL}/memories/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error("Please try again in a moment. The server is restarting.");
      }
      if (!response.ok) {
        throw new Error(
          response.status === 429 || response.status === 503
            ? "Please try again in a moment."
            : data.error ?? "Please try again in a moment."
        );
      }
      const parsed: AnswerData = {
        answer: String(data.answer ?? ""),
        grounded: Boolean(data.grounded),
        summary: data.summary ? String(data.summary) : undefined,
        sources: Array.isArray(data.sources) ? data.sources : [],
      };
      setAnswer(parsed);
      setHistory((prev) =>
        [{ q: clean, a: parsed.answer }, ...prev.filter((h) => h.q !== clean)].slice(0, maxHistory)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again in a moment.");
    } finally {
      setAsking(false);
    }
  };

  return (
    <section className="rounded-2xl border-2 border-border bg-card p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {title && <h2 className="text-xl sm:text-2xl font-bold">{t(title)}</h2>}
          {subtitle && (
            <p className="mt-1 text-sm sm:text-base text-muted-foreground">{t(subtitle)}</p>
          )}
        </div>

        {allowScopeToggle && (
          <div className="flex rounded-xl border-2 border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => onScopeChange?.("memory")}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                scope === "memory"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("This memory")}
            </button>
            <button
              type="button"
              onClick={() => onScopeChange?.("all")}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                scope === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("All my memories")}
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void ask();
          }}
          placeholder={
            scope === "memory"
              ? t("Ask about this memory...")
              : t("Ask about your memories...")
          }
          className="min-h-12 sm:min-h-14 flex-1 rounded-xl border-2 border-border bg-background px-4 text-base sm:text-lg outline-none focus:border-primary"
        />
        <DictationButton value={query} onText={setQuery} alwaysVisible />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={asking}
          className="min-h-12 sm:min-h-14 rounded-xl bg-primary px-5 sm:px-6 text-base sm:text-lg font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {asking ? (
            <Loader2 className="mr-2 inline h-5 w-5 animate-spin" />
          ) : (
            <Search className="mr-2 inline h-5 w-5" />
          )}
          {t("Ask")}
        </button>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 sm:mt-4 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              type="button"
              key={chip}
              onClick={() => void ask(chip)}
              className="min-h-9 sm:min-h-10 rounded-full border-2 border-border bg-muted/40 px-3.5 sm:px-4 py-1 text-xs sm:text-sm font-semibold transition hover:border-primary hover:bg-background"
            >
              {t(chip)}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm font-semibold text-destructive">{t(error)}</p>
      )}

      {answer && (
        <AnswerCard
          answer={answer}
          onSource={onSelectMemory}
          onClear={() => setAnswer(null)}
        />
      )}

      {history.length > 0 && (
        <div className="mt-5 sm:mt-6 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {t(scope === "memory" ? "Recent in this video" : "Recent questions")}
            </p>
            <button
              type="button"
              onClick={() => setHistory([])}
              className="inline-flex items-center gap-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="h-4 w-4" />
              {t("Clear history")}
            </button>
          </div>
          <div className="mt-2 space-y-1.5 sm:space-y-2">
            {history.map((item, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => void ask(item.q)}
                className="block w-full rounded-xl border border-border/60 bg-background/50 p-2.5 sm:p-3 text-left transition hover:border-primary text-sm"
              >
                <p className="font-semibold text-foreground">"{item.q}"</p>
                <p className="mt-0.5 line-clamp-1 text-xs sm:text-sm text-muted-foreground">
                  {item.a}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
