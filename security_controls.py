"""Controles de seguridad de SeguraSQL.

Capa de proteccion para que las pruebas sean SEGURAS y AUTORIZADAS:

- Lista blanca de opciones de sqlmap: el cliente nunca puede enviar opciones
  arbitrarias al motor.
- Modo seguro (por defecto): bloquea opciones que ejecutan codigo, escriben
  archivos o modifican el sistema objetivo, y limita el riesgo a 2.
- Extraccion de datos (--dump): requiere una confirmacion adicional.
- Alcance (scope): si scope.txt contiene entradas, solo se aceptan objetivos
  que coincidan (dominio exacto, wildcard *.dominio.com o CIDR).
- Auditoria: todos los eventos se registran en logs/audit.log (JSON lines).
"""

from __future__ import annotations

import ipaddress
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
SCOPE_FILE = BASE_DIR / "scope.txt"
LOGS_DIR = BASE_DIR / "logs"
AUDIT_LOG = LOGS_DIR / "audit.log"

SAFE_MODE_MAX_RISK = 2
MAX_THREADS = 10

# Opciones bloqueadas en modo seguro (ejecutan codigo, escriben archivos o
# modifican el sistema objetivo). El motivo se muestra al usuario.
SAFE_MODE_BLOCKED = {
    "osCmd": "ejecuta comandos del sistema operativo en el objetivo",
    "osShell": "abre un shell del sistema operativo en el objetivo",
    "osPwn": "crea un canal out-of-band (Meterpreter/VNC) en el objetivo",
    "osBof": "explotacion de desbordamiento de buffer",
    "privEsc": "escalada de privilegios en el objetivo",
    "msfPath": "integracion con Metasploit",
    "fileRead": "lee archivos del servidor objetivo",
    "fileWrite": "escribe archivos en el servidor objetivo",
    "fileDest": "ruta destino para escritura de archivos en el objetivo",
    "regRead": "lee el registro de Windows del objetivo",
    "regAdd": "modifica el registro de Windows del objetivo",
    "regDel": "elimina claves del registro de Windows del objetivo",
    "sqlShell": "shell SQL interactivo (puede modificar datos)",
    "sqlQuery": "ejecuta SQL arbitrario (puede modificar datos)",
    "evalCode": "evalua codigo Python (riesgo para esta maquina)",
}

# Opciones de extraccion de datos: siempre requieren confirmacion adicional
DATA_EXTRACTION_OPTIONS = ("dumpTable", "dumpAll")

# Lista blanca base de opciones (nombre de opcion de la API 2.0 de sqlmap -> tipo)
ALLOWED_OPTIONS = {
    # Objetivo / peticion
    "url": str, "method": str, "data": str, "cookie": str, "headers": str,
    "referer": str, "agent": str, "randomAgent": bool, "proxy": str,
    "delay": float, "timeout": float, "retries": int,
    # Deteccion / inyeccion
    "level": int, "risk": int, "technique": str, "dbms": str, "tamper": str,
    "testParameter": str, "prefix": str, "suffix": str,
    "textOnly": bool, "titles": bool,
    # Enumeracion
    "getBanner": bool, "getCurrentUser": bool, "getCurrentDb": bool,
    "getHostname": bool, "isDba": bool, "getUsers": bool,
    "getPasswordHashes": bool, "getPrivileges": bool, "getRoles": bool,
    "getDbs": bool, "getTables": bool, "getColumns": bool, "getSchema": bool,
    "getCount": bool, "getComments": bool,
    "db": str, "tbl": str, "col": str, "excludeSysDbs": bool,
    # Extraccion
    "dumpTable": bool, "dumpAll": bool, "dumpFormat": str,
    # Rendimiento / descubrimiento
    "threads": int, "forms": bool, "crawlDepth": int,
    # Sesion
    "flushSession": bool, "freshQueries": bool, "disableHashing": bool,
}

# Opciones adicionales disponibles SOLO en modo avanzado con aceptacion explicita
ADVANCED_EXTRA_ALLOWED = {
    "osCmd": str,
    "osShell": bool,
    "osPwn": bool,
    "fileRead": str,
    "sqlQuery": str,
}

_VALID_TECHNIQUES = set("BEUSTQ")
_TAMPER_RE = re.compile(r"^[A-Za-z0-9_,\-]+$")
_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
_DUMP_FORMATS = {"CSV", "HTML", "SQLITE"}


# ----------------------------------------------------------------------
# Alcance (scope)
# ----------------------------------------------------------------------

def load_scope(path: Path = SCOPE_FILE) -> list[str]:
    """Lee scope.txt. Lineas vacias o que empiezan por # se ignoran."""
    entries: list[str] = []
    if not path.exists():
        return entries
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            entries.append(line)
    return entries


def host_in_scope(host: str, entries: list[str]) -> bool:
    """True si el host coincide con alguna entrada (exacto, *.wildcard o CIDR)."""
    if not entries:
        return True  # sin lista -> sin restriccion (se registra en auditoria)
    host = host.lower().strip("[]")
    try:
        host_ip = ipaddress.ip_address(host)
    except ValueError:
        host_ip = None
    for entry in entries:
        entry = entry.lower()
        if "/" in entry:
            if host_ip is not None:
                try:
                    if host_ip in ipaddress.ip_network(entry, strict=False):
                        return True
                except ValueError:
                    continue
        elif entry.startswith("*."):
            if host == entry[2:] or host.endswith(entry[1:]):
                return True
        elif host == entry:
            return True
    return False


