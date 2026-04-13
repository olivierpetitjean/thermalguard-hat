import sqlite3
import uuid
import time
from datetime import datetime
from utils import debug_print, Verbose


class Database:
    def __init__(self, settings):
        self._db_path = settings['dbPath']
        self._conn = None

    def connect(self):
        self._conn = sqlite3.connect(self._db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        debug_print(f"Database connected: {self._db_path}", Verbose.INFO)

    def get_conditions(self):
        cur = self._conn.cursor()
        cur.execute("SELECT * FROM Conditions ORDER BY MinTemp1 DESC, MinTemp2 DESC")
        conditions = cur.fetchall()
        debug_print(f"Conditions: {conditions}", Verbose.DEBUG)
        return conditions

    def begin_transaction(self):
        try:
            self._conn.execute("begin")
            return True
        except Exception as ex:
            debug_print(f"Unable to begin transaction: {ex}", Verbose.ERROR)
            return False

    def try_commit_transaction(self):
        try:
            self._conn.execute("commit")
            debug_print("Transaction committed", Verbose.DEBUG)
        except Exception as err:
            debug_print(f"Commit failed: {err}", Verbose.ERROR)
            self._conn.execute("rollback")

    def write_record(self, name, value):
        sql = "INSERT INTO HistoryRaw (Id, Ts, Name, Value) VALUES (?, ?, ?, ?)"
        cursor = self._conn.cursor()
        cursor.execute(sql, (str(uuid.uuid4()), int(time.time()), name, value))
        debug_print(f"{cursor.rowcount} record inserted", Verbose.DEBUG)

    def read_global_settings(self):
        cursor = self._conn.cursor()
        cursor.execute("SELECT * FROM GlobalSettings")
        return cursor.fetchall()[0]

    def write_global_settings(self, data):
        cursor = self._conn.cursor()
        cursor.execute(
            "UPDATE GlobalSettings SET Auto = ?, Fan1Pwr = ?, Fan2Pwr = ?, LastUpdated = ?",
            (data['Auto'], data['Fan1Pwr'], data['Fan2Pwr'], datetime.now())
        )
        debug_print("Global settings saved.", Verbose.INFO)

    def write_beep_preference(self, value):
        cursor = self._conn.cursor()
        cursor.execute(
            "UPDATE GlobalSettings SET Beep = ?, LastUpdated = ?",
            (int(value), datetime.now())
        )
        debug_print("Beep preference saved.", Verbose.INFO)

    def write_max_references(self, value1, value2):
        cursor = self._conn.cursor()
        cursor.execute(
            "UPDATE MaxReferences SET Date = ?, Value1 = ?, Value2 = ?",
            (datetime.now(), value1, value2)
        )
        debug_print("Max references saved.", Verbose.INFO)

    def close(self):
        if self._conn:
            self._conn.close()
            debug_print("Database closed.", Verbose.INFO)
