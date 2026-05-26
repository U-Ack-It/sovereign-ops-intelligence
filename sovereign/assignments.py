import pandas as pd

from sovereign.db import get_connection


def assign_vendor_to_estate(estate_id, vendor_id, role, notes):
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO estate_vendors (estate_id, vendor_id, role, notes)
            VALUES (?, ?, ?, ?)
            """,
            (estate_id, vendor_id, role, notes),
        )
        conn.commit()


def list_estate_vendor_assignments():
    with get_connection() as conn:
        return pd.read_sql_query(
            """
            SELECT
                ev.id,
                e.estate_name,
                v.company_name,
                v.category,
                ev.role,
                ev.notes
            FROM estate_vendors ev
            JOIN estates e ON ev.estate_id = e.id
            JOIN vendors v ON ev.vendor_id = v.id
            ORDER BY ev.id DESC
            """,
            conn,
        )
