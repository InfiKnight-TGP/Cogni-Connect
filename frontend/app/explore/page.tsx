"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowRight,
  BrainCircuit,
  Home,
  Loader2,
  Minus,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { translate } from "@/lib/interaction/locale";
import { useInteraction } from "@/components/interaction/InteractionProvider";

export default function Page() {
  const { locale } = useInteraction();
  const tr = (phrase: string) => translate(locale, phrase);
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");

  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const [results, setResults] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [index, setIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load all available videos on mount
  useEffect(() => {
    const loadVideos = async () => {
      try {
        const res = await fetch("/api/videos");
        const data = await res.json();
        if (data.videos && data.videos.length > 0) {
          setResults(data.videos);
        }
      } catch (error) {
        console.error("Failed to load videos:", error);
      }
    };
    loadVideos();
  }, []);

  const onSearch = async () => {
    const res = await fetch(`/api/semSearch`, {
      method: "POST",
      body: JSON.stringify({
        query: value,
      }),
    });
    const data = await res.json();
    console.log("Search response:", data);
    
    // Handle new format with metadata
    let videoPaths: string[] = [];
    let meta: Record<string, any> = {};
    
    if (Array.isArray(data.data)) {
      data.data.forEach((item: any) => {
        if (typeof item === 'string') {
          // Use path as-is
          videoPaths.push(item);
        } else if (item && item.path) {
          const path = item.path;
          videoPaths.push(path);
          meta[path] = item;
          console.log("Video metadata:", path, item);
        }
      });
    }
    
    console.log("Final results:", videoPaths);
    console.log("Final metadata:", meta);
    
    setResults(videoPaths);
    setMetadata(meta);
    setIndex(0);
    setLoading(false);
    router.refresh();
  };

  useEffect(() => {
    // video end listener

    const video = videoRef.current;
    if (!video) return;

    const onEnd = () => {
      setIndex((index) => index + 1);
    };

    video.addEventListener("ended", onEnd);
    return () => {
      video.removeEventListener("ended", onEnd);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play();
  }, [results, index]);

  return (
    <div className="relative flex h-screen w-screen items-center justify-center bg-black">
      <video
        controls={true}
        ref={videoRef}
        className="min-w-screen absolute top-0 min-h-screen object-cover"
        src={results[index % results.length]}
        // src={"/video_chunks/capitalone_chunks/chunk_0000_0010.mp4"}
      />
      <div className="absolute bottom-8 w-full max-w-screen-sm rounded-xl border border-border bg-background p-4 transition-all">
        <div className="flex w-full justify-between">
          <Link href="/">
            <Button variant="secondary" className="h-12 min-h-[48px] px-5 text-lg">
              <BrainCircuit className="mr-3 h-6 w-6" /> {tr("Back to Today")}
            </Button>
          </Link>
          <Button
            onClick={() => setMinimized(!minimized)}
            variant="secondary"
            size="icon"
            className="h-12 w-12 min-h-[48px] min-w-[48px]"
          >
            {minimized ? (
              <Plus className="h-6 w-6" />
            ) : (
              <Minus className="h-6 w-6" />
            )}
          </Button>
        </div>
        {minimized ? null : (
          <>
            <div className="mt-4 flex w-full space-x-4">
              <Input
                placeholder={tr("Search through your memories...")}
                className="h-12 grow bg-background text-lg text-foreground placeholder:text-muted-foreground"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <Button
                disabled={value === ""}
                className="h-12 min-h-[48px] px-6 text-lg"
                onClick={() => {
                  setLoading(true);
                  setQuery(value);
                  onSearch();
                  setValue("");
                }}
              >
                {tr("Search")} {" "}
                {loading ? (
                  <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                ) : (
                  <Search className="ml-2 h-5 w-5" />
                )}
              </Button>
            </div>
            {query !== "" ? (
              <div className="mb-2 mt-4 text-center text-lg font-medium">
                {results.length === 0 ? (
                  <div className="text-muted-foreground text-lg">{tr("No matching memories found")}</div>
                ) : (
                  <>
                    {translate(locale, "Showing memories for: {query}", { query })}
                    {results[index] && metadata[results[index]]?.vision_answer && (
                      <div className="mt-3 rounded-lg border border-border bg-muted/70 p-4 text-left text-lg text-foreground">
                        <div className="mb-1 font-semibold text-primary">{tr("About this memory:")}</div>
                        {metadata[results[index]].vision_answer}
                      </div>
                    )}
                    {results[index] && metadata[results[index]]?.people && metadata[results[index]]?.people.length > 0 && (
                      <div className="mt-2 text-lg font-medium text-primary">
                        👤 {metadata[results[index]].people.join(", ")}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
