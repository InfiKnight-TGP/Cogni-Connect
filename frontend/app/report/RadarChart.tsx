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
import { AREAS, buildRadarChartData, type Area } from "@/lib/progress";

ChartJS.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export { buildRadarChartData };

export default function RadarChart({ scores }: { scores: Record<Area, number | null> }) {
  const chartData = buildRadarChartData(scores);

  return (
    <div className="mx-auto w-full max-w-xl" aria-label="Radar chart of observed scores for the current day">
      <Radar
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: true,
              labels: {
                generateLabels: (chart) => {
                  const defaultLabels = ChartJS.defaults.plugins.legend.labels.generateLabels(chart);
                  return [
                    ...defaultLabels,
                    {
                      text: "Gaps = Not measured",
                      fillStyle: "rgba(148, 163, 184, 0.2)",
                      strokeStyle: "rgb(148, 163, 184)",
                      lineWidth: 1,
                      hidden: false,
                      index: 1,
                    },
                  ];
                },
              },
            },
            tooltip: {
              callbacks: {
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
              ticks: { stepSize: 20, callback: (value) => `${value}%` },
              pointLabels: { font: { size: 13 } },
            },
          },
        }}
      />
    </div>
  );
}
