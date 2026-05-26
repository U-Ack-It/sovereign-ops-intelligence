import sqlite3
from pathlib import Path


DB_PATH = Path("data/sovereign.db")


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


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
            notes TEXT,
            website_audit_score INTEGER DEFAULT 0,
            last_audit_summary TEXT
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

        cursor.execute(
            """
        CREATE TABLE IF NOT EXISTS estate_vendors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            estate_id INTEGER NOT NULL,
            vendor_id INTEGER NOT NULL,
            role TEXT,
            notes TEXT,
            FOREIGN KEY (estate_id) REFERENCES estates(id),
            FOREIGN KEY (vendor_id) REFERENCES vendors(id)
        )
        """
        )

        # Safe migration for existing databases.
        for column_sql in [
            "ALTER TABLE vendors ADD COLUMN website_audit_score INTEGER DEFAULT 0",
            "ALTER TABLE vendors ADD COLUMN last_audit_summary TEXT",
        ]:
            try:
                cursor.execute(column_sql)
            except sqlite3.OperationalError:
                pass

        conn.commit()
