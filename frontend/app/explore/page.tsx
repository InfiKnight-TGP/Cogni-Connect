"use client";

import Nav from "@/components/nav";
import ReadAloud from "@/components/interaction/ReadAloud";
import DictationButton from "@/components/interaction/DictationButton";
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
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { formatFriendlyDate, groupMemoriesByDate } from "@/lib/date-format";
import { dayKey } from "@/lib/progress";
import {
  canManageMemories,
  validateVideoFile,
  validateMemoryDate,
  validateMemoryNote,
  shouldPoll,
  getNextPollDelay,
  getFriendlyErrorMessage,
  MAX_VIDEO_SECONDS,
} from "@/lib/video-upload";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const { session } = useAuth();
  const canManage = canManageMemories(session);
  const isDemo = process.env.NEXT_PUBLIC_DEMO === "1" || Boolean(session?.user?.email?.includes("demo"));

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

  // Filters
  const [filterPerson, setFilterPerson] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("all");

  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDate, setUploadDate] = useState(() => dayKey(new Date()));
  const [uploadNote, setUploadNote] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit modal state
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete modal state
  const [memoryToDelete, setMemoryToDelete] = useState<Memory | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Retry state
  const [retryLoadingId, setRetryLoadingId] = useState<string | null>(null);
  const [globalNotice, setGlobalNotice] = useState("");

  // Polling state
  const pollStartTimesRef = useRef<Record<string, number>>({});
  const pollDelayRef = useRef(2500);
  const pollTimeoutIdRef = useRef<number | null>(null);

  const getMaxDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return dayKey(d);
  };

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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (memoryToDelete && !deleteLoading) {
          setMemoryToDelete(null);
        } else if (editingMemory && !editLoading) {
          setEditingMemory(null);
        } else if (uploadModalOpen && !uploading) {
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
  }, [open, close, memoryToDelete, deleteLoading, editingMemory, editLoading, uploadModalOpen, uploading]);

  // Video duration validation and file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(null);
    setUploadError("");

    const val = validateVideoFile(file, isDemo);
    if (!val.valid) {
      setUploadError(val.error ?? "Invalid video file.");
      return;
    }

    const url = URL.createObjectURL(file);
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (tempVideo.duration > MAX_VIDEO_SECONDS) {
        setUploadError("Video must be 3 minutes or less.");
        setUploadFile(null);
      } else {
        setUploadFile(file);
      }
    };
    tempVideo.onerror = () => {
      URL.revokeObjectURL(url);
      setUploadFile(file);
    };
    tempVideo.src = url;
  };

  // Upload handler via XMLHttpRequest for accurate progress
  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError("Please select a video file.");
      return;
    }
    const dateVal = validateMemoryDate(uploadDate);
    if (!dateVal.valid) {
      setUploadError(dateVal.error ?? "Invalid date.");
      return;
    }
    const noteVal = validateMemoryNote(uploadNote);
    if (!noteVal.valid) {
      setUploadError(noteVal.error ?? "Note is too long.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadError("");

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("date", dateVal.cleaned ?? uploadDate);
    formData.append("note", noteVal.cleaned);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/memories`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        setUploadProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          const mem = data.memory;
          if (mem) {
            const newMem: Memory = {
              id: mem.id,
              title: mem.title || uploadFile.name.replace(/\.[^/.]+$/, ""),
              date: mem.date || uploadDate,
              dateLabel: mem.dateLabel || "",
              note: mem.note || uploadNote,
              thumbnailUrl: mem.thumbnailUrl || `/memories/${mem.id}/thumbnail`,
              status: "processing",
            };
            setMemories((prev) => [newMem, ...prev.filter((m) => m.id !== mem.id)]);
            pollStartTimesRef.current[mem.id] = Date.now();
            pollDelayRef.current = 2500;
          }
        } catch {
          void load();
        }
        setUploadModalOpen(false);
        setUploadFile(null);
        setUploadNote("");
        setUploadDate(dayKey(new Date()));
      } else {
        let msg = "";
        try {
          const data = JSON.parse(xhr.responseText);
          msg = data.error || data.message;
        } catch {}
        setUploadError(msg || getFriendlyErrorMessage(xhr.status));
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setUploadError("Could not upload video. Please check your connection and try again.");
    };

    xhr.send(formData);
  };

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

  // Edit memory (PATCH /memories/<id>)
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMemory) return;

    const dateVal = validateMemoryDate(editDate);
    if (!dateVal.valid) {
      setEditError(dateVal.error ?? "Invalid date.");
      return;
    }
    const noteVal = validateMemoryNote(editNote);
    if (!noteVal.valid) {
      setEditError(noteVal.error ?? "Note is too long.");
      return;
    }

    setEditLoading(true);
    setEditError("");
    try {
      const res = await apiFetch(`${API_URL}/memories/${encodeURIComponent(editingMemory.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateVal.cleaned, note: noteVal.cleaned }),
      });
      if (!res.ok) {
        let errText = "";
        try {
          const d = await res.json();
          errText = d.error || d.message;
        } catch {}
        setEditError(errText || getFriendlyErrorMessage(res.status, "Could not update memory."));
        return;
      }
      const data = await res.json();
      const updatedMem = data.memory;
      setMemories((prev) =>
        prev.map((m) =>
          m.id === editingMemory.id
            ? {
                ...m,
                date: updatedMem?.date ?? dateVal.cleaned,
                note: updatedMem?.note ?? noteVal.cleaned,
                dateLabel: updatedMem?.dateLabel ?? m.dateLabel,
              }
            : m
        )
      );
      if (open?.id === editingMemory.id) {
        setOpen((prev) =>
          prev
            ? {
                ...prev,
                date: updatedMem?.date ?? dateVal.cleaned,
                note: updatedMem?.note ?? noteVal.cleaned,
                dateLabel: updatedMem?.dateLabel ?? prev.dateLabel,
              }
            : null
        );
      }
      setEditingMemory(null);
    } catch {
      setEditError("Could not update memory. Please try again.");
    } finally {
      setEditLoading(false);
    }
  };

  // Delete memory (DELETE /memories/<id>)
  const handleDelete = async () => {
    if (!memoryToDelete) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await apiFetch(`${API_URL}/memories/${encodeURIComponent(memoryToDelete.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        let errText = "";
        try {
          const d = await res.json();
          errText = d.error || d.message;
        } catch {}
        setDeleteError(errText || getFriendlyErrorMessage(res.status, "Could not delete memory."));
        return;
      }
      setMemories((prev) => prev.filter((m) => m.id !== memoryToDelete.id));
      if (open?.id === memoryToDelete.id) {
        close();
      }
      setMemoryToDelete(null);
    } catch {
      setDeleteError("Could not delete memory. Please check your connection and try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

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
              onClick={() => {
                setUploadFile(null);
                setUploadError("");
                setUploadNote("");
                setUploadDate(dayKey(new Date()));
                setUploadModalOpen(true);
              }}
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
                onClick={() => {
                  setUploadFile(null);
                  setUploadError("");
                  setUploadNote("");
                  setUploadDate(dayKey(new Date()));
                  setUploadModalOpen(true);
                }}
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
                        className="group flex flex-col justify-between overflow-hidden rounded-2xl border-2 border-border bg-card shadow-sm transition hover:border-primary hover:shadow-md"
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
                                onClick={() => handleRetry(memory.id)}
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
                                onClick={() => setMemoryToDelete(memory)}
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
                      onClick={() => {
                        setEditingMemory(open);
                        setEditDate(open.date || dayKey(new Date()));
                        setEditNote(open.note || "");
                        setEditError("");
                      }}
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

      {/* Upload Modal Dialog */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upload-dialog-title"
        >
          <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border-2 border-border bg-background p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 id="upload-dialog-title" className="text-2xl font-bold">
                {t("Add a video")}
              </h2>
              <button
                type="button"
                disabled={uploading}
                onClick={() => {
                  setUploadModalOpen(false);
                  setUploadError("");
                }}
                className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border-2 border-border hover:border-primary disabled:opacity-50"
                aria-label={t("Cancel")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="mt-5 space-y-4">
              {uploadError && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                  {t(uploadError)}
                </div>
              )}

              {/* Video File Picker */}
              <div>
                <label className="block text-sm font-semibold text-muted-foreground mb-1">
                  {t("Upload video")}
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex min-h-24 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/20 p-4 transition hover:border-primary hover:bg-muted/40"
                >
                  <Upload className="h-7 w-7 text-primary mb-1" />
                  <span className="text-base font-semibold">
                    {uploadFile ? uploadFile.name : t("Add a video")}
                  </span>
                  <span className="text-xs text-muted-foreground mt-0.5">
                    {uploadFile
                      ? `${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB`
                      : isDemo
                      ? t("Up to 20 MB, up to 3 minutes")
                      : t("Up to 200 MB, up to 3 minutes")}
                  </span>
                </button>
              </div>

              {/* Date */}
              <div>
                <label htmlFor="upload-memory-date" className="block text-sm font-semibold text-muted-foreground mb-1">
                  {t("Date")}
                </label>
                <input
                  id="upload-memory-date"
                  type="date"
                  value={uploadDate}
                  max={getMaxDateStr()}
                  onChange={(e) => setUploadDate(e.target.value)}
                  disabled={uploading}
                  className="min-h-12 w-full rounded-xl border-2 border-border bg-background px-3 text-base outline-none focus:border-primary"
                  required
                />
              </div>

              {/* Note ("What happened?") */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="upload-memory-note" className="text-sm font-semibold text-muted-foreground">
                    {t("What happened?")}
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {uploadNote.length}/300
                  </span>
                </div>
                <textarea
                  id="upload-memory-note"
                  rows={3}
                  maxLength={300}
                  value={uploadNote}
                  onChange={(e) => setUploadNote(e.target.value)}
                  disabled={uploading}
                  placeholder={t("What happened?")}
                  className="w-full rounded-xl border-2 border-border bg-background p-3 text-base outline-none focus:border-primary"
                />
                <div className="mt-1 flex justify-end">
                  <DictationButton value={uploadNote} onText={setUploadNote} />
                </div>
              </div>

              {/* Privacy Disclosure */}
              <p className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                {t("Your video is processed to make your questions. Speech and frames may be sent to the services listed in the Privacy page.")}{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold underline text-foreground">
                  {t("Privacy page")}
                </a>
              </p>

              {/* Processing note */}
              <p className="text-xs italic text-muted-foreground">
                {t("This can take a few minutes")}
              </p>

              {/* Upload progress */}
              {uploading && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>{t("Uploading…")}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div
                    className="h-3 w-full overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={uploadProgress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="h-full bg-primary transition-all duration-150"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setUploadModalOpen(false)}
                  className="min-h-12 rounded-xl border-2 border-border px-5 text-base font-semibold hover:border-primary disabled:opacity-50"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("Upload video")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal Dialog */}
      {editingMemory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-dialog-title"
        >
          <div className="relative w-full max-w-lg rounded-3xl border-2 border-border bg-background p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <h2 id="edit-dialog-title" className="text-2xl font-bold">
                {t("Edit memory")}
              </h2>
              <button
                type="button"
                disabled={editLoading}
                onClick={() => setEditingMemory(null)}
                className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border-2 border-border hover:border-primary disabled:opacity-50"
                aria-label={t("Cancel")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-5 space-y-4">
              {editError && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                  {t(editError)}
                </div>
              )}

              <div>
                <label htmlFor="edit-memory-date" className="block text-sm font-semibold text-muted-foreground mb-1">
                  {t("Date")}
                </label>
                <input
                  id="edit-memory-date"
                  type="date"
                  value={editDate}
                  max={getMaxDateStr()}
                  onChange={(e) => setEditDate(e.target.value)}
                  disabled={editLoading}
                  className="min-h-12 w-full rounded-xl border-2 border-border bg-background px-3 text-base outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="edit-memory-note" className="text-sm font-semibold text-muted-foreground">
                    {t("What happened?")}
                  </label>
                  <span className="text-xs text-muted-foreground">
                    {editNote.length}/300
                  </span>
                </div>
                <textarea
                  id="edit-memory-note"
                  rows={3}
                  maxLength={300}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  disabled={editLoading}
                  placeholder={t("What happened?")}
                  className="w-full rounded-xl border-2 border-border bg-background p-3 text-base outline-none focus:border-primary"
                />
                <div className="mt-1 flex justify-end">
                  <DictationButton value={editNote} onText={setEditNote} />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  disabled={editLoading}
                  onClick={() => setEditingMemory(null)}
                  className="min-h-12 rounded-xl border-2 border-border px-5 text-base font-semibold hover:border-primary disabled:opacity-50"
                >
                  {t("Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
                >
                  {editLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("Save changes")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {memoryToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="relative w-full max-w-md rounded-3xl border-2 border-border bg-background p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-destructive/10 p-3 text-destructive">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h2 id="delete-dialog-title" className="text-xl font-bold">
                  {t("Delete this memory?")}
                </h2>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-base text-muted-foreground">
                {t("Are you sure you want to delete this memory? This cannot be undone.")}
              </p>
              <p className="rounded-xl border border-border bg-muted/40 p-3 font-semibold text-foreground">
                "{memoryToDelete.title}"
              </p>
            </div>

            {deleteError && (
              <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                {t(deleteError)}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={deleteLoading}
                onClick={() => {
                  setMemoryToDelete(null);
                  setDeleteError("");
                }}
                className="min-h-12 rounded-xl border-2 border-border px-5 text-base font-semibold hover:border-primary disabled:opacity-50"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleDelete}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-destructive px-6 text-base font-semibold text-destructive-foreground shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                {deleteLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("Delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
