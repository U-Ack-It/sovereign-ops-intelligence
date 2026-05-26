import pandas as pd

from sovereign.db import get_connection


def add_homewatch_inspection(
    property_name,
    inspector,
    inspection_date,
    overall_status,
    failed_items,
    notes,
):
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO homewatch_inspections (
                property_name, inspector, inspection_date, overall_status, failed_items, notes
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                property_name,
                inspector,
                inspection_date,
                overall_status,
                ", ".join(failed_items),
                notes,
            ),
        )
        conn.commit()


def list_homewatch_inspections():
    with get_connection() as conn:
        return pd.read_sql_query(
            "SELECT * FROM homewatch_inspections ORDER BY id DESC",
            conn,
        )
