"use client";

import React, { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Button } from "@/components/ui/button";
import { Brain } from "lucide-react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface ScoreEntry {
  score: number;
  date?: string;
  timestamp?: string;
  breakdown?: {
    activity1_faceRecognition?: number | null;
    activity2_namePeople?: number | null;
    activity3_contextQuestions?: number | null;
  };
}

interface ChartPoint {
  x: string;
  y: number;
  breakdown?: {
    activity1_faceRecognition?: number | null;
    activity2_namePeople?: number | null;
    activity3_contextQuestions?: number | null;
  };
}

export default function Graph() {
  const router = useRouter();
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"attempts" | "weekly">("attempts");

  useEffect(() => {
    const fetchPerformanceData = async () => {
      try {
        const response = await fetch(`${API_URL}/performance`);
        const data = await response.json();
        if (data.scores && Array.isArray(data.scores)) {
          setScores(data.scores);
        }
      } catch (error) {
        console.error("Error fetching performance data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPerformanceData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center py-12">
        <p className="animate-pulse text-sm text-muted-foreground">Loading memory trends...</p>
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Brain className="h-6 w-6" />
        </div>
        <div>
          <h4 className="text-base font-medium">No Quiz History Yet</h4>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Complete your daily memory quiz to start tracking performance trends over time.
          </p>
        </div>
        <Button size="sm" onClick={() => router.push("/quiz")} className="mt-1">
          Start Quiz Now
        </Button>
      </div>
    );
  }

  const processChartData = () => {
    const sortedScores = [...scores].sort((a, b) => {
      const dA = new Date(a.timestamp || a.date || 0).getTime();
      const dB = new Date(b.timestamp || b.date || 0).getTime();
      return dA - dB;
    });

    if (viewMode === "attempts" || sortedScores.length <= 7) {
      const labels = sortedScores.map((s, idx) => {
        const d = s.date || s.timestamp;
        if (d) {
          const parsed = new Date(d);
          if (!isNaN(parsed.getTime())) {
            return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
          }
        }
        return `Quiz ${idx + 1}`;
      });

      const dataPoints: ChartPoint[] = sortedScores.map((s, idx) => ({
        x: labels[idx],
        y: s.score,
        breakdown: s.breakdown,
      }));

      return {
        labels,
        datasets: [
          {
            label: "Memory Score",
            data: dataPoints,
            borderColor: "rgb(37, 99, 235)",
            backgroundColor: "rgba(37, 99, 235, 0.12)",
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: "rgb(37, 99, 235)",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
          },
        ],
      };
    } else {
      const weekMap: { [key: string]: { totalScore: number; count: number } } = {};

      sortedScores.forEach((s) => {
        const d = new Date(s.timestamp || s.date || Date.now());
        const year = d.getFullYear();
        const firstJan = new Date(year, 0, 1);
        const dayOfYear = Math.floor((d.getTime() - firstJan.getTime()) / (24 * 60 * 60 * 1000));
        const weekNum = Math.ceil((dayOfYear + firstJan.getDay() + 1) / 7);
        const key = `W${weekNum} (${d.toLocaleDateString("en-US", { month: "short" })})`;

        if (!weekMap[key]) {
          weekMap[key] = { totalScore: 0, count: 0 };
        }
        weekMap[key].totalScore += s.score;
        weekMap[key].count += 1;
      });

      const labels = Object.keys(weekMap);
      const dataPoints: ChartPoint[] = labels.map((key) => {
        const item = weekMap[key];
        return {
          x: key,
          y: Math.round(item.totalScore / item.count),
        };
      });

      return {
        labels,
        datasets: [
          {
            label: "Weekly Avg Memory Score",
            data: dataPoints,
            borderColor: "rgb(37, 99, 235)",
            backgroundColor: "rgba(37, 99, 235, 0.12)",
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: "rgb(37, 99, 235)",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
          },
        ],
      };
    }
  };

  const chartData = processChartData();

  return (
    <div className="flex h-full w-full flex-1 flex-col pt-1">
      {scores.length > 7 && (
        <div className="mb-2 flex justify-end gap-2">
          <button
            onClick={() => setViewMode("attempts")}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              viewMode === "attempts"
                ? "bg-primary font-medium text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            All Attempts
          </button>
          <button
            onClick={() => setViewMode("weekly")}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              viewMode === "weekly"
                ? "bg-primary font-medium text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Weekly Averages
          </button>
        </div>
      )}
      <div className="relative flex-1 w-full min-h-[220px]">
        <Line
          options={{
            plugins: {
              tooltip: {
                enabled: true,
                padding: 10,
                cornerRadius: 8,
                callbacks: {
                  label: function (context: any) {
                    const rawPoint = context.raw as ChartPoint;
                    const score = context.parsed.y;
                    const result: string[] = [`Overall Score: ${score}%`];
                    if (rawPoint && rawPoint.breakdown) {
                      const bd = rawPoint.breakdown;
                      if (bd.activity1_faceRecognition != null) {
                        result.push(`• Face Recognition: ${bd.activity1_faceRecognition}%`);
                      }
                      if (bd.activity2_namePeople != null) {
                        result.push(`• Name Recall: ${bd.activity2_namePeople}%`);
                      }
                      if (bd.activity3_contextQuestions != null) {
                        result.push(`• Context QA: ${bd.activity3_contextQuestions}%`);
                      }
                    }
                    return result;
                  },
                },
              },
              legend: {
                display: false,
              },
            },
            responsive: true,
            maintainAspectRatio: false,
            elements: {
              line: {
                tension: 0.35,
              },
            },
            scales: {
              x: {
                grid: {
                  display: false,
                },
                ticks: {
                  font: {
                    size: 11,
                  },
                },
              },
              y: {
                grid: {
                  color: "rgba(0, 0, 0, 0.06)",
                },
                min: 0,
                max: 100,
                ticks: {
                  stepSize: 20,
                  callback: function (value) {
                    return value + "%";
                  },
                  font: {
                    size: 11,
                  },
                },
                title: {
                  display: true,
                  text: "Score (%)",
                  font: {
                    size: 11,
                    weight: "bold",
                  },
                },
              },
            },
          }}
          data={chartData}
        />
      </div>
    </div>
  );
}

