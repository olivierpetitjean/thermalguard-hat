import importlib.util
import sqlite3
from pathlib import Path


WIZARD_PATH = Path(__file__).resolve().parents[2] / "setup" / "wizard.py"
WIZARD_SPEC = importlib.util.spec_from_file_location("thermalguard_setup_wizard", WIZARD_PATH)
wizard = importlib.util.module_from_spec(WIZARD_SPEC)
assert WIZARD_SPEC.loader is not None
WIZARD_SPEC.loader.exec_module(wizard)


def test_apply_global_settings_defaults_should_update_disable_fan_alerts_flag(tmp_path):
    db_path = tmp_path / "thermalguard.db"
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        CREATE TABLE GlobalSettings (
            Id TEXT PRIMARY KEY,
            DisableFanAlerts INTEGER NOT NULL DEFAULT 0,
            LastUpdated TEXT
        )
        """
    )
    connection.execute(
        "INSERT INTO GlobalSettings (Id, DisableFanAlerts, LastUpdated) VALUES (?, ?, ?)",
        ("settings", 0, "2026-01-01T00:00:00"),
    )
    connection.commit()
    connection.close()

    shared_settings = {
        "ConnectionStrings": {
            "WebApiDatabase": f"Data Source={db_path}",
        },
        "GlobalSettingsDefaults": {
            "DisableFanAlerts": True,
        },
    }

    result = wizard.apply_global_settings_defaults(shared_settings, str(tmp_path))

    verification = sqlite3.connect(db_path)
    row = verification.execute("SELECT DisableFanAlerts FROM GlobalSettings").fetchone()
    verification.close()

    assert result is True
    assert row[0] == 1
