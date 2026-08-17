chrome.runtime.onInstalled.addListener(() => {
  console.log("WhatsApp Contact Extension Installed");
});

// ---------------------------------------------------------------------------
// Lookup de cuentas Elixir desde el service worker. El content script (overlay)
// NO puede hacer el fetch (CORS); nos manda el número y aquí lo consultamos con
// los host_permissions, omitiendo CORS. Reusa la config de chrome.storage.local.
// ---------------------------------------------------------------------------
let lookupController = null;

// `termino` y no `numero`: hoy siempre es un teléfono, pero la columna whatsapp
// de la web aceptará también nombres de usuario, y entonces esto viajará tal cual
// sin tener que tocar la extensión. Quien decide cómo buscar es el backend.
async function lookupCuentas(termino) {
  const { baseUrl, apiKey } = await chrome.storage.local.get(["baseUrl", "apiKey"]);
  if (!apiKey) return { ok: false, status: 401, error: "API key inválida o no configurada" };
  if (!baseUrl) return { ok: false, error: "Configura la BASE_URL en Ajustes" };

  // Cancela cualquier lookup anterior aún en vuelo (cambio rápido de chat).
  if (lookupController) lookupController.abort();
  const controller = new AbortController();
  lookupController = controller;

  const url = baseUrl.replace(/\/+$/, "") + "/api/extension/lookup?whatsapp=" + encodeURIComponent(termino);

  let resp;
  try {
    resp = await fetch(url, { headers: { "X-Api-Key": apiKey }, signal: controller.signal });
  } catch (e) {
    if (e && e.name === "AbortError") return { ok: false, aborted: true };
    return { ok: false, error: "Error de red al consultar la API" };
  }

  if (resp.status === 401) return { ok: false, status: 401, error: "API key inválida o no configurada" };
  if (!resp.ok) return { ok: false, status: resp.status, error: `Error de la API (HTTP ${resp.status})` };

  try {
    const data = await resp.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: "Respuesta inválida de la API" };
  }
}

// ---------------------------------------------------------------------------
// Códigos de Netflix leídos del buzón central (ApiExtractMail).
// Va aquí y no en el content script por dos razones: el service worker tiene
// host_permissions, así que no le aplica CORS (la API solo permite el origen de
// la página Elixir), y así la API key no viaja nunca a web.whatsapp.com.
// ---------------------------------------------------------------------------
const CODIGOS_URL_DEFECTO = "https://codigos.elixircuentas.com";

async function codigoPorCorreo(correo) {
  const { codigosUrl, codigosApiKey } = await chrome.storage.local.get(["codigosUrl", "codigosApiKey"]);
  const base = (codigosUrl || CODIGOS_URL_DEFECTO).replace(/\/+$/, "");
  if (!codigosApiKey) {
    return { ok: false, error: "Falta la API key de códigos (⚙️ Ajustes)." };
  }

  const url = base + "/api/code?email=" + encodeURIComponent(correo);

  let resp;
  try {
    resp = await fetch(url, { headers: { "X-Api-Key": codigosApiKey } });
  } catch (e) {
    return { ok: false, error: "Sin conexión con el servicio de códigos." };
  }

  if (resp.status === 401) return { ok: false, error: "API key de códigos inválida." };
  if (resp.status === 503) return { ok: false, error: "El servicio de códigos está deshabilitado." };
  if (!resp.ok) return { ok: false, error: `Error del servicio (HTTP ${resp.status}).` };

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    return { ok: false, error: "Respuesta inválida del servicio de códigos." };
  }

  if (!data || !data.success) {
    return { ok: false, error: mensajeDeErrorCodigo(data), motivo: data && data.error };
  }
  // code (signin/travel) o link (household); name y device sirven para comprobar
  // que el código es del perfil del cliente que está escribiendo.
  return {
    ok: true,
    tipo: data.type || null,
    codigo: data.codigo || data.code || null,
    link: data.link || null,
    perfil: data.name || null,
    dispositivo: data.device || null,
  };
}

