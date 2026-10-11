import Image from "next/image";
import "./index.css";
import Water from "./water.jpg";
import { Card } from "@/components/ui/card";
import { use, useEffect, useState } from "react";

interface KnownFace {
  name: string;
  path: string;
}

export default function Bubbles({
  allowContinue,
  onWrongAttempt,
  knownFaces,
}: {
  allowContinue: () => void;
  onWrongAttempt?: () => void;
  knownFaces: KnownFace[];
}) {
  // Randomly select a target person from all known faces
  const [gameState] = useState<{ target: KnownFace; names: string[] }>(() => {
    if (knownFaces.length === 0) {
      return { target: { name: "", path: "" }, names: [] };
    }
    
    // Select a random face from all known faces
    const randomIndex = Math.floor(Math.random() * knownFaces.length);
    const target = knownFaces[randomIndex];
    
    // Generate similar/confusing names using common name patterns
    const generateSimilarNames = (targetName: string) => {
      const firstNames = ["James", "John", "Robert", "Michael", "William", "David", "Richard", "Joseph", "Thomas", "Charles"];
      const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];
      
      // If target is a single name, generate single names
      const nameParts = targetName.split(' ');
      if (nameParts.length === 1) {
        return firstNames.filter(n => n !== targetName).sort(() => Math.random() - 0.5).slice(0, 6);
      }
      
      // Generate full names with similar sounds or patterns
      const similarNames: string[] = [];
      for (let i = 0; i < 6; i++) {
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const fullName = `${firstName} ${lastName}`;
        if (fullName !== targetName && !similarNames.includes(fullName)) {
          similarNames.push(fullName);
        }
      }
      return similarNames;
    };
    
    // Select 3-5 other known people
    const otherKnownPeople = knownFaces
      .filter(p => p.name !== target.name)
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.floor(Math.random() * 3) + 3); // 3-5 people
    
    // Generate similar confusing names
    const confusingNames = generateSimilarNames(target.name);
    
    // Combine: target + other known people + confusing names
    const knownNames = [target.name, ...otherKnownPeople.map(p => p.name)];
    const remainingCount = Math.max(0, 10 - knownNames.length);
    const selectedConfusing = confusingNames.slice(0, remainingCount);
    
    // Shuffle all names randomly
    const allNames = [...knownNames, ...selectedConfusing]
      .sort(() => Math.random() - 0.5);
    
    return { target, names: allNames };
  });

  const bubbleClasses = ["x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8", "x9", "x10"];

  return (
    <div className="relative mt-4 h-[44rem] w-full select-none rounded-md">
      <Card
        className={`absolute -left-52 top-0 z-10 h-48 w-48 overflow-hidden border-none bg-cover`}
      >
        <Image 
          src={`http://localhost:5000/known-faces/${gameState.target.path}`} 
          alt={gameState.target.name} 
          className="h-full w-full object-cover"
          width={192}
          height={192}
        />
      </Card>
      <div className="relative h-full w-full overflow-hidden rounded-md">
        <div className="absolute left-0 top-0 h-full w-full rounded-md bg-cover">
          <Image
            src={Water}
            alt="Background image graphic of water"
            className="min-h-full min-w-full object-cover"
          />
        </div>

        <div className="relative h-96 w-[90%]">
          {gameState.names.map((name, index) => (
            <Bubble
              key={index}
              className={bubbleClasses[index]}
              data={index + 1}
              name={name}
              allowContinue={name === gameState.target.name ? allowContinue : undefined}
              onWrongAttempt={name === gameState.target.name ? undefined : onWrongAttempt}
              target={name === gameState.target.name}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Bubble({
  className,
  data,
  name,
  allowContinue,
  onWrongAttempt,
  target,
}: {
  className: string;
  data: number;
  name: string;
  allowContinue?: () => void;
  onWrongAttempt?: () => void;
  target?: boolean;
}) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setActive(false), 500);
    return () => window.clearTimeout(timer);
  }, [active]);

  const select = () => {
    if (active) return;
    setActive(true);
    if (target) allowContinue?.();
    else onWrongAttempt?.();
  };

  // Convert name to title case
  const formatName = (name: string) => {
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Select ${name}`}
      onClick={select}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          select();
        }
      }}
      className={`bubble ${
        active ? (target ? "bg-green-300" : "bg-red-300") : ""
      } backdrop-blur-sm transition-all ${className}`}
      data-bubble={data}
    >
      <span className="pointer-events-none flex h-full select-none items-center justify-center px-4 text-center text-2xl font-semibold text-white break-words leading-tight">
        {formatName(name)}
      </span>
    </div>
  );
}
