# CogniConnect 🧠

A full-stack AI-powered memory support application designed to help individuals with dementia and Alzheimer's maintain connections with their memories through intelligent video analysis, face recognition, and interactive cognitive exercises. Built with Next.js, Flask, and OpenAI's GPT-4 Vision API.

## Feature branch status

The current patient game catalog is at `/play`; authenticated journals,
reminders, family messages, places, crossword and caregiver overview are at
`/support`. See [verified progress and remaining work](docs/WORK_PROGRESS.md).
The older video-workflow descriptions below are not a completion checklist for
the new platform.

The interaction selector offers Read and tap (default), Listen and speak, and
Mixed. Reading never starts recognition automatically. The mic reads the question
and listens; uncertain matches require confirmation. Silence and recognition
failures do not score an answer. Voice response timing is separate from tap timing.
Speech operations now cancel on mode changes without cancelling unrelated audio
or accepting late browser results.

Run checks with Node 24 and the backend virtual environment:

```powershell
cd frontend
npx tsc --noEmit
npm run test:unit
# Stop development servers before building.
npm run build
npm run start -- --hostname 127.0.0.1
# In another frontend terminal, against that production server:
npm run test:e2e
# Real support API tests in a temporary database (auto-starts Flask on 5031):
npm run test:e2e:support
cd ../backend
.venv\Scripts\python.exe -m unittest discover -s tests
.venv\Scripts\python.exe -c "import app"
```

Playwright requires Chromium (`npx playwright install chromium`).
Set `PLAYWRIGHT_BASE_URL` when using a different port. Browser speech tests use
deterministic mocks; they do not validate a physical microphone or native voices.
The support suite routes browser API requests to its isolated Flask test server;
it does not populate the working patient database or verify the production proxy.
For a safe production-browser workflow, including stale-build checks and port
ownership checks, see [local test-server workflow](docs/LOCAL_TEST_WORKFLOW.md).

To seed a local caregiver demo, run `.venv\Scripts\python.exe seed_platform.py`
from `backend`.
The script prompts for a password, labels all generated history SIMULATED, and
refuses to overwrite existing usernames. It creates `simulated-caregiver` and
`simulated-patient`; `--caregiver` and `--patient` select other demo usernames.

## Known limitations

- English, Hindi and Assamese interaction strings exist, but game content is not
  fully translated. Browser voices and recognition language support vary; offline
  recognition is unavailable in this provider. Read and tap remains available.
- Offline caching covers the patient game/support shells after online preparation;
  legacy video workflows are not fully offline.
- The support API has scoped accounts and hashed passwords. Legacy JSON routes
  and the UI PIN lock are not a secure multi-user deployment. Keep the backend on
  loopback. Browser records and local media are not encrypted at rest.
- SOS delivers to the caregiver account inbox, not SMS or emergency services.
  Reminders need the app open; background scheduling is not implemented.
- Journal recognition captures a short live utterance; it is not full recording
  transcription. Crossword grids use English/Romanized letters and template clues.
- This system supports engagement and early-change monitoring for caregivers and
  clinicians. It does not diagnose or treat dementia. Demo seed data is simulated.

## ✨ Features

### 🎥 Video Memory Processing
- **Automatic Video Upload**: Upload video journals with metadata (title, date, description, emotions, people)
- **Smart Chunking**: Splits videos into 10-second chunks for efficient processing
- **Audio Transcription**: Extracts and transcribes audio using speech recognition
- **Face Detection**: Automatic face recognition in video frames using face_recognition library
- **Frame Extraction**: ORB keypoint detection for extracting unique frames
- **AI Analysis**: GPT-4 Vision API analyzes video content and generates contextual Q&A

### 🔍 Memory Explorer
- **Semantic Search**: Natural language queries to find specific memories
- **Video Playback**: Sequential playback of video chunks with auto-advance
- **Random Folder Selection**: Randomized video folder selection while maintaining chunk order
- **Transcript Display**: Real-time synchronized transcripts during playback
- **Face Recognition Tags**: Visual indicators of recognized people in videos

