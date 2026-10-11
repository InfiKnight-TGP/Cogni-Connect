"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Brain, Eye, GitBranch, Users2 } from "lucide-react";
import Nav from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { COGNITIVE_DOMAINS, cognitiveGameRegistry, type CognitiveDomain } from "@/lib/games";
import { endActiveSession, readActiveSession, startNewSession, type ActivitySession } from "@/lib/sessions";

const domainIcons = {
  Memory: Brain,
  Attention: Eye,
  "Executive Function": GitBranch,
  "Recognition and Orientation": Users2,
} satisfies Record<CognitiveDomain, typeof Brain>;

export default function GamesPage() {
  const router = useRouter();
  const [session, setSession] = useState<ActivitySession | null>(null);
  const grouped = useMemo(() => Object.fromEntries(COGNITIVE_DOMAINS.map((domain) => [
    domain,
    cognitiveGameRegistry.filter((game) => game.primaryDomain === domain),
  ])) as Record<CognitiveDomain, typeof cognitiveGameRegistry>, []);

  useEffect(() => setSession(readActiveSession()), []);

  const startSession = () => setSession(startNewSession());
  const endSession = () => {
    const ended = endActiveSession();
    if (!ended) return;
    setSession(null);
    router.push(`/reports?session_id=${encodeURIComponent(ended.session_id)}`);
  };

  return <>
    <Nav />
    <main className="flex min-h-screen w-screen items-start justify-center overflow-x-hidden pt-24">
      <div className="w-full max-w-screen-lg px-4 pb-12">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">Practice at your own pace</p>
        <h1 className="mt-2 text-3xl font-bold">Brain Games</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">Choose an activity to begin. Completed activities are grouped into a reporting session so results from separate visits are not combined.</p>

        <Card className="mt-6 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="font-semibold">Performance report session</h2>
            <p className="mt-1 text-sm text-muted-foreground">{session ? `Session started ${new Date(session.started_at).toLocaleString()}.` : "Start a new session before choosing activities, or let the first activity start one."}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={startSession}>Start new session</Button>
            {session && <>
              <Link href={`/reports?session_id=${encodeURIComponent(session.session_id)}`}><Button variant="secondary">View partial report</Button></Link>
              <Button onClick={endSession}>End session & view report</Button>
            </>}
            {!session && <Link href="/reports"><Button variant="secondary">Session history</Button></Link>}
          </div>
        </Card>

        <div className="mt-8 space-y-8">
          {COGNITIVE_DOMAINS.map((domain) => {
            const Icon = domainIcons[domain];
            const domainGames = grouped[domain];
            return <section key={domain} aria-labelledby={`domain-${domain}`}>
              <div className="mb-4 flex items-center gap-3">
                <Icon className="h-7 w-7 text-primary" aria-hidden="true" />
                <div><h2 id={`domain-${domain}`} className="text-2xl font-semibold">{domain} Games</h2><p className="text-sm text-muted-foreground">Activities are listed under their primary measured domain.</p></div>
              </div>
              {domainGames.length ? <div className="grid gap-4 md:grid-cols-2">
                {domainGames.map((game) => <Card key={game.id} className="flex flex-col p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-xl font-semibold">{game.title}</h3>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${game.playable ? "bg-primary/10 text-primary" : "bg-secondary text-secondary-foreground"}`}>{game.playable ? "Available" : "Planned"}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-primary">{game.skill}</p>
                  <p className="mt-2 grow text-sm leading-relaxed text-muted-foreground">{game.description}</p>
                  {game.secondaryDomains.length > 0 && <p className="mt-2 text-sm">Also measures: {game.secondaryDomains.join(", ")} when that task mode is used.</p>}
                  <div className="mt-4 rounded-md bg-secondary p-3 text-sm">
                    <p><span className="font-medium">Level:</span> {game.levels}</p>
                    <p className="mt-1 text-muted-foreground">{game.rules}</p>
                    {game.entryPoint === "quiz" && <p className="mt-2 text-xs text-muted-foreground">This activity is part of the existing three-activity Memory Quiz.</p>}
                  </div>
                  {game.playable && game.href ? <Link href={game.href} className="mt-4"><Button className="min-h-12 w-full">{game.entryPoint === "quiz" ? "Open Memory Quiz" : `Play ${game.title}`}<ArrowRight className="ml-2 h-4 w-4" /></Button></Link> : <Button className="mt-4 min-h-12 w-full" disabled>Not available yet</Button>}
                </Card>)}
              </div> : <Card className="p-5 text-sm text-muted-foreground">No implemented activities are registered for this domain yet.</Card>}
            </section>;
          })}
        </div>
        <p className="mt-8 text-sm text-muted-foreground">Memory and Recognition can overlap in activities such as My Day Recall. This project records only the task actually performed: open recall contributes to Memory, while selecting a familiar person contributes to Recognition and Orientation.</p>
      </div>
    </main>
  </>;
}
