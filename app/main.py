from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime
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

from app.auth import InitDataValidationError, extract_user_id, validate_init_data, validate_init_data_unsafe
from app.categorizer import build_category_maps, get_or_predict_category_cached, OTHER_PATH
from app.db import engine, get_session, init_db
from app.models import Expense, Scan, TaxCheck
from app.qr_parse import parse_qr_text
from app.tax_xml_parser import parse_tax_xml

logger = logging.getLogger("qr_scanner")
logging.basicConfig(level=logging.INFO)

load_dotenv()

app = FastAPI(title="Telegram QR Scanner", debug=False)

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


class ExpenseCreate(BaseModel):
    init_data: Optional[str] = None
    init_data_unsafe: Optional[Dict[str, Any]] = None
    check_id: str = Field(..., max_length=255)
    amount: Optional[str] = Field(default=None, max_length=64)
    url: Optional[str] = Field(default=None, max_length=4096)
    merchant: Optional[str] = Field(default=None, max_length=255)
    receipt_date: Optional[str] = Field(default=None, max_length=32)
    type: str = Field(default="qr_scan", max_length=32)
    confirm_duplicate: bool = False


class ExpenseResponse(BaseModel):
    id: int
    check_id: str
    amount: Optional[str]
    url: Optional[str]
    merchant: Optional[str]
    receipt_date: Optional[str]
    type: str
    created_at: str




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


def _parse_amount(value: Optional[str]) -> Optional[Decimal]:
    if value is None:
        return None
    try:
        return Decimal(str(value).replace(",", ".")).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
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
        return value
    if isinstance(value, (int, float)):
        try:
            return Decimal(str(value))
        except Exception:
            return None
    if isinstance(value, str):
        cleaned = value.strip().replace(",", ".")
        if not cleaned:
            return None
        try:
            return Decimal(cleaned)
        except Exception:
            return None
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
    if isinstance(info, dict):
        check_id = info.get("check_id") or info.get("id")
        if not check_id and isinstance(info.get("url"), str):
            check_id = _try_extract_check_id(info["url"])
        if check_id:
            info["check_id"] = str(check_id)

    scan: Scan
    if check_id:
        stmt = select(Scan).where(Scan.tg_user_id == user_id).order_by(Scan.created_at.desc())
        existing = None
        for s in session.exec(stmt).all():
            if _scan_check_id(s) == str(check_id):
                existing = s
                break
        if existing:
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


@app.post("/api/expense", response_model=ExpenseResponse)
def create_expense(
    payload: ExpenseCreate,
    session: Session = Depends(get_session),
) -> ExpenseResponse:
    user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)

    check_id = payload.check_id.strip()
    if not check_id:
        raise HTTPException(status_code=400, detail="Missing check_id")

    existing = session.exec(
        select(Expense).where(
            Expense.tg_user_id == user_id,
            Expense.check_id == check_id,
        )
    ).all()
    existing_count = len(existing)
    if existing_count and not payload.confirm_duplicate:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Expense already exists",
                "existing_count": existing_count,
            },
        )

    amount_value = _parse_amount(payload.amount)
    expense = Expense(
        tg_user_id=user_id,
        check_id=check_id,
        amount=amount_value,
        url=payload.url,
        merchant=payload.merchant,
        receipt_date=payload.receipt_date,
        type=payload.type or "qr_scan",
    )
    session.add(expense)
    session.commit()
    session.refresh(expense)

    amount_out = f"{expense.amount:.2f}" if expense.amount is not None else None
    return ExpenseResponse(
        id=expense.id,
        check_id=expense.check_id,
        amount=amount_out,
        url=expense.url,
        merchant=expense.merchant,
        receipt_date=expense.receipt_date,
        type=expense.type,
        created_at=expense.created_at.isoformat(),
    )


@app.get("/api/expenses", response_model=List[ExpenseResponse])
def list_expenses(
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    limit: Optional[int] = Query(None, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
) -> List[ExpenseResponse]:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            logger.warning("Expenses init_data_unsafe JSON decode failed: %s", exc)
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)

    statement = select(Expense).where(Expense.tg_user_id == user_id).order_by(Expense.created_at.desc())
    if limit:
        statement = statement.offset(offset).limit(limit)
    rows = session.exec(statement).all()

    out: List[ExpenseResponse] = []
    for row in rows:
        amount_out = f"{row.amount:.2f}" if row.amount is not None else None
        out.append(
            ExpenseResponse(
                id=row.id,
                check_id=row.check_id,
                amount=amount_out,
                url=row.url,
                merchant=row.merchant,
                receipt_date=row.receipt_date,
                type=row.type,
                created_at=row.created_at.isoformat(),
            )
        )
    return out


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
