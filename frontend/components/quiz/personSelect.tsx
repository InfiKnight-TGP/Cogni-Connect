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
import type { ActivityResult } from "@/lib/game-scores";

import { Separator } from "../ui/separator";
import { Badge } from "../ui/badge";

// Import static distractor images
import Bharath from "./data/Bharath.jpg";
import DineshPng from "./data/Dinesh.png";
import Kaleesh from "./data/Kaleesh.jpg";
import Monish from "./data/Monish.jpg";
import Narmatha from "./data/Narmatha.jpg";
import Sachein from "./data/Sachein.jpg";
import Shawn from "./data/Shawn.png";
import Vaibhavi from "./data/Vaibhavi.jpg";
import Yasash from "./data/Yasash.jpg";
import Asad from "./data/Asad.jpg";
import Akash from "./data/Akash.jpeg";
import DineshJpeg from "./data/Dinesh.jpeg";

interface KnownFace {
  name: string;
  path: string;
  isDistractor?: boolean; // Flag for static distractor faces
  staticImage?: any; // For imported static images
}

// Static distractor faces with real images
const STATIC_DISTRACTORS: KnownFace[] = [
  { name: "Bharath", path: "", isDistractor: true, staticImage: Bharath },
  { name: "Dinesh Legacy", path: "", isDistractor: true, staticImage: DineshPng },
  { name: "Kaleesh", path: "", isDistractor: true, staticImage: Kaleesh },
  { name: "Monish", path: "", isDistractor: true, staticImage: Monish },
  { name: "Narmatha", path: "", isDistractor: true, staticImage: Narmatha },
  { name: "Sachein", path: "", isDistractor: true, staticImage: Sachein },
  { name: "Shawn", path: "", isDistractor: true, staticImage: Shawn },
  { name: "Vaibhavi", path: "", isDistractor: true, staticImage: Vaibhavi },
  { name: "Yasash", path: "", isDistractor: true, staticImage: Yasash },
  { name: "Asad", path: "", isDistractor: true, staticImage: Asad },
  { name: "Akash", path: "", isDistractor: true, staticImage: Akash },
  { name: "Dinesh", path: "", isDistractor: true, staticImage: DineshJpeg },
];

