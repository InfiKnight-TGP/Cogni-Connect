"use client";

import Nav from "@/components/nav";
import ReadAloud from "@/components/interaction/ReadAloud";
import DictationButton from "@/components/interaction/DictationButton";
import { usePreferences, useTranslate } from "@/components/interaction/InteractionProvider";
import { API_URL, apiFetch } from "@/lib/api";
import { Calendar, ChevronLeft, ChevronRight, Loader2, Play, Search, Trash2, X } from "lucide-react";
import { formatFriendlyDate, groupMemoriesByDate } from "@/lib/date-format";
import { useCallback, useEffect, useRef, useState } from "react";

type Memory = {
  id: string;
  title: string;
  date?: string;
  dateLabel?: string;
  note?: string;
  thumbnailUrl: string;
  status: "ready" | "processing" | "failed";
};

type AnswerData = {
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
  onSource: (id: string) => void;
  onClear?: () => void;
}) {
  const { t } = useTranslate();
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
          {answer.sources.map((source) => (
            <button
              type="button"
              key={source.memory_id}
              onClick={() => onSource(source.memory_id)}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-border bg-background px-4 py-1.5 text-sm font-semibold transition hover:border-primary hover:bg-muted"
            >
              <span>{source.title}</span>
              {(source.dateLabel || source.label) && (
                <span className="font-normal text-muted-foreground">
                  • {source.dateLabel || source.label}
                </span>
              )}
            </button>
          ))}
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

export default function ExplorePage() {
  const { t, language } = useTranslate();
  const { preferences } = usePreferences();

  const [memories, setMemories] = useState<Memory[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Gallery ask state
  const [galleryQuery, setGalleryQuery] = useState("");
  const [galleryAnswer, setGalleryAnswer] = useState<AnswerData | null>(null);
  const [galleryAsking, setGalleryAsking] = useState(false);
  const [galleryHistory, setGalleryHistory] = useState<{ q: string; a: string }[]>([]);

  // Player modal state
  const [open, setOpen] = useState<Memory | null>(null);
  const [openIndex, setOpenIndex] = useState(0);
  const [playerScope, setPlayerScope] = useState<"memory" | "all">("memory");
  const [playerQuery, setPlayerQuery] = useState("");
  const [playerAnswer, setPlayerAnswer] = useState<AnswerData | null>(null);
  const [playerAsking, setPlayerAsking] = useState(false);
  const [playerHistory, setPlayerHistory] = useState<{ q: string; a: string }[]>([]);

  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const load = useCallback(async (next = false) => {
    if (next && !cursor) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (next && cursor) params.set("cursor", cursor);
      const response = await apiFetch(`${API_URL}/memories?${params}`);
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Please sign in again."
            : "Memories are not available right now."
        );
      }
      const data = (await response.json()) as {
        memories?: Memory[];
        nextCursor?: string | null;
      };
      setMemories((previous) =>
        next ? [...previous, ...(data.memories ?? [])] : data.memories ?? []
      );
      setCursor(data.nextCursor ?? null);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Memories are not available right now."
      );
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    void load();
  }, [load]);

  // Polling for processing status
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const pending = memories.filter((memory) => memory.status === "processing");
      if (!pending.length) return;
      void Promise.all(
        pending.map(async (memory) => {
          const response = await apiFetch(
            `${API_URL}/processing-status/${encodeURIComponent(memory.id)}`,
            { authRedirect: false }
          );
          if (!response.ok) return null;
          const status = (await response.json()) as { status?: string };
          return {
            id: memory.id,
            status:
              status.status === "completed"
                ? "ready"
                : status.status === "failed"
                ? "failed"
                : "processing",
          } as const;
        })
      ).then((updates) =>
        setMemories((current) =>
          current.map((memory) => {
            const update = updates.find((item) => item?.id === memory.id);
            return update ? { ...memory, status: update.status } : memory;
          })
        )
      );
    }, 2500);
    return () => window.clearInterval(timer);
  }, [memories]);

  const openMemoryModal = useCallback((memory: Memory) => {
    const idx = memories.findIndex((item) => item.id === memory.id);
    setOpen(memory);
    setOpenIndex(idx >= 0 ? idx : 0);
    setPlayerScope("memory");
    setPlayerQuery("");
    setPlayerAnswer(null);
    setPlayerHistory([]);
    window.history.pushState({ memoryPlayer: memory.id }, "", `#memory-${memory.id}`);
  }, [memories]);

  const close = useCallback(() => {
    const id = open?.id;
    setOpen(null);
    if (window.history.state?.memoryPlayer) {
      window.history.back();
    }
    window.setTimeout(() => {
      if (id) cardRefs.current[id]?.focus();
    }, 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPop = () => setOpen(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [open, close]);

  const askGallery = async (questionText = galleryQuery) => {
    const clean = questionText.trim();
    if (!clean) return;
    setGalleryQuery(clean);
    setGalleryAsking(true);
    try {
      const response = await apiFetch(`${API_URL}/memories/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ question: clean, scope: "all" }),
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
      setGalleryAnswer(parsed);
      setGalleryHistory((prev) =>
        [{ q: clean, a: parsed.answer }, ...prev.filter((h) => h.q !== clean)].slice(0, 5)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again in a moment.");
    } finally {
      setGalleryAsking(false);
    }
  };

  const askPlayer = async (questionText = playerQuery, scope = playerScope) => {
    const clean = questionText.trim();
    if (!clean || !open) return;
    setPlayerQuery(clean);
    setPlayerAsking(true);
    try {
      const payload: Record<string, string> = { question: clean, scope };
      if (scope === "memory") {
        payload.memory_id = open.id;
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
      setPlayerAnswer(parsed);
      setPlayerHistory((prev) =>
        [{ q: clean, a: parsed.answer }, ...prev.filter((h) => h.q !== clean)].slice(0, 3)
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again in a moment.");
    } finally {
      setPlayerAsking(false);
    }
  };

  const handleSourceClick = (id: string) => {
    const target = memories.find((item) => item.id === id);
    if (target) {
      openMemoryModal(target);
    }
  };

  const grouped = groupMemoriesByDate(memories, language);

  const galleryChips = [
    "Tell me about my day",
    "Where did I go?",
    "Who did I meet?",
    "What was I doing?",
  ];

  const playerChips = [
    "Tell me about this video",
    "Where was I?",
    "Who was in it?",
    "When was this?",
  ];

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-5 pb-20 pt-24 lg:ml-[260px] lg:pt-10">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("My Memories")}
          </p>
          <h1 className="mt-2 text-4xl font-bold">{t("My Memories")}</h1>
          <ReadAloud text={t("My Memories")} autoRead={false} />
          <p className="mt-3 text-xl text-muted-foreground">
            {t("Look back at moments that matter.")}
          </p>
        </header>

        {error && (
          <section
            className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-lg"
            role="alert"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 min-h-12 rounded-xl border-2 border-border px-4 font-semibold"
            >
              {t("Try again")}
            </button>
          </section>
        )}

        {/* General Ask Box at top of gallery */}
        <section className="mb-10 rounded-2xl border-2 border-border bg-card p-6 shadow-sm">
          <h2 className="text-2xl font-bold">{t("Ask about your memories")}</h2>
          <p className="mt-1 text-base text-muted-foreground">
            {t("Ask anything about your saved moments.")}
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <input
              value={galleryQuery}
              onChange={(e) => setGalleryQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void askGallery();
              }}
              placeholder={t("Ask about your memories...")}
              className="min-h-14 flex-1 rounded-xl border-2 border-border bg-background px-4 text-lg outline-none focus:border-primary"
            />
            <DictationButton
              value={galleryQuery}
              onText={setGalleryQuery}
              alwaysVisible
            />
            <button
              type="button"
              onClick={() => void askGallery()}
              disabled={galleryAsking}
              className="min-h-14 rounded-xl bg-primary px-6 text-lg font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
            >
              {galleryAsking ? (
                <Loader2 className="mr-2 inline h-5 w-5 animate-spin" />
              ) : (
                <Search className="mr-2 inline h-5 w-5" />
              )}
              {t("Ask")}
            </button>
          </div>

          {/* Gallery Suggestion Chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            {galleryChips.map((chip) => (
              <button
                type="button"
                key={chip}
                onClick={() => void askGallery(chip)}
                className="min-h-10 rounded-full border-2 border-border bg-muted/40 px-4 py-1 text-sm font-semibold transition hover:border-primary hover:bg-background"
              >
                {t(chip)}
              </button>
            ))}
          </div>

          {galleryAnswer && (
            <AnswerCard
              answer={galleryAnswer}
              onSource={handleSourceClick}
              onClear={() => setGalleryAnswer(null)}
            />
          )}

          {/* History of last 5 answers */}
          {galleryHistory.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {t("Recent questions")}
                </p>
                <button
                  type="button"
                  onClick={() => setGalleryHistory([])}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("Clear history")}
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {galleryHistory.map((item, idx) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => void askGallery(item.q)}
                    className="block w-full rounded-xl border border-border/60 bg-background/50 p-3 text-left transition hover:border-primary"
                  >
                    <p className="font-semibold text-foreground">"{item.q}"</p>
                    <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                      {item.a}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Gallery Memories List */}
        {loading && memories.length === 0 ? (
          <p className="text-xl" role="status">
            <Loader2 className="mr-2 inline h-6 w-6 animate-spin" />
            {t("Loading memories…")}
          </p>
        ) : grouped.length === 0 ? (
          <section className="rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-2xl font-semibold">{t("Add your first video")}</p>
            <p className="mt-2 text-lg text-muted-foreground">
              {t("Your memories will appear here when they are ready.")}
            </p>
          </section>
        ) : (
          <div className="space-y-12">
            {grouped.map((group) => (
              <section key={group.label}>
                <h2 className="mb-4 text-2xl font-bold tracking-tight">
                  {group.label}
                </h2>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((memory) => {
                    const friendlyDate = formatFriendlyDate(memory.date, language);
                    return (
                      <button
                        key={memory.id}
                        ref={(element) => {
                          cardRefs.current[memory.id] = element;
                        }}
                        type="button"
                        onClick={() => memory.status === "ready" && openMemoryModal(memory)}
                        disabled={memory.status !== "ready"}
                        className="group overflow-hidden rounded-2xl border-2 border-border bg-card text-left shadow-sm transition hover:border-primary hover:shadow-md disabled:cursor-default disabled:opacity-80"
                      >
                        <div className="relative aspect-video bg-muted overflow-hidden">
                          <img
                            src={`${API_URL}${memory.thumbnailUrl}`}
                            alt=""
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                          {memory.status === "ready" && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-90 transition group-hover:opacity-100">
                              <span className="rounded-full bg-primary p-4 text-primary-foreground shadow-lg transition transform group-hover:scale-110">
                                <Play className="h-7 w-7 fill-current" />
                              </span>
                            </span>
                          )}
                          {memory.status !== "ready" && (
                            <span className="absolute inset-0 flex items-center justify-center bg-background/80 p-4 text-center text-lg font-semibold">
                              {memory.status === "processing"
                                ? t("Processing…")
                                : t("Could not process this video")}
                            </span>
                          )}
                        </div>
                        <div className="space-y-2 p-5">
                          <h3 className="text-xl font-bold leading-snug">
                            {memory.title}
                          </h3>
                          {friendlyDate && (
                            <p className="flex items-center gap-2 text-base text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              {friendlyDate}
                            </p>
                          )}
                          {memory.note && (
                            <p className="line-clamp-2 text-base text-muted-foreground">
                              {memory.note}
                            </p>
                          )}
                          <ReadAloud
                            text={`${memory.title}. ${memory.note ?? ""}`}
                            autoRead={false}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {cursor && (
          <button
            type="button"
            onClick={() => void load(true)}
            className="mt-10 min-h-14 rounded-xl border-2 border-border px-6 text-lg font-semibold"
          >
            {t("Show more")}
          </button>
        )}
      </main>

      {/* Modal Player */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={open.title}
        >
          <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-y-auto rounded-3xl bg-background p-6 shadow-2xl">
            {/* Header / Nav */}
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={close}
                className="inline-flex min-h-12 items-center rounded-xl border-2 border-border bg-card px-4 text-base font-semibold transition hover:border-primary"
              >
                <X className="mr-2 h-5 w-5" />
                {t("Close")}
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={openIndex <= 0}
                  onClick={() => {
                    const next = memories[openIndex - 1];
                    if (next) openMemoryModal(next);
                  }}
                  className="min-h-12 min-w-12 rounded-xl border-2 border-border bg-card disabled:opacity-40"
                  aria-label={t("Previous memory")}
                >
                  <ChevronLeft className="h-6 w-6 m-auto" />
                </button>
                <button
                  type="button"
                  disabled={openIndex >= memories.length - 1}
                  onClick={() => {
                    const next = memories[openIndex + 1];
                    if (next) openMemoryModal(next);
                  }}
                  className="min-h-12 min-w-12 rounded-xl border-2 border-border bg-card disabled:opacity-40"
                  aria-label={t("Next memory")}
                >
                  <ChevronRight className="h-6 w-6 m-auto" />
                </button>
              </div>
            </div>

            {/* Video Player */}
            <video
              controls
              playsInline
              muted={preferences.readAloud}
              autoPlay={!preferences.readAloud}
              className="max-h-[55vh] w-full rounded-2xl bg-black object-contain shadow-md"
              src={`${API_URL}/memories/${open.id}/video`}
            />

            {/* Video Title & Meta */}
            <div className="mt-4 space-y-1">
              <h2 className="text-2xl font-bold">{open.title}</h2>
              {open.date && (
                <p className="flex items-center gap-2 text-base text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {formatFriendlyDate(open.date, language)}
                </p>
              )}
              {open.note && (
                <p className="mt-2 text-lg text-foreground/90">{open.note}</p>
              )}
            </div>

            {/* ALWAYS-VISIBLE ASK AREA BELOW VIDEO */}
            <section className="mt-6 rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-bold">{t("Ask about this memory")}</h3>

                {/* Segmented Scope Toggle */}
                <div className="flex rounded-xl border-2 border-border bg-muted/40 p-1">
                  <button
                    type="button"
                    onClick={() => setPlayerScope("memory")}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                      playerScope === "memory"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("This memory")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlayerScope("all")}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                      playerScope === "all"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("All my memories")}
                  </button>
                </div>
              </div>

              {/* Input + Dictation + Ask */}
              <div className="mt-4 flex flex-wrap gap-3">
                <input
                  value={playerQuery}
                  onChange={(e) => setPlayerQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void askPlayer();
                  }}
                  placeholder={
                    playerScope === "memory"
                      ? t("Ask about this memory...")
                      : t("Ask about your memories...")
                  }
                  className="min-h-12 flex-1 rounded-xl border-2 border-border bg-background px-4 text-base outline-none focus:border-primary"
                />
                <DictationButton
                  value={playerQuery}
                  onText={setPlayerQuery}
                  alwaysVisible
                />
                <button
                  type="button"
                  onClick={() => void askPlayer()}
                  disabled={playerAsking}
                  className="min-h-12 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
                >
                  {playerAsking ? (
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 inline h-4 w-4" />
                  )}
                  {t("Ask")}
                </button>
              </div>

              {/* 4 Suggestion Chips */}
              <div className="mt-3 flex flex-wrap gap-2">
                {playerChips.map((chip) => (
                  <button
                    type="button"
                    key={chip}
                    onClick={() => void askPlayer(chip)}
                    className="min-h-9 rounded-full border-2 border-border bg-muted/40 px-3.5 py-1 text-xs font-semibold transition hover:border-primary hover:bg-background"
                  >
                    {t(chip)}
                  </button>
                ))}
              </div>

              {/* Player Answer Card */}
              {playerAnswer && (
                <AnswerCard
                  answer={playerAnswer}
                  onSource={handleSourceClick}
                  onClear={() => setPlayerAnswer(null)}
                />
              )}

              {/* Last 3 answers history */}
              {playerHistory.length > 0 && (
                <div className="mt-5 border-t border-border pt-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("Recent in this video")}
                  </p>
                  <div className="mt-2 space-y-1.5">
                    {playerHistory.map((item, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => void askPlayer(item.q)}
                        className="block w-full rounded-lg border border-border/50 bg-background/50 p-2.5 text-left transition hover:border-primary text-sm"
                      >
                        <p className="font-semibold text-foreground">"{item.q}"</p>
                        <p className="line-clamp-1 text-muted-foreground">{item.a}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