### 🧩 Cognitive Quiz System
**Activity 1: Face Recognition**
- Present faces from videos and known contacts
- Track correct/incorrect selections
- Scoring: `(correct - incorrect) / total × 100`
- Mix of real faces and distractor images

**Activity 2: Name-Face Matching**
- Interactive bubble-clicking game
- Match names to correct faces
- Dynamic name generation for similar distractors
- Binary scoring: 100 points for correct match

**Activity 3: Context Questions**
- AI-generated questions about video memories
- GPT-4 powered answer verification
- Sequential question flow with manual navigation
- Score averaging: `(sum of all question scores / 5) × 10`

**Comprehensive Scoring**
- Combines all 3 activities into unified performance metric
- Detailed breakdown per activity
- Historical tracking with timestamps
- Visual feedback and progress indicators

### 📊 Performance Dashboard
- **Memory Trends Graph**: Weekly performance visualization
- **Activity Breakdown**: Individual scores for each quiz activity
- **Statistics Cards**: 
  - Average score tracking
  - Recent performance metrics
  - Improvement indicators
  - Completion counts
- **Monthly Analysis**: Week-by-week performance within current month
- **Real-time Updates**: Dynamic data refresh after each quiz

### 👥 Faces Management
- **Known Faces Directory**: Upload and manage familiar faces
- **Dynamic Loading**: Automatic detection of uploaded face images
- **Name Normalization**: Converts filenames to display names (e.g., `jawed_karim.jpg` → "Jawed Karim")
- **Static Distractors**: Pre-loaded faces for quiz variety
- **Grid Display**: Visual grid of all known faces with names

### 📝 Emergency Contacts
- **Quick Access**: Important contact information display
- **Contact Cards**: Name, relationship, phone, email, address
- **Important Notes**: Critical information and emergency instructions
- **Theme Support**: Light/dark mode compatibility

### 🌓 Theme System
- **Dark/Light Mode Toggle**: Seamless theme switching
- **System Preference Detection**: Automatic theme based on OS settings
- **Persistent Preferences**: Theme choice saved in localStorage
- **Comprehensive Coverage**: All pages and components theme-aware
- **Smooth Transitions**: Animated icon changes and color transitions

## 🛠️ Tech Stack

### Backend
- **Runtime**: Python 3.13+
- **Framework**: Flask 3.x with CORS support
- **AI/ML**: 
  - OpenAI GPT-4 Vision API
  - face_recognition library (dlib-based)
  - SpeechRecognition for audio transcription
- **Video Processing**: 
  - MoviePy 2.x for video manipulation
  - OpenCV (cv2) for frame extraction
  - ORB keypoint detection for unique frame filtering
- **Data Storage**: JSON-based file storage
  - `qas.json`: Quiz questions and answers
  - `video_journals.json`: Video metadata
  - `performance_data.json`: Quiz performance history
- **Utilities**: 
  - python-dotenv for environment variables
  - NumPy for numerical operations

### Frontend
- **Framework**: Next.js 14.0.3 (App Router)
- **UI Library**: React 18.2.0
- **Styling**: 
  - Tailwind CSS 3.3.0
  - Tailwind Animate for transitions
  - Custom CSS variables for theming
- **Component Libraries**:
  - Radix UI (Dialog, Popover, Select, Tabs, etc.)
  - Lucide React for icons
  - shadcn/ui component patterns
- **Charting**: Chart.js 4.4.0 with react-chartjs-2
- **Theme Management**: next-themes 0.2.1
- **Date Handling**: date-fns 2.30.0
- **Image Optimization**: Sharp 0.32.6 (Next.js Image)
- **TypeScript**: Full type safety with TS 5

## 🚀 Getting Started

### Prerequisites
- **Python 3.13+** installed
- **Node.js 20+** installed
- **Redis Server** (optional, for future pub/sub features)
- **OpenAI API Key** (for GPT-4 Vision)

### Installation

