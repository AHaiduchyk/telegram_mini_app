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
    if DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(transactions)").fetchall()]
            if "subscription_id" not in cols:
                conn.exec_driver_sql("ALTER TABLE transactions ADD COLUMN subscription_id INTEGER")
            sub_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(subscription)").fetchall()]
            if "is_income" not in sub_cols:
                conn.exec_driver_sql("ALTER TABLE subscription ADD COLUMN is_income BOOLEAN DEFAULT 0")
            if "name" not in sub_cols:
                conn.exec_driver_sql("ALTER TABLE subscription ADD COLUMN name TEXT")
            user_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(user)").fetchall()]
            if "premium_until" not in user_cols:
                conn.exec_driver_sql("ALTER TABLE user ADD COLUMN premium_until DATETIME")
            conn.exec_driver_sql(
                "UPDATE subscription SET category='subscriptions' "
                "WHERE lower(category) IN ('automatic transactions','automatic transaction','автоматичні транзакції')"
            )
            conn.exec_driver_sql(
                "UPDATE transactions SET category='subscriptions' "
                "WHERE lower(category) IN ('automatic transactions','automatic transaction','автоматичні транзакції')"
            )
    try:
        from app.seed_categories import seed_categories
    except Exception:
        return
    with Session(engine) as session:
        seed_categories(session)


def get_session() -> Session:
    with Session(engine) as session:
        yield session
