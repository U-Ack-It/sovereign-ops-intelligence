import pandas as pd

from sovereign.db import get_connection


def add_estate(estate_name, city, property_type, estate_manager, emergency_contact, notes):
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO estates (
                estate_name, city, property_type, estate_manager, emergency_contact, notes
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (estate_name, city, property_type, estate_manager, emergency_contact, notes),
        )
        conn.commit()


def list_estates():
    with get_connection() as conn:
        return pd.read_sql_query("SELECT * FROM estates ORDER BY id DESC", conn)
