from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import json
from openai import OpenAI
import os
from dotenv import load_dotenv
import base64
import cv2
from werkzeug.utils import secure_filename
import threading
from cognitive_reports import (
    GAME_REGISTRY,
    build_session_report,
    get_session_records,
    load_store,
    save_record as save_cognitive_record,
    validate_session_id,
)

# Load environment variables from .env file
load_dotenv()

api = Flask(__name__)
CORS(api)

# Configuration for file uploads
UPLOAD_FOLDER = 'content'
KNOWN_FACES_FOLDER = 'known_faces'
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm'}
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png'}
api.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
api.config['KNOWN_FACES_FOLDER'] = KNOWN_FACES_FOLDER
api.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max file size

# Ensure upload directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(KNOWN_FACES_FOLDER, exist_ok=True)

# Track processing status
processing_status = {}  

client = OpenAI(
    api_key=os.getenv('OPENAI_API_KEY', 'not_configured')
)

QAS_PATH = "qas.json"  


VIDEO_CHUNKS_ROOT = "video_chunks"  
SUMMARY_ROOT = "summary"


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
                                    video_path.replace(f"/{VIDEO_CHUNKS_ROOT}/", "").replace("/", os.sep))
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
    """Return generated quiz questions, or an empty list when none exist."""
    try:
        if not os.path.exists(QAS_PATH):
            return jsonify({"questions": []}), 200
        with open(QAS_PATH, "r", encoding="utf-8") as source:
            questions_data = json.load(source)
        return jsonify({"questions": questions_data}), 200
    except Exception as e:
        print(f"Error reading questions file: {e}")
        return jsonify({"questions": [], "error": str(e)}), 500


@api.route('/accuracy')
def accuracy():
    given = request.args.get('given')
    real = request.args.get('real')
    video_path = request.args.get('video')
    journal = None

    if video_path:
        try:
            video_name = video_path.split('/')[-2].replace('_chunks', '')
            journal_file = 'video_journals.json'
            if os.path.exists(journal_file):
                with open(journal_file, 'r', encoding='utf-8') as source:
                    journals = json.load(source)
                for journal_name, journal_data in journals.items():
                    if video_name in journal_name or journal_name in video_name:
                        journal = journal_data.get('entry')
                        break
        except Exception as e:
            print(f"Could not load journal context: {e}")

    score = gpt_accuracy(given, real, journal)
    try:
        score = int(score)
    except (TypeError, ValueError):
        score = 5
    return jsonify(score)


