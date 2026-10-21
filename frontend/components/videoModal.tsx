"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { mediaUrl, API_URL } from "@/lib/api";

export default function VideoModal({
  path,
  open,
  setOpen,
}: {
  path: string;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const [error, setError] = useState<string | null>(null);
  
  // Construct the full backend URL for the video
  const videoUrl = path.startsWith('/video_chunks') 
    ? mediaUrl(path)
    : path;

  useEffect(() => {
    console.log('Video path:', path);
    console.log('Video URL:', videoUrl);
  }, [path, videoUrl]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="aspect-video w-full max-w-screen-lg overflow-hidden bg-black p-0">
        <video 
          autoPlay 
          controls 
          loop 
          src={videoUrl} 
          className="h-full w-full"
          onError={(e) => {
            console.error('Video load error:', e);
            setError('Failed to load video');
          }}
          onLoadedData={() => {
            console.log('Video loaded successfully');
            setError(null);
          }}
        />
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            {error}
            <div className="mt-2 text-sm opacity-70">URL: {videoUrl}</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
