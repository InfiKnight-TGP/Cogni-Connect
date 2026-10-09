"use client";

import Nav from "@/components/nav";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { API_URL } from "@/lib/api";
import { useCaregiver } from "@/lib/mode";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useState } from "react";

interface Person {
  id: string;
  name: string;
  relation: string;
  phone: string;
  photo: string;
}

const RELATIONS = [
  "Son", "Daughter", "Wife", "Husband", "Brother", "Sister",
  "Grandson", "Granddaughter", "Son-in-law", "Daughter-in-law",
  "Friend", "Neighbour", "Doctor", "Caregiver",
];

// "Dinesh, your son"
const caption = (p: Person) =>
  p.relation ? `${p.name}, your ${p.relation.toLowerCase()}` : p.name;

function speak(p: Person) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(`This is ${caption(p)}.`);
  u.lang = "en-IN";
  u.rate = 0.85;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [version, setVersion] = useState(0); // busts the photo cache after an edit
  const [caregiver, setCaregiver] = useCaregiver();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/people`);
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

  const photoUrl = (p: Person) => `${API_URL}/known-faces/${p.photo}?v=${version}`;

  return (
    <>
      <Nav />
      <main className="min-h-screen pt-24">
        <div className="mx-auto max-w-screen-lg space-y-8 px-4 py-8">
          <h1 className="text-4xl font-bold">{caregiver ? "People" : "My People"}</h1>

          {loadError ? (
            <p className="text-xl">Sorry, we could not load the people right now.</p>
          ) : people === null ? (
            <p className="text-xl">Loading…</p>
          ) : caregiver ? (
            <ManagePeople people={people} photoUrl={photoUrl} reload={load} />
          ) : people.length === 0 ? (
            <p className="text-2xl">No people added yet.</p>
          ) : (
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((p) => (
                <div key={p.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(p)} alt={p.name} className="aspect-square w-full object-cover" />
                  <div className="space-y-4 p-6">
                    <p className="text-3xl font-bold">{caption(p)}</p>
                    <div className="flex gap-3">
                      {p.phone && (
                        <a
                          href={`tel:${p.phone.replace(/\s/g, "")}`}
                          className={cn(buttonVariants({ size: "lg" }), "h-16 flex-1 px-4 text-2xl")}
                        >
                          📞 Call
                        </a>
                      )}
                      <Button
                        size="lg"
                        variant="secondary"
                        className="h-16 flex-1 px-4 text-2xl"
                        onClick={() => speak(p)}
                      >
                        🔊 Listen
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ponytail: unprotected switch until Phase 4 moves it into the nav behind a PIN */}
          <button
            className="text-sm text-muted-foreground underline"
            onClick={() => setCaregiver(!caregiver)}
          >
            {caregiver ? "Back to patient view" : "Caregiver: manage people"}
          </button>
        </div>
      </main>
    </>
  );
}

function ManagePeople({
  people,
  photoUrl,
  reload,
}: {
  people: Person[];
  photoUrl: (p: Person) => string;
  reload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Person | null>(null);
  const [formKey, setFormKey] = useState(0);

  const remove = async (p: Person) => {
    if (!confirm(`Remove ${p.name}? Their photo will be deleted too.`)) return;
    const res = await fetch(`${API_URL}/people/${p.id}`, { method: "DELETE" });
    if (!res.ok) alert("Could not remove this person. Please try again.");
    if (editing?.id === p.id) setEditing(null);
    reload();
  };

  return (
    <>
      <PersonForm
        key={editing?.id ?? `new-${formKey}`}
        person={editing}
        onDone={async () => {
          setEditing(null);
          setFormKey((k) => k + 1);
          await reload();
        }}
        onCancel={() => setEditing(null)}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((p) => (
          <div key={p.id} className="flex items-center gap-4 rounded-lg border bg-card p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl(p)} alt={p.name} className="h-20 w-20 rounded-md object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{p.name}</p>
              <p className="text-sm text-muted-foreground">{p.relation || "No relation set"}</p>
              <p className="text-sm text-muted-foreground">{p.phone || "No phone"}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                  Edit
                </Button>
                <Button size="sm" variant="destructive" onClick={() => remove(p)}>
                  Delete
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function PersonForm({
  person,
  onDone,
  onCancel,
}: {
  person: Person | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [relation, setRelation] = useState(person?.relation ?? "");
  const [phone, setPhone] = useState(person?.phone ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData();
    form.append("name", name.trim());
    form.append("relation", relation);
    form.append("phone", phone.trim());
    if (photo) form.append("photo", photo);
    try {
      const res = await fetch(`${API_URL}/people${person ? `/${person.id}` : ""}`, {
        method: person ? "PUT" : "POST",
        body: form,
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "Could not save. Please try again.");
        return;
      }
      await onDone();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4 rounded-lg border bg-card p-6">
      <h2 className="text-2xl font-semibold">{person ? `Edit ${person.name}` : "Add a person"}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-sm font-medium">Name *</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Relation</span>
          <select
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">Choose…</option>
            {[...RELATIONS, ...(relation && !RELATIONS.includes(relation) ? [relation] : [])].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Phone</span>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">
            Photo {person ? "(leave empty to keep the current one)" : "*"}
          </span>
          <Input
            type="file"
            accept="image/jpeg,image/png"
            required={!person}
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="New photo" className="h-32 w-32 rounded-md object-cover" />
      )}
      <p className="text-sm text-muted-foreground">Use a clear photo of the face. It is also used to recognise this person in videos.</p>
      {error && <p className="rounded-md bg-red-500/10 p-3 text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? "Saving…" : person ? "Save changes" : "Add person"}
        </Button>
        {person && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
