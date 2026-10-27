"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Edit2, ExternalLink, MapPin, Plus, Trash2, X } from "lucide-react";
import Nav from "@/components/nav";
import CaregiverPageLabel from "@/components/caregiver/pageLabel";
import ReadAloud from "@/components/interaction/ReadAloud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import { useAuth } from "@/lib/auth-context";
import { API_URL, apiFetch, mediaUrl } from "@/lib/api";
import {
  canEditPlaces,
  isGoogleMapsUrl,
  PLACE_CATEGORIES,
  Place,
  PlaceCategory,
  PlaceHours,
  WEEKDAYS,
} from "@/lib/places";

type PlaceDraft = {
  name: string;
  category: PlaceCategory;
  mapsUrl: string;
  note: string;
  opensAt: string;
  closesAt: string;
  closedDays: string[];
  photo: File | null;
};

const EMPTY_DRAFT: PlaceDraft = {
  name: "",
  category: "home",
  mapsUrl: "",
  note: "",
  opensAt: "",
  closesAt: "",
  closedDays: [],
  photo: null,
};

const CATEGORY_EMOJI: Record<PlaceCategory, string> = {
  home: "🏠",
  shop: "🛍️",
  doctor: "🩺",
  temple: "🛕",
  family: "👪",
  park: "🌳",
  other: "📍",
};

const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  home: "Home",
  shop: "Shop",
  doctor: "Doctor",
  temple: "Temple",
  family: "Family",
  park: "Park",
  other: "Other",
};

