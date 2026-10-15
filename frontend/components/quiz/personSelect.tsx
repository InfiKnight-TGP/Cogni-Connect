"use client";

import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  Check,
  FileCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import Image from "next/image";
import { format } from "date-fns";

import { Separator } from "../ui/separator";
import { Badge } from "../ui/badge";
import { API_URL } from "@/lib/api";
import { VoiceQuestion } from "@/components/interaction/VoiceQuestion";

interface KnownFace {
  name: string;
  path: string;
  relation?: string;
}

export default function PersonSelect({
  setProgress,
  date,
  myDay = false,
  standalone = false,
  setActivityScore,
  onComplete,
}: {
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  date: Date;
  myDay?: boolean; // "My Day" from the Today page: no date, "Part X of 2"
  standalone?: boolean;
  setActivityScore?: (score: number) => void;
  onComplete?: (score: number) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [knownFaces, setKnownFaces] = useState<KnownFace[]>([]);
  const [detectedNames, setDetectedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [allFacesForQuiz, setAllFacesForQuiz] = useState<KnownFace[]>([]);

  // solution revealed
  const [revealed, setRevealed] = useState(false);

  // submitted
  const [submitted, setSubmitted] = useState<{
    correct: boolean;
  } | null>(null);
  const [finalScore, setFinalScore] = useState(0);

  // Fetch data on date change
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const formattedDate = format(date, "yyyy-MM-dd");

        // Get known faces
        const facesResponse = await fetch(`${API_URL}/known-faces`);
        let kFaces: KnownFace[] = [];
        if (facesResponse.ok) {
          const facesData = await facesResponse.json();
          kFaces = facesData.faces || [];
          setKnownFaces(kFaces);
        }

        // Get faces detected in videos from the selected date
        const facesForDateRes = await fetch(
          `${API_URL}/faces-for-date?date=${formattedDate}`
        );
        let dNames: string[] = [];
        if (facesForDateRes.ok) {
          const facesForDateData = await facesForDateRes.json();
          dNames = facesForDateData.detected || [];
          setDetectedNames(dNames);
        }

        // Options = people detected that day + up to 3 other known faces. Dedupe by case-insensitive name.
        const detectedFaces: KnownFace[] = dNames.map((dName) => {
          const found = kFaces.find(
            (kf) => kf.name.toLowerCase() === dName.toLowerCase()
          );
          return found || { name: dName, path: "" };
        });

        const otherFaces = kFaces.filter(
          (kf) => !dNames.some((d) => d.toLowerCase() === kf.name.toLowerCase())
        );

        const distractors = otherFaces.slice(0, 3);

        const seen = new Set<string>();
        const combined: KnownFace[] = [];
        for (const f of [...detectedFaces, ...distractors]) {
          const lower = f.name.toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            combined.push(f);
          }
        }

        setAllFacesForQuiz(combined);
      } catch (error) {
        console.error("Error fetching data for PersonSelect:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [date]);

  // Calculate correct indices based on allFacesForQuiz
  const correctIndices = allFacesForQuiz
    .map((face, index) =>
      detectedNames.some((d) => d.toLowerCase() === face.name.toLowerCase())
        ? index
        : -1
    )
    .filter((index) => index !== -1);

  const onSubmit = () => {
    if (selected.length === 0) {
      setSubmitted({ correct: false });
      setFinalScore(0);
      if (setActivityScore) setActivityScore(0);
    } else {
      const res =
        JSON.stringify(selected.sort()) === JSON.stringify(correctIndices.sort());
      if (res) setRevealed(true);
      setSubmitted({ correct: res });

      const correctCount = selected.filter((idx) =>
        correctIndices.includes(idx)
      ).length;
      const incorrectCount = selected.filter(
        (idx) => !correctIndices.includes(idx)
      ).length;

      const totalFaces = detectedNames.length || 1;
      const rawScore = ((correctCount - incorrectCount) / totalFaces) * 100;
      const finalScore = Math.max(0, Math.min(100, rawScore));

      const roundedScore = Math.round(finalScore);
      setFinalScore(roundedScore);
      if (setActivityScore) setActivityScore(roundedScore);
    }
  };

  const nullify = () => {
    setSubmitted(null);
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
        <Badge className="ml-4 h-8 px-4">{myDay ? "Part 1 of 2" : "Part 1"}</Badge>
      </div>}

      <div className="mt-12 text-xl font-medium">
        On this day, who did you talk to? (Select all that apply)
      </div>
      {!loading && detectedNames.length > 0 && <VoiceQuestion
        question="On this day, who did you talk to? Select all that apply."
        options={allFacesForQuiz.map((person, index) => ({ id: String(index), label: person.name }))}
        onMatched={option => {
          const index = Number(option.id);
          setSelected(current => current.includes(index) ? current.filter(value => value !== index) : [...current, index]);
          setSubmitted(null);
        }}
      />}

      {loading ? (
        <div className="mt-8 text-center text-muted-foreground">
          Loading faces...
        </div>
      ) : detectedNames.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center space-y-4">
          <p className="text-center text-muted-foreground">
            No recognized people in videos from this date
          </p>
          <Button
            size="lg"
            onClick={advance}
            className="min-h-[48px] text-lg font-medium transition-all"
          >
            {onComplete ? "Finish Game" : "Continue to Part 2"} <ArrowRight className="ml-3 h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-8 flex w-full flex-wrap">
            {allFacesForQuiz.map((person, index) => (
              <PersonCard
                key={index}
                index={index}
                person={person}
                nullify={nullify}
                reveal={{
                  isRevealed: revealed,
                  correct: correctIndices.includes(index),
                }}
                click={() => {
                  if (selected.includes(index)) {
                    setSelected(selected.filter((i) => i !== index));
                  } else {
                    setSelected([...selected, index]);
                  }
                }}
                selected={selected.includes(index)}
              />
            ))}
          </div>
          <div className="mt-8 flex space-x-4">
            <Button
              disabled={revealed || submitted?.correct}
              size="lg"
              onClick={onSubmit}
              className="min-h-[48px] text-lg font-medium transition-all"
            >
              Check My Response <FileCheck className="ml-3 h-5 w-5" />
            </Button>
            <Button
              onClick={() => setRevealed(true)}
              disabled={revealed || submitted?.correct}
              variant="secondary"
              size="lg"
              className="min-h-[48px] text-lg font-medium transition-all"
            >
              See Correct Answer <BookOpenCheck className="ml-3 h-5 w-5" />
            </Button>
          </div>
        </>
      )}

      {submitted !== null ? (
        <>
          {submitted.correct ? (
            <div className="mt-8 flex items-center text-green-600">
              <Check className="mr-2 h-4 w-4" />
              <div className="font-medium">
                Correct! You remembered everyone you talked to on this day.
              </div>
            </div>
          ) : (
            <div className="mt-8 flex items-center text-red-600">
              <X className="mr-2 h-4 w-4" />
              <div className="font-medium">
                Your selection was incorrect. Try again, or choose to see the
                correct answer.
              </div>
            </div>
          )}
        </>
      ) : null}

      {!revealed && (!submitted || !submitted.correct) ? null : (
        <>
          <Separator className="my-4" />
          <Button
            disabled={!revealed && (!submitted || !submitted.correct)}
            size="lg"
            onClick={advance}
            className="min-h-[48px] text-lg font-medium transition-all"
          >
            {onComplete ? "Finish Game" : "Continue to Part 2"} <ArrowRight className="ml-3 h-4 w-4" />
          </Button>
        </>
      )}
    </>
  );
}

