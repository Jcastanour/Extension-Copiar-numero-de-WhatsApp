// Extractor de códigos a partir del HTML de un correo (Storetools no manda el
// código, manda el correo entero). Vive aparte para poder probarlo en Node.
importScripts("codigo-html.js");

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
// Códigos de Storetools (cuentas de ProveedorYT): POST storetools.co/api/consultar.
// Es el mismo servicio al que pregunta el bot de Telegram, sin pasar por él.
// Contrato (2 nov 2026): el cuerpo lleva la plataforma (id + número), el correo
// y el ID de consulta del operador; la respuesta trae `respuesta` ("exito",
// "sin_correos", "sesion", "caducado"…) y, si hubo suerte, `resultadoCorreos`
// con el correo ENTERO en HTML (`mensaje`), sin campo de código: se extrae aquí.
// Las consultas están medidas (existe "caducado"), así que no se reintenta solo.
// ---------------------------------------------------------------------------
const STORETOOLS_URL = "https://storetools.co/api/consultar";

async function codigoStoretools(correo, plataforma) {
  const { storetoolsId } = await chrome.storage.local.get(["storetoolsId"]);
  const id = String(storetoolsId || "").trim();
  if (!id) return { ok: false, error: "Falta el ID de consulta de Storetools (⚙️ Ajustes)." };
  if (!plataforma || !plataforma.id) {
    return { ok: false, error: "No sé a qué plataforma de Storetools corresponde este tipo de cuenta.", elegirPlataforma: true };
  }

  let resp;
  try {
    resp = await fetch(STORETOOLS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plataforma: plataforma.id,
        idPlataforma: String(plataforma.num),
        correoConsultar: correo,
        modo: "correo",
        tipoConsulta: "correo",
        token: null,
        idUsuarioConsulta: id,
        language: "es",
      }),
    });
  } catch (e) {
    return { ok: false, error: "Sin conexión con Storetools." };
  }
  if (!resp.ok) return { ok: false, error: `Error de Storetools (HTTP ${resp.status}).` };

  let data;
  try { data = await resp.json(); } catch (e) { return { ok: false, error: "Respuesta inválida de Storetools." }; }

  const r = data && (data.respuesta || data.status);
  const mensaje = (data && data.mensaje) || "";
  const correos = Array.isArray(data && data.resultadoCorreos) ? data.resultadoCorreos : [];

  if (r === "exito" && correos.length) {
    const c = correos[0]; // el más reciente
    const ex = self.__elixirCodigoHtml.extraerCodigoDeHtml(c.mensaje);
    return {
      ok: true,
      codigo: ex.codigo,
      link: ex.link,
      asunto: c.asunto || null,
      fecha: c.fecha || null,
      de: c.de || null,
      plataforma: plataforma.nombre || plataforma.id,
    };
  }
  if (r === "exito" || r === "sin_correos") {
    const faltan = data.cacheInfo && typeof data.cacheInfo.remaining === "number" ? data.cacheInfo.remaining : null;
    return { ok: false, error: "No llegó ningún correo reciente para esta cuenta.", reintentarEn: faltan };
  }
  if (r === "sesion") return { ok: false, error: "Storetools pide autorización: revisa el ID de consulta (⚙️ Ajustes)." };
  if (r === "caducado") return { ok: false, error: mensaje || "Plan de Storetools caducado o límite de consultas superado." };
  // "no registra" suele ser plataforma equivocada, no cuenta inexistente: se
  // ofrece elegir otra en vez de dar la consulta por perdida.
  const malaPlataforma = /no registra|no existe|cuenta no|plataforma/i.test(mensaje);
  return { ok: false, error: mensaje || "Storetools no pudo procesar la consulta.", elegirPlataforma: malaPlataforma };
}

// ---------------------------------------------------------------------------
// Códigos de Digital KH: api.fastcodemanager.com. A diferencia de Storetools,
// este ya devuelve el código extraído (`data.code`) o un enlace (`data.link`),
// y el listado de servicios es público, así que los ids no se queman aquí: se
// leen y se casan por nombre ("Prime Video", "HBO max", "Crunchyrroll" —sic—).
// ---------------------------------------------------------------------------
const FCM_URL = "https://api.fastcodemanager.com";
const FCM_SLUG_DEFECTO = "digital-kh";
const FCM_CACHE_MS = 10 * 60 * 1000;
let fcmServicios = { slug: null, ts: 0, items: [] };

// Palabra clave por plataforma (mismos ids que PLATAFORMAS_STORETOOLS en
// numero-utils.js) para casar con el nombre del servicio en KH.
const KH_PALABRAS = {
  netflix: /netflix/i, disney: /disney/i, prime: /prime|amazon/i, max: /\bmax\b|hbo/i,
  spotify: /spotify/i, paramount: /paramount/i, vix: /\bvix\b/i, crunchyroll: /crunchy/i,
  chatgpt: /chatgpt|openai/i, universal: /universal/i, appletv: /apple/i, foxone: /\bfox\b/i,
};

