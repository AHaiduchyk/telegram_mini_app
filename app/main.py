from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, urlparse

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from selenium.webdriver.common.action_chains import ActionChains
from seleniumbase import SB
from sqlmodel import Session, select

from app.auth import InitDataValidationError, extract_user_id, validate_init_data, validate_init_data_unsafe
from app.db import get_session, init_db
from app.models import Scan, TaxCheck
from app.qr_parse import parse_qr_text

logger = logging.getLogger("qr_scanner")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Telegram QR Scanner", debug=False)

# --- Static (Mini App) ---
static_dir = Path(__file__).resolve().parent.parent / "web"
if static_dir.exists():
    app.mount("/css", StaticFiles(directory=static_dir / "css"), name="css")
    app.mount("/js", StaticFiles(directory=static_dir / "js"), name="js")
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

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


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/")
def root() -> FileResponse:
    index_path = static_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="index.html not found")


@app.exception_handler(Exception)
def unhandled_exception_handler(_: Request, __: Exception) -> JSONResponse:
    logger.exception("Unhandled error")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.middleware("http")
async def add_ngrok_skip_header(request: Request, call_next):  # type: ignore[no-untyped-def]
    response = await call_next(request)
    response.headers["ngrok-skip-browser-warning"] = "1"
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
        raise HTTPException(status_code=500, detail="BOT_TOKEN is not configured")

    try:
        if init_data:
            fields = validate_init_data(init_data, bot_token)
        elif init_data_unsafe:
            fields = validate_init_data_unsafe(init_data_unsafe, bot_token)
        else:
            raise InitDataValidationError("Missing initData", status_code=401)
        return extract_user_id(fields)
    except InitDataValidationError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


def extract_check_id(check_url: str) -> str:
    parsed = urlparse(check_url)
    qs = parse_qs(parsed.query)
    check_id = (qs.get("id") or [None])[0]
    if not check_id:
        raise HTTPException(status_code=400, detail="Invalid check URL (missing id)")
    return str(check_id)


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
            is_saved=True,
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
        row.is_saved = True
        row.xml_text = xml_text
        row.updated_at = now

    session.commit()
    session.refresh(row)
    return row


def _status_map_for_user(session: Session, tg_user_id: int) -> Dict[str, Dict[str, bool]]:
    stmt = select(TaxCheck).where(TaxCheck.tg_user_id == tg_user_id)
    rows = session.exec(stmt).all()
    out: Dict[str, Dict[str, bool]] = {}
    for r in rows:
        out[r.id] = {"founded": bool(r.is_founded), "saved": bool(r.is_saved)}
    return out


@app.post("/api/scan", response_model=ScanResponse)
def create_scan(payload: ScanCreate, session: Session = Depends(get_session)) -> ScanResponse:
    user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)

    text = payload.raw_text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty QR text")
    if len(text) > 4096:
        raise HTTPException(status_code=400, detail="QR text too long")

    qr_type, info = parse_qr_text(text)

    scan = Scan(
        tg_user_id=user_id,
        raw_text=text,
        type=qr_type,
        info=info,
    )
    session.add(scan)
    session.commit()
    session.refresh(scan)

    return ScanResponse(
        id=scan.id,
        raw_text=scan.raw_text,
        type=scan.type,
        info=scan.info,
        created_at=scan.created_at.isoformat(),
    )


@app.get("/api/history", response_model=List[ScanResponse])
def get_history(
    init_data: Optional[str] = Query(None, alias="init_data"),
    init_data_unsafe: Optional[str] = Query(None, alias="init_data_unsafe"),
    session: Session = Depends(get_session),
) -> List[ScanResponse]:
    parsed_unsafe: Optional[Dict[str, Any]] = None
    if init_data_unsafe:
        try:
            parsed_unsafe = json.loads(init_data_unsafe)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid init_data_unsafe") from exc

    user_id = get_verified_user_id(init_data, parsed_unsafe)

    status_map = _status_map_for_user(session, user_id)

    statement = select(Scan).where(Scan.tg_user_id == user_id).order_by(Scan.created_at.desc())
    scans = session.exec(statement).all()

    out: List[ScanResponse] = []
    for s in scans:
        info = dict(s.info or {})
        try:
            if s.raw_text and "cabinet.tax.gov.ua/cashregs/check" in s.raw_text:
                cid = extract_check_id(s.raw_text)
                info["check_id"] = cid
                info["check_status"] = status_map.get(cid, {"founded": False, "saved": False})
        except Exception:
            pass

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
        info=scan.info,
        created_at=scan.created_at.isoformat(),
    )


@app.post("/api/find_check")
def find_check(payload: FindCheckRequest, session: Session = Depends(get_session)) -> Dict[str, Any]:
    user_id = get_verified_user_id(payload.init_data, payload.init_data_unsafe)

    validate_check_url(payload.check_url)
    check_id = extract_check_id(payload.check_url)

    existing = session.get(TaxCheck, check_id)
    if existing and existing.tg_user_id == user_id and existing.is_founded and existing.xml_text:
        return {
            "ok": True,
            "message": "Check already founded",
            "url": existing.check_url,
            "check_id": existing.id,
            "text": existing.xml_text,
            "founded": bool(existing.is_founded),
            "saved": bool(existing.is_saved),
        }

    base = Path(os.getenv("DOWNLOAD_DIR", "downloaded_files"))
    downloader = TaxGovXmlDownloader(download_dir=base, headless=True)

    result = downloader.fetch(payload.check_url)

    raw = result.xml_path.read_bytes()
    xml_text = decode_xml_bytes(raw)
    if not xml_text:
        raise HTTPException(status_code=422, detail="Downloaded XML is empty")

    row = _upsert_taxcheck_founded(
        session=session,
        tg_user_id=user_id,
        check_id=check_id,
        check_url=payload.check_url,
        xml_text=xml_text,
    )

    return {
        "ok": True,
        "message": "Check found and XML downloaded",
        "url": payload.check_url,
        "check_id": check_id,
        "text": xml_text,
        "filename": result.xml_path.name,
        "founded": bool(row.is_founded),
        "saved": bool(row.is_saved),
    }


@app.post("/api/save_check")
def save_check(payload: SaveCheckRequest, session: Session = Depends(get_session)) -> Dict[str, Any]:
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

    scan = Scan(
        tg_user_id=user_id,
        raw_text=payload.check_url,
        type="tax_receipt_xml",
        info={
            "check_id": check_id,
            "source_url": payload.check_url,
            "saved": True,
        },
    )
    session.add(scan)
    session.commit()

    return {
        "ok": True,
        "message": "Saved",
        "url": row.check_url,
        "check_id": row.id,
        "founded": bool(row.is_founded),
        "saved": bool(row.is_saved),
    }
