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
  setActivityScore,
}: {
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  date: Date;
  setActivityScore?: (score: number) => void;
}) {
  const [clicked, setClicked] = useState(false);
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
    if (setActivityScore) setActivityScore(score);
  };

  return (
    <>
      <div className="flex w-full items-center justify-start">
        <Button
          variant="secondary"
          onClick={() => setProgress(-1)}
          className="mr-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div className="text-lg font-medium">
          Memory Quiz —{" "}
          <span className="text-blue-600">{date.toDateString()}</span>
        </div>
        <Badge className="ml-4 h-8 px-4">Activity 2 of 3</Badge>
      </div>

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
            onClick={() => setProgress((prev) => prev + 1)}
            className="text-lg font-medium transition-all"
          >
            Continue to Activity 3 <ArrowRight className="ml-3 h-4 w-4" />
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
                onClick={() => setProgress((prev) => prev + 1)}
                className="text-lg font-medium transition-all"
              >
                Continue to Activity 3 <ArrowRight className="ml-3 h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
