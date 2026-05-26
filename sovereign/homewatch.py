import pandas as pd

from sovereign.db import get_connection


def add_homewatch_property(
    property_name,
    city,
    owner_contact,
    inspection_frequency,
    hurricane_ready,
    notes,
):
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO homewatch_properties (
                property_name, city, owner_contact, inspection_frequency, hurricane_ready, notes
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                property_name,
                city,
                owner_contact,
                inspection_frequency,
                int(hurricane_ready),
                notes,
            ),
        )
        conn.commit()


def list_homewatch_properties():
    with get_connection() as conn:
        return pd.read_sql_query(
            "SELECT * FROM homewatch_properties ORDER BY id DESC",
            conn,
        )
