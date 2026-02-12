from __future__ import annotations

import re
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Tuple

from rapidfuzz import fuzz, process
from sqlmodel import Session, select

from app.models import Category, ItemCategoryMap
from app.seed_categories import CATEGORY_PATHS

AUTO_THRESHOLD = 90
SUGGEST_THRESHOLD = 75

ALIASES: List[Tuple[str, str]] = [
    (r"\bк[-–—]?са\b", "ковбаса"),
    (r"\bлав\b", "лаваш"),
    (r"\bнап\b", "напій"),
    (r"\bмар\.?\b", "мариновані"),
]

STOP_TOKENS = {
    "кг",
    "г",
    "гр",
    "л",
    "мл",
    "шт",
    "ваг",
    "пет",
    "жб",
    "сб",
    "тп",
}

RULES: List[Tuple[List[str], Tuple[str, ...]]] = [
    (["пиво"], ("покупки", "алкоголь", "пиво")),
    (["вино"], ("покупки", "алкоголь", "вино")),
    (["вода"], ("покупки", "напої", "вода")),
    (["сік", "нектар", "напій"], ("покупки", "напої", "сік")),
    (["йогурт", "молоко", "смет", "сир", "сирок"], ("покупки", "продукти", "молочні")),
    (["огірк", "томат", "помідор", "капуст", "моркв"], ("покупки", "продукти", "овочі")),
    (["виноград", "нектарин", "банан"], ("покупки", "продукти", "фрукти")),
    (["мариновані", "конс", "горошок конс"], ("покупки", "продукти", "консерви")),
    (["хліб", "лаваш", "хлібці"], ("покупки", "продукти", "хліб")),
    (["ковбас", "балик", "кур", "скумбр", "осел"], ("покупки", "продукти", "м'ясо та риба")),
    (["пакет"], ("покупки", "побут", "пакети")),
    (["серветк"], ("покупки", "побут", "серветки")),
    (["чіпси"], ("покупки", "снеки", "чіпси")),
    (["шоколад"], ("покупки", "продукти", "солодощі", "шоколад")),
    (["драже"], ("покупки", "продукти", "солодощі", "цукерки")),
    (["бісквіт"], ("покупки", "продукти", "солодощі", "печиво")),
]

ETALONS: List[Tuple[str, Tuple[str, ...]]] = [
    ("пиво", ("покупки", "алкоголь", "пиво")),
    ("вино", ("покупки", "алкоголь", "вино")),
    ("вода", ("покупки", "напої", "вода")),
    ("сік", ("покупки", "напої", "сік")),
    ("йогурт", ("покупки", "продукти", "молочні")),
    ("молоко", ("покупки", "продукти", "молочні")),
    ("сир", ("покупки", "продукти", "молочні")),
    ("огірок", ("покупки", "продукти", "овочі")),
    ("помідор", ("покупки", "продукти", "овочі")),
    ("капуста", ("покупки", "продукти", "овочі")),
    ("морква", ("покупки", "продукти", "овочі")),
    ("виноград", ("покупки", "продукти", "фрукти")),
    ("нектарин", ("покупки", "продукти", "фрукти")),
    ("пакет", ("покупки", "побут", "пакети")),
    ("серветки", ("покупки", "побут", "серветки")),
    ("чіпси", ("покупки", "снеки", "чіпси")),
    ("шоколад", ("покупки", "продукти", "солодощі", "шоколад")),
    ("лаваш", ("покупки", "продукти", "хліб")),
    ("ковбаса", ("покупки", "продукти", "м'ясо та риба")),
    ("мариновані огірки", ("покупки", "продукти", "консерви")),
]

OTHER_PATH = ("покупки", "інші", "інші")

CATEGORY_CACHE_TTL_SECONDS = 300
_CATEGORY_CACHE: Dict[str, object] = {"timestamp": 0.0, "path_to_id": None, "id_to_path": None}


@dataclass
class CategoryResult:
    key: str
    category_id: Optional[int]
    confidence: float
    method: str


