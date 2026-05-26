import re

import requests
from bs4 import BeautifulSoup


KEYWORDS = {
    "phone": r"\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}",
    "email": r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
    "quote_cta": r"quote|estimate|book|schedule|contact",
    "emergency": r"24/7|emergency|same day|urgent",
    "trust": r"licensed|insured|testimonial|review|guarantee|certified",
}


def audit_website(url):
    if not url:
        return {"error": "No URL provided"}

    try:
        response = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()
    except Exception as e:
        return {"error": str(e)}

    soup = BeautifulSoup(response.text, "html.parser")
    text = soup.get_text(" ", strip=True).lower()

    results = {}
    score = 0

    for name, pattern in KEYWORDS.items():
        found = bool(re.search(pattern, text, re.IGNORECASE))
        results[name] = found
        if found:
            score += 20

    results["score"] = score
    return results
