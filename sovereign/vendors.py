import pandas as pd

from sovereign.db import get_connection


def add_vendor(
    company_name,
    category,
    service_area,
    website,
    phone,
    email,
    emergency_available,
    license_status,
    insurance_expiration,
    notes,
):
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO vendors (
                company_name, category, service_area, website, phone, email,
                emergency_available, license_status, insurance_expiration, notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                company_name,
                category,
                service_area,
                website,
                phone,
                email,
                int(emergency_available),
                license_status,
                insurance_expiration,
                notes,
            ),
        )
        conn.commit()


def list_vendors():
    with get_connection() as conn:
        return pd.read_sql_query("SELECT * FROM vendors ORDER BY id DESC", conn)