# ----------------------------------------------------------------------
# Auditoria
# ----------------------------------------------------------------------

def audit(event: str, **fields) -> None:
    LOGS_DIR.mkdir(exist_ok=True)
    record = {"ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "event": event, **fields}
    with AUDIT_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")


# ----------------------------------------------------------------------
# Validacion y construccion de opciones
# ----------------------------------------------------------------------

def _coerce(key: str, value, expected, errors: list[str]):
    """Convierte el valor al tipo esperado; None significa 'omitir opcion'."""
    if expected is bool:
        return True if value else None  # las flags falsas no se envian
    if expected is int:
        try:
            return int(value)
        except (TypeError, ValueError):
            errors.append(f"'{key}' debe ser un numero entero.")
            return None
    if expected is float:
        try:
            return float(value)
        except (TypeError, ValueError):
            errors.append(f"'{key}' debe ser un numero.")
            return None
    text = str(value).strip()
    return text if text else None


def validate_options(payload: dict) -> tuple[list[str], dict, str]:
    """Valida la peticion y devuelve (errores, opciones_sqlmap, host)."""
    errors: list[str] = []
    safe_mode = bool(payload.get("safeMode", True))
    advanced_ok = bool(payload.get("advancedAcknowledged", False))
    allow_extract = bool(payload.get("allowDataExtraction", False))

    raw = payload.get("options") or {}
    if not isinstance(raw, dict):
        return ["El campo 'options' debe ser un objeto JSON."], {}, ""

    allowed = dict(ALLOWED_OPTIONS)
    if not safe_mode:
        if not advanced_ok:
            errors.append("El modo avanzado requiere marcar la casilla de aceptacion de riesgos.")
        allowed.update(ADVANCED_EXTRA_ALLOWED)

    options: dict = {"batch": True}  # nunca interactivo
    for key, value in raw.items():
        if key not in allowed:
            if key in SAFE_MODE_BLOCKED and safe_mode:
                errors.append(f"'{key}' esta bloqueada en modo seguro: {SAFE_MODE_BLOCKED[key]}.")
            else:
                errors.append(f"Opcion no permitida: '{key}'.")
            continue
        coerced = _coerce(key, value, allowed[key], errors)
        if coerced is not None:
            options[key] = coerced

    # URL objetivo
    url = str(options.get("url") or "")
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if parsed.scheme not in ("http", "https") or not host:
        errors.append("Indica una URL objetivo valida (http:// o https://).")

    # Rangos numericos
    level = options.get("level", 1)
    if not 1 <= level <= 5:
        errors.append("'level' debe estar entre 1 y 5.")
    risk = options.get("risk", 1)
    if not 1 <= risk <= 3:
        errors.append("'risk' debe estar entre 1 y 3.")
    elif safe_mode and risk > SAFE_MODE_MAX_RISK:
        errors.append(
            f"En modo seguro el riesgo maximo es {SAFE_MODE_MAX_RISK}: "
            "el riesgo 3 usa payloads OR que pueden modificar datos en la aplicacion."
        )
    if "threads" in options and not 1 <= options["threads"] <= MAX_THREADS:
        errors.append(f"'threads' debe estar entre 1 y {MAX_THREADS}.")
    if "delay" in options and not 0 <= options["delay"] <= 60:
        errors.append("'delay' debe estar entre 0 y 60 segundos.")
    if "timeout" in options and not 1 <= options["timeout"] <= 300:
        errors.append("'timeout' debe estar entre 1 y 300 segundos.")
    if "retries" in options and not 0 <= options["retries"] <= 10:
        errors.append("'retries' debe estar entre 0 y 10.")
    if "crawlDepth" in options and not 0 <= options["crawlDepth"] <= 10:
        errors.append("'crawlDepth' debe estar entre 0 y 10.")

    # Formatos y cadenas
    technique = options.get("technique")
    if technique is not None and (not technique or set(technique) - _VALID_TECHNIQUES):
        errors.append("'technique' solo puede contener las letras B, E, U, S, T y Q.")
    tamper = options.get("tamper")
    if tamper is not None and not _TAMPER_RE.match(tamper):
        errors.append("'tamper' solo admite nombres de script separados por comas (letras, numeros, '-' y '_').")
    method = options.get("method")
    if method is not None:
        method = method.upper()
        if method not in _METHODS:
            errors.append(f"Metodo HTTP no admitido: {method}.")
        else:
            options["method"] = method
    dump_format = options.get("dumpFormat")
    if dump_format is not None:
        dump_format = dump_format.upper()
        if dump_format not in _DUMP_FORMATS:
            errors.append("'dumpFormat' debe ser CSV, HTML o SQLITE.")
        else:
            options["dumpFormat"] = dump_format

    # Extraccion de datos: confirmacion adicional siempre
    if any(options.get(k) for k in DATA_EXTRACTION_OPTIONS) and not allow_extract:
        errors.append(
            "La extraccion de datos (dump) requiere marcar la casilla "
            "'Autorizo la extraccion de datos'."
        )

    return errors, options, host
