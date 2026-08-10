// popup.js

// ---------------------------------------------------------------------------
// Identidad del chat abierto en la pestaña de WhatsApp Web.
// La lógica vive en numero-utils.js. Se inyecta primero el módulo y luego una
// función que solo lo invoca: una función pasada por `func:` se serializa con
// toString(), así que no puede capturar nada del popup, pero en ejecución su
// `window` sí es el del isolated world donde quedó instalado el módulo.
// ---------------------------------------------------------------------------
function __snippetIdentidad() {
  const u = window.__elixirUtils;
  if (!u) return { error: "sin-utils" };
  // Sin fallback manual: el popup se cierra al perder el foco y la promesa
  // moriría con él. Si no hay número, se pide con el input de #resultados.
  return u.obtenerIdentidad({ permitirPanel: true, permitirManual: false });
}

async function identidadDeLaPestana(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["numero-utils.js"] });
  const r = await chrome.scripting.executeScript({ target: { tabId }, func: __snippetIdentidad });
  return (r && r[0] && r[0].result) || null;
}

// ---------------------------------------------------------------------------
// Helpers del popup
// ---------------------------------------------------------------------------
function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

// Acceso a config robusto: usa chrome.storage.local si está disponible;
// si el permiso "storage" aún no propagó, cae a localStorage (persiste en el popup).
function hasChromeStorage() {
  return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
}

function getConfig() {
  return new Promise((resolve) => {
    if (hasChromeStorage()) {
      chrome.storage.local.get(["baseUrl", "apiKey", "tgEnabled", "tgBotKh", "tgBotWolf"], (cfg) => resolve(cfg || {}));
    } else {
      resolve({
        baseUrl: localStorage.getItem("baseUrl") || "",
        apiKey: localStorage.getItem("apiKey") || "",
        tgEnabled: localStorage.getItem("tgEnabled") === "true",
        tgBotKh: localStorage.getItem("tgBotKh") || "",
        tgBotWolf: localStorage.getItem("tgBotWolf") || "",
      });
    }
  });
}

function setConfig(extra) {
  return new Promise((resolve) => {
    if (hasChromeStorage()) {
      chrome.storage.local.set(extra, resolve);
    } else {
      Object.keys(extra).forEach((k) => localStorage.setItem(k, String(extra[k])));
      resolve();
    }
  });
}

function setResultado(html) {
  document.getElementById("resultados").innerHTML = html;
}

function setMensaje(texto, esError) {
  setResultado(`<div class="msg${esError ? " error" : ""}">${texto}</div>`);
}

function mostrarVista(cual) {
  const principal = document.getElementById("vistaPrincipal");
  const ajustes = document.getElementById("vistaAjustes");
  const esAjustes = cual === "ajustes";
  ajustes.hidden = !esAjustes;
  principal.hidden = esAjustes;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textoDias(d) {
  if (typeof d !== "number") return "";
  if (d > 0) return `Faltan ${d}d`;
  if (d === 0) return "Vence hoy";
  return `Venció hace ${Math.abs(d)}d`;
}

// Flag prototipo Telegram (Bloque 2), se carga desde config en cargarConfigEnInputs.
let tgEnabled = false;
let tgBotKh = "userdkh_bot";    // bot DigitalKH (Disney)
let tgBotWolf = "WolfStr_bot";  // bot Andres / Wolf

// Decide a qué bot pedir el código según la cuenta. El backend manda el NOMBRE
// del proveedor (ej. "Digital KH", "Andrés"); aquí lo mapeamos al bot. Si no
// viene proveedor o es uno sin bot (ProveedorYT, Elixir…), fallback por is_disney.
function botParaCuenta(acc) {
  // Normaliza: quita acentos y pasa a minúsculas ("Andrés" -> "andres").
  const prov = (acc.provider || acc.provider_name || acc.proveedor || "")
    .toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  let bot = acc.is_disney ? tgBotKh : tgBotWolf; // fallback
  if (prov) {
    if (/kh|digital/.test(prov)) bot = tgBotKh;         // Digital KH
    else if (/wolf|andres/.test(prov)) bot = tgBotWolf; // Andrés
  }
  return bot;
}
// Nombre del proveedor para mostrar en la tarjeta (badge).
function nombreProveedor(acc) {
  return acc.provider || acc.provider_name || acc.proveedor || "";
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
  } catch (e) {
    const temp = document.createElement("textarea");
    temp.value = texto;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand("copy");
    document.body.removeChild(temp);
  }
}

