"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Nav from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function GameFrame({
  title,
  description,
  instructions,
  level,
  totalLevels,
  score,
  children,
}: {
  title: string;
  description: string;
  instructions: string;
  level: number;
  totalLevels: number;
  score: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      <main className="flex min-h-screen w-screen items-start justify-center overflow-x-hidden pt-24">
        <div className="flex w-full max-w-screen-lg flex-col px-4 pb-12">
          <Link href="/games" className="mb-6 w-fit">
            <Button variant="secondary">
              <ArrowLeft className="mr-2 h-4 w-4" />
              All Brain Games
            </Button>
          </Link>

          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-primary">
                Brain Games
              </p>
              <h1 className="mt-1 text-3xl font-bold">{title}</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                {description}
              </p>
            </div>
            <div className="flex gap-3">
              <Card className="min-w-24 px-4 py-3 text-center">
                <div className="text-xs text-muted-foreground">Level</div>
                <div className="text-lg font-semibold">
                  {Math.min(level, totalLevels)} / {totalLevels}
                </div>
              </Card>
              <Card className="min-w-24 px-4 py-3 text-center">
                <div className="text-xs text-muted-foreground">Score</div>
                <div className="text-lg font-semibold">{score}</div>
              </Card>
            </div>
          </div>

          <Card className="p-5 sm:p-8">
            <p className="mb-6 rounded-md bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground">
              <span className="font-semibold">How to play: </span>
              {instructions}
            </p>
            {children}
          </Card>
        </div>
      </main>
    </>
  );
}
