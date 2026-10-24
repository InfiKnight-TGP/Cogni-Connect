"use client";

import Nav from "@/components/nav";
import ReadAloud from "@/components/interaction/ReadAloud";
import { usePreferences, useTranslate } from "@/components/interaction/InteractionProvider";
import { useAuth } from "@/lib/auth-context";
import { API_URL, apiFetch } from "@/lib/api";
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { formatFriendlyDate, groupMemoriesByDate } from "@/lib/date-format";
import { canManageMemories, getFriendlyErrorMessage, shouldPoll, getNextPollDelay } from "@/lib/video-upload";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import UploadMemoryDialog, { UploadedMemory } from "@/components/memories/UploadMemoryDialog";
import EditMemoryDialog from "@/components/memories/EditMemoryDialog";
import DeleteMemoryDialog from "@/components/memories/DeleteMemoryDialog";
import MemoryAskPanel from "@/components/memories/MemoryAskPanel";

type Memory = {
  id: string;
  title: string;
  date?: string;
  dateLabel?: string;
  note?: string;
  thumbnailUrl: string;
  people?: string[];
  transcript?: string[];
  status: "ready" | "processing" | "failed";
  message?: string;
};

export default function ExplorePage() {
  const { t, language } = useTranslate();
  const { preferences } = usePreferences();
  const { session } = useAuth();
  const canManage = canManageMemories(session);

  const [memories, setMemories] = useState<Memory[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Player modal state
  const [open, setOpen] = useState<Memory | null>(null);
  const [openIndex, setOpenIndex] = useState(0);
  const [playerScope, setPlayerScope] = useState<"memory" | "all">("memory");

  // Filters
  const [filterPerson, setFilterPerson] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("all");

  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  // Dialog states
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [memoryToDelete, setMemoryToDelete] = useState<Memory | null>(null);

  // Retry state
  const [retryLoadingId, setRetryLoadingId] = useState<string | null>(null);
  const [globalNotice, setGlobalNotice] = useState("");

  // Polling state
  const pollStartTimesRef = useRef<Record<string, number>>({});
  const pollDelayRef = useRef(2500);
  const pollTimeoutIdRef = useRef<number | null>(null);

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

  // Polling for processing status with exponential backoff, visibility pause, and 30m timeout
  useEffect(() => {
    const processing = memories.filter((m) => m.status === "processing");
    if (!processing.length) {
      pollDelayRef.current = 2500;
      return;
    }

    const now = Date.now();
    for (const m of processing) {
      if (!pollStartTimesRef.current[m.id]) {
        pollStartTimesRef.current[m.id] = now;
      }
    }

    let active = true;

    const tick = async () => {
      if (!active) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        pollTimeoutIdRef.current = window.setTimeout(tick, pollDelayRef.current);
        return;
      }

      const currentProcessing = memories.filter((m) => m.status === "processing");
      if (!currentProcessing.length) return;

      const currentTime = Date.now();
      const toPoll: Memory[] = [];

      for (const m of currentProcessing) {
        const startTime = pollStartTimesRef.current[m.id] || currentTime;
        const elapsed = (currentTime - startTime) / 1000;
        if (!shouldPoll(m.status, true, elapsed)) {
          setMemories((prev) =>
            prev.map((item) =>
              item.id === m.id
                ? {
                    ...item,
                    message: "This is taking longer than usual. You can check back later.",
                  }
                : item
            )
          );
        } else {
          toPoll.push(m);
        }
      }

      if (!toPoll.length) return;

      try {
        const results = await Promise.all(
          toPoll.map(async (m) => {
            try {
              const res = await apiFetch(`${API_URL}/memories/${encodeURIComponent(m.id)}`, {
                authRedirect: false,
              });
              if (!res.ok) return null;
              return await res.json();
            } catch {
              return null;
            }
          })
        );

        if (active) {
          setMemories((current) =>
            current.map((mem) => {
              const data = results.find((r) => r?.id === mem.id);
              if (!data) return mem;
              const newStatus =
                data.status === "ready" || data.status === "completed"
                  ? "ready"
                  : data.status === "failed"
                  ? "failed"
                  : "processing";
              return {
                ...mem,
                status: newStatus,
                title: data.title || mem.title,
                date: data.date ?? mem.date,
                dateLabel: data.dateLabel ?? mem.dateLabel,
                note: data.note ?? mem.note,
                thumbnailUrl: data.thumbnailUrl || mem.thumbnailUrl,
                message: data.message,
              };
            })
          );
        }
      } catch {}

      if (active) {
        pollDelayRef.current = getNextPollDelay(pollDelayRef.current);
        pollTimeoutIdRef.current = window.setTimeout(tick, pollDelayRef.current);
      }
    };

    pollTimeoutIdRef.current = window.setTimeout(tick, pollDelayRef.current);

    return () => {
      active = false;
      if (pollTimeoutIdRef.current) {
        window.clearTimeout(pollTimeoutIdRef.current);
      }
    };
  }, [memories]);

  const openMemoryModal = useCallback((memory: Memory) => {
    const idx = memories.findIndex((item) => item.id === memory.id);
    setOpen(memory);
    setOpenIndex(idx >= 0 ? idx : 0);
    setPlayerScope("memory");
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (memoryToDelete) {
          setMemoryToDelete(null);
        } else if (editingMemory) {
          setEditingMemory(null);
        } else if (uploadModalOpen) {
          setUploadModalOpen(false);
        } else if (open) {
          close();
        }
      }
    };
    const onPop = () => setOpen(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [open, close, memoryToDelete, editingMemory, uploadModalOpen]);

  // Retry processing failed memory
  const handleRetry = async (memoryId: string) => {
    setRetryLoadingId(memoryId);
    setGlobalNotice("");
    try {
      const res = await apiFetch(`${API_URL}/memories/${encodeURIComponent(memoryId)}/retry`, {
        method: "POST",
      });
      if (res.status === 409) {
        setGlobalNotice(t("A video is already being processed"));
        return;
      }
      if (!res.ok) {
        let errText = "";
        try {
          const d = await res.json();
          errText = d.error || d.message;
        } catch {}
        setGlobalNotice(errText || getFriendlyErrorMessage(res.status));
        return;
      }
      pollStartTimesRef.current[memoryId] = Date.now();
      pollDelayRef.current = 2500;
      setMemories((prev) =>
        prev.map((m) => (m.id === memoryId ? { ...m, status: "processing", message: "" } : m))
      );
    } catch {
      setGlobalNotice("Could not retry video processing. Please try again.");
    } finally {
      setRetryLoadingId(null);
    }
  };

  const handleUploadSuccess = (newMem: UploadedMemory) => {
    setMemories((prev) => [newMem, ...prev.filter((m) => m.id !== newMem.id)]);
    pollStartTimesRef.current[newMem.id] = Date.now();
    pollDelayRef.current = 2500;
  };

  const handleEditSuccess = (updated: {
    id: string;
    date?: string;
    note?: string;
    dateLabel?: string;
  }) => {
    setMemories((prev) =>
      prev.map((m) =>
        m.id === updated.id
          ? {
              ...m,
              date: updated.date ?? m.date,
              note: updated.note ?? m.note,
              dateLabel: updated.dateLabel ?? m.dateLabel,
            }
          : m
      )
    );
    if (open?.id === updated.id) {
      setOpen((prev) =>
        prev
          ? {
              ...prev,
              date: updated.date ?? prev.date,
              note: updated.note ?? prev.note,
              dateLabel: updated.dateLabel ?? prev.dateLabel,
            }
          : null
      );
    }
  };

  const handleDeleteSuccess = (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
    if (open?.id === id) {
      close();
    }
  };

  const handleSourceClick = (id: string) => {
    const target = memories.find((item) => item.id === id);
    if (target) {
      openMemoryModal(target);
    }
  };

  const allPeople = useMemo(() => {
    const set = new Set<string>();
    for (const m of memories) {
      if (Array.isArray(m.people)) {
        for (const p of m.people) {
          if (p) set.add(p);
        }
      }
    }
    return Array.from(set).sort();
  }, [memories]);

  const filteredMemories = useMemo(() => {
    return memories.filter((memory) => {
      if (filterPerson !== "all") {
        if (!memory.people || !memory.people.includes(filterPerson)) {
          return false;
        }
      }
      if (filterDate !== "all") {
        if (!memory.date) return filterDate === "earlier";
        const parts = String(memory.date).slice(0, 10).split("-").map(Number);
        if (parts.length !== 3 || parts.some(isNaN)) return filterDate === "earlier";
        const targetDate = new Date(parts[0], parts[1] - 1, parts[2]);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffDays = Math.round((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
        if (filterDate === "today" && diffDays !== 0) return false;
        if (filterDate === "this_week" && (diffDays <= 0 || diffDays > 7)) return false;
        if (filterDate === "earlier" && diffDays <= 7) return false;
      }
      return true;
    });
  }, [memories, filterPerson, filterDate]);

  const grouped = useMemo(() => {
    return groupMemoriesByDate(filteredMemories, language);
  }, [filteredMemories, language]);

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
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("My Memories")}
            </p>
            <h1 className="mt-2 text-4xl font-bold">{t("My Memories")}</h1>
            <ReadAloud text={t("My Memories")} autoRead={false} />
            <p className="mt-3 text-xl text-muted-foreground">
              {t("Look back at moments that matter.")}
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setUploadModalOpen(true)}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-base font-semibold shadow-sm transition hover:border-primary"
            >
              <Upload className="h-5 w-5" />
              {t("Add a video")}
            </button>
          )}
        </header>

        {globalNotice && (
          <section
            className="mb-8 flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-base"
            role="alert"
          >
            <p>{t(globalNotice)}</p>
            <button
              type="button"
              onClick={() => setGlobalNotice("")}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              {t("Clear")}
            </button>
          </section>
        )}

        {error && (
          <section
            className="mb-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-lg"
            role="alert"
          >
            <p>{t(error)}</p>
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
        <div className="mb-10">
          <MemoryAskPanel
            scope="all"
            title="Ask about your memories"
            subtitle="Ask anything about your saved moments."
            chips={galleryChips}
            onSelectMemory={handleSourceClick}
            maxHistory={5}
          />
        </div>

        {/* Filter bar by date and person */}
        {memories.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center gap-4 rounded-2xl border-2 border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <label htmlFor="filter-person" className="text-sm font-semibold text-muted-foreground">
                {t("Filter by person")}:
              </label>
              <select
                id="filter-person"
                value={filterPerson}
                onChange={(e) => setFilterPerson(e.target.value)}
                className="h-10 rounded-xl border-2 border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary"
              >
                <option value="all">{t("All people")}</option>
                {allPeople.map((person) => (
                  <option key={person} value={person}>
                    {person}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="filter-date" className="text-sm font-semibold text-muted-foreground">
                {t("Filter by date")}:
              </label>
              <select
                id="filter-date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="h-10 rounded-xl border-2 border-border bg-background px-3 text-sm font-medium outline-none focus:border-primary"
              >
                <option value="all">{t("All dates")}</option>
                <option value="today">{t("Today")}</option>
                <option value="this_week">{t("This week")}</option>
                <option value="earlier">{t("Earlier")}</option>
              </select>
            </div>

            {(filterPerson !== "all" || filterDate !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setFilterPerson("all");
                  setFilterDate("all");
                }}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                {t("Clear")}
              </button>
            )}
          </div>
        )}

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
            {canManage && (
              <button
                type="button"
                onClick={() => setUploadModalOpen(true)}
                className="mt-5 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
              >
                <Upload className="h-5 w-5" />
                {t("Add your first video")}
              </button>
            )}
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
                    const isReady = memory.status === "ready";
                    const isFailed = memory.status === "failed";
                    const isProcessing = memory.status === "processing";

                    return (
                      <div
                        key={memory.id}
                        ref={(element) => {
                          cardRefs.current[memory.id] = element;
                        }}
                        tabIndex={isReady ? 0 : undefined}
                        role={isReady ? "button" : undefined}
                        aria-label={isReady ? memory.title : undefined}
                        onKeyDown={(e) => {
                          if (isReady && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            openMemoryModal(memory);
                          }
                        }}
                        className="group flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-border bg-card shadow-sm transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <div
                          onClick={() => isReady && openMemoryModal(memory)}
                          className={`relative aspect-video bg-muted overflow-hidden ${
                            isReady ? "cursor-pointer" : "cursor-default"
                          }`}
                        >
                          <img
                            src={`${API_URL}${memory.thumbnailUrl}`}
                            alt=""
                            className={`h-full w-full object-cover transition duration-300 ${
                              isReady ? "group-hover:scale-105" : "opacity-40"
                            }`}
                          />
                          {isReady && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-90 transition group-hover:opacity-100">
                              <span className="rounded-full bg-primary p-4 text-primary-foreground shadow-lg transition transform group-hover:scale-110">
                                <Play className="h-7 w-7 fill-current" />
                              </span>
                            </span>
                          )}
                          {isProcessing && (
                            <span className="absolute inset-0 flex flex-col items-center justify-center bg-background/85 p-4 text-center">
                              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                              <span className="text-lg font-semibold">{t("Processing…")}</span>
                              {memory.message && (
                                <span className="mt-1 text-sm text-muted-foreground">{t(memory.message)}</span>
                              )}
                            </span>
                          )}
                          {isFailed && (
                            <span className="absolute inset-0 flex flex-col items-center justify-center bg-background/90 p-4 text-center">
                              <AlertCircle className="h-8 w-8 text-destructive mb-2" />
                              <span className="text-base font-semibold text-destructive">
                                {t(memory.message || "Couldn't process this video")}
                              </span>
                            </span>
                          )}
                        </div>

                        <div className="flex flex-1 flex-col justify-between p-5 space-y-3">
                          <div className="space-y-2">
                            <h3
                              onClick={() => isReady && openMemoryModal(memory)}
                              className={`text-xl font-bold leading-snug ${
                                isReady ? "cursor-pointer hover:text-primary" : ""
                              }`}
                            >
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
                            {memory.people && memory.people.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {memory.people.map((person) => (
                                  <span
                                    key={person}
                                    className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
                                  >
                                    {person}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Actions for failed card */}
                          {isFailed && canManage && (
                            <div className="flex items-center gap-2 pt-2 border-t border-border">
                              <button
                                type="button"
                                disabled={retryLoadingId === memory.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleRetry(memory.id);
                                }}
                                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-border bg-background px-3 text-sm font-semibold hover:border-primary disabled:opacity-50"
                              >
                                {retryLoadingId === memory.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                                {t("Retry")}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMemoryToDelete(memory);
                                }}
                                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-destructive/40 bg-destructive/10 px-3 text-sm font-semibold text-destructive hover:border-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                                {t("Remove")}
                              </button>
                            </div>
                          )}

                          {isReady && (
                            <div className="pt-1">
                              <ReadAloud
                                text={`${memory.title}. ${memory.note ?? ""}`}
                                autoRead={false}
                              />
                            </div>
                          )}
                        </div>
                      </div>
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
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="inline-flex min-h-12 items-center rounded-xl border-2 border-border bg-card px-4 text-base font-semibold transition hover:border-primary"
                >
                  <X className="mr-2 h-5 w-5" />
                  {t("Close")}
                </button>

                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditingMemory(open)}
                      className="inline-flex min-h-12 items-center rounded-xl border-2 border-border bg-card px-4 text-base font-semibold transition hover:border-primary"
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {t("Edit memory")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemoryToDelete(open)}
                      className="inline-flex min-h-12 items-center rounded-xl border-2 border-destructive/40 bg-destructive/10 px-4 text-base font-semibold text-destructive transition hover:border-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t("Delete memory")}
                    </button>
                  </>
                )}
              </div>

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

            {/* Video Player - No sound autoplay */}
            <video
              controls
              playsInline
              autoPlay={false}
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
              {open.people && open.people.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-muted-foreground">
                    {t("In this video:")}
                  </span>
                  {open.people.map((person) => (
                    <span
                      key={person}
                      className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium"
                    >
                      {person}
                    </span>
                  ))}
                </div>
              )}
              {open.transcript && open.transcript.length > 0 && (
                <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      {t("Transcript")}
                    </h4>
                    <ReadAloud
                      text={open.transcript.join(" ")}
                      autoRead={false}
                    />
                  </div>
                  <p className="max-h-36 overflow-y-auto text-base leading-relaxed text-foreground/90">
                    {open.transcript.join(" ")}
                  </p>
                </div>
              )}
            </div>

            {/* Ask Area below video in Player */}
            <div className="mt-6">
              <MemoryAskPanel
                scope={playerScope}
                memoryId={open.id}
                allowScopeToggle
                onScopeChange={setPlayerScope}
                title="Ask about this memory"
                chips={playerChips}
                onSelectMemory={handleSourceClick}
                maxHistory={3}
              />
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal Dialog */}
      <UploadMemoryDialog
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />

      {/* Edit Modal Dialog */}
      <EditMemoryDialog
        memory={editingMemory}
        onClose={() => setEditingMemory(null)}
        onSuccess={handleEditSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteMemoryDialog
        memory={memoryToDelete}
        onClose={() => setMemoryToDelete(null)}
        onSuccess={handleDeleteSuccess}
      />
    </>
  );
}
