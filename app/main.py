from __future__ import annotations

import json
import logging
import os
import re
import time
import calendar
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from random import randint, choice
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from selenium.webdriver.common.action_chains import ActionChains
from seleniumbase import SB
from sqlmodel import Session, select
from sqlalchemy import case, func, literal

from app.auth import InitDataValidationError, extract_user_id, validate_init_data, validate_init_data_unsafe
from app.categorizer import build_category_maps, get_or_predict_category_cached, OTHER_PATH
from app.db import engine, get_session, init_db
from app.models import Budget, Scan, TaxCheck, Transaction, Subscription, User
from app.qr_parse import parse_qr_text
from app.tax_xml_parser import parse_tax_xml

logger = logging.getLogger("qr_scanner")
logging.basicConfig(level=logging.INFO)

load_dotenv()

app = FastAPI(title="Telegram QR Scanner", debug=False)

PREMIUM_USER_IDS = {442103350}

# --- Logging to file ---
log_dir = Path(__file__).resolve().parent.parent / "logs"
try:
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "qr_scanner.log"
    if not any(
        isinstance(h, logging.FileHandler) and getattr(h, "baseFilename", "") == str(log_path)
        for h in logger.handlers
    ):
        file_handler = logging.FileHandler(log_path)
        file_handler.setLevel(logging.INFO)
        formatter = logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
        # Ensure auth logger is persisted as well.
        logging.getLogger("qr_scanner.auth").addHandler(file_handler)
except Exception:
    logger.exception("Failed to initialize file logging")

# --- Static (Frontend) ---
frontend_dist = Path(__file__).resolve().parent.parent / "figma_design" / "dist"

# --- CORS ---
miniapp_origin = os.getenv("MINIAPP_ORIGIN", "")
allow_origins = [miniapp_origin] if miniapp_origin else []

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# --- Models (API payloads) ---
class ScanCreate(BaseModel):
    raw_text: str = Field(..., max_length=4096)
    init_data: Optional[str] = None
    init_data_unsafe: Optional[Dict[str, Any]] = None


class ClientLog(BaseModel):
    event: str
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    user_agent: Optional[str] = None
    url: Optional[str] = None
    timestamp: Optional[str] = None
    init_data: Optional[str] = None
    init_data_unsafe: Optional[Dict[str, Any]] = None
    timestamp: Optional[str] = None


class ScanResponse(BaseModel):
    id: int
    raw_text: str
    type: str
    info: Dict[str, Any]
    created_at: str


class FindCheckRequest(BaseModel):
    init_data: Optional[str] = None
    init_data_unsafe: Optional[Dict[str, Any]] = None
    check_url: str = Field(..., max_length=4096)


class SaveCheckRequest(BaseModel):
    init_data: Optional[str] = None
    init_data_unsafe: Optional[Dict[str, Any]] = None
    check_url: str = Field(..., max_length=4096)
    check_text: str = Field(..., max_length=2_000_000)


class TransactionCreate(BaseModel):
    init_data: Optional[str] = None
    init_data_unsafe: Optional[Dict[str, Any]] = None
    check_id: Optional[str] = Field(default=None, max_length=255)
    amount: str = Field(..., max_length=64)
    url: Optional[str] = Field(default=None, max_length=4096)
    receipt_date: Optional[str] = Field(default=None, max_length=32)
    check_xml: Optional[str] = Field(default=None)
    merchant: Optional[str] = Field(default=None, max_length=255)
    type: str = Field(default="qr_scan", max_length=32)
    category: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    payment_method: Optional[str] = Field(default=None, max_length=16)
    confirm_duplicate: bool = False
    create_subscription: bool = False
    subscription_period: Optional[str] = Field(default="monthly", max_length=16)


class TransactionResponse(BaseModel):
    id: int
    check_id: Optional[str]
    amount: Optional[str]
    url: Optional[str]
    receipt_date: Optional[str]
    check_xml: Optional[str]
    merchant: Optional[str]
    type: str
    is_income: bool
    category: Optional[str]
    note: Optional[str]
    payment_method: Optional[str]
    created_at: str
    updated_at: str


class SubscriptionResponse(BaseModel):
    id: int
    name: Optional[str]
    amount: str
    category: Optional[str]
    note: Optional[str]
    payment_method: Optional[str]
    merchant: Optional[str]
    is_income: bool
    period: str
    anchor_day: int
    anchor_month: int
    next_run_date: Optional[str]
    is_active: bool
    created_at: str
    updated_at: str


class SubscriptionUpdate(BaseModel):
    init_data: Optional[str] = None
    init_data_unsafe: Optional[Dict[str, Any]] = None
    name: Optional[str] = Field(default=None, max_length=255)
    amount: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    payment_method: Optional[str] = Field(default=None, max_length=16)
    merchant: Optional[str] = Field(default=None, max_length=255)
    is_income: Optional[bool] = None
    period: Optional[str] = Field(default=None, max_length=16)
    start_date: Optional[str] = Field(default=None, max_length=32)
    is_active: Optional[bool] = None


class UserProfileUpdate(BaseModel):
    init_data: Optional[str] = None
    init_data_unsafe: Optional[Dict[str, Any]] = None
    platform: Optional[str] = None
    app_version: Optional[str] = None
    color_scheme: Optional[str] = None
    user_agent: Optional[str] = None
    timezone_offset: Optional[int] = None


class UserProfileResponse(BaseModel):
    tg_user_id: int
    username: Optional[str]
    first_name: Optional[str]
    last_name: Optional[str]
    language_code: Optional[str]
    photo_url: Optional[str]
    allows_write_to_pm: Optional[bool]
    is_premium: bool
    premium_until: Optional[str]
    last_auth_at: Optional[str]
    last_seen_at: Optional[str]
    platform: Optional[str]
    app_version: Optional[str]
    color_scheme: Optional[str]
    user_agent: Optional[str]
    timezone_offset: Optional[int]


class TransactionUpdate(BaseModel):
    init_data: Optional[str] = None
    init_data_unsafe: Optional[Dict[str, Any]] = None
    check_id: Optional[str] = Field(default=None, max_length=255)
    amount: Optional[str] = Field(default=None, max_length=64)
    url: Optional[str] = Field(default=None, max_length=4096)
    receipt_date: Optional[str] = Field(default=None, max_length=32)
    check_xml: Optional[str] = Field(default=None)
    merchant: Optional[str] = Field(default=None, max_length=255)
    type: Optional[str] = Field(default=None, max_length=32)
    is_income: Optional[bool] = None
    category: Optional[str] = Field(default=None, max_length=64)
    note: Optional[str] = Field(default=None, max_length=512)
    payment_method: Optional[str] = Field(default=None, max_length=16)


class TransactionTotalsResponse(BaseModel):
    current_income: str
    current_expense: str
    previous_income: str
    previous_expense: str


class CategoryTotalResponse(BaseModel):
    name: str
    value: str


class MonthlyTrendPoint(BaseModel):
    month: str
    income: str
    expenses: str


class MonthOption(BaseModel):
    value: str
    label: str


class AnalyticsResponse(BaseModel):
    totals: TransactionTotalsResponse
    categories: List[CategoryTotalResponse]
    trend: List[MonthlyTrendPoint]
    months: List[MonthOption]
    default_month: str
    has_data: bool


class BudgetUpsertRequest(BaseModel):
    init_data: Optional[str] = None
    init_data_unsafe: Optional[Dict[str, Any]] = None
    month: str = Field(..., max_length=7)  # YYYY-MM
    category: str = Field(..., max_length=64)
    amount: str = Field(..., max_length=64)


class BudgetItemResponse(BaseModel):
    category: str
    amount: str


class BudgetSummaryResponse(BaseModel):
    month: str
    total_limit: str
    total_spent: str
    remaining: str


class BudgetProgressItem(BaseModel):
    category: str
    spent: str
    limit: str


class BudgetProgressResponse(BaseModel):
    month: str
    items: List[BudgetProgressItem]




@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.exception_handler(Exception)
def unhandled_exception_handler(_: Request, __: Exception) -> JSONResponse:
    logger.exception("Unhandled error")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.middleware("http")
async def add_ngrok_skip_header(request: Request, call_next):  # type: ignore[no-untyped-def]
    response = await call_next(request)
    response.headers["ngrok-skip-browser-warning"] = "1"
    if request.url.path.startswith(("/js", "/css", "/assets", "/")):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    return response


def validate_check_url(check_url: str) -> str:
    parsed = urlparse(check_url)

    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Invalid check URL (scheme)")
    if parsed.hostname != "cabinet.tax.gov.ua":
        raise HTTPException(status_code=400, detail="Invalid check URL (host)")
    if parsed.path != "/cashregs/check":
        raise HTTPException(status_code=400, detail="Invalid check URL (path)")

    query = parse_qs(parsed.query)
    required_params = {"fn", "id", "sm", "time", "date"}
    if not required_params.issubset(query.keys()):
        raise HTTPException(status_code=400, detail="Invalid check URL (missing params)")

    return check_url


def get_verified_user_id(init_data: Optional[str], init_data_unsafe: Optional[Dict[str, Any]]) -> int:
    bot_token = os.getenv("BOT_TOKEN")
    if not bot_token:
        logger.error("BOT_TOKEN is not configured")
        raise HTTPException(status_code=500, detail="BOT_TOKEN is not configured")

    debug_init = os.getenv("DEBUG_LOG_INIT_DATA") == "1"
    if debug_init:
        logger.warning("DEBUG init_data=%s", init_data)
        logger.warning("DEBUG init_data_unsafe=%s", init_data_unsafe)

    try:
        if init_data:
            logger.info("InitData validation: using init_data")
            fields = validate_init_data(init_data, bot_token)
        elif init_data_unsafe:
            logger.info("InitData validation: using init_data_unsafe")
            fields = validate_init_data_unsafe(init_data_unsafe, bot_token)
        else:
            raise InitDataValidationError("Missing initData", status_code=401)
        return extract_user_id(fields)
    except InitDataValidationError as exc:
        logger.warning("InitData validation failed: %s (status=%s)", exc.message, exc.status_code)
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception:
        logger.exception("InitData validation unexpected error")
        raise


