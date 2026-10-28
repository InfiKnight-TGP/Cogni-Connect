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
    print("face_recognition not installed; using OpenCV YuNet + SFace.")


MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')  # see download_models.py
YUNET_MODEL = os.path.join(MODELS_DIR, 'face_detection_yunet_2023mar.onnx')
SFACE_MODEL = os.path.join(MODELS_DIR, 'face_recognition_sface_2021dec.onnx')
FACE_SCORE = 0.8          # YuNet confidence needed to count as a face
MATCH_THRESHOLD = 0.363   # SFace cosine similarity; below this the face is "Unknown"
MAX_DETECT_WIDTH = 640    # big photos are shrunk for detection, then boxes are scaled back


def _model(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"Face model missing: {path}. Run: python download_models.py")
    return path


def detect_faces(img):
    """YuNet faces in a BGR image, most confident first.
    Each row: x, y, w, h, 5 landmark (x, y) pairs, score - in the original image's pixels."""
    scale = min(1.0, MAX_DETECT_WIDTH / img.shape[1])
    small = cv2.resize(img, None, fx=scale, fy=scale) if scale < 1 else img
    # A detector per call keeps this safe across the upload threads
    detector = cv2.FaceDetectorYN.create(_model(YUNET_MODEL), "", (small.shape[1], small.shape[0]), FACE_SCORE)
    _, faces = detector.detect(small)
    if faces is None:
        return []
    faces[:, :14] /= scale
    return sorted(faces, key=lambda f: -f[14])


def has_face(image_path):
    """True if the photo has a clear face (best YuNet confidence >= FACE_SCORE)."""
    if HAVE_FACE_RECOGNITION:
        return bool(face_recognition.face_locations(face_recognition.load_image_file(image_path)))
    img = cv2.imread(image_path)
    if img is None:
        return False
    faces = detect_faces(img)
    return bool(faces) and faces[0][14] >= FACE_SCORE


def known_photos(base_dir):
    known_faces_dir = os.path.join(base_dir, "known_faces")
    people_file = os.path.join(base_dir, "people.json")
    """(person id, photo path) from people.json. Recognition reports the id; app.display_name shows the name."""
    if os.path.exists(people_file):
        with open(people_file, 'r', encoding='utf-8') as f:
            return [(p['id'], os.path.join(known_faces_dir, p['photo'])) for p in json.load(f) if p.get('photo')]
    # Before the app's first run there is no people.json yet; the photo file names are the ids
    return [(os.path.splitext(f)[0], os.path.join(known_faces_dir, f))
            for f in sorted(os.listdir(known_faces_dir)) if f.lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]


def load_known_features(recognizer, base_dir):
    """SFace feature of the best face in each person's photo, computed once per run."""
    ids, features = [], []
    for person_id, path in known_photos(base_dir):
        img = cv2.imread(path)
        faces = detect_faces(img) if img is not None else []
        if not faces:
            print(f"  Warning: no face found in {path}, skipping")
            continue
        ids.append(person_id)
        features.append(recognizer.feature(recognizer.alignCrop(img, faces[0])))
    return ids, features


def recognize_faces(frame, recognizer, known_ids, known_features):
    """Person id for each face in the frame, or "Unknown" if no known face is similar enough."""
    names = []
    for face in detect_faces(frame):
        feature = recognizer.feature(recognizer.alignCrop(frame, face))
        scores = [recognizer.match(feature, k, cv2.FaceRecognizerSF_FR_COSINE) for k in known_features]
        best = int(np.argmax(scores)) if scores else -1
        names.append(known_ids[best] if best >= 0 and scores[best] >= MATCH_THRESHOLD else "Unknown")
    return names


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
    from jsonio import atomic_write_json
    atomic_write_json(json_path, all_transcripts, indent=4)
    
    print(f"✓ Transcription completed for {video_name}")
    return output_dir


