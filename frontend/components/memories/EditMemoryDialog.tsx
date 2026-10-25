"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import DictationButton from "@/components/interaction/DictationButton";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { API_URL, apiFetch } from "@/lib/api";
import { dayKey } from "@/lib/progress";
import {
  validateMemoryDate,
  validateMemoryNote,
  getFriendlyErrorMessage,
} from "@/lib/video-upload";

interface EditMemoryDialogProps {
  memory: {
    id: string;
    date?: string;
    note?: string;
  } | null;
  onClose: () => void;
  onSuccess: (updated: {
    id: string;
    date?: string;
    note?: string;
    dateLabel?: string;
  }) => void;
}

export default function EditMemoryDialog({
  memory,
  onClose,
  onSuccess,
}: EditMemoryDialogProps) {
  const { t } = useTranslate();
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const getMaxDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return dayKey(d);
  };

  useEffect(() => {
    if (memory) {
      setEditDate(memory.date || dayKey(new Date()));
      setEditNote(memory.note || "");
      setEditError("");
    }
  }, [memory]);

  if (!memory) return null;

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const res = await apiFetch(`${API_URL}/memories/${encodeURIComponent(memory.id)}`, {
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
      onSuccess({
        id: memory.id,
        date: updatedMem?.date ?? dateVal.cleaned,
        note: updatedMem?.note ?? noteVal.cleaned,
        dateLabel: updatedMem?.dateLabel,
      });
      onClose();
    } catch {
      setEditError("Could not update memory. Please try again.");
    } finally {
      setEditLoading(false);
    }
  };

  return (
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
            onClick={onClose}
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
              {t("When did this happen?")}
            </label>
            <p className="text-xs text-muted-foreground mb-1.5">
              {t("The date shown on your memory.")}
            </p>
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
              onClick={onClose}
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
  );
}
