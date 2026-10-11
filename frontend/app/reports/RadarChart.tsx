"use client";

import {
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
} from "chart.js";
import { Radar } from "react-chartjs-2";
import { COGNITIVE_DOMAINS, type CognitiveDomain } from "@/lib/games";

ChartJS.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export default function RadarChart({ scores }: { scores: Record<CognitiveDomain, number | null> }) {
  return <div className="mx-auto w-full max-w-xl" aria-label="Radar chart of observed scores for the current session">
    <Radar
      data={{
        labels: [...COGNITIVE_DOMAINS],
        datasets: [{
          label: "Observed task performance",
          data: COGNITIVE_DOMAINS.map((domain) => scores[domain]),
          backgroundColor: "rgba(37, 99, 235, 0.16)",
          borderColor: "rgb(37, 99, 235)",
          pointBackgroundColor: "rgb(37, 99, 235)",
          pointBorderColor: "#fff",
          pointHoverBackgroundColor: "#fff",
          pointHoverBorderColor: "rgb(37, 99, 235)",
          spanGaps: false,
        }],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: true }, tooltip: { callbacks: { label: (context) => context.raw == null ? "No completed activity" : ` ${context.raw}% observed score` } } },
        scales: { r: { min: 0, max: 100, beginAtZero: true, ticks: { stepSize: 20, callback: (value) => `${value}%` }, pointLabels: { font: { size: 13 } } } },
      }}
    />
  </div>;
}
