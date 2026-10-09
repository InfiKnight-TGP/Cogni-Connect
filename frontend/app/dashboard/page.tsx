"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowRight,
  Brain,
  Dices,
  FileTerminal,
  FileText,
  TestTube,
  User2,
  Users2,
  TrendingUp,
  Award,
  UserPlus,
  Upload,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Graph from "./graph";
import Nav from "@/components/nav";
import { API_URL } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [stats, setStats] = useState({
    totalQuizzes: 0,
    averageScore: 0,
    lastScore: 0,
    trend: "stable" as "up" | "down" | "stable",
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${API_URL}/performance`);
        const data = await response.json();
        
        if (data.scores && data.scores.length > 0) {
          const scores = data.scores.map((s: any) => s.score);
          const total = scores.length;
          const average = Math.round(
            scores.reduce((sum: number, score: number) => sum + score, 0) / total
          );
          const last = scores[scores.length - 1];
          
          // Calculate trend
          let trend: "up" | "down" | "stable" = "stable";
          if (scores.length >= 2) {
            const secondLast = scores[scores.length - 2];
            if (last > secondLast) trend = "up";
            else if (last < secondLast) trend = "down";
          }
          
          setStats({
            totalQuizzes: total,
            averageScore: average,
            lastScore: last,
            trend,
          });
        }
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };
    
    fetchStats();
  }, []);

  const navigate = (path: string) => {
    router.push(path);
  };

  return (
    <>
      <Nav />
      <main className="flex min-h-screen w-screen items-start justify-center overflow-x-hidden pt-24">
        <div className="flex h-full w-full max-w-screen-lg flex-col items-start justify-start px-4">
          <div className="mb-8 text-2xl font-medium">Patient Dashboard</div>
          
          <div className="grid  w-full grid-cols-3 gap-3 pb-8">
            <DashboardCard link="quiz" navigate={navigate}>
              <Dices className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />

              <div className="flex items-center text-lg font-medium">
                Daily Quiz
                <ArrowRight className="ml-2 h-4 w-4" />
              </div>
            </DashboardCard>

            <DashboardCard link="contacts" navigate={navigate}>
              <Users2 className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />

              <div className="flex items-center text-lg font-medium">
                Contacts
                <ArrowRight className="ml-2 h-4 w-4" />
              </div>
            </DashboardCard>

            <DashboardCard link="faces" navigate={navigate}>
              <UserPlus className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />

              <div className="flex items-center text-lg font-medium">
                Manage Faces
                <ArrowRight className="ml-2 h-4 w-4" />
              </div>
            </DashboardCard>
            
            <DashboardCard reverse className="col-span-2" link="explore" navigate={navigate}>
              <Brain className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-blue-300 opacity-30 dark:opacity-40" />

              <div className="flex items-center text-lg font-medium">
                Explore Memories
                <ArrowRight className="ml-2 h-4 w-4" />
              </div>
            </DashboardCard>

            <DashboardCard link="upload" navigate={navigate}>
              <Upload className="absolute -bottom-6 -right-6 -z-10 h-36 w-36 text-primary opacity-30 dark:opacity-40" />

              <div className="flex items-center text-lg font-medium">
                Upload Videos
                <ArrowRight className="ml-2 h-4 w-4" />
              </div>
            </DashboardCard>
            
            {/* Stats Row - Above Memory Trends */}
            <div className="col-span-3 mb-4 grid grid-cols-3 gap-3">
              <Card className="flex flex-col justify-between p-6">
                <div className="text-sm text-muted-foreground">Total Quizzes</div>
                <div className="mt-2 text-4xl font-bold">{stats.totalQuizzes}</div>
              </Card>
              <Card className="flex flex-col justify-between p-6">
                <div className="text-sm text-muted-foreground">Average Score</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-4xl font-bold">{stats.averageScore}%</span>
                  {stats.trend === "up" && (
                    <TrendingUp className="h-6 w-6 text-green-500" />
                  )}
                </div>
              </Card>
              <Card className="flex flex-col justify-between p-6">
                <div className="text-sm text-muted-foreground">Latest Score</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-4xl font-bold">{stats.lastScore}%</span>
                  {stats.lastScore >= 80 && (
                    <Award className="h-6 w-6 text-yellow-500" />
                  )}
                </div>
              </Card>
            </div>
            
            <DashboardCard className="col-span-3 !h-96 flex flex-col">
              <div className="flex items-center text-lg font-medium mb-1">
                Memory Trends
              </div>
              <Graph />
            </DashboardCard>
          </div>
        </div>
      </main>
    </>
  );
}

function DashboardCard({
  children,
  link,
  navigate,
  className,
  reverse = false,
}: {
  children: React.ReactNode;
  link?: string;
  navigate?: (path: string) => void;
  className?: string;
  reverse?: boolean;
}) {
  return (
    <Card
      onClick={link && navigate ? () => navigate(link) : undefined}
      tabIndex={0}
      className={`${className} relative z-0 h-52 w-full overflow-hidden transition-all ${
        reverse
          ? "bg-gradient-to-br from-primary to-blue-950 text-white"
          : "border-primary"
      } ${link && navigate ? "cursor-pointer" : ""} p-6`}
    >
      {children}
    </Card>
  );
}
