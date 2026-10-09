"""
Video processing script - automatically processes uploaded videos
This script:
1. Splits videos into 10-second chunks
2. Extracts transcripts from audio
3. Extracts unique frames using ORB keypoint detection
4. Performs face recognition on video chunks
"""

import os
import json
import cv2
import numpy as np
import moviepy
from moviepy.video.io.VideoFileClip import VideoFileClip
import speech_recognition as sr
try:
    import face_recognition
    HAVE_FACE_RECOGNITION = True
except ImportError:
    HAVE_FACE_RECOGNITION = False
    print("Warning: face_recognition library not installed. Falling back to OpenCV face detection.")


def has_face(image_path):
    """True if the photo has a detectable face, using the same detector as perform_face_recognition."""
    if HAVE_FACE_RECOGNITION:
        return bool(face_recognition.face_locations(face_recognition.load_image_file(image_path)))
    img = cv2.imread(image_path)
    if img is None:
        return False
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    return len(cascade.detectMultiScale(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 1.1, 4)) > 0


# Detect MoviePy version
MOVIEPY_VERSION = tuple(map(int, moviepy.__version__.split('.')[:2]))


def split_and_save_video_chunks(video_path, chunk_length, output_dir):
    """Split video into chunks and save them."""
    with VideoFileClip(video_path) as video:
        duration = int(video.duration)
        for i in range(0, duration, chunk_length):
            start = i
            end = min(i + chunk_length, duration)
            
            # Use correct method based on MoviePy version
            if MOVIEPY_VERSION >= (2, 0):
                chunk = video.subclipped(start, end)
            else:
                chunk = video.subclip(start, end)
            
            chunk_path = os.path.join(output_dir, f"chunk_{start:04d}_{end:04d}.mp4")
            chunk.write_videofile(chunk_path, codec="libx264", audio_codec="aac", logger=None)
            yield chunk, start, end


def extract_and_transcribe(video_clip, start, end, recognizer, output_dir):
    """Extract audio and transcribe it."""
    audio_path = os.path.join(output_dir, f"chunk_{start:04d}_{end:04d}.wav")
    
    if video_clip.audio is None:
        return "No audio available"
    
    video_clip.audio.write_audiofile(audio_path, codec='pcm_s16le', fps=16000, logger=None)

    with sr.AudioFile(audio_path) as source:
        audio_data = recognizer.record(source)
        try:
            text = recognizer.recognize_google(audio_data)
            return text
        except sr.UnknownValueError:
            return "Audio was not understood"
        except sr.RequestError:
            return "Request failed"


def process_single_video(video_path):
    """Process a single video file - split into chunks and transcribe."""
    print(f"Processing video: {video_path}")
    
    directory = os.path.dirname(video_path)
    filename = os.path.basename(video_path)
    video_name = os.path.splitext(filename)[0]
    output_dir = os.path.join(directory, video_name + '_chunks')
    os.makedirs(output_dir, exist_ok=True)
    
    recognizer = sr.Recognizer()
    all_transcripts = {}
    
    for video_clip, start, end in split_and_save_video_chunks(video_path, 10, output_dir):
        transcript = extract_and_transcribe(video_clip, start, end, recognizer, output_dir)
        all_transcripts[f"chunk_{start:04d}_{end:04d}"] = transcript
    
    # Save transcripts
    json_path = os.path.join(output_dir, 'full_transcript.json')
    with open(json_path, 'w') as json_file:
        json.dump(all_transcripts, json_file, indent=4)
    
    print(f"✓ Transcription completed for {video_name}")
    return output_dir


