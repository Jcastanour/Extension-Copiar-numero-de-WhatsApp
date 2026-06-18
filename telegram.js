// telegram.js — Content script (PROTOTIPO / detrás de flag) para Telegram Web K.
// Recibe un correo desde el background, lo pega en el input del bot, lo envía y
// lee el código de la respuesta. Selectores según docs/telegram-autopaste-spike.md.
// Es FRÁGIL ante cambios de DOM de Telegram: logea todo para depurar en vivo.
(function () {
  if (window.__elixirTelegramCargado) return;
  window.__elixirTelegramCargado = true;

  const LOG = (...a) => console.log("%c[Elixir-TG]", "color:#7c3aed;font-weight:bold", ...a);
  LOG("content script cargado en", location.href);

  const esWebK = location.pathname.startsWith("/k/");

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // Espera a que un selector exista (o null al expirar).
  async function waitFor(selector, timeout = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(150);
    }
    return null;
  }

  // ----- Localizar el input editable del chat -----
  function getInput() {
    return (
      document.querySelector(".input-message-container .input-field-input[contenteditable]") ||
      document.querySelector(".input-message-input") ||
      document.getElementById("editable-message-text") ||
      document.querySelector('[contenteditable="true"]')
    );
  }

  function getSendButton() {
    return (
      document.querySelector(".input-message-container .btn-send") ||
      document.querySelector("button.btn-send") ||
      document.querySelector(".btn-send")
    );
  }

  // Contenedor de mensajes (burbujas)
  function getBubblesContainer() {
    return document.querySelector(".bubbles-inner") || document.querySelector(".bubbles");
  }

  // ----- Escribir en el contenteditable -----
  function escribirEnInput(input, texto) {
    input.focus();
    // Selecciona y borra lo que haya
    try { document.execCommand("selectAll", false, null); } catch (e) {}
    let ok = false;
    try { ok = document.execCommand("insertText", false, texto); } catch (e) { ok = false; }
    if (!ok || cleanInput(input) !== texto) {
      // Fallback: setear texto + disparar InputEvent con inputType
      LOG("execCommand insertText no fue suficiente, usando fallback InputEvent");
      input.textContent = texto;
      input.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: texto, bubbles: true }));
    }
    LOG("input ahora contiene:", JSON.stringify(cleanInput(input)));
  }
  function cleanInput(input) { return (input.innerText || input.textContent || "").trim(); }

  // ----- Leer respuesta del bot -----
  // Marca de referencia: cuántas burbujas entrantes había antes de enviar.
  function snapshotEntrantes() {
    return document.querySelectorAll(".bubble.is-in").length;
  }
  function textoDeBurbuja(b) {
    const el =
      b.querySelector(".message, .text-content, .translatable-message") ||
      b.querySelector(".message-content");
    let texto = el ? (el.innerText || el.textContent || "") : (b.innerText || b.textContent || "");
    texto = texto.trim();
    // Recorta una hora colgada al final (p.ej. "… 09:51 PM" / "9:51 p.m.").
    texto = texto.replace(/\s*\d{1,2}:\d{2}\s*(?:[ap]\.?\s?m\.?)?\s*$/i, "").trim();
    return texto;
  }
  function extraerCodigo(texto) {
    if (!texto) return null;
    // 1) "código/code …: 123 456" (admite separador). 2) bloque suelto 3-8 dígitos.
    const m =
      texto.match(/(?:c[oó]digo|code)\D{0,20}?(\d{3}[\s-]?\d{3}|\d{3,8})/i) ||
      texto.match(/\b(\d{3}[\s-]?\d{3}|\d{4,8})\b/);
    return m ? m[1].replace(/[\s-]/g, "") : null;
  }
  // Mensajes del bot que niegan/rechazan (sin código): se muestran tal cual.
  function esDenegacion(texto) {
    return /no tienes autorizaci|no autorizado|no puedes usar|inv[aá]lid|no encontr|sin permiso/i.test(texto || "");
  }

  // El timeout cuenta SOLO tiempo visible: mientras la pestaña está en segundo
  // plano el reloj se pausa (Chrome congela el render, no es justo descontarlo).
  function esperarRespuestaBot(baseCount, timeout = 30000) {
    return new Promise((resolve) => {
      const container = getBubblesContainer();
      if (!container) { resolve({ ok: false, error: "No encontré el contenedor de mensajes." }); return; }

      let resuelto = false;
      const finish = (val) => {
        if (resuelto) return;
        resuelto = true;
        try { obs.disconnect(); } catch (e) {}
        clearInterval(tick);
        document.removeEventListener("visibilitychange", revisar);
        resolve(val);
      };

      const revisar = () => {
        const entrantes = document.querySelectorAll(".bubble.is-in");
        if (entrantes.length <= baseCount) return;
        // Mira las burbujas entrantes nuevas (de la más reciente hacia atrás)
        for (let i = entrantes.length - 1; i >= baseCount; i--) {
          const texto = textoDeBurbuja(entrantes[i]);
          if (!texto) continue;
          const codigo = extraerCodigo(texto);
          LOG("burbuja entrante nueva:", JSON.stringify(texto), "=> código:", codigo);
          if (codigo) { finish({ ok: true, codigo, texto }); return; }
          // Hay respuesta pero sin código reconocible: devolver el texto igual.
          finish({ ok: true, codigo: null, texto, denegado: esDenegacion(texto) });
          return;
        }
      };

      const obs = new MutationObserver(revisar);
      obs.observe(container, { childList: true, subtree: true, characterData: true });
      // Acumulador de tiempo visible.
      let visibleMs = 0;
      const tick = setInterval(() => {
        if (document.visibilityState === "visible") {
          visibleMs += 250;
          if (visibleMs >= timeout) finish({ ok: false, error: "El bot no respondió a tiempo." });
        }
      }, 250);
      document.addEventListener("visibilitychange", revisar);
      revisar(); // por si ya llegó
    });
  }

  // ----- Copiar al portapapeles (best-effort) -----
  // La pestaña de Telegram está enfocada (el background la trajo al frente), así
  // que el copy tiene contexto válido. Si el navegador lo bloquea, no pasa nada:
  // el usuario hace doble-click en el chat.
  async function copiarAlPortapapeles(texto) {
    if (!texto) return false;
    try {
      await navigator.clipboard.writeText(texto);
      LOG("copiado al portapapeles vía clipboard API");
      return true;
    } catch (e) {
      LOG("clipboard API falló, intento execCommand:", e);
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = texto;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      LOG("execCommand copy:", ok);
      return !!ok;
    } catch (e) {
      LOG("no pude copiar al portapapeles:", e);
      return false;
    }
  }

  // ----- Cambiar de chat SIN recargar, usando el buscador de Telegram -----
  // Best-effort: si no encuentra el buscador o el bot en los resultados, devuelve
  // false y el background recarga la pestaña (fallback fiable).
  function setInputValue(el, v) {
    try {
      const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : null;
      if (proto) {
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      } else {
        el.value = v;
        el.textContent = v;
      }
    } catch (e) { el.value = v; }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function getBuscador() {
    return (
      document.querySelector("#telegram-search-input") ||
      document.querySelector(".input-search-input") ||
      document.querySelector(".sidebar-search .input-field-input") ||
      document.querySelector(".input-search input") ||
      Array.from(document.querySelectorAll('input, [contenteditable="true"]'))
        .find((i) => /search|buscar/i.test(i.getAttribute("placeholder") || ""))
    );
  }

  // Clic "real" (Telegram K escucha mousedown/mouseup, no basta con .click()).
  function clicReal(el) {
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    for (const tipo of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      try { el.dispatchEvent(new MouseEvent(tipo, opts)); } catch (e) {}
    }
  }

  async function cambiarBotPorBusqueda(handle) {
    const target = handle.toLowerCase();
    const search = getBuscador();
    if (!search) { LOG("no encontré el buscador"); return false; }
    LOG("cambiando a @" + handle + " por buscador");
    search.focus();
    setInputValue(search, handle);

    // Espera a que aparezca el resultado del bot.
    let result = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const candidatos = document.querySelectorAll(
        "a.chatlist-chat, li.chatlist-chat, .chatlist-chat, .search-super-item, ul.chatlist li, .chatlist li, .chatlist a"
      );
      for (const c of candidatos) {
        const txt = (c.innerText || c.textContent || "").toLowerCase().replace(/\s+/g, "");
        if (txt.includes(target)) { result = c; break; }
      }
      if (result) break;
      await sleep(200);
    }
    if (!result) { LOG("no hallé @" + handle + " en los resultados del buscador"); return false; }

    // El clic debe ir al elemento clickable (a/li.chatlist-chat), no a un hijo.
    const clickable = result.closest("a.chatlist-chat, li.chatlist-chat, .chatlist-chat") || result;
    const prevHash = location.hash;
    clicReal(clickable);

    // Verifica que el chat cambió por el hash de la URL (Telegram K lo actualiza al
    // abrir otro chat). No usamos el contenedor de burbujas porque K lo reutiliza.
    const t1 = Date.now();
    while (Date.now() - t1 < 6000) {
      if (location.hash !== prevHash && getInput()) {
        await sleep(500); // deja renderizar el nuevo chat
        LOG("cambio de chat confirmado (hash:", location.hash, ")");
        return true;
      }
      await sleep(120);
    }
    LOG("el clic no cambió de chat (hash sin cambio)");
    return false;
  }

  // ----- Flujo principal -----
  // Si `switchTo` viene, cambiamos de bot por el buscador (sin recargar). Si no se
  // puede, devolvemos needsReload y el background recarga la pestaña (fallback).
  async function enviarYLeer(correo, switchTo) {
    if (!esWebK) {
      return { ok: false, error: "Abre Telegram en la versión K: web.telegram.org/k/" };
    }

    if (switchTo) {
      const ok = await cambiarBotPorBusqueda(switchTo);
      if (!ok) return { ok: false, needsReload: true };
    }

    const input = await waitFor(".input-message-container .input-field-input[contenteditable], .input-message-input, #editable-message-text", 8000) || getInput();
    if (!input) return { ok: false, error: "No encontré el campo de mensaje del chat." };

    const baseCount = snapshotEntrantes();
    LOG("burbujas entrantes antes de enviar:", baseCount);

    // El input recién cargado puede no estar listo: reintentamos hasta que el
    // correo realmente quede escrito.
    let escrito = false;
    for (let i = 0; i < 6; i++) {
      escribirEnInput(input, correo);
      await sleep(250);
      if (cleanInput(input) === correo) { escrito = true; break; }
      LOG("input aún no listo, reintento de escritura", i + 1);
    }
    if (!escrito) {
      return { ok: false, error: "No pude escribir el correo en el input (DOM de Telegram cambió)." };
    }

    const sendBtn = getSendButton();
    if (sendBtn) {
      LOG("enviando con clic en .btn-send");
      sendBtn.click();
    } else {
      LOG("no hallé .btn-send, intento Enter sintético");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    }

    const r = await esperarRespuestaBot(baseCount, 30000);
    // Copia SOLO el código (no mensajes de error/denegación).
    if (r && r.ok && r.codigo) {
      r.copiado = await copiarAlPortapapeles(r.codigo);
    }
    return r;
  }

  // ----- Mensajería con el background -----
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "tg-enviar" && typeof msg.correo === "string") {
      LOG("recibido tg-enviar:", msg.correo, "switchTo:", msg.switchTo || "(ninguno)");
      enviarYLeer(msg.correo, msg.switchTo)
        .then((r) => { LOG("resultado:", r); sendResponse(r); })
        .catch((e) => { LOG("error:", e); sendResponse({ ok: false, error: String(e) }); });
      return true; // respuesta asíncrona
    }
    if (msg && msg.type === "tg-ping") { sendResponse({ ok: true, webk: esWebK }); return true; }
  });
})();
