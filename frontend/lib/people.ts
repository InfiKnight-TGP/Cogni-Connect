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