1. **Clone the repository**
```powershell
git clone https://github.com/InfiKnight-TGP/Cogni-Connect.git
cd Cogni-Connect
```

2. **Backend Setup**
```powershell
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment
.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Create .env file
# Add your OpenAI API key:
# OPENAI_API_KEY=your_api_key_here
```

3. **Frontend Setup**
```powershell
cd frontend

# Install dependencies
npm install
```

### Running the Application

**Option 1: Quick Start (Two Terminals)**

Terminal 1 - Backend:
```powershell
cd "D:\Cogni Connect\backend"
python app.py
```

Terminal 2 - Frontend:
```powershell
cd "D:\Cogni Connect\frontend"
npm run dev
```

**Option 2: Development Mode**

Backend (Terminal 1):
```powershell
cd backend
.venv\Scripts\Activate.ps1
python app.py
```
Expected output:
```
* Serving Flask app 'app'
* Debug mode: on
* Running on http://127.0.0.1:5000
```

Frontend (Terminal 2):
```powershell
cd frontend
npm run dev
```
Expected output:
```
▲ Next.js 14.0.3
- Local: http://localhost:3000
✓ Ready in 5s
```

### Access the Application
- **Main App**: http://localhost:3000
- **API Server**: http://localhost:5000

## 📁 Project Structure

```
Cogni-Connect/
├── backend/
│   ├── app.py                          # Flask API server
│   ├── process_video.py                # Video processing pipeline
│   ├── requirements.txt                # Python dependencies
│   ├── .env                            # Environment variables (API keys)
│   ├── content/                        # Uploaded video files
│   ├── known_faces/                    # Known face images
│   │   ├── jawed_karim.jpg
│   │   ├── bharath.jpg
│   │   ├── dinesh.jpg
│   │   └── ... (more faces)
│   ├── frames/                         # Extracted video frames
│   │   └── [video_name]_chunks/
│   ├── video_chunks/                   # Processed video chunks
│   │   └── [video_name]_chunks/
│   │       ├── chunk_0000_0010.mp4
│   │       ├── chunk_0000_0010_faces.json
│   │       └── full_transcript.json
│   ├── qas.json                        # Generated Q&A data
│   ├── video_journals.json             # Video metadata
│   └── performance_data.json           # Quiz scores
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx                  # Root layout with theme provider
│   │   ├── page.tsx                    # Home/Dashboard
│   │   ├── globals.css                 # Global styles + Tailwind
│   │   ├── api/
│   │   │   ├── accuracy/route.tsx      # AI answer scoring
│   │   │   ├── questions/route.tsx     # Quiz questions API
│   │   │   ├── semSearch/route.tsx     # Semantic search
│   │   │   └── videos/route.tsx        # Video list API
│   │   ├── contacts/
│   │   │   └── page.tsx                # Emergency contacts
│   │   ├── dashboard/
│   │   │   ├── page.tsx                # Performance dashboard
│   │   │   └── graph.tsx               # Memory trends chart
│   │   ├── explore/
│   │   │   └── page.tsx                # Memory explorer (video player)
│   │   ├── faces/
│   │   │   └── page.tsx                # Known faces grid
│   │   ├── quiz/
│   │   │   └── page.tsx                # Quiz orchestrator
│   │   └── upload/
│   │       └── page.tsx                # Video upload interface
│   ├── components/
│   │   ├── nav.tsx                     # Navigation bar
│   │   ├── theme-toggle.tsx            # Dark/light mode toggle
│   │   ├── videoModal.tsx              # Video playback modal
│   │   ├── quiz/
│   │   │   ├── start.tsx               # Quiz landing page
│   │   │   ├── personSelect.tsx        # Activity 1: Face recognition
│   │   │   ├── namePeople.tsx          # Activity 2: Name matching
│   │   │   ├── contextQuestions.tsx    # Activity 3: Context Q&A
│   │   │   ├── datePicker.tsx          # Date selection component
│   │   │   └── bubbles/
│   │   │       └── index.tsx           # Bubble clicking game
│   │   └── ui/
│   │       ├── button.tsx              # shadcn button
│   │       ├── card.tsx                # shadcn card
│   │       ├── dialog.tsx              # shadcn dialog
│   │       ├── input.tsx               # shadcn input
│   │       └── ... (more UI components)
│   ├── lib/
│   │   ├── types.ts                    # TypeScript type definitions
│   │   └── utils.ts                    # Utility functions
│   ├── public/
│   │   ├── known-faces/                # Publicly accessible face images
│   │   └── video_chunks/               # Public video chunks
│   ├── next.config.js                  # Next.js configuration
│   ├── tailwind.config.ts              # Tailwind CSS config
│   ├── tsconfig.json                   # TypeScript config
│   └── package.json                    # Node dependencies
│
├── HOW_TO_RUN.md                       # Setup instructions
└── README.md                           # This file
```

