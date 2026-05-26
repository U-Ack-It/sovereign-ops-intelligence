import pandas as pd

from sovereign.db import get_connection


def _failed_count(value):
    if pd.isna(value) or not str(value).strip():
        return 0
    return len([x for x in str(value).split(",") if x.strip()])


def calculate_homewatch_risk():
    with get_connection() as conn:
        properties = pd.read_sql_query(
            "SELECT * FROM homewatch_properties ORDER BY id DESC",
            conn,
        )

        inspections = pd.read_sql_query(
            "SELECT * FROM homewatch_inspections ORDER BY created_at DESC, id DESC",
            conn,
        )

    if properties.empty:
        return pd.DataFrame()

    if inspections.empty:
        properties["overall_status"] = "No Inspection"
        properties["failed_items"] = ""
    else:
        latest = inspections.drop_duplicates(subset=["property_name"], keep="first")
        properties = properties.merge(
            latest[["property_name", "overall_status", "failed_items"]],
            on="property_name",
            how="left",
        )

    rows = []

    for _, row in properties.iterrows():
        score = 0
        reasons = []

        if int(row.get("hurricane_ready", 0)) == 0:
            score += 30
            reasons.append("Not hurricane ready")

        status = row.get("overall_status")

        if pd.isna(status):
            score += 10
            status = "No Inspection"
            reasons.append("No inspection yet")
        elif status == "Needs Attention":
            score += 20
            reasons.append("Inspection needs attention")
        elif status == "Critical":
            score += 40
            reasons.append("Critical inspection")

        failed_items = row.get("failed_items", "")
        failures = _failed_count(failed_items)

        if failures:
            score += min(failures * 5, 30)
            reasons.append(f"{failures} failed checklist item(s)")

        if score >= 70:
            level = "Critical"
        elif score >= 40:
            level = "Elevated"
        else:
            level = "Normal"

        rows.append(
            {
                "property_name": row.get("property_name"),
                "city": row.get("city"),
                "inspection_frequency": row.get("inspection_frequency"),
                "overall_status": status,
                "failed_items": failed_items,
                "risk_score": score,
                "risk_level": level,
                "risk_reasons": "; ".join(reasons) if reasons else "No major risk",
            }
        )

    return pd.DataFrame(rows).sort_values("risk_score", ascending=False)
