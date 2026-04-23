import sqlite3

import database as database_module
from database import Database


def create_database(tmp_path):
    db_path = tmp_path / "thermalguard-tests.db"
    settings = {"dbPath": str(db_path)}
    database = Database(settings)
    database.connect()

    database._conn.executescript(
        """
        CREATE TABLE Conditions (
            Id TEXT PRIMARY KEY,
            MinTemp1 NUMERIC NOT NULL,
            MinTemp2 NUMERIC NOT NULL,
            Value1 INTEGER NOT NULL,
            Value2 INTEGER NOT NULL
        );

        CREATE TABLE GlobalSettings (
            Id TEXT PRIMARY KEY,
            Auto INTEGER NOT NULL,
            LinkedMode INTEGER NOT NULL,
            ControlMode TEXT NOT NULL,
            LinkedSensor TEXT NOT NULL,
            DifferentialMode TEXT NOT NULL,
            Fan1Pwr INTEGER NOT NULL,
            Fan2Pwr INTEGER NOT NULL,
            Beep INTEGER NOT NULL,
            LastUpdated TEXT
        );

        CREATE TABLE MaxReferences (
            Id TEXT PRIMARY KEY,
            Date TEXT,
            Value1 NUMERIC NOT NULL,
            Value2 NUMERIC NOT NULL
        );

        CREATE TABLE HistoryRaw (
            Id TEXT PRIMARY KEY,
            Ts INTEGER NOT NULL,
            Name TEXT NOT NULL,
            Value NUMERIC NOT NULL
        );
        """
    )

    database._conn.execute(
        """
        INSERT INTO GlobalSettings (
            Id, Auto, LinkedMode, ControlMode, LinkedSensor, DifferentialMode, Fan1Pwr, Fan2Pwr, Beep, LastUpdated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("settings", 1, 1, "linked_fans", "sensor1", "sensor1_minus_sensor2", 15, 15, 1, "2026-01-01T00:00:00"),
    )
    database._conn.execute(
        "INSERT INTO MaxReferences (Id, Date, Value1, Value2) VALUES (?, ?, ?, ?)",
        ("maxrefs", "2026-01-01T00:00:00", 2080, 2080),
    )
    database._conn.executemany(
        "INSERT INTO Conditions (Id, MinTemp1, MinTemp2, Value1, Value2) VALUES (?, ?, ?, ?, ?)",
        [
            ("c1", 20, 20, 30, 30),
            ("c2", 40, 40, 90, 90),
            ("c3", 30, 30, 60, 60),
        ],
    )
    database._conn.commit()
    return database


def test_get_conditions_should_return_rows_sorted_by_highest_temperature_first(tmp_path):
    database = create_database(tmp_path)

    result = database.get_conditions()

    assert [row["MinTemp1"] for row in result] == [40, 30, 20]
    database.close()


def test_read_global_settings_should_return_first_row(tmp_path):
    database = create_database(tmp_path)

    result = database.read_global_settings()

    assert result["Auto"] == 1
    assert result["Fan1Pwr"] == 15
    assert result["Fan2Pwr"] == 15
    database.close()


def test_write_global_settings_should_update_manual_mode_values(tmp_path):
    database = create_database(tmp_path)

    started = database.begin_transaction()
    database.write_global_settings({"Auto": False, "Fan1Pwr": 35, "Fan2Pwr": 55})
    database.try_commit_transaction()

    row = database.read_global_settings()
    assert started is True
    assert row["Auto"] == 0
    assert row["Fan1Pwr"] == 35
    assert row["Fan2Pwr"] == 55
    database.close()


def test_write_beep_preference_should_persist_boolean_as_integer(tmp_path):
    database = create_database(tmp_path)

    database.begin_transaction()
    database.write_beep_preference(False)
    database.try_commit_transaction()

    row = database.read_global_settings()
    assert row["Beep"] == 0
    database.close()


def test_write_max_references_should_update_existing_row(tmp_path):
    database = create_database(tmp_path)

    database.begin_transaction()
    database.write_max_references(2500, 2600)
    database.try_commit_transaction()

    row = database._conn.execute("SELECT Value1, Value2 FROM MaxReferences").fetchone()
    assert row["Value1"] == 2500
    assert row["Value2"] == 2600
    database.close()


def test_write_record_should_insert_history_sample(tmp_path, monkeypatch):
    database = create_database(tmp_path)
    monkeypatch.setattr(database_module.time, "time", lambda: 1234567890)

    database.begin_transaction()
    database.write_record("Sensor1", 42.5)
    database.try_commit_transaction()

    row = database._conn.execute("SELECT Ts, Name, Value FROM HistoryRaw").fetchone()
    assert row["Ts"] == 1234567890
    assert row["Name"] == "Sensor1"
    assert row["Value"] == 42.5
    database.close()


def test_begin_transaction_should_return_false_when_begin_fails(tmp_path, monkeypatch):
    database = create_database(tmp_path)

    class FailingConnection:
        def execute(self, _sql):
            raise sqlite3.OperationalError("cannot begin")

    database._conn = FailingConnection()

    result = database.begin_transaction()

    assert result is False