function renderCuentas(accounts) {
  // El backend ya manda Disney primero; reordenamos por robustez.
  const ordenadas = accounts.slice().sort((a, b) => (b.is_disney ? 1 : 0) - (a.is_disney ? 1 : 0));

  const tarjetas = ordenadas
    .map((acc, i) => {
      const disney = !!acc.is_disney;
      const diasNeg = typeof acc.days_remaining === "number" && acc.days_remaining < 0;
      const statusActive = acc.status === "active";
      const email = escapeHtml(acc.provider_email || "");
      return `
        <div class="card${disney ? " card-disney" : ""}">
          <div class="card-title">
            ${escapeHtml(acc.account_type_name || "Cuenta")}
            ${disney ? '<span class="disney-badge">DISNEY</span>' : ""}
          </div>
          <div class="card-email">${escapeHtml(acc.provider_email || "—")}</div>
          <div class="card-meta">
            <span class="badge${statusActive ? " active" : ""}">${escapeHtml(acc.status || "")}</span>
            <span class="badge ${diasNeg ? "dias-vencido" : "dias-ok"}">${escapeHtml(
              textoDias(acc.days_remaining)
            )}</span>
            ${nombreProveedor(acc) ? `<span class="badge prov">${escapeHtml(nombreProveedor(acc))}</span>` : ""}
          </div>
          <button class="copiar" data-email="${email}" data-idx="${i}">
            Copiar correo
          </button>
          ${tgEnabled ? `<button class="pedir" data-email="${email}" data-bot="${escapeHtml(botParaCuenta(acc))}">📨 Pedir código (Telegram)</button>` : ""}
          <div class="codigo-slot"></div>
        </div>`;
    })
    .join("");

  const titulo = `<div class="res-head">Cuentas (${ordenadas.length})</div>`;
  setResultado(titulo + tarjetas);

  // Listeners de "Copiar correo"
  document.querySelectorAll("#resultados .copiar").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const email = btn.getAttribute("data-email");
      if (!email) return;
      await copiarTexto(email);
      const original = btn.textContent;
      btn.textContent = "¡Copiado!";
      btn.classList.add("copiado");
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("copiado");
      }, 1200);
    });
  });

  // Listeners de "Pedir código (Telegram)"
  document.querySelectorAll("#resultados .pedir").forEach((btn) => {
    btn.addEventListener("click", () => pedirCodigoTelegram(btn));
  });

  // Repinta el código pedido en una sesión anterior del popup (si es reciente).
  restaurarUltimoResultadoTG();
}

// Pinta el resultado de Telegram (código o texto/error) en un slot dado.
function pintarResultadoTG(slot, resp) {
  if (!slot || !resp) return;
  if (!resp.ok) {
    slot.innerHTML = `<div class="msg error">${escapeHtml(resp.error || "No se pudo.")}</div>`;
    return;
  }
  // El mensaje completo ya se copió en Telegram (resp.copiado); aquí no
  // re-copiamos para no pisar el portapapeles. El botón "Copiar" queda por si
  // quieren solo el código.
  const nota = resp.copiado ? ' · <span class="copiado-ok">copiado ✓</span>' : "";
  if (resp.codigo) {
    slot.innerHTML = `<div class="codigo"><span>Código: <b>${escapeHtml(resp.codigo)}</b>${nota}</span><button class="ccopy">Copiar</button></div>`;
    slot.querySelector(".ccopy").addEventListener("click", async (e) => {
      await copiarTexto(resp.codigo);
      e.target.textContent = "✓";
      setTimeout(() => { e.target.textContent = "Copiar"; }, 1200);
    });
  } else {
    slot.innerHTML = `<div class="codigo"><small>${escapeHtml((resp.texto || "Respondió sin código.").slice(0, 90))}${nota}</small></div>`;
  }
}

function pedirCodigoTelegram(btn) {
  const email = btn.getAttribute("data-email");
  if (!email) return;
  const slot = btn.parentElement.querySelector(".codigo-slot");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Abriendo Telegram…";
  // El popup se cierra al cambiar de foco a Telegram: avisamos qué hacer.
  if (slot) slot.innerHTML = `<div class="msg"><small>Abriendo Telegram… el código queda en Telegram y en el portapapeles.</small></div>`;

  const bot = btn.getAttribute("data-bot") || tgBotWolf;
  chrome.runtime.sendMessage({ type: "tg-pedir-codigo", correo: email, bot }, (resp) => {
    // Puede que el popup ya esté cerrado (no llega). Si sigue vivo, pintamos.
    btn.disabled = false;
    btn.textContent = original;
    if (chrome.runtime.lastError) { if (slot) slot.innerHTML = `<div class="msg error">Error de extensión.</div>`; return; }
    if (!resp) { if (slot) slot.innerHTML = `<div class="msg error">Sin respuesta.</div>`; return; }
    pintarResultadoTG(slot, resp);
  });
}

