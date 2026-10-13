"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";

import { Badge } from "../ui/badge";
import Bubbles from "./bubbles";
import { API_URL } from "@/lib/api";
import { useCaregiver } from "@/lib/mode";

interface KnownFace {
  name: string;
  path: string;
  relation?: string;
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function NamePeople({
  setProgress,
  date = new Date(),
  myDay = false,
  standalone = false,
  setActivityScore,
  onComplete,
}: {
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  date?: Date;
  myDay?: boolean;
  standalone?: boolean;
  setActivityScore?: (score: number) => void;
  onComplete?: (score: number) => void;
}) {
  const [caregiver] = useCaregiver();
  const [clicked, setClicked] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<KnownFace | null>(null);
  const [bubbleNames, setBubbleNames] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const facesResponse = await fetch(`${API_URL}/known-faces`);
        const facesData = facesResponse.ok ? await facesResponse.json() : {};
        const faces: KnownFace[] = Array.isArray(facesData.faces)
          ? facesData.faces.filter((face: KnownFace) => Boolean(face.name && face.path))
          : [];

        const detected = new Set<string>();
        const today = new Date();
        for (let offset = 0; offset < 7; offset++) {
          const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
          const response = await fetch(`${API_URL}/faces-for-date?date=${localDate(day)}`);
          if (!response.ok) continue;
          const data = await response.json();
          for (const name of (data.detected ?? []) as string[]) detected.add(name.toLowerCase());
        }

        if (!active) return;
        if (faces.length < 3) {
          setTarget(null);
          setBubbleNames([]);
          return;
        }

        const recentFaces = faces.filter((face) => detected.has(face.name.toLowerCase()));
        const eligibleFaces = recentFaces.length ? recentFaces : faces;
        const selectedTarget = eligibleFaces[Math.floor(Math.random() * eligibleFaces.length)];
        setTarget(selectedTarget);
        const choices = [selectedTarget.name];
        const otherFaces = faces.filter((face) => face.name.toLowerCase() !== selectedTarget.name.toLowerCase());
        while (choices.length < Math.min(6, faces.length) && otherFaces.length) {
          const index = Math.floor(Math.random() * otherFaces.length);
          choices.push(otherFaces.splice(index, 1)[0].name);
        }
        setBubbleNames(choices.sort(() => Math.random() - 0.5));
      } catch (error) {
        console.error("Error fetching data for NamePeople:", error);
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchData();
    return () => { active = false; };
  }, []);

  const handleCorrect = (wrongCount: number) => {
    setClicked(true);
    const score = Math.max(0, 100 - wrongCount * 25);
    setFinalScore(score);
    if (setActivityScore) setActivityScore(score);
  };
  const advance = () => onComplete ? onComplete(finalScore) : setProgress((prev) => prev + 1);

  return (
    <>
      {!standalone && <div className="flex w-full items-center justify-start">
        <Button variant="secondary" onClick={() => setProgress(-1)} className="mr-6 min-h-[48px] px-5 text-lg">
          <ArrowLeft className="mr-2 h-5 w-5" /> Back
        </Button>
        <div className="text-xl font-medium">{myDay ? "My Day" : <>Daily Recall — <span className="text-blue-600 dark:text-blue-400">{format(date, "EEE d MMM yyyy")}</span></>}</div>
        <Badge className="ml-4 h-8 px-4">{myDay ? "Part 2 of 2" : "Part 2"}</Badge>
      </div>}
      <div className="mt-12 text-2xl font-medium">Can you identify who this is?</div>
      {loading ? (
        <div className="mt-8 text-center text-muted-foreground">Loading faces...</div>
      ) : bubbleNames.length < 3 || !target ? (
        <p className="mt-8 text-center text-muted-foreground">
          {caregiver ? "Add at least 3 people to play" : "Let’s try another activity today. You can play this one after your caregiver adds a few familiar people."}
        </p>
      ) : <>
        <Bubbles target={target} names={bubbleNames} onCorrect={handleCorrect} />
        {clicked && <div className="mt-6 flex w-full justify-center"><Button size="lg" onClick={advance} className="min-h-[48px] text-lg font-medium transition-all">{onComplete ? "Finish Game" : "Continue"}<ArrowRight className="ml-3 h-4 w-4" /></Button></div>}
      </>}
    </>
  );
}
