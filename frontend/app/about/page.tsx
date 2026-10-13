import Nav from "@/components/nav";

export default function AboutPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto min-h-screen max-w-3xl space-y-8 px-4 pb-24 pt-24 text-lg leading-relaxed text-foreground lg:pt-8">
        <header className="space-y-3">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">About CogniConnect</h1>
          <p>
            CogniConnect is an AI memory-support platform with personal memory activities and cognitive games for older
            adults living with dementia or Alzheimer’s. It was created for Smart India Hackathon SIH26003 with MDoNER.
          </p>
        </header>

        <section aria-labelledby="how-it-works" className="space-y-4">
          <h2 id="how-it-works" className="text-2xl font-bold">How it works</h2>
          <ol className="list-decimal space-y-3 pl-7">
            <li>A caregiver adds familiar people, photos, and videos.</li>
            <li>CogniConnect uses those memories to prepare personal questions and conversation prompts.</li>
            <li>The person can revisit memories and play simple cognitive games at their own pace.</li>
            <li>Caregivers can review activity and use it to guide supportive conversations.</li>
          </ol>
        </section>

        <p className="border-t border-border pt-6 font-semibold">Built by Team CogniConnect</p>
      </main>
    </>
  );
}