## 🎯 Configuration

### Backend Configuration (app.py)
```python
UPLOAD_FOLDER = 'content'              # Video uploads directory
KNOWN_FACES_FOLDER = 'known_faces'     # Known faces directory
MAX_CONTENT_LENGTH = 500 * 1024 * 1024 # 500MB max upload size
ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm'}
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png'}
```

### Frontend Configuration (next.config.js)
```javascript
images: {
  remotePatterns: [
    {
      protocol: 'http',
      hostname: 'localhost',
      port: '5000',
      pathname: '/known-faces/**',
    },
  ],
}
```

### Environment Variables
Create `.env` in `backend/` folder:
```env
OPENAI_API_KEY=your_openai_api_key_here
```

## 📡 API Endpoints

### Video Management
```
POST /upload                           # Upload video with metadata
GET  /video_chunks                     # Get all video chunks
GET  /api/videos                       # Get video list (frontend API)
```

### Face Recognition
```
GET  /known-faces                      # Get all known faces
POST /known-faces                      # Upload new face image
GET  /known-faces/<filename>           # Serve face image
```

### Quiz System
```
GET  /api/questions                    # Get quiz questions
POST /api/accuracy                     # Verify answer with AI
POST /performance                      # Save quiz performance
GET  /performance                      # Get performance history
```

### Memory Search
```
POST /api/semSearch                    # Semantic video search
```

## 💻 Usage Examples

### Upload a Video Memory
1. Navigate to "Upload Video" page
2. Fill in video details:
   - Title, date, description
   - Emotions experienced
   - People present
3. Select video file
4. Click "Upload"
5. Video processes automatically in background

### Use Memory Explorer
1. Go to "Memory Explorer" page
2. Enter search query (e.g., "family dinner", "birthday party")
3. Click "Query" button
4. Watch relevant video chunks play sequentially
5. View synchronized transcripts

### Take Cognitive Quiz
1. Navigate to "Quiz" page
2. Choose an activity:
   - **Activity 1**: Identify faces from your memories
   - **Activity 2**: Match names to the correct faces
   - **Activity 3**: Answer context questions about videos
3. Complete all activities for comprehensive score
4. View results on Performance Dashboard

### View Performance Dashboard
1. Go to "Dashboard" page
2. View stats cards:
   - Average score
   - Recent performance
   - Activity breakdowns
3. Analyze Memory Trends graph
   - Weekly performance visualization
   - Current month focus
4. Track improvement over time

### Manage Known Faces
1. Navigate to "Faces" page
2. View all known faces in grid layout
3. Upload new faces:
   - Use "Upload Face" button
   - Name format: `firstname_lastname.jpg`
4. System automatically normalizes names for display

## 🏗️ Architecture Highlights

### Video Processing Pipeline
1. **Upload**: User submits video with metadata
2. **Chunking**: Video split into 10-second segments
3. **Transcription**: Audio extracted and converted to text
4. **Frame Extraction**: ORB keypoint detection identifies unique frames
5. **Face Recognition**: Detects and identifies people in frames
6. **AI Analysis**: GPT-4 Vision generates contextual Q&A
7. **Storage**: Chunks, transcripts, and faces saved to JSON

