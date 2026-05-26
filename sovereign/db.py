import sqlite3
from pathlib import Path


DB_PATH = Path("data/sovereign.db")


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(DB_PATH)


def init_db():
    with get_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
        CREATE TABLE IF NOT EXISTS vendors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            category TEXT,
            service_area TEXT,
            website TEXT,
            phone TEXT,
            email TEXT,
            emergency_available INTEGER DEFAULT 0,
            license_status TEXT,
            insurance_expiration TEXT,
            notes TEXT
        )
        """
        )

        cursor.execute(
            """
        CREATE TABLE IF NOT EXISTS estates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            estate_name TEXT NOT NULL,
            city TEXT,
            property_type TEXT,
            estate_manager TEXT,
            emergency_contact TEXT,
            notes TEXT
        )
        """
        )

        cursor.execute(
            """
        CREATE TABLE IF NOT EXISTS homewatch_properties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            property_name TEXT NOT NULL,
            city TEXT,
            owner_contact TEXT,
            inspection_frequency TEXT,
            hurricane_ready INTEGER DEFAULT 0,
            notes TEXT
        )
        """
        )

        conn.commit()
