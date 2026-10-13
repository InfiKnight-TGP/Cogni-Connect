import Nav from "@/components/nav";
import { Card } from "@/components/ui/card";
import { COGNITIVE_AREAS } from "@/lib/areas";
import { BookOpenCheck, Gamepad2, HeartHandshake, Languages, Sparkles, TrendingUp, Upload } from "lucide-react";
import Link from "next/link";

const STEPS = [
  {
    title: "Add memories",
    icon: Upload,
    description: "A caregiver adds familiar people, photos and short videos of the day.",
  },
  {
    title: "AI understands them",
    icon: Sparkles,
    description: "CogniConnect transcribes what was said, recognises familiar faces, and prepares personal questions.",
  },
  {
    title: "Play at your own pace",
    icon: Gamepad2,
    description: "The person revisits their memories and plays simple games, with no timers and no pressure.",
  },
  {
    title: "Caregivers follow along",
    icon: TrendingUp,
    description: "Caregivers see progress and can share a report with a doctor.",
  },
] as const;

const DIFFERENCES = [
  {
    title: "Personal",
    icon: HeartHandshake,
    description: "Questions come from the person's own life, not generic puzzles.",
  },
  {
    title: "Research-informed",
    icon: BookOpenCheck,
    description: "Games are modelled on published approaches such as everyday planning tasks and navigation studies.",
  },
  {
    title: "Made for India",
    icon: Languages,
    description: "Familiar everyday settings and support for many Indian languages.",
  },
] as const;

export default function AboutPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto min-h-screen max-w-4xl space-y-12 px-4 pb-24 pt-24 text-lg leading-relaxed text-foreground lg:pt-8">
        <header className="space-y-3 py-4 text-center sm:py-8">
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">CogniConnect</h1>
          <p className="text-2xl font-semibold text-primary sm:text-3xl">Connecting Minds, Preserving Memories</p>
          <p className="mx-auto max-w-3xl text-lg text-muted-foreground">
            Built with ❤️ to help individuals with dementia and Alzheimer&apos;s stay connected to their memories.
          </p>
        </header>

        <section aria-labelledby="what-it-is" className="space-y-3">
          <h2 id="what-it-is" className="text-3xl font-bold">What it is</h2>
          <p>
            CogniConnect is an AI memory-support platform that turns a person&apos;s own memories into gentle daily
            activities and cognitive games, made for older adults living with dementia or Alzheimer&apos;s. It was created
            for Smart India Hackathon problem SIH26003 (MDoNER).
          </p>
        </section>

        <section aria-labelledby="how-it-works" className="space-y-5">
          <h2 id="how-it-works" className="text-3xl font-bold">How it works</h2>
          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {STEPS.map(({ title, icon: Icon, description }, index) => (
              <li key={title} className="h-full">
                <Card className="h-full border-primary/30 bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary" aria-label={`Step ${index + 1}`}>
                      {index + 1}
                    </span>
                    <Icon aria-hidden="true" className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold">{title}</h3>
                  <p className="text-lg">{description}</p>
                </Card>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="brain-areas" className="space-y-5">
          <h2 id="brain-areas" className="text-3xl font-bold">Four brain areas</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {COGNITIVE_AREAS.map(({ name, shortDescription, icon: Icon, colorClasses }) => (
              <Card key={name} className={`flex min-h-32 items-start gap-4 p-5 shadow-sm ${colorClasses}`}>
                <Icon aria-hidden="true" className="mt-1 h-7 w-7 shrink-0" />
                <div>
                  <h3 className="text-xl font-bold">{name}</h3>
                  <p className="mt-1 text-lg text-foreground">{shortDescription}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section aria-labelledby="why-different" className="space-y-5">
          <h2 id="why-different" className="text-3xl font-bold">Why it&apos;s different</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {DIFFERENCES.map(({ title, icon: Icon, description }) => (
              <Card key={title} className="h-full border-border bg-card p-5 shadow-sm">
                <Icon aria-hidden="true" className="mb-3 h-8 w-8 text-primary" />
                <h3 className="mb-2 text-xl font-bold">{title}</h3>
                <p className="text-lg">{description}</p>
              </Card>
            ))}
          </div>
        </section>

        <aside aria-labelledby="important-note" className="rounded-xl border border-border bg-muted/60 p-6">
          <h2 id="important-note" className="text-2xl font-bold">Important note</h2>
          <p className="mt-2">
            CogniConnect supports memory and engagement. It is not a medical device and does not diagnose or treat any
            condition.
          </p>
          <p className="mt-3">
            Read our <Link className="font-semibold text-primary underline underline-offset-4 hover:text-primary/80" href="/terms">Terms</Link>
            {" and "}
            <Link className="font-semibold text-primary underline underline-offset-4 hover:text-primary/80" href="/privacy">Privacy</Link> information.
          </p>
        </aside>

        <p className="border-t border-border pt-6 text-center text-xl font-semibold">Built by Team CogniConnect</p>
      </main>
    </>
  );
}