@dataclass
class CategorizedItem:
    key: str
    category_path: List[str]
    confidence: float
    method: str


def normalize_item(value: str) -> str:
    if not value:
        return ""
    text = value.lower().strip()
    text = re.sub(r"^\d+#", "", text)
    text = re.sub(r"(?<=\D)(?=\d)|(?<=\d)(?=\D)", " ", text)
    text = re.sub(r"\bж/б\b", "жб", text)
    text = re.sub(r"\bс/б\b", "сб", text)
    text = re.sub(r"\bт/п\b", "тп", text)
    for pattern, replacement in ALIASES:
        text = re.sub(pattern, replacement, text)
    text = re.sub(r"[\./,_\-+%()\[\]{}:;|\\]", " ", text)
    text = re.sub(r"\b\d+[.,]?\d*\b", " ", text)

    tokens = [t for t in text.split() if t and t not in STOP_TOKENS]
    return " ".join(tokens)


def product_key(value: str) -> str:
    return normalize_item(value)


def build_category_maps(session: Session) -> Tuple[Dict[Tuple[str, ...], int], Dict[int, List[str]]]:
    cached_at = _CATEGORY_CACHE.get("timestamp", 0.0) or 0.0
    if time.time() - cached_at < CATEGORY_CACHE_TTL_SECONDS:
        cached_path_to_id = _CATEGORY_CACHE.get("path_to_id")
        cached_id_to_path = _CATEGORY_CACHE.get("id_to_path")
        if isinstance(cached_path_to_id, dict) and isinstance(cached_id_to_path, dict):
            return cached_path_to_id, cached_id_to_path

    rows = session.exec(select(Category)).all()
    by_id: Dict[int, Category] = {c.id: c for c in rows if c.id is not None}
    path_to_id: Dict[Tuple[str, ...], int] = {}
    id_to_path: Dict[int, List[str]] = {}

    for cat_id, cat in by_id.items():
        path: List[str] = []
        cursor: Optional[Category] = cat
        guard = 0
        while cursor is not None and guard < 50:
            path.append(cursor.name)
            guard += 1
            if cursor.parent_id is None:
                break
            cursor = by_id.get(cursor.parent_id)
        path = list(reversed(path))
        path_tuple = tuple(path)
        path_to_id[path_tuple] = cat_id
        id_to_path[cat_id] = path

    _CATEGORY_CACHE["timestamp"] = time.time()
    _CATEGORY_CACHE["path_to_id"] = path_to_id
    _CATEGORY_CACHE["id_to_path"] = id_to_path

    return path_to_id, id_to_path


def _find_rule_category(normalized: str) -> Optional[Tuple[str, ...]]:
    for keywords, path in RULES:
        for kw in keywords:
            if kw in normalized:
                return path
    return None


def _find_fuzzy_category(normalized: str) -> Tuple[Optional[Tuple[str, ...]], float]:
    if not normalized:
        return None, 0.0
    candidates = [term for term, _ in ETALONS]
    match = process.extractOne(normalized, candidates, scorer=fuzz.token_set_ratio)
    if not match:
        return None, 0.0
    term, score, _ = match
    for et_term, path in ETALONS:
        if et_term == term:
            return path, float(score)
    return None, float(score)


