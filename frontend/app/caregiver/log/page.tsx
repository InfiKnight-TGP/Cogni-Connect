import { redirect } from "next/navigation";

export default function LegacyCaregiverLogPage() {
  redirect("/progress?tab=log");
}
