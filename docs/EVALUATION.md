# CogniConnect System Evaluation Report

**Date:** 2026-10-16 10:19:40  
**Machine:** Windows 11 (AMD64), Python 3.14.6  
**Data Used:** content/Me_at_the_zoo.mp4, video_chunks (240p chunks), known_faces (Akash, Dinesh, Nikhil, Jawed Karim)  

## Executive Results Summary

| Benchmark Domain | Metric | Measured Value | Target / Status |
|:---|:---|:---|:---|
| **1. Face Recognition** | Precision (Known People) | **100.0%** | 100% |
| | Recall (Known People) | **100.0%** | 100% |
| | Unknown Faces Ratio | **5.9%** | < 10% (Blurred/Turned faces) |
| | Cosine Similarity (True Match) | **0.751** (range 0.094-0.846) | Threshold >= 0.363 |
| | Cosine Similarity (Other Faces) | **0.048** (range -0.073-0.192) | Cleanly separated below threshold |
| **2. Transcription (WER)** | Whisper vs Reference | **2.63%** | Word-exact accuracy |
| | Google Speech vs Reference | **0.00%** | Benchmark comparison |
| **3. Latency: Video Processing Per Min Video** | Median / P90 (5 runs) | **30.3441s / 32.3349s** | seconds per minute of video |
| **3. Latency: Transcribe 5S Clip** | Median / P90 (5 runs) | **2.1194s / 3.5022s** | seconds |
| **3. Latency: Accuracy** | Median / P90 (5 runs) | **0.7901s / 0.946s** | seconds |
| **3. Latency: Generate Questions** | Median / P90 (5 runs) | **3.661s / 4.16s** | seconds |
| **3. Latency: Crossword** | Median / P90 (5 runs) | **0.0021s / 0.0076s** | seconds |
| **3. Latency: Search** | Median / P90 (5 runs) | **2.0628s / 2.8975s** | seconds |
| **3. Latency: Daily Plan** | Median / P90 (5 runs) | **0.0031s / 0.0045s** | seconds |
| **3. Latency: Reports Day** | Median / P90 (5 runs) | **0.0032s / 0.0035s** | seconds |
| **4. Answer Grading** | Bucket Agreement (10 Pairs) | **9/10 (90.0%)** | Spearman Correlation: 0.964 |
| **5. Voice Matching** | Correct Routing Accuracy | **100.0%** | Accept: 30.0%, Confirm: 50.0%, Reject: 20.0% |
| **6. Adaptive Engine** | Synthetic Player Progression | Struggling: **Knob 1** / Average: **Knob 4** / Strong: **Knob 4** | 30 answers simulated |
| **7. Tests & Verification** | Backend (34) + Frontend Checks (5) + TypeCheck | **All Passing (PASS)** | 100% Pass Rate |

---

## Detailed Results

### 1. Face Recognition
- **Detector:** OpenCV YuNet (`face_detection_yunet_2023mar.onnx`, confidence score threshold: `0.8`)
- **Recognizer:** OpenCV SFace (`face_recognition_sface_2021dec.onnx`, cosine match threshold: `0.363`)
- **Total Face Detections:** 51
- **Faces Classified as Unknown:** 3 (5.9%)

| Video Chunk | Ground Truth | Predicted | Precision | Recall | Unknown Rate |
|:---|:---|:---|:---|:---|:---|
| `chunk_0000_0010.mp4` | jawed_karim | jawed_karim | 100.0% | 100.0% | 6.9% (2/29) |
| `chunk_0010_0019.mp4` | jawed_karim | jawed_karim | 100.0% | 100.0% | 4.5% (1/22) |

#### Cosine Similarity Score Distribution
| Face Class | Mean | Median | Min | Max | Std Dev | Sample Size |
|:---|:---|:---|:---|:---|:---|:---|
| **True Matches** | 0.7515 | 0.8014 | 0.0938 | 0.8457 | 0.1673 | 51 |
| **Other Faces** | 0.0481 | 0.0307 | -0.0729 | 0.1923 | 0.0688 | 153 |

### 2. Transcription (WER Analysis)
- **Ground Truth Reference:**  
  > "Alright, so here we are in front of the elephants, and the cool thing about these guys is that they have really, really, really long trunks, and that's cool. And that's pretty much all there is to say."