def get_or_predict_category(session: Session, raw_name: str) -> CategoryResult:
    key = product_key(raw_name)
    if not key:
        return CategoryResult(key=key, category_id=None, confidence=0.0, method="rule")

    existing = session.get(ItemCategoryMap, key)
    if existing:
        return CategoryResult(
            key=key,
            category_id=existing.category_id,
            confidence=existing.confidence,
            method=existing.method,
        )

    path_to_id, _ = build_category_maps(session)

    rule_path = _find_rule_category(key)
    if rule_path:
        category_id = path_to_id.get(rule_path)
        confidence = 1.0
        _cache_category(
            session=session,
            key=key,
            category_id=category_id,
            confidence=confidence,
            method="rule",
            example_name=raw_name,
        )
        return CategoryResult(key=key, category_id=category_id, confidence=confidence, method="rule")

    fuzzy_path, score = _find_fuzzy_category(key)
    confidence = round(score / 100.0, 2)
    if score >= SUGGEST_THRESHOLD and fuzzy_path:
        category_id = path_to_id.get(fuzzy_path)
    else:
        category_id = path_to_id.get(OTHER_PATH)

    if score >= AUTO_THRESHOLD and category_id is not None:
        _cache_category(
            session=session,
            key=key,
            category_id=category_id,
            confidence=confidence,
            method="fuzzy",
            example_name=raw_name,
        )
    return CategoryResult(key=key, category_id=category_id, confidence=confidence, method="fuzzy")


def get_or_predict_category_cached(
    session: Session,
    raw_name: str,
    path_to_id: Dict[Tuple[str, ...], int],
    commit: bool = True,
) -> CategoryResult:
    key = product_key(raw_name)
    if not key:
        return CategoryResult(key=key, category_id=None, confidence=0.0, method="rule")

    existing = session.get(ItemCategoryMap, key)
    if existing:
        return CategoryResult(
            key=key,
            category_id=existing.category_id,
            confidence=existing.confidence,
            method=existing.method,
        )

    rule_path = _find_rule_category(key)
    if rule_path:
        category_id = path_to_id.get(rule_path)
        confidence = 1.0
        _cache_category(
            session=session,
            key=key,
            category_id=category_id,
            confidence=confidence,
            method="rule",
            example_name=raw_name,
            commit=commit,
        )
        return CategoryResult(key=key, category_id=category_id, confidence=confidence, method="rule")

    fuzzy_path, score = _find_fuzzy_category(key)
    confidence = round(score / 100.0, 2)
    if score >= SUGGEST_THRESHOLD and fuzzy_path:
        category_id = path_to_id.get(fuzzy_path)
    else:
        category_id = path_to_id.get(OTHER_PATH)

    if score >= AUTO_THRESHOLD and category_id is not None:
        _cache_category(
            session=session,
            key=key,
            category_id=category_id,
            confidence=confidence,
            method="fuzzy",
            example_name=raw_name,
            commit=commit,
        )
    return CategoryResult(key=key, category_id=category_id, confidence=confidence, method="fuzzy")


def categorize_item_name(session: Session, raw_name: str) -> CategorizedItem:
    result = get_or_predict_category(session, raw_name)
    _, id_to_path = build_category_maps(session)
    path = id_to_path.get(result.category_id or -1, list(OTHER_PATH))
    return CategorizedItem(
        key=result.key,
        category_path=path,
        confidence=result.confidence,
        method=result.method,
    )


def _cache_category(
    session: Session,
    key: str,
    category_id: Optional[int],
    confidence: float,
    method: str,
    example_name: Optional[str],
    commit: bool = True,
) -> None:
    if category_id is None:
        return
    row = ItemCategoryMap(
        key=key,
        category_id=category_id,
        confidence=confidence,
        method=method,
        example_name=example_name,
        updated_at=datetime.utcnow(),
    )
    session.add(row)
    if commit and session.new:
        session.commit()


def annotate_items_with_categories(
    session: Session,
    items: List[Dict[str, object]],
) -> List[Dict[str, object]]:
    path_to_id, id_to_path = build_category_maps(session)
    out: List[Dict[str, object]] = []
    for item in items:
        name = str(item.get("name") or "").strip()
        if not name:
            out.append(item)
            continue
        result = get_or_predict_category_cached(session, name, path_to_id, commit=False)
        path = id_to_path.get(result.category_id or -1, list(OTHER_PATH))
        enriched = dict(item)
        enriched["category_path"] = path
        enriched["category_confidence"] = result.confidence
        enriched["category_method"] = result.method
        out.append(enriched)
    if session.new:
        session.commit()
    return out
