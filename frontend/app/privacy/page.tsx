import Nav from "@/components/nav";

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 pb-24 pt-24 text-lg leading-relaxed text-foreground lg:pt-8">
        <div className="rounded-xl border border-amber-500/50 bg-amber-50 px-5 py-3 font-semibold text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          Draft – not legal advice
        </div>
        <header className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Privacy</h1>
          <p>Here is a summary of the information CogniConnect handles and how it is used.</p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Information stored on this server</h2>
          <p>Information is kept on this server in backend files. It can include:</p>
          <ul className="list-disc space-y-2 pl-7">
            <li>Videos, face photos, and transcripts.</li>
            <li>Activity scores.</li>
            <li>People’s names, their relations to the person using CogniConnect, and phone numbers.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Use of OpenAI’s API</h2>
          <p>
            Transcripts and video frames are sent to OpenAI’s API to support transcription and to create questions and
            answers about the memories.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Caregiver controls</h2>
          <p>Caregivers can delete people and videos from CogniConnect.</p>
          <p>CogniConnect has no ads and does not sell data.</p>
        </section>
      </main>
    </>
  );
}