// Los códigos de error de la API son internos; aquí se traducen a algo accionable.
function mensajeDeErrorCodigo(data) {
  const motivo = data && data.error;
  if (motivo === "no_email") return "No llegó ningún código reciente para esta cuenta.";
  if (motivo === "blocked_device") return "Llegó un código, pero el dispositivo está bloqueado por tus reglas.";
  if (motivo === "gmail_error") return "El servicio no pudo leer el correo. Revisa el panel de códigos.";
  if (motivo === "signin_help") return (data && data.message) || "Netflix pide verificación de inicio de sesión.";
  return (data && data.message) || "No se encontró código para esta cuenta.";
}

// ---------------------------------------------------------------------------
// PROTOTIPO Telegram (Bloque 2, detrás de flag): el overlay manda el correo,
// aquí localizamos la pestaña de Telegram Web y reenviamos la orden al content
// script telegram.js, que pega/envía y lee el código. Devolvemos el código.
// ---------------------------------------------------------------------------
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Pestaña de Telegram ya abierta (prioriza la versión K). null si no hay.
async function obtenerTabTelegram() {
  const tabs = await chrome.tabs.query({ url: "*://web.telegram.org/*" });
  if (!tabs.length) return null;
  return tabs.find((t) => t.url && t.url.includes("/k/")) || tabs[0];
}

// Abre Telegram Web K directamente en el chat del bot.
async function abrirTabTelegram(handle) {
  return chrome.tabs.create({
    url: "https://web.telegram.org/k/#@" + handle,
    active: false,
  });
}

// Trae la pestaña al frente: destraba el throttling/render del SPA de Telegram.
async function enfocarTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId != null) {
    try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) {}
  }
}

// Hace ping al content script hasta que responde. Si la pestaña ya cargó pero el
// script no está (pestaña vieja / extensión recargada), lo inyecta y reintenta.
async function esperarTabLista(tabId, timeoutMs = 15000) {
  const t0 = Date.now();
  let inyectado = false;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, { type: "tg-ping" });
      if (r && r.ok) return true;
    } catch (e) {
      // Sin content script todavía: intenta inyectarlo una vez.
      if (!inyectado) {
        inyectado = true;
        try {
          await chrome.scripting.executeScript({ target: { tabId }, files: ["telegram.js"] });
        } catch (e2) {}
      }
    }
    await sleep(400);
  }
  return false;
}

// Extrae el handle del bot abierto desde la URL de la pestaña (Telegram K refleja
// el chat en el hash, p.ej. #@userdkh_bot). null si no es un deep-link de bot.
function botDeUrl(url) {
  const m = /#@([A-Za-z0-9_]+)/.exec(url || "");
  return m ? m[1].toLowerCase() : null;
}

// Manda la orden al content script (con retry de inyección si el script no está).
// `switchTo` = handle del bot al que cambiar por el buscador (null si ya estamos).
async function enviarATelegram(tabId, correo, handle, switchTo) {
  const msg = { type: "tg-enviar", correo, bot: handle, switchTo: switchTo || null };
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["telegram.js"] });
    return await chrome.tabs.sendMessage(tabId, msg);
  }
}

// Navega la pestaña al bot forzando una CARGA COMPLETA real (no same-document) y
// espera a que termine. Cambiar el query (?elx=…, antes del #) obliga a Chrome a
// recargar el documento entero; Telegram arranca fresco y resuelve el deep-link
// #@bot igual que en una pestaña nueva (cambiar solo el #hash NO recarga: el SPA
// de Telegram revierte el hash y se queda en el chat viejo).
function navegarABot(tabId, handle) {
  return new Promise((resolve) => {
    const url = "https://web.telegram.org/k/?elx=" + Date.now() + "#@" + handle;
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      try { chrome.tabs.onUpdated.removeListener(onUpd); } catch (e) {}
      clearTimeout(to);
      resolve(ok);
    };
    const onUpd = (id, info) => { if (id === tabId && info.status === "complete") finish(true); };
    chrome.tabs.onUpdated.addListener(onUpd);
    const to = setTimeout(() => finish(false), 20000);
    chrome.tabs.update(tabId, { url, active: true }).catch(() => finish(false));
  });
}

