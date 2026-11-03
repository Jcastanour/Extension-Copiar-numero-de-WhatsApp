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
      chrome.storage.local.get(
        ["baseUrl", "apiKey", "codigosUrl", "codigosApiKey", "overlayEnabled", "overlayForma",
         "tgEnabled", "tgBotKh", "tgBotWolf", "tgBotStore", "modoCodigo", "storetoolsId", "fcmSlug"],
        (cfg) => resolve(cfg || {})
      );
    } else {
      resolve({
        baseUrl: localStorage.getItem("baseUrl") || "",
        apiKey: localStorage.getItem("apiKey") || "",
        codigosUrl: localStorage.getItem("codigosUrl") || "",
        codigosApiKey: localStorage.getItem("codigosApiKey") || "",
        overlayEnabled: localStorage.getItem("overlayEnabled") !== "false", // encendido salvo que se apague
        overlayForma: localStorage.getItem("overlayForma") || "burbuja",
        tgEnabled: localStorage.getItem("tgEnabled") !== "false", // encendido salvo que se apague
        tgBotKh: localStorage.getItem("tgBotKh") || "",
        tgBotWolf: localStorage.getItem("tgBotWolf") || "",
        tgBotStore: localStorage.getItem("tgBotStore") || "",
        modoCodigo: (() => { try { return JSON.parse(localStorage.getItem("modoCodigo") || "{}"); } catch (e) { return {}; } })(),
        storetoolsId: localStorage.getItem("storetoolsId") || "",
        fcmSlug: localStorage.getItem("fcmSlug") || "",
      });
    }
  });
}