// Al renderizar cuentas, repinta el último código pedido si es reciente (el popup
// se cerró al ir a Telegram; el background lo guardó en storage).
async function restaurarUltimoResultadoTG() {
  let cfg;
  try { cfg = await chrome.storage.local.get("tgUltimoResultado"); } catch (e) { return; }
  const r = cfg && cfg.tgUltimoResultado;
  if (!r || !r.correo || !r.ts || Date.now() - r.ts > 60000) return;
  document.querySelectorAll("#resultados .pedir").forEach((btn) => {
    if (btn.getAttribute("data-email") !== r.correo) return;
    const slot = btn.parentElement.querySelector(".codigo-slot");
    pintarResultadoTG(slot, r);
  });
}

// Cuando no se pudo leer el número (contacto que solo tiene @usuario), se pide
// aquí dentro: el popup no pierde el foco mientras se escribe en él.
function pedirNumeroEnPopup(id) {
  const quien = id && id.username ? ` de <b>${escapeHtml(id.username)}</b>` : "";
  setResultado(`
    <div class="msg">No se encontró el número${quien}. Escríbelo y lo busco:</div>
    <div class="manual-row">
      <input type="text" id="numManual" placeholder="302 422 0918" autocomplete="off" />
      <button id="numManualOk" class="btn btn-primary">Buscar</button>
    </div>
    <div class="hint" id="numManualHint">Se guarda para este chat y no te lo vuelvo a preguntar.</div>
  `);

  const input = document.getElementById("numManual");
  const hint = document.getElementById("numManualHint");
  input.focus();

  const enviar = async () => {
    const n = normalizarEnPopup(input.value);
    if (!n.ok) {
      hint.textContent = "Formato no válido. Usa 302 422 0918 o +1 305 555 0123.";
      hint.style.color = "var(--err-fg, #b91c1c)";
      return;
    }
    if (id && id.clave) await recordarNumeroManual(id.clave, n.display);
    lookupDeNumero(n.display);
  };

  document.getElementById("numManualOk").addEventListener("click", enviar);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") enviar(); });
}

// numero-utils.js también se carga en el documento del popup (popup.html), así
// que la normalización es exactamente la misma que usa la página.
function normalizarEnPopup(raw) {
  const u = window.__elixirUtils;
  if (!u) return { ok: false };
  return u.normalizarNumero(raw, { asumirPais: true });
}

async function recordarNumeroManual(clave, numero) {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (c, n) => window.__elixirUtils && window.__elixirUtils.guardarManual(c, n),
      args: [clave, numero],
    });
  } catch (e) { /* si no se pudo guardar, se volverá a preguntar: no es crítico */ }
}

async function buscarCuentas() {
  setMensaje("Extrayendo número…");

  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    setMensaje("No se encontró la pestaña activa.", true);
    return;
  }

  let id = null;
  try {
    id = await identidadDeLaPestana(tab.id);
  } catch (e) {
    setMensaje("No se pudo leer la página. Abre un chat de WhatsApp Web primero.", true);
    return;
  }

  if (!id || id.error === "sin-utils") {
    setMensaje("Recarga la pestaña de WhatsApp Web y vuelve a intentar.", true);
    return;
  }
  if (id.fuente === "sin-chat") {
    setMensaje("Abre un chat de WhatsApp Web primero.", true);
    return;
  }
  if (id.fuente === "grupo") {
    setMensaje("Este es un chat de grupo: no tiene un número único.", true);
    return;
  }
  if (!id.numero) {
    pedirNumeroEnPopup(id);
    return;
  }

  lookupDeNumero(id.numero);
}

