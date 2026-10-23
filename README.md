# 🛡️ SeguraSQL — Panel de pentesting SQL seguro

Aplicación web local para realizar **pruebas de inyección SQL de forma segura y
autorizada**, construida sobre [sqlmap](https://github.com/sqlmapproject/sqlmap)
y su API REST (`sqlmapapi.py`).

> ⚠️ **Aviso legal**: utiliza esta herramienta únicamente contra sistemas sobre
> los que tengas **autorización explícita y por escrito**. El acceso no
> autorizado a sistemas informáticos es un delito en la mayoría de
> jurisdicciones. Todas las acciones quedan registradas en `logs/audit.log`.

## Características

- Interfaz web en español para lanzar y monitorizar escaneos de sqlmap.
- Consola en vivo con el registro del escaneo y visor de resultados.
- **Modo seguro** (activado por defecto):
  - Bloquea opciones que ejecutan código o modifican el objetivo
    (`osShell`, `osPwn`, `osCmd`, `fileWrite`, `sqlQuery`, registro de Windows…).
  - Limita el riesgo a 2 (el riesgo 3 usa payloads OR que pueden alterar datos).
  - Lista blanca de opciones: el cliente nunca envía opciones arbitrarias al motor.
- **Extracción de datos** (`--dump` / `--dump-all`): requiere una casilla de
  autorización adicional.
- **Control de alcance** (`scope.txt`): si contiene entradas, solo se aceptan
  objetivos que coincidan (dominio exacto, `*.wildcard` o CIDR).
- **Autorización obligatoria** antes de cada escaneo, con referencia
  (ticket/contrato) que queda registrada.
- **Auditoría**: cada escaneo iniciado, detenido, eliminado o rechazado se
  registra en `logs/audit.log` (formato JSON lines).
- La API de sqlmap se arranca automáticamente con credenciales aleatorias por
  sesión (solo accesibles desde esta aplicación).

## Requisitos

- Python 3.9+ (probado con 3.12)
- Windows, Linux o macOS

## Instalación y uso

```bat
:: 1. Clonar este repositorio
git clone https://github.com/Bryan-Web-Developer-TSU/segura-sql.git
cd segura-sql

:: 2. Clonar sqlmap (no va incluido: es el proyecto oficial)
git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git sqlmap

:: 3. Instalar dependencias (una sola vez)
python -m pip install -r requirements.txt

:: 4. Iniciar la aplicación
python app.py
```

En Windows también puedes hacer doble clic en **`iniciar.bat`**, que instala las
dependencias y arranca la aplicación.

Después abre en el navegador: **http://127.0.0.1:8776**

Al arrancar, la aplicación lanza automáticamente `sqlmapapi.py` en 127.0.0.1 con
un puerto libre y credenciales aleatorias; al salir (Ctrl+C) lo detiene.

## Definir el alcance autorizado

Edita **`scope.txt`** y añade los objetivos permitidos (uno por línea):

```
*.miempresa.com
192.168.10.0/24
testphp.vulnweb.com
```

Si el archivo está vacío, se acepta cualquier objetivo pero la interfaz mostrará
una advertencia permanente.

## Entornos de práctica recomendados

Para aprender de forma legal y segura, usa laboratorios diseñados para ello:

- [DVWA](https://github.com/digininja/DVWA) — Damn Vulnerable Web Application
- [OWASP Juice Shop](https://owasp.org/www-project-juice-shop/)
- [bWAPP](http://www.itsecgames.com/)
- Sitios de prueba de Acunetix: `testphp.vulnweb.com` (añádelo a `scope.txt`)

## Estructura del proyecto

```
Seguridad/
├── app.py                  # Aplicación FastAPI (punto de entrada)
├── sqlmap_client.py        # Gestión del proceso sqlmapapi y cliente HTTP
├── security_controls.py    # Modo seguro, scope, validación y auditoría
├── scope.txt               # Lista de objetivos autorizados
├── requirements.txt
├── iniciar.bat             # Lanzador para Windows
├── static/                 # Interfaz web (HTML/JS/CSS)
├── sqlmap/                 # Clon del repositorio oficial de sqlmap
└── logs/                   # audit.log y sqlmapapi.log (se crean al ejecutar)
```

## Cómo funciona

1. `app.py` arranca `sqlmapapi.py -s` como subproceso (con `--username` y
   `--password` aleatorios por sesión).
2. La interfaz web envía la configuración del escaneo al backend FastAPI.
3. `security_controls.py` valida la petición: autorización confirmada, alcance,
   lista blanca de opciones, restricciones del modo seguro.
4. El backend crea la tarea en sqlmapapi (`/task/new`) y la inicia
   (`/scan/<id>/start`); sqlmap se ejecuta en un proceso separado.
5. La interfaz consulta periódicamente el estado, el registro y los resultados.