### Face Recognition System
- **Training**: Loads all images from `known_faces/` directory
- **Encoding**: Uses dlib's face encoding (128-dimensional vectors)
- **Detection**: Scans video frames for faces
- **Matching**: Compares detected faces to known encodings
- **Threshold**: Configurable tolerance for face matching accuracy

### Quiz Scoring Algorithm
**Activity 1 (Face Recognition):**
```
score = ((correct_count - incorrect_count) / total_faces) × 100
```

**Activity 2 (Name Matching):**
```
score = 100 if correct else 0
```

**Activity 3 (Context Questions):**
```
question_score = AI_verification_score (0-10)
activity_score = (sum(all_question_scores) / total_questions) × 10
```

**Combined Score:**
```
final_score = (activity1 + activity2 + activity3) / 3
```

### Theme System
- **CSS Variables**: Light/dark color schemes defined in `globals.css`
- **next-themes**: Manages theme state and persistence
- **System Detection**: Auto-detects OS preference on first visit
- **LocalStorage**: Persists user theme choice
- **No Flash**: Prevents theme flicker on page load

### Video Randomization Strategy
- **Folder-Level**: Randomizes which video folder plays first
- **Chunk-Level**: Maintains sequential order within each video
- **Algorithm**: Shuffles folders array before concatenating chunks
- **Result**: Different video order each page load, but coherent playback

## 🎨 Recent Enhancements

### Quiz System Overhaul
✅ Comprehensive scoring combining all 3 activities  
✅ Sequential question flow with manual navigation  
✅ AI-powered answer verification using GPT-4  
✅ Fixed bubble click handler with proper dependencies  
✅ Activity score breakdown in performance data  
✅ Finish button only appears after all questions answered  

### Dashboard Improvements
✅ Stats cards repositioned above Memory Trends graph  
✅ Weekly calculation based on actual calendar weeks  
✅ Filters performance data by current month only  
✅ Dynamic week generation (Week 1-5)  
✅ Real-time updates after quiz completion  

### Theme System Implementation
✅ Dark/light mode toggle in navigation  
✅ System preference detection  
✅ Persistent theme storage  
✅ Complete dark mode styling across all pages  
✅ Smooth animated transitions  
✅ Fixed search inputs, cards, and all UI elements  

### Memory Explorer Updates
✅ Random video folder selection  
✅ Sequential chunk playback within videos  
✅ Fixed dark mode styling for search interface  
✅ Improved video loading performance  

## 📈 Performance Metrics

Typical performance on modern hardware:

- **Video Upload**: ~2-5 seconds (depends on file size)
- **Video Processing**: ~30-60 seconds per minute of video
- **Face Recognition**: ~100-200ms per frame
- **Transcript Generation**: ~5-10 seconds per chunk
- **AI Analysis**: ~3-5 seconds per Q&A generation
- **Semantic Search**: ~1-2 seconds
- **Quiz Loading**: <500ms
- **Dashboard Rendering**: <300ms

## 🧪 Testing

Currently testing is done manually. Future enhancements will include:

- Jest/React Testing Library for frontend components
- pytest for backend API endpoints
- Integration tests for video processing pipeline
- E2E tests with Playwright/Cypress
- Performance benchmarking scripts

## 🚢 Deployment

### Production Build

**Frontend:**
```powershell
cd frontend
npm run build
npm start
```

**Backend:**
```powershell
cd backend
# Set production environment variables
# Use production WSGI server (gunicorn, waitress)
pip install gunicorn
gunicorn app:api
```

### Environment Variables (Production)
```env
OPENAI_API_KEY=your_production_api_key
FLASK_ENV=production
PORT=5000
NODE_ENV=production
```

### Deployment Checklist
- [ ] Set strong API keys
- [ ] Configure CORS for production domain
- [ ] Use production WSGI server (not Flask dev server)
- [ ] Enable HTTPS
- [ ] Set up database (replace JSON storage)
- [ ] Configure file storage (S3, Azure Blob, etc.)
- [ ] Set up monitoring and logging
- [ ] Configure rate limiting
- [ ] Enable caching
- [ ] Set up CI/CD pipeline

