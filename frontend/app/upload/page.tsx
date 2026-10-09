"use client";

import Nav from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Upload, CheckCircle, AlertCircle, Video, Loader2, Calendar } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { DatePickerWithPresets } from "@/components/quiz/datePicker";
import { API_URL } from "@/lib/api";

interface UploadedVideo {
  filename: string;
  size: number;
  uploaded: number;
  journal?: string;
  journal_timestamp?: string;
  date?: string;
}

interface ProcessingStatus {
  status: string;
  message: string;
  progress: number;
}

export default function UploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [currentProcessingFile, setCurrentProcessingFile] = useState<string | null>(null);
  const [journalEntry, setJournalEntry] = useState("");
  const [videoDate, setVideoDate] = useState<Date>(new Date());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch uploaded videos on component mount
  useEffect(() => {
    fetchVideos();
  }, []);

  // Poll for processing status
  useEffect(() => {
    if (currentProcessingFile) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`${API_URL}/processing-status/${currentProcessingFile}`);
          if (response.ok) {
            const status = await response.json();
            setProcessingStatus(status);
            
            // Stop polling if completed or failed
            if (status.status === "completed" || status.status === "failed") {
              setCurrentProcessingFile(null);
              if (status.status === "completed") {
                fetchVideos(); // Refresh video list
              }
            }
          }
        } catch (error) {
          console.error("Error fetching processing status:", error);
        }
      }, 2000); // Poll every 2 seconds

      return () => clearInterval(interval);
    }
  }, [currentProcessingFile]);

  const fetchVideos = async () => {
    try {
      const response = await fetch(`${API_URL}/videos`);
      if (response.ok) {
        const data = await response.json();
        setVideos(data);
      }
    } catch (error) {
      console.error("Error fetching videos:", error);
    } finally {
      setLoadingVideos(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file type
      const validTypes = ["video/mp4", "video/avi", "video/quicktime", "video/x-matroska", "video/webm"];
      if (!validTypes.includes(file.type)) {
        setUploadError("Invalid file type. Please upload MP4, AVI, MOV, MKV, or WEBM files.");
        return;
      }
      
      // Check file size (500MB max)
      const maxSize = 500 * 1024 * 1024;
      if (file.size > maxSize) {
        setUploadError("File size exceeds 500MB limit.");
        return;
      }
      
      setSelectedFile(file);
      setUploadError(null);
      setUploadSuccess(false);
      setJournalEntry(""); // Reset journal when new file is selected
      setVideoDate(new Date()); // Reset date to today
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    setProcessingStatus(null);

    const formData = new FormData();
    formData.append("video", selectedFile);
    formData.append("journal", journalEntry);
    formData.append("date", videoDate.toISOString());

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setUploadSuccess(true);
        setSelectedFile(null);
        setJournalEntry(""); // Clear journal after successful upload
        setVideoDate(new Date()); // Reset date
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        
        // Start polling for processing status
        if (data.processing && data.filename) {
          setCurrentProcessingFile(data.filename);
          setProcessingStatus({
            status: "processing",
            message: "Video processing started...",
            progress: 0
          });
        }
      } else {
        setUploadError(data.error || "Upload failed");
      }
    } catch (error) {
      setUploadError("Network error. Please check if the backend is running.");
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  return (
    <>
      <Nav />
      <main className="flex min-h-screen w-screen items-start justify-center pt-24">
        <div className="w-full max-w-screen-lg space-y-8 px-4 py-8">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-4xl font-bold">Upload Videos</h1>
            <p className="mt-2 text-muted-foreground">
              Upload videos to enhance your memory library
            </p>
          </div>

          {/* Upload Card */}
          <Card>
            <CardHeader>
              <CardTitle>Upload New Video</CardTitle>
              <CardDescription>
                Supported formats: MP4, AVI, MOV, MKV, WEBM (Max 500MB)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* File Input */}
              <div
                className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-12 transition-colors hover:border-primary"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-2 text-sm font-medium">
                  {selectedFile ? selectedFile.name : "Click to select a video file"}
                </p>
                {selectedFile && (
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/avi,video/quicktime,video/x-matroska,video/webm"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {/* Journal Entry Section */}
              {selectedFile && (
                <div className="space-y-4">
                  {/* Date Picker */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Video Date
                    </label>
                    <DatePickerWithPresets date={videoDate} setDate={setVideoDate} />
                    <p className="text-xs text-muted-foreground">
                      When did this memory happen?
                    </p>
                  </div>

                  {/* Journal Entry */}
                  <div className="space-y-2">
                    <label htmlFor="journal" className="text-sm font-medium">
                      Memory Journal (Optional)
                    </label>
                    <Textarea
                      id="journal"
                      placeholder="Write about this memory... What happened? Who was there? How did you feel?"
                      value={journalEntry}
                      onChange={(e) => setJournalEntry(e.target.value)}
                      className="min-h-[120px] resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Add context to help remember this moment better
                    </p>
                  </div>
                </div>
              )}

              {/* Upload Button */}
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="w-full"
                size="lg"
              >
                {uploading ? "Uploading..." : "Upload Video"}
              </Button>

              {/* Success Message */}
              {uploadSuccess && (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-4 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span>Video uploaded successfully!</span>
                </div>
              )}

              {/* Processing Status */}
              {processingStatus && (
                <div className={`flex items-center gap-2 rounded-lg p-4 ${
                  processingStatus.status === "processing" 
                    ? "bg-blue-500/10 text-blue-600" 
                    : processingStatus.status === "completed"
                    ? "bg-green-500/10 text-green-600"
                    : "bg-red-500/10 text-red-600"
                }`}>
                  {processingStatus.status === "processing" && (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  )}
                  {processingStatus.status === "completed" && (
                    <CheckCircle className="h-5 w-5" />
                  )}
                  {processingStatus.status === "failed" && (
                    <AlertCircle className="h-5 w-5" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{processingStatus.message}</p>
                    {processingStatus.status === "processing" && (
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-current opacity-20">
                        <div 
                          className="h-full bg-current transition-all duration-500"
                          style={{ width: `${processingStatus.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Error Message */}
              {uploadError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-4 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                  <span>{uploadError}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Uploaded Videos List */}
          <Card>
            <CardHeader>
              <CardTitle>Uploaded Videos</CardTitle>
              <CardDescription>
                {videos.length} video{videos.length !== 1 ? "s" : ""} in your library
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingVideos ? (
                <p className="text-center text-muted-foreground">Loading videos...</p>
              ) : videos.length === 0 ? (
                <p className="text-center text-muted-foreground">
                  No videos uploaded yet. Upload your first video above!
                </p>
              ) : (
                <div className="space-y-3">
                  {videos.map((video, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-border p-4 transition-colors hover:bg-accent"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <Video className="mt-1 h-5 w-5 text-primary" />
                          <div className="flex-1">
                            <p className="font-medium">{video.filename}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatFileSize(video.size)} • {formatDate(video.uploaded)}
                            </p>
                            {video.date && (
                              <p className="mt-1 flex items-center gap-1 text-sm text-primary">
                                <Calendar className="h-3 w-3" />
                                <span className="font-medium">
                                  {new Date(video.date).toLocaleDateString('en-US', { 
                                    year: 'numeric', 
                                    month: 'long', 
                                    day: 'numeric' 
                                  })}
                                </span>
                              </p>
                            )}
                            {video.journal && (
                              <div className="mt-3 rounded-md bg-muted/50 p-3">
                                <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                                  Memory Journal
                                </p>
                                <p className="text-sm text-foreground whitespace-pre-wrap">
                                  {video.journal}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
