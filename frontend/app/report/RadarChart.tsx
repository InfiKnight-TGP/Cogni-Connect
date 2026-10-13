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
import { useTheme } from "next-themes";
import { AREAS, buildRadarChartData, type Area } from "@/lib/progress";

ChartJS.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export { buildRadarChartData };

type Palette = { primary: string; fill: string; foreground: string; muted: string; border: string };
const LIGHT: Palette = {
  primary: "hsl(221.2 83.2% 53.3%)",
  fill: "hsl(221.2 83.2% 53.3% / 0.2)",
  foreground: "hsl(222.2 84% 4.9%)",
  muted: "hsl(215.4 16.3% 46.9%)",
  border: "hsl(214.3 31.8% 91.4%)",
};
const DARK: Palette = {
  primary: "hsl(217.2 91.2% 59.8%)",
  fill: "hsl(217.2 91.2% 59.8% / 0.2)",
  foreground: "hsl(210 40% 98%)",
  muted: "hsl(215 20.2% 65.1%)",
  border: "hsl(217 16% 48%)",
};

export default function RadarChart({ scores, forceLight = false }: { scores: Record<Area, number | null>; forceLight?: boolean }) {
  const { resolvedTheme } = useTheme();

  const chartData = buildRadarChartData(scores);
  // Mirror the app's CSS theme variables and select them directly from next-themes,
  // so chart colors stay in sync when the app switches between light and dark.
  const colors = forceLight ? LIGHT : resolvedTheme === "dark" ? DARK : LIGHT;
  const dataset = chartData.datasets[0];
  dataset.backgroundColor = colors.fill;
  dataset.borderColor = colors.primary;
  dataset.pointBackgroundColor = colors.primary;
  dataset.pointBorderColor = colors.border;
  dataset.pointHoverBackgroundColor = colors.foreground;
  dataset.pointHoverBorderColor = colors.primary;

  if (AREAS.every((area) => scores[area] == null)) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No activities on this day yet.</p>;
  }

  return (
    <div className="mx-auto w-full max-w-xl" aria-label="Radar chart of observed scores for the current day">
      <Radar data={chartData} options={{
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: true,
              onClick: () => {},
              labels: { color: colors.muted },
            },
            tooltip: {
              callbacks: {
                title: (items) => items.length ? AREAS[items[0].dataIndex] : "",
                label: (context) =>
                  context.raw == null ? "Not measured" : ` ${context.raw}% observed score`,
              },
            },
          },
          scales: {
            r: {
              min: 0,
              max: 100,
              beginAtZero: true,
              grid: { color: colors.border },
              angleLines: { color: colors.border },
              ticks: { stepSize: 20, color: colors.muted, showLabelBackdrop: false, callback: (value) => Number(value) === 0 ? "" : `${value}%` },
              pointLabels: { color: colors.foreground, font: { size: 14 }, centerPointLabels: true },
            },
          },
        }}
      />
      <p className="mt-2 text-center text-xs text-muted-foreground">Areas without activity are not measured.</p>
    </div>
  );
}
