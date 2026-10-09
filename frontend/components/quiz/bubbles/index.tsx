"use client";

import Image from "next/image";
import "./index.css";
import Water from "./water.jpg";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import { API_URL } from "@/lib/api";

interface KnownFace {
  name: string;
  path: string;
}

export default function Bubbles({
  target,
  names,
  onCorrect,
}: {
  target: KnownFace;
  names: string[];
  onCorrect: (wrongCount: number) => void;
}) {
  const [wrongClicks, setWrongClicks] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);

  const handleBubbleClick = (name: string) => {
    if (solved) return;

    if (name.toLowerCase() === target.name.toLowerCase()) {
      setSolved(true);
      onCorrect(wrongClicks.length);
    } else {
      if (!wrongClicks.includes(name)) {
        setWrongClicks((prev) => [...prev, name]);
      }
    }
  };

  const bubbleClasses = [
    "x1",
    "x2",
    "x3",
    "x4",
    "x5",
    "x6",
    "x7",
    "x8",
    "x9",
    "x10",
  ];

  return (
    <div className="mt-6 flex flex-col items-center space-y-6 w-full">
      {/* Target Photo Card - Normal Layout */}
      <div className="flex flex-col items-center">
        <Card className="h-48 w-48 overflow-hidden border-2 border-primary/20 shadow-md">
          {target.path ? (
            <Image
              src={`${API_URL}/known-faces/${target.path}`}
              alt={target.name}
              className="h-full w-full object-cover"
              width={192}
              height={192}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-4xl font-bold">
              {target.name ? target.name.slice(0, 2).toUpperCase() : "?"}
            </div>
          )}
        </Card>
      </div>

      {/* Bubbles Area */}
      <div className="relative h-[36rem] w-full select-none rounded-md overflow-hidden">
        <div className="absolute left-0 top-0 h-full w-full rounded-md bg-cover">
          <Image
            src={Water}
            alt="Background image graphic of water"
            className="min-h-full min-w-full object-cover"
          />
        </div>

        <div className="relative h-96 w-[90%]">
          {names.map((name, index) => {
            const isWrong = wrongClicks.includes(name);
            const isCorrect =
              solved && name.toLowerCase() === target.name.toLowerCase();
            return (
              <Bubble
                key={index}
                className={bubbleClasses[index % bubbleClasses.length]}
                data={index + 1}
                name={name}
                isWrong={isWrong}
                isCorrect={isCorrect}
                onClick={() => handleBubbleClick(name)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Bubble({
  className,
  data,
  name,
  isWrong,
  isCorrect,
  onClick,
}: {
  className: string;
  data: number;
  name: string;
  isWrong: boolean;
  isCorrect: boolean;
  onClick: () => void;
}) {
  const formatName = (name: string) => {
    return name
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  let stateClasses = "";
  if (isCorrect) {
    stateClasses = "bg-green-500/80 border-2 border-green-600";
  } else if (isWrong) {
    stateClasses = "bg-red-500/80 border-2 border-red-600";
  }

  return (
    <div
      onClick={onClick}
      className={`bubble ${stateClasses} backdrop-blur-sm transition-all ${className}`}
      data-bubble={data}
    >
      <span className="pointer-events-none flex h-full select-none items-center justify-center px-4 text-center text-xl font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] break-words leading-tight">
        {formatName(name)}
      </span>
    </div>
  );
}
