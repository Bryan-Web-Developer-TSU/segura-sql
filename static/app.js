/* SeguraSQL - logica del panel web */
"use strict";

const $ = (id) => document.getElementById(id);

const state = { selected: null };

const ENUM_FLAGS = [
  "getBanner", "getCurrentUser", "getCurrentDb", "getHostname", "isDba",
  "getUsers", "getPasswordHashes", "getPrivileges", "getRoles",
  "getDbs", "getTables", "getColumns", "getSchema", "getCount", "getComments",
];
const TEXT_FIELDS = [
  "url", "method", "data", "cookie", "headers", "referer", "agent", "proxy",
  "dbms", "tamper", "testParameter", "prefix", "suffix",
  "db", "tbl", "col", "dumpFormat",
];
const NUM_FIELDS = [
  ["level", "int"], ["risk", "int"], ["delay", "float"], ["timeout", "float"],
  ["retries", "int"], ["threads", "int"], ["crawlDepth", "int"],
];
const BOOL_FIELDS = [
  "randomAgent", "textOnly", "titles", "excludeSysDbs",
  "dumpTable", "dumpAll", "forms", "flushSession", "freshQueries",
];
const ADV_TEXT = ["osCmd", "fileRead", "sqlQuery"];
const ADV_BOOL = ["osShell", "osPwn"];

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text);
  return div.innerHTML;
}

