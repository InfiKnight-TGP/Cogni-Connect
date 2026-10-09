r"""Download the OpenCV face models (YuNet detector, SFace recognizer) into backend/models/ if missing.
Run: .venv\Scripts\python download_models.py"""
import os
import urllib.request

ZOO = "https://github.com/opencv/opencv_zoo/raw/main/models"
MODELS = {
    "face_detection_yunet_2023mar.onnx": f"{ZOO}/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx": f"{ZOO}/face_recognition_sface/face_recognition_sface_2021dec.onnx",
}
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")


def main():
    os.makedirs(MODELS_DIR, exist_ok=True)
    for name, url in MODELS.items():
        path = os.path.join(MODELS_DIR, name)
        if os.path.exists(path):
            print(f"OK {name} already present")
            continue
        print(f"Downloading {name} from {url}")
        part = path + ".part"
        urllib.request.urlretrieve(url, part)
        with open(part, "rb") as f:
            # The models live in Git LFS; a tiny text pointer means we did not get the real file
            if f.read(40).startswith(b"version https://git-lfs"):
                os.remove(part)
                raise SystemExit(f"Got a Git LFS pointer instead of {name}; download it manually from {url}")
        os.replace(part, path)
        print(f"OK {name} ({os.path.getsize(path) // 1024} KB)")


if __name__ == "__main__":
    main()
