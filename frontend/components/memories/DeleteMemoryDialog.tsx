"use client";

import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { API_URL, apiFetch } from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/video-upload";

interface DeleteMemoryDialogProps {
  memory: {
    id: string;
    title: string;
  } | null;
  onClose: () => void;
  onSuccess: (id: string) => void;
}

export default function DeleteMemoryDialog({
  memory,
  onClose,
  onSuccess,
}: DeleteMemoryDialogProps) {
  const { t } = useTranslate();
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  if (!memory) return null;

  const handleDelete = async () => {
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const res = await apiFetch(`${API_URL}/memories/${encodeURIComponent(memory.id)}`, {
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
      onSuccess(memory.id);
      onClose();
    } catch {
      setDeleteError("Could not delete memory. Please check your connection and try again.");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
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
            "{memory.title}"
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
              onClose();
              setDeleteError("");
            }}
            className="min-h-12 rounded-xl border-2 border-border px-5 text-base font-semibold hover:border-primary disabled:opacity-50"
          >
            {t("Cancel")}
          </button>
          <button
            type="submit"
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
  );
}