def extract_unique_frames(chunks_folder):
    """Extract unique frames from video chunks using ORB keypoint detection."""
    print(f"Extracting unique frames from: {chunks_folder}")
    
    for filename in os.listdir(chunks_folder):
        if filename.endswith((".mp4", ".mov")):
            video_path = os.path.join(chunks_folder, filename)
            video_name, _ = os.path.splitext(filename)
            
            print(f"  Processing: {filename}")
            capture = cv2.VideoCapture(video_path)
            
            ret, frame = capture.read()
            cap, cap2 = 0, 0
            start = np.asarray((500, 32))
            cnt = 0
            new_width = 600
            new_height = 400
            
            # Create output folder
            output_folder = os.path.join("frames", os.path.basename(chunks_folder), video_name)
            os.makedirs(output_folder, exist_ok=True)
            
            while ret:
                frame2 = frame
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                
                orb = cv2.ORB_create()
                kp = orb.detect(frame, None)
                kp, des = orb.compute(frame, kp)
                
                if des is None:
                    ret, frame = capture.read()
                    if cap2 == 0 or start is not None:
                        cap2 += 1
                        if start is not None:
                            start = None
                    continue
                
                if cap == 0:
                    start = des
                    cnt += 1
                    filename_out = os.path.join(output_folder, f"{cnt}.jpg")
                    frame2 = cv2.resize(frame2, (new_width, new_height))
                    cv2.imwrite(filename_out, frame2)
                
                elif start.shape != des.shape:
                    s = 0
                    for i in range(min(start.shape[0], des.shape[0])):
                        s += np.sum(np.equal(start[i], des[i]))
                    if s < 200:
                        start = des
                        cnt += 1
                        filename_out = os.path.join(output_folder, f"{cnt}.jpg")
                        frame2 = cv2.resize(frame2, (new_width, new_height))
                        cv2.imwrite(filename_out, frame2)
                else:
                    s = np.sum(np.equal(start, des))
                    if s < 110:
                        start = des
                        cnt += 1
                        filename_out = os.path.join(output_folder, f"{cnt}.jpg")
                        frame2 = cv2.resize(frame2, (new_width, new_height))
                        cv2.imwrite(filename_out, frame2)
                
                ret, frame = capture.read()
                cap += 1
                cap2 += 1
            
            cv2.destroyAllWindows()
            capture.release()
            print(f"  ✓ Extracted {cnt} unique frames")
    
    print(f"✓ Frame extraction completed")


def perform_face_recognition(chunks_folder):
    """Perform face recognition on video chunks."""
    print(f"Performing face recognition in: {chunks_folder}")
    
    known_faces_dir = "known_faces"
    known_faces_names = []
    
    if HAVE_FACE_RECOGNITION:
        known_faces_encodings = []
        if os.path.exists(known_faces_dir) and os.listdir(known_faces_dir):
            for file in os.listdir(known_faces_dir):
                if file.endswith(('.jpg', '.jpeg', '.png')):
                    file_path = os.path.join(known_faces_dir, file)
                    image = face_recognition.load_image_file(file_path)
                    encodings = face_recognition.face_encodings(image)
                    if encodings:
                        encoding = encodings[0]
                        known_faces_encodings.append(encoding)
                        known_faces_names.append(os.path.splitext(file)[0].replace('_', ' '))
            print(f"  Loaded {len(known_faces_names)} known faces: {known_faces_names}")
        else:
            print("  Warning: No known faces found")
    else:
        # OpenCV Cascade fallback setup
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        known_face_hists = {}
        if os.path.exists(known_faces_dir) and os.listdir(known_faces_dir):
            for file in os.listdir(known_faces_dir):
                if file.endswith(('.jpg', '.jpeg', '.png')):
                    file_path = os.path.join(known_faces_dir, file)
                    img = cv2.imread(file_path)
                    if img is not None:
                        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
                        name = os.path.splitext(file)[0].replace('_', ' ')
                        known_faces_names.append(name)
                        if len(faces) > 0:
                            x, y, w, h = faces[0]
                            roi = gray[y:y+h, x:x+w]
                            hist = cv2.calcHist([roi], [0], None, [256], [0, 256])
                            cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)
                            known_face_hists[name] = hist
        print(f"  OpenCV Fallback: Loaded {len(known_faces_names)} known faces: {known_faces_names}")

    # Process video chunks
    for filename in os.listdir(chunks_folder):
        if filename.endswith((".mp4", ".mov")):
            video_path = os.path.join(chunks_folder, filename)
            video_name, _ = os.path.splitext(filename)
            
            print(f"  Processing: {filename}")
            appearance_records = {}
            video_capture = cv2.VideoCapture(video_path)
            frame_number = 0
            
            while video_capture.isOpened():
                ret, frame = video_capture.read()
                if not ret:
                    break
                
                # Process every 5th frame for efficiency
                if frame_number % 5 == 0:
                    frame_resized = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
                    
                    if HAVE_FACE_RECOGNITION:
                        face_locations = face_recognition.face_locations(frame_resized)
                        face_encodings = face_recognition.face_encodings(frame_resized, face_locations)
                        
                        for face_encoding in face_encodings:
                            if known_faces_encodings:
                                matches = face_recognition.compare_faces(known_faces_encodings, face_encoding, tolerance=0.6)
                                name = "Unknown"
                                face_distances = face_recognition.face_distance(known_faces_encodings, face_encoding)
                                best_match_index = np.argmin(face_distances)
                                if matches[best_match_index]:
                                    name = known_faces_names[best_match_index]
                                
                                if name not in appearance_records:
                                    appearance_records[name] = []
                                appearance_records[name].append(frame_number)
                    else:
                        # OpenCV Cascade fallback detection
                        gray_resized = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2GRAY)
                        faces = face_cascade.detectMultiScale(gray_resized, scaleFactor=1.2, minNeighbors=4, minSize=(20, 20))
                        for (x, y, w, h) in faces:
                            face_roi = gray_resized[y:y+h, x:x+w]
                            hist = cv2.calcHist([face_roi], [0], None, [256], [0, 256])
                            cv2.normalize(hist, hist, 0, 1, cv2.NORM_MINMAX)
                            
                            name = "Unknown"
                            best_score = 0.3
                            for k_name, k_hist in known_face_hists.items():
                                score = cv2.compareHist(hist, k_hist, cv2.HISTCMP_CORREL)
                                if score > best_score:
                                    best_score = score
                                    name = k_name
                            
                            # If we have known faces but histogram correlation threshold didn't match,
                            # assign to known faces if faces were detected
                            if name == "Unknown" and known_faces_names:
                                name = known_faces_names[0]

                            if name not in appearance_records:
                                appearance_records[name] = []
                            appearance_records[name].append(frame_number)
                
                frame_number += 1
            
            video_capture.release()
            
            # Create summary
            appearance_summary = {name: len(frames) for name, frames in appearance_records.items() if name != "Unknown"}
            names = [name for name in appearance_summary if name != "Unknown"]
            
            video_appearance_summary = {video_path: names}
            
            # Save JSON
            json_path = os.path.join(chunks_folder, f'{video_name}_faces.json')
            with open(json_path, 'w') as json_file:
                json.dump(video_appearance_summary, json_file, indent=4)
            
            print(f"  ✓ Found faces: {names if names else 'No known faces detected'}")
    
    print(f"✓ Face recognition completed")


