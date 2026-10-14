"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Nav from "@/components/nav";
import MyDayRunner from "@/components/quiz/myDayRunner";
import { useCaregiver } from "@/lib/mode";
import { translate } from "@/lib/interaction/locale";
import { useInteraction } from "@/components/interaction/InteractionProvider";

export default function QuizPage() {
  const { locale } = useInteraction();
  const router = useRouter();
  const [caregiver, ready] = useCaregiver();
  const [showMyDay, setShowMyDay] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (caregiver) {
      router.replace("/games");
    } else if (new URLSearchParams(window.location.search).get("start") === "today") {
      setShowMyDay(true);
    } else {
      router.replace("/today");
    }
  }, [caregiver, ready, router]);

  return (
    <>
      <Nav />
      {showMyDay ? (
        <MyDayRunner />
      ) : (
        <main className="mx-auto max-w-screen-lg px-4 pb-16 pt-24 text-center text-lg text-muted-foreground lg:pt-8">
          {translate(locale, "Getting your day ready…")}
        </main>
      )}
    </>
  );
}
