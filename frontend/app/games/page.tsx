import Link from "next/link";
import { ArrowRight, Brain, Eye, Rabbit } from "lucide-react";
import Nav from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { games } from "@/lib/games";

const icons = {
  "story-builder": Brain,
  "mole-path": Rabbit,
  "attention-hunt": Eye,
};

export default function GamesPage() {
  return (
    <>
      <Nav />
      <main className="flex min-h-screen w-screen items-start justify-center overflow-x-hidden pt-24">
        <div className="w-full max-w-screen-lg px-4 pb-12">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            Practice at your own pace
          </p>
          <h1 className="mt-2 text-3xl font-bold">Brain Games</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Gentle, bite-sized activities for memory, sequencing, and focus.
            Choose a game to get started; you can take a break or play again
            whenever you like.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {games.map((game) => {
              const Icon = icons[game.id];
              return (
                <Card
                  key={game.id}
                  className="flex flex-col border-primary/40 p-6 transition-shadow hover:shadow-lg"
                >
                  <Icon className="h-9 w-9 text-primary" aria-hidden="true" />
                  <h2 className="mt-5 text-xl font-semibold">{game.title}</h2>
                  <p className="mt-1 text-sm font-medium text-primary">{game.skill}</p>
                  <p className="mt-2 grow text-sm leading-relaxed text-muted-foreground">
                    {game.description}
                  </p>
                  <div className="mt-5 rounded-md bg-secondary p-3 text-sm">
                    <div>
                      <span className="font-medium">Levels:</span>{" "}
                      {game.levels}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      {game.rules}
                    </div>
                  </div>
                  <Link href={game.href} className="mt-5">
                    <Button className="w-full">
                      Play {game.title}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}
