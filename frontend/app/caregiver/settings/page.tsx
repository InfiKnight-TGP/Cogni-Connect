import Nav from "@/components/nav";
import { CaregiverOnly } from "@/components/caregiver";
import SettingsContent from "@/components/caregiver/settingsContent";
import { PatientsAndDevices, AccountSettings } from "@/components/auth/patient-controls";

export default function CaregiverSettingsPage() {
  return <><Nav /><CaregiverOnly><main className="mx-auto max-w-screen-xl space-y-6 px-4 pb-24 pt-24 lg:pb-12 lg:pt-8"><header><p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Caregiver portal</p><h1 className="mt-1 text-3xl font-bold">Settings</h1></header><PatientsAndDevices /><AccountSettings /><SettingsContent /></main></CaregiverOnly></>;
}
