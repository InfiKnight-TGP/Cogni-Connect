"use client";

import Nav from "@/components/nav";
import { GAME_REGISTRY, getGameById, type GameRegistryEntry } from "@/components/games/registry";
import { apiFetch, API_URL } from "@/lib/api";
import { addDays, format, startOfWeek } from "date-fns";
import Link from "next/link";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslate, usePreferences } from "@/components/interaction/InteractionProvider";
import ReadAloud from "@/components/interaction/ReadAloud";
import { useAuth } from "@/lib/auth-context";
import ProgressSummary from "@/components/caregiver/progressSummary";
import ProgressContent, { useTrendNotes } from "@/components/caregiver/progressContent";
import ActivityLog from "@/components/caregiver/activityLog";
import {
  AREAS,
  dayKey,
  starsFor,
  toEntries,
  patientStatsFromEntries,
  type Area,
  type Entry,
} from "@/lib/progress";
import {
  calcAreaStars,
  calcBadges,
  calcTodayGoal,
  calcWeekStrip,
  formatLocalDate,
  getGreeting,
  getNextSuggestion,
  mergeBadges,
  badgesToCelebrate,
  shouldCelebrateGoal,
  plural,
  SKILL_FRIENDLY_NAMES,
  type Badge,
  type DayCard,
  type RawScoreRecord,
  type SkillStarInfo,
  type TodayGoalInfo,
} from "@/lib/self-progress";

interface ScoreEntry {
  date?: string;
  timestamp?: string;
  score: number;
  game_id?: string;
  gameId?: string;
  source?: string;
  area?: Area;
}

const FRIENDLY_NAMES: Record<string, string> = {
  daily_recall: "My Day",
  "story-builder": "Story Time",
  "plan-the-day": "Plan My Day",
  "word-association": "Word Pairs",
  "odd-one-out": "Spot the Odd One",
  "mole-path": "Path Memory",
  "sorting-station": "Sorting",
  "whack-a-mole": "Quick Tap",
  "attention-hunt": "Find It",
  "map-navigator": "Find the Way",
  "face-recognition": "Face Recognition",
  "context-recall": "Relive Memories",
};

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const AREA_ICONS: Record<Area, string> = {
  Memory: "🧠",
  Attention: "🎯",
  "Executive Function": "📋",
  "Recognition & Orientation": "🧭",
};

const BADGE_ICONS: Record<Badge["id"], string> = {
  first_step: "👟",
  streak_3: "🔥",
  all_skills_week: "🌟",
  face_finder: "👤",
  explorer: "🧭",
};

export default function MyProgressPage() {
  const { t } = useTranslate();
  const { session, ready } = useAuth();

  if (!ready) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-screen-lg px-4 pb-16 pt-28 lg:pt-8">
          <p className="text-2xl font-medium">{t("Loading…")}</p>
        </main>
      </>
    );
  }

  if (session?.role === "self") {
    return <SelfProgressView />;
  }

  return <PatientSimpleProgressView />;
}

/**
 * Redesigned self-care progress page:
 * Warm, encouraging, high-contrast, soft colors, and no raw numbers or clinical jargon.
 */
