"use client";
import { useState } from "react";
import Nav from "@/components/nav";
import { GAME_REGISTRY } from "@/components/games/registry";
import VoiceQuestion from "@/components/interaction/VoiceQuestion";
import { useInteraction } from "@/components/interaction/InteractionProvider";
import { translate } from "@/lib/interaction/locale";
export default function PlayPage() {
  const [active, setActive] = useState<string | null>(null);
  const { locale } = useInteraction();
  const tr = (phrase: string) => translate(locale, phrase);
  const games = GAME_REGISTRY.filter(game => game.component && !game.comingSoon);
  const game = games.find(item => item.id === active), Game = game?.component;
  return <><Nav /><main className="mx-auto max-w-5xl space-y-6 px-5 pb-48 pt-24 lg:ml-[280px] lg:pt-10">
    {Game && game ? <><button className="min-h-14 rounded-xl border-2 px-6 text-xl" onClick={() => setActive(null)}>{tr("Choose another game")}</button><Game level={game.levels[0]} /></> : <><h1 className="text-3xl font-bold">{tr("What would you like to play?")}</h1><VoiceQuestion auto={false} prompt={tr("Choose a game")} options={games.map(item => ({ id: item.id, label: tr(item.name), synonyms: [`start ${item.name}`] }))} onAnswer={setActive} /><div className="grid gap-5 sm:grid-cols-2">{games.map(item => <button key={item.id} className="min-h-36 rounded-2xl border-2 bg-card p-5 text-left" onClick={() => setActive(item.id)}><span className="text-5xl">{item.emoji}</span><h2 className="mt-3 text-2xl font-bold">{tr(item.name)}</h2><p className="mt-2 text-xl">{tr(item.description)}</p></button>)}</div></>}
  </main></>;
}