def gpt_accuracy(answer1, answer2, journal_context=None):
    if not client.api_key or client.api_key == 'not_configured':
        import random
        return str(random.randint(6, 10))
    try:
        prompt = (
            "Determine the accuracy of the given answer compared to the real answer. "
            "Use a scale of 1 to 10, allow different phrasing, and reward the correct main idea and key details."
        )
        if journal_context:
            prompt += f"\n\nAdditional context from journal entry: {journal_context}"
        prompt += f"\n\nGiven answer: {answer1}\nTrue answer: {answer2}\nOnly return the number (1-10)."
        response = client.chat.completions.create(
            model='gpt-4o-mini',
            messages=[
                {"role": "system", "content": "You evaluate memory quiz answers by meaning and key details, not exact wording."},
                {"role": "user", "content": prompt},
            ],
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Accuracy evaluation failed: {e}")
        return "5"


@api.route('/search')
def search():
    query = request.args.get('query', '').strip()
    ref = {}
    face_data = {}
    chunks_root_abs = os.path.abspath(VIDEO_CHUNKS_ROOT)
    if not os.path.exists(chunks_root_abs):
        return jsonify([]), 200

    try:
        for folder_name in os.listdir(chunks_root_abs):
            folder_path = os.path.join(chunks_root_abs, folder_name)
            if not os.path.isdir(folder_path):
                continue

            transcript_path = os.path.join(folder_path, 'full_transcript.json')
            if os.path.exists(transcript_path):
                try:
                    with open(transcript_path, 'r', encoding='utf-8') as source:
                        transcripts = json.load(source)
                    if isinstance(transcripts, dict):
                        for chunk_name, transcript_text in transcripts.items():
                            video_path = f"/{VIDEO_CHUNKS_ROOT}/{folder_name}/{chunk_name}.mp4"
                            ref[video_path] = str(transcript_text)
                except Exception as e:
                    print(f"Error reading transcript {transcript_path}: {e}")

            for filename in os.listdir(folder_path):
                if not filename.endswith('_faces.json'):
                    continue
                face_json_path = os.path.join(folder_path, filename)
                try:
                    with open(face_json_path, 'r', encoding='utf-8') as source:
                        face_info = json.load(source)
                    chunk_name = filename.replace('_faces.json', '')
                    video_path = f"/{VIDEO_CHUNKS_ROOT}/{folder_name}/{chunk_name}.mp4"
                    if isinstance(face_info, dict):
                        for names in face_info.values():
                            if isinstance(names, list) and names:
                                face_data[video_path] = names
                                break
                except Exception as e:
                    print(f"Error reading face data {face_json_path}: {e}")

        if not ref and not face_data:
            all_videos = []
            for folder_name in os.listdir(chunks_root_abs):
                folder_path = os.path.join(chunks_root_abs, folder_name)
                if os.path.isdir(folder_path):
                    all_videos.extend(
                        f"/{VIDEO_CHUNKS_ROOT}/{folder_name}/{filename}"
                        for filename in os.listdir(folder_path)
                        if filename.endswith('.mp4')
                    )
            return jsonify(all_videos), 200

        api_key = os.getenv('OPENAI_API_KEY', 'not_configured')
        if api_key not in ('', 'not_configured', 'your_openai_api_key_here', 'your_api_key_here'):
            try:
                combined_context = {}
                for video_path in set(ref) | set(face_data):
                    context_parts = []
                    if video_path in ref:
                        context_parts.append(f"Transcript: {ref[video_path]}")
                    if video_path in face_data:
                        context_parts.append(f"People visible: {', '.join(face_data[video_path])}")
                    combined_context[video_path] = "; ".join(context_parts)
                response = client.chat.completions.create(
                    model='gpt-4o-mini',
                    messages=[
                        {"role": "system", "content": "Find videos matching the user's query from metadata. Return only a JSON array of video paths, or []."},
                        {"role": "user", "content": f"Query: {query}\n\nAvailable videos: {json.dumps(combined_context)}"},
                    ],
                )
                result = response.choices[0].message.content.strip()
                if result.startswith('['):
                    matched_videos = json.loads(result)
                    if isinstance(matched_videos, list) and matched_videos:
                        return jsonify(matched_videos), 200
            except Exception as e:
                print(f"GPT search failed; using local matching: {e}")

        query_lower = query.lower()
        matched_videos = [video_path for video_path, transcript in ref.items() if query_lower and query_lower in transcript.lower()]
        if any(word in query_lower for word in ('who', 'person', 'people', 'face', 'he', 'she', 'they')):
            matched_videos.extend(video_path for video_path, names in face_data.items() if names)
        for video_path, names in face_data.items():
            if any(name.lower() in query_lower for name in names):
                matched_videos.append(video_path)
        matched_videos = list(dict.fromkeys(matched_videos))

        visual_keywords = ('where', 'location', 'place', 'setting', 'which', 'what', 'zoo', 'building', 'background', 'scene', 'happening', 'doing', 'wearing', 'see', 'visible', 'show', 'looks', 'appears', 'behind')
        needs_vision = any(keyword in query_lower for keyword in visual_keywords)
        if not matched_videos:
            matched_videos = list(dict.fromkeys([*ref.keys(), *face_data.keys()]))

        if needs_vision and matched_videos:
            vision_answer = analyze_video_with_vision(matched_videos, query)
            if vision_answer:
                return jsonify([
                    {"path": video_path, "vision_answer": vision_answer,
                     **({"people": face_data[video_path]} if face_data.get(video_path) else {}),
                     **({"transcript": ref[video_path]} if video_path in ref else {})}
                    for video_path in matched_videos
                ]), 200

        return jsonify([
            {"path": video_path,
             **({"people": face_data[video_path]} if face_data.get(video_path) else {}),
             **({"transcript": ref[video_path]} if video_path in ref else {})}
            for video_path in matched_videos
        ]), 200
    except Exception as e:
        print(f"Error in search: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/upload', methods=['POST'])
def upload_video():
    """Handle video file uploads and trigger processing."""
    try:
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
        
        # Save journal entry and date if provided
        if journal_entry or video_date:
            journal_file = 'video_journals.json'
            if os.path.exists(journal_file):
                with open(journal_file, 'r') as f:
                    journals = json.load(f)
            else:
                journals = {}
            
            from datetime import datetime
            journals[filename] = {
                "entry": journal_entry,
                "timestamp": datetime.now().isoformat(),
                "video_path": filepath,
                "date": video_date
            }
            
            with open(journal_file, 'w') as f:
                json.dump(journals, f, indent=2)
        
        # Initialize processing status
        processing_status[filename] = {
            "status": "processing",
            "message": "Video processing started",
            "progress": 0
        }
        
        # Start video processing in background thread
        def process_video_background():
            try:
                from process_video import process_uploaded_video
                processing_status[filename]["message"] = "Processing video..."
                processing_status[filename]["progress"] = 25
                
                result = process_uploaded_video(filepath)
                
                if result["success"]:
                    processing_status[filename]["status"] = "completed"
                    processing_status[filename]["message"] = "Video processed successfully"
                    processing_status[filename]["progress"] = 100
                else:
                    processing_status[filename]["status"] = "failed"
                    processing_status[filename]["message"] = f"Processing failed: {result.get('error', 'Unknown error')}"
                    processing_status[filename]["progress"] = 0
            except Exception as e:
                processing_status[filename]["status"] = "failed"
                processing_status[filename]["message"] = f"Processing error: {str(e)}"
                processing_status[filename]["progress"] = 0
        
        # Start processing in background
        thread = threading.Thread(target=process_video_background)
        thread.daemon = True
        thread.start()
        
        return jsonify({
            "success": True,
            "message": "Video uploaded successfully and processing started",
            "filename": filename,
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
    if filename in processing_status:
        return jsonify(processing_status[filename]), 200
    else:
        return jsonify({"status": "unknown", "message": "No processing information found"}), 404


@api.route('/videos', methods=['GET'])
def list_videos():
    """List all uploaded videos with their journal entries."""
    try:
        videos = []
        journal_file = 'video_journals.json'
        journals = {}
        
        # Load journal entries
        if os.path.exists(journal_file):
            with open(journal_file, 'r') as f:
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


@api.route('/journals', methods=['GET'])
def get_journals():
    """Get all journal entries."""
    try:
        journal_file = 'video_journals.json'
        if os.path.exists(journal_file):
            with open(journal_file, 'r') as f:
                journals = json.load(f)
            return jsonify(journals), 200
        else:
            return jsonify({}), 200
    except Exception as e:
        print(f"Get journals error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/upload-face', methods=['POST'])
def upload_face():
    """Handle face photo uploads for recognition."""
    try:
        # Check if file is in request
        if 'face' not in request.files:
            return jsonify({"error": "No image file provided"}), 400
        
        file = request.files['face']
        person_name = request.form.get('name', '').strip()
        
        # Check if name is provided
        if not person_name:
            return jsonify({"error": "Person's name is required"}), 400
        
        # Check if file is selected
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Validate file type
        if not allowed_image_file(file.filename):
            return jsonify({"error": f"Invalid file type. Allowed types: {', '.join(ALLOWED_IMAGE_EXTENSIONS)}"}), 400
        
        # Create filename from person's name
        safe_name = person_name.lower().replace(' ', '_')
        extension = file.filename.rsplit('.', 1)[1].lower()
        filename = f"{safe_name}.{extension}"
        filepath = os.path.join(api.config['KNOWN_FACES_FOLDER'], filename)
        
        # Check if this person already exists
        counter = 1
        base_filename = filename
        while os.path.exists(filepath):
            filename = f"{safe_name}_{counter}.{extension}"
            filepath = os.path.join(api.config['KNOWN_FACES_FOLDER'], filename)
            counter += 1
        
        # Save the file
        file.save(filepath)
        
        return jsonify({
            "success": True,
            "message": f"Face for {person_name} added successfully",
            "filename": filename,
            "name": person_name
        }), 200
        
    except Exception as e:
        print(f"Face upload error: {e}")
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500


@api.route('/known-faces', methods=['GET'])
def list_known_faces():
    """List all known faces."""
    try:
        faces = []
        if os.path.exists(api.config['KNOWN_FACES_FOLDER']):
            for filename in os.listdir(api.config['KNOWN_FACES_FOLDER']):
                if allowed_image_file(filename):
                    filepath = os.path.join(api.config['KNOWN_FACES_FOLDER'], filename)
                    file_stat = os.stat(filepath)
                    
                    # Extract name from filename (replace underscores with spaces)
                    name = filename.rsplit('.', 1)[0].replace('_', ' ')
                    
                    faces.append({
                        "path": filename,  # Changed from "filename" to "path" to match frontend
                        "name": name,
                        "uploaded": file_stat.st_mtime
                    })
        return jsonify({"faces": faces}), 200  # Wrapped in object with "faces" key
    except Exception as e:
        print(f"List faces error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/known-faces/<filename>', methods=['GET'])
def serve_face_image(filename):
    """Serve a known face image."""
    try:
        print(f"Attempting to serve face image: {filename}")
        print(f"Known faces folder: {api.config['KNOWN_FACES_FOLDER']}")
        print(f"Full path: {os.path.join(api.config['KNOWN_FACES_FOLDER'], filename)}")
        return send_from_directory(api.config['KNOWN_FACES_FOLDER'], filename)
    except Exception as e:
        print(f"Serve image error: {e}")
        return jsonify({"error": str(e)}), 404


@api.route('/delete-face/<filename>', methods=['DELETE'])
def delete_face(filename):
    """Delete a known face."""
    try:
        filepath = os.path.join(api.config['KNOWN_FACES_FOLDER'], filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            return jsonify({"success": True, "message": "Face deleted successfully"}), 200
        else:
            return jsonify({"error": "Face not found"}), 404
    except Exception as e:
        print(f"Delete face error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/video_chunks/<path:filepath>', methods=['GET'])
def serve_video_chunk_file(filepath):
    """Serve video chunk files (videos, audio, JSON)."""
    try:
        print(f"Attempting to serve video chunk file: {filepath}")
        # filepath will be something like "Me_at_the_zoo_chunks/chunk_0000_0010_faces.json"
        video_chunks_root = os.path.abspath(VIDEO_CHUNKS_ROOT)
        print(f"Video chunks root: {video_chunks_root}")
        return send_from_directory(video_chunks_root, filepath)
    except Exception as e:
        print(f"Serve video chunk file error: {e}")
        return jsonify({"error": str(e)}), 404


@api.route('/performance', methods=['POST'])
def save_performance():
    """Save a completed game result or a legacy score using one JSON store."""
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "A JSON object is required"}), 400
        performance_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'performance_data.json')
        record, created = save_cognitive_record(performance_file, data)
        return jsonify({"success": True, "created": created, "record_id": record.get("record_id")}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"Save performance error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/performance', methods=['GET'])
def get_performance():
    """Get performance history."""
    try:
        performance_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'performance_data.json')
        return jsonify(load_store(performance_file)), 200
    except Exception as e:
        print(f"Get performance error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/performance/session/<session_id>', methods=['GET'])
def get_session_performance(session_id):
    try:
        session_id = validate_session_id(session_id)
        performance_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'performance_data.json')
        records = get_session_records(performance_file, session_id)
        return jsonify({"session_id": session_id, "scores": records}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"Get session performance error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/reports/session/<session_id>', methods=['GET'])
def get_session_report(session_id):
    try:
        session_id = validate_session_id(session_id)
        performance_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'performance_data.json')
        performance_data = load_store(performance_file)
        report = build_session_report(performance_data["scores"], session_id)
        return jsonify(report), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"Get session report error: {e}")
        return jsonify({"error": str(e)}), 500


@api.route('/reports/registry', methods=['GET'])
def get_cognitive_game_registry():
    return jsonify({"domains": ["Memory", "Attention", "Executive Function", "Recognition and Orientation"], "games": GAME_REGISTRY}), 200


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
        
        if not os.path.exists(video_chunks_root):
            return jsonify({"error": "No videos processed yet"}), 404
        
        # Load journals to get dates
        journal_file = 'video_journals.json'
        journals = {}
        if os.path.exists(journal_file):
            with open(journal_file, 'r') as f:
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
                video_path = f"/{VIDEO_CHUNKS_ROOT}/{folder_name}/{chunk_name}.mp4"
                
                # Get faces for this chunk
                faces = []
                for path, names in faces_data.items():
                    if chunk_name in path:
                        faces = names
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
                with open(QAS_PATH, 'w') as f:
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


if __name__ == '__main__':
    api.run(host='0.0.0.0', port=5000, debug=True)