async function api(path, options = {}) {
  const resp = await fetch("/api" + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = null;
  try { data = await resp.json(); } catch { /* respuesta sin cuerpo */ }
  if (!resp.ok) {
    const detail = data && data.detail;
    const msg = Array.isArray(detail) ? detail.join("\n") : (detail || `HTTP ${resp.status}`);
    throw new Error(msg);
  }
  return data;
}

function showErrors(messages) {
  const box = $("form-errors");
  box.innerHTML = "<strong>No se pudo iniciar el escaneo:</strong><ul>" +
    messages.map((m) => `<li>${escapeHtml(m)}</li>`).join("") + "</ul>";
  box.classList.remove("hidden");
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideErrors() {
  $("form-errors").classList.add("hidden");
}

function statusText(status) {
  return {
    "running": "en ejecución",
    "terminated": "terminado",
    "not running": "detenido",
    "error": "error",
  }[status] || status;
}

function statusClass(status) {
  return {
    "running": "badge-yellow",
    "terminated": "badge-green",
    "not running": "badge-gray",
    "error": "badge-red",
  }[status] || "badge-gray";
}

/* ------------------------------------------------------------------ */
/* Formulario                                                          */
/* ------------------------------------------------------------------ */

function collectOptions() {
  const options = {};
  for (const f of TEXT_FIELDS) {
    const v = $(f).value.trim();
    if (v) options[f] = v;
  }
  for (const [f, kind] of NUM_FIELDS) {
    const v = $(f).value.trim();
    if (v) options[f] = kind === "int" ? parseInt(v, 10) : parseFloat(v);
  }
  for (const f of BOOL_FIELDS) {
    if ($(f).checked) options[f] = true;
  }
  for (const f of ENUM_FLAGS) {
    if ($(f).checked) options[f] = true;
  }
  const tech = [...document.querySelectorAll(".tech:checked")].map((c) => c.value).join("");
  if (tech && tech.length < 6) options.technique = tech; // todas = valor por defecto de sqlmap
  if (!$("safeMode").checked) {
    for (const f of ADV_TEXT) {
      const v = $(f).value.trim();
      if (v) options[f] = v;
    }
    for (const f of ADV_BOOL) {
      if ($(f).checked) options[f] = true;
    }
  }
  return options;
}

$("scan-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideErrors();
  const payload = {
    options: collectOptions(),
    authorization: {
      confirmed: $("authConfirmed").checked,
      reference: $("authReference").value.trim(),
    },
    safeMode: $("safeMode").checked,
    advancedAcknowledged: $("advancedAcknowledged").checked,
    allowDataExtraction: $("allowDataExtraction").checked,
  };
  $("start-btn").disabled = true;
  try {
    const meta = await api("/scans", { method: "POST", body: JSON.stringify(payload) });
    await refreshScans();
    selectScan(meta.taskid);
  } catch (err) {
    showErrors(err.message.split("\n"));
  } finally {
    $("start-btn").disabled = false;
  }
});

$("safeMode").addEventListener("change", () => {
  const safe = $("safeMode").checked;
  $("advanced-section").classList.toggle("hidden", safe);
  const risk3 = document.querySelector('#risk option[value="3"]');
  if (risk3) risk3.disabled = safe;
  if (safe && $("risk").value === "3") $("risk").value = "2";
});

/* ------------------------------------------------------------------ */
/* Lista de escaneos                                                   */
/* ------------------------------------------------------------------ */

async function refreshScans() {
  let scans;
  try {
    scans = await api("/scans");
  } catch {
    return; // fallo silencioso en el polling
  }
  const tbody = $("scans-tbody");
  tbody.innerHTML = "";
  if (!scans.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Sin escaneos todavía</td></tr>';
    return;
  }
  for (const s of scans) {
    const tr = document.createElement("tr");
    if (s.taskid === state.selected) tr.className = "selected";
    tr.innerHTML =
      `<td title="${s.taskid}">${s.taskid.slice(0, 8)}…</td>` +
      `<td class="target">${escapeHtml(s.target)}</td>` +
      `<td><span class="badge ${statusClass(s.status)}">${statusText(s.status)}</span></td>` +
      `<td>${escapeHtml(s.startedAt)}</td>` +
      `<td>${s.safeMode ? "🛡️ seguro" : "⚠️ avanzado"}</td>`;
    tr.addEventListener("click", () => selectScan(s.taskid));
    tbody.appendChild(tr);
  }
}

/* ------------------------------------------------------------------ */
/* Detalle del escaneo                                                 */
/* ------------------------------------------------------------------ */

function selectScan(taskid) {
  state.selected = taskid;
  $("detail-card").classList.remove("hidden");
  refreshScans();
  loadDetail();
  $("detail-card").scrollIntoView({ behavior: "smooth", block: "start" });
}

$("btn-close").addEventListener("click", () => {
  state.selected = null;
  $("detail-card").classList.add("hidden");
  refreshScans();
});

$("btn-stop").addEventListener("click", () => scanAction("stop"));
$("btn-kill").addEventListener("click", () => scanAction("kill"));
$("btn-delete").addEventListener("click", async () => {
  if (!state.selected) return;
  try {
    await api(`/scans/${state.selected}`, { method: "DELETE" });
    state.selected = null;
    $("detail-card").classList.add("hidden");
    refreshScans();
  } catch (err) {
    alert(err.message);
  }
});

async function scanAction(action) {
  if (!state.selected) return;
  try {
    await api(`/scans/${state.selected}/${action}`, { method: "POST" });
    await loadDetail();
    refreshScans();
  } catch (err) {
    alert(err.message);
  }
}

async function loadDetail() {
  if (!state.selected) return;
  let detail;
  try {
    detail = await api(`/scans/${state.selected}`);
  } catch {
    return;
  }
  const m = detail.meta;
  $("detail-meta").innerHTML =
    `<div><span class="badge ${statusClass(detail.status)}">${statusText(detail.status)}</span>` +
    (m.safeMode ? ' <span class="badge badge-green">🛡️ modo seguro</span>' : ' <span class="badge badge-red">⚠️ modo avanzado</span>') + `</div>` +
    `<div><strong>Objetivo:</strong> ${escapeHtml(m.target)}</div>` +
    `<div><strong>Inicio:</strong> ${escapeHtml(m.startedAt)}` +
    (m.reference ? ` · <strong>Autorización:</strong> ${escapeHtml(m.reference)}` : "") + `</div>` +
    (m.options && m.options.length
      ? `<div><strong>Opciones:</strong> <code>${m.options.map(escapeHtml).join(", ")}</code></div>`
      : "");
  renderLog(detail.log || []);

  let data = [];
  try {
    data = (await api(`/scans/${state.selected}/data`)).data || [];
  } catch { /* sin datos todavía */ }
  renderResults(data);
}

function renderLog(log) {
  const el = $("log-console");
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = log.map((entry) => {
    const lvl = String(entry.level || "INFO").toUpperCase();
    return `<div class="log-line log-${lvl.toLowerCase()}">` +
      `<span class="log-time">[${escapeHtml(entry.time || "")}]</span> ` +
      `<span class="log-level">[${lvl}]</span> ${escapeHtml(entry.message || "")}</div>`;
  }).join("");
  if (nearBottom) el.scrollTop = el.scrollHeight;
}

function renderResults(data) {
  const el = $("results");
  if (!data.length) {
    el.innerHTML = '<p class="muted">Sin resultados todavía. Aquí aparecerán las vulnerabilidades ' +
      'detectadas y la información enumerada.</p>';
    return;
  }
  el.innerHTML = data.map((item, i) =>
    `<div class="result-item"><div class="result-title">Resultado ${i + 1}</div>` +
    `<pre>${escapeHtml(JSON.stringify(item, null, 2))}</pre></div>`
  ).join("");
}

/* ------------------------------------------------------------------ */
/* Salud del sistema y alcance                                         */
/* ------------------------------------------------------------------ */

async function checkHealth() {
  const badge = $("health");
  try {
    const h = await api("/health");
    if (h.ok) {
      badge.textContent = `● sqlmap ${h.sqlmapVersion} conectado`;
      badge.className = "badge badge-green";
      const sb = $("scope-banner");
      sb.classList.remove("hidden");
      if (h.scope.enforced) {
        sb.innerHTML = `🎯 <strong>Alcance restringido (scope.txt):</strong> ${h.scope.entries.map(escapeHtml).join(", ")}`;
        sb.className = "scope-banner scope-ok";
      } else {
        sb.innerHTML = `⚠️ <strong>Sin alcance definido:</strong> se acepta cualquier objetivo. ` +
          `Añade entradas a <code>scope.txt</code> para restringirlo a sistemas autorizados.`;
        sb.className = "scope-banner scope-warn";
      }
    } else {
      badge.textContent = "● sqlmap no responde";
      badge.className = "badge badge-red";
    }
  } catch {
    badge.textContent = "● sin conexión con el servidor";
    badge.className = "badge badge-red";
  }
}

/* ------------------------------------------------------------------ */
/* Arranque                                                            */
/* ------------------------------------------------------------------ */

checkHealth();
refreshScans();
setInterval(checkHealth, 10000);
setInterval(refreshScans, 4000);
setInterval(loadDetail, 2500);
