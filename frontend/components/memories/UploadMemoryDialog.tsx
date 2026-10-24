"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, X, Loader2 } from "lucide-react";
import DictationButton from "@/components/interaction/DictationButton";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { API_URL, apiFetch } from "@/lib/api";
import { dayKey } from "@/lib/progress";
import {
  validateVideoFile,
  validateMemoryDate,
  validateMemoryNote,
  getFriendlyErrorMessage,
  MAX_UPLOAD_MB_REGULAR,
  MAX_VIDEO_SECONDS,
} from "@/lib/video-upload";

export type UploadedMemory = {
  id: string;
  title: string;
  date?: string;
  dateLabel?: string;
  note?: string;
  thumbnailUrl: string;
  status: "ready" | "processing" | "failed";
  message?: string;
};

interface UploadMemoryDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (memory: UploadedMemory) => void;
}

export default function UploadMemoryDialog({
  open,
  onClose,
  onSuccess,
}: UploadMemoryDialogProps) {
  const { t } = useTranslate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [limits, setLimits] = useState<{
    maxUploadMb: number;
    maxVideoSeconds: number;
    demo: boolean;
  }>({
    maxUploadMb: MAX_UPLOAD_MB_REGULAR,
    maxVideoSeconds: MAX_VIDEO_SECONDS,
    demo: false,
  });

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDate, setUploadDate] = useState(() => dayKey(new Date()));
  const [uploadNote, setUploadNote] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const getMaxDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return dayKey(d);
  };

  // Fetch limits from server, fallback to defaults
  useEffect(() => {
    if (!open) return;
    let active = true;
    apiFetch(`${API_URL}/memories/limits`, { authRedirect: false })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (active && data) {
          setLimits({
            maxUploadMb: typeof data.maxUploadMb === "number" ? data.maxUploadMb : MAX_UPLOAD_MB_REGULAR,
            maxVideoSeconds: typeof data.maxVideoSeconds === "number" ? data.maxVideoSeconds : MAX_VIDEO_SECONDS,
            demo: Boolean(data.demo),
          });
        }
      })
      .catch(() => {
        // Fall back to current defaults
      });
    return () => {
      active = false;
    };
  }, [open]);

  // Video duration validation and file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(null);
    setUploadError("");

    const val = validateVideoFile(file, limits.demo);
    if (!val.valid) {
      setUploadError(val.error ?? "Invalid video file.");
      return;
    }

    // Try reading duration; if browser cannot read it, allow the upload and rely on server check
    try {
      const url = URL.createObjectURL(file);
      const tempVideo = document.createElement("video");
      tempVideo.preload = "metadata";
      tempVideo.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (tempVideo.duration && !isNaN(tempVideo.duration) && tempVideo.duration > limits.maxVideoSeconds) {
          setUploadError(`Video must be ${Math.round(limits.maxVideoSeconds / 60)} minutes or less.`);
          setUploadFile(null);
        } else {
          setUploadFile(file);
        }
      };
      tempVideo.onerror = () => {
        URL.revokeObjectURL(url);
        // Allow upload if browser decoders fail
        setUploadFile(file);
      };
      tempVideo.src = url;
    } catch {
      setUploadFile(file);
    }
  };

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
            const newMem: UploadedMemory = {
              id: mem.id,
              title: mem.title || uploadFile.name.replace(/\.[^/.]+$/, ""),
              date: mem.date || uploadDate,
              dateLabel: mem.dateLabel || "",
              note: mem.note || uploadNote,
              thumbnailUrl: mem.thumbnailUrl || `/memories/${mem.id}/thumbnail`,
              status: "processing",
            };
            onSuccess(newMem);
          }
        } catch {
          // If parse fails, close modal and let parent refresh
          onClose();
        }
        setUploadFile(null);
        setUploadNote("");
        setUploadDate(dayKey(new Date()));
        onClose();
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

  if (!open) return null;

  return (
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
              onClose();
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
                  : limits.demo
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
              onClick={onClose}
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
  );
}
