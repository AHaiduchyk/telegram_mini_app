from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Tuple

from sqlmodel import Session, select

from app.models import Category

CATEGORY_PATHS: List[Tuple[str, ...]] = [
    ("покупки",),
    ("покупки", "продукти"),
    ("покупки", "продукти", "овочі"),
    ("покупки", "продукти", "фрукти"),
    ("покупки", "продукти", "молочні"),
    ("покупки", "продукти", "м'ясо та риба"),
    ("покупки", "продукти", "хліб"),
    ("покупки", "продукти", "консерви"),
    ("покупки", "продукти", "солодощі"),
    ("покупки", "продукти", "солодощі", "шоколад"),
    ("покупки", "продукти", "солодощі", "цукерки"),
    ("покупки", "продукти", "солодощі", "печиво"),
    ("покупки", "снеки"),
    ("покупки", "снеки", "чіпси"),
    ("покупки", "напої"),
    ("покупки", "напої", "вода"),
    ("покупки", "напої", "сік"),
    ("покупки", "алкоголь"),
    ("покупки", "алкоголь", "пиво"),
    ("покупки", "алкоголь", "вино"),
    ("покупки", "побут"),
    ("покупки", "побут", "пакети"),
    ("покупки", "побут", "серветки"),
    ("покупки", "інші"),
    ("покупки", "інші", "інші"),
]


def seed_categories(session: Session) -> None:
    existing = session.exec(select(Category)).all()
    existing_map: Dict[Tuple[str, Optional[int]], Category] = {
        (c.name, c.parent_id): c for c in existing
    }

    for path in CATEGORY_PATHS:
        parent_id: Optional[int] = None
        for name in path:
            key = (name, parent_id)
            cat = existing_map.get(key)
            if cat is None:
                cat = Category(name=name, parent_id=parent_id)
                session.add(cat)
                session.commit()
                session.refresh(cat)
                existing_map[key] = cat
            parent_id = cat.id
