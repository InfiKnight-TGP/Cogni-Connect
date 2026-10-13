"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";

import { Badge } from "../ui/badge";
import Bubbles from "./bubbles";
import { API_URL } from "@/lib/api";

interface KnownFace {
  name: string;
  path: string;
  relation?: string;
}

export default function NamePeople({
  setProgress,
  date,
  myDay = false,
  standalone = false,
  setActivityScore,
  onComplete,
}: {
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  date: Date;
  myDay?: boolean; // "My Day" from the Today page: no date, "Part X of 3"
  standalone?: boolean;
  setActivityScore?: (score: number) => void;
  onComplete?: (score: number) => void;
}) {
  const [clicked, setClicked] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [loading, setLoading] = useState(true);

  const [target, setTarget] = useState<KnownFace | null>(null);
  const [bubbleNames, setBubbleNames] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const formattedDate = format(date, "yyyy-MM-dd");

        // 1. Get known faces
        const facesResponse = await fetch(`${API_URL}/known-faces`);
        let kFaces: KnownFace[] = [];
        if (facesResponse.ok) {
          const facesData = await facesResponse.json();
          kFaces = facesData.faces || [];
        }

        // 2. Get detected faces for date
        const facesForDateRes = await fetch(
          `${API_URL}/faces-for-date?date=${formattedDate}`
        );
        let dNames: string[] = [];
        if (facesForDateRes.ok) {
          const facesForDateData = await facesForDateRes.json();
          dNames = facesForDateData.detected || [];
        }

        // Target = a person detected on that date (via /faces-for-date), falling back to a random known face.
        let selectedTarget: KnownFace | null = null;
        if (dNames.length > 0) {
          const matchedKnown = kFaces.find((kf) =>
            dNames.some((d) => d.toLowerCase() === kf.name.toLowerCase())
          );
          if (matchedKnown) {
            selectedTarget = matchedKnown;
          } else {
            selectedTarget = { name: dNames[0], path: "" };
          }
        } else if (kFaces.length > 0) {
          const randomIndex = Math.floor(Math.random() * kFaces.length);
          selectedTarget = kFaces[randomIndex];
        }

        if (selectedTarget) {
          setTarget(selectedTarget);

          // Bubbles = target + other known names (up to 6, deduped)
          const names: string[] = [selectedTarget.name];
          for (const kf of kFaces) {
            if (names.length >= 6) break;
            if (
              !names.some(
                (n) => n.toLowerCase() === kf.name.toLowerCase()
              )
            ) {
              names.push(kf.name);
            }
          }

          // Shuffle names
          const shuffled = [...names].sort(() => Math.random() - 0.5);
          setBubbleNames(shuffled);
        } else {
          setTarget(null);
          setBubbleNames([]);
        }
      } catch (error) {
        console.error("Error fetching data for NamePeople:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [date]);

  const handleCorrect = (wrongCount: number) => {
    setClicked(true);
    // Scoring: 100 minus 25 per wrong click before the correct one (minimum 0).
    const score = Math.max(0, 100 - wrongCount * 25);
    setFinalScore(score);
    if (setActivityScore) setActivityScore(score);
  };
  const advance = () => onComplete ? onComplete(finalScore) : setProgress((prev) => prev + 1);

  return (
    <>
      {!standalone && <div className="flex w-full items-center justify-start">
        <Button
          variant="secondary"
          onClick={() => setProgress(-1)}
          className="mr-6 min-h-[48px] px-5 text-lg"
        >
          <ArrowLeft className="mr-2 h-5 w-5" /> Back
        </Button>
        <div className="text-xl font-medium">
          {myDay ? (
            "My Day"
          ) : (
            <>
              Daily Recall —{" "}
              <span className="text-blue-600 dark:text-blue-400">
                {format(date, "EEE d MMM yyyy")}
              </span>
            </>
          )}
        </div>
        <Badge className="ml-4 h-8 px-4">{myDay ? "Part 2 of 3" : "Part 2"}</Badge>
      </div>}

      <div className="mt-12 text-2xl font-medium">
        Can you identify who this is?
      </div>

      {loading ? (
        <div className="mt-8 text-center text-muted-foreground">
          Loading faces...
        </div>
      ) : bubbleNames.length < 3 || !target ? (
        <div className="mt-8 flex flex-col items-center justify-center space-y-4">
          <p className="text-center text-muted-foreground">
            Add at least 3 faces to play
          </p>
          <Button
            size="lg"
            onClick={advance}
            className="min-h-[48px] text-lg font-medium transition-all"
          >
            {onComplete ? "Finish Game" : "Continue to Part 3"} <ArrowRight className="ml-3 h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <Bubbles
            target={target}
            names={bubbleNames}
            onCorrect={handleCorrect}
          />

          {clicked ? (
            <div className="mt-6 flex justify-center w-full">
              <Button
                size="lg"
                onClick={advance}
                className="min-h-[48px] text-lg font-medium transition-all"
              >
                {onComplete ? "Finish Game" : "Continue to Part 3"} <ArrowRight className="ml-3 h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
