import json
import os
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from jsonio import atomic_write_json


class TestAtomicWriteJson(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.addCleanup(self.temp_dir.cleanup)

    def test_concurrent_writer_and_reader_stress(self):
        target_file = self.root / "stress.json"
        # Seed initial content
        atomic_write_json(target_file, {"count": 0, "items": []})

        stop_event = threading.Event()
        read_errors = []
        parsed_reads = [0]

        def reader():
            while parsed_reads[0] < 3000 and not stop_event.is_set():
                try:
                    with open(target_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if not isinstance(data, dict) or "count" not in data:
                        read_errors.append(f"Invalid schema: {data}")
                    parsed_reads[0] += 1
                except PermissionError:
                    time.sleep(0.001)
                except Exception as exc:
                    read_errors.append(str(exc))
                    break

        def writer():
            for i in range(1, 301):
                payload = {"count": i, "items": list(range(i % 50))}
                atomic_write_json(target_file, payload)
                time.sleep(0.001)

        reader_thread = threading.Thread(target=reader)
        writer_thread = threading.Thread(target=writer)

        reader_thread.start()
        writer_thread.start()

        writer_thread.join(timeout=30)
        # Continue reading until 3000 reads reached
        reader_thread.join(timeout=30)
        stop_event.set()

        self.assertEqual(read_errors, [], f"Reader encountered JSON errors: {read_errors}")
        self.assertGreaterEqual(parsed_reads[0], 3000)

        # No .tmp files remain after stress test
        tmp_files = list(self.root.glob("*.tmp")) + list(self.root.glob(".*.tmp"))
        self.assertEqual(tmp_files, [], f"Temporary files left behind: {tmp_files}")

    def test_failed_write_leaves_old_file_intact_and_no_tmp_file(self):
        target_file = self.root / "stable.json"
        original_data = {"status": "good", "number": 42}
        atomic_write_json(target_file, original_data)

        # Attempt to write non-serializable object
        with self.assertRaises(TypeError):
            atomic_write_json(target_file, {"invalid": object()})

        # Old file intact
        with open(target_file, "r", encoding="utf-8") as f:
            current_data = json.load(f)
        self.assertEqual(current_data, original_data)

        # No .tmp files left behind
        tmp_files = list(self.root.glob("*.tmp")) + list(self.root.glob(".*.tmp"))
        self.assertEqual(tmp_files, [])

    def test_permission_error_retries_and_raises_after_10_attempts(self):
        target_file = self.root / "retry.json"
        atomic_write_json(target_file, {"initial": True})

        attempts = [0]
        def mock_replace(src, dst):
            attempts[0] += 1
            raise PermissionError("Access denied")

        with patch("os.replace", side_effect=mock_replace):
            with self.assertRaises(PermissionError):
                atomic_write_json(target_file, {"updated": True})

        self.assertEqual(attempts[0], 10)
        # Temp file was cleaned up
        tmp_files = list(self.root.glob("*.tmp")) + list(self.root.glob(".*.tmp"))
        self.assertEqual(tmp_files, [])

    def test_non_permission_error_is_raised_immediately_without_retry(self):
        target_file = self.root / "os_error.json"
        atomic_write_json(target_file, {"initial": True})

        attempts = [0]
        def mock_replace(src, dst):
            attempts[0] += 1
            raise OSError("Disk failure")

        with patch("os.replace", side_effect=mock_replace):
            with self.assertRaises(OSError):
                atomic_write_json(target_file, {"updated": True})

        self.assertEqual(attempts[0], 1)
        tmp_files = list(self.root.glob("*.tmp")) + list(self.root.glob(".*.tmp"))
        self.assertEqual(tmp_files, [])


if __name__ == "__main__":
    unittest.main()