def _touch_user(session: Session, user_id: int, init_data_unsafe: Optional[Dict[str, Any]]) -> User:
    now = datetime.utcnow()
    user = session.exec(select(User).where(User.tg_user_id == user_id)).first()
    payload_user: Dict[str, Any] = {}
    if init_data_unsafe:
        raw = init_data_unsafe.get("user")
        if isinstance(raw, dict):
            payload_user = raw
        elif isinstance(raw, str):
            try:
                payload_user = json.loads(raw)
            except json.JSONDecodeError:
                payload_user = {}

    if user is None:
        user = User(
            tg_user_id=user_id,
            created_at=now,
        )

    if payload_user:
        user.username = payload_user.get("username") or user.username
        user.first_name = payload_user.get("first_name") or user.first_name
        user.last_name = payload_user.get("last_name") or user.last_name
        user.language_code = payload_user.get("language_code") or user.language_code
        user.photo_url = payload_user.get("photo_url") or user.photo_url
        if "allows_write_to_pm" in payload_user:
            user.allows_write_to_pm = bool(payload_user.get("allows_write_to_pm"))
        if "is_premium" in payload_user:
            user.is_premium = bool(payload_user.get("is_premium"))

    if user.tg_user_id in PREMIUM_USER_IDS:
        user.is_premium = True

    user.last_auth_at = now
    user.last_seen_at = now
    user.updated_at = now
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def extract_check_id(check_url: str) -> str:
    parsed = urlparse(check_url)
    qs = parse_qs(parsed.query)
    check_id = (qs.get("id") or [None])[0]
    if not check_id:
        raise HTTPException(status_code=400, detail="Invalid check URL (missing id)")
    return str(check_id)


def _try_extract_check_id(check_url: str) -> Optional[str]:
    try:
        return extract_check_id(check_url)
    except HTTPException:
        return None


def _scan_check_id(scan: Scan) -> Optional[str]:
    info = _normalize_scan_info(scan.info)
    check_id = info.get("check_id") or info.get("id")
    if check_id:
        return str(check_id)
    url = info.get("url") or scan.raw_text
    if not isinstance(url, str):
        return None
    return _try_extract_check_id(url)


def _apply_check_status(info: Dict[str, Any], session: Session, user_id: int, check_id: Optional[str]) -> None:
    if not check_id:
        return
    row = session.get(TaxCheck, str(check_id))
    if row and row.tg_user_id == user_id:
        status = _get_taxcheck_status(row)
        founded = bool(row.xml_text)
        saved = _parsed_ready(row.parsed)
        info["check_status"] = {
            "exists": True,
            "founded": founded,
            "saved": saved,
            "finding": bool(status.get("finding")) and not founded,
        }


def _get_taxcheck_status(row: TaxCheck) -> Dict[str, Any]:
    parsed = row.parsed if isinstance(row.parsed, dict) else {}
    status = parsed.get("_status")
    status_out = status if isinstance(status, dict) else {}
    if row.xml_text:
        status_out["finding"] = False
    return status_out


def _parsed_ready(parsed: Any) -> bool:
    if not isinstance(parsed, dict):
        return False
    if not parsed:
        return False
    if "_status" in parsed and len(parsed) == 1:
        return False
    return "items" in parsed or "total_sum" in parsed or "source_format" in parsed


def _set_taxcheck_status(row: TaxCheck, finding: Optional[bool] = None, error: Optional[str] = None) -> None:
    parsed = row.parsed if isinstance(row.parsed, dict) else {}
    status = parsed.get("_status")
    if not isinstance(status, dict):
        status = {}
    if finding is not None:
        status["finding"] = finding
    if error is not None:
        status["error"] = error
    if status:
        parsed["_status"] = status
        row.parsed = parsed


def _mark_taxcheck_error(session: Session, tg_user_id: int, check_id: str, message: str) -> None:
    row = session.get(TaxCheck, check_id)
    if not row or row.tg_user_id != tg_user_id:
        return
    _set_taxcheck_status(row, finding=False, error=message)
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()


def _background_find_check(check_url: str, tg_user_id: int, check_id: str) -> None:
    with Session(engine) as session:
        try:
            base = Path(os.getenv("DOWNLOAD_DIR", "downloaded_files"))
            downloader = TaxGovXmlDownloader(download_dir=base, headless=True)
            result = downloader.fetch(check_url)

            raw = result.xml_path.read_bytes()
            xml_text = decode_xml_bytes(raw)
            if not xml_text:
                raise RuntimeError("Downloaded XML is empty")

            _upsert_taxcheck_founded(
                session=session,
                tg_user_id=tg_user_id,
                check_id=check_id,
                check_url=check_url,
                xml_text=xml_text,
            )
        except Exception as exc:
            _mark_taxcheck_error(session, tg_user_id, check_id, str(exc))


def _decimal_to_str(value: Optional[Decimal], money: bool = False) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, Decimal):
        try:
            value = Decimal(str(value))
        except Exception:
            return str(value)
    if money:
        return f"{value:.2f}"
    return str(value.normalize())


def _parse_amount(value: Any) -> Optional[Decimal]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        amount = value
    elif isinstance(value, (int, float)):
        try:
            amount = Decimal(str(value))
        except Exception:
            return None
    elif isinstance(value, str):
        cleaned = value.strip().replace(",", ".")
        if not cleaned:
            return None
        try:
            amount = Decimal(cleaned)
        except Exception:
            return None
    else:
        return None
    try:
        return amount.quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def _summarize_tax_parsed(parsed: Dict[str, Any]) -> Dict[str, Any]:
    dt = parsed.get("datetime")
    total = parsed.get("total_sum")
    items = []
    for item in parsed.get("items", []) or []:
        items.append(
            {
                "name": item.get("name"),
                "qty": _decimal_to_str(item.get("qty")),
                "price": _decimal_to_str(item.get("price"), money=True),
                "sum": _decimal_to_str(item.get("sum"), money=True),
            }
        )
    return {
        "source_format": parsed.get("source_format"),
        "datetime": dt.isoformat() if isinstance(dt, datetime) else None,
        "total_sum": _decimal_to_str(total, money=True),
        "currency": parsed.get("currency", "UAH"),
        "items": items,
    }


def _background_parse_taxcheck(check_id: str, tg_user_id: int) -> None:
    with Session(engine) as session:
        row = session.get(TaxCheck, check_id)
        if not row or row.tg_user_id != tg_user_id:
            return
        if not row.xml_text:
            return
        try:
            parsed = parse_tax_xml(row.xml_text)
            summary = _summarize_tax_parsed(parsed)
            existing = row.parsed if isinstance(row.parsed, dict) else {}
            status = existing.get("_status")
            if isinstance(status, dict):
                summary["_status"] = status
            row.parsed = summary
            row.is_saved = True
            if row.xml_text:
                row.is_founded = True
            _set_taxcheck_status(row, finding=False, error=None)
            row.updated_at = datetime.utcnow()
            session.add(row)
            session.commit()
        except Exception as exc:
            _mark_taxcheck_error(session, tg_user_id, check_id, str(exc))


def newest_file(folder: Path) -> Optional[Path]:
    files = list(folder.glob("*"))
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)


