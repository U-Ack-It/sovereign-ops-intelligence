import pandas as pd

from sovereign.db import get_connection


def add_incident(
    property_type,
    property_name,
    incident_type,
    severity,
    status,
    reported_by,
    notes,
):
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO incidents (
                property_type, property_name, incident_type, severity, status, reported_by, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                property_type,
                property_name,
                incident_type,
                severity,
                status,
                reported_by,
                notes,
            ),
        )
        conn.commit()


def list_incidents():
    with get_connection() as conn:
        return pd.read_sql_query("SELECT * FROM incidents ORDER BY id DESC", conn)
