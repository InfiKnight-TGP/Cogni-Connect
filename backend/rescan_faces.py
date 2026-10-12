r"""Re-run face recognition on every processed video using the people in people.json.
Overwrites each chunk's *_faces.json (in video_chunks/ and its copies) and prints who was found.
Run: .venv\Scripts\python rescan_faces.py"""
import glob
import json
import os
import shutil
import sys

sys.stdout.reconfigure(encoding="utf-8")  # process_video prints "✓"; Windows pipes default to cp1252
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from app import _load_people, display_name  # noqa: E402  (after chdir so relative paths resolve)
from process_video import perform_face_recognition  # noqa: E402

# Other places process_video copies the same chunk folders to
COPIES = ["content", os.path.join("..", "frontend", "public", "video_chunks")]


def main():
    people = _load_people()  # also creates people.json from known_faces/ on first run
    folders = sorted(f for f in glob.glob(os.path.join("video_chunks", "*_chunks")) if os.path.isdir(f))
    if not folders:
        print("No processed videos found in video_chunks/")
        return

    summary = {}
    for folder in folders:
        perform_face_recognition(folder)
        found = []
        for faces_file in sorted(glob.glob(os.path.join(folder, "*_faces.json"))):
            with open(faces_file, "r", encoding="utf-8") as f:
                for ids in json.load(f).values():
                    found += [display_name(i, people) for i in ids if display_name(i, people) not in found]
            for copy_root in COPIES:
                copy_folder = os.path.join(copy_root, os.path.basename(folder))
                if os.path.isdir(copy_folder):
                    shutil.copy(faces_file, copy_folder)
        summary[os.path.basename(folder)[: -len("_chunks")]] = found

    print("\n== Names found per video")
    for video, names in summary.items():
        print(f"  {video}: {', '.join(names) if names else '(no known people)'}")


if __name__ == "__main__":
    main()