def extract_unique_frames(chunks_folder, base_dir):
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
            output_folder = os.path.join(base_dir, "frames", os.path.basename(chunks_folder), video_name)
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


def perform_face_recognition(chunks_folder, base_dir):
    """Perform face recognition on video chunks."""
    print(f"Performing face recognition in: {chunks_folder}")

    if HAVE_FACE_RECOGNITION:
        known_ids, known_faces_encodings = [], []
        for person_id, path in known_photos(base_dir):
            encodings = face_recognition.face_encodings(face_recognition.load_image_file(path))
            if encodings:
                known_ids.append(person_id)
                known_faces_encodings.append(encodings[0])
    else:
        recognizer = cv2.FaceRecognizerSF.create(_model(SFACE_MODEL), "")
        known_ids, known_features = load_known_features(recognizer, base_dir)
    print(f"  Loaded {len(known_ids)} known faces: {known_ids}")

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
                    if HAVE_FACE_RECOGNITION:
                        frame_resized = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
                        face_locations = face_recognition.face_locations(frame_resized)
                        face_encodings = face_recognition.face_encodings(frame_resized, face_locations)
                        names = []
                        for face_encoding in face_encodings:
                            name = "Unknown"
                            if known_faces_encodings:
                                matches = face_recognition.compare_faces(known_faces_encodings, face_encoding, tolerance=0.6)
                                face_distances = face_recognition.face_distance(known_faces_encodings, face_encoding)
                                best_match_index = np.argmin(face_distances)
                                if matches[best_match_index]:
                                    name = known_ids[best_match_index]
                            names.append(name)
                    else:
                        names = recognize_faces(frame, recognizer, known_ids, known_features)

                    for name in names:
                        if name != "Unknown":
                            appearance_records.setdefault(name, []).append(frame_number)

                frame_number += 1

            video_capture.release()

            # Unmatched faces are never recorded, so only known people end up in *_faces.json
            names = list(appearance_records)

            video_appearance_summary = {video_path: names}

            # Save JSON
            json_path = os.path.join(chunks_folder, f'{video_name}_faces.json')
            from jsonio import atomic_write_json
            atomic_write_json(json_path, video_appearance_summary, indent=4)

            print(f"  ✓ Found faces: {names if names else 'No known faces detected'}")

    print(f"✓ Face recognition completed")


def copy_chunks_to_video_chunks(chunks_folder, base_dir):
    """Copy processed chunks to video_chunks directory for frontend access."""
    import shutil
    chunks_name = os.path.basename(chunks_folder)
    
    # 1. Copy to backend/video_chunks
    video_chunks_dir = os.path.join(base_dir, "video_chunks")
    os.makedirs(video_chunks_dir, exist_ok=True)
    dest_folder = os.path.join(video_chunks_dir, chunks_name)
    if os.path.exists(dest_folder):
        shutil.rmtree(dest_folder)
    shutil.copytree(chunks_folder, dest_folder)
    print(f"✓ Copied chunks to {dest_folder}")



def process_uploaded_video(video_path, base_dir):
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
        extract_unique_frames(chunks_folder, base_dir)
        
        # Step 3: Perform face recognition
        print("\nStep 3/4: Performing face recognition...")
        perform_face_recognition(chunks_folder, base_dir)
        
        # Step 4: Copy to video_chunks for frontend
        print("\nStep 4/4: Copying to video_chunks directory...")
        copy_chunks_to_video_chunks(chunks_folder, base_dir)
        
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
    import argparse
    from patient_storage import cli_data_dir
    parser = argparse.ArgumentParser()
    parser.add_argument('video_path')
    base_dir, args = cli_data_dir(parser)
    from pathlib import Path
    video_path = Path(args.video_path).resolve()
    if not video_path.is_relative_to(base_dir / 'content'):
        parser.error('Video must be inside this patient content directory')
    process_uploaded_video(str(video_path), str(base_dir))
