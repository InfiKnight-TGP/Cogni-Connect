"use client";

import Nav from "@/components/nav";
import { useTranslate } from "@/components/interaction/InteractionProvider";

export default function PrivacyPage() {
  const { t } = useTranslate();
  return (
    <>
      <Nav />
      <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 pb-24 pt-24 text-lg leading-relaxed text-foreground lg:pt-8">
        <div className="rounded-xl border border-amber-500/50 bg-amber-50 px-5 py-3 font-semibold text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          {t("Draft – not legal advice")}
        </div>
        <header className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t("Privacy")}</h1>
          <p>{t("Here is a summary of the information CogniConnect handles and how it is used.")}</p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">{t("Information stored on this server")}</h2>
          <p>{t("Patient information is kept in separate folders on this server. Caregivers can access only the patients linked to their accounts. It can include:")}</p>
          <ul className="list-disc space-y-2 pl-7">
            <li>{t("Videos, face photos, and transcripts.")}</li>
            <li>{t("Activity scores.")}</li>
            <li>{t("People’s names, their relations to the person using CogniConnect, and phone numbers.")}</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">{t("Accounts and device access")}</h2>
          <p>{t("Caregiver accounts store a name, email address, and a securely hashed password. We send short-lived login and password-reset codes by email. The server stores hashes of these codes, pairing codes, and session tokens.")}</p>
          <p>{t("Patient devices connect using a single-use pairing code without an email or password. Device sessions can last up to 90 days between visits. Caregiver sessions can last up to 30 days between visits. Caregivers can revoke paired devices from Settings.")}</p>
          <p>{t("A separate PIN for each patient allows temporary caregiver access on their device. Session cookies are used to keep you signed in. Display preferences may be stored in your browser.")}</p>
          <p>{t("If a caregiver creates a patient login, the patient email is stored with that patient. Login codes go either to the patient or to the caregiver chosen in Patients & Devices. The caregiver can remove the patient login at any time; contact the server operator to request deletion.")}</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">{t("Self-care accounts")}</h2>
          <p>{t("A self-care account belongs to the person using CogniConnect. You can invite a trusted family member, see who has access, and remove access whenever you choose.")}</p>
          <p>{t("If you use a patient email account, login codes are sent to the patient email or the owner's email chosen when the account was created. You can request deletion of your account and data from the server operator.")}</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">{t("Uploaded videos and memories")}</h2>
          <p>
            {t(
              "Uploaded videos are processed to create transcripts (using Google speech recognition) and questions (using OpenAI). Audio and video frames may be sent to those services for processing. All videos, transcripts, face recognition records, and quiz questions are stored in private patient folders on this server, and can be deleted at any time by a caregiver or self-care user."
            )}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">{t("Use of OpenAI’s API")}</h2>
          <p>
            {t("Transcripts and video frames are sent to OpenAI’s API to support transcription and to create questions and answers about the memories.")}
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">{t("Caregiver controls")}</h2>
          <p>{t("Caregivers can remove people and activity records using the app. To request deletion of an account or other stored information, contact the person or organisation running your CogniConnect server.")}</p>
          <p>{t("CogniConnect has no ads and does not sell data.")}</p>
        </section>
      </main>
    </>
  );
}
