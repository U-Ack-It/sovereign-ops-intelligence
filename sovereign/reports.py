from datetime import datetime

from jinja2 import Environment, select_autoescape

from sovereign.inspections import list_homewatch_inspections
from sovereign.risk import calculate_homewatch_risk


HTML_TEMPLATE = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>HomeWatch Report - {{ property_name }}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #111; }
    h1 { margin-bottom: 0; }
    .small { color: #666; font-size: 13px; }
    .box { border: 1px solid #ddd; padding: 16px; margin: 16px 0; border-radius: 8px; }
    .critical { color: #b00020; font-weight: bold; }
    .elevated { color: #b86b00; font-weight: bold; }
    .normal { color: #0f7b0f; font-weight: bold; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  </style>
</head>
<body>
  <h1>HomeWatch Owner Report</h1>
  <p class="small">Generated: {{ generated_at }}</p>

  <div class="box">
    <h2>{{ property_name }}</h2>
    <p><strong>City:</strong> {{ risk.city }}</p>
    <p><strong>Inspection Frequency:</strong> {{ risk.inspection_frequency }}</p>
    <p><strong>Risk Score:</strong> {{ risk.risk_score }}</p>
    <p><strong>Risk Level:</strong>
      <span class="{{ risk.risk_level | lower }}">{{ risk.risk_level }}</span>
    </p>
    <p><strong>Risk Reasons:</strong> {{ risk.risk_reasons }}</p>
  </div>

  <div class="box">
    <h2>Latest Inspection</h2>
    <p><strong>Status:</strong> {{ latest.overall_status }}</p>
    <p><strong>Date:</strong> {{ latest.inspection_date }}</p>
    <p><strong>Inspector:</strong> {{ latest.inspector }}</p>
    <p><strong>Failed Items:</strong> {{ latest.failed_items }}</p>
    <p><strong>Notes:</strong> {{ latest.notes }}</p>
  </div>

  <h2>Recent Inspection History</h2>
  <table>
    <tr>
      <th>Date</th>
      <th>Status</th>
      <th>Failed Items</th>
      <th>Notes</th>
    </tr>
    {% for row in history %}
    <tr>
      <td>{{ row.inspection_date }}</td>
      <td>{{ row.overall_status }}</td>
      <td>{{ row.failed_items }}</td>
      <td>{{ row.notes }}</td>
    </tr>
    {% endfor %}
  </table>
</body>
</html>
"""


def build_homewatch_report(property_name):
    risk_df = calculate_homewatch_risk()
    inspections_df = list_homewatch_inspections()

    risk = {
        "city": "",
        "inspection_frequency": "",
        "risk_score": 0,
        "risk_level": "Normal",
        "risk_reasons": "No data",
    }

    if not risk_df.empty:
        match = risk_df[risk_df["property_name"] == property_name]
        if not match.empty:
            risk = match.iloc[0].fillna("").to_dict()

    latest = {
        "overall_status": "No inspection",
        "inspection_date": "",
        "inspector": "",
        "failed_items": "",
        "notes": "",
    }

    history = []

    if not inspections_df.empty:
        property_rows = inspections_df[inspections_df["property_name"] == property_name]
        if not property_rows.empty:
            latest = property_rows.iloc[0].fillna("").to_dict()
            history = property_rows.head(10).fillna("").to_dict("records")

    env = Environment(autoescape=select_autoescape(["html", "xml"]))
    template = env.from_string(HTML_TEMPLATE)

    return template.render(
        property_name=property_name,
        generated_at=datetime.now().strftime("%Y-%m-%d %H:%M"),
        risk=risk,
        latest=latest,
        history=history,
    )
