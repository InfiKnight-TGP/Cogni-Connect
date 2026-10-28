export type UserRole = "caregiver" | "patient" | "patient_device" | "self";

export function shouldSpeak({
  role,
  readAloudSetting,
  forced = false,
}: {
  role?: string | null;
  readAloudSetting?: boolean | null;
  forced?: boolean;
}): boolean {
  // Forced speech is strictly banned across all roles
  if (forced) return false;
  // Missing or disabled preference never speaks
  if (readAloudSetting !== true) return false;
  // Role must be an authorized active role (caregiver, patient, patient_device, self)
  if (!role || (role !== "caregiver" && role !== "patient" && role !== "patient_device" && role !== "self")) {
    return false;
  }
  return true;
}
