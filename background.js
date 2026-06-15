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
async function pedirCodigoTelegram(correo, bot) {
  const tabs = await chrome.tabs.query({ url: "*://web.telegram.org/*" });
  if (!tabs.length) {
    return { ok: false, error: "Abre web.telegram.org/k/ en una pestaña primero." };
  }
  // Prioriza una pestaña /k/ si hay varias.
  const tab = tabs.find((t) => t.url && t.url.includes("/k/")) || tabs[0];

  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "tg-enviar", correo, bot });
    return resp || { ok: false, error: "Sin respuesta de la pestaña de Telegram." };
  } catch (e) {
    return {
      ok: false,
      error: "No pude contactar la pestaña de Telegram. Recárgala (F5) para activar el script.",
    };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "elixir-lookup" && typeof msg.numero === "string") {
    lookupCuentas(msg.numero).then(sendResponse).catch((err) =>
      sendResponse({ ok: false, error: String(err) })
    );
    return true; // respuesta asíncrona
  }
  if (msg && msg.type === "tg-pedir-codigo" && typeof msg.correo === "string") {
    pedirCodigoTelegram(msg.correo, msg.bot).then(sendResponse).catch((err) =>
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
