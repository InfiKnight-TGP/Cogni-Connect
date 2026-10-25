export interface Person {
  id: string;
  name: string;
  relation: string;
  phone: string;
  photo: string;
}

export const VALID_RELATIONS = [
  "Son", "Daughter", "Wife", "Husband", "Grandchild",
  "Friend", "Doctor", "Neighbour", "Caregiver", "Other",
];

export const relationText = (rel: string): string => {
  if (!rel) return "";
  const trimmed = rel.trim();
  if (trimmed.toLowerCase().startsWith("your ")) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  return `Your ${trimmed.toLowerCase()}`;
};

export interface SessionLike {
  role?: string;
  kind?: string;
}

export function canEditPeople(
  session: SessionLike | null | undefined,
  isCaregiver: boolean = false
): boolean {
  if (!session) return Boolean(isCaregiver);
  // Paired devices (patient_device) and patient logins (patient) must NEVER have edit controls
  if (session.role === "patient_device" || session.kind === "patient_device") {
    return false;
  }
  if (session.role === "patient" || session.kind === "patient") {
    return false;
  }
  const isSelf = session.role === "self";
  return Boolean(isCaregiver || isSelf);
}

export function normalizeRelation(rel: string): string {
  if (!rel) return "";
  const trimmed = rel.trim();
  let lower = trimmed.toLowerCase();
  if (lower.startsWith("your ")) {
    lower = lower.slice(5).trim();
  }
  if (lower === "grandson" || lower === "granddaughter") {
    return "Grandchild";
  }
  const found = VALID_RELATIONS.find((r) => r.toLowerCase() === lower);
  if (found) {
    return found;
  }
  return trimmed;
}

