"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";
import Nav from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { COGNITIVE_DOMAINS, cognitiveGameRegistry, type CognitiveDomain } from "@/lib/games";
import { readActiveSession, readSessionHistory, type ActivitySession } from "@/lib/sessions";

const ReportRadar = dynamic(() => import("./RadarChart"), { ssr: false, loading: () => <p className="py-12 text-center text-sm text-muted-foreground">Loading chart…</p> });
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000";

type DomainResult = { score: number | null; game_count: number; game_ids: string[]; confidence: string };
type GameResultRow = {
  record_id?: string; game_id: string; game_name: string; primary_domain: CognitiveDomain;
  secondary_domains?: CognitiveDomain[]; score: number; accuracy: number | null;
  correct_answers: number | null; total_questions: number | null; incorrect_answers: number | null;
  attempts: number | null; missed_targets: number | null; false_selections: number | null;
  reaction_time_ms: number | null; completion_time_seconds: number | null;
  difficulty_level: string | number | null; completed: boolean; completed_at: string;
  breakdown?: Record<string, unknown>;
};
type SessionReport = {
  session_id: string; status: "complete" | "partial" | "empty"; started_at: string | null;
  completed_at: string | null; duration_seconds: number | null; games_completed: number;
  games_available: number; missing_games: string[]; overall_observed_score: number | null;
  domains: Record<CognitiveDomain, DomainResult>; games: GameResultRow[];
  aggregation_method: string; interpretation: string;
};

function formatPercent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "Not measured" : `${Math.round(value * 100)}%`;
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "Not available";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins ? `${mins} min ${secs} sec` : `${secs} sec`;
}