function setConfig(extra) {
  return new Promise((resolve) => {
    if (hasChromeStorage()) {
      chrome.storage.local.set(extra, resolve);
    } else {
      Object.keys(extra).forEach((k) => localStorage.setItem(k, typeof extra[k] === "object" ? JSON.stringify(extra[k]) : String(extra[k])));
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

// Telegram va encendido por defecto; solo se apaga si el usuario lo desmarca.
let tgEnabled = true;
let tgBotKh = "userdkh_bot";      // bot DigitalKH (Disney)
let tgBotWolf = "WolfStr_bot";    // bot Andres / Wolf
let tgBotStore = "CodigosTV_bot"; // bot de Storetools (ProveedorYT)
let modoCodigo = {};              // por proveedor: "telegram" (defecto) | "directo"
let storetoolsId = "";            // ID de consulta de Storetools
let fcmSlug = "digital-kh";       // empresa en FastCodeManager (KH)

// La decisión de por dónde se pide el código vive en numero-utils.js
// (rutaCodigo), compartida con el overlay. Aquí solo se pinta el botón.
const utils = window.__elixirUtils;

function cfgCodigo() {
  return { modoCodigo, storetoolsId, fcmSlug, tgBotKh, tgBotWolf, tgBotStore };
}

// Un solo botón por tarjeta: endpoint directo o bot de Telegram, según el
// interruptor del proveedor en Ajustes. Telegram puede apagarse del todo.
function botonCodigo(acc, email) {
  if (!email) return "";
  const r = utils.rutaCodigo(acc, cfgCodigo());
  if (r.ruta === "directo") {
    const plat = r.plataforma ? escapeHtml(r.plataforma.id) : "";
    return `<button class="pedir directo" data-email="${email}" data-proveedor="${r.proveedor}" data-plataforma="${plat}">${r.etiqueta}</button>`;
  }
  if (!tgEnabled) return "";
  const nombrePlat = r.plataforma ? escapeHtml(r.plataforma.nombre) : "";
  return `<button class="pedir" data-email="${email}" data-proveedor="${r.proveedor}" data-bot="${escapeHtml(r.bot)}" data-plat-nombre="${nombrePlat}">${r.etiqueta}</button>`;
}

// Nombre del proveedor para mostrar en la tarjeta (badge).
function nombreProveedor(acc) {
  return utils.nombreProveedor(acc);
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
          ${botonCodigo(acc, email)}
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

  // Listeners de los botones de código: endpoint directo o Telegram.
  document.querySelectorAll("#resultados .pedir").forEach((btn) => {
    btn.addEventListener("click", () =>
      btn.classList.contains("directo") ? pedirCodigoDirecto(btn) : pedirCodigoTelegram(btn)
    );
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
  } else if (resp.link) {
    slot.innerHTML = `<div class="codigo"><span>Enlace</span><button class="ccopy">Abrir</button></div>`;
    slot.querySelector(".ccopy").addEventListener("click", () => chrome.tabs.create({ url: resp.link }));
  } else {
    slot.innerHTML = `<div class="codigo"><small>${escapeHtml((resp.texto || "Respondió sin código.").slice(0, 90))}${nota}</small></div>`;
  }
}

// Ruta directa: Netflix (buzón propio), Storetools y KH. Una petición al
// background y listo, sin abrir Telegram ni salir de aquí. `extra` trae la
// plataforma o el servicio elegidos a mano cuando el tipo no se reconoció.
function pedirCodigoDirecto(btn, extra) {
  const email = btn.getAttribute("data-email");
  if (!email) return;
  const slot = btn.parentElement.querySelector(".codigo-slot");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Buscando…";

  const p = utils.plataformaPorId(btn.getAttribute("data-plataforma") || "");
  const msg = {
    type: "codigo-directo",
    proveedor: btn.getAttribute("data-proveedor") || "netflix-elixir",
    correo: email,
    plataforma: p ? { id: p.id, num: p.num, nombre: p.nombre } : null,
    ...(extra || {}),
  };
  chrome.runtime.sendMessage(msg, (resp) => {
    btn.disabled = false;
    btn.textContent = original;
    if (chrome.runtime.lastError) {
      if (slot) slot.innerHTML = `<div class="msg error">Error de extensión.</div>`;
      return;
    }
    pintarResultadoDirecto(slot, resp, (eleccion) => pedirCodigoDirecto(btn, eleccion));
  });
}

function pintarResultadoDirecto(slot, resp, reenviar) {
  if (!slot) return;
  if (!resp || !resp.ok) {
    const error = escapeHtml((resp && resp.error) || "No se pudo consultar.");
    // Storetools mide las consultas: se dice cuándo reintentar, no se reintenta solo.
    const espera = resp && typeof resp.reintentarEn === "number" && resp.reintentarEn > 0
      ? `<small>Puedes reintentar en ${resp.reintentarEn} s.</small>` : "";
    slot.innerHTML = `<div class="msg error">${error}${espera}</div>`;
    if (resp && (resp.elegirPlataforma || resp.elegirServicio)) pintarSelector(slot, resp, reenviar);
    return;
  }

  // De quién es el código: evita entregarle a un cliente el de otro perfil.
  const quien = [resp.perfil, resp.dispositivo, resp.plataforma, resp.asunto]
    .filter(Boolean).map(escapeHtml).join(" · ");
  const pie = quien ? `<div class="pin-nota">${quien}</div>` : "";

  if (resp.codigo) {
    slot.innerHTML = `<div class="codigo"><span>Código: <b>${escapeHtml(resp.codigo)}</b></span><button class="ccopy">Copiar</button></div>${pie}`;
    slot.querySelector(".ccopy").addEventListener("click", async (e) => {
      await copiarTexto(resp.codigo);
      e.target.textContent = "✓";
      setTimeout(() => { e.target.textContent = "Copiar"; }, 1200);
    });
    copiarTexto(resp.codigo);
    return;
  }

  if (resp.link) {
    // Nunca se abre solo: el enlace de hogar confirma el cambio al pulsarlo y el
    // de viaje es de un solo uso. Lo abre el operador cuando toca.
    slot.innerHTML = `
      <div class="codigo"><span>${resp.tipo === "household" ? "Confirmar hogar" : "Enlace"}</span>
      <button class="ccopy">Abrir</button></div>${pie}`;
    slot.querySelector(".ccopy").addEventListener("click", () => {
      chrome.tabs.create({ url: resp.link });
    });
    return;
  }

  slot.innerHTML = `<div class="msg">Llegó un correo pero sin código utilizable.</div>${pie}`;
}

// Selector de plataforma (Storetools) o de servicio (KH) cuando el tipo de
// cuenta no casa con ninguno conocido. Adivinar da "no registra", que engaña.
function pintarSelector(slot, resp, reenviar) {
  const opciones = resp.elegirServicio
    ? resp.elegirServicio.map((x) => ({ valor: x.id, texto: x.nombre }))
    : utils.PLATAFORMAS_STORETOOLS.map((x) => ({ valor: x.id, texto: x.nombre }));
  const sel = document.createElement("select");
  opciones.forEach((o) => {
    const op = document.createElement("option");
    op.value = o.valor; op.textContent = o.texto;
    sel.appendChild(op);
  });
  const ok = document.createElement("button");
  ok.textContent = "Consultar";
  const caja = document.createElement("div");
  caja.className = "elegir";
  caja.appendChild(sel); caja.appendChild(ok);
  slot.appendChild(caja);
  ok.addEventListener("click", () => {
    if (resp.elegirServicio) { reenviar({ servicioId: sel.value }); return; }
    const p = utils.plataformaPorId(sel.value);
    reenviar({ plataforma: p ? { id: p.id, num: p.num, nombre: p.nombre } : null });
  });
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
  const proveedor = btn.getAttribute("data-proveedor") || null;
  const plataforma = btn.getAttribute("data-plat-nombre") || null;
  chrome.runtime.sendMessage({ type: "tg-pedir-codigo", correo: email, bot, proveedor, plataforma }, (resp) => {
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
// Decodificar el PIN de recarga (base64). Todo local: no sale de este navegador.
// El popup se cierra al cambiar de pestaña, así que el resultado se guarda con
// caducidad para que siga ahí al volver (copiar el pin en Refácil → ir a Netflix).
// ---------------------------------------------------------------------------
const PIN_TTL_MS = 30 * 60 * 1000;

function pintarPin(texto, guardado) {
  const slot = document.getElementById("pinResultado");
  slot.innerHTML = `
    <div class="pin-out"><b>${escapeHtml(texto)}</b><button class="ccopy">Copiar</button></div>
    <div class="pin-nota">${guardado ? "Del pin anterior · " : ""}copiado al portapapeles ✓</div>`;
  slot.querySelector(".ccopy").addEventListener("click", async (e) => {
    await copiarTexto(texto);
    e.target.textContent = "✓";
    setTimeout(() => { e.target.textContent = "Copiar"; }, 1200);
  });
}

function pintarPinError(motivo) {
  const msg = motivo === "no-base64"
    ? "Eso no parece un PIN codificado. Copia el valor del recibo tal cual."
    : motivo === "no-texto"
      ? "Se decodificó pero no dio un texto legible."
      : "Pega el PIN del recibo.";
  document.getElementById("pinResultado").innerHTML = `<div class="msg error">${msg}</div>`;
}

async function decodificarPinDelInput() {
  const crudo = document.getElementById("pinInput").value;
  const u = window.__elixirUtils;
  if (!u) return pintarPinError("");

  const r = u.decodificarPin(crudo);
  if (!r.ok) return pintarPinError(r.motivo);

  await copiarTexto(r.texto);
  pintarPin(r.texto, false);
  try {
    await chrome.storage.local.set({ ultimoPin: { texto: r.texto, ts: Date.now() } });
  } catch (e) { /* sin caché seguimos funcionando */ }
}

async function restaurarUltimoPin() {
  let cfg;
  try { cfg = await chrome.storage.local.get("ultimoPin"); } catch (e) { return; }
  const p = cfg && cfg.ultimoPin;
  if (!p || !p.texto || !p.ts || Date.now() - p.ts > PIN_TTL_MS) return;
  const slot = document.getElementById("pinResultado");
  slot.innerHTML = `
    <div class="pin-out"><b>${escapeHtml(p.texto)}</b><button class="ccopy">Copiar</button></div>
    <div class="pin-nota">Último PIN de esta sesión.</div>`;
  slot.querySelector(".ccopy").addEventListener("click", async (e) => {
    await copiarTexto(p.texto);
    e.target.textContent = "✓";
    setTimeout(() => { e.target.textContent = "Copiar"; }, 1200);
  });
}

// ---------------------------------------------------------------------------
// Config: cargar / guardar
// ---------------------------------------------------------------------------
async function cargarConfigEnInputs() {
  const cfg = await getConfig();
  if (cfg.baseUrl) document.getElementById("cfgBaseUrl").value = cfg.baseUrl;
  if (cfg.apiKey) document.getElementById("cfgApiKey").value = cfg.apiKey;
  document.getElementById("cfgCodigosUrl").value = cfg.codigosUrl || "https://codigos.elixircuentas.com";
  if (cfg.codigosApiKey) document.getElementById("cfgCodigosApiKey").value = cfg.codigosApiKey;
  document.getElementById("cfgOverlayForma").value =
    cfg.overlayForma === "barra" ? "barra" : "burbuja";
  // !!cfg.tgEnabled dejaría en false a quien nunca lo configuró: solo apagamos
  // si hay un false guardado a propósito.
  tgEnabled = cfg.tgEnabled !== false;
  if (cfg.tgBotKh && cfg.tgBotKh.trim()) tgBotKh = cfg.tgBotKh.trim().replace(/^@/, "");
  if (cfg.tgBotWolf && cfg.tgBotWolf.trim()) tgBotWolf = cfg.tgBotWolf.trim().replace(/^@/, "");
  document.getElementById("cfgTgEnabled").checked = tgEnabled;
  document.getElementById("cfgTgBotKh").value = cfg.tgBotKh || "";
  document.getElementById("cfgTgBotWolf").value = cfg.tgBotWolf || "";

  // Cómo se pide el código, por proveedor. Telegram salvo que se haya elegido
  // directo a propósito; el ID de Storetools nunca tiene valor por defecto.
  if (cfg.tgBotStore && cfg.tgBotStore.trim()) tgBotStore = cfg.tgBotStore.trim().replace(/^@/, "");
  modoCodigo = (cfg.modoCodigo && typeof cfg.modoCodigo === "object") ? cfg.modoCodigo : {};
  storetoolsId = (cfg.storetoolsId || "").trim();
  // Solo un string guardado (aunque esté vacío) pisa el default: quien nunca
  // guardó Ajustes debe tener el directo de KH listo para encender.
  if (typeof cfg.fcmSlug === "string") fcmSlug = cfg.fcmSlug.trim();
  document.getElementById("cfgModoStoretools").value = modoCodigo.storetools === "directo" ? "directo" : "telegram";
  document.getElementById("cfgModoKh").value = modoCodigo.kh === "directo" ? "directo" : "telegram";
  document.getElementById("cfgStoretoolsId").value = storetoolsId;
  document.getElementById("cfgTgBotStore").value = cfg.tgBotStore || "";
  document.getElementById("cfgFcmSlug").value = typeof cfg.fcmSlug === "string" ? cfg.fcmSlug : fcmSlug;
}

async function guardarConfig() {
  const baseUrl = document.getElementById("cfgBaseUrl").value.trim().replace(/\/+$/, "");
  const apiKey = document.getElementById("cfgApiKey").value.trim();
  const codigosUrl = document.getElementById("cfgCodigosUrl").value.trim().replace(/\/+$/, "");
  const codigosApiKey = document.getElementById("cfgCodigosApiKey").value.trim();
  const overlayFormaNueva = document.getElementById("cfgOverlayForma").value;
  const tgEnabledNuevo = document.getElementById("cfgTgEnabled").checked;
  const tgBotKhNuevo = document.getElementById("cfgTgBotKh").value.trim().replace(/^@/, "");
  const tgBotWolfNuevo = document.getElementById("cfgTgBotWolf").value.trim().replace(/^@/, "");
  const tgBotStoreNuevo = document.getElementById("cfgTgBotStore").value.trim().replace(/^@/, "");
  const modoCodigoNuevo = {
    storetools: document.getElementById("cfgModoStoretools").value === "directo" ? "directo" : "telegram",
    kh: document.getElementById("cfgModoKh").value === "directo" ? "directo" : "telegram",
    wolf: "telegram", // sin endpoint todavía
  };
  const storetoolsIdNuevo = document.getElementById("cfgStoretoolsId").value.trim();
  const fcmSlugNuevo = document.getElementById("cfgFcmSlug").value.trim();
  tgEnabled = tgEnabledNuevo;
  if (tgBotKhNuevo) tgBotKh = tgBotKhNuevo;
  if (tgBotWolfNuevo) tgBotWolf = tgBotWolfNuevo;
  if (tgBotStoreNuevo) tgBotStore = tgBotStoreNuevo;
  modoCodigo = modoCodigoNuevo;
  storetoolsId = storetoolsIdNuevo;
  fcmSlug = fcmSlugNuevo;
  await setConfig({
    baseUrl, apiKey, codigosUrl, codigosApiKey, overlayForma: overlayFormaNueva,
    tgEnabled: tgEnabledNuevo, tgBotKh: tgBotKhNuevo, tgBotWolf: tgBotWolfNuevo, tgBotStore: tgBotStoreNuevo,
    modoCodigo: modoCodigoNuevo, storetoolsId: storetoolsIdNuevo, fcmSlug: fcmSlugNuevo,
  });
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
  restaurarUltimoPin();

  document.getElementById("pinBtn").addEventListener("click", decodificarPinDelInput);
  document.getElementById("pinInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") decodificarPinDelInput();
  });

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

  // Reabre el panel flotante. El overlay escucha overlayState en
  // chrome.storage.onChanged, así que reaparece sin recargar WhatsApp.
  // Interruptor del flotante. Un solo control, y con estado visible: antes había
  // un botón aquí y un check en Ajustes gobernando lo mismo, y acababan
  // contradiciéndose.
  async function pintarBotonFlotante() {
    const cfg = await getConfig();
    const on = cfg.overlayEnabled !== false;
    const pastilla = document.getElementById("btnFlotanteEstado");
    pastilla.textContent = on ? "Encendido" : "Apagado";
    pastilla.className = "pastilla " + (on ? "on" : "off");
    document.getElementById("btnFlotanteTxt").textContent =
      on ? "⚡ Panel flotante" : "⚡ Panel flotante";
    document.getElementById("btnFlotante").title = on
      ? "Quitarlo de WhatsApp Web. Ctrl/Cmd+Shift+C seguirá copiando el número."
      : "Volver a mostrarlo en WhatsApp Web.";
  }

  document.getElementById("btnFlotante").addEventListener("click", async function () {
    try {
      const cfg = await getConfig();
      const nuevo = cfg.overlayEnabled === false;   // apagado → encender
      // overlayState solo se toca al encender, y siempre a "bubble": escribirlo
      // estando en "panel" lo minimizaría sin que nadie lo pidiera.
      await setConfig(nuevo ? { overlayEnabled: true, overlayState: "bubble" } : { overlayEnabled: false });
      await pintarBotonFlotante();
      setMensaje(nuevo
        ? "Panel encendido. Míralo en la pestaña de WhatsApp Web."
        : "Panel apagado. El atajo Ctrl/Cmd+Shift+C sigue copiando el número.");
    } catch (e) {
      setMensaje("No se pudo cambiar el panel.", true);
    }
  });
  pintarBotonFlotante();

  document.getElementById("buscarCuentas").addEventListener("click", buscarCuentas);
  document.getElementById("cfgGuardar").addEventListener("click", guardarConfig);

  // Navegación entre vista principal y ajustes
  document.getElementById("btnAjustes").addEventListener("click", () => mostrarVista("ajustes"));
  document.getElementById("btnVolver").addEventListener("click", () => mostrarVista("principal"));
});
