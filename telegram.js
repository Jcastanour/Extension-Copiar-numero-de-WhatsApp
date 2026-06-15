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
    const el = b.querySelector(".message, .text-content, .translatable-message");
    return el ? (el.innerText || el.textContent || "").trim() : "";
  }
  function extraerCodigo(texto) {
    if (!texto) return null;
    // Busca el primer bloque de 4-8 dígitos (código típico).
    const m = texto.match(/(?:c[oó]digo|code)\D{0,20}?(\d{3,8})/i) || texto.match(/\b(\d{4,8})\b/);
    return m ? m[1] : null;
  }

  function esperarRespuestaBot(baseCount, timeout = 20000) {
    return new Promise((resolve) => {
      const container = getBubblesContainer();
      if (!container) { resolve({ ok: false, error: "No encontré el contenedor de mensajes." }); return; }

      let resuelto = false;
      const finish = (val) => { if (resuelto) return; resuelto = true; try { obs.disconnect(); } catch (e) {} clearTimeout(to); resolve(val); };

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
          finish({ ok: true, codigo: null, texto });
          return;
        }
      };

      const obs = new MutationObserver(revisar);
      obs.observe(container, { childList: true, subtree: true, characterData: true });
      const to = setTimeout(() => finish({ ok: false, error: "El bot no respondió a tiempo." }), timeout);
      revisar(); // por si ya llegó
    });
  }

  // ----- Navegar al bot (si se pasa) -----
  async function asegurarBot(bot) {
    if (!bot) return true;
    const handle = bot.replace(/^@/, "");
    if (location.hash.toLowerCase().includes(handle.toLowerCase())) return true; // ya estamos
    LOG("navegando al bot @" + handle);
    location.hash = "#@" + handle;
    // Espera a que el input del chat esté listo tras la navegación
    const input = await waitFor(".input-message-container .input-field-input[contenteditable], #editable-message-text", 8000);
    await sleep(400);
    return !!input;
  }

  // ----- Flujo principal -----
  async function enviarYLeer(correo, bot) {
    if (!esWebK) {
      return { ok: false, error: "Abre Telegram en la versión K: web.telegram.org/k/" };
    }
    const navOk = await asegurarBot(bot);
    if (!navOk) LOG("aviso: no confirmé navegación al bot; intento con el chat abierto");

    const input = await waitFor(".input-message-container .input-field-input[contenteditable], .input-message-input, #editable-message-text", 8000) || getInput();
    if (!input) return { ok: false, error: "No encontré el campo de mensaje del chat." };

    const baseCount = snapshotEntrantes();
    LOG("burbujas entrantes antes de enviar:", baseCount);

    escribirEnInput(input, correo);
    await sleep(200);

    if (cleanInput(input) !== correo) {
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

    return await esperarRespuestaBot(baseCount, 20000);
  }

  // ----- Mensajería con el background -----
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "tg-enviar" && typeof msg.correo === "string") {
      LOG("recibido tg-enviar:", msg.correo, "bot:", msg.bot);
      enviarYLeer(msg.correo, msg.bot)
        .then((r) => { LOG("resultado:", r); sendResponse(r); })
        .catch((e) => { LOG("error:", e); sendResponse({ ok: false, error: String(e) }); });
      return true; // respuesta asíncrona
    }
    if (msg && msg.type === "tg-ping") { sendResponse({ ok: true, webk: esWebK }); return true; }
  });
})();
