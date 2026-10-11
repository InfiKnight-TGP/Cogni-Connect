"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { ActivityResult } from "@/lib/game-scores";

import { Separator } from "../ui/separator";
import Bubbles from "./bubbles";
import { Badge } from "../ui/badge";

interface KnownFace {
  name: string;
  path: string;
}

export default function NamePeople({
  setProgress,
  date,
  setActivityScore,
}: {
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  date: Date;
  setActivityScore?: (result: ActivityResult) => void;
}) {
  const [clicked, setClicked] = useState(false);
  const [wrongSelections, setWrongSelections] = useState(0);
  const [knownFaces, setKnownFaces] = useState<KnownFace[]>([]);
  const [loading, setLoading] = useState(true);

  const allowContinue = () => {
    if (clicked) return;
    setClicked(true);
    const attempts = wrongSelections + 1;
    if (setActivityScore) setActivityScore({
      score: Math.round(100 / attempts),
      metrics: { accuracy: 1 / attempts, correct_answers: 1, total_questions: 1, attempts, false_selections: wrongSelections },
    });
  };

  const recordWrongSelection = () => {
    if (!clicked) setWrongSelections((value) => value + 1);
  };

  // Fetch all known faces (not filtered by date)
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get all known faces
        const facesResponse = await fetch("http://localhost:5000/known-faces");
        if (facesResponse.ok) {
          const facesData = await facesResponse.json();
          setKnownFaces(facesData.faces || []);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [date]);

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
        Can you identify who this is? (The face on the left)
      </div>

      {loading ? (
        <div className="mt-8 text-center text-muted-foreground">
          Loading faces...
        </div>
      ) : knownFaces.length === 0 ? (
        <div className="mt-8 text-center text-muted-foreground">
          No known faces uploaded yet. Please upload faces first.
        </div>
      ) : (
        <>
          <Bubbles
            allowContinue={allowContinue}
            onWrongAttempt={recordWrongSelection}
            knownFaces={knownFaces}
          />

          {clicked ? (
            <Button
              size="lg"
              disabled={!clicked}
              onClick={() => setProgress((prev) => prev + 1)}
              className="mt-4 text-lg font-medium transition-all"
            >
              Continue to Activity 3 <ArrowRight className="ml-3 h-4 w-4" />
            </Button>
          ) : null}
        </>
      )}
    </>
  );
}