function PersonCard({
  selected,
  click,
  nullify,
  reveal,
  person,
}: {
  selected: boolean;
  click: () => void;
  nullify: () => void;
  index: number;
  person: KnownFace;
  reveal: {
    isRevealed: boolean;
    correct: boolean;
  };
}) {
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getColorFromName = (name: string) => {
    const colors = [
      "bg-blue-500",
      "bg-purple-500",
      "bg-pink-500",
      "bg-indigo-500",
      "bg-teal-500",
      "bg-orange-500",
    ];
    const index = name
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  return (
    <button
      onClick={() => {
        if (reveal.isRevealed) return;
        nullify();
        click();
      }}
      className={`relative mb-4 mr-4 h-52 w-52 overflow-hidden rounded-md border-2 transition-all ${
        reveal.isRevealed
          ? `${
              reveal.correct
                ? "shadow-lg shadow-green-600/50 ring-2 ring-green-600 ring-offset-2 ring-offset-background/75 border-green-600"
                : "shadow-lg shadow-red-600/50 ring-2 ring-red-600 ring-offset-2 ring-offset-background/75 border-red-600"
            }`
          : `cursor-pointer border-gray-300 ${
              selected
                ? "shadow-lg shadow-primary/50 ring-2 ring-primary ring-offset-2 ring-offset-background/75"
                : "hover:border-gray-400"
            }`
      } `}
    >
      {person.path ? (
        <Image
          src={`${API_URL}/known-faces/${person.path}`}
          alt={person.name}
          className="h-full w-full rounded-md object-cover"
          width={208}
          height={208}
        />
      ) : (
        <div
          className={`h-full w-full flex flex-col items-center justify-center ${getColorFromName(
            person.name
          )} text-white`}
        >
          <div className="text-6xl font-bold mb-2">
            {getInitials(person.name)}
          </div>
          <div className="text-sm font-medium px-2 text-center">
            {person.name}
          </div>
        </div>
      )}
      {reveal.isRevealed && reveal.correct && person.path && (
        <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-center text-lg font-semibold text-white">
          {[person.name, person.relation].filter(Boolean).join(" · ")}
        </div>
      )}
    </button>
  );
}
