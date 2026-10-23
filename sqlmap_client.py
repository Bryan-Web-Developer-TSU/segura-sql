"""Cliente para la API REST de sqlmap (sqlmapapi.py).

Gestiona el ciclo de vida del proceso sqlmapapi (arranque/parada) y expone
metodos simples para crear tareas, iniciar escaneos y consultar resultados.

Las credenciales de la API se generan aleatoriamente en cada sesion y solo
las conoce este proceso: la API queda inaccesible para terceros aunque
escuche en 127.0.0.1.
"""

from __future__ import annotations

import secrets
import socket
import subprocess
import sys
import time
from pathlib import Path

import requests

BASE_DIR = Path(__file__).resolve().parent
SQLMAP_API_SCRIPT = BASE_DIR / "sqlmap" / "sqlmapapi.py"
LOGS_DIR = BASE_DIR / "logs"


class SqlmapApiError(Exception):
    """Error de comunicacion con la API de sqlmap."""


class SqlmapApiClient:
    def __init__(self, host: str = "127.0.0.1", port: int = 8775):
        self.host = host
        self.port = port
        self.base_url = f"http://{host}:{port}"
        # Credenciales aleatorias por sesion (sqlmapapi exige Basic Auth)
        self.username = f"segurasql-{secrets.token_hex(4)}"
        self.password = secrets.token_urlsafe(24)
        self._process: subprocess.Popen | None = None
        self._log_file = None

    # ------------------------------------------------------------------
    # Ciclo de vida del proceso sqlmapapi
    # ------------------------------------------------------------------

    def _find_free_port(self, preferred: int) -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((self.host, preferred))
                return preferred
            except OSError:
                sock.bind((self.host, 0))
                return sock.getsockname()[1]

    def is_running(self) -> bool:
        try:
            return bool(self._request("GET", "/version", timeout=3).get("success"))
        except SqlmapApiError:
            return False

    def start(self, wait_timeout: float = 60.0) -> None:
        if not SQLMAP_API_SCRIPT.exists():
            raise SqlmapApiError(
                f"No se encontro sqlmapapi.py en {SQLMAP_API_SCRIPT}. "
                "Clona el repositorio de sqlmap dentro de esta carpeta."
            )
        if self._process is not None and self._process.poll() is None:
            return  # ya esta en ejecucion

        LOGS_DIR.mkdir(exist_ok=True)
        self.port = self._find_free_port(self.port)
        self.base_url = f"http://{self.host}:{self.port}"

        self._log_file = open(LOGS_DIR / "sqlmapapi.log", "a", encoding="utf-8", errors="replace")
        self._log_file.write(f"\n===== sqlmapapi iniciado {time.ctime()} en puerto {self.port} =====\n")
        self._log_file.flush()

        self._process = subprocess.Popen(
            [
                sys.executable, str(SQLMAP_API_SCRIPT),
                "-s", "-H", self.host, "-p", str(self.port),
                "--username", self.username, "--password", self.password,
            ],
            stdout=self._log_file,
            stderr=subprocess.STDOUT,
            cwd=str(SQLMAP_API_SCRIPT.parent),
        )

        deadline = time.time() + wait_timeout
        while time.time() < deadline:
            if self._process.poll() is not None:
                raise SqlmapApiError(
                    "sqlmapapi se detuvo inesperadamente. Revisa logs/sqlmapapi.log"
                )
            if self.is_running():
                return
            time.sleep(0.5)
        raise SqlmapApiError("Tiempo de espera agotado esperando a que sqlmapapi arranque.")

    def stop(self) -> None:
        if self._process is not None and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None
        if self._log_file is not None:
            try:
                self._log_file.close()
            except OSError:
                pass
            self._log_file = None

    # ------------------------------------------------------------------
    # HTTP hacia sqlmapapi
    # ------------------------------------------------------------------

    def _request(self, method: str, path: str, json_body=None, timeout: float = 30.0) -> dict:
        try:
            resp = requests.request(
                method,
                self.base_url + path,
                json=json_body,
                auth=(self.username, self.password),
                timeout=timeout,
            )
        except requests.RequestException as exc:
            raise SqlmapApiError(f"sin conexion con sqlmapapi: {exc}") from exc
        try:
            data = resp.json()
        except ValueError as exc:
            raise SqlmapApiError(f"respuesta invalida de sqlmapapi (HTTP {resp.status_code})") from exc
        if resp.status_code >= 400:
            raise SqlmapApiError(data.get("message") or f"HTTP {resp.status_code}")
        return data

    # ------------------------------------------------------------------
    # Endpoints de la API
    # ------------------------------------------------------------------

    def version(self) -> dict:
        return self._request("GET", "/version")

    def task_new(self) -> dict:
        return self._request("GET", "/task/new")

    def task_delete(self, taskid: str) -> dict:
        return self._request("GET", f"/task/{taskid}/delete")

    def scan_start(self, taskid: str, options: dict) -> dict:
        return self._request("POST", f"/scan/{taskid}/start", json_body=options)

    def scan_status(self, taskid: str) -> dict:
        return self._request("GET", f"/scan/{taskid}/status")

    def scan_log(self, taskid: str) -> dict:
        return self._request("GET", f"/scan/{taskid}/log")

    def scan_data(self, taskid: str) -> dict:
        return self._request("GET", f"/scan/{taskid}/data")

    def scan_stop(self, taskid: str) -> dict:
        return self._request("GET", f"/scan/{taskid}/stop")

    def scan_kill(self, taskid: str) -> dict:
        return self._request("GET", f"/scan/{taskid}/kill")
