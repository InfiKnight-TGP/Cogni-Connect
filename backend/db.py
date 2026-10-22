"""Database access layer for authentication, patient profiles, pairing, and sessions.

SQLite-only layer designed for a mechanical migration to PostgreSQL / Supabase:
- Parameterized queries with centralized placeholder mapping
- WAL journal mode, 5-second busy timeout, foreign keys enabled
- Exposes connect, execute, fetchone, fetchall, and transaction helper
"""
from contextlib import contextmanager
import os
from pathlib import Path
import sqlite3
import threading
import time
from typing import Any, Mapping, Optional, Sequence, Union

try:
    from flask import current_app, g, has_app_context
except ImportError:  # pragma: no cover
    def has_app_context() -> bool:
        return False
    g = None
    current_app = None

# Database error types re-exported so callers never import sqlite3 directly
DatabaseError = sqlite3.DatabaseError
Error = sqlite3.Error
IntegrityError = sqlite3.IntegrityError
OperationalError = sqlite3.OperationalError

# Placeholder constant for parameterized queries: keeps placeholders centralized in db.py
PLACEHOLDER = '?'

_local = threading.local()
_SCHEMA_PATH = Path(__file__).resolve().parent / 'schema.sql'
DEFAULT_DB_FILE = Path(__file__).resolve().parent / 'auth.db'
CURRENT_SCHEMA_VERSION = 1


def resolve_database_path(database: Optional[Union[str, Path]] = None) -> str:
    """Resolve database path from argument, Flask app config, env, or default."""
    if database:
        return str(database)
    if has_app_context() and current_app and 'AUTH_DATABASE' in current_app.config:
        return str(current_app.config['AUTH_DATABASE'])
    try:
        from app import api
        if api and 'AUTH_DATABASE' in api.config:
            return str(api.config['AUTH_DATABASE'])
    except Exception:
        pass
    env_db = os.getenv('AUTH_DATABASE')
    if env_db:
        return env_db
    return str(DEFAULT_DB_FILE)


def ensure_schema(conn: sqlite3.Connection) -> None:
    """Ensure schema tables and schema_version exist on startup."""
    cursor = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_version'"
    )
    if not cursor.fetchone():
        if _SCHEMA_PATH.exists():
            schema_sql = _SCHEMA_PATH.read_text(encoding='utf-8')
            conn.executescript(schema_sql)
            now_ts = int(time.time())
            conn.execute(
                f"INSERT INTO schema_version (version, applied_at) VALUES (?, ?) "
                f"ON CONFLICT(version) DO UPDATE SET applied_at=excluded.applied_at",
                (CURRENT_SCHEMA_VERSION, now_ts),
            )
        else:
            raise FileNotFoundError(f"Schema file not found at {_SCHEMA_PATH}")
    # Keep newly added auth tables available for databases created by older versions.
    conn.execute("""CREATE TABLE IF NOT EXISTS pairing_attempts (
        scope TEXT NOT NULL,
        key TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (scope, key)
    )""")


def connect(database: Optional[Union[str, Path]] = None) -> sqlite3.Connection:
    """Open a new database connection with WAL mode, foreign keys, and 5s timeout."""
    db_path = resolve_database_path(database)
    path_obj = Path(db_path)
    if path_obj.parent:
        path_obj.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=5.0, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    conn.execute("PRAGMA busy_timeout=5000;")
    ensure_schema(conn)
    return conn


def get_connection(database: Optional[Union[str, Path]] = None) -> sqlite3.Connection:
    """Get or reuse the active connection for the current Flask request or thread."""
    target_path = resolve_database_path(database)
    if has_app_context() and g is not None:
        conn = getattr(g, '_db_connection', None)
        stored_path = getattr(g, '_db_path', None)
        if conn is None or stored_path != target_path:
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass
            conn = connect(target_path)
            g._db_connection = conn
            g._db_path = target_path
        return conn

    conn = getattr(_local, 'conn', None)
    stored_path = getattr(_local, 'path', None)
    if conn is None or stored_path != target_path:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
        conn = connect(target_path)
        _local.conn = conn
        _local.path = target_path
    return conn


def close_connection(conn: Optional[sqlite3.Connection] = None) -> None:
    """Close the active connection."""
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass
        return
    if has_app_context() and g is not None:
        connection = getattr(g, '_db_connection', None)
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass
            g._db_connection = None
            g._db_path = None
    else:
        if hasattr(_local, 'conn') and _local.conn is not None:
            try:
                _local.conn.close()
            except Exception:
                pass
            _local.conn = None
            _local.path = None


def init_db(app: Optional[Any] = None, database: Optional[Union[str, Path]] = None) -> sqlite3.Connection:
    """Initialize database tables and register teardown handler if app is provided."""
    target_path = resolve_database_path(database)
    conn = connect(target_path)
    if app is not None:
        app.config.setdefault('AUTH_DATABASE', target_path)
        if not getattr(app, '_db_teardown_registered', False):
            @app.teardown_appcontext
            def _teardown_db(_exc=None):
                close_connection()
            app._db_teardown_registered = True
    return conn


def _validate_params(params: Any) -> Union[Sequence[Any], Mapping[str, Any]]:
    """Ensure parameters are passed as a sequence or mapping."""
    if params is None:
        return ()
    if isinstance(params, (tuple, list, dict)):
        return params
    return (params,)


def _prepare_query(query: str) -> str:
    """Central hook for translating query syntax when moving to Postgres."""
    # Placeholders are kept parameterized and can be mapped from '?' to '%s' here.
    return query


def execute(
    query: str,
    params: Union[Sequence[Any], Mapping[str, Any]] = (),
    conn: Optional[sqlite3.Connection] = None,
) -> sqlite3.Cursor:
    """Execute a parameterized query and return the cursor."""
    connection = conn or get_connection()
    prepared_query = _prepare_query(query)
    validated_params = _validate_params(params)
    return connection.execute(prepared_query, validated_params)


def fetchone(
    query: str,
    params: Union[Sequence[Any], Mapping[str, Any]] = (),
    conn: Optional[sqlite3.Connection] = None,
) -> Optional[sqlite3.Row]:
    """Execute a parameterized query and return the first row or None."""
    cursor = execute(query, params, conn=conn)
    return cursor.fetchone()


def fetchall(
    query: str,
    params: Union[Sequence[Any], Mapping[str, Any]] = (),
    conn: Optional[sqlite3.Connection] = None,
) -> list[sqlite3.Row]:
    """Execute a parameterized query and return all matching rows."""
    cursor = execute(query, params, conn=conn)
    return cursor.fetchall()


def executemany(
    query: str,
    seq_of_params: Sequence[Union[Sequence[Any], Mapping[str, Any]]],
    conn: Optional[sqlite3.Connection] = None,
) -> sqlite3.Cursor:
    """Execute a parameterized query against a sequence of parameter sets."""
    connection = conn or get_connection()
    prepared_query = _prepare_query(query)
    return connection.executemany(prepared_query, seq_of_params)


@contextmanager
def transaction(conn: Optional[sqlite3.Connection] = None):
    """Context manager for executing an atomic transaction with BEGIN IMMEDIATE."""
    connection = conn or get_connection()
    nested = getattr(connection, 'in_transaction', False)
    if not nested:
        connection.execute("BEGIN IMMEDIATE")
    try:
        yield connection
        if not nested:
            connection.commit()
    except Exception:
        if not nested:
            connection.rollback()
        raise