def wait_new_xml(folder: Path, check_id: str, before_ts: float, timeout: int = 30) -> Optional[Path]:
    end = time.time() + timeout

    while time.time() < end:
        # exact + duplicates: 3135993637.xml, 3135993637 (3).xml, etc.
        candidates = sorted(
            folder.glob(f"{check_id}*.xml"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for p in candidates:
            if p.is_file() and p.stat().st_mtime >= before_ts:
                return p

        # fallback newest xml
        f = newest_file(folder)
        if f and f.suffix.lower() == ".xml" and f.stat().st_mtime >= before_ts:
            return f

        time.sleep(0.3)

    return None


@dataclass(frozen=True)
class XmlDownloadResult:
    check_id: str
    xml_path: Path


class TaxGovXmlDownloader:
    def __init__(
        self,
        download_dir: Path,
        headless: bool = True,
        open_timeout_sec: int = 300,
        download_timeout_sec: int = 30,
    ) -> None:
        self.download_dir = download_dir
        self.download_dir.mkdir(parents=True, exist_ok=True)
        self.headless = headless
        self.open_timeout_sec = open_timeout_sec
        self.download_timeout_sec = download_timeout_sec
        self._xml_btn_xpath = "//button[.//span[normalize-space()='XML']]"

    def _set_download_dir(self, sb: SB) -> None:
        sb.driver.execute_cdp_cmd(
            "Page.setDownloadBehavior",
            {"behavior": "allow", "downloadPath": str(self.download_dir.resolve())},
        )

    def fetch(self, url: str) -> XmlDownloadResult:
        check_id = extract_check_id(url)
        before = time.time()

        with SB(uc=True, headless=self.headless) as sb:
            self._set_download_dir(sb)

            sb.uc_open_with_reconnect(url, 3)
            sb.wait_for_element(self._xml_btn_xpath, timeout=self.open_timeout_sec)
            sb.scroll_to(self._xml_btn_xpath)

            el = sb.find_element(self._xml_btn_xpath)
            ActionChains(sb.driver).move_to_element(el).pause(0.2).click(el).perform()
            time.sleep(0.5)

            search_dirs: List[Path] = []
            search_dirs.append(self.download_dir)

            try:
                search_dirs.append(Path.cwd() / "downloaded_files")
            except Exception:
                pass

            try:
                search_dirs.append(Path(sb.get_downloads_folder()))
            except Exception:
                pass

            xml_path: Optional[Path] = None
            for folder in search_dirs:
                xml_path = wait_new_xml(
                    folder=folder,
                    check_id=check_id,
                    before_ts=before,
                    timeout=self.download_timeout_sec,
                )
                if xml_path:
                    break

            if not xml_path:
                raise HTTPException(status_code=422, detail="XML download not detected")

            return XmlDownloadResult(check_id=check_id, xml_path=xml_path)


def decode_xml_bytes(raw: bytes) -> str:
    enc = "utf-8"
    head = raw[:256].decode("ascii", errors="ignore").lower()
    if "encoding=" in head:
        import re

        m = re.search(r'encoding=["\']([^"\']+)["\']', head)
        if m:
            enc = m.group(1).strip()

    try:
        return raw.decode(enc, errors="replace").strip()
    except Exception:
        return raw.decode("utf-8", errors="replace").strip()


def _upsert_taxcheck_founded(
    session: Session,
    tg_user_id: int,
    check_id: str,
    check_url: str,
    xml_text: str,
) -> TaxCheck:
    now = datetime.utcnow()
    row = session.get(TaxCheck, check_id)

    if row is None:
        row = TaxCheck(
            id=check_id,
            tg_user_id=tg_user_id,
            check_url=check_url,
            is_founded=True,
            is_saved=False,
            xml_text=xml_text,
            parsed={},
            created_at=now,
            updated_at=now,
        )
        session.add(row)
    else:
        row.tg_user_id = tg_user_id
        row.check_url = check_url
        row.is_founded = True
        row.xml_text = xml_text
        row.updated_at = now
    _set_taxcheck_status(row, finding=False, error=None)

    session.commit()
    session.refresh(row)
    return row


def _upsert_taxcheck_saved(
    session: Session,
    tg_user_id: int,
    check_id: str,
    check_url: str,
    xml_text: str,
) -> TaxCheck:
    now = datetime.utcnow()
    row = session.get(TaxCheck, check_id)

    if row is None:
        row = TaxCheck(
            id=check_id,
            tg_user_id=tg_user_id,
            check_url=check_url,
            is_founded=True,
            is_saved=False,
            xml_text=xml_text,
            parsed={},
            created_at=now,
            updated_at=now,
        )
        session.add(row)
    else:
        row.tg_user_id = tg_user_id
        row.check_url = check_url
        row.is_founded = True
        row.is_saved = False
        row.xml_text = xml_text
        row.updated_at = now
    _set_taxcheck_status(row, finding=False, error=None)

    session.commit()
    session.refresh(row)
    return row


def _status_map_for_user(session: Session, tg_user_id: int) -> Dict[str, Dict[str, bool]]:
    stmt = select(TaxCheck).where(TaxCheck.tg_user_id == tg_user_id)
    rows = session.exec(stmt).all()
    out: Dict[str, Dict[str, bool]] = {}
    for r in rows:
        status = _get_taxcheck_status(r)
        founded = bool(r.xml_text)
        saved = _parsed_ready(r.parsed)
        out[r.id] = {
            "exists": True,
            "founded": founded,
            "saved": saved,
            "finding": bool(status.get("finding")) and not founded,
        }
    return out


def _normalize_scan_info(raw_info: Any) -> Dict[str, Any]:
    if raw_info is None:
        return {}
    if isinstance(raw_info, dict):
        return dict(raw_info)
    if isinstance(raw_info, str):
        try:
            parsed = json.loads(raw_info)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            return dict(parsed)
    logger.warning("Unexpected scan info payload: %s", type(raw_info).__name__)
    return {}


@app.post("/api/scan", response_model=ScanResponse)
def create_scan(payload: ScanCreate, session: Session = Depends(get_session)) -> ScanResponse:
    raw_len = len(payload.raw_text or "")
    logger.info(
        "Scan create request: init_data=%s init_data_unsafe=%s raw_text_len=%s",
        bool(payload.init_data),
        bool(payload.init_data_unsafe),
        raw_len,
    )
    user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)
    user = _touch_user(session, user_id, payload.init_data_unsafe)
    user = _touch_user(session, user_id, payload.init_data_unsafe)
    if not user.is_premium:
        raise HTTPException(status_code=403, detail="Premium required")
    logger.info("Scan create user_id=%s", user_id)

    text = payload.raw_text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty QR text")
    if len(text) > 4096:
        raise HTTPException(status_code=400, detail="QR text too long")

    try:
        qr_type, info = parse_qr_text(text)
    except Exception:
        logger.exception("Scan create parse_qr_text failed")
        raise
    if isinstance(info, dict):
        info_meta = f"dict_keys={list(info.keys())}"
    else:
        info_meta = f"type={type(info).__name__}"
    logger.info("Scan create parsed: type=%s %s", qr_type, info_meta)

    check_id: Optional[str] = None
    url_host: Optional[str] = None
    url_path: Optional[str] = None
    if isinstance(info, dict):
        check_id = info.get("check_id") or info.get("id")
        if not check_id and isinstance(info.get("url"), str):
            check_id = _try_extract_check_id(info["url"])
        if isinstance(info.get("url"), str):
            try:
                parsed_url = urlparse(info["url"])
                url_host = parsed_url.netloc
                url_path = parsed_url.path
            except Exception:
                url_host = None
                url_path = None
        if check_id:
            info["check_id"] = str(check_id)
    logger.info(
        "Scan create resolved: check_id=%s url_host=%s url_path=%s",
        check_id,
        url_host,
        url_path,
    )

    scan: Scan
    if check_id:
        stmt = select(Scan).where(Scan.tg_user_id == user_id).order_by(Scan.created_at.desc())
        existing = None
        for s in session.exec(stmt).all():
            if _scan_check_id(s) == str(check_id):
                existing = s
                break
        if existing:
            logger.info("Scan create duplicate: check_id=%s existing_id=%s", check_id, existing.id)
            existing.raw_text = text
            existing.type = qr_type
            existing.info = info
            existing.created_at = datetime.utcnow()
            session.add(existing)
            session.commit()
            session.refresh(existing)
            scan = existing
        else:
            scan = Scan(
                tg_user_id=user_id,
                raw_text=text,
                type=qr_type,
                info=info,
            )
            session.add(scan)
            session.commit()
            session.refresh(scan)
    else:
        scan = Scan(
            tg_user_id=user_id,
            raw_text=text,
            type=qr_type,
            info=info,
        )
        session.add(scan)
        session.commit()
        session.refresh(scan)
    logger.info("Scan create stored: id=%s", scan.id)

    info_out = _normalize_scan_info(scan.info)
    _apply_check_status(info_out, session, user_id, check_id)

    return ScanResponse(
        id=scan.id,
        raw_text=scan.raw_text,
        type=scan.type,
        info=info_out,
        created_at=scan.created_at.isoformat(),
    )


@app.post("/api/client_log")
def client_log(payload: ClientLog) -> Dict[str, bool]:
    user_id = None
    try:
        user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)
    except Exception as exc:
        logger.warning("Client log: user_id unavailable: %s", exc)
    logger.info(
        "Client log: user_id=%s event=%s message=%s data=%s ua=%s url=%s ts=%s",
        user_id,
        payload.event,
        payload.message,
        payload.data,
        payload.user_agent,
        payload.url,
        payload.timestamp,
    )
    return {"ok": True}


@app.get("/api/user_profile", response_model=UserProfileResponse)
def get_user_profile(
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    session: Session = Depends(get_session),
) -> UserProfileResponse:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    user = _touch_user(session, user_id, parsed_unsafe)
    return UserProfileResponse(
        tg_user_id=user.tg_user_id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        language_code=user.language_code,
        photo_url=user.photo_url,
        allows_write_to_pm=user.allows_write_to_pm,
        is_premium=user.is_premium,
        premium_until=user.premium_until.isoformat() if user.premium_until else None,
        last_auth_at=user.last_auth_at.isoformat() if user.last_auth_at else None,
        last_seen_at=user.last_seen_at.isoformat() if user.last_seen_at else None,
        platform=user.platform,
        app_version=user.app_version,
        color_scheme=user.color_scheme,
        user_agent=user.user_agent,
        timezone_offset=user.timezone_offset,
    )


@app.post("/api/user_profile", response_model=UserProfileResponse)
def update_user_profile(
    payload: UserProfileUpdate,
    session: Session = Depends(get_session),
) -> UserProfileResponse:
    user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)
    user = _touch_user(session, user_id, payload.init_data_unsafe)

    if payload.platform:
        user.platform = payload.platform
    if payload.app_version:
        user.app_version = payload.app_version
    if payload.color_scheme:
        user.color_scheme = payload.color_scheme
    if payload.user_agent:
        user.user_agent = payload.user_agent
    if payload.timezone_offset is not None:
        user.timezone_offset = payload.timezone_offset

    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)

    return UserProfileResponse(
        tg_user_id=user.tg_user_id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        language_code=user.language_code,
        photo_url=user.photo_url,
        allows_write_to_pm=user.allows_write_to_pm,
        is_premium=user.is_premium,
        premium_until=user.premium_until.isoformat() if user.premium_until else None,
        last_auth_at=user.last_auth_at.isoformat() if user.last_auth_at else None,
        last_seen_at=user.last_seen_at.isoformat() if user.last_seen_at else None,
        platform=user.platform,
        app_version=user.app_version,
        color_scheme=user.color_scheme,
        user_agent=user.user_agent,
        timezone_offset=user.timezone_offset,
    )


