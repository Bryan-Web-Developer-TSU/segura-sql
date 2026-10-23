"""SeguraSQL - Panel web para pruebas seguras de pentesting SQL basado en sqlmap.

Uso:
    python app.py
y abre http://127.0.0.1:8776 en el navegador.

Solo para uso en sistemas sobre los que tengas autorizacion explicita.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from security_controls import (
    SAFE_MODE_BLOCKED,
    SAFE_MODE_MAX_RISK,
    audit,
    host_in_scope,
    load_scope,
    validate_options,
)
from sqlmap_client import SqlmapApiClient, SqlmapApiError

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
WEB_HOST = "127.0.0.1"
WEB_PORT = 8776

sqlmap = SqlmapApiClient()
SCANS: dict[str, dict] = {}  # taskid -> metadatos del escaneo


@asynccontextmanager
async def lifespan(_: FastAPI):
    sqlmap.start()
    yield
    sqlmap.stop()


app = FastAPI(
    title="SeguraSQL",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


class Authorization(BaseModel):
    confirmed: bool = False
    reference: str = ""


class ScanRequest(BaseModel):
    options: dict = {}
    authorization: Authorization = Authorization()
    safeMode: bool = True
    advancedAcknowledged: bool = False
    allowDataExtraction: bool = False


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def _api_http_error(exc: SqlmapApiError) -> HTTPException:
    return HTTPException(status_code=502, detail=f"Error de sqlmapapi: {exc}")


# ----------------------------------------------------------------------
# API
# ----------------------------------------------------------------------

@app.get("/api/health")
def health():
    try:
        version = sqlmap.version()
    except SqlmapApiError as exc:
        return {"ok": False, "detail": str(exc)}
    entries = load_scope()
    return {
        "ok": True,
        "sqlmapVersion": version.get("version"),
        "apiVersion": version.get("api_version"),
        "scope": {"enforced": bool(entries), "entries": entries},
        "safeModeMaxRisk": SAFE_MODE_MAX_RISK,
        "blockedInSafeMode": SAFE_MODE_BLOCKED,
    }


@app.post("/api/scans", status_code=201)
def create_scan(req: ScanRequest):
    if not req.authorization.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Debes confirmar que tienes autorizacion explicita y por escrito "
                   "para probar el objetivo.",
        )

    errors, options, host = validate_options(req.model_dump())

    entries = load_scope()
    if host and entries and not host_in_scope(host, entries):
        errors.append(
            f"El objetivo '{host}' no esta en el alcance autorizado (scope.txt). "
            f"Entradas permitidas: {', '.join(entries)}"
        )

    if errors:
        audit(
            "scan_rejected",
            target=options.get("url", ""),
            reference=req.authorization.reference.strip(),
            errors=errors,
        )
        raise HTTPException(status_code=400, detail=errors)

    try:
        taskid = sqlmap.task_new()["taskid"]
        sqlmap.scan_start(taskid, options)
    except SqlmapApiError as exc:
        raise _api_http_error(exc)

    meta = {
        "taskid": taskid,
        "target": options.get("url"),
        "startedAt": _now(),
        "safeMode": req.safeMode,
        "reference": req.authorization.reference.strip(),
        "options": sorted(k for k in options if k != "batch"),
    }
    SCANS[taskid] = meta
    audit(
        "scan_start",
        taskid=taskid,
        target=meta["target"],
        safe_mode=req.safeMode,
        reference=meta["reference"],
        scope_enforced=bool(entries),
        options=sorted(options),
    )
    return meta


@app.get("/api/scans")
def list_scans():
    out = []
    for taskid, meta in SCANS.items():
        try:
            status = sqlmap.scan_status(taskid).get("status", "desconocido")
        except SqlmapApiError:
            status = "error"
        out.append({**meta, "status": status})
    return sorted(out, key=lambda s: s["startedAt"], reverse=True)


@app.get("/api/scans/{taskid}")
def scan_detail(taskid: str):
    if taskid not in SCANS:
        raise HTTPException(status_code=404, detail="Escaneo no encontrado.")
    try:
        status = sqlmap.scan_status(taskid)
        log = sqlmap.scan_log(taskid).get("log", [])
    except SqlmapApiError as exc:
        raise _api_http_error(exc)
    return {
        "meta": SCANS[taskid],
        "status": status.get("status"),
        "returncode": status.get("returncode"),
        "log": log,
    }


@app.get("/api/scans/{taskid}/data")
def scan_data(taskid: str):
    if taskid not in SCANS:
        raise HTTPException(status_code=404, detail="Escaneo no encontrado.")
    try:
        return sqlmap.scan_data(taskid)
    except SqlmapApiError as exc:
        raise _api_http_error(exc)


@app.post("/api/scans/{taskid}/stop")
def scan_stop(taskid: str):
    if taskid not in SCANS:
        raise HTTPException(status_code=404, detail="Escaneo no encontrado.")
    try:
        result = sqlmap.scan_stop(taskid)
    except SqlmapApiError as exc:
        raise _api_http_error(exc)
    audit("scan_stop", taskid=taskid, target=SCANS[taskid]["target"])
    return result


@app.post("/api/scans/{taskid}/kill")
def scan_kill(taskid: str):
    if taskid not in SCANS:
        raise HTTPException(status_code=404, detail="Escaneo no encontrado.")
    try:
        result = sqlmap.scan_kill(taskid)
    except SqlmapApiError as exc:
        raise _api_http_error(exc)
    audit("scan_kill", taskid=taskid, target=SCANS[taskid]["target"])
    return result


@app.delete("/api/scans/{taskid}")
def scan_delete(taskid: str):
    if taskid not in SCANS:
        raise HTTPException(status_code=404, detail="Escaneo no encontrado.")
    try:
        sqlmap.task_delete(taskid)
    except SqlmapApiError as exc:
        raise _api_http_error(exc)
    audit("scan_delete", taskid=taskid, target=SCANS[taskid]["target"])
    del SCANS[taskid]
    return {"success": True}


# ----------------------------------------------------------------------
# Frontend estatico
# ----------------------------------------------------------------------

@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    print(f"[*] SeguraSQL disponible en http://{WEB_HOST}:{WEB_PORT}")
    print("[*] Pulsa Ctrl+C para detener la aplicacion y la API de sqlmap.")
    uvicorn.run(app, host=WEB_HOST, port=WEB_PORT, log_level="warning")
