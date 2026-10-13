import Nav from "@/components/nav";

export default function TermsPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 pb-24 pt-24 text-lg leading-relaxed text-foreground lg:pt-8">
        <div className="rounded-xl border border-amber-500/50 bg-amber-50 px-5 py-3 font-semibold text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          Draft – not legal advice
        </div>
        <header className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Terms of Use</h1>
          <p>CogniConnect is a prototype provided for research and educational purposes.</p>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Not medical care</h2>
          <p>
            CogniConnect is not a medical device and does not diagnose, prevent, or treat dementia, Alzheimer’s disease,
            or any other health condition. Its activities are not a substitute for care from a qualified health
            professional.
          </p>
          <p>
            Scores describe performance during an activity only. They are not a clinical assessment and should not be
            used to make medical decisions. Please consult a doctor for clinical assessment or health advice.
          </p>
        </section>
      </main>
    </>
  );
}
