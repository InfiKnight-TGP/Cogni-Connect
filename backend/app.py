from flask import Flask, request, jsonify, send_from_directory, Response, g
from flask_cors import CORS
import json
from openai import OpenAI
import os
from dotenv import load_dotenv
import base64
import re
import shutil
import cv2
from werkzeug.utils import secure_filename
from patient_storage import scoped, patient_path, configure, initialize_patient
import threading
import sys
import uuid
from io import BytesIO
from urllib.parse import unquote
from datetime import datetime

# process_video prints "✓"; under `npm run dev` stdout is a pipe, which Windows encodes as cp1252
sys.stdout.reconfigure(encoding="utf-8")

# Load environment variables from .env file
load_dotenv()

api = Flask(__name__)

# Configuration for file uploads
UPLOAD_FOLDER = scoped('content')
KNOWN_FACES_FOLDER = scoped('known_faces')
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm'}
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png'}
api.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
api.config['KNOWN_FACES_FOLDER'] = KNOWN_FACES_FOLDER
api.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max file size

# Track processing status
processing_status = {}  
thumbnail_slots = threading.BoundedSemaphore(2)
NEUTRAL_THUMBNAIL = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAQCAYAAAB49x7jAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAAAwABQAB'
    'JzQnCgAAAABJRU5ErkJggg=='
)

client = OpenAI(
    api_key=os.getenv('OPENAI_API_KEY', 'not_configured')
)
AI_AVAILABLE = bool(os.getenv('OPENAI_API_KEY') and os.getenv('OPENAI_API_KEY') not in ('not_configured', 'your_openai_api_key_here'))

MAX_TRANSCRIPTION_BYTES = 25 * 1024 * 1024

QAS_PATH = scoped('qas.json')  

# Runtime data is not in git; start each file empty if it's missing (examples in sample_data/).
# people.json is created by _load_people(), which imports known_faces/ on first run.
def ensure_runtime_data():
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(KNOWN_FACES_FOLDER, exist_ok=True)
    for path, default in {
        QAS_PATH: [],
        PERFORMANCE_PATH: {"scores": [], "game_scores": []},
        JOURNALS_PATH: {},
        ROUTINES_PATH: {"steps": []},
    }.items():
        if not os.path.exists(path):
            with open(path, 'w', encoding='utf-8') as stream:
                json.dump(default, stream, indent=2)


VIDEO_CHUNKS_ROOT = scoped('video_chunks')  
SUMMARY_ROOT = scoped('summary')
FRAMES_ROOT = scoped('frames')  # process_video writes frames/<video>_chunks/chunk_SSSS_EEEE/<n>.jpg
JOURNALS_PATH = scoped('video_journals.json')
CROSSWORDS_PATH = scoped('crosswords.json')
MEMORIES_PATH = scoped('memories.json')
THUMBNAILS_ROOT = scoped('memory_thumbnails')


def _memory_data():
    """Return the opaque-id index for this patient's uploaded videos."""
    try:
        with open(MEMORIES_PATH, 'r', encoding='utf-8') as stream:
            data = json.load(stream)
    except (OSError, ValueError, TypeError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    changed = False
    journal_rows = {}
    try:
        with open(JOURNALS_PATH, 'r', encoding='utf-8') as stream:
            journal_rows = json.load(stream)
    except (OSError, ValueError, TypeError):
        journal_rows = {}
    if not isinstance(journal_rows, dict):
        journal_rows = {}
    candidates = set()
    for filename in os.listdir(UPLOAD_FOLDER) if os.path.isdir(UPLOAD_FOLDER) else []:
        if allowed_file(filename): candidates.add(filename)
    for filename in journal_rows:
        if isinstance(filename, str) and allowed_file(filename): candidates.add(filename)
    chunks_root = os.path.abspath(VIDEO_CHUNKS_ROOT)
    if os.path.isdir(chunks_root):
        for folder in os.listdir(chunks_root):
            if folder.endswith('_chunks') and os.path.isdir(os.path.join(chunks_root, folder)):
                stem = folder[:-7]
                journal_match = next((name for name in journal_rows if isinstance(name, str) and name.rsplit('.', 1)[0] == stem), None)
                candidates.add(journal_match or (stem + '.mp4'))
    existing_by_filename = {row.get('filename'): (memory_id, row) for memory_id, row in data.items() if isinstance(row, dict) and row.get('filename')}
    for filename in sorted(candidates):
        if filename in existing_by_filename:
            continue
        content_path = os.path.join(os.path.abspath(UPLOAD_FOLDER), filename)
        chunk_folder = os.path.join(chunks_root, os.path.splitext(filename)[0] + '_chunks')
        if not os.path.isfile(content_path) and not os.path.isdir(chunk_folder):
            continue
        journal = journal_rows.get(filename, {}) if isinstance(journal_rows.get(filename, {}), dict) else {}
        data[uuid.uuid4().hex] = {'filename': filename, 'createdAt': os.path.getmtime(content_path) if os.path.isfile(content_path) else datetime.now().timestamp(),
                                  'title': journal.get('title') or os.path.splitext(filename)[0], 'date': journal.get('date'), 'note': journal.get('entry', '')}
        changed = True
    for memory_id, row in list(data.items()):
        filename = row.get('filename') if isinstance(row, dict) else None
        if not filename:
            continue
        if not os.path.isfile(os.path.join(os.path.abspath(UPLOAD_FOLDER), filename)) and not os.path.isdir(os.path.join(chunks_root, os.path.splitext(filename)[0] + '_chunks')):
            data.pop(memory_id, None); changed = True
    seen_filenames = set()
    for memory_id, row in list(data.items()):
        filename = row.get('filename') if isinstance(row, dict) else None
        if filename in seen_filenames:
            data.pop(memory_id, None); changed = True
        elif filename:
            seen_filenames.add(filename)
    if changed or not os.path.exists(MEMORIES_PATH):
        with open(MEMORIES_PATH, 'w', encoding='utf-8') as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
    return data


def _memory_for_id(memory_id):
    if not isinstance(memory_id, str) or not re.fullmatch(r'[0-9a-f]{32}', memory_id):
        return None
    row = _memory_data().get(memory_id)
    return row if isinstance(row, dict) and isinstance(row.get('filename'), str) else None


def _safe_media_path(value):
    """Reject traversal and encoded separators before send_from_directory."""
    if not isinstance(value, str) or not value or '\\' in value or '\x00' in value:
        return False
    decoded = unquote(value)
    if decoded != value or decoded.startswith('/') or decoded.startswith('\\'):
        return False
    parts = decoded.split('/')
    return all(part not in ('', '.', '..') for part in parts)


def allowed_file(filename):
    """Check if file has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def allowed_image_file(filename):
    """Check if image file has an allowed extension."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


def extract_frame_from_video(video_path):
    """Extract a single frame from the middle of a video and encode as base64."""
    try:
        cap = cv2.VideoCapture(video_path)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Get middle frame
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_count // 2)
        ret, frame = cap.read()
        cap.release()
        
        if not ret:
            return None
        
        # Encode frame as JPEG
        _, buffer = cv2.imencode('.jpg', frame)
        return base64.b64encode(buffer).decode('utf-8')
    except Exception as e:
        print(f"Error extracting frame: {e}")
        return None


def analyze_video_with_vision(video_paths, query):
    """Use GPT-4 Vision to analyze video frames and answer queries."""
    try:
        # Extract frames from videos
        frames_data = []
        for video_path in video_paths[:3]:  # Limit to 3 videos to save API costs
            full_path = os.path.join(os.path.abspath(VIDEO_CHUNKS_ROOT), 
                                    video_path.replace(f"/video_chunks/", "").replace("/", os.sep))
            if os.path.exists(full_path):
                frame_base64 = extract_frame_from_video(full_path)
                if frame_base64:
                    frames_data.append({
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{frame_base64}"
                        }
                    })
        
        if not frames_data:
            return None
        
        # Build message content with text and images
        content = [
            {"type": "text", "text": f"User query: {query}\n\nAnalyze these video frames and answer the query. Be specific about locations, settings, and context visible in the images."}
        ]
        content.extend(frames_data)
        
        # Call GPT-4 Vision
        response = client.chat.completions.create(
            model="gpt-4o",  # or gpt-4-vision-preview
            messages=[
                {
                    "role": "user",
                    "content": content
                }
            ],
            max_tokens=500
        )
        
        return response.choices[0].message.content
    except Exception as e:
        print(f"Vision API error: {e}")
        return None            


@api.route('/questions')
def questions():
    try:
        with open(QAS_PATH, "r", encoding='utf-8') as file:
            questions_data = json.load(file)
            # Return in the format the frontend expects
            return jsonify({"questions": questions_data})
    except Exception as e:
        return jsonify({"error": f"Could not read questions file: {e}"}), 404


@api.route('/accuracy')
def accuracy():
    given = request.args.get('given')
    real = request.args.get('real')
    if not given or not real:
        return jsonify(error="Both answers are required"), 400
    video_path = request.args.get('video')  # Get video path to find journal
    journal = None
    
    # Try to get journal entry for additional context
    if video_path:
        try:
            # Extract video name from path
            video_name = video_path.split('/')[-2].replace('_chunks', '')
            journal_file = JOURNALS_PATH
            if os.path.exists(journal_file):
                with open(journal_file, 'r', encoding='utf-8') as f:
                    journals = json.load(f)
                    # Try to find matching journal
                    for vid_name, journal_data in journals.items():
                        if video_name in vid_name or vid_name in video_name:
                            journal = journal_data.get('entry')
                            break
        except:
            pass  # If journal retrieval fails, continue without it
    
    score = gpt_accuracy(given, real, journal)
    # An unavailable evaluator or invalid response is not a cognitive score.
    try:
        score_int = int(score)
        if isinstance(score, bool) or (isinstance(score, float) and not score.is_integer()) or not 0 <= score_int <= 10:
            raise ValueError("Score out of range")
    except (ValueError, TypeError, OverflowError):
        return jsonify(error="Answer evaluation is unavailable. Your answer has not been scored."), 503
    
    return jsonify(score_int)