async function lookupDeNumero(numero) {
  const { baseUrl, apiKey } = await getConfig();
  if (!apiKey) {
    setMensaje("API key inválida o no configurada.", true);
    return;
  }
  if (!baseUrl) {
    setMensaje("Configura la BASE_URL en ⚙️ Configuración API.", true);
    return;
  }

  setMensaje(`Buscando cuentas para ${escapeHtml(numero)}…`);

  const url = baseUrl.replace(/\/+$/, "") + "/api/extension/lookup?whatsapp=" + encodeURIComponent(numero);

  let resp;
  try {
    resp = await fetch(url, { headers: { "X-Api-Key": apiKey } });
  } catch (e) {
    setMensaje("Error de red al consultar la API. Revisa la BASE_URL y la conexión.", true);
    return;
  }

  if (resp.status === 401) {
    setMensaje("API key inválida o no configurada.", true);
    return;
  }
  if (!resp.ok) {
    setMensaje(`Error de la API (HTTP ${resp.status}).`, true);
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    setMensaje("Respuesta inválida de la API.", true);
    return;
  }

  if (!data || !data.count || !Array.isArray(data.accounts) || data.accounts.length === 0) {
    setMensaje("Sin cuentas para este número.");
    return;
  }

  renderCuentas(data.accounts);
}

// ---------------------------------------------------------------------------
// Config: cargar / guardar
// ---------------------------------------------------------------------------
async function cargarConfigEnInputs() {
  const cfg = await getConfig();
  if (cfg.baseUrl) document.getElementById("cfgBaseUrl").value = cfg.baseUrl;
  if (cfg.apiKey) document.getElementById("cfgApiKey").value = cfg.apiKey;
  tgEnabled = !!cfg.tgEnabled;
  if (cfg.tgBotKh && cfg.tgBotKh.trim()) tgBotKh = cfg.tgBotKh.trim().replace(/^@/, "");
  if (cfg.tgBotWolf && cfg.tgBotWolf.trim()) tgBotWolf = cfg.tgBotWolf.trim().replace(/^@/, "");
  document.getElementById("cfgTgEnabled").checked = tgEnabled;
  document.getElementById("cfgTgBotKh").value = cfg.tgBotKh || "";
  document.getElementById("cfgTgBotWolf").value = cfg.tgBotWolf || "";
}

async function guardarConfig() {
  const baseUrl = document.getElementById("cfgBaseUrl").value.trim().replace(/\/+$/, "");
  const apiKey = document.getElementById("cfgApiKey").value.trim();
  const tgEnabledNuevo = document.getElementById("cfgTgEnabled").checked;
  const tgBotKhNuevo = document.getElementById("cfgTgBotKh").value.trim().replace(/^@/, "");
  const tgBotWolfNuevo = document.getElementById("cfgTgBotWolf").value.trim().replace(/^@/, "");
  tgEnabled = tgEnabledNuevo;
  if (tgBotKhNuevo) tgBotKh = tgBotKhNuevo;
  if (tgBotWolfNuevo) tgBotWolf = tgBotWolfNuevo;
  await setConfig({ baseUrl, apiKey, tgEnabled: tgEnabledNuevo, tgBotKh: tgBotKhNuevo, tgBotWolf: tgBotWolfNuevo });
  const estado = document.getElementById("cfgEstado");
  estado.textContent = "Guardado ✓";
  setTimeout(() => {
    estado.textContent = "";
    mostrarVista("principal");
  }, 900);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function () {
  cargarConfigEnInputs();

  // Todas las acciones inyectan numero-utils.js delante: es donde vive la lógica
  // y el guard versionado hace que repetirlo no cueste nada.
  function ejecutarEnPestana(archivo) {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs || !tabs[0]) return;
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ["numero-utils.js", archivo],
      });
    });
  }

  document.getElementById("abrirContacts").addEventListener("click", () => ejecutarEnPestana("content.js"));
  document.getElementById("copyName").addEventListener("click", () => ejecutarEnPestana("copyname.js"));
  document.getElementById("copyNumber").addEventListener("click", () => ejecutarEnPestana("copynumber.js"));
  document.getElementById("copyUsername").addEventListener("click", () => ejecutarEnPestana("copyusername.js"));
  document.getElementById("buscarElixir").addEventListener("click", () => ejecutarEnPestana("buscarelixir.js"));

  document.getElementById("buscarCuentas").addEventListener("click", buscarCuentas);
  document.getElementById("cfgGuardar").addEventListener("click", guardarConfig);

  // Navegación entre vista principal y ajustes
  document.getElementById("btnAjustes").addEventListener("click", () => mostrarVista("ajustes"));
  document.getElementById("btnVolver").addEventListener("click", () => mostrarVista("principal"));
});
