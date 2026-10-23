"""
Laboratorio vulnerable a inyeccion SQL - SOLO PARA PRACTICA LOCAL.

Aplicacion deliberadamente vulnerable para practicar con SeguraSQL/sqlmap
de forma legal y segura en tu propia maquina. Todos los datos son ficticios.

Uso:
    python lab/app_vulnerable.py
y abre http://127.0.0.1:8899

NUNCA expongas esta aplicacion a una red.
"""

import sqlite3
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HOST, PORT = "127.0.0.1", 8899

conn = sqlite3.connect(":memory:", check_same_thread=False)
db_lock = threading.Lock()

# Datos 100% ficticios para la practica
USUARIOS = [
    (1, "admin", "sup3rsecreto!", "admin@lab.local", "administrador"),
    (2, "bryal", "claveFalsa123", "bryal@lab.local", "analista"),
    (3, "invitado", "invitado2026", "invitado@lab.local", "lectura"),
    (4, "soporte", "soporte#2026", "soporte@lab.local", "soporte"),
]

PRODUCTOS = [
    (1, "Laptop", 18500.00),
    (2, "Monitor", 4200.50),
    (3, "Teclado mecanico", 1350.99),
]


def init_db() -> None:
    with db_lock:
        cur = conn.cursor()
        cur.execute(
            "CREATE TABLE usuarios (id INTEGER, usuario TEXT, password TEXT, email TEXT, rol TEXT)"
        )
        cur.executemany("INSERT INTO usuarios VALUES (?,?,?,?,?)", USUARIOS)
        cur.execute("CREATE TABLE productos (id INTEGER, nombre TEXT, precio REAL)")
        cur.executemany("INSERT INTO productos VALUES (?,?,?)", PRODUCTOS)
        conn.commit()


PAGE = """<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<title>Lab vulnerable</title><style>
body{{font-family:sans-serif;background:#f4f4f4;margin:40px;color:#222}}
table{{border-collapse:collapse;background:#fff}}
td,th{{border:1px solid #999;padding:4px 10px}}
.err{{color:#b00}}
</style></head><body>{body}</body></html>"""


class Handler(BaseHTTPRequestHandler):
    def _send(self, body: str, code: int = 200) -> None:
        data = PAGE.format(body=body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        if parsed.path == "/":
            self._send(
                "<h1>&#129514; Laboratorio vulnerable</h1>"
                "<p>Aplicacion deliberadamente vulnerable para practica local con SeguraSQL.</p>"
                "<ul>"
                "<li><a href='/usuario?id=1'>/usuario?id=1</a> (contexto numerico)</li>"
                "<li><a href='/buscar?q=Lap'>/buscar?q=Lap</a> (contexto de texto)</li>"
                "</ul>"
            )
            return

        if parsed.path == "/usuario":
            uid = params.get("id", [""])[0]
            if not uid:
                self._send("<p>Falta el parametro <code>id</code>.</p>")
                return
            # VULNERABLE a proposito: concatenacion directa de la entrada
            query = "SELECT id, usuario, email, rol FROM usuarios WHERE id = " + uid
            self._run(query, "Usuarios")
            return

        if parsed.path == "/buscar":
            q = params.get("q", [""])[0]
            # VULNERABLE a proposito: contexto entre comillas
            query = "SELECT * FROM productos WHERE nombre LIKE '%" + q + "%'"
            self._run(query, "Productos")
            return

        self._send("<h1>404 - no encontrado</h1>", 404)

    def _run(self, query: str, titulo: str) -> None:
        try:
            with db_lock:
                cur = conn.execute(query)
                cols = [d[0] for d in cur.description]
                rows = cur.fetchall()
        except sqlite3.Error as exc:
            # Mostrar el error SQL ayuda a la deteccion por errores (y al aprendizaje)
            self._send(f"<h1>Error SQL</h1><pre class='err'>{exc}</pre>", 500)
            return
        if not rows:
            self._send(f"<h1>{titulo}</h1><p>Sin resultados.</p>")
            return
        head = "".join(f"<th>{c}</th>" for c in cols)
        body = "".join(
            "<tr>" + "".join(f"<td>{v}</td>" for v in row) + "</tr>" for row in rows
        )
        self._send(f"<h1>{titulo}</h1><table><tr>{head}</tr>{body}</table>")

    def log_message(self, *args) -> None:
        pass  # consola silenciosa


if __name__ == "__main__":
    init_db()
    print(f"[*] Laboratorio vulnerable en http://{HOST}:{PORT} (Ctrl+C para salir)")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