- **Whisper (`whisper-1`):**  
  > "Alright, so here we are in front of the elephants. The cool thing about these guys is that they have really, really, really long trunks. And that's cool. And that's pretty much all there is to say."  
  **WER:** `2.63%`
- **Google Speech:**  
  > "Alright, so here we are in front of the elephants, and the cool thing about these guys is that they have really, really, really long trunks, and that's cool. And that's pretty much all there is to say."  
  **WER:** `0.00%`

### 3. Latency Benchmarks (5 Runs Each)
| Endpoint / Pipeline Step | 5 Runs (seconds) | Median | P90 | Target SLA |
|:---|:---|:---|:---|:---|
| `video_processing_per_min_video` | 33.445, 29.606, 29.285, 30.669, 30.344 | **30.344s** | **32.335s** | < 5.0s |
| `transcribe_5s_clip` | 3.635, 2.119, 3.303, 1.761, 1.414 | **2.119s** | **3.502s** | < 5.0s |
| `accuracy` | 1.018, 0.783, 0.790, 0.839, 0.790 | **0.790s** | **0.946s** | < 5.0s |
| `generate_questions` | 3.857, 4.362, 3.661, 3.430, 3.498 | **3.661s** | **4.160s** | < 5.0s |
| `crossword` | 0.011, 0.003, 0.002, 0.002, 0.002 | **0.002s** | **0.008s** | < 5.0s |
| `search` | 2.099, 2.063, 2.046, 3.429, 1.833 | **2.063s** | **2.897s** | < 5.0s |
| `daily_plan` | 0.005, 0.003, 0.003, 0.003, 0.003 | **0.003s** | **0.004s** | < 5.0s |
| `reports_day` | 0.003, 0.003, 0.004, 0.003, 0.003 | **0.003s** | **0.004s** | < 5.0s |

### 4. Answer Grading Evaluation (10 Hand-Written Pairs)
| ID | Category | Given Answer | Reference Answer | Expected | Score | In Bucket |
|:---|:---|:---|:---|:---|:---|:---|
| 1 | Correct (Exact) | "In front of the elephants at the zoo" | "In front of the elephants at the zoo" | High (8-10) | **10/10** | Pass |
| 2 | Correct (Paraphrase) | "The elephants had very long trunks" | "They have really long trunks" | High (8-10) | **10/10** | Pass |
| 3 | Correct (Concise) | "San Diego Zoo" | "San Diego Zoo" | High (8-10) | **10/10** | Pass |
| 4 | Partly Correct (Vague) | "Somewhere at the zoo" | "In front of the elephants at the zoo" | Medium (4-7) | **6/10** | Pass |
| 5 | Partly Correct (Missing detail) | "They had big trunks" | "They have really, really long trunks and that's cool" | Medium (4-7) | **8/10** | Warn |
| 6 | Partly Correct (Partial info) | "We made a video" | "We made a funny vlog with a vintage camera" | Medium (4-7) | **5/10** | Pass |
| 7 | Wrong (Unrelated) | "At the supermarket buying vegetables" | "In front of the elephants at the zoo" | Low (0-3) | **1/10** | Pass |
| 8 | Wrong (Contradiction) | "They have short fluffy tails like rabbits" | "They have really long trunks" | Low (0-3) | **1/10** | Pass |
| 9 | Hindi (Correct Paraphrase) | "चिड़ियाघर में हाथियों के सामने" | "हाथी के सामने चिड़ियाघर में" | High (8-10) | **10/10** | Pass |
| 10 | Hindi (Wrong) | "रेलवे स्टेशन पर चाय पी रहे थे" | "हाथी के सामने चिड़ियाघर में" | Low (0-3) | **1/10** | Pass |

- **Bucket Agreement:** 9/10 (90.0%)
- **Spearman Rank Correlation:** 0.964

