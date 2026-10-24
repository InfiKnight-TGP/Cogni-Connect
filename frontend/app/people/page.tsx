"use client";

import Nav from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mediaUrl, apiFetch, API_URL } from "@/lib/api";
import { useCaregiver } from "@/lib/mode";
import { useAuth } from "@/lib/auth-context";
import CaregiverPageLabel from "@/components/caregiver/pageLabel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslate } from "@/components/interaction/InteractionProvider";
import ReadAloud from "@/components/interaction/ReadAloud";
import { Edit2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Person, VALID_RELATIONS, relationText } from "@/lib/people";

export default function PeoplePage() {
  const { t } = useTranslate();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [version, setVersion] = useState(0); // busts the photo cache after an edit
  const [caregiver] = useCaregiver();
  const { session } = useAuth();

  // Self accounts can edit their own people; caregivers manage their active patient.
  // Paired devices (patient_device) and patient logins have no editing controls.
  const isSelf = session?.role === "self";
  const canEdit = Boolean(caregiver || isSelf);

  // Self account edit mode toggle (caregivers default to edit mode)
  const [editMode, setEditMode] = useState(Boolean(caregiver));

  // Modal dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);

  // Rescan state
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/people`);
      if (!res.ok) throw new Error();
      setPeople(await res.json());
      setVersion(Date.now());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Clean up rescan poll timer
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const photoUrl = useCallback(
    (p: Person) => mediaUrl(`/known-faces/${p.photo}?v=${version}`),
    [version]
  );

  const handleOpenAdd = () => {
    setEditingPerson(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (p: Person) => {
    setEditingPerson(p);
    setDialogOpen(true);
  };

  const handleDelete = async (p: Person) => {
    const confirmed = window.confirm(
      t("Remove {name}? Their photo will be deleted too.", { name: p.name })
    );
    if (!confirmed) return;

    try {
      const res = await apiFetch(`${API_URL}/people/${p.id}`, { method: "DELETE" });
      if (!res.ok) {
        alert(t("Could not remove this person. Please try again."));
        return;
      }
      await load();
    } catch {
      alert(t("Could not reach the server. Please try again."));
    }
  };

  const handleStartRescan = async () => {
    setScanError(null);
    setScanning(true);
    setScanProgress(0);
    setScanMessage(t("Starting scan…"));

    try {
      const res = await apiFetch(`${API_URL}/people/rescan`, { method: "POST" });
      const data = await res.json().catch(() => null);

      if (res.status === 429) {
        setScanError(data?.error || t("Rescan limit reached. Please try again later."));
        setScanning(false);
        return;
      }
      if (res.status === 409) {
        setScanError(data?.error || t("A scan is already in progress."));
        setScanning(false);
        return;
      }
      if (!res.ok) {
        setScanError(data?.error || t("Could not start face scan."));
        setScanning(false);
        return;
      }

      if (data?.status === "completed") {
        setScanProgress(100);
        setScanMessage(data.message || t("Scan completed."));
        setScanning(false);
        return;
      }

      setScanProgress(data?.progress ?? 0);
      setScanMessage(data?.message || t("Scanning videos…"));

      // Poll status every 1.5 seconds
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(async () => {
        try {
          const statusRes = await apiFetch(`${API_URL}/people/rescan/status`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          if (statusData.status === "completed") {
            setScanProgress(100);
            setScanMessage(statusData.message || t("Face scan completed successfully."));
            setScanning(false);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          } else if (statusData.status === "failed") {
            setScanError(statusData.message || t("Face scan failed. You can try again."));
            setScanning(false);
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          } else if (statusData.status === "running") {
            setScanProgress(statusData.progress ?? 0);
            setScanMessage(statusData.message || t("Scanning videos…"));
          }
        } catch {
          // ignore transient poll error
        }
      }, 1500);
    } catch {
      setScanError(t("Could not reach the server. Please try again."));
      setScanning(false);
    }
  };

  const showEditControls = canEdit && (caregiver || editMode);

  return (
    <>
      <Nav />
      <main className="min-h-screen pt-24 lg:pt-8">
        <div className="mx-auto max-w-screen-lg space-y-8 px-4 py-8">
          {caregiver && <CaregiverPageLabel />}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold">{t(caregiver ? "People" : "My People")}</h1>
              {!caregiver && people && (
                <ReadAloud
                  autoRead={false}
                  text={`${t("My People")}. ${people
                    .map((person) =>
                      [person.name, person.relation ? t(relationText(person.relation)) : ""]
                        .filter(Boolean)
                        .join(", ")
                    )
                    .join(". ")}`}
                />
              )}
            </div>

            {/* Toggle edit mode for self accounts only (paired devices & patient logins see nothing) */}
            {isSelf && !caregiver && (
              <Button
                variant={editMode ? "default" : "outline"}
                size="lg"
                onClick={() => setEditMode((prev) => !prev)}
                className="min-h-[48px] text-lg font-semibold shadow-sm"
              >
                {t(editMode ? "Done editing" : "Edit people")}
              </Button>
            )}
          </div>

          {/* Edit mode action toolbar */}
          {showEditControls && (
            <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <Button
                  size="lg"
                  onClick={handleOpenAdd}
                  className="min-h-[48px] gap-2 text-lg font-semibold"
                >
                  <Plus className="h-5 w-5" />
                  {t("Add a person")}
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  disabled={scanning}
                  onClick={handleStartRescan}
                  className="min-h-[48px] gap-2 text-lg font-semibold"
                >
                  <RefreshCw className={`h-5 w-5 ${scanning ? "animate-spin" : ""}`} />
                  {t("Find them in my videos")}
                </Button>
              </div>

              {/* Live rescan status and progress bar */}
              {(scanning || scanMessage || scanError) && (
                <div className="space-y-2 rounded-xl border bg-background/80 p-4">
                  <div className="flex items-center justify-between gap-4 text-base font-medium">
                    <span>{scanMessage || t("Face scan")}</span>
                    <span>{scanProgress}%</span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${Math.min(Math.max(scanProgress, 0), 100)}%` }}
                    />
                  </div>
                  {scanError && (
                    <p className="text-base font-semibold text-destructive">{scanError}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {loadError ? (
            <p className="text-xl text-destructive">
              {t("Sorry, we could not load the people right now.")}
            </p>
          ) : people === null ? (
            <p className="text-xl text-muted-foreground">{t("Loading…")}</p>
          ) : people.length === 0 ? (
            <div className="rounded-2xl border bg-card p-8 text-center space-y-4">
              <p className="text-2xl font-medium text-muted-foreground">{t("No people added yet.")}</p>
              {showEditControls && (
                <Button size="lg" onClick={handleOpenAdd} className="min-h-[48px] text-lg">
                  {t("Add a person")}
                </Button>
              )}
              <ReadAloud autoRead={false} text={t("No people added yet.")} />
            </div>
          ) : (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col justify-between overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md"
                >
                  <div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl(p)}
                      alt={p.name}
                      className="aspect-square w-full object-cover"
                    />
                    <div className="space-y-3 p-6">
                      <p className="text-3xl font-bold">{p.name}</p>
                      {p.relation && (
                        <p className="text-2xl font-semibold text-muted-foreground">
                          {t(relationText(p.relation))}
                        </p>
                      )}
                      {p.phone && (
                        <p className="text-2xl font-semibold text-foreground">{p.phone}</p>
                      )}
                      {p.phone && !showEditControls && (
                        <a
                          href={`tel:${p.phone.replace(/\s/g, "")}`}
                          className="flex h-16 w-full items-center justify-center rounded-xl bg-green-600 px-6 text-2xl font-bold text-white shadow-sm transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-green-500"
                        >
                          📞 {t("Call")}
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Edit and Delete controls when edit mode is active */}
                  {showEditControls && (
                    <div className="border-t bg-muted/30 p-4 flex gap-3">
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={() => handleOpenEdit(p)}
                        className="min-h-[48px] flex-1 gap-2 text-lg font-semibold"
                      >
                        <Edit2 className="h-5 w-5" />
                        {t("Edit")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="lg"
                        onClick={() => handleDelete(p)}
                        className="min-h-[48px] flex-1 gap-2 text-lg font-semibold"
                      >
                        <Trash2 className="h-5 w-5" />
                        {t("Delete")}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Add / Edit modal dialog */}
      <PersonDialog
        person={editingPerson}
        isOpen={dialogOpen}
        photoUrl={photoUrl}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
      />
    </>
  );
}

function PersonDialog({
  person,
  isOpen,
  photoUrl,
  onClose,
  onSaved,
}: {
  person: Person | null;
  isOpen: boolean;
  photoUrl: (p: Person) => string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslate();
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset form state when dialog opens or person changes
  useEffect(() => {
    if (isOpen) {
      setName(person?.name ?? "");
      setRelation(person?.relation ?? "");
      setPhone(person?.phone ?? "");
      setPhoto(null);
      setError(null);
    }
  }, [isOpen, person]);

  // Live preview for selected photo or existing person photo
  const previewUrl = useMemo(() => {
    if (photo) return URL.createObjectURL(photo);
    if (person) return photoUrl(person);
    return null;
  }, [photo, person, photoUrl]);

  useEffect(() => {
    return () => {
      if (photo && previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [photo, previewUrl]);

  if (!isOpen) return null;

  const handleCancel = () => {
    const isDirty =
      name !== (person?.name ?? "") ||
      relation !== (person?.relation ?? "") ||
      phone !== (person?.phone ?? "") ||
      photo !== null;

    if (isDirty && !window.confirm(t("You have unsaved changes. Discard them?"))) {
      return;
    }
    onClose();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const form = new FormData();
    form.append("name", name.trim());
    form.append("relation", relation);
    if (phone.trim()) form.append("phone", phone.trim());
    if (photo) form.append("photo", photo);

    try {
      const res = await apiFetch(`${API_URL}/people${person ? `/${person.id}` : ""}`, {
        method: person ? "PUT" : "POST",
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || t("Could not save. Please try again."));
        setSaving(false);
        return;
      }

      await onSaved();
      onClose();
    } catch {
      setError(t("Could not reach the server. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="person-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border bg-card p-6 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={handleCancel}
          aria-label={t("Cancel")}
          className="absolute right-5 top-5 rounded-full p-2 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-6 w-6" />
        </button>

        <h2 id="person-dialog-title" className="text-3xl font-bold">
          {person ? t("Edit {name}", { name: person.name }) : t("Add a person")}
        </h2>

        <form onSubmit={handleSave} className="mt-6 space-y-6">
          <div className="space-y-2">
            <label htmlFor="person-name" className="text-xl font-semibold">
              {t("Name")} *
            </label>
            <Input
              id="person-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
              placeholder="Full name"
              className="min-h-[52px] text-xl"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="person-relation" className="text-xl font-semibold">
              {t("Relation")} *
            </label>
            <select
              id="person-relation"
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              required
              className="flex min-h-[52px] w-full rounded-md border border-input bg-background px-3 py-2 text-xl shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">{t("Choose relation…")}</option>
              {VALID_RELATIONS.map((r) => (
                <option key={r} value={r}>
                  {t(r)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="person-phone" className="text-xl font-semibold">
              {t("Phone")}
            </label>
            <Input
              id="person-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="min-h-[52px] text-xl"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="person-photo" className="text-xl font-semibold">
              {t("Photo")} {person ? `(${t("optional")})` : "*"}
            </label>
            <Input
              id="person-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required={!person}
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="min-h-[52px] text-lg file:mr-4 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-base file:font-semibold file:text-primary-foreground"
            />
            <p className="text-sm text-muted-foreground">
              {t(
                "Use a clear photo of the face. It is also used to recognise this person in videos."
              )}
            </p>
          </div>

          {previewUrl && (
            <div className="space-y-2">
              <span className="text-sm font-medium text-muted-foreground">Preview:</span>
              <div className="overflow-hidden rounded-2xl border bg-muted/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="aspect-square h-48 w-48 rounded-xl object-cover"
                />
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-lg font-semibold text-destructive">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-4 pt-2">
            <Button
              type="submit"
              size="lg"
              disabled={saving || !name.trim() || !relation}
              className="min-h-[52px] flex-1 text-xl font-bold"
            >
              {saving ? t("Saving…") : person ? t("Save changes") : t("Add person")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={saving}
              onClick={handleCancel}
              className="min-h-[52px] flex-1 text-xl font-bold"
            >
              {t("Cancel")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