export default function PlacesPage() {
  const { t } = useTranslate();
  const { session } = useAuth();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Place | null>(null);
  const [deleting, setDeleting] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasModalOpen = useRef(false);
  const [editMode, setEditMode] = useState(session?.role === "caregiver");
  const canEdit = canEditPlaces(session?.role);
  const caregiver = session?.role === "caregiver";
  const title = caregiver ? "Places" : "My Places";
  const maximum = demo ? 6 : 12;

  const load = useCallback(async () => {
    setError("");
    try {
      const [placesResponse, limitsResponse] = await Promise.all([
        apiFetch(`${API_URL}/places`),
        apiFetch(`${API_URL}/memories/limits`),
      ]);
      if (!placesResponse.ok) throw new Error(t("Could not load places. Please try again."));
      const data: unknown = await placesResponse.json();
      if (!Array.isArray(data)) throw new Error(t("The saved places could not be read."));
      setPlaces(data as Place[]);
      if (limitsResponse.ok) {
        const limits = await limitsResponse.json();
        setDemo(Boolean(limits.demo));
      }
    } catch (loadError) {
      setError(t(loadError instanceof TypeError ? "Could not reach the server. Please try again." : loadError instanceof Error ? loadError.message : "Could not load places. Please try again."));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const modalOpen = dialogOpen || deleting !== null;
    if (wasModalOpen.current && !modalOpen) {
      const trigger = dialogTriggerRef.current;
      (trigger?.isConnected ? trigger : headingRef.current)?.focus();
    }
    wasModalOpen.current = modalOpen;
  }, [dialogOpen, deleting]);

  useEffect(() => {
    if (!deleting) return;
    deleteCancelRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setDeleting(null);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [deleting, busy]);

  const showEditControls = canEdit && (caregiver || editMode);
  const remaining = Math.max(0, maximum - (places?.length ?? 0));

  const openAdd = () => {
    dialogTriggerRef.current = document.activeElement as HTMLElement;
    setEditing(null);
    setActionError("");
    setDialogOpen(true);
  };
  const openEdit = (place: Place) => {
    dialogTriggerRef.current = document.activeElement as HTMLElement;
    setEditing(place);
    setActionError("");
    setDialogOpen(true);
  };

  const savePlace = async (draft: PlaceDraft) => {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      const payload = {
        name: draft.name.trim(),
        category: draft.category,
        mapsUrl: draft.mapsUrl.trim(),
        note: draft.note.trim(),
        hours: draft.opensAt || draft.closesAt || draft.closedDays.length
          ? { opensAt: draft.opensAt, closesAt: draft.closesAt, closedDays: draft.closedDays }
          : null,
      };
      const response = await apiFetch(
        `${API_URL}/places${editing ? `/${editing.id}` : ""}`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("Could not save. Please try again."));
      setEditing(result as Place);
      setPlaces(current => [...(current ?? []).filter(item => item.id !== result.id), result as Place]);

      if (draft.photo) {
        const form = new FormData();
        form.append("photo", draft.photo);
        const photoResponse = await apiFetch(`${API_URL}/places/${result.id}/photo`, {
          method: "POST",
          body: form,
        });
        const photoResult = await photoResponse.json();
        if (!photoResponse.ok) throw new Error(photoResult.error || t("Could not save the photo."));
      }
      setDialogOpen(false);
      await load();
    } catch (saveError) {
      setActionError(t(saveError instanceof TypeError ? "Could not reach the server. Please try again." : saveError instanceof Error ? saveError.message : "Could not save. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    setActionError("");
    try {
      const response = await apiFetch(`${API_URL}/places/${deleting.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("Could not delete this place. Please try again."));
      setDeleting(null);
      await load();
    } catch (deleteError) {
      setActionError(t(deleteError instanceof TypeError ? "Could not reach the server. Please try again." : deleteError instanceof Error ? deleteError.message : "Could not delete this place. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const headingText = useMemo(
    () => `${t(title)}. ${places?.map(place => place.name).join(". ") ?? ""}`,
    [places, t, title],
  );

  return (
    <>
      <Nav />
      <main className="min-h-screen px-4 pb-24 pt-24 lg:pt-8">
        <div className="mx-auto max-w-screen-lg space-y-8">
          {caregiver && <CaregiverPageLabel />}
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 ref={headingRef} tabIndex={-1} className="text-4xl font-bold">{t(title)}</h1>
              <ReadAloud className="[&_button]:min-h-[56px]" autoRead={false} text={headingText} />
            </div>
            {canEdit && !caregiver && (
              <Button
                variant={editMode ? "default" : "outline"}
                className="min-h-[56px] text-lg"
                onClick={() => setEditMode(value => !value)}
              >
                {t(editMode ? "Done editing" : "Edit places")}
              </Button>
            )}
          </header>

          {showEditControls && (
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5">
              <Button onClick={openAdd} disabled={remaining === 0} className="min-h-[56px] gap-2 text-lg">
                <Plus className="h-5 w-5" /> {t("Add a place")}
              </Button>
              <p className="text-lg font-semibold" aria-live="polite">
                {t("{count} of {total} places remaining", { count: remaining, total: maximum })}
              </p>
            </section>
          )}

          {error ? (
            <p className="rounded-xl border border-destructive/40 p-5 text-xl" role="alert">{error}</p>
          ) : places === null ? (
            <p className="text-xl" role="status">{t("Loading…")}</p>
          ) : places.length === 0 ? (
            <section className="space-y-4 rounded-2xl border bg-card p-8 text-center">
              <MapPin className="mx-auto h-12 w-12 text-primary" aria-hidden="true" />
              <p className="text-2xl font-semibold">{t("No places yet")}</p>
              {showEditControls && <Button onClick={openAdd} className="min-h-[56px] text-lg">{t("Add a place")}</Button>}
              <ReadAloud className="[&_button]:min-h-[56px]" autoRead={false} text={t("No places yet")} />
            </section>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {places.map(place => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  editable={showEditControls}
                  onEdit={() => openEdit(place)}
                  onDelete={() => { dialogTriggerRef.current = document.activeElement as HTMLElement; setActionError(""); setDeleting(place); }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {dialogOpen && (
        <PlaceDialog
          place={editing}
          busy={busy}
          error={actionError}
          onClose={() => { if (!busy) setDialogOpen(false); }}
          onSave={savePlace}
        />
      )}
      {deleting && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-place-title" aria-describedby="delete-place-description" onKeyDown={keepFocusInside} className="w-full max-w-lg space-y-5 rounded-2xl border bg-background p-6 shadow-xl">
            <h2 id="delete-place-title" className="text-2xl font-bold">{t("Delete {name}?", { name: deleting.name })}</h2>
            <ReadAloud className="[&_button]:min-h-[56px]" autoRead={false} text={t("Delete {name}?", { name: deleting.name })} />
            <p id="delete-place-description" className="text-lg">{t("Delete this saved place and its photo?")}</p>
            {actionError && <p role="alert" className="text-base text-destructive">{actionError}</p>}
            <div className="flex flex-wrap justify-end gap-3">
              <Button ref={deleteCancelRef} variant="outline" className="min-h-[56px] text-base" disabled={busy} onClick={() => setDeleting(null)}>{t("Cancel")}</Button>
              <Button variant="destructive" className="min-h-[56px] text-base" disabled={busy} onClick={() => void confirmDelete()}>{t(busy ? "Deleting…" : "Delete")}</Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function PlaceCard({
  place,
  editable,
  onEdit,
  onDelete,
}: {
  place: Place;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t, locale } = useTranslate();
  const url = useMemo(() => {
    if (!isGoogleMapsUrl(place.mapsUrl)) return null;
    try { return new URL(place.mapsUrl); } catch { return null; }
  }, [place.mapsUrl]);
  const photoUrl = place.photo ? mediaUrl(`/place-photos/${place.photo}`) : null;
  const hoursText = formatHours(place.hours, locale.code, t);

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-48 w-full object-cover" />
      ) : (
        <div className="flex h-36 items-center justify-center bg-primary/5 text-6xl" aria-hidden="true">
          {CATEGORY_EMOJI[place.category]}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <h2 className="text-2xl font-bold">{place.name}</h2>
          <ReadAloud className="[&_button]:min-h-[56px]" autoRead={false} text={place.name} />
          <p className="mt-1 text-lg text-muted-foreground">{t(CATEGORY_LABEL[place.category])}</p>
          {place.note && <p className="mt-3 whitespace-pre-wrap text-lg">{place.note}</p>}
        </div>
        {hoursText && (
          <p className="flex items-start gap-2 text-base">
            <Clock3 className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" /> {hoursText}
          </p>
        )}
        {url && <p className="text-base text-muted-foreground">{t("Opens Google Maps at {host}", { host: url.hostname })}</p>}
        {url && (
          <a
            href={place.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[64px] items-center justify-center gap-3 rounded-xl bg-primary px-5 text-xl font-bold text-primary-foreground shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/50"
          >
            <ExternalLink className="h-6 w-6" aria-hidden="true" /> {t("Take me there")}
          </a>
        )}
        {editable && (
          <div className="mt-auto flex gap-3 border-t pt-4">
            <Button variant="outline" className="min-h-[56px] flex-1 gap-2 text-base" onClick={onEdit}>
              <Edit2 className="h-4 w-4" /> {t("Edit")}
            </Button>
            <Button variant="destructive" className="min-h-[56px] flex-1 gap-2 text-base" onClick={onDelete}>
              <Trash2 className="h-4 w-4" /> {t("Delete")}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

function formatHours(hours: PlaceHours | null, locale: string, t: (phrase: string, values?: Record<string, string | number>) => string) {
  if (!hours || (!hours.opensAt && !hours.closedDays.length)) return "";
  const formatTime = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" })
      .format(new Date(2000, 0, 1, hour, minute));
  };
  const openClose = hours.opensAt && hours.closesAt
    ? hours.opensAt === hours.closesAt ? t("Open all day") : t("Open {opensAt} to {closesAt}", { opensAt: formatTime(hours.opensAt), closesAt: formatTime(hours.closesAt) })
    : "";
  const closed = hours.closedDays.length
    ? t("Closed {days}", { days: hours.closedDays.map(day => t(day)).join(", ") })
    : "";
  return [openClose, closed].filter(Boolean).join(" · ");
}

function PlaceDialog({
  place,
  busy,
  error,
  onClose,
  onSave,
}: {
  place: Place | null;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (draft: PlaceDraft) => Promise<void>;
}) {
  const { t } = useTranslate();
  const [draft, setDraft] = useState<PlaceDraft>(() => ({
    ...EMPTY_DRAFT,
    name: place?.name ?? "",
    category: place?.category ?? "home",
    mapsUrl: place?.mapsUrl ?? "",
    note: place?.note ?? "",
    opensAt: place?.hours?.opensAt ?? "",
    closesAt: place?.hours?.closesAt ?? "",
    closedDays: place?.hours?.closedDays ?? [],
  }));
  const [localError, setLocalError] = useState("");
  const [preview, setPreview] = useState("");
  const heading = place ? t("Edit {name}", { name: place.name }) : t("Add a place");
  const initialFocus = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initialFocus.current?.focus();
  }, []);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  useEffect(() => {
    if (!draft.photo) { setPreview(""); return; }
    const objectUrl = URL.createObjectURL(draft.photo);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [draft.photo]);

  const setField = <K extends keyof PlaceDraft,>(key: K, value: PlaceDraft[K]) =>
    setDraft(current => ({ ...current, [key]: value }));
  const toggleDay = (day: string) => setDraft(current => ({
    ...current,
    closedDays: current.closedDays.includes(day)
      ? current.closedDays.filter(value => value !== day)
      : [...current.closedDays, day],
  }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (draft.photo && draft.photo.size > 5 * 1024 * 1024) {
      setLocalError(t("Photo must be at most 5 MB."));
      return;
    }
    if (draft.photo && !["image/jpeg", "image/png", "image/webp"].includes(draft.photo.type)) {
      setLocalError(t("Photo must be JPEG, PNG, or WebP."));
      return;
    }
    if (!isGoogleMapsUrl(draft.mapsUrl.trim())) {
      setLocalError(t("Please paste a link from Google Maps (the Share button)."));
      return;
    }
    if (Boolean(draft.opensAt) !== Boolean(draft.closesAt)) {
      setLocalError(t("Set both opening and closing times, or leave both empty."));
      return;
    }
    setLocalError("");
    void onSave(draft);
  };
  const testLink = () => {
    if (!isGoogleMapsUrl(draft.mapsUrl.trim())) {
      setLocalError(t("Please paste a link from Google Maps (the Share button)."));
      return;
    }
    window.open(draft.mapsUrl.trim(), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-dialog-title"
        onKeyDown={keepFocusInside}
        className="my-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-background p-5 shadow-xl sm:p-7"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id="place-dialog-title" className="text-2xl font-bold">{heading}</h2>
          <Button type="button" variant="ghost" className="min-h-[56px] min-w-[56px]" disabled={busy} aria-label={t("Close")} onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <ReadAloud className="[&_button]:min-h-[56px]" autoRead={false} text={heading} />
        <form onSubmit={submit} className="space-y-5">
          <fieldset disabled={busy} className="space-y-5">
          <section className="rounded-xl border bg-muted/30 p-4">
            <h3 className="text-lg font-bold">{t("How to share a Google Maps link")}</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-6 text-base">
              <li>{t("In Google Maps, open the place.")}</li>
              <li>{t("Press Share.")}</li>
              <li>{t("Copy the link and paste it here.")}</li>
            </ol>
          </section>
          <div className="space-y-2">
            <label htmlFor="place-maps-url" className="text-base font-semibold">{t("Google Maps link")}</label>
            <Input id="place-maps-url" ref={initialFocus} value={draft.mapsUrl} maxLength={300} onChange={event => setField("mapsUrl", event.target.value)} className="min-h-[56px] text-base" placeholder={t("Paste your Google Maps share link")} />
            <Button type="button" variant="outline" className="min-h-[56px] text-base" onClick={testLink}>{t("Test link")}</Button>
          </div>
          <div className="space-y-2">
            <label htmlFor="place-name" className="text-base font-semibold">{t("Place name")}</label>
            <Input id="place-name" required maxLength={60} value={draft.name} onChange={event => setField("name", event.target.value)} className="min-h-[56px] text-lg" />
          </div>
          <div className="space-y-2">
            <label htmlFor="place-category" className="text-base font-semibold">{t("Category")}</label>
            <select id="place-category" value={draft.category} onChange={event => setField("category", event.target.value as PlaceCategory)} className="min-h-[56px] w-full rounded-md border border-input bg-background px-3 text-lg">
              {PLACE_CATEGORIES.map(category => <option key={category} value={category}>{t(CATEGORY_LABEL[category])}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="place-note" className="text-base font-semibold">{t("Note")}</label>
            <textarea id="place-note" maxLength={120} value={draft.note} onChange={event => setField("note", event.target.value)} className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <p className="text-base text-muted-foreground">{t("{count} of 120 characters", { count: draft.note.length })}</p>
          </div>
          <fieldset className="space-y-3">
            <legend className="text-base font-semibold">{t("Opening hours (optional)")}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-base">{t("Opens at")}<Input type="time" value={draft.opensAt} onChange={event => setField("opensAt", event.target.value)} className="min-h-[56px] text-lg" /></label>
              <label className="space-y-1 text-base">{t("Closes at")}<Input type="time" value={draft.closesAt} onChange={event => setField("closesAt", event.target.value)} className="min-h-[56px] text-lg" /></label>
            </div>
            <p className="text-base font-medium">{t("Closed days")}</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(day => (
                <label key={day} className="inline-flex min-h-[56px] items-center gap-2 rounded-xl border px-3 text-base">
                  <input type="checkbox" checked={draft.closedDays.includes(day)} onChange={() => toggleDay(day)} className="h-5 w-5" />
                  {t(day)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <label htmlFor="place-photo" className="text-base font-semibold">{t("Photo (optional)")}</label>
            <Input id="place-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setField("photo", event.target.files?.[0] ?? null)} className="min-h-[56px] text-base" />
            <p className="text-base text-muted-foreground">{t("Choose a JPEG, PNG, or WebP photo up to 5 MB.")}</p>
            {(preview || place?.photo) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview || mediaUrl(`/place-photos/${place?.photo}`)} alt={t("Photo preview")} className="h-36 w-36 rounded-xl border object-cover" />
            )}
          </div>
          {(localError || error) && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-base text-destructive">{localError || error}</p>}
          <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" className="min-h-[56px] text-base" disabled={busy} onClick={onClose}>{t("Cancel")}</Button>
            <Button type="submit" className="min-h-[56px] text-base" disabled={busy}>{t(busy ? "Saving…" : "Save place")}</Button>
          </div>
          </fieldset>
        </form>
      </section>
    </div>
  );
}

function keepFocusInside(event: React.KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:enabled, input:enabled, select:enabled, textarea:enabled',
    ),
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
