"use client";

import Nav from "@/components/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Upload, CheckCircle, AlertCircle, User, Trash2, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { API_URL } from "@/lib/api";

interface KnownFace {
  name: string;
  path: string; // Changed from filename to match backend
  uploaded: number;
}

export default function FacesPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [personName, setPersonName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [faces, setFaces] = useState<KnownFace[]>([]);
  const [loadingFaces, setLoadingFaces] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch known faces on component mount
  useEffect(() => {
    fetchFaces();
  }, []);

  const fetchFaces = async () => {
    try {
      const response = await fetch(`${API_URL}/known-faces`);
      if (response.ok) {
        const data = await response.json();
        // Backend returns {faces: [...]} format
        setFaces(data.faces || []);
      }
    } catch (error) {
      console.error("Error fetching faces:", error);
    } finally {
      setLoadingFaces(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file type
      const validTypes = ["image/jpeg", "image/jpg", "image/png"];
      if (!validTypes.includes(file.type)) {
        setUploadError("Invalid file type. Please upload JPG or PNG images.");
        return;
      }
      
      // Check file size (10MB max)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        setUploadError("File size exceeds 10MB limit.");
        return;
      }
      
      setSelectedFile(file);
      setUploadError(null);
      setUploadSuccess(false);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !personName.trim()) {
      setUploadError("Please select an image and enter a person's name.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    const formData = new FormData();
    formData.append("face", selectedFile);
    formData.append("name", personName.trim());

    try {
      const response = await fetch(`${API_URL}/upload-face`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setUploadSuccess(true);
        setSelectedFile(null);
        setPersonName("");
        setPreviewUrl(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        // Refresh faces list
        fetchFaces();
      } else {
        setUploadError(data.error || "Upload failed");
      }
    } catch (error) {
      setUploadError("Network error. Please check if the backend is running.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm("Are you sure you want to delete this face?")) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/delete-face/${filename}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchFaces();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete face");
      }
    } catch (error) {
      alert("Network error. Please check if the backend is running.");
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setPersonName("");
    setUploadError(null);
    setUploadSuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
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
            <h1 className="text-4xl font-bold">Manage Known Faces</h1>
            <p className="mt-2 text-muted-foreground">
              Upload photos of people to enable face recognition in videos
            </p>
          </div>

          {/* Upload Card */}
          <Card>
            <CardHeader>
              <CardTitle>Add New Face</CardTitle>
              <CardDescription>
                Upload a clear photo of a person&apos;s face (JPG or PNG, max 10MB)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                {/* File Input Section */}
                <div className="space-y-4">
                  <div
                    className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-primary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {previewUrl ? (
                      <div className="relative">
                        <img
                          src={previewUrl}
                          alt="Preview"
                          className="h-48 w-48 rounded-lg object-cover"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            clearSelection();
                          }}
                          className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-white hover:bg-destructive/90"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Upload className="mb-4 h-12 w-12 text-muted-foreground" />
                        <p className="mb-2 text-sm font-medium">
                          Click to select a photo
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Clear frontal face photo works best
                        </p>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Name Input Section */}
                <div className="flex flex-col justify-center space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="personName" className="text-sm font-medium">
                      Person&apos;s Name *
                    </label>
                    <Input
                      id="personName"
                      placeholder="Enter full name"
                      value={personName}
                      onChange={(e) => setPersonName(e.target.value)}
                      className="text-base"
                    />
                    <p className="text-xs text-muted-foreground">
                      This name will be used to identify the person in videos
                    </p>
                  </div>

                  {selectedFile && (
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Button */}
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || !personName.trim() || uploading}
                className="w-full"
                size="lg"
              >
                {uploading ? "Uploading..." : "Add Face"}
              </Button>

              {/* Success Message */}
              {uploadSuccess && (
                <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-4 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span>Face added successfully! Ready for recognition.</span>
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

          {/* Known Faces List */}
          <Card>
            <CardHeader>
              <CardTitle>Known Faces</CardTitle>
              <CardDescription>
                {faces.length} {faces.length === 1 ? "person" : "people"} registered for face recognition
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingFaces ? (
                <p className="text-center text-muted-foreground">Loading faces...</p>
              ) : faces.length === 0 ? (
                <div className="text-center py-8">
                  <User className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
                  <p className="mt-4 text-muted-foreground">
                    No faces added yet. Add your first face above!
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {faces.map((face, index) => (
                    <div
                      key={index}
                      className="group relative overflow-hidden rounded-lg border border-border transition-all hover:shadow-md"
                    >
                      <div className="aspect-square bg-muted">
                        <img
                          src={`${API_URL}/known-faces/${face.path}`}
                          alt={face.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="p-3">
                        <p className="font-medium capitalize">{face.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Added {formatDate(face.uploaded)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(face.path)}
                        className="absolute right-2 top-2 rounded-full bg-destructive p-2 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/90"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
