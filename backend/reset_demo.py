"""Restore the shared demo patient's files and revoke demo sessions."""
import os
import shutil
from pathlib import Path

import db
from patient_storage import initialize_patient


def reset():
    connection = db.connect(os.getenv('AUTH_DATABASE'))
    row = connection.execute('SELECT id FROM patients WHERE is_demo=1 ORDER BY created_at LIMIT 1').fetchone()
    if not row:
        return False
    root = Path(os.getenv('PATIENT_DATA_ROOT', Path(__file__).with_name('data'))).resolve() / row[0]
    if root.exists():
        shutil.rmtree(root)
    initialize_patient(root, 'Demo Patient')
    sample = Path(__file__).with_name('sample_data')
    for item in sample.iterdir():
        if item.is_dir():
            shutil.copytree(item, root / item.name, dirs_exist_ok=True)
        elif item.is_file():
            shutil.copy2(item, root / item.name)
    connection.execute('DELETE FROM sessions WHERE patient_id=? OR user_id IN (SELECT id FROM users WHERE is_demo=1)', (row[0],))
    connection.execute('DELETE FROM trusted_devices WHERE user_id IN (SELECT id FROM users WHERE is_demo=1)')
    connection.close()
    return True


if __name__ == '__main__':
    raise SystemExit(0 if reset() else 1)
