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
import numpy as np
import glob
import time
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
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}
api.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
api.config['KNOWN_FACES_FOLDER'] = KNOWN_FACES_FOLDER
api.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max file size

# Track processing status
processing_status = {}  
_active_patient_jobs = set()
_patient_job_lock = threading.Lock()
PATIENT_STORAGE_LIMIT_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB per patient
MIN_FREE_DISK_BYTES = 100 * 1024 * 1024  # 100 MB free space


def _chunks_folder(video_filename):
    """process_video names the chunk folder after the uploaded file."""
    return os.path.splitext(video_filename)[0] + '_chunks'


def _get_upload_limits(is_demo=False):
    max_mb = 20 if is_demo else int(os.getenv('COGNI_MAX_UPLOAD_MB', '200'))
    max_seconds = int(os.getenv('COGNI_MAX_VIDEO_SECONDS', '180'))
    return max_mb, max_seconds


def _probe_video(file_path):
    """Probe video file with cv2.VideoCapture. Returns (duration_seconds, width, height) or raises ValueError."""
    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        cap.release()
        raise ValueError("Could not open video file.")
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    if fps <= 0 or frame_count <= 0 or width <= 0 or height <= 0:
        raise ValueError("Invalid video stream or dimensions.")
    duration = frame_count / fps
    return duration, width, height


def _validate_memory_date(date_str):
    if not isinstance(date_str, str) or not date_str.strip():
        return None, "Date is required."
    date_str = date_str.strip()
    try:
        val = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        return None, "Date must be in YYYY-MM-DD format."
    from datetime import date, timedelta
    today = date.today()
    if val > today + timedelta(days=1):
        return None, "Date cannot be in the future."
    return date_str, None


def _clean_memory_note(note_str):
    if note_str is None:
        return ""
    if not isinstance(note_str, str):
        raise ValueError("Note must be a string.")
    cleaned = re.sub(r'[\x00-\x1f\x7f]', ' ', note_str).strip()
    if len(cleaned) > 300:
        raise ValueError("Note must be up to 300 characters.")
    return cleaned


def _cleanup_partial_files(base_dir, filename, memory_id=None):
    if not base_dir:
        return
    if filename:
        chunk_f = _chunks_folder(filename)
        for p in (
            os.path.join(base_dir, 'content', filename),
            os.path.join(base_dir, 'content', chunk_f),
            os.path.join(base_dir, 'video_chunks', chunk_f),
            os.path.join(base_dir, 'frames', chunk_f),
        ):
            if os.path.isfile(p):
                try: os.remove(p)
                except OSError: pass
            elif os.path.isdir(p):
                try: shutil.rmtree(p, ignore_errors=True)
                except OSError: pass
    if memory_id:
        thumb = os.path.join(base_dir, 'memory_thumbnails', f"{memory_id}.png")
        if os.path.isfile(thumb):
            try: os.remove(thumb)
            except OSError: pass


def _cleanup_stale_processing_jobs(patient_data_root=None):
    root = patient_data_root or api.config.get('PATIENT_DATA_ROOT')
    if not root or not os.path.isdir(root):
        return
    for item in os.listdir(root):
        base_dir = os.path.join(root, item)
        if not os.path.isdir(base_dir):
            continue
        memories_file = os.path.join(base_dir, 'memories.json')
        if not os.path.isfile(memories_file):
            continue
        try:
            with open(memories_file, 'r', encoding='utf-8') as f:
                memories = json.load(f)
            if not isinstance(memories, dict):
                continue
            changed = False
            for mid, row in memories.items():
                if isinstance(row, dict) and row.get('status') == 'processing':
                    with _patient_job_lock:
                        is_active = item in _active_patient_jobs
                    if not is_active:
                        row['status'] = 'failed'
                        msg = 'Processing was interrupted. Please add the video again.'
                        row['message'] = msg
                        row['error'] = msg
                        _cleanup_partial_files(base_dir, row.get('filename'), mid)
                        changed = True
            if changed:
                with open(memories_file, 'w', encoding='utf-8') as f:
                    json.dump(memories, f, ensure_ascii=False, indent=2)
        except Exception:
            pass


def _invalidate_daily_plan_cache(date_val, base_dir=None):
    date_str = _local_date(date_val) if date_val else None
    if not date_str:
        return
    plans_path = os.path.join(base_dir, 'daily_plans.json') if base_dir else DAILY_PLANS_PATH
    if os.path.exists(plans_path):
        try:
            with open(plans_path, 'r', encoding='utf-8') as f:
                plans = json.load(f)
            if isinstance(plans, dict) and date_str in plans:
                plans.pop(date_str, None)
                with open(plans_path, 'w', encoding='utf-8') as f:
                    json.dump(plans, f, indent=2, ensure_ascii=False)
        except Exception:
            pass
    try:
        _invalidate_unplayed_plans(date_str)
    except Exception:
        pass