function SelfProgressView() {
  const { t } = useTranslate();
  const tRef = useRef(t);
  tRef.current = t;
  const { session } = useAuth();
  const { effectiveAnimations, reducedMotion } = usePreferences();
  const [showTrendNotes, setShowTrendNotes] = useTrendNotes();

  const [loading, setLoading] = useState(true);
  const [allScores, setAllScores] = useState<RawScoreRecord[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [streak, setStreak] = useState(0);
  const [planIds, setPlanIds] = useState<string[] | null>(null);
  const [completedTodayIds, setCompletedTodayIds] = useState<string[]>([]);
  const [storedEarnedBadgeIds, setStoredEarnedBadgeIds] = useState<string[]>([]);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(null);
  const [celebratedGoalDate, setCelebratedGoalDate] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"summary" | "trends" | "difficulty" | "log" | "report">("summary");

  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const goalCelebrationTriggeredRef = useRef(false);
  const todayStr = useMemo(() => dayKey(new Date()), []);
  const patientKey = session?.activePatient?.id || session?.user?.id || "self";
  const badgeStorageKey = `cogni_celebrated_badges_${patientKey}`;
  const goalStorageKey = `cogni_celebrated_goal_${patientKey}`;

  const closeCelebration = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setCelebrationMessage(null);
  }, []);

  // Timer & Escape listener effect keyed only on celebrationMessage and closeCelebration
  useEffect(() => {
    if (!celebrationMessage) return;

    hideTimerRef.current = setTimeout(() => {
      setCelebrationMessage(null);
      hideTimerRef.current = null;
    }, 3000);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeCelebration();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [celebrationMessage, closeCelebration]);

  const loadData = useCallback(async () => {
    try {
      const [perfRes, planRes] = await Promise.all([
        apiFetch(`${API_URL}/performance`),
        apiFetch(`${API_URL}/daily-plan?date=${todayStr}`),
      ]);

      let rawPerf: { scores?: ScoreEntry[]; game_scores?: ScoreEntry[] } = {};
      if (perfRes.ok) {
        rawPerf = await perfRes.json();
      }

      const unifiedScores: ScoreEntry[] = [
        ...((rawPerf.scores as ScoreEntry[]) ?? []).map((s) => ({ ...s, game_id: "daily_recall" })),
        ...((rawPerf.game_scores as ScoreEntry[]) ?? []),
      ];
      setAllScores(unifiedScores as RawScoreRecord[]);

      const normEntries = toEntries(rawPerf);
      setEntries(normEntries);

      const stats = patientStatsFromEntries(normEntries, new Date());
      setStreak(stats.streak);

      if (planRes.ok) {
        const planData = await planRes.json();
        const pIds = [1, 2, 3].flatMap((level) =>
          Array.isArray(planData[`level${level}`]) ? planData[`level${level}`] : []
        );
        setPlanIds(pIds);
      } else {
        setPlanIds([]);
      }

      // Completed today
      const todayEntries = normEntries.filter((e) => e.day === todayStr && e.gameId);
      const todayDoneSet = new Set(todayEntries.map((e) => e.gameId));
      setCompletedTodayIds(Array.from(todayDoneSet));

      // Badges storage
      try {
        const stored = localStorage.getItem(badgeStorageKey);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setStoredEarnedBadgeIds(parsed);
          }
        }
      } catch {
        // Storage unavailable: keep empty
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, [badgeStorageKey, todayStr]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Calculations
  const playedDates = useMemo(() => {
    return new Set(
      allScores
        .filter((s) => s.source !== "caregiver" && (s.game_id || s.gameId))
        .map((s) => s.date || s.timestamp?.slice(0, 10))
        .filter((d): d is string => Boolean(d && d.length === 10))
    );
  }, [allScores]);

  const weekDays: DayCard[] = useMemo(
    () => calcWeekStrip(playedDates, todayStr),
    [playedDates, todayStr]
  );

  const weekStartStr = weekDays[0]?.dateStr ?? todayStr;
  const weekEndStr = weekDays[6]?.dateStr ?? todayStr;

  const areaStars: Record<Area, SkillStarInfo> = useMemo(
    () => calcAreaStars(entries, weekStartStr, weekEndStr),
    [entries, weekStartStr, weekEndStr]
  );

  const rawBadges: Badge[] = useMemo(
    () => calcBadges(allScores, weekStartStr, weekEndStr),
    [allScores, weekStartStr, weekEndStr]
  );

  const badges: Badge[] = useMemo(
    () => mergeBadges(rawBadges, storedEarnedBadgeIds),
    [rawBadges, storedEarnedBadgeIds]
  );

  // Today goal
  const goal: TodayGoalInfo = useMemo(
    () => calcTodayGoal(planIds, completedTodayIds),
    [completedTodayIds, planIds]
  );

  const nextGameHref = useMemo(() => {
    if (!goal.nextActivityId) return "/today";
    if (goal.nextActivityId === "daily_recall") return "/today";
    return `/games?game=${goal.nextActivityId}`;
  }, [goal.nextActivityId]);

  // Celebration effect: badges and daily goal
  useEffect(() => {
    if (loading) return;

    let storageAvailable = true;
    let storedBadgeIds: string[] | null = null;
    let storedGoalDate: string | null = null;

    try {
      const raw = localStorage.getItem(badgeStorageKey);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) storedBadgeIds = parsed;
      }
      storedGoalDate = localStorage.getItem(goalStorageKey);
    } catch {
      storageAvailable = false;
    }

    // If localStorage is unavailable, never celebrate.
    if (!storageAvailable) return;

    const earnedBadgeIds = badges.filter((b) => b.earned).map((b) => b.id);

    // 1. When storedBadgeIds is null (key was never written), seed silently (existing history never celebrates)
    if (storedBadgeIds === null) {
      try {
        localStorage.setItem(badgeStorageKey, JSON.stringify(earnedBadgeIds));
        setStoredEarnedBadgeIds(earnedBadgeIds);
      } catch {
        // ignore
      }
    } else {
      const toCelebrate = badgesToCelebrate(earnedBadgeIds, storedBadgeIds);
      if (toCelebrate.length > 0) {
        // Persist the new ids BEFORE showing the popup
        const updated = Array.from(new Set([...storedBadgeIds, ...toCelebrate]));
        try {
          localStorage.setItem(badgeStorageKey, JSON.stringify(updated));
          setStoredEarnedBadgeIds(updated);
        } catch {
          // ignore
        }
        const badgeObj = badges.find((b) => b.id === toCelebrate[0]);
        const title = badgeObj ? tRef.current(badgeObj.title) : "";
        setCelebrationMessage(tRef.current("New badge: {title}!", { title }));
        return;
      }
    }

    // 2. Finishing the day's goal: "All done today, well done!" shown at most once per day (store date per patient)
    const effectiveGoalDate = celebratedGoalDate || storedGoalDate;
    if (
      shouldCelebrateGoal(goal.allDone, effectiveGoalDate, todayStr) &&
      !goalCelebrationTriggeredRef.current
    ) {
      goalCelebrationTriggeredRef.current = true;
      try {
        localStorage.setItem(goalStorageKey, todayStr);
      } catch {
        // ignore
      }
      setCelebratedGoalDate(todayStr);
      setCelebrationMessage(tRef.current("All done today, well done!"));
    }
  }, [badges, badgeStorageKey, celebratedGoalDate, goal.allDone, goalStorageKey, loading, todayStr]);

  // Week's best activity
  const bestGame = useMemo(() => {
    const weekScores = entries.filter((e) => e.day >= weekStartStr && e.day <= weekEndStr);
    if (weekScores.length === 0) return null;
    let best = weekScores[0];
    for (const s of weekScores) {
      if (s.score > best.score) best = s;
    }
    const name =
      (best.gameId && FRIENDLY_NAMES[best.gameId]) ||
      (best.gameId && getGameById(best.gameId)?.name) ||
      "Activity";
    return {
      name,
      stars: starsFor(best.score),
    };
  }, [entries, weekEndStr, weekStartStr]);

  // Suggested game
  const weekPlayedAreas = useMemo(() => {
    const areas = new Set<Area>();
    for (const a of AREAS) {
      if (areaStars[a]?.played) areas.add(a);
    }
    return areas;
  }, [areaStars]);

  const suggestedGame = useMemo(
    () => getNextSuggestion(weekPlayedAreas, GAME_REGISTRY),
    [weekPlayedAreas]
  );

  const totalPlayedEver = playedDates.size;
  const userName = session?.user?.name || session?.activePatient?.name || "";
  const greeting = getGreeting(userName);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-screen-lg space-y-8 px-4 pb-20 pt-28 lg:pt-8">
        {/* Celebration popup / banner */}
        {celebrationMessage && (
          effectiveAnimations && !reducedMotion ? (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={celebrationMessage}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/40 backdrop-blur-sm"
            >
              <div className="relative flex flex-col items-center gap-4 rounded-3xl border-2 border-amber-400 bg-card p-8 shadow-2xl text-center max-w-md w-full">
                <span className="text-6xl animate-bounce" aria-hidden>🎉</span>
                <h3 className="text-2xl font-bold text-foreground">{celebrationMessage}</h3>
                <p className="text-base text-muted-foreground">
                  {t("Earned from your completed daily activities.")}
                </p>
                <button
                  type="button"
                  onClick={closeCelebration}
                  className="mt-2 min-h-12 rounded-xl bg-primary px-6 py-2 text-base font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary shadow-sm"
                  aria-label={t("Close")}
                >
                  {t("Close")}
                </button>
              </div>
            </div>
          ) : (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-between gap-4 rounded-2xl border-2 border-primary/30 bg-primary/10 p-4 text-foreground shadow-sm"
            >
              <span className="text-lg font-bold">{celebrationMessage}</span>
              <button
                type="button"
                onClick={closeCelebration}
                className="min-h-10 rounded-lg border border-border bg-card px-4 py-1 text-sm font-bold hover:bg-muted"
                aria-label={t("Close")}
              >
                {t("Close")}
              </button>
            </div>
          )
        )}

        {/* 1. Header */}
        <header className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-foreground">
                {userName ? t("Hello, {name}!", { name: userName.split(" ")[0] }) : t("Hello!")}
              </h1>
              <p className="mt-1 text-2xl font-medium text-muted-foreground">
                {t("Here is your week.")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-2 rounded-2xl border-2 border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xl font-bold text-amber-700 dark:text-amber-300"
                aria-label={t("Streak: {streak}", {
                  streak: streak > 0 ? plural(streak, t("day in a row"), t("days in a row")) : t("Start your streak today!"),
                })}
              >
                <span className="text-2xl" aria-hidden>🔥</span>
                <span>{streak > 0 ? plural(streak, t("day in a row"), t("days in a row")) : t("Start your streak today!")}</span>
              </div>
            </div>
          </div>
          <ReadAloud
            autoRead={false}
            text={`${greeting.title}. ${t("Here is your week.")}. ${plural(streak, t("day in a row"), t("days in a row"))}.`}
          />
        </header>

        {loading ? (
          <p className="text-2xl font-medium">{t("Loading your progress…")}</p>
        ) : (
          <div className="space-y-8">
            {/* 2. Today's Goal */}
            <section
              aria-label={t("Today’s goal")}
              className="rounded-3xl border-2 border-primary/30 bg-card p-6 shadow-sm sm:p-8 space-y-6"
            >
              <h2 className="text-2xl font-bold sm:text-3xl text-foreground">
                {t("Today’s goal")}
              </h2>

              {totalPlayedEver === 0 ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 rounded-2xl border border-primary/20 bg-primary/5 p-6">
                  <div>
                    <h3 className="text-2xl font-bold text-foreground">
                      {t("Let’s start with one activity")}
                    </h3>
                    <p className="mt-1 text-lg text-muted-foreground">
                      {t("A fun week of brain games and memory activities is waiting for you.")}
                    </p>
                  </div>
                  <Link
                    href={nextGameHref}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-primary px-8 py-3 text-xl font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary shadow-sm"
                  >
                    {t("Play")}
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8 justify-between">
                  <div className="flex items-center gap-6">
                    <ProgressRing done={goal.done} total={goal.total} />
                    <div className="space-y-1">
                      {goal.allDone ? (
                        <>
                          <p className="text-2xl sm:text-3xl font-extrabold text-foreground">
                            {t("All done today, well done!")} ⭐
                          </p>
                          <p className="text-lg text-muted-foreground">
                            {t("Great effort! Practicing through the week keeps your memory sharp and energized.")}
                          </p>
                        </>
                      ) : streak === 1 && totalPlayedEver > 1 ? (
                        <>
                          <p className="text-2xl sm:text-3xl font-extrabold text-foreground">
                            {t("Welcome back!")}
                          </p>
                          <p className="text-lg text-muted-foreground">
                            {t("{done} of {total} done today", {
                              done: goal.done,
                              total: goal.total,
                            })}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-2xl sm:text-3xl font-extrabold text-foreground">
                            {t("{done} of {total} done today", {
                              done: goal.done,
                              total: goal.total,
                            })}
                          </p>
                          <p className="text-lg text-muted-foreground">
                            {t("Earned from your completed daily activities.")}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {!goal.allDone && (
                    <Link
                      href={nextGameHref}
                      className="inline-flex min-h-[48px] w-full sm:w-auto items-center justify-center rounded-2xl bg-primary px-8 py-3 text-xl font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary shadow-sm"
                    >
                      {t("Play next")} →
                    </Link>
                  )}
                </div>
              )}
            </section>

            {/* 3. Your Week */}
            <section
              aria-label={t("Your week")}
              className="rounded-3xl border-2 border-primary/30 bg-card p-6 shadow-sm sm:p-8 space-y-6"
            >
              <h2 className="text-2xl font-bold sm:text-3xl text-foreground">
                {t("Your week")}
              </h2>

              <div className="grid grid-cols-7 gap-2 sm:gap-4">
                {weekDays.map((card) => {
                  return (
                    <div
                      key={card.dayName}
                      className={`flex flex-col items-center justify-center gap-3 rounded-2xl border p-3 sm:p-4 text-center transition-all ${
                        card.isToday
                          ? "border-2 border-primary bg-primary/10 shadow-sm"
                          : card.isFuture
                          ? "border-border/50 bg-background/30 opacity-60"
                          : "border-border bg-background/60"
                      }`}
                    >
                      <span className="max-w-full break-words text-center text-sm font-bold text-foreground sm:text-xl">
                        {t(card.dayName)}
                      </span>
                      <div
                        className={`flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full text-2xl font-bold shadow-sm ${
                          card.played
                            ? "bg-amber-400 text-amber-950 dark:bg-amber-500 dark:text-amber-950"
                            : card.isToday
                            ? "border-2 border-primary/40 bg-card text-muted-foreground"
                            : "border-2 border-dashed border-muted-foreground/30 text-muted-foreground/40"
                        }`}
                        aria-label={`${t(card.dayName)}: ${t(card.played ? "Played" : "Not played")}`}
                      >
                        {card.played ? "⭐" : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 4. Your Four Skills */}
            <section
              aria-label={t("Your four skills")}
              className="space-y-4"
            >
              <h2 className="text-2xl font-bold sm:text-3xl text-foreground">
                {t("Your four skills")}
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {AREAS.map((area) => {
                  const info = areaStars[area];
                  const game = GAME_REGISTRY.find(
                    (g) => g.area === area && !g.comingSoon && g.component
                  );
                  const playHref = game ? `/games?game=${game.id}` : "/today";

                  return (
                    <div
                      key={area}
                      className="flex flex-col justify-between rounded-2xl border-2 border-border bg-card p-6 shadow-sm space-y-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="text-3xl sm:text-4xl" aria-hidden>
                            {AREA_ICONS[area]}
                          </span>
                          <div>
                            <h3 className="text-xl font-bold text-foreground">
                              {t(SKILL_FRIENDLY_NAMES[area].title)}
                            </h3>
                            <p className="text-sm font-medium text-muted-foreground">
                              {t(SKILL_FRIENDLY_NAMES[area].subtitle)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {info?.played ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="text-2xl text-amber-500"
                            aria-label={plural(info.stars, t("star"), t("stars"))}
                          >
                            {"★".repeat(info.stars)}
                            {"☆".repeat(Math.max(0, 3 - info.stars))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                          <p className="text-base text-muted-foreground">
                            {t("Not played yet. Try one today!")}
                          </p>
                          <Link
                            href={playHref}
                            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-primary bg-primary/10 px-5 py-2 text-base font-semibold text-primary hover:bg-primary/20"
                          >
                            {t("Play")}
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 5. Badges */}
            <section
              aria-label={t("Badges")}
              className="rounded-3xl border-2 border-primary/30 bg-card p-6 shadow-sm sm:p-8 space-y-6"
            >
              <h2 className="text-2xl font-bold sm:text-3xl text-foreground">
                {t("Badges")}
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {badges.map((badge) => {
                  const icon = BADGE_ICONS[badge.id] || "🎖️";
                  return (
                    <div
                      key={badge.id}
                      className={`flex items-start gap-4 rounded-2xl border-2 p-5 transition-all ${
                        badge.earned
                          ? "border-amber-500/40 bg-amber-500/10 shadow-sm"
                          : "border-border bg-background/50 opacity-70"
                      }`}
                    >
                      <div
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${
                          badge.earned
                            ? "bg-amber-400/30 text-amber-900 dark:text-amber-200"
                            : "bg-muted text-muted-foreground grayscale"
                        }`}
                        aria-hidden
                      >
                        {icon}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-foreground">
                            {t(badge.title)}
                          </h3>
                          {badge.earned && (
                            <span className="text-sm font-extrabold text-amber-600 dark:text-amber-400">
                              ✓
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {t(badge.hint)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 6. Your Best This Week & 7. Try Something New */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {/* 6. Best Activity */}
              <div className="flex flex-col justify-between rounded-3xl border-2 border-primary/30 bg-primary/10 p-6 sm:p-8 space-y-4">
                <span className="text-xl font-bold uppercase tracking-wider text-primary">
                  {t("Your best this week")}
                </span>
                {bestGame ? (
                  <div className="space-y-2">
                    <p className="text-3xl sm:text-4xl font-bold text-foreground">
                      {t(bestGame.name)}
                    </p>
                    <div
                      className="text-3xl text-amber-500"
                      aria-label={plural(bestGame.stars, t("star"), t("stars"))}
                    >
                      {"★".repeat(bestGame.stars)}
                    </div>
                  </div>
                ) : (
                  <p className="text-xl font-bold text-muted-foreground">
                    {t("Play an activity today to see your best!")}
                  </p>
                )}
                <p className="text-base font-medium text-muted-foreground">
                  {t("Your top performance across this week’s games.")}
                </p>
              </div>

              {/* 7. Try Something New */}
              <div className="flex flex-col justify-between rounded-3xl border-2 border-secondary bg-card p-6 sm:p-8 space-y-4">
                <span className="text-xl font-bold uppercase tracking-wider text-secondary-foreground">
                  {t("Try something new")}
                </span>
                {suggestedGame ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-4xl" aria-hidden>
                        {suggestedGame.emoji}
                      </span>
                      <div>
                        <h3 className="text-2xl font-bold text-foreground">
                          {t(suggestedGame.name)}
                        </h3>
                        <p className="text-sm font-medium text-muted-foreground">
                          {t(suggestedGame.trains || suggestedGame.description)}
                        </p>
                      </div>
                    </div>
                    <div>
                      <Link
                        href={`/games?game=${suggestedGame.id}`}
                        className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-primary px-6 py-3 text-lg font-bold text-primary-foreground hover:bg-primary/90"
                      >
                        {t("Play")}
                      </Link>
                    </div>
                  </div>
                ) : (
                  <p className="text-lg font-medium text-muted-foreground">
                    {t("Great effort! Practicing through the week keeps your memory sharp and energized.")}
                  </p>
                )}
                <p className="text-base font-medium text-muted-foreground">
                  {t("Explore a fresh activity to keep your brain active.")}
                </p>
              </div>
            </div>

            {/* 8. Details ("For you and your doctor") */}
            <details className="group rounded-3xl border-2 border-border bg-card p-6 shadow-sm sm:p-8">
              <summary className="flex cursor-pointer list-none items-center justify-between text-2xl font-bold text-foreground">
                <span>{t("For you and your doctor")}</span>
                <span
                  className="text-xl text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                  aria-hidden
                >
                  ▼
                </span>
              </summary>

              <div className="mt-6 space-y-6">
                <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-5 text-lg font-medium text-foreground">
                  {t("Scores describe activity only. They are not a clinical measure.")}
                </div>

                <label className="flex items-center gap-3 cursor-pointer text-lg font-semibold text-foreground">
                  <input
                    type="checkbox"
                    checked={showTrendNotes}
                    onChange={(e) => setShowTrendNotes(e.target.checked)}
                    className="h-5 w-5 rounded border-input text-primary focus:ring-primary"
                  />
                  <span>{t("Show detailed trend notes")}</span>
                </label>

                <section className="space-y-5" aria-label={t("Progress and reports")}>
                  <div role="tablist" className="flex flex-wrap gap-2 border-b pb-2">
                    {(
                      [
                        ["summary", "Summary"],
                        ["trends", "Trends"],
                        ["difficulty", "Difficulty"],
                        ["log", "Activity Log"],
                        ["report", "Share with doctor"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        role="tab"
                        aria-selected={detailTab === key}
                        onClick={() => setDetailTab(key)}
                        className={`min-h-12 rounded-xl px-4 text-lg font-semibold transition-colors ${
                          detailTab === key
                            ? "bg-primary text-primary-foreground"
                            : "border bg-card text-foreground hover:bg-muted"
                        }`}
                      >
                        {t(label)}
                      </button>
                    ))}
                  </div>

                  {detailTab === "summary" && <ProgressSummary audience="self" />}
                  {detailTab === "trends" && <ProgressContent audience="self" />}
                  {detailTab === "difficulty" && <ProgressContent audience="self" />}
                  {detailTab === "log" && <ActivityLog audience="self" />}
                  {detailTab === "report" && (
                    <div className="pt-2">
                      <Link
                        href="/report"
                        className="inline-flex min-h-14 items-center rounded-xl bg-primary px-6 text-lg font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        {t("Open printable report")}
                      </Link>
                    </div>
                  )}
                </section>
              </div>
            </details>
          </div>
        )}
      </main>
    </>
  );
}

/**
 * Simple progress view for paired devices and patients.
 * Retains exact existing behavior.
 */
function PatientSimpleProgressView() {
  const { t } = useTranslate();
  const [loading, setLoading] = useState(true);
  const [playedDays, setPlayedDays] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [daysCount, setDaysCount] = useState(0);
  const [totalStars, setTotalStars] = useState(0);
  const [bestGame, setBestGame] = useState<{ name: string; stars: number } | null>(null);

  const loadProgress = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/performance`);
      if (!res.ok) throw new Error();
      const perf = await res.json();

      const now = new Date();
      const monday = startOfWeek(now, { weekStartsOn: 1 });
      const weekDateStrings = Array.from({ length: 7 }, (_, i) =>
        format(addDays(monday, i), "yyyy-MM-dd")
      );

      const allScores: ScoreEntry[] = [
        ...((perf.scores as ScoreEntry[]) ?? []).map((s) => ({ ...s, game_id: "daily_recall" })),
        ...((perf.game_scores as ScoreEntry[]) ?? []),
      ];

      const daysPlayedMask = weekDateStrings.map((dayStr) =>
        allScores.some((s) => s.date === dayStr)
      );
      setPlayedDays(daysPlayedMask);
      setDaysCount(daysPlayedMask.filter(Boolean).length);

      const weekScores = allScores.filter((s) => s.date && weekDateStrings.includes(s.date));
      const starsSum = weekScores.reduce((sum, s) => sum + starsFor(s.score), 0);
      setTotalStars(starsSum);

      if (weekScores.length > 0) {
        let bestEntry = weekScores[0];
        for (const s of weekScores) {
          if (s.score > bestEntry.score) {
            bestEntry = s;
          }
        }
        const friendlyName =
          (bestEntry.game_id && FRIENDLY_NAMES[bestEntry.game_id]) ||
          (bestEntry.game_id && getGameById(bestEntry.game_id)?.name) ||
          "Activity";
        setBestGame({
          name: friendlyName,
          stars: starsFor(bestEntry.score),
        });
      } else {
        setBestGame(null);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProgress();
  }, [loadProgress]);

  const encouragingMessage = () => {
    if (daysCount >= 5) {
      return "Incredible dedication! You are keeping your mind active, bright, and strong.";
    }
    if (daysCount >= 3) {
      return "Great effort! Practicing through the week keeps your memory sharp and energized.";
    }
    if (daysCount >= 1) {
      return "Well done! Every activity you do makes a wonderful difference.";
    }
    return "Welcome! A fun week of brain games and memory activities is waiting for you.";
  };

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-screen-lg space-y-8 px-4 pb-16 pt-28 lg:pt-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold sm:text-5xl">{t("My Progress")}</h1>
          <p className="text-2xl font-medium text-muted-foreground">
            {t("A look at your activities this week")}
          </p>
          <ReadAloud
            autoRead={false}
            text={`${t("My Progress")}. ${t("A look at your activities this week")}. ${t(
              "You played {count} {days} this week!",
              { count: daysCount, days: t(daysCount === 1 ? "day" : "days") }
            )}. ${t(encouragingMessage())}`}
          />
        </header>

        {loading ? (
          <p className="text-2xl font-medium">{t("Loading your progress…")}</p>
        ) : (
          <div className="space-y-8">
            <div className="rounded-2xl border-2 border-primary/30 bg-card p-6 shadow-sm sm:p-8 space-y-6">
              <h2 className="text-2xl font-bold sm:text-3xl text-foreground">
                {t("You played {count} {days} this week!", {
                  count: daysCount,
                  days: t(daysCount === 1 ? "day" : "days"),
                })}
              </h2>

              <div className="grid grid-cols-7 gap-2 sm:gap-4">
                {DAY_NAMES.map((dayName, idx) => {
                  const played = playedDays[idx];
                  return (
                    <div
                      key={dayName}
                      className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-background/50 p-3 sm:p-4 text-center"
                    >
                      <span className="max-w-full break-words text-center text-sm font-bold text-foreground sm:text-2xl">
                        {t(dayName)}
                      </span>
                      <div
                        className={`flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full text-2xl font-bold shadow-sm ${
                          played
                            ? "bg-green-600 text-white"
                            : "border-2 border-dashed border-muted-foreground/30 text-muted-foreground/30"
                        }`}
                        aria-label={`${t(dayName)}: ${t(played ? "Played" : "Not played")}`}
                      >
                        {played ? "✓" : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="flex flex-col justify-between rounded-2xl border-2 border-amber-500/40 bg-amber-500/10 p-6 sm:p-8 space-y-3">
                <span className="text-xl font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  {t("Stars Earned This Week")}
                </span>
                <div className="flex items-center gap-3 text-4xl sm:text-5xl font-bold text-amber-600 dark:text-amber-400">
                  <span className="text-5xl sm:text-6xl" aria-hidden>
                    ⭐
                  </span>
                  <span>
                    {totalStars} {t(totalStars === 1 ? "star" : "stars")}
                  </span>
                </div>
                <p className="text-lg sm:text-xl font-medium text-amber-900/80 dark:text-amber-200">
                  {t("Earned from your completed daily activities.")}
                </p>
              </div>

              <div className="flex flex-col justify-between rounded-2xl border-2 border-primary/40 bg-primary/10 p-6 sm:p-8 space-y-3">
                <span className="text-xl font-bold uppercase tracking-wider text-primary">
                  {t("Your Best This Week")}
                </span>
                {bestGame ? (
                  <div className="space-y-2">
                    <p className="text-3xl sm:text-4xl font-bold text-foreground">
                      {t(bestGame.name)}
                    </p>
                    <div
                      className="text-3xl sm:text-4xl text-amber-500"
                      aria-label={`${bestGame.stars} ${t("stars")}`}
                    >
                      {"★".repeat(bestGame.stars)}
                    </div>
                  </div>
                ) : (
                  <p className="text-2xl font-bold text-muted-foreground">
                    {t("Play an activity today to see your best!")}
                  </p>
                )}
                <p className="text-lg sm:text-xl font-medium text-muted-foreground">
                  {t("Your top performance across this week’s games.")}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-green-500/40 bg-green-50 p-6 text-center text-2xl font-bold text-green-900 dark:bg-green-950/40 dark:text-green-100 sm:text-3xl shadow-sm">
              {t(encouragingMessage())}
            </div>

            <div className="text-center pt-2">
              <Link
                href="/today"
                className="inline-flex min-h-16 items-center justify-center rounded-2xl bg-primary px-8 text-2xl font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary"
              >
                {t("Go to Today’s Activities →")}
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

/**
 * Circular SVG progress ring.
 */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const size = 110;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.min(done / total, 1) : 0;
  const offset = circumference - progress * circumference;

  return (
    <div className="relative flex shrink-0 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90 transform">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-muted/30"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-primary transition-all duration-500 ease-out"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="transparent"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-extrabold text-foreground">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}
