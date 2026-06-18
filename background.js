chrome.runtime.onInstalled.addListener(() => {
  console.log("WhatsApp Contact Extension Installed");
});

// ---------------------------------------------------------------------------
// Lookup de cuentas Elixir desde el service worker. El content script (overlay)
// NO puede hacer el fetch (CORS); nos manda el número y aquí lo consultamos con
// los host_permissions, omitiendo CORS. Reusa la config de chrome.storage.local.
// ---------------------------------------------------------------------------
let lookupController = null;

async function lookupCuentas(numero) {
  const { baseUrl, apiKey } = await chrome.storage.local.get(["baseUrl", "apiKey"]);
  if (!apiKey) return { ok: false, status: 401, error: "API key inválida o no configurada" };
  if (!baseUrl) return { ok: false, error: "Configura la BASE_URL en Ajustes" };

  // Cancela cualquier lookup anterior aún en vuelo (cambio rápido de chat).
  if (lookupController) lookupController.abort();
  const controller = new AbortController();
  lookupController = controller;

  const url = baseUrl.replace(/\/+$/, "") + "/api/extension/lookup?whatsapp=" + encodeURIComponent(numero);

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
async function enviarATelegram(tabId, correo, handle) {
  const msg = { type: "tg-enviar", correo, bot: handle };
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

  // Localiza o abre la pestaña de Telegram. Decidimos si recargar leyendo la URL
  // real de la pestaña (ground-truth del bot abierto), no una suposición.
  let tab = await obtenerTabTelegram();
  if (!tab) {
    try { tab = await abrirTabTelegram(handle); }
    catch (e) { return { ok: false, error: "No pude abrir Telegram." }; }
  } else if (botDeUrl(tab.url) !== handle.toLowerCase()) {
    // La pestaña está en otro bot (o el hash no es deep-link): carga completa al correcto.
    if (!(await navegarABot(tab.id, handle))) {
      return { ok: false, error: "Telegram tardó en cargar, reintenta." };
    }
  }

  // Enfoca Telegram (destraba el render del SPA) y NOS QUEDAMOS ahí: el usuario
  // copia/pega al cliente desde el chat.
  await enfocarTab(tab);
  if (!(await esperarTabLista(tab.id))) {
    return { ok: false, error: "Telegram tardó en cargar, reintenta." };
  }

  let resp;
  try {
    resp = await enviarATelegram(tab.id, correo, handle);
  } catch (e) {
    return { ok: false, error: "No pude activar el script en Telegram (recarga la pestaña)." };
  }

  resp = resp || { ok: false, error: "Sin respuesta de la pestaña de Telegram." };

  // Persistimos el último resultado: el popup se cierra al cambiar de foco y lo lee al reabrirse.
  try { await chrome.storage.local.set({ tgUltimoResultado: { correo, ...resp, ts: Date.now() } }); } catch (e) {}

  return resp;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "elixir-lookup" && typeof msg.numero === "string") {
    lookupCuentas(msg.numero).then(sendResponse).catch((err) =>
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
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab || !tab.id) return;

  if (command === "copiar-numero-auto") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["copynumber.js"],
    });
  }

  if (command === "abrir-contactos-auto") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  }

  if (command === "buscar-elixir-auto") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["buscarelixir.js"],
    });
  }
});