@app.get("/api/history", response_model=List[ScanResponse])
def get_history(
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    limit: Optional[int] = Query(None, ge=1, le=100, alias="limit"),
    offset: int = Query(0, ge=0, alias="offset"),
    session: Session = Depends(get_session),
) -> List[ScanResponse]:
    logger.info(
        "History request: init_data=%s init_data_unsafe=%s",
        bool(init_data),
        bool(init_data_unsafe),
    )
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            logger.warning("History init_data_unsafe JSON decode failed: %s", exc)
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    logger.info("History user_id=%s", user_id)

    status_map = _status_map_for_user(session, user_id)
    logger.info("History status_map_size=%s", len(status_map))

    statement = select(Scan).where(Scan.tg_user_id == user_id).order_by(Scan.created_at.desc())
    if limit:
        statement = statement.offset(offset).limit(limit)
    scans = session.exec(statement).all()
    logger.info("History scan_count=%s", len(scans))

    out: List[ScanResponse] = []
    for s in scans:
        info = _normalize_scan_info(s.info)
        if "check_id" not in info:
            info["check_id"] = _scan_check_id(s)
        try:
            check_url = info.get("url") or s.raw_text
            if check_url and "cabinet.tax.gov.ua/cashregs/check" in check_url:
                cid = extract_check_id(check_url)
                info["check_id"] = cid
                info["check_status"] = status_map.get(cid, {"founded": False, "saved": False})
        except Exception:
            logger.exception("History scan enrich failed: scan_id=%s", s.id)

        out.append(
            ScanResponse(
                id=s.id,
                raw_text=s.raw_text,
                type=s.type,
                info=info,
                created_at=s.created_at.isoformat(),
            )
        )

    return out


@app.get("/api/scan/{scan_id}", response_model=ScanResponse)
def get_scan(scan_id: int, session: Session = Depends(get_session)) -> ScanResponse:
    scan = session.get(Scan, scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    return ScanResponse(
        id=scan.id,
        raw_text=scan.raw_text,
        type=scan.type,
        info=_normalize_scan_info(scan.info),
        created_at=scan.created_at.isoformat(),
    )


@app.get("/api/check_parsed/{check_id}")
def get_check_parsed(
    check_id: str,
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)

    row = session.get(TaxCheck, check_id)
    if not row or row.tg_user_id != user_id:
        raise HTTPException(status_code=404, detail="Check not found")

    status = _get_taxcheck_status(row)
    parsed = row.parsed if isinstance(row.parsed, dict) else None
    if not _parsed_ready(parsed):
        parsed = None

    return {
        "ok": True,
        "check_id": row.id,
        "parsed": parsed,
        "founded": bool(row.xml_text),
        "saved": _parsed_ready(row.parsed),
        "finding": bool(status.get("finding")) and not bool(row.xml_text),
    }


@app.get("/api/check_raw/{check_id}")
def get_check_raw(
    check_id: str,
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)

    row = session.get(TaxCheck, check_id)
    if not row or row.tg_user_id != user_id:
        raise HTTPException(status_code=404, detail="Check not found")

    return {
        "ok": True,
        "check_id": row.id,
        "xml_text": row.xml_text or "",
    }


@app.get("/api/expense_summary")
def expense_summary(
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)

    path_to_id, id_to_path = build_category_maps(session)

    totals: Dict[str, Decimal] = {}
    currency = "UAH"

    stmt = select(TaxCheck).where(TaxCheck.tg_user_id == user_id)
    rows = session.exec(stmt).all()
    for row in rows:
        parsed = row.parsed if isinstance(row.parsed, dict) else {}
        items = parsed.get("items") or []
        if not isinstance(items, list):
            continue
        if isinstance(parsed.get("currency"), str):
            currency = parsed.get("currency") or currency
        for item in items:
            if not isinstance(item, dict):
                continue
            name = (item.get("name") or "").strip()
            if not name:
                continue
            cat = get_or_predict_category_cached(session, name, path_to_id)
            path = id_to_path.get(cat.category_id or -1, list(OTHER_PATH))
            label = " / ".join(path[:2]) if path else "покупки / інші"

            amount = _parse_amount(item.get("sum"))
            if amount is None:
                price = _parse_amount(item.get("price"))
                qty = _parse_amount(item.get("qty"))
                if price is not None and qty is not None:
                    amount = price * qty
            if amount is None:
                continue
            totals[label] = totals.get(label, Decimal("0")) + amount

    series = [
        {"label": label, "total": f"{value:.2f}"} for label, value in sorted(
            totals.items(), key=lambda x: x[1], reverse=True
        )
    ]
    total_value = sum(totals.values(), Decimal("0"))

    return {
        "currency": currency,
        "total": f"{total_value:.2f}",
        "series": series,
    }


@app.post("/api/find_check")
def find_check(
    payload: FindCheckRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)

    validate_check_url(payload.check_url)
    check_id = extract_check_id(payload.check_url)

    existing = session.get(TaxCheck, check_id)
    if existing and existing.tg_user_id == user_id and existing.xml_text:
        return {
            "ok": True,
            "message": "Check already founded",
            "url": existing.check_url,
            "check_id": existing.id,
            "text": existing.xml_text,
            "founded": True,
            "saved": _parsed_ready(existing.parsed),
            "finding": False,
        }
    if existing and existing.tg_user_id == user_id:
        status = _get_taxcheck_status(existing)
        return {
            "ok": True,
            "message": "Check already exists",
            "url": existing.check_url,
            "check_id": existing.id,
            "founded": bool(existing.xml_text),
            "saved": _parsed_ready(existing.parsed),
            "finding": bool(status.get("finding")) and not bool(existing.xml_text),
        }

    now = datetime.utcnow()
    if existing is None:
        existing = TaxCheck(
            id=check_id,
            tg_user_id=user_id,
            check_url=payload.check_url,
            is_founded=False,
            is_saved=False,
            xml_text=None,
            parsed={},
            created_at=now,
            updated_at=now,
        )
    else:
        existing.tg_user_id = user_id
        existing.check_url = payload.check_url
        existing.updated_at = now

    _set_taxcheck_status(existing, finding=True, error=None)
    session.add(existing)
    session.commit()
    session.refresh(existing)

    background_tasks.add_task(_background_find_check, payload.check_url, user_id, check_id)

    return {
        "ok": True,
        "message": "Check finding started",
        "url": payload.check_url,
        "check_id": check_id,
        "founded": bool(existing.xml_text),
        "saved": _parsed_ready(existing.parsed),
        "finding": True,
    }


@app.post("/api/save_check")
def save_check(
    payload: SaveCheckRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)

    validate_check_url(payload.check_url)
    check_id = extract_check_id(payload.check_url)

    xml_text = payload.check_text.strip()
    if not xml_text:
        raise HTTPException(status_code=400, detail="Empty check_text")

    row = _upsert_taxcheck_saved(
        session=session,
        tg_user_id=user_id,
        check_id=check_id,
        check_url=payload.check_url,
        xml_text=xml_text,
    )

    stmt = select(Scan).where(Scan.tg_user_id == user_id).order_by(Scan.created_at.desc())
    existing = None
    for s in session.exec(stmt).all():
        if _scan_check_id(s) == str(check_id):
            existing = s
            break

    info = _normalize_scan_info(existing.info) if existing else {}
    info.update(
        {
            "check_id": check_id,
            "source_url": payload.check_url,
            "url": payload.check_url,
        }
    )

    if existing:
        existing.type = "tax_receipt_xml"
        existing.info = info
        session.add(existing)
        session.commit()
    else:
        scan = Scan(
            tg_user_id=user_id,
            raw_text=payload.check_url,
            type="tax_receipt_xml",
            info=info,
        )
        session.add(scan)
        session.commit()

    background_tasks.add_task(_background_parse_taxcheck, check_id, user_id)

    return {
        "ok": True,
        "message": "Saved",
        "url": row.check_url,
        "check_id": row.id,
        "founded": bool(row.xml_text),
        "saved": _parsed_ready(row.parsed),
    }


@app.post("/api/expense", response_model=TransactionResponse)
def create_expense(
    payload: TransactionCreate,
    session: Session = Depends(get_session),
) -> TransactionResponse:
    user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)
    user = _touch_user(session, user_id, payload.init_data_unsafe)

    check_id = payload.check_id.strip() if payload.check_id else None
    if payload.type == "qr_scan" and not check_id:
        raise HTTPException(status_code=400, detail="Missing check_id")

    if check_id:
        existing = session.exec(
            select(Transaction).where(
                Transaction.tg_user_id == user_id,
                Transaction.check_id == check_id,
            )
        ).all()
        existing_count = len(existing)
        if existing_count and not payload.confirm_duplicate:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Transaction already exists",
                    "existing_count": existing_count,
                },
            )

    amount_value = _parse_amount(payload.amount)
    if amount_value is None or amount_value <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    is_income = payload.type == "income"
    create_subscription = bool(payload.create_subscription)
    subscription_period = (payload.subscription_period or "monthly").lower()
    if create_subscription and subscription_period not in {"monthly", "weekly", "yearly"}:
        raise HTTPException(status_code=400, detail="Invalid subscription period")
    if (create_subscription or payload.category == "subscriptions") and not user.is_premium:
        raise HTTPException(status_code=403, detail="Premium required")

    transaction_type = payload.type or "qr_scan"
    if create_subscription and not is_income:
        transaction_type = "subscription"

    transaction = Transaction(
        tg_user_id=user_id,
        subscription_id=None,
        check_id=check_id,
        amount=amount_value,
        url=payload.url,
        receipt_date=payload.receipt_date,
        check_xml=payload.check_xml,
        merchant=payload.merchant,
        type=transaction_type,
        is_income=is_income,
        category=payload.category,
        note=payload.note,
        payment_method=payload.payment_method,
        updated_at=datetime.utcnow(),
    )
    session.add(transaction)
    session.commit()
    session.refresh(transaction)

    if create_subscription:
        start_date = _parse_receipt_date(payload.receipt_date) or date.today()
        anchor_day = start_date.day
        anchor_month = start_date.month
        next_date = _next_subscription_date(start_date, anchor_day, anchor_month, subscription_period)
        sub_name = None
        if payload.note and payload.note.strip():
            sub_name = payload.note.strip()
        elif payload.merchant and payload.merchant.strip():
            sub_name = payload.merchant.strip()
        elif payload.category:
            sub_name = payload.category
        sub = Subscription(
            tg_user_id=user_id,
            name=sub_name,
            amount=amount_value,
            category=payload.category,
            note=payload.note,
            payment_method=payload.payment_method,
            merchant=payload.merchant,
            is_income=is_income,
            period=subscription_period,
            anchor_day=anchor_day,
            anchor_month=anchor_month,
            next_run_date=datetime.combine(next_date, datetime.min.time()),
            last_run_date=None,
            is_active=True,
            updated_at=datetime.utcnow(),
        )
        session.add(sub)
        session.commit()
        session.refresh(sub)
        transaction.subscription_id = sub.id
        transaction.updated_at = datetime.utcnow()
        session.add(transaction)
        session.commit()
        session.refresh(transaction)

    amount_out = f"{transaction.amount:.2f}" if transaction.amount is not None else None
    return TransactionResponse(
        id=transaction.id,
        check_id=transaction.check_id,
        amount=amount_out,
        url=transaction.url,
        receipt_date=transaction.receipt_date,
        check_xml=transaction.check_xml,
        merchant=transaction.merchant,
        type=transaction.type,
        is_income=transaction.is_income,
        category=transaction.category,
        note=transaction.note,
        payment_method=transaction.payment_method,
        created_at=transaction.created_at.isoformat(),
        updated_at=transaction.updated_at.isoformat(),
    )