export default function PersonSelect({
  setProgress,
  date,
  setActivityScore,
}: {
  setProgress: React.Dispatch<React.SetStateAction<number>>;
  date: Date;
  setActivityScore?: (result: ActivityResult) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [knownFaces, setKnownFaces] = useState<KnownFace[]>([]);
  const [facesInVideo, setFacesInVideo] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [allFacesForQuiz, setAllFacesForQuiz] = useState<KnownFace[]>([]);

  // solution revealed
  const [revealed, setRevealed] = useState(false);

  // submitted
  const [submitted, setSubmitted] = useState<{
    correct: boolean;
  } | null>(null);

  // Fetch known faces and faces detected in videos
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get known faces
        const facesResponse = await fetch("http://localhost:5000/known-faces");
        if (facesResponse.ok) {
          const facesData = await facesResponse.json();
          setKnownFaces(facesData.faces || []);
        }

        // Get faces detected in videos from the selected date
        const videosResponse = await fetch("http://localhost:5000/videos");
        if (videosResponse.ok) {
          const videosData = await videosResponse.json();
          console.log("Selected date:", date.toDateString());
          console.log("All videos:", videosData);
          
          // Find videos matching the selected date
          const matchingVideo = videosData.find((v: any) => {
            if (v.date) {
              const videoDate = new Date(v.date).toDateString();
              console.log("Comparing:", videoDate, "with", date.toDateString());
              return videoDate === date.toDateString();
            }
            return false;
          });

          console.log("Matching video:", matchingVideo);

          if (matchingVideo) {
            // Get face data for this video
            const videoName = matchingVideo.filename.replace(/\.[^/.]+$/, "");
            const facesJsonPath = `http://localhost:5000/video_chunks/${videoName}_chunks/chunk_0000_0010_faces.json`;
            
            console.log("Fetching face data from:", facesJsonPath);
            
            try {
              const facesJsonResponse = await fetch(facesJsonPath);
              if (facesJsonResponse.ok) {
                const facesJson = await facesJsonResponse.json();
                console.log("Face detection data:", facesJson);
                // Extract unique face names from all chunks
                const allFaces = new Set<string>();
                Object.values(facesJson).forEach((names: any) => {
                  if (Array.isArray(names)) {
                    names.forEach(name => {
                      // Convert underscores to spaces to match the backend format
                      const normalizedName = name.replace(/_/g, ' ');
                      allFaces.add(normalizedName);
                    });
                  }
                });
                console.log("Faces detected in video:", Array.from(allFaces));
                setFacesInVideo(Array.from(allFaces));
              }
            } catch (error) {
              console.error("Error fetching face data:", error);
            }
          } else {
            console.log("No matching video found for date:", date.toDateString());
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [date]);

  // Prepare faces for quiz: detected faces + distractor faces
  useEffect(() => {
    if (knownFaces.length > 0) {
      // Faces that were detected in the video
      const detectedFaces = knownFaces.filter(face => facesInVideo.includes(face.name));
      
      // Faces that were NOT detected from uploaded faces (distractors)
      const uploadedDistractors = knownFaces.filter(face => !facesInVideo.includes(face.name));
      
      // Calculate how many distractors we need (aim for 4-6 total faces)
      const targetTotal = Math.max(6, detectedFaces.length + 3);
      const neededDistractors = targetTotal - detectedFaces.length;
      
      // Combine uploaded distractors with static distractors
      const allDistractors = [
        ...uploadedDistractors,
        ...STATIC_DISTRACTORS
      ];
      
      // Randomly select the needed number of distractors
      const selectedDistractors = allDistractors
        .sort(() => Math.random() - 0.5)
        .slice(0, neededDistractors);
      
      // Combine detected faces with distractors and shuffle
      const combinedFaces = [...detectedFaces, ...selectedDistractors]
        .sort(() => Math.random() - 0.5);
      
      setAllFacesForQuiz(combinedFaces);
    } else if (facesInVideo.length === 0) {
      // If no faces detected but we have known faces, show some anyway with static distractors
      const someKnownFaces = knownFaces.slice(0, 2);
      const someDistractors = STATIC_DISTRACTORS.slice(0, 4);
      setAllFacesForQuiz([...someKnownFaces, ...someDistractors].sort(() => Math.random() - 0.5));
    }
  }, [knownFaces, facesInVideo]);

  // Calculate correct indices based on allFacesForQuiz
  const correctIndices = allFacesForQuiz
    .map((face, index) => (facesInVideo.includes(face.name) ? index : -1))
    .filter(index => index !== -1);

  const onSubmit = () => {
    const totalQuestions = correctIndices.length;
    if (selected.length === 0) {
      setSubmitted({ correct: false });
      if (setActivityScore) setActivityScore({ score: 0, metrics: { accuracy: 0, correct_answers: 0, total_questions: totalQuestions, attempts: 0, missed_targets: totalQuestions, false_selections: 0 } });
    } else {
      const res =
        JSON.stringify([...selected].sort()) === JSON.stringify([...correctIndices].sort());
      if (res) setRevealed(true);
      setSubmitted({ correct: res });
      
      // Calculate score: percentage of correctly identified faces
      const correctCount = selected.filter(idx => correctIndices.includes(idx)).length;
      const incorrectCount = selected.filter(idx => !correctIndices.includes(idx)).length;
      const missedCount = correctIndices.filter(idx => !selected.includes(idx)).length;
      
      // Score = (correct selections - incorrect selections) / total faces in video
      // Ensure score is between 0 and 100
      const totalFaces = totalQuestions || 1;
      const rawScore = ((correctCount - incorrectCount) / totalFaces) * 100;
      const finalScore = Math.max(0, Math.min(100, rawScore));
      
      if (setActivityScore) setActivityScore({ score: Math.round(finalScore), metrics: {
        accuracy: totalQuestions ? correctCount / totalQuestions : 0,
        correct_answers: correctCount,
        total_questions: totalQuestions,
        attempts: selected.length,
        missed_targets: missedCount,
        false_selections: incorrectCount,
      } });
    }
  };

  const nullify = () => {
    setSubmitted(null);
  };

  const click = () => {};

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
        <Badge className="ml-4 h-8 px-4">Activity 1 of 3</Badge>
      </div>

      <div className="mt-12 text-xl font-medium">
        On this day, who did you talk to? (Select all that apply)
      </div>

      {loading ? (
        <div className="mt-8 text-center text-muted-foreground">
          Loading faces...
        </div>
      ) : facesInVideo.length === 0 ? (
        <div className="mt-8 text-center text-muted-foreground">
          No faces were detected in a video from this date. This activity is not scored; choose another date.
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
              className="text-lg font-medium transition-all"
            >
              Check My Response <FileCheck className="ml-3 h-5 w-5" />
            </Button>
            <Button
              onClick={() => setRevealed(true)}
              disabled={revealed || submitted?.correct}
              variant="secondary"
              size="lg"
              className="text-lg font-medium transition-all"
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
            onClick={() => setProgress((prev) => prev + 1)}
            className="text-lg font-medium transition-all"
          >
            Continue to Activity 2 <ArrowRight className="ml-3 h-4 w-4" />
          </Button>
        </>
      )}
    </>
  );
}

function PersonCard({
  selected,
  click,
  index,
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
  // Generate initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Generate consistent color from name
  const getColorFromName = (name: string) => {
    const colors = [
      'bg-blue-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500',
      'bg-orange-500',
    ];
    const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  return (
    <button
      onClick={() => {
        if (reveal.isRevealed) return;
        nullify();
        click();
      }}
      className={`mb-4 mr-4 h-52 w-52 overflow-hidden rounded-md border-2 transition-all ${
        reveal.isRevealed
          ? `${
              reveal.correct
                ? "shadow-lg shadow-green-600/50 ring-2 ring-green-600 ring-offset-2 ring-offset-background/75 border-green-600"
                : "shadow-lg shadow-red-600/50 ring-2 ring-red-600 ring-offset-2 ring-offset-background/75 border-red-600"
            }}`
          : `cursor-pointer border-gray-300 ${
              selected
                ? "shadow-lg shadow-primary/50 ring-2 ring-primary ring-offset-2 ring-offset-background/75"
                : "hover:border-gray-400"
            }`
      } `}
    >
      {person.isDistractor && person.staticImage ? (
        // Show static imported image for distractor faces
        <Image
          src={person.staticImage}
          alt={person.name}
          className="h-full w-full rounded-md object-cover"
          width={208}
          height={208}
        />
      ) : person.isDistractor ? (
        // Fallback: Show initials if no static image
        <div className={`h-full w-full flex flex-col items-center justify-center ${getColorFromName(person.name)} text-white`}>
          <div className="text-6xl font-bold mb-2">{getInitials(person.name)}</div>
          <div className="text-sm font-medium px-2 text-center">{person.name}</div>
        </div>
      ) : (
        // Show actual image for real detected faces from backend
        <Image
          src={`http://localhost:5000/known-faces/${person.path}`}
          alt={person.name}
          className="h-full w-full rounded-md object-cover"
          width={208}
          height={208}
        />
      )}
    </button>
  );
}
