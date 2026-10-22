import os
from pathlib import Path
import tempfile
import unittest

import db


class DBTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.temp_dir.name) / "test.db")
        self.conn = db.connect(self.db_path)

    def tearDown(self):
        try:
            self.conn.close()
        except Exception:
            pass
        db.close_connection()
        self.temp_dir.cleanup()

    def test_pragmas_and_schema_version(self):
        journal = self.conn.execute("PRAGMA journal_mode;").fetchone()[0]
        self.assertEqual(journal.lower(), "wal")
        foreign_keys = self.conn.execute("PRAGMA foreign_keys;").fetchone()[0]
        self.assertEqual(foreign_keys, 1)
        busy_timeout = self.conn.execute("PRAGMA busy_timeout;").fetchone()[0]
        self.assertEqual(busy_timeout, 5000)

        version_row = db.fetchone("SELECT version, applied_at FROM schema_version WHERE version = ?", (1,), conn=self.conn)
        self.assertIsNotNone(version_row)
        self.assertEqual(version_row["version"], 1)
        self.assertGreater(version_row["applied_at"], 0)

    def test_execute_fetchone_fetchall(self):
        db.execute(
            "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
            ("user-1", "test@example.com", "Test User", "hash123", 1000),
            conn=self.conn,
        )
        row = db.fetchone("SELECT * FROM users WHERE id = ?", ("user-1",), conn=self.conn)
        self.assertIsNotNone(row)
        self.assertEqual(row["email"], "test@example.com")
        self.assertEqual(row["name"], "Test User")

        rows = db.fetchall("SELECT * FROM users", conn=self.conn)
        self.assertEqual(len(rows), 1)

    def test_transaction_commit_and_rollback(self):
        with db.transaction(conn=self.conn):
            db.execute(
                "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                ("user-tx", "tx@example.com", "Tx User", "hash123", 1000),
                conn=self.conn,
            )
        row = db.fetchone("SELECT * FROM users WHERE id = ?", ("user-tx",), conn=self.conn)
        self.assertIsNotNone(row)

        with self.assertRaises(ValueError):
            with db.transaction(conn=self.conn):
                db.execute(
                    "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                    ("user-fail", "fail@example.com", "Fail User", "hash123", 1000),
                    conn=self.conn,
                )
                raise ValueError("Simulated failure")

        failed_row = db.fetchone("SELECT * FROM users WHERE id = ?", ("user-fail",), conn=self.conn)
        self.assertIsNone(failed_row)

    def test_upsert_on_conflict(self):
        db.execute(
            "INSERT INTO installation (key, value) VALUES (?, ?)",
            ("status", "initial"),
            conn=self.conn,
        )
        db.execute(
            "INSERT INTO installation (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            ("status", "updated"),
            conn=self.conn,
        )
        row = db.fetchone("SELECT value FROM installation WHERE key = ?", ("status",), conn=self.conn)
        self.assertEqual(row["value"], "updated")


if __name__ == "__main__":
    unittest.main()