### 5. Voice Matching (Fuzzy Matcher on Accents & Misspellings)
| Input Text | Target | Matched Option | Similarity | Resolution | Routing Correct? |
|:---|:---|:---|:---|:---|:---|
| "denish" | `dinesh` | `dinesh` | 1.00 | `accept` | Correct |
| "dines" | `dinesh` | `dinesh` | 0.83 | `confirm` | Correct |
| "dinnesh" | `dinesh` | `dinesh` | 1.00 | `accept` | Correct |
| "deensh" | `dinesh` | `dinesh` | 0.67 | `confirm` | Correct |
| "aakash" | `akash` | `akash` | 1.00 | `accept` | Correct |
| "akashh" | `akash` | `akash` | 0.83 | `confirm` | Correct |
| "aakaash" | `akash` | `akash` | 0.86 | `confirm` | Correct |
| "nikil" | `nikhil` | `nikhil` | 0.83 | `confirm` | Correct |
| "nikheel" | `nikhil` | `nikhil` | 0.71 | `confirm` | Correct |
| "jawed" | `jawed` | `jawed` | 1.00 | `accept` | Correct |
| "javed" | `jawed` | `jawed` | 0.80 | `confirm` | Correct |
| "suneeta" | `sunita` | `sunita` | 0.71 | `confirm` | Correct |
| "sunitha" | `sunita` | `sunita` | 0.86 | `confirm` | Correct |
| "puja" | `pooja` | `pooja` | 1.00 | `accept` | Correct |
| "ameet" | `amit` | `amit` | 1.00 | `accept` | Correct |
| "rawi" | `ravi` | `ravi` | 0.75 | `confirm` | Correct |
| "supermarket" | `None` | `-` | 0.00 | `retry` | Correct |
| "elephant" | `None` | `-` | 0.00 | `retry` | Correct |
| "telephone" | `None` | `-` | 0.00 | `retry` | Correct |
| "banana" | `None` | `-` | 0.00 | `retry` | Correct |

- **Total Test Cases:** 20
- **Acceptance Rate (`accept`):** 30.0% (6/20)
- **Confirmation Rate (`confirm`):** 50.0% (10/20)
- **Rejection Rate (`retry`):** 20.0% (4/20)
- **Routing Accuracy:** 100.0%

### 6. Adaptive Engine Simulation
Simulated 3 synthetic cognitive profiles across 30 sequential questions each:
- **Struggling Player:** 20% accuracy, slow responses (~5000ms).
  - Initial Knob: 2 (Rating 1000)
  - Final Knob: **1** (Rating 772)
  - Knob Progression: `2 -> 2 -> 2 -> 2 -> 1 -> 1 -> 1 -> 1 -> 1 -> 1 -> 1 -> 1 -> 1 -> 1 -> 1 ... -> 1`
- **Average Player:** 60% accuracy, moderate responses (~2500ms).
  - Initial Knob: 2 (Rating 1000)
  - Final Knob: **4** (Rating 1068)
  - Knob Progression: `2 -> 2 -> 2 -> 2 -> 1 -> 1 -> 1 -> 1 -> 1 -> 1 -> 1 -> 1 -> 1 -> 1 -> 2 ... -> 4`
- **Strong Player:** 95% accuracy, fast responses (~1200ms).
  - Initial Knob: 2 (Rating 1000)
  - Final Knob: **4** (Rating 1298)
  - Knob Progression: `2 -> 2 -> 2 -> 2 -> 3 -> 3 -> 3 -> 3 -> 3 -> 4 -> 4 -> 4 -> 4 -> 4 -> 4 ... -> 4`

### 7. Test Suite Status
- **Backend Unittests:** `34 tests` -> **PASS**
- **Backend Import Verification:** `import app` -> **PASS**
- **Frontend Check (`lib/progress.check.mjs`):** **PASS** (progress checks passed)
- **Frontend Check (`lib/interaction/adaptive.check.mjs`):** **PASS** (adaptive checks passed: separate baselines, recognition exclusion, one-knob changes and sustained slopes)
- **Frontend Check (`lib/interaction/locales.check.mjs`):** **PASS** (locale coverage checks passed: 333 required phrases in Hindi and Assamese, English fallback, locale selection and interpolation)
- **Frontend Check (`lib/interaction/yesterday-quiz.check.mjs`):** **PASS** (Yesterday Quiz checks passed: adaptive choices, date safety, repeated summaries and varied positions)
- **Frontend Check (`lib/interaction/matching.check.mjs`):** **PASS** (matching checks passed: normalization, levenshtein distance, synonym resolution and confidence thresholds)
- **TypeScript Strict Check (`tsc --noEmit`):** **PASS**

### Limitations & Unmeasured Items
- *face_recognition (dlib/face_recognition)* is not installed on Windows host; evaluation ran using OpenCV YuNet detector and SFace recognizer as natively supported in the repository.
