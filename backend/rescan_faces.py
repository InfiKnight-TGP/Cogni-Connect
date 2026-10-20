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

from app import display_name  # noqa: E402  (after chdir so relative paths resolve)
from process_video import perform_face_recognition  # noqa: E402

# Other places process_video copies the same chunk folders to
from patient_storage import cli_data_dir


def main():
    base_dir, _ = cli_data_dir()
    with open(base_dir / "people.json", encoding="utf-8") as stream:
        people = json.load(stream)
    folders = sorted(f for f in glob.glob(os.path.join(base_dir, "video_chunks", "*_chunks")) if os.path.isdir(f))
    if not folders:
        print("No processed videos found in video_chunks/")
        return

    summary = {}
    for folder in folders:
        perform_face_recognition(folder, str(base_dir))
        found = []
        for faces_file in sorted(glob.glob(os.path.join(folder, "*_faces.json"))):
            with open(faces_file, "r", encoding="utf-8") as f:
                for ids in json.load(f).values():
                    found += [display_name(i, people) for i in ids if display_name(i, people) not in found]
            for copy_root in [base_dir / "content"]:
                copy_folder = os.path.join(copy_root, os.path.basename(folder))
                if os.path.isdir(copy_folder):
                    shutil.copy(faces_file, copy_folder)
        summary[os.path.basename(folder)[: -len("_chunks")]] = found

    print("\n== Names found per video")
    for video, names in summary.items():
        print(f"  {video}: {', '.join(names) if names else '(no known people)'}")


if __name__ == "__main__":
    main()