async function serviciosKh(slug) {
  const vivo = fcmServicios.slug === slug && fcmServicios.items.length && Date.now() - fcmServicios.ts < FCM_CACHE_MS;
  if (vivo) return fcmServicios.items;
  const resp = await fetch(`${FCM_URL}/enterprise/${encodeURIComponent(slug)}/services`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  // Forma real (2 nov 2026): { success, data: { companyName, services: [...] } }.
  // Se aceptan también una lista a secas o data como lista, por si cambia.
  const d = data && data.data;
  const items = Array.isArray(data) ? data
    : Array.isArray(d) ? d
    : (d && Array.isArray(d.services)) ? d.services
    : [];
  if (!items.length) throw new Error("listado vacío");
  fcmServicios = { slug, ts: Date.now(), items };
  return items;
}

// KH manda la fecha en ISO ("2026-11-03T00:27:09Z"); en la tarjeta se lee mejor
// en hora local. Si no se puede interpretar, se deja tal cual.
function fechaLegible(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  try { return d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }); }
  catch (e) { return d.toLocaleString(); }
}

async function codigoKh(correo, plataforma, servicioId) {
  const { fcmSlug } = await chrome.storage.local.get(["fcmSlug"]);
  const slug = String(fcmSlug || FCM_SLUG_DEFECTO).trim();

  let items;
  try { items = await serviciosKh(slug); }
  catch (e) { return { ok: false, error: "No pude leer los servicios de KH (FastCodeManager)." }; }
  const activos = items.filter((s) => s && s.enabled !== false);

  let servicio = null;
  if (servicioId) servicio = activos.find((s) => s.id === servicioId) || null;
  else if (plataforma && KH_PALABRAS[plataforma.id]) servicio = activos.find((s) => KH_PALABRAS[plataforma.id].test(s.name || "")) || null;

  if (!servicio) {
    return {
      ok: false,
      error: plataforma ? `KH no tiene servicio para ${plataforma.nombre || plataforma.id}.` : "No sé qué servicio de KH corresponde a este tipo de cuenta.",
      elegirServicio: activos.map((s) => ({ id: s.id, nombre: s.name })),
    };
  }

  let resp;
  try {
    resp = await fetch(`${FCM_URL}/enterprise/${encodeURIComponent(slug)}/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId: servicio.id, recipientEmail: correo }),
    });
  } catch (e) {
    return { ok: false, error: "Sin conexión con KH (FastCodeManager)." };
  }
  if (!resp.ok) return { ok: false, error: `Error de KH (HTTP ${resp.status}).` };

  let data;
  try { data = await resp.json(); } catch (e) { return { ok: false, error: "Respuesta inválida de KH." }; }
  if (!data || !data.success) return { ok: false, error: (data && (data.message || data.error)) || "KH no pudo procesar la consulta." };

  const d = data.data || {};
  if (d.registered === false) return { ok: false, error: "Ese correo no está registrado en KH." };
  if (!d.found) return { ok: false, error: "No llegó ningún código reciente para esta cuenta." };
  return {
    ok: true,
    codigo: d.code || null,
    link: d.link || null,
    asunto: d.subject || null,
    fecha: fechaLegible(d.date),
    plataforma: servicio.name,
  };
}

// Un solo mensaje para todas las rutas directas; quién es el proveedor lo
// decide numero-utils.js (rutaCodigo) en el overlay/popup.
function codigoDirecto(msg) {
  switch (msg.proveedor) {
    case "netflix-elixir": return codigoPorCorreo(msg.correo);
    case "storetools": return codigoStoretools(msg.correo, msg.plataforma || null);
    case "kh": return codigoKh(msg.correo, msg.plataforma || null, msg.servicioId || null);
    default: return Promise.resolve({ ok: false, error: "Este proveedor todavía no tiene endpoint directo." });
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
// `switchTo` = handle del bot al que cambiar por el buscador (null si ya estamos).
async function enviarATelegram(tabId, correo, handle, switchTo, opciones) {
  const msg = { type: "tg-enviar", correo, bot: handle, switchTo: switchTo || null, ...(opciones || {}) };
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

// `opciones`: { proveedor, plataforma } del overlay. El bot de Storetools pide
// elegir plataforma y, a veces, un ID de consulta; ese ID se lee aquí de los
// ajustes para que nunca viaje por la página de WhatsApp.
async function pedirCodigoTelegram(correo, bot, sender, opciones) {
  const handle = (bot || "WolfStr_bot").replace(/^@/, "");
  opciones = opciones || {};
  const extra = { plataforma: opciones.plataforma || null, idConsulta: null };
  if (opciones.proveedor === "storetools") {
    try {
      const { storetoolsId } = await chrome.storage.local.get(["storetoolsId"]);
      extra.idConsulta = String(storetoolsId || "").trim() || null;
    } catch (e) {}
  }

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
    resp = await enviarATelegram(tab.id, correo, handle, switchTo, extra);
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
      resp = await enviarATelegram(tab.id, correo, handle, null, extra);
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
    pedirCodigoTelegram(msg.correo, msg.bot, sender, { proveedor: msg.proveedor, plataforma: msg.plataforma }).then(sendResponse).catch((err) =>
      sendResponse({ ok: false, error: String(err) })
    );
    return true; // respuesta asíncrona
  }
  if (msg && msg.type === "codigo-directo" && typeof msg.correo === "string") {
    codigoDirecto(msg).then(sendResponse).catch((err) =>
      sendResponse({ ok: false, error: String(err) })
    );
    return true; // respuesta asíncrona
  }
  // Nombre viejo del mensaje de Netflix: una pestaña de WhatsApp abierta durante
  // la actualización sigue con el content script anterior un rato.
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