function exportCsv(report: SessionReport) {
  const headers = ["Game", "Primary domain", "Score", "Accuracy", "Correct", "Questions", "Incorrect", "Attempts", "Missed targets", "False selections", "Reaction time ms", "Duration seconds", "Difficulty", "Completed at"];
  const rows = report.games.map((game) => [
    game.game_name, game.primary_domain, game.score, game.accuracy == null ? "" : Math.round(game.accuracy * 100),
    game.correct_answers ?? "", game.total_questions ?? "", game.incorrect_answers ?? "", game.attempts ?? "",
    game.missed_targets ?? "", game.false_selections ?? "", game.reaction_time_ms ?? "",
    game.completion_time_seconds ?? "", game.difficulty_level ?? "", game.completed_at,
  ]);
  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cogniconnect-session-${report.session_id}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function gameTitle(gameId: string) {
  return cognitiveGameRegistry.find((game) => game.id === gameId)?.title || gameId;
}

function observedNotes(domain: CognitiveDomain, rows: GameResultRow[]) {
  if (!rows.length) return "No activity in this domain was completed in this session.";
  return rows.map((game) => {
    if (game.correct_answers != null && game.total_questions != null) {
      const incorrect = game.incorrect_answers ?? Math.max(0, game.total_questions - game.correct_answers);
      return `${game.game_name}: ${game.correct_answers} of ${game.total_questions} correct${incorrect ? `; ${incorrect} incorrect` : "; no incorrect answers recorded"}.`;
    }
    if (game.missed_targets != null || game.false_selections != null) {
      return `${game.game_name}: ${game.missed_targets ?? 0} missed targets and ${game.false_selections ?? 0} false selections.`;
    }
    return `${game.game_name}: observed score ${game.score}/100.`;
  }).join(" ");
}

export default function ReportsPage() {
  const [history, setHistory] = useState<ActivitySession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [report, setReport] = useState<SessionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      setReport(null);
      setLoading(false);
      return;
    }
    setSelectedSessionId(sessionId);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/reports/session/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`The report service returned ${response.status}.`);
      setReport(await response.json());
    } catch (cause) {
      setReport(null);
      setError(cause instanceof Error ? cause.message : "Could not load this session report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const availableSessions = readSessionHistory();
    setHistory(availableSessions);
    const querySession = new URLSearchParams(window.location.search).get("session_id");
    const active = readActiveSession();
    const preferred = querySession || active?.session_id || availableSessions[0]?.session_id || "";
    void loadReport(preferred);
  }, [loadReport]);

  const scores = useMemo(() => Object.fromEntries(COGNITIVE_DOMAINS.map((domain) => [domain, report?.domains?.[domain]?.score ?? null])) as Record<CognitiveDomain, number | null>, [report]);
  const reportRows = report?.games || [];

  return <>
    <Nav />
    <main className="flex min-h-screen w-screen items-start justify-center overflow-x-hidden pt-24 print:pt-0">
      <div className="w-full max-w-screen-lg px-4 pb-12 print:max-w-none">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-sm font-medium uppercase tracking-wide text-primary print:hidden">Observed activity summary</p><h1 className="mt-1 text-3xl font-bold">Cognitive Performance Report</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">This report summarizes completed activities from one session. Missing activities and domains with no observations remain unscored.</p></div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={() => selectedSessionId && void loadReport(selectedSessionId)} disabled={!selectedSessionId || loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
            {report && report.games.length > 0 && <>
              <Button variant="outline" onClick={() => exportCsv(report)}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
              <Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print report</Button>
            </>}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            {loading ? <Card className="p-8 text-center text-muted-foreground">Loading session report…</Card> : error ? <Card className="p-6" role="alert"><h2 className="font-semibold">Report unavailable</h2><p className="mt-2 text-sm text-muted-foreground">{error}</p></Card> : !report || report.status === "empty" ? <Card className="p-8 text-center"><h2 className="text-xl font-semibold">No completed activities in this session</h2><p className="mt-2 text-sm text-muted-foreground">Incomplete games are not recorded as zero scores. Complete an activity to create a partial report.</p><Link href="/games"><Button className="mt-5">Choose an activity</Button></Link></Card> : <>
              <Card className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Session summary</h2><p className="mt-1 text-sm text-muted-foreground">{report.started_at ? new Date(report.started_at).toLocaleString() : "Session start time not recorded"}</p></div><span className="rounded-full bg-secondary px-3 py-1 text-sm font-medium">{report.status === "complete" ? "Complete" : "Partial report"}</span></div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Summary label="Games completed" value={`${report.games_completed} / ${report.games_available}`} />
                  <Summary label="Observed overall score" value={report.overall_observed_score == null ? "Not available" : `${report.overall_observed_score}/100`} />
                  <Summary label="Session duration" value={formatDuration(report.duration_seconds)} />
                  <Summary label="Finished" value={report.completed_at ? new Date(report.completed_at).toLocaleTimeString() : "In progress"} />
                </div>
                {report.missing_games.length > 0 && <p className="mt-4 text-sm text-muted-foreground">Not completed: {report.missing_games.map(gameTitle).join(", ")}. These are not treated as zero scores.</p>}
              </Card>

              <Card className="p-5 sm:p-6">
                <h2 className="text-xl font-semibold">Domain overview</h2>
                <p className="mt-1 text-sm text-muted-foreground">Normalized scores describe performance on recorded activities, not health or clinical status.</p>
                {reportRows.length ? <>
                  <ReportRadar scores={scores} />
                  <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Text equivalent of the session radar chart</caption><thead><tr className="border-b"><th className="py-2 pr-4">Domain</th><th className="py-2 pr-4">Observed score</th><th className="py-2">Games</th></tr></thead><tbody>{COGNITIVE_DOMAINS.map((domain) => <tr key={domain} className="border-b last:border-0"><th scope="row" className="py-2 pr-4 font-medium">{domain}</th><td className="py-2 pr-4">{report.domains[domain].score == null ? "Insufficient data" : `${report.domains[domain].score}/100`}</td><td className="py-2">{report.domains[domain].game_count || "—"}</td></tr>)}</tbody></table></div>
                </> : <p className="py-8 text-center text-sm text-muted-foreground">The chart needs at least one completed activity. No scores are filled in for missing domains.</p>}
              </Card>

              <section aria-labelledby="domain-analysis-heading">
                <h2 id="domain-analysis-heading" className="mb-3 text-xl font-semibold">Domain-wise observations</h2>
                <div className="grid gap-3 md:grid-cols-2">{COGNITIVE_DOMAINS.map((domain) => {
                  const result = report.domains[domain];
                  const rows = reportRows.filter((game) => game.primary_domain === domain || game.secondary_domains?.includes(domain));
                  return <Card key={domain} className="p-5"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{domain}</h3><span className="text-lg font-semibold">{result.score == null ? "—" : `${result.score}/100`}</span></div><p className="mt-1 text-xs text-muted-foreground">{result.game_count} contributing game{result.game_count === 1 ? "" : "s"} · {result.confidence}</p><p className="mt-3 text-sm leading-relaxed">{observedNotes(domain, rows)}</p>{result.game_count === 1 && <p className="mt-3 text-xs text-muted-foreground">Limited observations: one activity contributes to this session score.</p>}</Card>;
                })}</div>
              </section>

              <Card className="p-5 sm:p-6">
                <h2 className="text-xl font-semibold">Completed activity details</h2>
                <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b"><th className="py-2 pr-3">Activity</th><th className="py-2 pr-3">Primary domain</th><th className="py-2 pr-3">Score</th><th className="py-2 pr-3">Accuracy</th><th className="py-2 pr-3">Attempts / errors</th><th className="py-2 pr-3">Response time</th><th className="py-2">Difficulty</th></tr></thead><tbody>{reportRows.map((game) => <tr key={game.record_id || `${game.game_id}-${game.completed_at}`} className="border-b last:border-0"><th scope="row" className="py-3 pr-3 font-medium">{game.game_name}</th><td className="py-3 pr-3">{game.primary_domain}</td><td className="py-3 pr-3">{game.score}/100</td><td className="py-3 pr-3">{formatPercent(game.accuracy)}</td><td className="py-3 pr-3">{game.attempts == null && game.incorrect_answers == null && game.false_selections == null ? "Not measured" : `${game.attempts ?? "—"} / ${game.incorrect_answers ?? game.false_selections ?? 0}`}</td><td className="py-3 pr-3">{game.reaction_time_ms == null ? "Not measured" : `${game.reaction_time_ms} ms`}</td><td className="py-3">{game.difficulty_level ?? "Not recorded"}</td></tr>)}</tbody></table></div>
              </Card>
            </>}

            <Card className="border-muted p-5 text-sm leading-relaxed"><h2 className="font-semibold">About Memory and Recognition</h2><p className="mt-2">Memory and Recognition are separate reporting dimensions. A task may involve both, but its result is assigned according to what the user actually did: open-ended recall contributes to Memory, while selecting a familiar person or matching a name contributes to Recognition and Orientation. A future My Day Recall activity can record separate task modes rather than copying one score into both domains.</p></Card>

            <Card className="border-muted p-5 text-sm leading-relaxed"><h2 className="font-semibold">Important note</h2><p className="mt-2">This report summarizes performance on activities completed in CogniConnect. It is intended to support engagement and observation, not to diagnose Alzheimer's disease, dementia, or cognitive impairment. Results can vary with fatigue, familiarity, mood, and other factors. Consult a qualified healthcare professional for clinical assessment.</p></Card>
          </div>

          <aside className="print:hidden">
            <Card className="p-5"><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Session history</h2><Link href="/games" className="text-sm text-primary underline">Games</Link></div>{history.length ? <ul className="mt-3 space-y-2">{history.map((item) => <li key={item.session_id}><button type="button" onClick={() => void loadReport(item.session_id)} aria-current={selectedSessionId === item.session_id ? "true" : undefined} className={`w-full rounded-md border px-3 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedSessionId === item.session_id ? "border-primary bg-primary/5" : "border-border"}`}><span className="block font-medium">{new Date(item.started_at).toLocaleDateString()}</span><span className="mt-1 block text-xs text-muted-foreground">{item.ended_at ? "Ended" : "Active or partial"} · {item.session_id.slice(0, 8)}</span></button></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Sessions started in this browser will appear here. Legacy scores without a session ID remain in the existing performance history but are not combined into a new report.</p>}</Card>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Patient login is not implemented in this application. Session reports are scoped by unguessable session IDs and this local session list; add authenticated patient authorization before exposing this API to shared or public deployments.</p>
          </aside>
        </div>
      </div>
    </main>
  </>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-secondary p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-semibold">{value}</p></div>;
}