@app.patch("/api/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    payload: TransactionUpdate,
    session: Session = Depends(get_session),
) -> TransactionResponse:
    user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)

    transaction = session.exec(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.tg_user_id == user_id,
        )
    ).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if payload.amount is not None:
        amount_value = _parse_amount(payload.amount)
        if amount_value is None or amount_value <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than 0")
        transaction.amount = amount_value

    if payload.check_id is not None:
        transaction.check_id = payload.check_id.strip() or None
    if payload.url is not None:
        transaction.url = payload.url
    if payload.receipt_date is not None:
        transaction.receipt_date = payload.receipt_date
    if payload.check_xml is not None:
        transaction.check_xml = payload.check_xml
    if payload.merchant is not None:
        transaction.merchant = payload.merchant
    if payload.type is not None:
        transaction.type = payload.type
        if payload.is_income is None:
            transaction.is_income = payload.type == "income"
    if payload.is_income is not None:
        transaction.is_income = payload.is_income
    if payload.category is not None:
        transaction.category = payload.category
    if payload.note is not None:
        transaction.note = payload.note
    if payload.payment_method is not None:
        transaction.payment_method = payload.payment_method

    transaction.updated_at = datetime.utcnow()
    session.add(transaction)
    session.commit()
    session.refresh(transaction)

    amount_out = f"{transaction.amount:.2f}" if transaction.amount is not None else None
    return TransactionResponse(
        id=transaction.id,
        check_id=transaction.check_id,
        amount=amount_out,
        url=transaction.url,
        receipt_date=transaction.receipt_date,
        check_xml=transaction.check_xml,
        merchant=transaction.merchant,
        type=transaction.type,
        is_income=transaction.is_income,
        category=transaction.category,
        note=transaction.note,
        payment_method=transaction.payment_method,
        created_at=transaction.created_at.isoformat(),
        updated_at=transaction.updated_at.isoformat(),
    )


@app.delete("/api/transactions/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            logger.warning("Delete transaction init_data_unsafe JSON decode failed: %s", exc)
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    transaction = session.exec(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.tg_user_id == user_id,
        )
    ).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    session.delete(transaction)
    session.commit()
    return {"ok": True}


