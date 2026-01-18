from __future__ import annotations

import re
from typing import Any, Dict, Tuple
from urllib.parse import parse_qs, urlparse

URL_REGEX = re.compile(r"^(https?://|www\.)", re.IGNORECASE)
WIFI_REGEX = re.compile(r"^WIFI:(?P<fields>.+);;$", re.IGNORECASE)
VCARD_REGEX = re.compile(r"BEGIN:VCARD", re.IGNORECASE)


def normalize_url(text: str) -> str | None:
    candidate = text.strip()
    if URL_REGEX.match(candidate):
        if candidate.lower().startswith("www."):
            candidate = f"https://{candidate}"
        return candidate
    parsed = urlparse(candidate)
    if parsed.scheme and parsed.netloc:
        return candidate
    if "." in candidate and " " not in candidate:
        return f"https://{candidate}"
    return None


def parse_wifi(text: str) -> Dict[str, Any] | None:
    match = WIFI_REGEX.match(text.strip())
    if not match:
        return None
    fields = match.group("fields").split(";")
    info: Dict[str, Any] = {}
    for field in fields:
        if not field or ":" not in field:
            continue
        key, value = field.split(":", 1)
        info[key.upper()] = value
    if not info:
        return None
    return {
        "ssid": info.get("S"),
        "password": info.get("P"),
        "auth_type": info.get("T"),
        "hidden": info.get("H") == "true",
    }


def parse_geo(text: str) -> Dict[str, Any] | None:
    if not text.lower().startswith("geo:"):
        return None
    payload = text[4:]
    if "?" in payload:
        coords, query = payload.split("?", 1)
    else:
        coords, query = payload, ""
    if "," not in coords:
        return None
    lat_str, lon_str = coords.split(",", 1)
    try:
        lat = float(lat_str)
        lon = float(lon_str)
    except ValueError:
        return None
    info: Dict[str, Any] = {"lat": lat, "lon": lon}
    if query:
        info["query"] = parse_qs(query).get("q", [""])[0]
    return info


def parse_vcard(text: str) -> Dict[str, Any] | None:
    if not VCARD_REGEX.search(text):
        return None
    info: Dict[str, Any] = {}
    for line in text.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().upper()
        value = value.strip()
        if key == "FN":
            info["full_name"] = value
        elif key.startswith("TEL"):
            info.setdefault("phones", []).append(value)
        elif key.startswith("EMAIL"):
            info.setdefault("emails", []).append(value)
        elif key == "ORG":
            info["organization"] = value
    return info or None


def parse_qr_text(text: str) -> Tuple[str, Dict[str, Any]]:
    url = normalize_url(text)
    if url:
        return "url", {"url": url}

    wifi = parse_wifi(text)
    if wifi:
        return "wifi", wifi

    geo = parse_geo(text)
    if geo:
        return "geo", geo

    vcard = parse_vcard(text)
    if vcard:
        return "vcard", vcard

    return "text", {"text": text}