## 🔮 Future Enhancements

### Phase 1: Core Improvements
- [ ] **Database Integration**: PostgreSQL for persistent storage
- [ ] **User Authentication**: Multi-user support with login system
- [ ] **Cloud Storage**: S3/Azure for video and image storage
- [ ] **WebSocket Support**: Real-time updates and notifications
- [ ] **Mobile App**: React Native application
- [ ] **Offline Mode**: Progressive Web App (PWA) capabilities

### Phase 2: Advanced Features
- [ ] **Voice Commands**: Voice-activated memory search
- [ ] **Calendar Integration**: Link memories to calendar events
- [ ] **Medication Reminders**: Smart notification system
- [ ] **Caregiver Dashboard**: Separate interface for caregivers
- [ ] **Social Sharing**: Share memories with family members
- [ ] **Memory Games**: Additional cognitive exercises
- [ ] **AR/VR Support**: Immersive memory experiences
- [ ] **Multi-language Support**: Internationalization

### Phase 3: AI Enhancements
- [ ] **Emotion Detection**: Analyze emotions in videos
- [ ] **Object Recognition**: Tag objects in video scenes
- [ ] **Scene Classification**: Categorize video content
- [ ] **Predictive Analytics**: Identify cognitive patterns
- [ ] **Personalized Recommendations**: Suggest relevant memories
- [ ] **Natural Conversations**: ChatGPT-style memory chat
- [ ] **Auto-captioning**: Generate video captions
- [ ] **Smart Highlights**: Auto-create memory compilations

### Phase 4: Clinical Features
- [ ] **Progress Tracking**: Long-term cognitive assessment
- [ ] **Medical Integration**: Connect with healthcare systems
- [ ] **Clinical Reports**: Generate reports for doctors
- [ ] **Medication Tracking**: Monitor medication adherence
- [ ] **Appointment Reminders**: Healthcare appointment system
- [ ] **Emergency Alerts**: Automatic caregiver notifications
- [ ] **Research Tools**: Anonymized data for dementia research

## 🤝 Contributing

Contributions are welcome! This project is designed to help individuals with cognitive challenges and their families.

### How to Contribute

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Make your changes**
4. **Test thoroughly**
5. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
6. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
7. **Open a Pull Request**

### Contribution Guidelines
- Follow existing code style and conventions
- Add comments for complex logic
- Update documentation for new features
- Test all changes before submitting
- Be respectful and constructive in discussions

## 📖 Learning Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [face_recognition Library](https://github.com/ageitgey/face_recognition)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Chart.js](https://www.chartjs.org/docs/latest/)

## 🐛 Known Issues

- Video processing can be slow for long videos (>5 minutes)
- Face recognition accuracy depends on image quality
- Large video files may cause memory issues
- AI-generated Q&A quality varies with video content
- Theme flash may occur on slow connections

## 🔒 Privacy & Security

- Support records and recordings are stored locally first, then uploaded to the
  configured backend when authenticated and connected; location sharing requires
  caregiver consent. Browser speech services may process audio remotely.
- Configured legacy OpenAI features send their relevant content to that provider.
- Server sessions protect the new support API; legacy routes retain their original
  single-patient access model. Use trusted devices for unencrypted local storage.
- API keys belong in environment variables and must never be committed.

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **OpenAI** - GPT-4 Vision API for intelligent analysis
- **dlib Team** - Face recognition algorithms
- **Next.js Team** - Modern React framework
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Beautiful UI components
- **Radix UI** - Accessible component primitives
- **Face Recognition Library** - Simple face recognition for Python

## 📞 Support

For issues, questions, or feature requests:

- **GitHub Issues**: [Open an issue](https://github.com/InfiKnight-TGP/Cogni-Connect/issues)
- **Email**: Contact the maintainers for urgent issues

---

**Built with ❤️ to help individuals with dementia and Alzheimer's stay connected to their memories**

*CogniConnect - Connecting Minds, Preserving Memories*
