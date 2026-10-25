"""Shared concurrency locks for background operations across CogniConnect."""
import threading

# Shared lock to ensure face rescan and demo reset never overlap
rescan_reset_lock = threading.Lock()
