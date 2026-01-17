from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, List

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session, init_db
from app.models import Scan
from app.qr_parse import parse_qr_text

logger = logging.getLogger("qr_scanner")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Telegram QR Scanner", debug=False)

static_dir = Path(__file__).resolve().parent.parent / "web"
if static_dir.exists():
    app.mount("/web", StaticFiles(directory=static_dir, html=True), name="web")

miniapp_origin = os.getenv("MINIAPP_ORIGIN", "")
allow_origins = [miniapp_origin] if miniapp_origin else []

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class ScanCreate(BaseModel):
    raw_text: str = Field(..., max_length=4096)
    tg_user_id: int
    timestamp: str | None = None


class ScanResponse(BaseModel):
    id: int
    raw_text: str
    type: str
    info: Dict[str, Any]
    created_at: str


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


@app.post("/api/scan", response_model=ScanResponse)
def create_scan(payload: ScanCreate, session: Session = Depends(get_session)) -> ScanResponse:
    if not payload.tg_user_id:
        raise HTTPException(status_code=400, detail="Missing tg_user_id")
    text = payload.raw_text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty QR text")
    if len(text) > 4096:
        raise HTTPException(status_code=400, detail="QR text too long")

    qr_type, info = parse_qr_text(text)

    # Hook for custom post-processing or enrichment logic.
    # You can modify `info` or add additional keys based on your business rules.

    scan = Scan(
        tg_user_id=payload.tg_user_id,
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
    user_id: int = Query(..., alias="user_id"),
    session: Session = Depends(get_session),
) -> List[ScanResponse]:
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user_id")
    statement = select(Scan).where(Scan.tg_user_id == user_id).order_by(Scan.created_at.desc())
    scans = session.exec(statement).all()
    return [
        ScanResponse(
            id=scan.id,
            raw_text=scan.raw_text,
            type=scan.type,
            info=scan.info,
            created_at=scan.created_at.isoformat(),
        )
        for scan in scans
    ]


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