async function pedirCodigoTelegram(correo, bot, sender) {
  const handle = (bot || "WolfStr_bot").replace(/^@/, "");

  // Localiza o abre la pestaña de Telegram. Decidimos si hace falta cambiar de bot
  // leyendo la URL real (ground-truth del bot abierto), no una suposición.
  let tab = await obtenerTabTelegram();
  let switchTo = null; // handle al que cambiar por el buscador (null = ya estamos)
  if (!tab) {
    try { tab = await abrirTabTelegram(handle); } // pestaña nueva: ya carga en el bot
    catch (e) { return { ok: false, error: "No pude abrir Telegram." }; }
  } else if (botDeUrl(tab.url) !== handle.toLowerCase()) {
    switchTo = handle; // está en otro bot: intentamos cambiar SIN recargar (buscador)
  }

  // Enfoca Telegram (destraba el render del SPA) y NOS QUEDAMOS ahí: el usuario
  // copia/pega al cliente desde el chat.
  await enfocarTab(tab);
  if (!(await esperarTabLista(tab.id))) {
    return { ok: false, error: "Telegram tardó en cargar, reintenta." };
  }

  let resp;
  try {
    resp = await enviarATelegram(tab.id, correo, handle, switchTo);
  } catch (e) {
    return { ok: false, error: "No pude activar el script en Telegram (recarga la pestaña)." };
  }

  // Fallback: si el cambio por buscador no funcionó, recargamos directo en el bot
  // (carga completa fiable) y reintentamos una vez sin cambio in-page.
  if (resp && resp.needsReload) {
    if (!(await navegarABot(tab.id, handle))) {
      return { ok: false, error: "Telegram tardó en cargar, reintenta." };
    }
    if (!(await esperarTabLista(tab.id))) {
      return { ok: false, error: "Telegram tardó en cargar, reintenta." };
    }
    try {
      resp = await enviarATelegram(tab.id, correo, handle, null);
    } catch (e) {
      return { ok: false, error: "No pude activar el script en Telegram (recarga la pestaña)." };
    }
  }

  resp = resp || { ok: false, error: "Sin respuesta de la pestaña de Telegram." };

  // Persistimos el último resultado: el popup se cierra al cambiar de foco y lo lee al reabrirse.
  try { await chrome.storage.local.set({ tgUltimoResultado: { correo, ...resp, ts: Date.now() } }); } catch (e) {}

  return resp;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "elixir-lookup") {
    // msg.numero es el nombre viejo del campo. Al actualizar la extensión, el
    // service worker se recarga pero las pestañas de WhatsApp abiertas siguen
    // con el content script anterior: durante ese rato mandan `numero`.
    const termino = typeof msg.termino === "string" ? msg.termino : msg.numero;
    if (typeof termino !== "string") return;
    lookupCuentas(termino).then(sendResponse).catch((err) =>
      sendResponse({ ok: false, error: String(err) })
    );
    return true; // respuesta asíncrona
  }
  if (msg && msg.type === "tg-pedir-codigo" && typeof msg.correo === "string") {
    pedirCodigoTelegram(msg.correo, msg.bot, sender).then(sendResponse).catch((err) =>
      sendResponse({ ok: false, error: String(err) })
    );
    return true; // respuesta asíncrona
  }
  if (msg && msg.type === "codigo-correo" && typeof msg.correo === "string") {
    codigoPorCorreo(msg.correo).then(sendResponse).catch((err) =>
      sendResponse({ ok: false, error: String(err) })
    );
    return true; // respuesta asíncrona
  }
});

// Cada script inyectado necesita numero-utils.js delante: los content_scripts
// declarados en el manifest no se inyectan retroactivamente en pestañas que ya
// estaban abiertas, y el guard versionado hace que repetirlo sea un no-op.
const SCRIPTS_POR_COMANDO = {
  "copiar-numero-auto": "copynumber.js",
  "abrir-contactos-auto": "content.js",
  "buscar-elixir-auto": "buscarelixir.js",
  "copiar-usuario-auto": "copyusername.js",
};

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab || !tab.id) return;
  const archivo = SCRIPTS_POR_COMANDO[command];
  if (!archivo) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["numero-utils.js", archivo],
  });
});