def _generate_questions_for_video(base_dir, filename, video_date, note):
    folder_name = _chunks_folder(filename)
    folder_path = os.path.join(base_dir, 'video_chunks', folder_name)
    if not os.path.isdir(folder_path):
        return []

    transcripts = {}
    transcript_path = os.path.join(folder_path, 'full_transcript.json')
    if os.path.exists(transcript_path):
        try:
            with open(transcript_path, 'r', encoding='utf-8') as f:
                transcripts = json.load(f)
        except Exception:
            transcripts = {}

    faces_data = {}
    for f in os.listdir(folder_path):
        if f.endswith('_faces.json'):
            try:
                with open(os.path.join(folder_path, f), 'r', encoding='utf-8') as f_in:
                    faces_data.update(json.load(f_in))
            except Exception:
                pass

    people_path = os.path.join(base_dir, 'people.json')
    people = []
    if os.path.exists(people_path):
        try:
            with open(people_path, 'r', encoding='utf-8') as f:
                people = json.load(f)
        except Exception:
            people = []

    video_data = []
    for chunk_name, transcript in transcripts.items():
        video_path = f"/video_chunks/{folder_name}/{chunk_name}.mp4"
        faces = []
        for path, names in faces_data.items():
            if chunk_name in path:
                faces = [dn for n in names if (dn := display_name(n, people, relation=True))]
                break
        video_data.append({
            "video_path": video_path,
            "transcript": transcript,
            "faces": faces,
            "journal": note
        })

    if not video_data:
        video_path = f"/video_chunks/{folder_name}/chunk_0000_0010.mp4"
        video_data = [{
            "video_path": video_path,
            "transcript": "",
            "faces": [],
            "journal": note
        }]

    questions_generated = []
    ai_client = client if AI_AVAILABLE else None
    if ai_client is not None:
        try:
            context = "Generate 5 memory quiz questions based on the following video data:\n\n"
            for i, data in enumerate(video_data[:5], 1):
                context += f"Video {i}:\n"
                if data['transcript'] and data['transcript'] != "Audio was not understood":
                    words = data['transcript'].split()
                    if len(words) > 3:
                        context += f"- Transcript: {data['transcript']}\n"
                if data['faces']:
                    context += f"- People present: {', '.join(data['faces'])}\n"
                if data['journal']:
                    context += f"- Journal entry (MOST IMPORTANT): {data['journal']}\n"
                context += f"- Video file: {data['video_path']}\n\n"

            response = ai_client.chat.completions.create(
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
                        "content": context + "\n\nGenerate 5 diverse, meaningful questions. Return only valid JSON array."
                    }
                ],
                temperature=0.7
            )
            result = response.choices[0].message.content.strip()
            if result.startswith('['):
                questions_generated = json.loads(result)
        except Exception as e:
            print(f"AI question generation error in worker: {e}")

    if not questions_generated:
        primary_vid = video_data[0]['video_path']
        questions_generated = [
            {
                "question": "What activity did you do in this video?",
                "answer": note if note else "Please describe the activity shown",
                "video": primary_vid,
                "fallback": True
            },
            {
                "question": "Who was with you in this memory?",
                "answer": ", ".join(video_data[0]['faces']) if video_data and video_data[0]['faces'] else "Unknown",
                "video": primary_vid,
                "fallback": True
            }
        ]

    qas_path = os.path.join(base_dir, 'qas.json')
    existing_qas = []
    if os.path.exists(qas_path):
        try:
            with open(qas_path, 'r', encoding='utf-8') as f:
                loaded = json.load(f)
                if isinstance(loaded, list):
                    existing_qas = [q for q in loaded if isinstance(q, dict) and folder_name not in str(q.get('video', ''))]
        except Exception:
            existing_qas = []

    all_qas = existing_qas + questions_generated
    try:
        with open(qas_path, 'w', encoding='utf-8') as f:
            json.dump(all_qas, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Could not save qas.json: {e}")

    return questions_generated


def _process_video_job(patient_id, base_dir, memory_id, filename, video_date, note):
    status_key = (base_dir, filename)
    filepath = os.path.join(base_dir, 'content', filename)
    memories_path = os.path.join(base_dir, 'memories.json')

    def _set_memory_status(status, progress=0, message='', error=None):
        processing_status[status_key] = {
            'status': status,
            'progress': progress,
            'message': message,
            'error': error
        }
        try:
            if os.path.exists(memories_path):
                with open(memories_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if isinstance(data, dict) and memory_id in data:
                    data[memory_id]['status'] = status
                    data[memory_id]['progress'] = progress
                    data[memory_id]['message'] = message
                    if error:
                        data[memory_id]['error'] = error
                    elif 'error' in data[memory_id]:
                        data[memory_id].pop('error', None)
                    with open(memories_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as exc:
            print(f"Error updating memories.json: {exc}")

    try:
        _set_memory_status('processing', progress=20, message='Analyzing video...')
        from process_video import process_uploaded_video

        _set_memory_status('processing', progress=40, message='Transcribing and recognizing faces...')
        result = process_uploaded_video(filepath, base_dir)

        if result.get('success'):
            _set_memory_status('processing', progress=80, message='Creating memory questions...')
            _generate_questions_for_video(base_dir, filename, video_date, note)
            crosswords_file = os.path.join(base_dir, 'crosswords.json')
            invalidate_crossword_cache(video_date, crosswords_file)
            _invalidate_daily_plan_cache(video_date, base_dir)

            try:
                thumb_dir = os.path.join(base_dir, 'memory_thumbnails')
                os.makedirs(thumb_dir, exist_ok=True)
                thumb_target = os.path.join(thumb_dir, f"{memory_id}.png")
                if not os.path.exists(thumb_target) and os.path.exists(filepath):
                    cap = cv2.VideoCapture(filepath)
                    cap.set(cv2.CAP_PROP_POS_MSEC, 1000)
                    ok, frame = cap.read()
                    cap.release()
                    if ok:
                        cv2.imwrite(thumb_target, frame)
            except Exception:
                pass

            _set_memory_status('ready', progress=100, message='Ready')
        else:
            err = result.get('error') or 'Video processing failed'
            _cleanup_partial_files(base_dir, filename, memory_id)
            _set_memory_status('failed', progress=0, message=f"Processing failed: {err}", error=err)
    except Exception as exc:
        err = str(exc)
        _cleanup_partial_files(base_dir, filename, memory_id)
        _set_memory_status('failed', progress=0, message=f"Processing error: {err}", error=err)
    finally:
        with _patient_job_lock:
            _active_patient_jobs.discard(patient_id)


thumbnail_slots = threading.BoundedSemaphore(2)
NEUTRAL_THUMBNAIL = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAQCAYAAAB49x7jAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAAAwABQAB'
    'JzQnCgAAAABJRU5ErkJggg=='
)

client = OpenAI(
    api_key=os.getenv('OPENAI_API_KEY', 'not_configured')
)
AI_AVAILABLE = bool(os.getenv('OPENAI_API_KEY') and os.getenv('OPENAI_API_KEY') not in ('not_configured', 'your_openai_api_key_here'))

def _git_commit_hash():
    try:
        import subprocess
        out = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=os.path.dirname(__file__), text=True)
        return out.strip()
    except Exception:
        return 'unknown'

GIT_COMMIT_HASH = _git_commit_hash()
print(f"CogniConnect backend starting (commit {GIT_COMMIT_HASH})")
print(f"memory AI fallback: {'enabled' if AI_AVAILABLE else 'disabled'}")

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
        if row.get('status') not in ('failed', 'processing') and not os.path.isfile(os.path.join(os.path.abspath(UPLOAD_FOLDER), filename)) and not os.path.isdir(os.path.join(chunks_root, _chunks_folder(filename))):
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
                                face_data[video_path] = [dn for n in names if (dn := display_name(n, people, relation=True))]
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
        chunk_folder = os.path.join(os.path.abspath(VIDEO_CHUNKS_ROOT), _chunks_folder(filename))
        status_info = processing_status.get((patient_path(''), filename), {})
        status = status_info.get('status') or row.get('status', 'ready')
        if status == 'completed':
            status = 'ready'
        elif status not in ('processing', 'failed'):
            status = 'ready'
        if status != 'failed' and not os.path.isfile(path) and not os.path.isdir(chunk_folder):
            continue
        journal = {}
        try:
            with open(JOURNALS_PATH, 'r', encoding='utf-8') as stream:
                journal = json.load(stream).get(filename, {})
        except (OSError, ValueError, TypeError):
            pass
        d_info = _friendly_memory_date(journal.get('date') or row.get('date'))
        stem = filename.rsplit('.', 1)[0]
        chunks_root = os.path.abspath(VIDEO_CHUNKS_ROOT)
        folder = os.path.join(chunks_root, _chunks_folder(filename))
        if not os.path.isdir(folder):
            cand = os.path.join(chunks_root, stem.replace(' ', '_') + '_chunks')
            if os.path.isdir(cand): folder = cand
            else:
                cand = os.path.join(chunks_root, stem.replace('_', ' ') + '_chunks')
                if os.path.isdir(cand): folder = cand
        p_names = list(row.get('people', []))
        if not p_names and os.path.isdir(folder):
            all_people = _load_people()
            for face_file in os.listdir(folder):
                if face_file.endswith('_faces.json'):
                    try:
                        with open(os.path.join(folder, face_file), encoding='utf-8') as f:
                            face = json.load(f)
                        ids = {n for values in face.values() for n in values} if isinstance(face, dict) else set()
                        for n in ids:
                            dn = display_name(n, all_people)
                            if dn and dn not in p_names:
                                p_names.append(dn)
                    except Exception:
                        pass
        tr = list(row.get('transcript', []))
        if not tr and os.path.isdir(folder):
            try:
                with open(os.path.join(folder, 'full_transcript.json'), encoding='utf-8') as f:
                    raw = json.load(f)
                    tr = [str(v) for v in raw.values()] if isinstance(raw, dict) else [str(v) for v in raw]
            except Exception:
                pass
        rows.append({
            'id': memory_id, 'title': row.get('title') or filename.rsplit('.', 1)[0],
            'date': journal.get('date') or row.get('date'),
            'dateLabel': d_info.get('dateLabel', ''),
            'note': journal.get('entry') or row.get('note', ''),
            'durationSeconds': row.get('durationSeconds'), 'thumbnailUrl': f'/memories/{memory_id}/thumbnail',
            'people': p_names, 'transcript': tr, 'status': status,
            'progress': status_info.get('progress', 0) if status == 'processing' else (100 if status == 'ready' else (row.get('progress') or 0)),
            'message': status_info.get('message') or row.get('message', ''),
            'error': status_info.get('error') or row.get('error'),
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
    active_patient = g.get('active_patient')
    if not session or not active_patient:
        return False
    if session.get('kind') == 'patient_device':
        return False
    user = auth.session_user()
    if user and ('role' in user.keys() and user['role'] == 'patient'):
        return False
    pid = active_patient.get('id')
    if auth.self_account():
        return auth.owner_of(pid)
    if auth.is_caregiver():
        return auth.authorized_patient(pid)
    return False


@api.route('/memories', methods=['POST'])
def create_memory():
    if not _memory_edit_allowed():
        return jsonify(error='Only a caregiver or self account can add memories.'), 403
    active_patient = g.get('active_patient')
    patient_id = active_patient['id']
    base_dir = os.path.abspath(patient_path(''))

    with _patient_job_lock:
        if patient_id in _active_patient_jobs:
            return jsonify(error='A video is already being processed'), 409

    try:
        if shutil.disk_usage(base_dir).free < MIN_FREE_DISK_BYTES:
            return jsonify(error='Insufficient server disk space.'), 507
    except OSError:
        pass

    total_size = sum(
        os.path.getsize(os.path.join(dirpath, f))
        for dirpath, _, filenames in os.walk(base_dir)
        for f in filenames
    )
    if total_size > PATIENT_STORAGE_LIMIT_BYTES:
        return jsonify(error='Patient storage limit exceeded (2 GB).'), 507

    if 'file' not in request.files and 'video' not in request.files:
        return jsonify(error='No video file provided.'), 400
    file = request.files.get('file') or request.files.get('video')
    if not file or not file.filename:
        return jsonify(error='No file selected.'), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in {'.mp4', '.mov', '.webm'}:
        return jsonify(error='Invalid file type. Allowed types: mp4, mov, webm.'), 400

    date_val = request.form.get('date')
    cleaned_date, date_err = _validate_memory_date(date_val)
    if date_err:
        return jsonify(error=date_err), 400

    note_val = request.form.get('note', '')
    try:
        cleaned_note = _clean_memory_note(note_val)
    except ValueError as e:
        return jsonify(error=str(e)), 400

    import auth
    is_demo = auth.is_demo_patient(patient_id) if hasattr(auth, 'is_demo_patient') else False
    max_mb, max_seconds = _get_upload_limits(is_demo)
    max_bytes = max_mb * 1024 * 1024

    temp_name = f"{uuid.uuid4().hex}.tmp"
    content_dir = os.path.join(base_dir, 'content')
    os.makedirs(content_dir, exist_ok=True)
    temp_path = os.path.join(content_dir, temp_name)
    bytes_written = 0
    try:
        with open(temp_path, 'wb') as f_out:
            while True:
                chunk = file.stream.read(1024 * 1024)
                if not chunk:
                    break
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    raise OverflowError()
                f_out.write(chunk)
    except OverflowError:
        if os.path.isfile(temp_path):
            os.remove(temp_path)
        return jsonify(error=f'Video exceeds maximum upload size of {max_mb} MB.'), 413
    except Exception as e:
        if os.path.isfile(temp_path):
            os.remove(temp_path)
        return jsonify(error=f'Upload failed: {str(e)}'), 500

    try:
        duration, width, height = _probe_video(temp_path)
    except Exception:
        if os.path.isfile(temp_path):
            os.remove(temp_path)
        return jsonify(error='Corrupt or unreadable video file.'), 400

    if duration > max_seconds:
        if os.path.isfile(temp_path):
            os.remove(temp_path)
        return jsonify(error=f'Video duration ({int(duration)}s) exceeds limit of {max_seconds} seconds.'), 400

    stored_filename = f"{uuid.uuid4().hex}{ext}"
    final_path = os.path.join(content_dir, stored_filename)

    memory_id = uuid.uuid4().hex
    memories = _memory_data()
    memories[memory_id] = {
        'filename': stored_filename,
        'createdAt': datetime.now().timestamp(),
        'title': stored_filename.rsplit('.', 1)[0],
        'date': cleaned_date,
        'note': cleaned_note,
        'durationSeconds': round(duration, 1),
        'status': 'processing',
        'progress': 0,
        'message': 'Video processing started'
    }
    os.replace(temp_path, final_path)
    with open(MEMORIES_PATH, 'w', encoding='utf-8') as stream:
        json.dump(memories, stream, ensure_ascii=False, indent=2)

    journals = {}
    try:
        if os.path.exists(JOURNALS_PATH):
            with open(JOURNALS_PATH, 'r', encoding='utf-8') as stream:
                journals = json.load(stream)
    except Exception:
        journals = {}
    journals[stored_filename] = {
        'entry': cleaned_note,
        'timestamp': datetime.now().isoformat(),
        'video_path': f"/content/{stored_filename}",
        'date': cleaned_date
    }
    with open(JOURNALS_PATH, 'w', encoding='utf-8') as stream:
        json.dump(journals, stream, ensure_ascii=False, indent=2)

    status_key = (base_dir, stored_filename)
    processing_status[status_key] = {
        'status': 'processing',
        'message': 'Video processing started',
        'progress': 0
    }

    with _patient_job_lock:
        _active_patient_jobs.add(patient_id)

    thread = threading.Thread(
        target=_process_video_job,
        args=(patient_id, base_dir, memory_id, stored_filename, cleaned_date, cleaned_note)
    )
    thread.daemon = True
    thread.start()

    return jsonify(
        id=memory_id,
        status='processing',
        progress=0,
        message='Video uploaded and processing started.'
    ), 201


@api.route('/memories/<memory_id>', methods=['GET'])
def get_memory(memory_id):
    if not isinstance(memory_id, str) or not re.fullmatch(r'[0-9a-f]{32}', memory_id):
        return jsonify(error='Memory not found'), 404
    base_dir = os.path.abspath(patient_path(''))
    memories = _memory_data()
    row = memories.get(memory_id)
    if not row or not isinstance(row, dict) or not row.get('filename'):
        return jsonify(error='Memory not found'), 404

    filename = row['filename']
    status_key = (base_dir, filename)
    live_status = processing_status.get(status_key)

    status = (live_status.get('status') if live_status else None) or row.get('status') or 'ready'
    if status == 'completed':
        status = 'ready'
    elif status not in ('processing', 'failed'):
        status = 'ready'

    progress = (live_status.get('progress') if live_status else None) if status == 'processing' else (100 if status == 'ready' else (row.get('progress') or 0))
    message = (live_status.get('message') if live_status else None) or row.get('message') or ('Ready' if status == 'ready' else '')
    error_msg = (live_status.get('error') if live_status else None) or row.get('error')

    d_info = _friendly_memory_date(row.get('date'))
    return jsonify({
        'id': memory_id,
        'status': status,
        'progress': progress,
        'message': message,
        'error': error_msg,
        'title': row.get('title') or filename.rsplit('.', 1)[0],
        'date': row.get('date'),
        'dateLabel': d_info.get('dateLabel', ''),
        'note': row.get('note', ''),
        'durationSeconds': row.get('durationSeconds'),
        'thumbnailUrl': f"/memories/{memory_id}/thumbnail"
    }), 200


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

    cleaned_note = None
    if 'note' in payload:
        try:
            cleaned_note = _clean_memory_note(payload['note'])
        except ValueError as e:
            return jsonify(error=str(e)), 400

    cleaned_date = None
    if 'date' in payload:
        cleaned_date, date_err = _validate_memory_date(payload['date'])
        if date_err:
            return jsonify(error=date_err), 400

    base_dir = os.path.abspath(patient_path(''))
    memories = _memory_data()
    memory_id_row = memories[memory_id]
    old_filename = memory_id_row['filename']
    old_date = memory_id_row.get('date')

    journals = {}
    try:
        with open(JOURNALS_PATH, 'r', encoding='utf-8') as stream:
            journals = json.load(stream)
    except (OSError, ValueError, TypeError):
        pass
    journal = dict(journals.get(old_filename, {}))

    if 'title' in payload:
        memory_id_row['title'] = payload['title'].strip()
    if cleaned_note is not None:
        journal['entry'] = cleaned_note
        memory_id_row['note'] = cleaned_note
    if cleaned_date is not None:
        journal['date'] = cleaned_date
        memory_id_row['date'] = cleaned_date

    journals[old_filename] = journal
    with open(JOURNALS_PATH, 'w', encoding='utf-8') as stream:
        json.dump(journals, stream, ensure_ascii=False, indent=2)
    with open(MEMORIES_PATH, 'w', encoding='utf-8') as stream:
        json.dump(memories, stream, ensure_ascii=False, indent=2)

    if cleaned_date is not None and cleaned_date != old_date:
        invalidate_crossword_cache(old_date)
        invalidate_crossword_cache(cleaned_date)
        _invalidate_daily_plan_cache(old_date, base_dir)
        _invalidate_daily_plan_cache(cleaned_date, base_dir)
    elif old_date:
        invalidate_crossword_cache(old_date)

    return jsonify(
        id=memory_id,
        title=memory_id_row.get('title') or old_filename.rsplit('.', 1)[0],
        note=memory_id_row.get('note', ''),
        date=memory_id_row.get('date')
    )


@api.route('/memories/<memory_id>', methods=['DELETE'])
def delete_memory(memory_id):
    if not _memory_edit_allowed():
        return jsonify(error='Only a caregiver or self account can delete memories.'), 403
    row = _memory_for_id(memory_id)
    if not row:
        return jsonify(error='Memory not found'), 404
    base = os.path.abspath(patient_path(''))
    filename = row['filename']

    status_key = (base, filename)
    live_status = processing_status.get(status_key)
    if (live_status and live_status.get('status') == 'processing') or row.get('status') == 'processing':
        return jsonify(error='Cannot delete a memory while it is processing.'), 409

    memories = _memory_data()
    memories.pop(memory_id, None)

    for path in (os.path.join(base, 'content', filename), os.path.join(base, 'memory_thumbnails', memory_id + '.png')):
        if os.path.isfile(path):
            try: os.remove(path)
            except OSError: pass

    chunk_folder = _chunks_folder(filename)
    for folder in ('video_chunks', 'frames', 'content'):
        path = os.path.join(base, folder, chunk_folder)
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)

    journals = {}
    try:
        with open(JOURNALS_PATH, 'r', encoding='utf-8') as stream:
            journals = json.load(stream)
    except (OSError, ValueError, TypeError):
        pass
    date_value = journals.pop(filename, {}).get('date') if isinstance(journals.get(filename, {}), dict) else None
    if not date_value:
        date_value = row.get('date')

    with open(JOURNALS_PATH, 'w', encoding='utf-8') as stream:
        json.dump(journals, stream, ensure_ascii=False, indent=2)

    # Filter qas.json to only remove questions matching this video's chunk folder
    qas_path = os.path.join(base, 'qas.json')
    if os.path.exists(qas_path):
        try:
            with open(qas_path, 'r', encoding='utf-8') as stream:
                qas = json.load(stream)
            if isinstance(qas, list):
                filtered_qas = [q for q in qas if isinstance(q, dict) and chunk_folder not in str(q.get('video', ''))]
                with open(qas_path, 'w', encoding='utf-8') as stream:
                    json.dump(filtered_qas, stream, indent=2, ensure_ascii=False)
        except Exception:
            pass

    with open(MEMORIES_PATH, 'w', encoding='utf-8') as stream:
        json.dump(memories, stream, ensure_ascii=False, indent=2)

    if date_value:
        invalidate_crossword_cache(date_value)
        _invalidate_daily_plan_cache(date_value, base)

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
    with open(PEOPLE_FILE, 'r', encoding='utf-8-sig') as f:
        return json.load(f)


def _title(name):
    """"jawed karim" -> "Jawed Karim"; leaves the rest of each word alone ("McDonald")."""
    return ' '.join(w[:1].upper() + w[1:] for w in name.split())


VALID_RELATIONS = {'Son', 'Daughter', 'Wife', 'Husband', 'Grandchild', 'Friend', 'Doctor', 'Neighbour', 'Caregiver', 'Other'}
RELATION_MAP = {r.lower(): r for r in VALID_RELATIONS}
MAX_PHOTO_BYTES = 5 * 1024 * 1024

from locks import rescan_reset_lock
_rescan_reset_lock = rescan_reset_lock
_rescan_status_lock = threading.Lock()
_patient_rescan_status = {}
_patient_rescan_timestamps = {}


def _people_edit_allowed():
    import auth
    session = g.get('auth_session')
    if not session or session.get('kind') == 'patient_device':
        return False
    if not g.get('active_patient'):
        return False
    patient_id = g.active_patient['id']
    if not auth.authorized_patient(patient_id):
        return False
    if auth.self_account():
        user = auth.session_user()
        if not user or user['patient_id'] != patient_id:
            return False
        return True
    if auth.is_caregiver() and session.get('kind') == 'caregiver':
        return True
    return False


def display_name(face_id, people, relation=False):
    """Face recognition reports a photo's id (with "_" sometimes shown as " ").
    Return that person's name, optionally with the relation: "Dinesh (son)"."""
    key = face_id.strip().lower()
    for p in people:
        stem = os.path.splitext(p.get('photo', ''))[0].lower()
        if key in (p['id'].lower(), p['id'].replace('_', ' ').lower(), stem, stem.replace('_', ' ')):
            name = _title(p['name'])
            return f"{name} ({p['relation'].lower()})" if relation and p.get('relation') else name
    return None


def _save_people(people):
    with open(PEOPLE_FILE, 'w', encoding='utf-8') as f:
        json.dump(people, f, indent=2, ensure_ascii=False)


def _save_photo(file, old_photo=None):
    """Save an uploaded photo as known_faces/<random>.<ext>. Returns (filename, error, status_code)."""
    if not file or file.filename == '':
        return None, "Please choose a photo.", 400
    try:
        content = file.read()
    except Exception:
        return None, "Unable to read photo file.", 400
    if len(content) > MAX_PHOTO_BYTES:
        return None, "Photo must be at most 5 MB.", 413

    # Cheap dimension check before full decode
    try:
        from PIL import Image
        with Image.open(BytesIO(content)) as pimg:
            w, h = pimg.size
            if w > 8000 or h > 8000 or (w * h) > 25_000_000:
                return None, "Photo resolution is too large (maximum 8000x8000 and 25 megapixels).", 400
    except Exception as e:
        if "DecompressionBomb" in type(e).__name__:
            return None, "Photo resolution is too large (maximum 8000x8000 and 25 megapixels).", 400
        return None, "File is not a valid image.", 400

    nparr = np.frombuffer(content, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return None, "File is not a valid image.", 400

    ext = None
    if content.startswith(b'\xff\xd8\xff'):
        ext = 'jpg'
    elif content.startswith(b'\x89PNG\r\n\x1a\n'):
        ext = 'png'
    elif len(content) >= 12 and content[:4] == b'RIFF' and content[8:12] == b'WEBP':
        ext = 'webp'
    if not ext:
        return None, "Photo must be JPEG, PNG, or WebP.", 400

    from process_video import has_face
    known_faces_dir = patient_path('known_faces')
    os.makedirs(known_faces_dir, exist_ok=True)
    tmp_path = os.path.join(known_faces_dir, f"tmp_{uuid.uuid4().hex}.{ext}")
    try:
        with open(tmp_path, 'wb') as f:
            f.write(content)
        if not has_face(tmp_path):
            return None, "No face found in this photo. Try a clear photo of the face.", 400
        filename = f"{uuid.uuid4().hex}.{ext}"
        dest_path = os.path.join(known_faces_dir, filename)
        os.replace(tmp_path, dest_path)
        if old_photo and old_photo != filename:
            old_path = os.path.join(known_faces_dir, old_photo)
            if os.path.isfile(old_path):
                try:
                    os.remove(old_path)
                except OSError:
                    pass
        return filename, None, 200
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


@api.route('/people', methods=['GET'])
def list_people():
    return jsonify([{**p, "name": _title(p['name'])} for p in _load_people()])


@api.route('/people', methods=['POST'])
def add_person():
    """multipart form: name (required), relation (required), phone (optional), photo (required)."""
    if not _people_edit_allowed():
        return jsonify(error="Only a caregiver or self account can edit people."), 403
    people = _load_people()
    import auth
    if auth.is_demo_session() or (g.get('active_patient') and g.active_patient.get('is_demo')):
        if len(people) >= 12:
            return jsonify(error="Demo accounts can have at most 12 people."), 400

    raw_name = request.form.get('name', '')
    name_clean = raw_name.strip()
    if not name_clean or len(name_clean) > 60:
        return jsonify(error="Name must be between 1 and 60 characters."), 400
    if any(ord(c) < 32 or ord(c) == 127 for c in name_clean):
        return jsonify(error="Name must not contain control characters."), 400
    name = _title(name_clean)

    relation = request.form.get('relation', '').strip()
    rel_key = relation.lower()
    if rel_key.startswith('your '):
        rel_key = rel_key[5:].strip()
    if rel_key in ('grandson', 'granddaughter'):
        rel_key = 'grandchild'
    if rel_key not in RELATION_MAP:
        return jsonify(error="Relation must be one of: " + ", ".join(sorted(VALID_RELATIONS))), 400
    canonical_relation = RELATION_MAP[rel_key]

    phone = request.form.get('phone', '').strip()
    if phone:
        if not (6 <= len(phone) <= 20) or not re.fullmatch(r'^[0-9\s+\-()]+$', phone):
            return jsonify(error="Phone must be between 6 and 20 characters and contain only digits, spaces, +, -, (, )."), 400

    photo_file = request.files.get('photo')
    if not photo_file or photo_file.filename == '':
        return jsonify(error="Photo is required."), 400
    filename, err, status_code = _save_photo(photo_file)
    if err:
        return jsonify(error=err), status_code

    person = {
        "id": uuid.uuid4().hex[:8],
        "name": name,
        "relation": canonical_relation,
        "phone": phone,
        "photo": filename,
    }
    people.append(person)
    _save_people(people)
    return jsonify(person), 201


@api.route('/people/<person_id>', methods=['PUT'])
def update_person(person_id):
    """multipart form; any of name, relation, phone, photo."""
    if not _people_edit_allowed():
        return jsonify(error="Only a caregiver or self account can edit people."), 403
    people = _load_people()
    person = next((p for p in people if p['id'] == person_id), None)
    if not person:
        return jsonify(error="Person not found"), 404

    if 'name' in request.form:
        name_clean = request.form['name'].strip()
        if not name_clean or len(name_clean) > 60:
            return jsonify(error="Name must be between 1 and 60 characters."), 400
        if any(ord(c) < 32 or ord(c) == 127 for c in name_clean):
            return jsonify(error="Name must not contain control characters."), 400
        person['name'] = _title(name_clean)

    if 'relation' in request.form:
        new_rel = request.form['relation'].strip()
        existing_rel = person.get('relation', '').strip()
        if new_rel == existing_rel or (existing_rel and new_rel.lower() == existing_rel.lower()):
            person['relation'] = person.get('relation', new_rel)
        else:
            rel_key = new_rel.lower()
            if rel_key.startswith('your '):
                rel_key = rel_key[5:].strip()
            if rel_key in ('grandson', 'granddaughter'):
                rel_key = 'grandchild'
            if rel_key not in RELATION_MAP:
                return jsonify(error="Relation must be one of: " + ", ".join(sorted(VALID_RELATIONS))), 400
            person['relation'] = RELATION_MAP[rel_key]

    if 'phone' in request.form:
        phone = request.form['phone'].strip()
        if phone:
            if not (6 <= len(phone) <= 20) or not re.fullmatch(r'^[0-9\s+\-()]+$', phone):
                return jsonify(error="Phone must be between 6 and 20 characters and contain only digits, spaces, +, -, (, )."), 400
        person['phone'] = phone

    if request.files.get('photo'):
        filename, err, status_code = _save_photo(request.files['photo'], old_photo=person.get('photo'))
        if err:
            return jsonify(error=err), status_code
        person['photo'] = filename

    _save_people(people)
    return jsonify(person), 200


@api.route('/people/<person_id>', methods=['DELETE'])
def delete_person(person_id):
    if not _people_edit_allowed():
        return jsonify(error="Only a caregiver or self account can edit people."), 403
    people = _load_people()
    person = next((p for p in people if p['id'] == person_id), None)
    if not person:
        return jsonify(error="Person not found"), 404
    if person.get('photo'):
        photo_path = os.path.join(patient_path('known_faces'), person['photo'])
        if os.path.isfile(photo_path):
            try:
                os.remove(photo_path)
            except OSError:
                pass
    _save_people([p for p in people if p['id'] != person_id])
    return jsonify(success=True), 200


@api.route('/known-faces', methods=['GET'])
def list_known_faces():
    """People with a photo, in the shape the quiz expects."""
    faces = [{"path": p['photo'], "name": _title(p['name']), "relation": p.get('relation', '')}
             for p in _load_people() if p.get('photo')]
    return jsonify({"faces": faces}), 200


@api.route('/known-faces/<filename>', methods=['GET'])
def serve_face_image(filename):
    """Serve a known face image scoped to active patient."""
    try:
        if not g.get('active_patient'):
            return jsonify(error="No active patient"), 404
        if not filename or '/' in filename or '\\' in filename or '..' in filename:
            return jsonify(error="Invalid filename"), 404
        people = _load_people()
        if not any(p.get('photo') == filename for p in people):
            return jsonify(error="Photo not found"), 404
        folder = patient_path('known_faces')
        if not os.path.isfile(os.path.join(folder, filename)):
            return jsonify(error="Photo not found"), 404
        return send_from_directory(folder, filename)
    except Exception:
        return jsonify(error="Photo not found"), 404


def _run_rescan_worker(patient_id, base_dir, chunk_folders):
    with _rescan_reset_lock:
        try:
            from process_video import perform_face_recognition
            total = len(chunk_folders)
            for idx, folder in enumerate(chunk_folders):
                perform_face_recognition(folder, base_dir)
                for faces_file in glob.glob(os.path.join(folder, "*_faces.json")):
                    copy_folder = os.path.join(base_dir, "content", os.path.basename(folder))
                    if os.path.isdir(copy_folder):
                        shutil.copy(faces_file, copy_folder)
                scanned = idx + 1
                progress = int((scanned / total) * 100)
                with _rescan_status_lock:
                    _patient_rescan_status[patient_id] = {
                        "status": "running",
                        "progress": progress,
                        "message": f"Scanning video {scanned} of {total}...",
                        "scanned_videos": scanned,
                        "total_videos": total,
                    }
            with _rescan_status_lock:
                _patient_rescan_status[patient_id] = {
                    "status": "completed",
                    "progress": 100,
                    "message": "Face scan completed.",
                    "scanned_videos": total,
                    "total_videos": total,
                }
        except Exception as e:
            # Addition 3: log failures in Flask console without paths
            print(f"Rescan error: {e.__class__.__name__}")
            with _rescan_status_lock:
                _patient_rescan_status[patient_id] = {
                    "status": "failed",
                    "progress": 0,
                    "message": "Face scan failed. Please try again.",
                    "scanned_videos": 0,
                    "total_videos": len(chunk_folders),
                }


@api.route('/people/rescan', methods=['POST'])
def rescan_people():
    if not _people_edit_allowed():
        return jsonify(error="Only a caregiver or self account can rescan people."), 403
    patient_id = g.active_patient['id']
    now_ts = time.time()

    with _rescan_status_lock:
        history = [ts for ts in _patient_rescan_timestamps.get(patient_id, []) if now_ts - ts < 3600]
        if len(history) >= 3:
            return jsonify(error="Rescan rate limit reached (maximum 3 per hour). Please try again later."), 429

        current = _patient_rescan_status.get(patient_id, {})
        if current.get('status') == 'running':
            return jsonify(error="A rescan job is already in progress for this patient."), 409

        chunks_root = patient_path('video_chunks')
        chunk_folders = sorted(f for f in glob.glob(os.path.join(chunks_root, "*_chunks")) if os.path.isdir(f))
        if not chunk_folders:
            _patient_rescan_status[patient_id] = {
                "status": "completed",
                "progress": 100,
                "message": "No videos to scan yet",
                "scanned_videos": 0,
                "total_videos": 0,
            }
            return jsonify(status="completed", message="No videos to scan yet", progress=100), 200

        history.append(now_ts)
        _patient_rescan_timestamps[patient_id] = history

        _patient_rescan_status[patient_id] = {
            "status": "running",
            "progress": 0,
            "message": f"Scanning video 1 of {len(chunk_folders)}...",
            "scanned_videos": 0,
            "total_videos": len(chunk_folders),
        }

    base_dir = patient_path('')
    thread = threading.Thread(
        target=_run_rescan_worker,
        args=(patient_id, base_dir, chunk_folders),
        daemon=True,
    )
    thread.start()
    return jsonify(status="running", message="Rescan started", progress=0), 200


@api.route('/people/rescan/status', methods=['GET'])
def rescan_status():
    if not _people_edit_allowed():
        return jsonify(error="Only a caregiver or self account can view rescan status."), 403
    patient_id = g.active_patient['id']
    with _rescan_status_lock:
        status_info = _patient_rescan_status.get(patient_id, {
            "status": "idle",
            "progress": 0,
            "message": "No scan in progress",
            "scanned_videos": 0,
            "total_videos": 0,
        })
        return jsonify(status_info), 200


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
                                dn = display_name(n, people)
                                if dn and dn not in detected:
                                    detected.append(dn)
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
        
        # Collect data from video chunks via memories.json
        video_data = []
        memories = _memory_data()
        for memory_id, row in memories.items():
            if not isinstance(row, dict):
                continue
            fn = row.get('filename')
            if not fn:
                continue
            folder_name = _chunks_folder(fn)
            folder_path = os.path.join(video_chunks_root, folder_name)
            if not os.path.isdir(folder_path):
                continue

            journal_entry = row.get('note') or (journals.get(fn, {}).get('entry') if isinstance(journals.get(fn), dict) else None)
            video_date = row.get('date') or (journals.get(fn, {}).get('date') if isinstance(journals.get(fn), dict) else None)

            # Filter by date if provided
            if target_date and video_date:
                from datetime import datetime
                try:
                    target = datetime.fromisoformat(str(target_date).replace('Z', '+00:00')).date()
                    video = datetime.fromisoformat(str(video_date).replace('Z', '+00:00')).date()
                    if target != video:
                        continue  # Skip videos that don't match the date
                except Exception:
                    pass
            
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
                        faces = [dn for n in names if (dn := display_name(n, people, relation=True))]
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
        
        api_key = os.getenv('OPENAI_API_KEY', 'not_configured')
        ai_client = client if AI_AVAILABLE else None
        if not api_key or api_key == 'not_configured' or ai_client is None:
            # Fallback to template questions if no API key or client
            return jsonify({
                "questions": [
                    {
                        "question": "What activity did you do in this video?",
                        "answer": "Please describe the activity shown",
                        "video": video_data[0]['video_path'] if video_data else "",
                        "fallback": True
                    },
                    {
                        "question": "Who was with you in this memory?",
                        "answer": ", ".join(video_data[0]['faces']) if video_data and video_data[0]['faces'] else "Unknown",
                        "video": video_data[0]['video_path'] if video_data else "",
                        "fallback": True
                    }
                ]
            }), 200
        
        try:
            response = ai_client.chat.completions.create(
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
            return jsonify({
                "questions": [
                    {
                        "question": "What activity did you do in this video?",
                        "answer": "Please describe the activity shown",
                        "video": video_data[0]['video_path'] if video_data else "",
                        "fallback": True
                    },
                    {
                        "question": "Who was with you in this memory?",
                        "answer": ", ".join(video_data[0]['faces']) if video_data and video_data[0]['faces'] else "Unknown",
                        "video": video_data[0]['video_path'] if video_data else "",
                        "fallback": True
                    }
                ]
            }), 200
        
    except Exception as e:
        print(f"Generate questions error: {e}")
        return jsonify({"error": str(e)}), 500



WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
ENGLISH_STOPWORDS = {
    'a', 'about', 'am', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'been',
    'before', 'being', 'between', 'both', 'but', 'by', 'can', 'could', 'did',
    'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
    'further', 'go', 'goes', 'going', 'gone', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers',
    'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is',
    'it', 'its', 'itself', 'just', 'me', 'meet', 'meeting', 'meets', 'memory', 'memories', 'met', 'more', 'most',
    'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once',
    'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
    'same', 'she', 'should', 'so', 'some', 'such', 'tell', 'than', 'that',
    'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these',
    'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up',
    'very', 'video', 'videos', 'was', 'we', 'went', 'were', 'what', 'when', 'where',
    'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would', 'you',
    'your', 'yours', 'yourself', 'yourselves',
}

def _format_day_full(day):
    return f"{WEEKDAYS[day.weekday()]} {day.day} {MONTHS[day.month - 1]}"

def _friendly_memory_date(value):
    try:
        day = datetime.fromisoformat(str(value)[:10]).date()
    except (TypeError, ValueError):
        return {'date': str(value) if value else '', 'dateLabel': '', 'label': ''}
    today = datetime.now().date()
    full_str = _format_day_full(day)
    if day == today:
        dl = 'today'
    elif (today - day).days == 1:
        dl = 'yesterday'
    else:
        dl = full_str
    return {'date': day.isoformat(), 'dateLabel': dl, 'label': dl}

def _about_sentence1(c, today):
    date_phrase = "In this memory"
    if c.get('date'):
        try:
            day = datetime.fromisoformat(str(c['date'])[:10]).date()
            full_date = _format_day_full(day)
            if day == today:
                date_phrase = f"On {full_date} (today)"
            elif (today - day).days == 1:
                date_phrase = f"On {full_date} (yesterday)"
            else:
                date_phrase = f"On {full_date}"
        except Exception:
            pass
    note = (c.get('note') or '').strip().rstrip('.')
    title = (c.get('title') or '').strip()
    if note:
        low_note = note.lower()
        if low_note.startswith('a day at '):
            activity = 'you were at ' + note[9:]
        elif low_note.startswith('day at '):
            activity = 'you were at ' + note[7:]
        elif low_note.startswith('you were ') or low_note.startswith('you visited ') or low_note.startswith('you '):
            activity = note
        elif low_note.startswith('at '):
            activity = 'you were ' + note
        elif low_note.startswith('looking at ') or low_note.startswith('visiting '):
            activity = 'you were ' + note
        else:
            activity = f"you were at {title}, {note}" if title and title.lower() not in low_note else note
        s1 = f"{date_phrase} {activity}."
    elif title:
        s1 = f"{date_phrase} you were at {title}."
    else:
        s1 = f"{date_phrase} you recorded this video."
    return s1

def _build_about_summary(c):
    today = datetime.now().date()
    s1 = _about_sentence1(c, today)
    people = c.get('people') or []
    s2 = None
    if people:
        if len(people) == 1:
            s2 = f"{people[0]} is in this video."
        else:
            s2 = f"{', '.join(people[:-1])} and {people[-1]} are in this video."
    s3 = None
    transcript = c.get('transcript') or []
    if transcript:
        full_tr = ' '.join(str(t).strip() for t in transcript if str(t).strip())
        parts = [p.strip() for p in re.split(r'(?<=[.!?])\s+', full_tr) if len(p.strip()) > 3]
        if parts:
            first_sent = parts[0].strip().strip('"\'').rstrip('.!?')
            if len(first_sent) > 120:
                major = [cl.strip() for cl in re.split(r'\s*,\s*(?:and|but)\s+|\s*;\s*', first_sent) if cl.strip()]
                if major and 10 <= len(major[0]) <= 120:
                    first_sent = major[0].rstrip(' ,;:')
                else:
                    sub = first_sent[:120]
                    delims = list(re.finditer(r'(?:,\s*(?:and\s+)?|\s+and\s+|;\s*|:\s*)', sub))
                    matched_clause = None
                    for m in reversed(delims):
                        cand = sub[:m.start()].rstrip(' ,;:')
                        w = cand.split()
                        if len(w) >= 3 and w[-1].lower() not in ('really', 'very', 'so', 'and', 'the', 'a', 'an', 'that'):
                            matched_clause = cand
                            break
                    if matched_clause:
                        first_sent = matched_clause
                    else:
                        first_sent = sub.rsplit(' ', 1)[0].rstrip(' ,;:')
            s3 = f"In the video you say: '{first_sent}'."
    return ' '.join(s for s in [s1, s2, s3] if s)

def _ask_context(memory_id=None):
    memories = _memory_data()
    selected = list(memories.items()) if not memory_id else ([(memory_id, memories[memory_id])] if memory_id in memories else None)
    if selected is None:
        return None
    try:
        with open(JOURNALS_PATH, encoding='utf-8') as f:
            journals = json.load(f)
    except Exception:
        journals = {}
    people = _load_people()
    out = []
    chunks_root = os.path.abspath(VIDEO_CHUNKS_ROOT)
    for mid, row in selected:
        fn = row.get('filename', '')
        j = journals.get(fn, {}) if isinstance(journals, dict) else {}
        tr = []
        stem = os.path.splitext(fn)[0]
        folder = os.path.join(chunks_root, stem + '_chunks')
        if not os.path.isdir(folder):
            cand = os.path.join(chunks_root, stem.replace(' ', '_') + '_chunks')
            if os.path.isdir(cand):
                folder = cand
            else:
                cand = os.path.join(chunks_root, stem.replace('_', ' ') + '_chunks')
                if os.path.isdir(cand):
                    folder = cand
        try:
            with open(os.path.join(folder, 'full_transcript.json'), encoding='utf-8') as f:
                raw = json.load(f)
                tr = [str(v) for v in raw.values()] if isinstance(raw, dict) else [str(v) for v in raw]
        except Exception:
            pass
        names = []
        for face_file in os.listdir(folder) if os.path.isdir(folder) else []:
            if face_file.endswith('_faces.json'):
                try:
                    with open(os.path.join(folder, face_file), encoding='utf-8') as f:
                        face = json.load(f)
                    ids = {n for values in face.values() for n in values} if isinstance(face, dict) else set()
                    names.extend(dn for n in ids if (dn := display_name(n, people)))
                except Exception:
                    pass
        out.append({
            'id': mid,
            'title': row.get('title') or j.get('title') or os.path.splitext(fn)[0],
            'note': row.get('note') or j.get('entry') or '',
            'date': row.get('date') or j.get('date'),
            'transcript': tr,
            'people': list(dict.fromkeys(names)),
        })
    return out

def _normalize_question(q):
    low = q.lower()
    # Collapse repeated punctuation
    low = re.sub(r'([?!.,;:])\1+', r'\1', low)
    # Collapse mixed punctuation like ?! or !? to ?
    low = re.sub(r'(\?|\!)+', r'?', low)
    # Strip trailing punctuation and whitespace
    low = low.strip('?!.,;: \t\r\n')
    # Collapse whitespace
    low = re.sub(r'\s+', ' ', low)
    # Map pronouns: we/us/me -> i, our/ours/mine -> my
    pronoun_map = {
        'we': 'i',
        'us': 'i',
        'me': 'i',
        'our': 'my',
        'ours': 'my',
        'mine': 'my',
    }
    def _rep(m):
        return pronoun_map.get(m.group(0), m.group(0))
    norm = re.sub(r'\b(we|us|me|our|ours|mine)\b', _rep, low)
    return norm

def _build_place_sentence(c):
    note = (c.get('note') or '').strip().rstrip('.')
    title = (c.get('title') or '').strip()
    activity = None
    if note:
        low = note.lower()
        if low.startswith('a day at '):
            activity = 'you were at ' + note[9:].strip()
        elif low.startswith('day at '):
            activity = 'you were at ' + note[7:].strip()
        elif low.startswith('a visit to '):
            activity = 'you were visiting ' + note[11:].strip()
        elif low.startswith('visit to '):
            activity = 'you were visiting ' + note[9:].strip()
        elif low.startswith(('you were ', 'you visited ', 'you went to ', 'you ')):
            activity = note
        elif low.startswith(('at ', 'looking at ', 'visiting ')):
            activity = 'you were ' + note
        elif low.startswith(('lunch ', 'dinner ', 'breakfast ', 'tea ', 'coffee ', 'picnic ')):
            activity = 'you were having ' + note[0].lower() + note[1:]
        elif low.startswith(('having lunch ', 'having dinner ', 'having breakfast ', 'having tea ', 'having a picnic ')):
            activity = 'you were ' + note[0].lower() + note[1:]
        elif low.startswith(('walk in ', 'walk at ', 'walk around ', 'walk through ', 'walk by ')):
            activity = 'you were on a ' + note[0].lower() + note[1:]
        elif low.startswith(('a walk in ', 'a walk at ', 'a walk around ', 'a walk through ')):
            activity = 'you were on ' + note[0].lower() + note[1:]
        elif low.startswith(('trip to ', 'a trip to ')):
            activity = 'you were on a ' + (note[8:].strip() if low.startswith('a trip to ') else note[5:].strip())
        elif low.startswith(('in ', 'on ')):
            activity = 'you were ' + note
        elif ' at ' in low or ' in ' in low:
            activity = 'you were ' + note[0].lower() + note[1:]
        elif title and title.lower() not in low:
            activity = f"you were at {title}, {note[0].lower() + note[1:]}"
        else:
            activity = f"you were at {note}"
    elif title:
        low_title = title.lower()
        if low_title.startswith('me at '):
            place = title[3:].strip()
            activity = f"you were {place}"
        elif low_title.startswith(('at ', 'in ', 'on ')):
            activity = f"you were {title}"
        elif low_title.startswith(('a ', 'an ', 'the ')):
            activity = f"you were at {title}"
        elif low_title.endswith(('party', 'celebration', 'wedding', 'event', 'concert', 'gathering', 'festival')):
            activity = f"you were at the {low_title}"
        else:
            activity = f"you were at {title}"

    if activity:
        act = activity.strip().rstrip('.!?,;')
        return act[0].upper() + act[1:] + '.'
    return None

def _unanswered_response(scope, c, lang, is_picture=False):
    if is_picture and not AI_AVAILABLE:
        ans_text = "I can't look at the pictures right now."
    elif scope == 'memory' and c:
        ans_text = "I couldn't find that in this memory."
    else:
        ans_text = "I couldn't find that in your memories."

    res = {
        'answer': ans_text,
        'language': lang,
        'sources': [],
        'grounded': False,
    }
    if scope == 'memory' and c:
        res['summary'] = _build_about_summary(c)
    return jsonify(**res), 200

PICTURE_TRIGGERS = {'wearing', 'wear', 'colour', 'color', 'jacket', 'shirt', 'hair', 'holding', 'doing'}

@api.route('/memories/ask', methods=['POST'])
def ask_memory():
    payload = request.get_json(silent=True) or {}
    q = payload.get('question')
    if not isinstance(q, str) or not q.strip() or len(q) > 300:
        return jsonify(error='Question must be up to 300 characters.'), 400
    q = re.sub(r'[\x00-\x1f\x7f]', ' ', q).strip()

    scope = payload.get('scope')
    memory_id = payload.get('memory_id')

    if scope == 'memory' or (memory_id and scope != 'all'):
        if not memory_id or not isinstance(memory_id, str):
            return jsonify(error='memory_id is required for scope "memory"'), 400
        scope = 'memory'
        contexts = _ask_context(memory_id)
        if contexts is None:
            return jsonify(error='Memory not found'), 404
    else:
        scope = 'all'
        contexts = _ask_context(None)
        if contexts is None:
            return jsonify(error='Memory not found'), 404

    import auth
    session = g.get('auth_session')
    if session and not auth.limits().hit(('memory-ask', session['id']), 60, 3600):
        return jsonify(error='Please try again in a moment.'), 429
    try:
        lang = _load_settings().get('language', 'en')
    except Exception:
        lang = 'en'
    if lang not in ('en', 'hi', 'as'):
        lang = 'en'

    norm = _normalize_question(q)
    low = norm
    words = set(re.findall(r'[a-z0-9]+', norm))
    content_words = {w for w in words if w not in ENGLISH_STOPWORDS and len(w) > 1}

    is_when = bool(words & {'when', 'date', 'day'})
    is_who = bool(words & {'who', 'whom'}) or ('who was with' in norm)

    is_where = bool(re.search(r'\bwhere\s+(?:did|do|were|was|are|is|am)(?:\s+(?:i|we|us|this|that|you|it))?\b', norm)) or \
               bool(re.search(r'\b(?:what|which)\s+(?:place|location)\b', norm)) or \
               any(p in norm for p in ('what place', 'which place', 'what location', 'where did i go', 'where was i', 'where am i', 'where are i', 'where were i'))

    about_phrases = (
        'tell me about', 'tell us about', 'tell i about', 'describe', 'what happened',
        'what is this', 'what was i doing', 'who did i meet',
        'summarise', 'summarize', 'remember', 'about this video',
        'about the video', 'about this memory', 'about the memory',
    )
    is_about = (any(p in norm for p in about_phrases) or bool(words & {'describe', 'summarise', 'summarize', 'remember'})) and not is_where

    if not is_when and not is_who and not is_where:
        if any(c.get('title') and len(c['title']) >= 3 and c['title'].lower() in norm for c in contexts):
            is_about = True

    is_what = bool(words & {'where', 'what', 'which', 'animal', 'see', 'saw'}) and not is_about and not is_where

    if scope == 'all':
        scored = []
        for c in contexts:
            sc = 0
            title_l = c['title'].lower()
            note_l = c['note'].lower()
            trans_l = ' '.join(c['transcript']).lower()
            if title_l in norm:
                sc += 50
            for t in words:
                if len(t) > 1:
                    if t in title_l: sc += 5
                    elif t in note_l: sc += 2
                    elif t in trans_l: sc += 1
            scored.append((sc, c))
        scored.sort(key=lambda x: x[0], reverse=True)
        matched = [c for sc, c in scored if sc > 0]
        if matched:
            contexts = matched

    c = contexts[0] if contexts else None
    ans = None

    if c and is_where:
        place_ans = _build_place_sentence(c)
        ans = place_ans if place_ans else _build_about_summary(c)
    elif c and is_about:
        ans = _build_about_summary(c)
    elif c and is_when:
        try:
            day = datetime.fromisoformat(str(c['date'])[:10]).date()
            full_date = _format_day_full(day)
            today = datetime.now().date()
            diff = (today - day).days
            if diff == 0:
                when_str = f"today, {full_date}"
            elif diff == 1:
                when_str = f"yesterday, {full_date}"
            else:
                when_str = f"on {full_date}"
        except Exception:
            when_str = f"on {c.get('date', '')}"

        if scope == 'all':
            title_part = f"'{c['title']}'" if c.get('title') else "That"
            ans = f"{title_part} was {when_str}."
        else:
            ans = f"That was {when_str}."
    elif c and is_who:
        if c.get('people'):
            if len(c['people']) == 1:
                ans = f"{c['people'][0]} was in this video."
            else:
                ans = f"{', '.join(c['people'][:-1])} and {c['people'][-1]} were in this video."
        else:
            ans = None
    elif c and is_what:
        animal_words = {'animal', 'animals', 'behind', 'creature', 'creatures', 'elephant', 'elephants', 'lion', 'lions', 'tiger', 'tigers', 'bear', 'bears', 'monkey', 'monkeys', 'dog', 'dogs', 'cat', 'cats', 'bird', 'birds'}
        is_animal_q = bool(words & animal_words)
        if is_animal_q:
            trans_items = c.get('transcript') or []
            trans_sentences = []
            for item in trans_items:
                trans_sentences.extend(x.strip() for x in re.split(r'(?<=[.!?])\s+', str(item)) if x.strip())
            animal_pat = r'\b(elephant|elephants|animal|animals|creature|creatures|lion|lions|dog|dogs|cat|cats|bird|birds|monkey|monkeys|bear|bears|tiger|tigers)\b'
            trans_match = [s for s in trans_sentences if re.search(animal_pat, s, re.I)]
            if trans_match:
                cand = trans_match[0]
                m_loc = re.search(r'(in front of|looking at|near|behind|beside)\s+(the\s+)?[a-z]+', cand, re.I)
                if m_loc:
                    ans = f"You were {m_loc.group(0).lower()}."
                else:
                    clauses = re.split(r',\s*and\s+', cand)
                    target_cl = next((cl.strip() for cl in clauses if re.search(animal_pat, cl, re.I)), cand)
                    target_cl = re.sub(r'^(alright,?\s*so\s*|so\s*|well,?\s*)', '', target_cl, flags=re.I)
                    target_cl = re.sub(r'^(here\s+)?we\s+are\s+', 'You were ', target_cl, flags=re.I)
                    target_cl = re.sub(r'^i\s+am\s+', 'You were ', target_cl, flags=re.I)
                    target_cl = target_cl.rstrip('.!?,;') + '.'
                    ans = target_cl[0].upper() + target_cl[1:]
            elif c.get('note') and re.search(animal_pat, c['note'], re.I):
                m_note = re.search(r'(looking at|visiting|near|with)\s+(the\s+)?[a-z]+', c['note'], re.I)
                if m_note:
                    ans = f"You were {m_note.group(0).lower()}."
                else:
                    m_word = re.search(animal_pat, c['note'], re.I)
                    ans = f"You were seeing the {m_word.group(0).lower()}."
        if not ans:
            raw_items = ([c['note']] if c.get('note') else []) + (c.get('transcript') or [])
            candidates = []
            for item in raw_items:
                candidates.extend(x.strip() for x in re.split(r'(?<=[.!?])\s+', str(item)) if x.strip())
            best_cand = None
            best_count = 0
            if content_words:
                for cand in candidates:
                    cand_words = set(re.findall(r'[a-z0-9]+', cand.lower()))
                    cnt = len(content_words & cand_words)
                    if cnt > best_count:
                        best_count = cnt
                        best_cand = cand
            if best_count > 0:
                ans = best_cand

    if ans:
        sources = [{
            'memory_id': item['id'],
            'title': item['title'],
            'dateLabel': _friendly_memory_date(item['date'])['dateLabel'],
            'date': _friendly_memory_date(item['date'])['date'],
        } for item in contexts[:3]]
        return jsonify(answer=ans, language=lang, sources=sources, grounded=True), 200

    is_picture_q = not (is_about or is_when or is_who or is_where) and (
        bool(words & PICTURE_TRIGGERS) or 'how many' in norm or 'look like' in norm or 'looks like' in norm
    )
    return _unanswered_response(scope, c, lang, is_picture=is_picture_q)

@api.route('/health', methods=['GET'])
def health():
    return jsonify(status='ok', commit=GIT_COMMIT_HASH), 200

from auth import init_auth

configure(api)
init_auth(api, lambda: _load_settings())
_cleanup_stale_processing_jobs()
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