def gpt_accuracy(answer1, answer2, journal_context=None):
    # An unavailable evaluator must never fabricate cognitive performance.
    if not client.api_key or client.api_key == 'not_configured':
        return None
    try:
        # Build the prompt with journal context if available
        prompt = (
            f"Determine the accuracy of the given answer compared to the real answer. "
            "Accuracy should be on a scale of 1 to 10 with 10 being almost the same. "
            "Allow for slight variation and different phrasing. "
            "Award more points for capturing the correct main idea and key details. "
        )
        
        if journal_context:
            prompt += f"\n\nAdditional context from journal entry: {journal_context}\n"
        
        prompt += f"\nGiven answer: {answer1}\nTrue answer: {answer2}\n\nOnly return the number (1-10)."
        
        response = client.chat.completions.create(
            model=os.getenv('OPENAI_MODEL', 'gpt-4o-mini'),
            messages=[
                {"role": "system", "content": "You are an accuracy evaluator for memory quiz answers. Consider the semantic meaning and key details rather than exact wording."},
                {"role": "user", "content": prompt}
            ]
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error with OpenAI API: {e}"


@api.route('/transcribe', methods=['POST'])
def transcribe():
    if not client.api_key or client.api_key == 'not_configured':
        return jsonify(error="Speech transcription is unavailable."), 503
    if request.content_length and request.content_length > MAX_TRANSCRIPTION_BYTES + 64 * 1024:
        return jsonify(error="Audio must be 25 MB or smaller."), 413
    audio = request.files.get('audio')
    language = request.form.get('language', 'en-IN')
    if audio is None:
        return jsonify(error="Audio is required."), 400
    payload = audio.stream.read(MAX_TRANSCRIPTION_BYTES + 1)
    if len(payload) > MAX_TRANSCRIPTION_BYTES:
        return jsonify(error="Audio must be 25 MB or smaller."), 413
    try:
        result = client.audio.transcriptions.create(
            model='whisper-1',
            file=(audio.filename or 'answer.webm', BytesIO(payload), audio.mimetype or 'audio/webm'),
            language=language.split('-', 1)[0],
        )
        return jsonify(text=result.text)
    except Exception:
        return jsonify(error="Speech transcription is unavailable."), 503


@api.route('/speak', methods=['POST'])
def speak():
    if not client.api_key or client.api_key == 'not_configured':
        return jsonify(error="Speech synthesis is unavailable."), 503
    payload = request.get_json(silent=True) or {}
    text = payload.get('text')
    if not isinstance(text, str) or not text.strip() or len(text) > 4000:
        return jsonify(error="Text is required (up to 4000 characters)."), 400
    try:
        response = client.audio.speech.create(model='tts-1', voice='alloy', input=text)
        return response.content, 200, {'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store'}
    except Exception:
        return jsonify(error="Speech synthesis is unavailable."), 503


@api.route('/search')
def search():
    query = request.args.get('query')
    
    # Read transcripts and face data from video_chunks folders
    ref = {}
    face_data = {}
    chunks_root_abs = os.path.abspath(VIDEO_CHUNKS_ROOT)
    
    try:
        people = _load_people()
        # Scan all chunk folders
        for folder_name in os.listdir(chunks_root_abs):
            folder_path = os.path.join(chunks_root_abs, folder_name)
            if not os.path.isdir(folder_path):
                continue
            
            # Look for full_transcript.json
            transcript_path = os.path.join(folder_path, 'full_transcript.json')
            if os.path.exists(transcript_path):
                with open(transcript_path, 'r', encoding='utf-8') as f:
                    transcripts = json.load(f)
                    
                # Map each chunk to its transcript
                for chunk_name, transcript_text in transcripts.items():
                    video_path = f"/video_chunks/{folder_name}/{chunk_name}.mp4"
                    ref[video_path] = transcript_text
            
            # Look for face recognition data
            for file in os.listdir(folder_path):
                if file.endswith('_faces.json'):
                    face_json_path = os.path.join(folder_path, file)
                    with open(face_json_path, 'r', encoding='utf-8') as f:
                        face_info = json.load(f)
                        # Map to video path
                        chunk_name = file.replace('_faces.json', '')
                        video_path = f"/video_chunks/{folder_name}/{chunk_name}.mp4"
                        # Extract names from face data (handle different JSON structures)
                        for path, names in face_info.items():
                            if names and isinstance(names, list):
                                face_data[video_path] = [display_name(n, people, relation=True) for n in names]
                                break  # Only need one entry per file
        
        # If no transcripts found, return all available videos
        if not ref and not face_data:
            all_videos = []
            for folder_name in os.listdir(chunks_root_abs):
                folder_path = os.path.join(chunks_root_abs, folder_name)
                if os.path.isdir(folder_path):
                    for file in os.listdir(folder_path):
                        if file.endswith('.mp4'):
                            all_videos.append(f"/video_chunks/{folder_name}/{file}")
            return jsonify(all_videos)
        
        # Try using GPT for semantic search if API key is configured
        api_key = os.getenv('OPENAI_API_KEY', 'not_configured')
        if api_key and api_key != 'not_configured' and api_key != 'your_openai_api_key_here':
            try:
                # Combine transcript and face data for context
                combined_context = {}
                for video_path in set(list(ref.keys()) + list(face_data.keys())):
                    context_parts = []
                    if video_path in ref:
                        context_parts.append(f"Transcript: {ref[video_path]}")
                    if video_path in face_data:
                        context_parts.append(f"People visible: {', '.join(face_data[video_path])}")
                    combined_context[video_path] = "; ".join(context_parts)
                
                response = client.chat.completions.create(
                    model='gpt-4',
                    messages=[
                        {"role": "system", "content": "You are a video search assistant. Analyze the video metadata and return ONLY a JSON array of video file paths that match the user's query. Return [] if no matches."},
                        {"role": "user", "content": (
                            f"Query: {query}\n\n"
                            f"Available videos with metadata:\n{json.dumps(combined_context, indent=2)}\n\n"
                            "Return only the array of matching video paths as JSON, nothing else."
                        )}
                    ]
                )
                result = response.choices[0].message.content.strip()
                # Try to parse as JSON
                if result.startswith('['):
                    matched_videos = json.loads(result)
                    if matched_videos:
                        return jsonify(matched_videos)
            except Exception as e:
                print(f"GPT search failed, falling back to keyword matching: {e}")
        
        # Fallback: Simple keyword matching for transcripts and face names
        query_lower = query.lower()
        matched_videos = []
        
        # Check transcripts
        for video_path, transcript in ref.items():
            if query_lower in transcript.lower():
                matched_videos.append(video_path)
        
        # Check face names for queries about people
        if any(word in query_lower for word in ['who', 'person', 'people', 'face', 'he', 'she', 'they']):
            # Return all videos with identified faces
            for video_path, names in face_data.items():
                if names:  # Only if faces were actually identified
                    matched_videos.append(video_path)
        
        # Also check if query contains any person's name
        for video_path, names in face_data.items():
            for name in names:
                if name.lower() in query_lower:
                    matched_videos.append(video_path)
        
        # Remove duplicates and return
        matched_videos = list(set(matched_videos))
        
        # Check if query needs visual analysis (location, objects, actions, scenes, identification)
        visual_keywords = ['where', 'location', 'place', 'setting', 'which', 'what', 'zoo', 
                          'building', 'background', 'scene', 'happening', 'doing', 'wearing',
                          'see', 'visible', 'show', 'looks', 'appears', 'behind']
        needs_vision = any(keyword in query_lower for keyword in visual_keywords)
        
        # If no specific matches found or query needs visual understanding, use all videos
        if not matched_videos:
            matched_videos = list(set(list(ref.keys()) + list(face_data.keys())))
        
        if needs_vision and matched_videos:
            # Use Vision API to analyze frames
            vision_answer = analyze_video_with_vision(matched_videos, query)
            if vision_answer:
                # Return results with Vision API answer
                results = []
                for video_path in matched_videos:
                    result = {"path": video_path, "vision_answer": vision_answer}
                    if video_path in face_data and face_data[video_path]:
                        result["people"] = face_data[video_path]
                    if video_path in ref:
                        result["transcript"] = ref[video_path]
                    results.append(result)
                return jsonify(results)
        
        if matched_videos:
            # Include metadata about what was found
            results = []
            for video_path in matched_videos:
                result = {"path": video_path}
                if video_path in face_data and face_data[video_path]:
                    result["people"] = face_data[video_path]
                if video_path in ref:
                    result["transcript"] = ref[video_path]
                results.append(result)
            return jsonify(results)
        
        # Otherwise return all videos (no matches)
        all_paths = list(set(list(ref.keys()) + list(face_data.keys())))
        results = []
        for video_path in all_paths:
            result = {"path": video_path}
            if video_path in face_data and face_data[video_path]:
                result["people"] = face_data[video_path]
            if video_path in ref:
                result["transcript"] = ref[video_path]
            results.append(result)
        return jsonify(results)
        
    except Exception as e:
        print(f"Error in search: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/upload', methods=['POST'])
def upload_video():
    """Handle video file uploads and trigger processing."""
    try:
        base_dir = patient_path("")
        # Check if file is in request
        if 'video' not in request.files:
            return jsonify({"error": "No video file provided"}), 400
        
        file = request.files['video']
        journal_entry = request.form.get('journal', '')  # Get optional journal entry
        video_date = request.form.get('date', '')  # Get video date
        
        # Check if file is selected
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Validate file type
        if not allowed_file(file.filename):
            return jsonify({"error": f"Invalid file type. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"}), 400
        
        # Secure the filename and save
        filename = secure_filename(file.filename)
        filepath = os.path.join(api.config['UPLOAD_FOLDER'], filename)
        
        # Check if file already exists
        counter = 1
        base_name, extension = os.path.splitext(filename)
        while os.path.exists(filepath):
            filename = f"{base_name}_{counter}{extension}"
            filepath = os.path.join(api.config['UPLOAD_FOLDER'], filename)
            counter += 1
        
        file.save(filepath)

        memories = _memory_data()
        memory_id = uuid.uuid4().hex
        memories[memory_id] = {"filename": filename, "createdAt": datetime.now().timestamp()}
        
        # Save journal entry and date if provided
        if journal_entry or video_date:
            journal_file = JOURNALS_PATH
            if os.path.exists(journal_file):
                with open(journal_file, 'r', encoding='utf-8') as f:
                    journals = json.load(f)
            else:
                journals = {}
            
            journals[filename] = {
                "entry": journal_entry,
                "timestamp": datetime.now().isoformat(),
                "video_path": filepath,
                "date": video_date
            }
            
            with open(journal_file, 'w', encoding='utf-8') as f:
                json.dump(journals, f, indent=2, ensure_ascii=False)
            invalidate_crossword_cache(video_date)
            memories[memory_id].update({"title": filename.rsplit('.', 1)[0], "date": video_date, "note": journal_entry})
        with open(MEMORIES_PATH, 'w', encoding='utf-8') as stream:
            json.dump(memories, stream, ensure_ascii=False, indent=2)
        
        # Initialize processing status
        status_key = (base_dir, filename)
        processing_status[status_key] = {
            "status": "processing",
            "message": "Video processing started",
            "progress": 0
        }
        
        # Start video processing in background thread
        def process_video_background(filepath, base_dir, video_date, status_key):
            try:
                from process_video import process_uploaded_video
                processing_status[status_key]["message"] = "Processing video..."
                processing_status[status_key]["progress"] = 25
                
                result = process_uploaded_video(filepath, base_dir)
                
                if result["success"]:
                    invalidate_crossword_cache(video_date, os.path.join(base_dir, "crosswords.json"))
                    processing_status[status_key]["status"] = "completed"
                    processing_status[status_key]["message"] = "Video processed successfully"
                    processing_status[status_key]["progress"] = 100
                else:
                    processing_status[status_key]["status"] = "failed"
                    processing_status[status_key]["message"] = f"Processing failed: {result.get('error', 'Unknown error')}"
                    processing_status[status_key]["progress"] = 0
            except Exception as e:
                processing_status[status_key]["status"] = "failed"
                processing_status[status_key]["message"] = f"Processing error: {str(e)}"
                processing_status[status_key]["progress"] = 0
        
        # Start processing in background
        thread = threading.Thread(target=process_video_background,
                                  args=(filepath, base_dir, video_date, status_key))
        thread.daemon = True
        thread.start()
        
        return jsonify({
            "success": True,
            "message": "Video uploaded successfully and processing started",
            "filename": filename,
            "memoryId": memory_id,
            "path": filepath,
            "processing": True,
            "journal_saved": bool(journal_entry)
        }), 200
        
    except Exception as e:
        print(f"Upload error: {e}")
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500


@api.route('/processing-status/<filename>', methods=['GET'])
def get_processing_status(filename):
    """Get the processing status of an uploaded video."""
    row = _memory_for_id(filename)
    if row:
        filename = row['filename']
    if not _safe_media_path(filename) or '/' in filename:
        return jsonify(error='Invalid filename'), 404
    status_key = (patient_path(""), filename)
    if status_key in processing_status:
        return jsonify(processing_status[status_key]), 200
    else:
        return jsonify({"status": "unknown", "message": "No processing information found"}), 404


@api.route('/videos', methods=['GET'])
def list_videos():
    """List all uploaded videos with their journal entries."""
    try:
        videos = []
        journal_file = JOURNALS_PATH
        journals = {}
        
        # Load journal entries
        if os.path.exists(journal_file):
            with open(journal_file, 'r', encoding='utf-8') as f:
                journals = json.load(f)
        
        if os.path.exists(UPLOAD_FOLDER):
            for filename in os.listdir(UPLOAD_FOLDER):
                if allowed_file(filename):
                    filepath = os.path.join(UPLOAD_FOLDER, filename)
                    file_stat = os.stat(filepath)
                    
                    video_info = {
                        "filename": filename,
                        "size": file_stat.st_size,
                        "uploaded": file_stat.st_mtime
                    }
                    
                    # Add journal entry and date if exists
                    if filename in journals:
                        video_info["journal"] = journals[filename]["entry"]
                        video_info["journal_timestamp"] = journals[filename]["timestamp"]
                        if "date" in journals[filename]:
                            video_info["date"] = journals[filename]["date"]
                    
                    videos.append(video_info)
        return jsonify(videos), 200
    except Exception as e:
        print(f"List videos error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/memories', methods=['GET'])
def list_memories():
    """List opaque, patient-scoped memory records for the gallery."""
    try:
        limit = min(max(int(request.args.get('limit', 30)), 1), 100)
    except (TypeError, ValueError):
        return jsonify(error='Invalid limit'), 400
    cursor = request.args.get('cursor')
    try:
        memories = _memory_data()
    except Exception:
        api.logger.exception('Could not build memory gallery for the active patient')
        return jsonify(error='Memories are not available right now'), 500
    rows = []
    for memory_id, row in memories.items():
        filename = row.get('filename')
        if not isinstance(filename, str) or not allowed_file(filename):
            continue
        path = os.path.join(os.path.abspath(UPLOAD_FOLDER), filename)
        chunk_folder = os.path.join(os.path.abspath(VIDEO_CHUNKS_ROOT), os.path.splitext(filename)[0] + '_chunks')
        if not os.path.isfile(path) and not os.path.isdir(chunk_folder):
            continue
        journal = {}
        try:
            with open(JOURNALS_PATH, 'r', encoding='utf-8') as stream:
                journal = json.load(stream).get(filename, {})
        except (OSError, ValueError, TypeError):
            pass
        status = processing_status.get((patient_path(''), filename), {}).get('status', 'ready')
        if status == 'processing': status = 'processing'
        elif status == 'failed': status = 'failed'
        else: status = 'ready'
        rows.append({
            'id': memory_id, 'title': row.get('title') or filename.rsplit('.', 1)[0],
            'date': journal.get('date') or row.get('date'), 'note': journal.get('entry') or row.get('note', ''),
            'durationSeconds': row.get('durationSeconds'), 'thumbnailUrl': f'/memories/{memory_id}/thumbnail',
            'people': row.get('people', []), 'status': status,
        })
    rows.sort(key=lambda item: item.get('date') or '', reverse=True)
    start = 0
    if cursor:
        ids = [item['id'] for item in rows]
        if cursor in ids: start = ids.index(cursor) + 1
    page = rows[start:start + limit]
    next_cursor = rows[start + limit - 1]['id'] if start + limit < len(rows) else None
    return jsonify(memories=page, nextCursor=next_cursor)


@api.route('/memories/<memory_id>/video', methods=['GET'])
def serve_memory_video(memory_id):
    row = _memory_for_id(memory_id)
    if not row:
        return jsonify(error='Memory not found'), 404
    path = os.path.abspath(os.path.join(os.path.abspath(UPLOAD_FOLDER), row['filename']))
    root = os.path.abspath(UPLOAD_FOLDER)
    if not path.startswith(root + os.sep) or not os.path.isfile(path):
        return jsonify(error='Memory not found'), 404
    return send_from_directory(root, row['filename'])


@api.route('/memories/<memory_id>/thumbnail', methods=['GET'])
def memory_thumbnail(memory_id):
    row = _memory_for_id(memory_id)
    if not row:
        return Response(NEUTRAL_THUMBNAIL, mimetype='image/png')
    thumb_root = os.path.abspath(THUMBNAILS_ROOT)
    os.makedirs(thumb_root, exist_ok=True)
    target = os.path.join(thumb_root, memory_id + '.png')
    if not os.path.exists(target):
        acquired = thumbnail_slots.acquire(timeout=2)
        if acquired:
            try:
                if not os.path.exists(target):
                    cap = cv2.VideoCapture(os.path.join(os.path.abspath(UPLOAD_FOLDER), row['filename']))
                    cap.set(cv2.CAP_PROP_POS_MSEC, 1000)
                    ok, frame = cap.read()
                    cap.release()
                    if ok:
                        cv2.imwrite(target, frame)
            except Exception:
                pass
            finally:
                thumbnail_slots.release()
    if os.path.exists(target):
        return send_from_directory(thumb_root, memory_id + '.png', mimetype='image/png')
    return Response(NEUTRAL_THUMBNAIL, mimetype='image/png')


def _memory_edit_allowed():
    import auth
    session = g.get('auth_session')
    return bool(session and session.get('kind') == 'caregiver' and (session.get('user_id') and (auth.is_caregiver() or auth.self_account())))


@api.route('/memories/<memory_id>', methods=['PATCH', 'PUT'])
def update_memory(memory_id):
    if not _memory_edit_allowed():
        return jsonify(error='Only a caregiver or self account can edit memories.'), 403
    row = _memory_for_id(memory_id)
    if not row:
        return jsonify(error='Memory not found'), 404
    payload = request.get_json(silent=True) or {}
    if set(payload) - {'title', 'note', 'date'}:
        return jsonify(error='Only title, note, and date can be changed.'), 400
    if 'title' in payload and (not isinstance(payload['title'], str) or len(payload['title'].strip()) > 120):
        return jsonify(error='Title is invalid.'), 400
    if 'note' in payload and (not isinstance(payload['note'], str) or len(payload['note']) > 4000):
        return jsonify(error='Note is invalid.'), 400
    memories = _memory_data(); memory_id_row = memories[memory_id]
    old_filename = memory_id_row['filename']
    journals = {}
    try:
        with open(JOURNALS_PATH, 'r', encoding='utf-8') as stream: journals = json.load(stream)
    except (OSError, ValueError, TypeError): pass
    journal = dict(journals.get(old_filename, {}))
    if 'title' in payload: memory_id_row['title'] = payload['title'].strip()
    if 'note' in payload: journal['entry'] = payload['note']; memory_id_row['note'] = payload['note']
    if 'date' in payload: journal['date'] = payload['date']; memory_id_row['date'] = payload['date']
    if journal: journals[old_filename] = journal
    with open(JOURNALS_PATH, 'w', encoding='utf-8') as stream: json.dump(journals, stream, ensure_ascii=False, indent=2)
    with open(MEMORIES_PATH, 'w', encoding='utf-8') as stream: json.dump(memories, stream, ensure_ascii=False, indent=2)
    invalidate_crossword_cache(journal.get('date'))
    return jsonify(id=memory_id, title=memory_id_row.get('title') or old_filename.rsplit('.', 1)[0], note=journal.get('entry', ''), date=journal.get('date'))


@api.route('/memories/<memory_id>', methods=['DELETE'])
def delete_memory(memory_id):
    if not _memory_edit_allowed():
        return jsonify(error='Only a caregiver or self account can delete memories.'), 403
    row = _memory_for_id(memory_id)
    if not row:
        return jsonify(error='Memory not found'), 404
    filename = row['filename']; base = os.path.abspath(patient_path('')); memories = _memory_data(); memories.pop(memory_id, None)
    for path in (os.path.join(base, 'content', filename), os.path.join(base, 'memory_thumbnails', memory_id + '.png')):
        if os.path.isfile(path): os.remove(path)
    chunk_folder = _chunks_folder(filename)
    for folder in ('video_chunks', 'frames'):
        path = os.path.join(base, folder, chunk_folder)
        if os.path.isdir(path): shutil.rmtree(path, ignore_errors=True)
    journals = {}
    try:
        with open(JOURNALS_PATH, 'r', encoding='utf-8') as stream: journals = json.load(stream)
    except (OSError, ValueError, TypeError): pass
    date_value = journals.pop(filename, {}).get('date') if isinstance(journals.get(filename, {}), dict) else None
    with open(JOURNALS_PATH, 'w', encoding='utf-8') as stream: json.dump(journals, stream, ensure_ascii=False, indent=2)
    qas_path = os.path.join(base, 'qas.json')
    if os.path.exists(qas_path):
        with open(qas_path, 'w', encoding='utf-8') as stream: json.dump([], stream)
    with open(MEMORIES_PATH, 'w', encoding='utf-8') as stream: json.dump(memories, stream, ensure_ascii=False, indent=2)
    invalidate_crossword_cache(date_value)
    return jsonify(ok=True)


@api.route('/journals', methods=['GET'])
def get_journals():
    """Get all journal entries."""
    try:
        journal_file = JOURNALS_PATH
        if os.path.exists(journal_file):
            with open(journal_file, 'r', encoding='utf-8') as f:
                journals = json.load(f)
            return jsonify(journals), 200
        else:
            return jsonify({}), 200
    except Exception as e:
        print(f"Get journals error: {e}")
        return jsonify({"error": str(e)}), 500


PEOPLE_FILE = scoped('people.json')


def _load_people():
    """people.json; on first run, import the photos already in known_faces/."""
    if not os.path.exists(PEOPLE_FILE):
        people = []
        for filename in sorted(os.listdir(KNOWN_FACES_FOLDER)):
            if allowed_image_file(filename):
                # Keep the old file name as the id so earlier face detections still map to this person
                stem = os.path.splitext(filename)[0]
                people.append({"id": stem, "name": _title(stem.replace('_', ' ')), "relation": "", "phone": "", "photo": filename})
        _save_people(people)
        return people
    with open(PEOPLE_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def _title(name):
    """"jawed karim" -> "Jawed Karim"; leaves the rest of each word alone ("McDonald")."""
    return ' '.join(w[:1].upper() + w[1:] for w in name.split())


def display_name(face_id, people, relation=False):
    """Face recognition reports a photo's id (with "_" sometimes shown as " ").
    Return that person's name, optionally with the relation: "Dinesh (son)"."""
    key = face_id.strip().lower()
    for p in people:
        if key in (p['id'].lower(), p['id'].replace('_', ' ').lower()):
            name = _title(p['name'])
            return f"{name} ({p['relation'].lower()})" if relation and p.get('relation') else name
    return _title(face_id.replace('_', ' '))


def _save_people(people):
    with open(PEOPLE_FILE, 'w', encoding='utf-8') as f:
        json.dump(people, f, indent=2, ensure_ascii=False)


def _save_photo(file, person_id, old_photo=None):
    """Save an uploaded photo as known_faces/<id>.<ext>. Returns (filename, error)."""
    if not file or file.filename == '':
        return None, "Please choose a photo"
    if not allowed_image_file(file.filename):
        return None, f"Photo must be one of: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}"
    from process_video import has_face
    tmp_path = os.path.join(KNOWN_FACES_FOLDER, f"{person_id}.tmp")
    file.save(tmp_path)
    try:
        if not has_face(tmp_path):
            return None, "We could not find a face in this photo. Please use a clear photo of the face."
        filename = f"{person_id}.{file.filename.rsplit('.', 1)[1].lower()}"
        os.replace(tmp_path, os.path.join(KNOWN_FACES_FOLDER, filename))
        if old_photo and old_photo != filename:
            old_path = os.path.join(KNOWN_FACES_FOLDER, old_photo)
            if os.path.exists(old_path):
                os.remove(old_path)
        return filename, None
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


@api.route('/people', methods=['GET'])
def list_people():
    return jsonify([{**p, "name": _title(p['name'])} for p in _load_people()])


@api.route('/people', methods=['POST'])
def add_person():
    """multipart form: name (required), relation, phone, photo (required)."""
    name = _title(request.form.get('name', ''))
    if not name:
        return jsonify({"error": "Name is required"}), 400
    import uuid
    person_id = uuid.uuid4().hex[:8]
    photo, error = _save_photo(request.files.get('photo'), person_id)
    if error:
        return jsonify({"error": error}), 400
    person = {
        "id": person_id,
        "name": name,
        "relation": request.form.get('relation', '').strip(),
        "phone": request.form.get('phone', '').strip(),
        "photo": photo,
    }
    people = _load_people()
    people.append(person)
    _save_people(people)
    return jsonify(person), 201


@api.route('/people/<person_id>', methods=['PUT'])
def update_person(person_id):
    """multipart form; any of name, relation, phone, photo."""
    people = _load_people()
    person = next((p for p in people if p['id'] == person_id), None)
    if not person:
        return jsonify({"error": "Person not found"}), 404
    if 'name' in request.form:
        name = _title(request.form['name'])
        if not name:
            return jsonify({"error": "Name is required"}), 400
        person['name'] = name
    for field in ('relation', 'phone'):
        if field in request.form:
            person[field] = request.form[field].strip()
    if request.files.get('photo'):
        photo, error = _save_photo(request.files['photo'], person_id, person.get('photo'))
        if error:
            return jsonify({"error": error}), 400
        person['photo'] = photo
    _save_people(people)
    return jsonify(person)


@api.route('/people/<person_id>', methods=['DELETE'])
def delete_person(person_id):
    people = _load_people()
    person = next((p for p in people if p['id'] == person_id), None)
    if not person:
        return jsonify({"error": "Person not found"}), 404
    if person.get('photo'):
        photo_path = os.path.join(KNOWN_FACES_FOLDER, person['photo'])
        if os.path.exists(photo_path):
            os.remove(photo_path)
    _save_people([p for p in people if p['id'] != person_id])
    return jsonify({"success": True})


@api.route('/known-faces', methods=['GET'])
def list_known_faces():
    """People with a photo, in the shape the quiz expects."""
    faces = [{"path": p['photo'], "name": _title(p['name']), "relation": p.get('relation', '')}
             for p in _load_people() if p.get('photo')]
    return jsonify({"faces": faces}), 200


@api.route('/known-faces/<filename>', methods=['GET'])
def serve_face_image(filename):
    """Serve a known face image."""
    try:
        return send_from_directory(api.config['KNOWN_FACES_FOLDER'], filename)
    except Exception as e:
        print(f"Serve image error: {e}")
        return jsonify({"error": str(e)}), 404


@api.get('/video_chunks')
def list_video_chunks():
    """List the active patient's playable memories, including migrated chunks."""
    from pathlib import Path
    from urllib.parse import quote
    root = Path(VIDEO_CHUNKS_ROOT)
    videos = [f"/video_chunks/{quote(path.relative_to(root).as_posix())}"
              for path in sorted(root.rglob('*.mp4'))
              if path.resolve().is_relative_to(root.resolve())]
    return jsonify(videos=videos)


@api.route('/video_chunks/<path:filepath>', methods=['GET'])
def serve_video_chunk_file(filepath):
    """Serve video chunk files (videos, audio, JSON)."""
    try:
        if not _safe_media_path(filepath):
            return jsonify({"error": "Invalid media path"}), 404
        print(f"Attempting to serve video chunk file: {filepath}")
        # filepath will be something like "Me_at_the_zoo_chunks/chunk_0000_0010_faces.json"
        video_chunks_root = os.path.abspath(VIDEO_CHUNKS_ROOT)
        print(f"Video chunks root: {video_chunks_root}")
        return send_from_directory(video_chunks_root, filepath)
    except Exception as e:
        print(f"Serve video chunk file error: {e}")
        return jsonify({"error": str(e)}), 404


def _local_date(value):
    """Journal dates are the browser's local midnight sent as UTC
    ("2025-11-07T18:30:00.000Z" for Nov 8 in IST), so convert to server-local
    time before taking the date. Assumes server and browser share a timezone."""
    from datetime import datetime
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (AttributeError, ValueError):
        return None
    if dt.tzinfo:
        dt = dt.astimezone()
    return dt.date().isoformat()


def _videos_for_date(date_str):
    """(filename, journal) pairs recorded on date_str (YYYY-MM-DD), oldest upload first."""
    journal_file = JOURNALS_PATH
    if not os.path.exists(journal_file):
        return []
    with open(journal_file, 'r', encoding='utf-8') as f:
        journals = json.load(f)
    matches = [(name, j) for name, j in journals.items() if _local_date(j.get('date', '')) == date_str]
    return sorted(matches, key=lambda m: m[1].get('timestamp', ''))


def _chunks_folder(video_filename):
    """process_video names the chunk folder after the uploaded file."""
    return os.path.splitext(video_filename)[0] + '_chunks'


_CROSSWORD_SENSITIVE = {
    'alzheimer', 'alzheimer’s', 'alzheimer\'s', 'dementia', 'disease', 'diagnosis',
    'medical', 'medicine', 'medication', 'tablet', 'tablets', 'pill', 'pills',
    'doctor', 'hospital', 'clinic', 'patient', 'symptom', 'symptoms', 'treatment',
    'therapy', 'pain', 'injury', 'illness', 'blood', 'death', 'died', 'funeral',
}
_CROSSWORD_STOP = {'the', 'and', 'for', 'with', 'from', 'your', 'you', 'something', 'every', 'each', 'morning', 'afternoon', 'evening', 'today', 'daily'}


def _crossword_clean_word(value):
    """Return one A-Z answer of 3-9 letters, or None for unsafe/invalid words."""
    if not isinstance(value, str):
        return None
    word = value.strip().upper()
    if not 3 <= len(word) <= 9 or not re.fullmatch(r'[A-Z]+', word):
        return None
    if word.lower() in _CROSSWORD_SENSITIVE:
        return None
    return word


def _crossword_word_in_sources(word, sources, people):
    pattern = re.compile(r'(?<![A-Za-z])' + re.escape(word) + r'(?![A-Za-z])', re.IGNORECASE)
    if any(pattern.search(source) for source in sources if isinstance(source, str)):
        return True
    return any(pattern.search(str(person.get('name', ''))) for person in people if isinstance(person, dict))


def _validate_crossword_candidates(candidates, sources, people):
    if not isinstance(candidates, list):
        return []
    result, seen = [], set()
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        word = _crossword_clean_word(candidate.get('word'))
        clue = candidate.get('clue')
        if not word or word in seen or not _crossword_word_in_sources(word, sources, people):
            continue
        if not isinstance(clue, str) or not 4 <= len(clue.strip()) <= 100 or not re.search(r'\b(you|your|you’ve|you\'ve)\b', clue, re.IGNORECASE):
            continue
        if any(re.search(r'\b' + re.escape(term) + r'\b', clue, re.IGNORECASE) for term in _CROSSWORD_SENSITIVE):
            continue
        result.append({'word': word, 'clue': clue.strip()})
        seen.add(word)
        if len(result) == 8:
            break
    return result


def _crossword_fallback(people, routine_steps):
    candidates, seen = [], set()
    for person in people if isinstance(people, list) else []:
        if not isinstance(person, dict):
            continue
        relation = str(person.get('relation', '')).strip()
        clue = 'Your ' + relation.lower() if relation and relation.lower() not in _CROSSWORD_SENSITIVE else 'Someone you know'
        for name in re.findall(r'[A-Za-z]+', str(person.get('name', ''))):
            word = _crossword_clean_word(name)
            if word and word not in seen:
                candidates.append({'word': word, 'clue': clue})
                seen.add(word)
    for step in routine_steps if isinstance(routine_steps, list) else []:
        for token in re.findall(r'[A-Za-z]+', str(step)):
            word = _crossword_clean_word(token)
            if word and word.lower() not in _CROSSWORD_STOP and word not in seen:
                candidates.append({'word': word, 'clue': 'Something you do each day'})
                seen.add(word)
    return candidates[:8]


def _crossword_layout(candidates):
    """Place answers in a compact 9x9 crossword, preferring intersecting entries."""
    size = 9
    cells = {}
    placed = []

    def legal(word, row, col, direction, require_cross=False):
        dr, dc = (0, 1) if direction == 'across' else (1, 0)
        if row < 0 or col < 0 or row + dr * (len(word) - 1) >= size or col + dc * (len(word) - 1) >= size:
            return False
        intersections = 0
        for index, letter in enumerate(word):
            r, c = row + dr * index, col + dc * index
            existing = cells.get((r, c))
            if existing is not None:
                if existing != letter:
                    return False
                intersections += 1
            else:
                # Do not place parallel words directly alongside each other.
                side = ((1, 0), (-1, 0)) if direction == 'across' else ((0, 1), (0, -1))
                if any((r + sr, c + sc) in cells for sr, sc in side):
                    return False
        before = (row - dr, col - dc)
        after = (row + dr * len(word), col + dc * len(word))
        if before in cells or after in cells:
            return False
        return intersections > 0 if require_cross else True

    def place(item, row, col, direction):
        dr, dc = (0, 1) if direction == 'across' else (1, 0)
        for index, letter in enumerate(item['word']):
            cells[(row + dr * index, col + dc * index)] = letter
        placed.append({**item, 'row': row, 'col': col, 'direction': direction})

    for item in candidates[:8]:
        word = item['word']
        if not placed:
            place(item, size // 2, max(0, (size - len(word)) // 2), 'across')
            continue
        success = False
        # Try every matching letter against existing cells, alternating orientation.
        for direction in ('down', 'across'):
            dr, dc = (0, 1) if direction == 'across' else (1, 0)
            for (r, c), letter in list(cells.items()):
                for index, char in enumerate(word):
                    if char != letter:
                        continue
                    row, col = r - dr * index, c - dc * index
                    if legal(word, row, col, direction, require_cross=True):
                        place(item, row, col, direction)
                        success = True
                        break
                if success:
                    break
            if success:
                break
        if not success:
            for direction in ('across', 'down'):
                for row in range(size):
                    for col in range(size):
                        if legal(word, row, col, direction):
                            place(item, row, col, direction)
                            success = True
                            break
                    if success:
                        break
                if success:
                    break

    if not placed:
        return {'rows': 0, 'cols': 0, 'grid': [], 'entries': []}
    min_row = min(r for r, _ in cells); max_row = max(r for r, _ in cells)
    min_col = min(c for _, c in cells); max_col = max(c for _, c in cells)
    numbered, entries = {}, []
    for item in placed:
        key = (item['row'], item['col'])
        if key not in numbered:
            numbered[key] = len(numbered) + 1
        entries.append({**item, 'number': numbered[key], 'row': item['row'] - min_row, 'col': item['col'] - min_col})
    rows, cols = max_row - min_row + 1, max_col - min_col + 1
    grid = [[{'letter': '', 'number': 0} for _ in range(cols)] for _ in range(rows)]
    for (row, col), letter in cells.items():
        grid[row - min_row][col - min_col]['letter'] = letter
    for (row, col), number in numbered.items():
        grid[row - min_row][col - min_col]['number'] = number
    return {'rows': rows, 'cols': cols, 'grid': grid, 'entries': entries}


def invalidate_crossword_cache(date_value, cache_path=None):
    cache_path = CROSSWORDS_PATH if cache_path is None else cache_path
    """Forget puzzles for the changed memory day and the following day."""
    from datetime import date, timedelta
    date_str = _local_date(date_value) if date_value else None
    if not date_str:
        return
    try:
        base = date.fromisoformat(date_str)
        affected = {base.isoformat(), (base + timedelta(days=1)).isoformat()}
        if not os.path.exists(cache_path):
            return
        with open(cache_path, 'r', encoding='utf-8') as f:
            cache = json.load(f)
        if not isinstance(cache, dict):
            return
        changed = False
        for key in affected:
            changed = cache.pop(key, None) is not None or changed
        if changed:
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(cache, f, indent=2, ensure_ascii=False)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return


def _crossword_sources(date_str):
    from datetime import date, timedelta
    current = date.fromisoformat(date_str)
    dates = {current.isoformat(), (current - timedelta(days=1)).isoformat()}
    texts, video_folders = [], []
    for day in dates:
        for filename, journal in _videos_for_date(day):
            if journal.get('entry'):
                texts.append(str(journal['entry']))
            folder = _chunks_folder(filename)
            folder_path = os.path.join(VIDEO_CHUNKS_ROOT, folder)
            transcript_path = os.path.join(folder_path, 'full_transcript.json')
            if not os.path.exists(transcript_path) and os.path.isdir(VIDEO_CHUNKS_ROOT):
                normalized = re.sub(r'[^a-z0-9]', '', os.path.splitext(filename)[0].lower())
                for candidate in os.listdir(VIDEO_CHUNKS_ROOT):
                    if normalized and normalized in re.sub(r'[^a-z0-9]', '', candidate.lower()):
                        transcript_path = os.path.join(VIDEO_CHUNKS_ROOT, candidate, 'full_transcript.json')
                        break
            if os.path.exists(transcript_path):
                try:
                    with open(transcript_path, 'r', encoding='utf-8') as f:
                        transcripts = json.load(f)
                    if isinstance(transcripts, dict):
                        texts.extend(str(value) for value in transcripts.values() if isinstance(value, str))
                except (OSError, ValueError):
                    pass
    people = _load_people()
    try:
        with open(ROUTINES_PATH, 'r', encoding='utf-8') as f:
            routine = json.load(f).get('steps', [])
    except (OSError, ValueError, AttributeError):
        routine = []
    return texts, people, routine


def _make_crossword(date_str):
    texts, people, routine = _crossword_sources(date_str)
    routine_text = [' '.join(step for step in routine if isinstance(step, str))] if isinstance(routine, list) else []
    sources = texts + routine_text
    candidates = []
    if client.api_key and client.api_key != 'not_configured' and texts:
        prompt = (
            'Create 5 to 8 crossword answer/clue pairs as a JSON array [{"word":"...","clue":"..."}]. '
            'Use only words that appear exactly in the source text below, or a person name from People. '
            'Answers must be A-Z letters only after uppercasing, 3 to 9 letters, and nouns, names, places, or activities. '
            'Avoid sensitive or medical words. Clues must be short, warm, and address the player as you/your. '
            'Never invent an answer. Return only the JSON array.\n\n'
            'Source text: ' + '\n'.join(texts + routine_text) + '\nPeople: ' + json.dumps(people, ensure_ascii=False)
        )
        try:
            response = client.chat.completions.create(
                model=os.getenv('OPENAI_MODEL', 'gpt-4o-mini'),
                messages=[{'role': 'system', 'content': 'Create a gentle, source-grounded memory crossword. Never infer facts not stated in the sources.'}, {'role': 'user', 'content': prompt}],
                max_completion_tokens=800,
            )
            raw = response.choices[0].message.content or ''
            raw = re.sub(r'^\s*```(?:json)?|```\s*$', '', raw.strip(), flags=re.IGNORECASE)
            candidates = _validate_crossword_candidates(json.loads(raw), sources, people)
        except Exception:
            candidates = []
    if len(candidates) < 4:
        candidates = _crossword_fallback(people, routine)
    if len(candidates) < 4:
        return {'date': date_str, 'available': False, **_crossword_layout([])}
    layout = _crossword_layout(candidates)
    if len(layout['entries']) < 4:
        return {'date': date_str, 'available': False, **_crossword_layout([])}
    return {'date': date_str, 'available': True, **layout}


@api.route('/crossword', methods=['GET'])
def get_crossword():
    from datetime import date
    date_str = request.args.get('date', '')
    try:
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', date_str):
            raise ValueError
        date.fromisoformat(date_str)
    except ValueError:
        return jsonify({'error': 'date must be YYYY-MM-DD'}), 400
    try:
        if os.path.exists(CROSSWORDS_PATH):
            with open(CROSSWORDS_PATH, 'r', encoding='utf-8') as f:
                cache = json.load(f)
        else:
            cache = {}
        if isinstance(cache, dict) and date_str in cache:
            return jsonify(cache[date_str])
    except (OSError, ValueError):
        cache = {}
    puzzle = _make_crossword(date_str)
    if not isinstance(cache, dict):
        cache = {}
    cache[date_str] = puzzle
    with open(CROSSWORDS_PATH, 'w', encoding='utf-8') as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)
    return jsonify(puzzle)


@api.route('/faces-for-date', methods=['GET'])
def faces_for_date():
    """Names of known people detected in videos recorded on ?date=YYYY-MM-DD."""
    date_str = request.args.get('date', '')
    detected = []
    try:
        people = _load_people()
        for name, _ in _videos_for_date(date_str):
            folder = os.path.join(VIDEO_CHUNKS_ROOT, _chunks_folder(name))
            if not os.path.isdir(folder):
                continue
            for file in sorted(os.listdir(folder)):
                if file.endswith('_faces.json'):
                    with open(os.path.join(folder, file), 'r', encoding='utf-8') as f:
                        for names in json.load(f).values():
                            for n in names:
                                n = display_name(n, people)
                                if n not in detected:
                                    detected.append(n)
    except Exception as e:
        print(f"Faces for date error: {e}")
        return jsonify({"date": date_str, "detected": [], "error": str(e)}), 500
    return jsonify({"date": date_str, "detected": detected})


@api.route('/day-frames', methods=['GET'])
def day_frames():
    """Up to 4 evenly spaced frames, in time order, from videos recorded on ?date=YYYY-MM-DD.
    timestamp is seconds into that frame's video."""
    date_str = request.args.get('date', '')
    frames = []
    try:
        for name, _ in _videos_for_date(date_str):
            folder = _chunks_folder(name)
            video_dir = os.path.join(FRAMES_ROOT, folder)
            if not os.path.isdir(video_dir):
                continue
            for chunk in sorted(os.listdir(video_dir)):  # zero-padded start time, so this is time order
                span = re.fullmatch(r'chunk_(\d+)_(\d+)', chunk)
                if not span:
                    continue
                start, end = int(span.group(1)), int(span.group(2))
                chunk_dir = os.path.join(video_dir, chunk)
                numbers = sorted(int(f[:-4]) for f in os.listdir(chunk_dir) if f.endswith('.jpg') and f[:-4].isdigit())
                for i, n in enumerate(numbers):
                    # Frames are only numbered, so spread them evenly across the chunk's span
                    frames.append({
                        "url": f"/frames/{folder}/{chunk}/{n}.jpg",
                        "timestamp": round(start + (end - start) * i / len(numbers), 1),
                    })
    except Exception as e:
        print(f"Day frames error: {e}")
        return jsonify({"date": date_str, "frames": [], "error": str(e)}), 500
    if len(frames) > 4:
        frames = [frames[round(i * (len(frames) - 1) / 3)] for i in range(4)]
    return jsonify({"date": date_str, "frames": frames})


@api.route('/frames/<path:filepath>', methods=['GET'])
def serve_frame(filepath):
    """Serve frames extracted by the video pipeline."""
    if not _safe_media_path(filepath):
        return jsonify(error='Invalid media path'), 404
    return send_from_directory(os.path.abspath(FRAMES_ROOT), filepath)


SETTINGS_PATH = scoped('settings.json')
PERFORMANCE_PATH = scoped('performance_data.json')
DAILY_PLANS_PATH = scoped('daily_plans.json')
GAMES_PATH = os.path.join(os.path.dirname(__file__), 'games.json')


def _migrate_performance_record_ids():
    """Give legacy performance rows stable IDs, backing up only when changing the file."""
    from datetime import datetime
    from pathlib import Path

    path = Path(PERFORMANCE_PATH)
    if not path.exists():
        return False
    with path.open('r', encoding='utf-8') as f:
        performance_data = json.load(f)

    changed = False
    for group in ('scores', 'game_scores'):
        records = performance_data.get(group, [])
        if not isinstance(records, list):
            continue
        for record in records:
            if isinstance(record, dict) and not record.get('id'):
                record['id'] = str(uuid.uuid4())
                changed = True

    if not changed:
        return False

    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    backup_path = path.with_name(f'{path.stem}.backup-{timestamp}{path.suffix}')
    shutil.copy2(path, backup_path)
    with path.open('w', encoding='utf-8') as f:
        json.dump(performance_data, f, indent=2, ensure_ascii=False)
    return True


SUPPORTED_LANGUAGES = {
    'en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu', 'ur', 'kn', 'or', 'ml', 'pa', 'as', 'ne', 'mni-Mtei',
}


def _load_settings():
    if not os.path.exists(SETTINGS_PATH):
        from flask import g
        name = (g.get('active_patient') or {}).get('name', '')
        with open(SETTINGS_PATH, 'w', encoding='utf-8') as f:
            json.dump({'patient_name': name, 'language': 'en', 'pins': []}, f)
    with open(SETTINGS_PATH, 'r', encoding='utf-8') as f:
        settings = {'patient_name': '', 'language': 'en', 'pins': [], **json.load(f)}
    settings.pop('pin', None)
    if not isinstance(settings.get('pins'), list):
        settings['pins'] = []
    if settings.get('language') not in SUPPORTED_LANGUAGES:
        settings['language'] = 'en'
    return settings


@api.route('/settings', methods=['GET'])
def get_settings():
    """Settings the app may show (never the PIN)."""
    settings = _load_settings()
    return jsonify({"patient_name": settings['patient_name'], "language": settings['language'], "pins": settings['pins']})


@api.route('/settings', methods=['POST'])
def save_settings():
    """Save patient-facing preferences and validated focus-game pins (never expose the PIN)."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not ({'patient_name', 'language', 'pins'} & payload.keys()):
        return jsonify({"error": "Provide patient_name, language or pins"}), 400

    name = payload.get('patient_name')
    if 'patient_name' in payload and (not isinstance(name, str) or len(name.strip()) > 60):
        return jsonify({"error": "patient_name must be text, up to 60 characters"}), 400
    language = payload.get('language')
    if 'language' in payload and (not isinstance(language, str) or language not in SUPPORTED_LANGUAGES):
        return jsonify({"error": "language must be one of the supported language codes"}), 400

    pins = payload.get('pins')
    if 'pins' in payload:
        if not isinstance(pins, list) or len(pins) > 2:
            return jsonify({"error": "pins must contain at most two games"}), 400
        try:
            with open(GAMES_PATH, 'r', encoding='utf-8') as f:
                games = json.load(f).get('games', [])
        except Exception:
            games = []
        game_map = {g.get('id'): g for g in games if isinstance(g, dict)}
        levels = set()
        seen_ids = set()
        from datetime import date, timedelta
        tomorrow = date.today() + timedelta(days=1)
        for pin in pins:
            if not isinstance(pin, dict) or set(pin) != {'game_id', 'start', 'end'}:
                return jsonify({"error": "Each pin needs game_id, start and end"}), 400
            game = game_map.get(pin.get('game_id'))
            if not game or game.get('status') != 'ready' or game.get('bundle') or pin.get('game_id') == 'daily_recall':
                return jsonify({"error": "Only ready, non-bundled games can be pinned"}), 400
            if not isinstance(pin.get('start'), str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', pin['start']) or not isinstance(pin.get('end'), str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', pin['end']):
                return jsonify({"error": "Pin dates must use yyyy-MM-dd"}), 400
            try:
                start = date.fromisoformat(pin['start'])
                end = date.fromisoformat(pin['end'])
            except (TypeError, ValueError):
                return jsonify({"error": "Pin dates must use yyyy-MM-dd"}), 400
            if start != tomorrow or end != start + timedelta(days=6):
                return jsonify({"error": "Pins must cover seven days starting tomorrow"}), 400
            game_levels = game.get('levels', [])
            level = next((n for n in (1, 2, 3) if n in game_levels), None)
            if level is None or level in levels or pin['game_id'] in seen_ids:
                return jsonify({"error": "Pin at most one game per level"}), 400
            levels.add(level)
            seen_ids.add(pin['game_id'])

    settings = _load_settings()
    previous_pins = settings.get('pins', [])
    if 'patient_name' in payload:
        settings['patient_name'] = name.strip()
        from flask import g
        from auth import db
        db().execute('UPDATE patients SET name=? WHERE id=?', (name.strip(), g.active_patient['id']))
    if 'language' in payload:
        settings['language'] = language
    if 'pins' in payload:
        settings['pins'] = pins
        if pins != previous_pins:
            changed_dates = [p['start'] for p in [*previous_pins, *pins] if isinstance(p, dict) and isinstance(p.get('start'), str)]
            _invalidate_unplayed_plans(min(changed_dates, default=None))
    with open(SETTINGS_PATH, 'w', encoding='utf-8') as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
    return jsonify({"patient_name": settings['patient_name'], "language": settings['language'], "pins": settings['pins']})


def _invalidate_unplayed_plans(start_date):
    if not start_date or not os.path.exists(DAILY_PLANS_PATH):
        return
    try:
        with open(DAILY_PLANS_PATH, 'r', encoding='utf-8') as f:
            plans = json.load(f)
        performance = {"scores": [], "game_scores": []}
        if os.path.exists(PERFORMANCE_PATH):
            with open(PERFORMANCE_PATH, 'r', encoding='utf-8') as f:
                performance = json.load(f)
        active_days = {
            str(row.get('date') or row.get('timestamp') or '')[:10]
            for key in ('scores', 'game_scores')
            for row in performance.get(key, [])
            if isinstance(row, dict)
        }
        plans = {day: plan for day, plan in plans.items() if day < start_date or day in active_days}
        with open(DAILY_PLANS_PATH, 'w', encoding='utf-8') as f:
            json.dump(plans, f, indent=2, ensure_ascii=False)
    except Exception as exc:
        print(f"Could not invalidate unplayed plans: {exc}")


ROUTINES_PATH = scoped('routines.json')


@api.route('/routine', methods=['GET'])
def get_routine():
    """The caregiver's routine, used by Plan the Day's personal round."""
    if not os.path.exists(ROUTINES_PATH):
        return jsonify({"steps": []})
    try:
        with open(ROUTINES_PATH, 'r', encoding='utf-8') as f:
            return jsonify({"steps": json.load(f).get("steps", [])})
    except Exception as e:
        print(f"Get routine error: {e}")
        return jsonify({"steps": [], "error": str(e)}), 500


@api.route('/routine', methods=['POST'])
def save_routine():
    """Replace the routine with {"steps": [...]}: 3 to 5 steps in order, each 1-40 characters."""
    # Caregivers can edit the active patient's routine; self accounts can edit
    # only the patient attached to their own account. Device and patient-login
    # sessions may read this file for Plan the Day but cannot change it.
    from auth import db, is_caregiver, self_account
    from flask import g
    session = getattr(g, 'auth_session', None)
    if not is_caregiver():
        if not self_account() or not session or not g.active_patient:
            return jsonify({"error": "Only the patient or a caregiver can edit this routine"}), 403
        user = db.fetchone('SELECT patient_id FROM users WHERE id=?', (session.get('user_id'),))
        if not user or user['patient_id'] != g.active_patient['id']:
            return jsonify({"error": "You can only edit your own routine"}), 403
    steps = (request.get_json(silent=True) or {}).get('steps')
    if not isinstance(steps, list) or not 3 <= len(steps) <= 5:
        return jsonify({"error": "steps must be a list of 3 to 5 items"}), 400
    steps = [s.strip() if isinstance(s, str) else '' for s in steps]
    if not all(0 < len(s) <= 40 for s in steps):
        return jsonify({"error": "each step must be 1 to 40 characters"}), 400
    from datetime import datetime
    try:
        with open(ROUTINES_PATH, 'w', encoding='utf-8') as f:
            json.dump({"steps": steps, "updated": datetime.now().isoformat()}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Save routine error: {e}")
        return jsonify({"error": str(e)}), 500
    return jsonify({"steps": steps})


@api.route('/daily-plan', methods=['GET'])
def daily_plan():
    """Today's games for ?date=yyyy-MM-dd, the same all day (seeded by the date):
    level 1 = Daily Recall + 1 random easy game, levels 2 and 3 = 2 random games each."""
    from datetime import date as _date
    date_str = request.args.get('date') or _date.today().isoformat()
    try:
        from cognitive_reports import build_daily_plan
        return jsonify(build_daily_plan(date_str, games_file=GAMES_PATH, plans_file=DAILY_PLANS_PATH,
                                        settings_file=SETTINGS_PATH, performance_file=PERFORMANCE_PATH))
    except Exception as e:
        print(f"Daily plan error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/performance', methods=['POST'])
def save_performance():
    """Save quiz performance score."""
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "A JSON performance record is required"}), 400
        # The authenticated device determines the source, never a client flag.
        data['source'] = 'patient'
        score = data.get('score')
        date = data.get('date')
        breakdown = data.get('breakdown', {})
        difficulty = data.get('difficulty')
        
        if score is None:
            return jsonify({"error": "Score is required"}), 400
        if difficulty is not None and (isinstance(difficulty, bool) or not isinstance(difficulty, int) or difficulty < 1 or difficulty > 4):
            return jsonify({"error": "Difficulty must be an integer from 1 to 4"}), 400

        # Load existing performance data
        performance_file = PERFORMANCE_PATH
        if os.path.exists(performance_file):
            with open(performance_file, 'r', encoding='utf-8') as f:
                performance_data = json.load(f)
        else:
            performance_data = {"scores": []}

        from datetime import datetime
        if data.get('game_id') and data['game_id'] != 'daily_recall':
            # Game scores are kept apart so the quiz dashboard chart is unaffected
            record = {
                "id": str(uuid.uuid4()),
                "game_id": data['game_id'],
                "level": data.get('level'),
                "skill": data.get('skill'),
                "score": score,
                "date": date or datetime.now().isoformat(),
                "timestamp": datetime.now().isoformat(),
            }
            if 'source' in data:
                record['source'] = data['source']
            if difficulty is not None:
                record['difficulty'] = difficulty
            performance_data.setdefault("game_scores", []).append(record)
        else:
            # Add new score with timestamp and breakdown
            record = {
                "id": str(uuid.uuid4()),
                "score": score,
                "date": date or datetime.now().isoformat(),
                "timestamp": datetime.now().isoformat(),
                "breakdown": breakdown,  # Store individual activity scores
                "game_id": data.get('game_id'),
                "level": data.get('level'),
                "skill": data.get('skill'),
            }
            if 'source' in data:
                record['source'] = data['source']
            if difficulty is not None:
                record['difficulty'] = difficulty
            performance_data.setdefault("scores", []).append(record)
        
        # Save updated data
        with open(performance_file, 'w', encoding='utf-8') as f:
            json.dump(performance_data, f, indent=2)
        
        return jsonify({"success": True, "message": "Performance saved"}), 200
    except Exception as e:
        print(f"Save performance error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/performance', methods=['GET'])
def get_performance():
    """Get performance history."""
    try:
        performance_file = PERFORMANCE_PATH
        if os.path.exists(performance_file):
            with open(performance_file, 'r', encoding='utf-8') as f:
                performance_data = json.load(f)
            return jsonify(performance_data), 200
        else:
            # Return empty data if file doesn't exist
            return jsonify({"scores": []}), 200
    except Exception as e:
        print(f"Get performance error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/performance/<record_id>', methods=['DELETE'])
def delete_performance(record_id):
    """Remove one original performance record by its stable ID."""
    try:
        if not os.path.exists(PERFORMANCE_PATH):
            return jsonify({"error": "Performance record not found"}), 404
        with open(PERFORMANCE_PATH, 'r', encoding='utf-8') as f:
            performance_data = json.load(f)
        for group in ('scores', 'game_scores'):
            records = performance_data.get(group, [])
            if not isinstance(records, list):
                continue
            index = next((i for i, row in enumerate(records) if isinstance(row, dict) and row.get('id') == record_id), None)
            if index is not None:
                records.pop(index)
                with open(PERFORMANCE_PATH, 'w', encoding='utf-8') as f:
                    json.dump(performance_data, f, indent=2, ensure_ascii=False)
                return jsonify({"success": True}), 200
        return jsonify({"error": "Performance record not found"}), 404
    except Exception as e:
        print(f"Delete performance error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/reports/days', methods=['GET'])
def get_reports_days():
    """List of all calendar days (YYYY-MM-DD) with recorded activity."""
    try:
        from cognitive_reports import get_active_days
        perf_file = PERFORMANCE_PATH
        days = get_active_days(perf_file)
        return jsonify({"days": days}), 200
    except Exception as e:
        print(f"Get reports days error: {e}")
        return jsonify({"error": str(e), "days": []}), 500


@api.route('/reports/day', methods=['GET'])
def get_report_for_day():
    """Cognitive performance report for ?date=YYYY-MM-DD."""
    date_str = request.args.get('date')
    if not date_str:
        return jsonify({"error": "date query parameter is required (YYYY-MM-DD)"}), 400
    try:
        from cognitive_reports import build_day_report, load_store
        perf_file = PERFORMANCE_PATH
        games_file = GAMES_PATH
        plans_file = DAILY_PLANS_PATH
        store = load_store(perf_file)
        report = build_day_report(store, date_str, games_file=games_file, plans_file=plans_file,
                                  settings_file=SETTINGS_PATH, performance_file=PERFORMANCE_PATH)
        return jsonify(report), 200
    except Exception as e:
        print(f"Get report for day error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/generate-questions', methods=['POST'])
def generate_questions():
    """Generate quiz questions from uploaded videos using GPT."""
    try:
        # Get optional date filter from request
        request_data = request.get_json() or {}
        target_date = request_data.get('date')
        
        # Get all processed videos
        video_chunks_root = os.path.abspath(VIDEO_CHUNKS_ROOT)
        questions = []
        people = _load_people()
        
        if not os.path.exists(video_chunks_root):
            return jsonify({"error": "No videos processed yet"}), 404
        
        # Load journals to get dates
        journal_file = JOURNALS_PATH
        journals = {}
        if os.path.exists(journal_file):
            with open(journal_file, 'r', encoding='utf-8') as f:
                journals = json.load(f)
        
        # Collect data from video chunks
        video_data = []
        for folder_name in os.listdir(video_chunks_root):
            folder_path = os.path.join(video_chunks_root, folder_name)
            if not os.path.isdir(folder_path):
                continue
            
            # Get journal entry and date if exists
            journal_entry = None
            video_date = None
            for video_name, journal_data in journals.items():
                if folder_name.replace('_chunks', '') in video_name:
                    journal_entry = journal_data.get('entry')
                    video_date = journal_data.get('date')
                    break
            
            # Filter by date if provided
            if target_date and video_date:
                from datetime import datetime
                try:
                    target = datetime.fromisoformat(target_date.replace('Z', '+00:00')).date()
                    video = datetime.fromisoformat(video_date.replace('Z', '+00:00')).date()
                    if target != video:
                        continue  # Skip videos that don't match the date
                except:
                    pass  # If date parsing fails, include the video anyway
            
            # Load transcript
            transcript_path = os.path.join(folder_path, 'full_transcript.json')
            transcripts = {}
            if os.path.exists(transcript_path):
                with open(transcript_path, 'r', encoding='utf-8') as f:
                    transcripts = json.load(f)
            
            # Load face data
            faces_data = {}
            for file in os.listdir(folder_path):
                if file.endswith('_faces.json'):
                    with open(os.path.join(folder_path, file), 'r', encoding='utf-8') as f:
                        faces_data.update(json.load(f))
            
            # Combine data for each chunk
            for chunk_name, transcript in transcripts.items():
                video_path = f"/video_chunks/{folder_name}/{chunk_name}.mp4"
                
                # Get faces for this chunk
                faces = []
                for path, names in faces_data.items():
                    if chunk_name in path:
                        faces = [display_name(n, people, relation=True) for n in names]
                        break
                
                video_data.append({
                    "video_path": video_path,
                    "transcript": transcript,
                    "faces": faces,
                    "journal": journal_entry
                })
        
        if not video_data:
            return jsonify({"error": "No video data available"}), 404
        
        # Prepare context for GPT
        context = "Generate 5 memory quiz questions based on the following video data:\n\n"
        for i, data in enumerate(video_data[:5], 1):  # Limit to 5 videos
            context += f"Video {i}:\n"
            # Only include transcript if it's meaningful (more than 3 words and not just fragments)
            if data['transcript'] and data['transcript'] != "Audio was not understood":
                words = data['transcript'].split()
                if len(words) > 3:  # Only include if transcript has more than 3 words
                    context += f"- Transcript: {data['transcript']}\n"
            if data['faces']:
                context += f"- People present: {', '.join(data['faces'])}\n"
            if data['journal']:
                context += f"- Journal entry (MOST IMPORTANT): {data['journal']}\n"
            context += f"- Video file: {data['video_path']}\n\n"
        
        # Call GPT to generate questions
        api_key = os.getenv('OPENAI_API_KEY', 'not_configured')
        if not api_key or api_key == 'not_configured':
            # Fallback to template questions if no API key
            return jsonify({
                "questions": [
                    {
                        "question": "What activity did you do in this video?",
                        "answer": "Please describe the activity shown",
                        "video": video_data[0]['video_path'] if video_data else ""
                    },
                    {
                        "question": "Who was with you in this memory?",
                        "answer": ", ".join(video_data[0]['faces']) if video_data and video_data[0]['faces'] else "Unknown",
                        "video": video_data[0]['video_path'] if video_data else ""
                    }
                ]
            }), 200
        
        try:
            response = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a memory care assistant creating personalized quiz questions for dementia/Alzheimer's patients. "
                            "Generate questions that test recall of specific events, people, places, and activities from video memories. "
                            "IMPORTANT RULES:\n"
                            "1. Prioritize journal entries as the PRIMARY source of information\n"
                            "2. Only use transcripts if they are clear and meaningful (ignore short fragments)\n"
                            "3. Focus on: who was present, what activity happened, where it took place, what was used\n"
                            "4. Make questions specific and personal, not generic\n"
                            "5. DO NOT ask about transcripts directly - ask about the actual event/memory\n"
                            "6. Return ONLY a valid JSON array: [{\"question\": \"...\", \"answer\": \"...\", \"video\": \"video_path\"}]"
                        )
                    },
                    {
                        "role": "user",
                        "content": (
                            context + 
                            "\n\nGenerate 5 diverse, meaningful questions that help test memory of this specific event. "
                            "Questions should be about the actual experience (location, people, activity, objects used), "
                            "NOT about technical details like transcripts. Return only valid JSON array."
                        )
                    }
                ],
                temperature=0.7
            )
            
            result = response.choices[0].message.content.strip()
            
            # Try to parse as JSON
            if result.startswith('['):
                questions_data = json.loads(result)
                
                # Save to qas.json
                with open(QAS_PATH, 'w', encoding='utf-8') as f:
                    json.dump(questions_data, f, indent=2)
                
                return jsonify({"questions": questions_data, "generated": True}), 200
            else:
                return jsonify({"error": "Failed to parse GPT response", "raw": result}), 500
                
        except Exception as e:
            print(f"GPT question generation error: {e}")
            return jsonify({"error": f"GPT error: {str(e)}"}), 500
        
    except Exception as e:
        print(f"Generate questions error: {e}")
        return jsonify({"error": str(e)}), 500



def _friendly_memory_date(value):
    try: day = datetime.fromisoformat(str(value)[:10]).date()
    except (TypeError, ValueError): return {'date': value, 'label': ''}
    today = datetime.now().date(); return {'date': day.isoformat(), 'label': 'today' if day == today else 'yesterday' if (today-day).days == 1 else day.strftime('%A')}

def _ask_context(memory_id=None):
    memories=_memory_data(); selected=list(memories.items()) if not memory_id else ([(memory_id,memories[memory_id])] if memory_id in memories else None)
    if selected is None: return None
    try:
        with open(JOURNALS_PATH,encoding='utf-8') as f: journals=json.load(f)
    except Exception: journals={}
    people=_load_people(); out=[]
    for mid,row in selected:
        fn=row.get('filename',''); j=journals.get(fn,{}) if isinstance(journals,dict) else {}; tr=[]; folder=os.path.join(os.path.abspath(VIDEO_CHUNKS_ROOT),os.path.splitext(fn)[0]+'_chunks')
        try:
            with open(os.path.join(folder,'full_transcript.json'),encoding='utf-8') as f:
                raw=json.load(f); tr=[str(v) for v in raw.values()] if isinstance(raw,dict) else [str(v) for v in raw]
        except Exception: pass
        names=[]
        for face_file in os.listdir(folder) if os.path.isdir(folder) else []:
            if face_file.endswith('_faces.json'):
                try:
                    with open(os.path.join(folder, face_file), encoding='utf-8') as f: face=json.load(f)
                    ids={n for values in face.values() for n in values} if isinstance(face,dict) else set()
                    names.extend(display_name(n, people) for n in ids)
                except Exception: pass
        out.append({'id':mid,'title':row.get('title') or j.get('title') or os.path.splitext(fn)[0],'note':row.get('note') or j.get('entry') or '','date':row.get('date') or j.get('date'),'transcript':tr,'people':list(dict.fromkeys(names))})
    return out

@api.route('/memories/ask',methods=['POST'])
def ask_memory():
    payload=request.get_json(silent=True) or {}; q=payload.get('question')
    if not isinstance(q,str) or not q.strip() or len(q)>300: return jsonify(error='Question must be up to 300 characters.'),400
    q=re.sub(r'[\x00-\x1f\x7f]',' ',q).strip(); contexts=_ask_context(payload.get('memory_id'))
    if contexts is None: return jsonify(error='Memory not found'),404
    import auth; session=g.get('auth_session')
    if session and not auth.limits().hit(('memory-ask',session['id']),60,3600): return jsonify(error='Please try again in a moment.'),429
    try: lang=_load_settings().get('language','en')
    except Exception: lang='en'
    if lang not in ('en','hi','as'): lang='en'
    low=q.lower(); words=set(re.findall(r'[a-z0-9]+',low)); when=bool(words & {'when','date','day'}); who=bool(words & {'who','whom','with'}); what=bool(words & {'where','what','which','animal','see','saw'})
    if not payload.get('memory_id'):
        scored=[(sum(1 for t in re.findall(r'[a-z0-9]+',low) if t in (c['title']+' '+c['note']+' '+' '.join(c['transcript'])).lower()),c) for c in contexts]; contexts=[c for n,c in scored if n>0] or contexts
    sources=[{'memory_id':c['id'],'title':c['title'],**_friendly_memory_date(c['date'])} for c in contexts[:3]]; ans=None
    if contexts and when:
        c=contexts[0]; d=_friendly_memory_date(c['date']); ans=f"You went to {c['title']} on {d['label'] or d['date']}."
    elif contexts and who:
        c=contexts[0]; ans=f"{', '.join(c['people'])} was in this video." if c['people'] else (c['note'] or None)
    elif contexts and what:
        c=contexts[0]; text=' '.join([c['note'],*c['transcript']]); ss=[x.strip() for x in re.split(r'(?<=[.!?])\s+',text) if any(t in x.lower() for t in words if len(t)>2)]
        if not ss and ('animal' in words or 'behind' in words): ss=[x.strip() for x in re.split(r'(?<=[.!?])\s+',text) if re.search(r'elephant|animal|lion|dog|cat|bird', x, re.I)]
        ans=ss[0] if ss else None
    if ans: return jsonify(answer=ans,language=lang,sources=sources,grounded=True)
    return jsonify(answer=("I can't look at the pictures right now." if what and not AI_AVAILABLE else "I couldn't find that in your memories."),language=lang,sources=sources,grounded=False),200

from auth import init_auth

configure(api)
init_auth(api, lambda: _load_settings())
CORS(api, origins=api.config['AUTH_ORIGINS'], supports_credentials=True)


@api.before_request
def migrate_authenticated_data():
    # Authentication runs first. Never mutate data on an anonymous request.
    from flask import g
    if g.get('auth_session') and request.blueprint != 'auth':
        from flask import abort
        if not g.get('active_patient'):
            abort(403)
        ensure_runtime_data()
        _migrate_performance_record_ids()


if __name__ == '__main__':
    api.run(host=os.getenv('COGNI_HOST', '127.0.0.1'), port=5000, debug=os.getenv('FLASK_DEBUG') == '1')