@app.get("/api/expenses", response_model=List[TransactionResponse])
def list_expenses(
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    limit: Optional[int] = Query(None, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
) -> List[TransactionResponse]:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            logger.warning("Transactions init_data_unsafe JSON decode failed: %s", exc)
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    _touch_user(session, user_id, parsed_unsafe)
    _apply_due_subscriptions(user_id, session)

    statement = select(Transaction).where(Transaction.tg_user_id == user_id).order_by(Transaction.created_at.desc())
    if limit:
        statement = statement.offset(offset).limit(limit)
    rows = session.exec(statement).all()

    out: List[TransactionResponse] = []
    for row in rows:
        amount_out = f"{row.amount:.2f}" if row.amount is not None else None
        out.append(
            TransactionResponse(
                id=row.id,
                check_id=row.check_id,
                amount=amount_out,
                url=row.url,
                merchant=row.merchant,
                receipt_date=row.receipt_date,
                check_xml=row.check_xml,
                type=row.type,
                is_income=row.is_income,
                category=row.category,
                note=row.note,
                payment_method=row.payment_method,
                created_at=row.created_at.isoformat(),
                updated_at=row.updated_at.isoformat(),
            )
        )
    return out


@app.get("/api/auto_transactions", response_model=List[SubscriptionResponse])
def list_auto_transactions(
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    session: Session = Depends(get_session),
) -> List[SubscriptionResponse]:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    user = _touch_user(session, user_id, parsed_unsafe)
    if not user.is_premium:
        raise HTTPException(status_code=403, detail="Premium required")

    subs = session.exec(
        select(Subscription).where(Subscription.tg_user_id == user_id).order_by(Subscription.created_at.desc())
    ).all()

    out: List[SubscriptionResponse] = []
    for sub in subs:
        amount_out = f"{sub.amount:.2f}" if sub.amount is not None else "0.00"
        out.append(
            SubscriptionResponse(
                id=sub.id,
                name=sub.name,
                amount=amount_out,
                category=sub.category,
                note=sub.note,
                payment_method=sub.payment_method,
                merchant=sub.merchant,
                is_income=sub.is_income,
                period=sub.period,
                anchor_day=sub.anchor_day,
                anchor_month=sub.anchor_month,
                next_run_date=sub.next_run_date.isoformat() if sub.next_run_date else None,
                is_active=sub.is_active,
                created_at=sub.created_at.isoformat(),
                updated_at=sub.updated_at.isoformat(),
            )
        )
    return out


@app.patch("/api/auto_transactions/{subscription_id}", response_model=SubscriptionResponse)
def update_auto_transaction(
    subscription_id: int,
    payload: SubscriptionUpdate,
    session: Session = Depends(get_session),
) -> SubscriptionResponse:
    user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)
    user = _touch_user(session, user_id, payload.init_data_unsafe)
    if not user.is_premium:
        raise HTTPException(status_code=403, detail="Premium required")

    sub = session.exec(
        select(Subscription).where(
            Subscription.id == subscription_id,
            Subscription.tg_user_id == user_id,
        )
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Automatic transaction not found")

    if payload.amount is not None:
        amount_value = _parse_amount(payload.amount)
        if amount_value is None or amount_value <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than 0")
        sub.amount = amount_value

    if payload.name is not None:
        sub.name = payload.name.strip() or None

    if payload.category is not None:
        sub.category = payload.category
    if payload.note is not None:
        sub.note = payload.note
    if payload.payment_method is not None:
        sub.payment_method = payload.payment_method
    if payload.merchant is not None:
        sub.merchant = payload.merchant
    if payload.is_income is not None:
        sub.is_income = payload.is_income
    if payload.is_active is not None:
        sub.is_active = payload.is_active

    if payload.period is not None:
        next_period = payload.period.lower()
        if next_period not in {"monthly", "weekly", "yearly"}:
            raise HTTPException(status_code=400, detail="Invalid subscription period")
        sub.period = next_period

    if payload.start_date is not None:
        parsed_start = _parse_receipt_date(payload.start_date)
        if not parsed_start:
            raise HTTPException(status_code=400, detail="Invalid start_date")
        sub.anchor_day = parsed_start.day
        sub.anchor_month = parsed_start.month
        sub.next_run_date = datetime.combine(parsed_start, datetime.min.time())

    sub.updated_at = datetime.utcnow()
    session.add(sub)
    session.commit()
    session.refresh(sub)

    amount_out = f"{sub.amount:.2f}" if sub.amount is not None else "0.00"
    return SubscriptionResponse(
        id=sub.id,
        name=sub.name,
        amount=amount_out,
        category=sub.category,
        note=sub.note,
        payment_method=sub.payment_method,
        merchant=sub.merchant,
        is_income=sub.is_income,
        period=sub.period,
        anchor_day=sub.anchor_day,
        anchor_month=sub.anchor_month,
        next_run_date=sub.next_run_date.isoformat() if sub.next_run_date else None,
        is_active=sub.is_active,
        created_at=sub.created_at.isoformat(),
        updated_at=sub.updated_at.isoformat(),
    )


@app.delete("/api/auto_transactions/{subscription_id}")
def delete_auto_transaction(
    subscription_id: int,
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    session: Session = Depends(get_session),
) -> Dict[str, bool]:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    user = _touch_user(session, user_id, parsed_unsafe)
    if not user.is_premium:
        raise HTTPException(status_code=403, detail="Premium required")

    sub = session.exec(
        select(Subscription).where(
            Subscription.id == subscription_id,
            Subscription.tg_user_id == user_id,
        )
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Automatic transaction not found")

    session.delete(sub)
    session.commit()
    return {"ok": True}


@app.get("/api/budgets", response_model=List[BudgetItemResponse])
def list_budgets(
    month: Optional[str] = Query(None),
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    session: Session = Depends(get_session),
) -> List[BudgetItemResponse]:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            logger.warning("Budgets init_data_unsafe JSON decode failed: %s", exc)
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    month_value = _normalize_month(month)

    rows = session.exec(
        select(Budget)
        .where(Budget.tg_user_id == user_id, Budget.month == month_value)
        .order_by(Budget.category.asc())
    ).all()

    out: List[BudgetItemResponse] = []
    for row in rows:
        amount_out = f"{row.amount:.2f}" if row.amount is not None else "0.00"
        out.append(BudgetItemResponse(category=row.category, amount=amount_out))
    return out


@app.post("/api/budgets", response_model=BudgetItemResponse)
def upsert_budget(
    payload: BudgetUpsertRequest,
    session: Session = Depends(get_session),
) -> BudgetItemResponse:
    user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)
    month_value = _normalize_month(payload.month)
    category_value = payload.category.strip().lower()
    if not category_value:
        raise HTTPException(status_code=400, detail="Category is required")

    amount_value = _parse_amount(payload.amount)
    if amount_value is None or amount_value < 0:
        raise HTTPException(status_code=400, detail="Amount must be >= 0")

    existing = session.exec(
        select(Budget).where(
            Budget.tg_user_id == user_id,
            Budget.month == month_value,
            Budget.category == category_value,
        )
    ).first()

    if existing:
        existing.amount = amount_value
        existing.updated_at = datetime.utcnow()
        session.add(existing)
        session.commit()
        session.refresh(existing)
        amount_out = f"{existing.amount:.2f}" if existing.amount is not None else "0.00"
        return BudgetItemResponse(category=existing.category, amount=amount_out)

    row = Budget(
        tg_user_id=user_id,
        month=month_value,
        category=category_value,
        amount=amount_value,
        updated_at=datetime.utcnow(),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    amount_out = f"{row.amount:.2f}" if row.amount is not None else "0.00"
    return BudgetItemResponse(category=row.category, amount=amount_out)


@app.get("/api/budget_summary", response_model=BudgetSummaryResponse)
def budget_summary(
    month: Optional[str] = Query(None),
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    session: Session = Depends(get_session),
) -> BudgetSummaryResponse:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            logger.warning("Budget summary init_data_unsafe JSON decode failed: %s", exc)
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    _touch_user(session, user_id, parsed_unsafe)
    _apply_due_subscriptions(user_id, session)
    month_value = _normalize_month(month)
    start, end = _month_bounds(month_value)

    budget_rows = session.exec(
        select(Budget).where(Budget.tg_user_id == user_id, Budget.month == month_value)
    ).all()
    total_limit = sum((row.amount or Decimal("0.00")) for row in budget_rows)
    total_spent = Decimal("0.00")
    if _is_sqlite():
        effective_date = _effective_tx_date_expr()
        total_spent_value = session.exec(
            select(func.coalesce(func.sum(Transaction.amount), 0))
            .where(Transaction.tg_user_id == user_id)
            .where(Transaction.is_income.is_(False))
            .where(effective_date >= start.isoformat())
            .where(effective_date < end.isoformat())
        ).one()
        total_spent = Decimal(str(total_spent_value or 0))
    else:
        tx_rows = session.exec(
            select(Transaction).where(Transaction.tg_user_id == user_id)
        ).all()
        for tx in tx_rows:
            if tx.is_income:
                continue
            tx_date = _effective_tx_date(tx)
            if start <= tx_date < end:
                amount = tx.amount or Decimal("0.00")
                total_spent += amount

    remaining = total_limit - total_spent
    return BudgetSummaryResponse(
        month=month_value,
        total_limit=f"{total_limit:.2f}",
        total_spent=f"{total_spent:.2f}",
        remaining=f"{remaining:.2f}",
    )


@app.get("/api/budget_progress", response_model=BudgetProgressResponse)
def budget_progress(
    month: Optional[str] = Query(None),
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    session: Session = Depends(get_session),
) -> BudgetProgressResponse:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            logger.warning("Budget progress init_data_unsafe JSON decode failed: %s", exc)
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    _touch_user(session, user_id, parsed_unsafe)
    _apply_due_subscriptions(user_id, session)
    month_value = _normalize_month(month)
    start, end = _month_bounds(month_value)

    budget_rows = session.exec(
        select(Budget).where(Budget.tg_user_id == user_id, Budget.month == month_value)
    ).all()
    budget_map: Dict[str, Decimal] = {
        row.category: (row.amount or Decimal("0.00")) for row in budget_rows
    }

    spent_map: Dict[str, Decimal] = {}
    if _is_sqlite():
        effective_date = _effective_tx_date_expr()
        rows = session.exec(
            select(
                func.coalesce(func.nullif(Transaction.category, ""), literal("other")),
                func.coalesce(func.sum(Transaction.amount), 0),
            )
            .where(Transaction.tg_user_id == user_id)
            .where(Transaction.is_income.is_(False))
            .where(effective_date >= start.isoformat())
            .where(effective_date < end.isoformat())
            .group_by(func.coalesce(func.nullif(Transaction.category, ""), literal("other")))
        ).all()
        for category, total in rows:
            key = str(category or "other").strip().lower()
            spent_map[key] = Decimal(str(total or 0))
    else:
        tx_rows = session.exec(
            select(Transaction).where(Transaction.tg_user_id == user_id)
        ).all()
        for tx in tx_rows:
            if tx.is_income:
                continue
            tx_date = _effective_tx_date(tx)
            if not (start <= tx_date < end):
                continue
            category = (tx.category or "other").strip().lower()
            amount = tx.amount or Decimal("0.00")
            spent_map[category] = spent_map.get(category, Decimal("0.00")) + amount

    all_categories = sorted(set(budget_map.keys()) | set(spent_map.keys()))
    items: List[BudgetProgressItem] = []
    for category in all_categories:
        items.append(
            BudgetProgressItem(
                category=category,
                spent=f"{spent_map.get(category, Decimal('0.00')):.2f}",
                limit=f"{budget_map.get(category, Decimal('0.00')):.2f}",
            )
        )

    return BudgetProgressResponse(month=month_value, items=items)


def _parse_receipt_date(raw: Optional[str]) -> Optional[date]:
    if not raw:
        return None
    value = raw.strip()
    if not value:
        return None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            return None
    if re.fullmatch(r"\d{8}", value):
        try:
            return datetime.strptime(value, "%Y%m%d").date()
        except ValueError:
            return None
    try:
        parsed = datetime.fromisoformat(value)
        return parsed.date()
    except ValueError:
        return None


def _effective_tx_date(tx: Transaction) -> date:
    if not tx.is_income:
        receipt_date = _parse_receipt_date(tx.receipt_date)
        if receipt_date:
            return receipt_date
    return tx.created_at.date()


def _month_start(year: int, month: int) -> date:
    return date(year, month, 1)


def _next_month_start(year: int, month: int) -> date:
    if month == 12:
        return date(year + 1, 1, 1)
    return date(year, month + 1, 1)


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    total = (year * 12 + (month - 1)) + delta
    return divmod(total, 12)[0], divmod(total, 12)[1] + 1


def _normalize_month(value: Optional[str]) -> str:
    if value and re.fullmatch(r"\d{4}-\d{2}", value):
        return value
    now = datetime.utcnow()
    return f"{now.year:04d}-{now.month:02d}"


def _month_bounds(month_value: str) -> tuple[date, date]:
    year = int(month_value[:4])
    month = int(month_value[5:7])
    start = _month_start(year, month)
    end = _next_month_start(year, month)
    return start, end


def _is_sqlite() -> bool:
    return engine.dialect.name == "sqlite"


def _effective_tx_date_expr() -> Any:
    if not _is_sqlite():
        raise RuntimeError("SQL effective date expression is only supported for sqlite")
    normalized_receipt = case(
        (
            func.length(Transaction.receipt_date) == 8,
            func.printf(
                "%s-%s-%s",
                func.substr(Transaction.receipt_date, 1, 4),
                func.substr(Transaction.receipt_date, 5, 2),
                func.substr(Transaction.receipt_date, 7, 2),
            ),
        ),
        else_=Transaction.receipt_date,
    )
    receipt_date = func.date(normalized_receipt)
    created_date = func.date(Transaction.created_at)
    return case(
        (Transaction.is_income.is_(True), created_date),
        (receipt_date.is_(None), created_date),
        else_=receipt_date,
    )


def _resolve_month_window(month: str, now: datetime) -> tuple[Optional[date], Optional[date], Optional[date], Optional[date]]:
    if month == "all":
        return None, None, None, None
    if month == "current":
        year = now.year
        month_num = now.month
    else:
        year = int(month.split("-")[0])
        month_num = int(month.split("-")[1])
    current_start = _month_start(year, month_num)
    current_end = _next_month_start(year, month_num)
    prev_year, prev_month = _shift_month(year, month_num, -1)
    previous_start = _month_start(prev_year, prev_month)
    previous_end = _month_start(year, month_num)
    return current_start, current_end, previous_start, previous_end


def _month_key(dt: date) -> str:
    return f"{dt.year:04d}-{dt.month:02d}"


def _month_label(year: int, month: int) -> str:
    return date(year, month, 1).strftime("%b %y")


def _is_month_key(value: str) -> bool:
    return bool(re.match(r"^\d{4}-\d{2}$", value))


def _parse_receipt_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    raw = value.strip()
    if not raw:
        return None
    if re.fullmatch(r"\d{8}", raw):
        year = int(raw[:4])
        month = int(raw[4:6])
        day = int(raw[6:8])
        return date(year, month, day)
    try:
        parsed = datetime.fromisoformat(raw)
        return parsed.date()
    except ValueError:
        return None


def _last_day_of_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _add_months(base: date, months: int, anchor_day: int) -> date:
    year = base.year + (base.month - 1 + months) // 12
    month = (base.month - 1 + months) % 12 + 1
    day = min(anchor_day, _last_day_of_month(year, month))
    return date(year, month, day)


def _next_subscription_date(last_run: date, anchor_day: int, anchor_month: int, period: str) -> date:
    if period == "weekly":
        return last_run + timedelta(days=7)
    if period == "yearly":
        year = last_run.year + 1
        day = min(anchor_day, _last_day_of_month(year, anchor_month))
        return date(year, anchor_month, day)
    return _add_months(last_run, 1, anchor_day)


def _apply_due_subscriptions(user_id: int, session: Session) -> None:
    today = date.today()
    user = session.exec(select(User).where(User.tg_user_id == user_id)).first()
    if not user or not user.is_premium:
        return
    subs = session.exec(
        select(Subscription).where(
            Subscription.tg_user_id == user_id,
            Subscription.is_active.is_(True),
        )
    ).all()
    for sub in subs:
        if not sub.next_run_date:
            continue
        next_date = sub.next_run_date.date()
        if next_date > today:
            continue
        runs = 0
        while next_date <= today and runs < 24:
            tx = Transaction(
                tg_user_id=user_id,
                subscription_id=sub.id,
                check_id=None,
                amount=sub.amount,
                url=None,
                receipt_date=next_date.isoformat(),
                check_xml=None,
                merchant=sub.merchant,
                type="income" if sub.is_income else "subscription",
                is_income=sub.is_income,
                category=sub.category,
                note=sub.note,
                payment_method=sub.payment_method,
                created_at=datetime.combine(next_date, datetime.min.time()),
                updated_at=datetime.utcnow(),
            )
            session.add(tx)
            sub.last_run_date = datetime.combine(next_date, datetime.min.time())
            next_date = _next_subscription_date(next_date, sub.anchor_day, sub.anchor_month, sub.period)
            sub.next_run_date = datetime.combine(next_date, datetime.min.time())
            sub.updated_at = datetime.utcnow()
            runs += 1
        session.add(sub)
    session.commit()


@app.get("/api/transaction_totals", response_model=TransactionTotalsResponse)
def transaction_totals(
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    month: str = Query("current", pattern=r"^(current|all|\d{4}-\d{2})$"),
    session: Session = Depends(get_session),
) -> TransactionTotalsResponse:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            logger.warning("Totals init_data_unsafe JSON decode failed: %s", exc)
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    _touch_user(session, user_id, parsed_unsafe)
    _apply_due_subscriptions(user_id, session)
    now = datetime.utcnow()

    current_start, current_end, previous_start, previous_end = _resolve_month_window(month, now)

    current_income = Decimal("0.00")
    current_expense = Decimal("0.00")
    previous_income = Decimal("0.00")
    previous_expense = Decimal("0.00")
    if _is_sqlite():
        effective_date = _effective_tx_date_expr()
        base = select(
            func.coalesce(func.sum(case((Transaction.is_income.is_(True), Transaction.amount), else_=0)), 0),
            func.coalesce(func.sum(case((Transaction.is_income.is_(False), Transaction.amount), else_=0)), 0),
        ).where(Transaction.tg_user_id == user_id)
        if current_start is not None:
            current_stmt = (
                base.where(effective_date >= current_start.isoformat())
                .where(effective_date < current_end.isoformat())
            )
        else:
            current_stmt = base
        current_income_value, current_expense_value = session.exec(current_stmt).one()
        current_income = Decimal(str(current_income_value or 0))
        current_expense = Decimal(str(current_expense_value or 0))

        if previous_start is not None:
            previous_stmt = (
                base.where(effective_date >= previous_start.isoformat())
                .where(effective_date < previous_end.isoformat())
            )
            previous_income_value, previous_expense_value = session.exec(previous_stmt).one()
            previous_income = Decimal(str(previous_income_value or 0))
            previous_expense = Decimal(str(previous_expense_value or 0))
    else:
        rows = session.exec(select(Transaction).where(Transaction.tg_user_id == user_id)).all()
        for tx in rows:
            amount = tx.amount or Decimal("0.00")
            tx_date = _effective_tx_date(tx)
            if current_start is None or (current_start <= tx_date < current_end):
                if tx.is_income:
                    current_income += amount
                else:
                    current_expense += amount
            if previous_start is not None and previous_start <= tx_date < previous_end:
                if tx.is_income:
                    previous_income += amount
                else:
                    previous_expense += amount

    return TransactionTotalsResponse(
        current_income=f"{current_income:.2f}",
        current_expense=f"{current_expense:.2f}",
        previous_income=f"{previous_income:.2f}",
        previous_expense=f"{previous_expense:.2f}",
    )


@app.get("/api/transaction_category_totals", response_model=List[CategoryTotalResponse])
def transaction_category_totals(
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    month: str = Query("current", pattern=r"^(current|all|\d{4}-\d{2})$"),
    mode: str = Query("expense", pattern="^(expense|income)$"),
    session: Session = Depends(get_session),
) -> List[CategoryTotalResponse]:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            logger.warning("Category totals init_data_unsafe JSON decode failed: %s", exc)
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    now = datetime.utcnow()
    current_start, current_end, _, _ = _resolve_month_window(month, now)

    totals: Dict[str, Decimal] = {}
    if _is_sqlite():
        effective_date = _effective_tx_date_expr()
        label_default = "Income" if mode == "income" else "Other"
        label_expr = func.coalesce(func.nullif(Transaction.category, ""), literal(label_default))
        stmt = (
            select(label_expr, func.coalesce(func.sum(Transaction.amount), 0))
            .where(Transaction.tg_user_id == user_id)
            .where(Transaction.is_income.is_(mode == "income"))
            .group_by(label_expr)
        )
        if current_start is not None:
            stmt = (
                stmt.where(effective_date >= current_start.isoformat())
                .where(effective_date < current_end.isoformat())
            )
        rows = session.exec(stmt).all()
        for label, total in rows:
            totals[str(label)] = Decimal(str(total or 0))
    else:
        rows = session.exec(select(Transaction).where(Transaction.tg_user_id == user_id)).all()
        for tx in rows:
            if mode == "income" and not tx.is_income:
                continue
            if mode == "expense" and tx.is_income:
                continue
            tx_date = _effective_tx_date(tx)
            if current_start is not None and not (current_start <= tx_date < current_end):
                continue
            amount = tx.amount or Decimal("0.00")
            if mode == "income":
                key = tx.category or "Income"
            else:
                key = tx.category or "Other"
            totals[key] = totals.get(key, Decimal("0.00")) + amount

    return [
        CategoryTotalResponse(name=name, value=f"{value:.2f}")
        for name, value in sorted(totals.items(), key=lambda item: item[1], reverse=True)
    ]


@app.get("/api/transaction_monthly_trend", response_model=List[MonthlyTrendPoint])
def transaction_monthly_trend(
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    month: str = Query("current", pattern=r"^(current|all|\d{4}-\d{2})$"),
    months: int = Query(7, ge=1, le=24),
    session: Session = Depends(get_session),
) -> List[MonthlyTrendPoint]:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            logger.warning("Monthly trend init_data_unsafe JSON decode failed: %s", exc)
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    now = datetime.utcnow()

    if month in ("current", "all"):
        end_year = now.year
        end_month = now.month
    else:
        end_year = int(month.split("-")[0])
        end_month = int(month.split("-")[1])

    points: List[MonthlyTrendPoint] = []
    if _is_sqlite():
        effective_date = _effective_tx_date_expr()
        start_year, start_month = _shift_month(end_year, end_month, -(months - 1))
        range_start = _month_start(start_year, start_month).isoformat()
        range_end = _next_month_start(end_year, end_month).isoformat()
        month_key_expr = func.strftime("%Y-%m", effective_date)
        stmt = (
            select(
                month_key_expr,
                func.coalesce(func.sum(case((Transaction.is_income.is_(True), Transaction.amount), else_=0)), 0),
                func.coalesce(func.sum(case((Transaction.is_income.is_(False), Transaction.amount), else_=0)), 0),
            )
            .where(Transaction.tg_user_id == user_id)
            .where(effective_date >= range_start)
            .where(effective_date < range_end)
            .group_by(month_key_expr)
        )
        rows = session.exec(stmt).all()
        totals_by_month: Dict[str, Dict[str, Decimal]] = {}
        for key, income_total, expense_total in rows:
            totals_by_month[str(key)] = {
                "income": Decimal(str(income_total or 0)),
                "expense": Decimal(str(expense_total or 0)),
            }

        for offset in range(months - 1, -1, -1):
            year, month_num = _shift_month(end_year, end_month, -offset)
            key = f"{year:04d}-{month_num:02d}"
            totals = totals_by_month.get(key, {"income": Decimal("0.00"), "expense": Decimal("0.00")})
            label = _month_start(year, month_num).strftime("%b")
            points.append(
                MonthlyTrendPoint(
                    month=label,
                    income=f"{totals['income']:.2f}",
                    expenses=f"{totals['expense']:.2f}",
                )
            )
    else:
        rows = session.exec(select(Transaction).where(Transaction.tg_user_id == user_id)).all()
        for offset in range(months - 1, -1, -1):
            year, month_num = _shift_month(end_year, end_month, -offset)
            start = _month_start(year, month_num)
            end = _next_month_start(year, month_num)
            income_total = Decimal("0.00")
            expense_total = Decimal("0.00")
            for tx in rows:
                tx_date = _effective_tx_date(tx)
                if not (start <= tx_date < end):
                    continue
                amount = tx.amount or Decimal("0.00")
                if tx.is_income:
                    income_total += amount
                else:
                    expense_total += amount
            label = start.strftime("%b")
            points.append(
                MonthlyTrendPoint(
                    month=label,
                    income=f"{income_total:.2f}",
                    expenses=f"{expense_total:.2f}",
                )
            )

    return points


@app.get("/api/analytics", response_model=AnalyticsResponse)
def analytics_summary(
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    month: str = Query("current", pattern=r"^(current|all|\d{4}-\d{2})$"),
    mode: str = Query("expense", pattern="^(expense|income)$"),
    months: int = Query(7, ge=1, le=24),
    session: Session = Depends(get_session),
) -> AnalyticsResponse:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            logger.warning("Analytics init_data_unsafe JSON decode failed: %s", exc)
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)
    _touch_user(session, user_id, parsed_unsafe)
    _apply_due_subscriptions(user_id, session)
    now = datetime.utcnow()
    current_start, current_end, previous_start, previous_end = _resolve_month_window(month, now)
    has_data = False

    month_totals: Dict[str, Dict[str, Decimal]] = {}
    categories: Dict[str, Decimal] = {}
    current_income = Decimal("0.00")
    current_expense = Decimal("0.00")
    previous_income = Decimal("0.00")
    previous_expense = Decimal("0.00")

    if _is_sqlite():
        effective_date = _effective_tx_date_expr()
        has_data = (
            session.exec(
                select(Transaction.id).where(Transaction.tg_user_id == user_id).limit(1)
            ).first()
            is not None
        )

        totals_stmt = select(
            func.coalesce(func.sum(case((Transaction.is_income.is_(True), Transaction.amount), else_=0)), 0),
            func.coalesce(func.sum(case((Transaction.is_income.is_(False), Transaction.amount), else_=0)), 0),
        ).where(Transaction.tg_user_id == user_id)

        if current_start is not None:
            current_stmt = (
                totals_stmt.where(effective_date >= current_start.isoformat())
                .where(effective_date < current_end.isoformat())
            )
        else:
            current_stmt = totals_stmt
        current_income_value, current_expense_value = session.exec(current_stmt).one()
        current_income = Decimal(str(current_income_value or 0))
        current_expense = Decimal(str(current_expense_value or 0))

        if previous_start is not None:
            previous_stmt = (
                totals_stmt.where(effective_date >= previous_start.isoformat())
                .where(effective_date < previous_end.isoformat())
            )
            previous_income_value, previous_expense_value = session.exec(previous_stmt).one()
            previous_income = Decimal(str(previous_income_value or 0))
            previous_expense = Decimal(str(previous_expense_value or 0))

        label_default = "Income" if mode == "income" else "Other"
        label_expr = func.coalesce(func.nullif(Transaction.category, ""), literal(label_default))
        cat_stmt = (
            select(label_expr, func.coalesce(func.sum(Transaction.amount), 0))
            .where(Transaction.tg_user_id == user_id)
            .where(Transaction.is_income.is_(mode == "income"))
            .group_by(label_expr)
        )
        if current_start is not None:
            cat_stmt = (
                cat_stmt.where(effective_date >= current_start.isoformat())
                .where(effective_date < current_end.isoformat())
            )
        for label, total in session.exec(cat_stmt).all():
            categories[str(label)] = Decimal(str(total or 0))

        if month in ("current", "all"):
            end_year = now.year
            end_month = now.month
        else:
            end_year = int(month.split("-")[0])
            end_month = int(month.split("-")[1])
        start_year, start_month = _shift_month(end_year, end_month, -(months - 1))
        range_start = _month_start(start_year, start_month).isoformat()
        range_end = _next_month_start(end_year, end_month).isoformat()
        month_key_expr = func.strftime("%Y-%m", effective_date)
        month_stmt = (
            select(
                month_key_expr,
                func.coalesce(func.sum(case((Transaction.is_income.is_(True), Transaction.amount), else_=0)), 0),
                func.coalesce(func.sum(case((Transaction.is_income.is_(False), Transaction.amount), else_=0)), 0),
            )
            .where(Transaction.tg_user_id == user_id)
            .where(effective_date >= range_start)
            .where(effective_date < range_end)
            .group_by(month_key_expr)
        )
        for key, income_total, expense_total in session.exec(month_stmt).all():
            if not key:
                continue
            key_str = str(key)
            if not _is_month_key(key_str):
                continue
            month_totals[key_str] = {
                "income": Decimal(str(income_total or 0)),
                "expense": Decimal(str(expense_total or 0)),
            }
    else:
        rows = session.exec(select(Transaction).where(Transaction.tg_user_id == user_id)).all()
        has_data = bool(rows)
        for tx in rows:
            amount = tx.amount or Decimal("0.00")
            tx_date = _effective_tx_date(tx)
            month_key = _month_key(tx_date)
            bucket = month_totals.setdefault(month_key, {"income": Decimal("0.00"), "expense": Decimal("0.00")})
            if tx.is_income:
                bucket["income"] += amount
            else:
                bucket["expense"] += amount

            if current_start is None or (current_start <= tx_date < current_end):
                if tx.is_income:
                    current_income += amount
                else:
                    current_expense += amount
                if mode == "income" and tx.is_income:
                    key = tx.category or "Income"
                    categories[key] = categories.get(key, Decimal("0.00")) + amount
                if mode == "expense" and not tx.is_income:
                    key = tx.category or "Other"
                    categories[key] = categories.get(key, Decimal("0.00")) + amount

            if previous_start is not None and previous_start <= tx_date < previous_end:
                if tx.is_income:
                    previous_income += amount
                else:
                    previous_expense += amount

    if month in ("current", "all"):
        end_year = now.year
        end_month = now.month
    else:
        end_year = int(month.split("-")[0])
        end_month = int(month.split("-")[1])

    trend: List[MonthlyTrendPoint] = []
    for offset in range(months - 1, -1, -1):
        year, month_num = _shift_month(end_year, end_month, -offset)
        key = f"{year:04d}-{month_num:02d}"
        totals = month_totals.get(key, {"income": Decimal("0.00"), "expense": Decimal("0.00")})
        trend.append(
            MonthlyTrendPoint(
                month=_month_label(year, month_num).split(" ")[0],
                income=f"{totals['income']:.2f}",
                expenses=f"{totals['expense']:.2f}",
            )
        )

    month_set = set()
    for i in range(12):
        year, month_num = _shift_month(now.year, now.month, -i)
        month_set.add(f"{year:04d}-{month_num:02d}")
    for key in month_totals.keys():
        if _is_month_key(key):
            month_set.add(key)
    if _is_sqlite():
        effective_date = _effective_tx_date_expr()
        month_key_expr = func.strftime("%Y-%m", effective_date)
        for row in session.exec(
            select(month_key_expr)
            .where(Transaction.tg_user_id == user_id)
            .group_by(month_key_expr)
        ).all():
            key = row[0] if hasattr(row, "_mapping") else row
            if key:
                key_str = str(key)
                if _is_month_key(key_str):
                    month_set.add(key_str)
    month_keys = sorted(month_set, reverse=True)
    month_options = [MonthOption(value="all", label="All")]
    month_options.extend(
        MonthOption(value=key, label=_month_label(int(key.split("-")[0]), int(key.split("-")[1])))
        for key in month_keys
    )
    default_month = f"{now.year:04d}-{now.month:02d}"

    category_list = [
        CategoryTotalResponse(name=name, value=f"{value:.2f}")
        for name, value in sorted(categories.items(), key=lambda item: item[1], reverse=True)
    ]

    totals = TransactionTotalsResponse(
        current_income=f"{current_income:.2f}",
        current_expense=f"{current_expense:.2f}",
        previous_income=f"{previous_income:.2f}",
        previous_expense=f"{previous_expense:.2f}",
    )

    return AnalyticsResponse(
        totals=totals,
        categories=category_list,
        trend=trend,
        months=month_options,
        default_month=default_month,
        has_data=has_data,
    )


@app.post("/api/seed_demo_transactions")
def seed_demo_transactions(
    payload: TransactionCreate,
    force: bool = Query(False),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)

    if not force:
        existing = session.exec(
            select(Transaction).where(Transaction.tg_user_id == user_id).limit(1)
        ).first()
        if existing:
            return {"status": "skipped", "message": "Transactions already exist."}

    now = datetime.utcnow()
    current_month = now.month
    current_year = now.year
    last_month = current_month - 1
    last_year = current_year
    if last_month == 0:
        last_month = 12
        last_year -= 1

    categories = ["Food", "Transport", "Shopping", "Bills", "Other"]
    income_categories = ["Salary", "Freelance", "Investment"]

    seed_rows: list[Transaction] = []
    for day in range(1, 21):
        seed_rows.append(
            Transaction(
                tg_user_id=user_id,
                check_id=None,
                amount=randint(80, 650),
                url=None,
                receipt_date=f"{current_year:04d}-{current_month:02d}-{day:02d}",
                check_xml=None,
                merchant=None,
                type="manual",
                is_income=False,
                category=choice(categories),
                note="demo_seed",
                payment_method="Card",
                created_at=datetime(current_year, current_month, day),
                updated_at=datetime(current_year, current_month, day),
            )
        )

    for day in range(1, 6):
        seed_rows.append(
            Transaction(
                tg_user_id=user_id,
                check_id=None,
                amount=randint(3000, 12000),
                url=None,
                receipt_date=f"{current_year:04d}-{current_month:02d}-{day * 4:02d}",
                check_xml=None,
                merchant=None,
                type="income",
                is_income=True,
                category=choice(income_categories),
                note="demo_seed",
                payment_method="Card",
                created_at=datetime(current_year, current_month, day * 4),
                updated_at=datetime(current_year, current_month, day * 4),
            )
        )

    for day in range(1, 21):
        seed_rows.append(
            Transaction(
                tg_user_id=user_id,
                check_id=None,
                amount=randint(90, 700),
                url=None,
                receipt_date=f"{last_year:04d}-{last_month:02d}-{day:02d}",
                check_xml=None,
                merchant=None,
                type="manual",
                is_income=False,
                category=choice(categories),
                note="demo_seed",
                payment_method="Card",
                created_at=datetime(last_year, last_month, day),
                updated_at=datetime(last_year, last_month, day),
            )
        )

    for day in range(1, 5):
        seed_rows.append(
            Transaction(
                tg_user_id=user_id,
                check_id=None,
                amount=randint(2800, 11000),
                url=None,
                receipt_date=f"{last_year:04d}-{last_month:02d}-{day * 5:02d}",
                check_xml=None,
                merchant=None,
                type="income",
                is_income=True,
                category=choice(income_categories),
                note="demo_seed",
                payment_method="Card",
                created_at=datetime(last_year, last_month, day * 5),
                updated_at=datetime(last_year, last_month, day * 5),
            )
        )

    session.add_all(seed_rows)
    session.commit()
    return {"status": "seeded", "count": len(seed_rows)}


if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
else:
    logger.warning("Frontend build not found at %s", frontend_dist)

    @app.get("/")
    def frontend_missing() -> Dict[str, str]:
        raise HTTPException(
            status_code=503,
            detail="Frontend build not found. Run: cd figma_design && npm install && npm run build",
        )