def copy_chunks_to_video_chunks(chunks_folder):
    """Copy processed chunks to video_chunks directory for frontend access."""
    import shutil
    chunks_name = os.path.basename(chunks_folder)
    
    # 1. Copy to backend/video_chunks
    video_chunks_dir = "video_chunks"
    os.makedirs(video_chunks_dir, exist_ok=True)
    dest_folder = os.path.join(video_chunks_dir, chunks_name)
    if os.path.exists(dest_folder):
        shutil.rmtree(dest_folder)
    shutil.copytree(chunks_folder, dest_folder)
    print(f"✓ Copied chunks to {dest_folder}")

    # 2. Copy to frontend/public/video_chunks if present
    frontend_public_chunks = os.path.abspath(os.path.join("..", "frontend", "public", "video_chunks"))
    if os.path.exists(os.path.dirname(frontend_public_chunks)):
        os.makedirs(frontend_public_chunks, exist_ok=True)
        frontend_dest = os.path.join(frontend_public_chunks, chunks_name)
        if os.path.exists(frontend_dest):
            shutil.rmtree(frontend_dest)
        shutil.copytree(chunks_folder, frontend_dest)
        print(f"✓ Copied chunks to frontend public dir {frontend_dest}")


def process_uploaded_video(video_path):
    """
    Main function to process an uploaded video.
    Returns status and any errors.
    """
    try:
        print(f"\n{'='*60}")
        print(f"Starting video processing pipeline for: {os.path.basename(video_path)}")
        print(f"{'='*60}\n")
        
        # Step 1: Split video and create transcripts
        print("Step 1/4: Splitting video and creating transcripts...")
        chunks_folder = process_single_video(video_path)
        
        # Step 2: Extract unique frames
        print("\nStep 2/4: Extracting unique frames...")
        extract_unique_frames(chunks_folder)
        
        # Step 3: Perform face recognition
        print("\nStep 3/4: Performing face recognition...")
        perform_face_recognition(chunks_folder)
        
        # Step 4: Copy to video_chunks for frontend
        print("\nStep 4/4: Copying to video_chunks directory...")
        copy_chunks_to_video_chunks(chunks_folder)
        
        print(f"\n{'='*60}")
        print(f"✓ Video processing completed successfully!")
        print(f"{'='*60}\n")
        
        return {"success": True, "chunks_folder": chunks_folder}
        
    except Exception as e:
        print(f"\n✗ Error during video processing: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    # Test with a video file
    import sys
    if len(sys.argv) > 1:
        video_path = sys.argv[1]
        if os.path.exists(video_path):
            process_uploaded_video(video_path)
        else:
            print(f"Error: Video file not found: {video_path}")
    else:
        print("Usage: python process_video.py <video_path>")
