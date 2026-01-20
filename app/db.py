from __future__ import annotations

import os

from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def init_db() -> None:
    SQLModel.metadata.create_all(engine)
    try:
        from app.seed_categories import seed_categories
    except Exception:
        return
    with Session(engine) as session:
        seed_categories(session)


def get_session() -> Session:
    with Session(engine) as session:
        yield session
