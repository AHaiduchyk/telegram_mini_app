from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional

from sqlalchemy import Column, Numeric
from sqlalchemy.dialects.sqlite import JSON
from sqlmodel import Field, SQLModel


class Scan(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tg_user_id: int = Field(index=True)
    raw_text: str = Field(max_length=4096)
    type: str = Field(max_length=32)
    info: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tg_user_id: int = Field(index=True, unique=True)
    username: Optional[str] = Field(default=None, max_length=255)
    first_name: Optional[str] = Field(default=None, max_length=255)
    last_name: Optional[str] = Field(default=None, max_length=255)
    language_code: Optional[str] = Field(default=None, max_length=16)
    photo_url: Optional[str] = Field(default=None, max_length=1024)
    allows_write_to_pm: Optional[bool] = Field(default=None)
    is_premium: bool = Field(default=False, index=True)
    premium_until: Optional[datetime] = Field(default=None)
    last_auth_at: Optional[datetime] = Field(default=None, index=True)
    last_seen_at: Optional[datetime] = Field(default=None, index=True)
    platform: Optional[str] = Field(default=None, max_length=64)
    app_version: Optional[str] = Field(default=None, max_length=64)
    color_scheme: Optional[str] = Field(default=None, max_length=16)
    user_agent: Optional[str] = Field(default=None, max_length=512)
    timezone_offset: Optional[int] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class TaxCheck(SQLModel, table=True):
    # check_id з URL (параметр id=...), напр. "3135993637"
    id: str = Field(primary_key=True, index=True)

    tg_user_id: int = Field(index=True)
    check_url: str = Field(max_length=4096)

    is_founded: bool = Field(default=False, index=True)
    is_saved: bool = Field(default=False, index=True)

    # XML зберігаємо після Save
    xml_text: Optional[str] = Field(default=None)

    # вже “преттифай” структура для UI
    parsed: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class Category(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    parent_id: Optional[int] = Field(default=None, foreign_key="category.id", index=True)
    name: str = Field(max_length=255, index=True)


class ItemCategoryMap(SQLModel, table=True):
    key: str = Field(primary_key=True, max_length=255)
    category_id: int = Field(foreign_key="category.id", index=True)
    confidence: float
    method: str = Field(max_length=32)
    example_name: Optional[str] = Field(default=None, max_length=512)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class Transaction(SQLModel, table=True):
    __tablename__ = "transactions"

    id: Optional[int] = Field(default=None, primary_key=True)
    tg_user_id: int = Field(index=True)
    subscription_id: Optional[int] = Field(default=None, foreign_key="subscription.id", index=True)
    check_id: Optional[str] = Field(default=None, max_length=255, index=True)
    amount: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2)))
    url: Optional[str] = Field(default=None, max_length=4096)
    receipt_date: Optional[str] = Field(default=None, max_length=32)
    check_xml: Optional[str] = Field(default=None)
    merchant: Optional[str] = Field(default=None, max_length=255)
    type: str = Field(default="qr_scan", max_length=32)
    is_income: bool = Field(default=False, index=True)
    category: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    payment_method: Optional[str] = Field(default=None, max_length=16)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class Subscription(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tg_user_id: int = Field(index=True)
    name: Optional[str] = Field(default=None, max_length=255)
    amount: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2)))
    category: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    payment_method: Optional[str] = Field(default=None, max_length=16)
    merchant: Optional[str] = Field(default=None, max_length=255)
    is_income: bool = Field(default=False, index=True)
    period: str = Field(default="monthly", max_length=16)
    anchor_day: int = Field(default=1)
    anchor_month: int = Field(default=1)
    next_run_date: Optional[datetime] = Field(default=None, index=True)
    last_run_date: Optional[datetime] = Field(default=None)
    is_active: bool = Field(default=True, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class Budget(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tg_user_id: int = Field(index=True)
    category: str = Field(max_length=64, index=True)
    month: str = Field(max_length=7, index=True)  # YYYY-MM
    amount: Optional[Decimal] = Field(default=None, sa_column=Column(Numeric(12, 2)))
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow, index=True)
