// overlay.js — Panel flotante "en vivo" dentro de WhatsApp Web (Fase 2).
// Detecta cambio de chat (MutationObserver + debounce), extrae el número del
// header reusando la lógica de copynumber.js, pide el lookup al background
// (que omite CORS) y pinta las cuentas. Aislado en un Shadow DOM.
(function () {
  if (window.__elixirOverlayCargado) return; // evita doble inyección
  window.__elixirOverlayCargado = true;

  // ----- Lógica de número (reusada de copynumber.js / buscarelixir.js) -----
  function cleanText(text) {
    if (!text) return "";
    return text.replace(/[‪‬]/g, "").trim();
  }
  function isNumberMatch(text) {
    const clean = cleanText(text);
    if (clean.length < 8 || !clean.includes("+")) return false;
    const digitsOnly = clean.replace(/[^\d+]/g, "");
    return /^\+?\d{7,16}$/.test(digitsOnly);
  }

  // Extracción RÁPIDA (sin abrir paneles): solo lee el header del chat actual.
  // Funciona cuando el título del chat es el propio número (contactos no guardados).
  function numeroDesdeHeader() {
    const header = document.querySelector("#main header");
    if (!header) return null;
    const spans = header.querySelectorAll('span[dir="auto"], span[title]');
    for (const span of spans) {
      const text = cleanText(span.textContent);
      if (isNumberMatch(text)) return text;
    }
    return null;
  }

  // Extracción COMPLETA (abre el panel de contacto, busca, lo cierra). Se usa
  // solo bajo demanda con el botón 🔍 para no interferir al cambiar de chat.
  async function numeroCompleto() {
    const desdeHeader = numeroDesdeHeader();
    if (desdeHeader) return desdeHeader;

    const header = document.querySelector("#main header");
    if (!header) return null;

    const clickable =
      header.querySelector('span[dir="auto"]') ||
      header.querySelector('div[role="button"]') ||
      header;
    clickable.click();
    await new Promise((r) => setTimeout(r, 500));

    const mainArea = document.querySelector("#main");
    const leftPane = document.getElementById("pane-side");
    const allSpans = document.querySelectorAll('span[dir="auto"], span.copyable-text');
    let found = null;
    for (const span of allSpans) {
      if (mainArea && mainArea.contains(span)) continue;
      if (leftPane && leftPane.contains(span)) continue;
      if (span.getBoundingClientRect().left < window.innerWidth / 3) continue;
      const text = cleanText(span.textContent);
      if (isNumberMatch(text)) { found = text; break; }
    }

    // Cerrar panel lateral
    const headers = document.querySelectorAll("header");
    for (let i = headers.length - 1; i >= 0; i--) {
      const h = headers[i];
      if (h.closest("#main")) continue;
      let closeSpan = h.querySelector('span[data-icon="x"]');
      if (!closeSpan) {
        const titles = h.querySelectorAll("title");
        for (const t of titles) {
          if (t.textContent === "ic-close" || t.textContent.includes("close") || t.textContent.includes("cerrar")) {
            closeSpan = t.closest("span") || t.parentElement;
            break;
          }
        }
      }
      if (closeSpan) {
        const btn = closeSpan.closest('div[role="button"]') || closeSpan.closest("button") || closeSpan.parentElement;
        if (btn) btn.click();
        break;
      }
    }
    return found;
  }

  // ----- Helpers -----
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function textoDias(d) {
    if (typeof d !== "number") return "";
    if (d > 0) return `Faltan ${d}d`;
    if (d === 0) return "Vence hoy";
    return `Venció hace ${Math.abs(d)}d`;
  }

  // ----- Shadow DOM / UI -----
  const host = document.createElement("div");
  host.id = "elixir-overlay-host";
  // El host se ancla siempre por left/top (= pos de la burbuja), fijado en JS.
  // width:0 para que el panel/toast (position:fixed) no lo estiren.
  host.style.cssText = "position:fixed;z-index:2147483000;left:0;top:0;width:0;height:0;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      .launcher {
        position: fixed; width: 46px; height: 46px; border-radius: 50%;
        background: linear-gradient(135deg,#635bff 0%,#8b5cf6 100%);
        color:#fff; font-size:22px; border:none; cursor:grab;
        box-shadow: 0 4px 14px rgba(124,58,237,.45);
        display:flex; align-items:center; justify-content:center;
        touch-action:none; user-select:none;
      }
      .launcher.dragging { cursor:grabbing; }
      .panel {
        position: fixed; width: 300px; max-height: 70vh; display:flex; flex-direction:column;
        background:#fff; color:#1e1b2e; border-radius:14px; overflow:hidden;
        box-shadow: 0 10px 30px rgba(20,16,41,.28);
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
        font-size:13px;
      }
      .hdr {
        background: linear-gradient(135deg,#635bff 0%,#8b5cf6 100%);
        color:#fff; padding:9px 11px; display:flex; align-items:center; justify-content:space-between;
        cursor:grab; touch-action:none; user-select:none;
      }
      .hdr.dragging { cursor:grabbing; }
      .toast {
        position: fixed; max-width: 220px;
        background: linear-gradient(135deg,#635bff 0%,#8b5cf6 100%); color:#fff;
        border-radius:11px; padding:9px 13px; font-size:12.5px; font-weight:600; line-height:1.3;
        box-shadow: 0 6px 20px rgba(124,58,237,.4);
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
      }
      .hdr .ttl { font-weight:700; font-size:13.5px; display:flex; gap:6px; align-items:center; }
      .hdr-actions { display:flex; gap:4px; }
      .mini {
        background:rgba(255,255,255,.18); border:none; color:#fff; cursor:pointer;
        width:24px; height:24px; border-radius:7px; font-size:13px;
        display:inline-flex; align-items:center; justify-content:center;
      }
      .mini:hover { background:rgba(255,255,255,.32); }
      .body { padding:10px; overflow-y:auto; }

      .msg { color:#6b7280; text-align:center; padding:12px; font-size:12.5px; }
      .msg.error { color:#b42318; }
      .num { font-size:11.5px; color:#6b7280; margin:0 2px 8px; }
      .num b { color:#7c3aed; }

      .card { border:1px solid #e7e7ef; border-radius:11px; padding:10px; margin-bottom:9px; background:#fff; }
      .card-disney {
        border:1.5px solid transparent;
        background: linear-gradient(#fff,#fff) padding-box, linear-gradient(135deg,#635bff,#8b5cf6) border-box;
        box-shadow:0 3px 12px rgba(124,58,237,.16);
      }
      .ctitle { font-weight:700; font-size:13.5px; display:flex; gap:6px; align-items:center; margin-bottom:6px; }
      .dbadge { font-size:9.5px; font-weight:800; background:linear-gradient(135deg,#635bff,#8b5cf6); color:#fff; border-radius:5px; padding:2px 6px; }
      .cemail { font-family:ui-monospace,Menlo,monospace; font-size:11.5px; color:#374151; background:#f6f6fb; border-radius:7px; padding:5px 7px; margin-bottom:7px; word-break:break-all; }
      .meta { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:8px; }
      .badge { font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px; background:#eef0f4; color:#4b5563; text-transform:capitalize; }
      .badge.active, .badge.ok { background:#e7f7ee; color:#137a45; }
      .badge.bad { background:#fdeaea; color:#b42318; }
      .badge.prov { background:#ede9fe; color:#6d28d9; text-transform:none; }
      .copy { width:100%; background:#fff; color:#7c3aed; border:1px solid #ddd4ff; border-radius:8px; font-weight:600; font-size:12.5px; padding:7px; cursor:pointer; }
      .copy:hover { background:#f3f0ff; }
      .copy.done { background:#e7f7ee; color:#137a45; border-color:#bfe9cf; }
      .pedir { width:100%; margin-top:6px; background:linear-gradient(135deg,#635bff,#8b5cf6); color:#fff; border:none; border-radius:8px; font-weight:600; font-size:12.5px; padding:7px; cursor:pointer; }
      .pedir:hover { filter:brightness(1.05); }
      .pedir:disabled { opacity:.7; cursor:default; }
      .codigo { margin-top:6px; background:#0f172a; color:#fff; border-radius:8px; padding:7px 9px; font-family:ui-monospace,Menlo,monospace; font-size:13px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .codigo b { font-size:15px; letter-spacing:1px; }
      .codigo small { color:#cbd5e1; font-weight:400; }
      .codigo .ccopy { background:rgba(255,255,255,.16); border:none; color:#fff; border-radius:6px; padding:3px 8px; font-size:11.5px; cursor:pointer; }
      .codigo .copiado-ok { color:#34d399; font-size:11px; font-weight:600; }
    </style>
    <button class="launcher" id="launcher" title="Mostrar cuentas Elixir" hidden>⚡</button>
    <div class="panel" id="panel">
      <div class="hdr">
        <span class="ttl">⚡ Cuentas</span>
        <div class="hdr-actions">
          <button class="mini" id="btnRefresh" title="Buscar ahora">🔍</button>
          <button class="mini" id="btnCollapse" title="Colapsar">—</button>
          <button class="mini" id="btnClose" title="Ocultar">✕</button>
        </div>
      </div>
      <div class="body" id="body">
        <div class="msg">Abre un chat para ver las cuentas.</div>
      </div>
    </div>
    <div class="toast" id="toast" hidden></div>`;
  document.documentElement.appendChild(host);

  const elPanel = shadow.getElementById("panel");
  const elLauncher = shadow.getElementById("launcher");
  const elBody = shadow.getElementById("body");
  const elToast = shadow.getElementById("toast");

  // ----- Posición (burbuja, panel y toast son position:fixed) -----
  const BW = 46;        // tamaño de la burbuja
  const GAP = 8;        // separación burbuja↔panel/toast
  let pos = { left: 16, top: 16 }; // esquina sup-izq de la burbuja (se fija en init)

  function clampPos(left, top) {
    const maxLeft = Math.max(0, window.innerWidth - BW);
    const maxTop = Math.max(0, window.innerHeight - BW);
    return { left: Math.min(Math.max(0, left), maxLeft), top: Math.min(Math.max(0, top), maxTop) };
  }
  function aplicarPosBurbuja() {
    elLauncher.style.left = pos.left + "px";
    elLauncher.style.top = pos.top + "px";
  }
  // Coloca un elemento flotante (panel/toast) junto a la burbuja, abriendo hacia
  // el interior de la pantalla. Limpia los 4 anclajes antes de fijar 2.
  function colocarFlotante(el) {
    const cx = pos.left + BW / 2, cy = pos.top + BW / 2;
    el.style.left = el.style.right = el.style.top = el.style.bottom = "auto";
    if (cx > window.innerWidth / 2) el.style.right = (window.innerWidth - (pos.left + BW)) + "px";
    else el.style.left = pos.left + "px";
    if (cy < window.innerHeight / 2) el.style.top = (pos.top + BW + GAP) + "px";
    else el.style.bottom = (window.innerHeight - pos.top + GAP) + "px";
  }
  function posicionarPanel() { colocarFlotante(elPanel); }

  // ----- Estado persistido (chrome.storage.local) -----
  // "bubble" (defecto): solo la burbuja, sin lookup automático.
  // "panel": panel abierto; al entrar se dispara el lookup del chat actual.
  // "hidden": nada visible; solo se sale con el atajo de teclado.
  let state = "bubble";
  let tgEnabled = false;          // flag prototipo Telegram (Bloque 2)
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
    console.log("[Elixir] provider:", JSON.stringify(acc.provider), "is_disney:", acc.is_disney, "-> bot:", bot);
    return bot;
  }
  // Nombre del proveedor para mostrar en la tarjeta (badge).
  function nombreProveedor(acc) {
    return acc.provider || acc.provider_name || acc.proveedor || "";
  }
  let buscando = false;         // evita búsquedas concurrentes (re-entradas del observer)
  let firmaCargada = null;      // firma del chat cuyas cuentas están renderizadas (cache)

  function aplicarEstadoUI() {
    elLauncher.hidden = state !== "bubble";
    elPanel.hidden = state !== "panel";
  }
  function guardarEstado() {
    try { chrome.storage.local.set({ overlayState: state }); } catch (e) {}
  }

  // Cambia de estado, refresca UI, persiste y (si abre el panel) evalúa el chat.
  function setState(nuevo) {
    state = nuevo;
    aplicarEstadoUI();
    guardarEstado();
    if (state === "panel") {
      posicionarPanel();
      evaluarChat(); // muestra cache si no cambió el chat; si cambió, busca
    }
  }

  // ----- Aviso flotante (toast) junto a la burbuja -----
  let toastTimer = null;
  function mostrarAviso(texto) {
    elToast.textContent = texto;
    elToast.hidden = false;
    colocarFlotante(elToast);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { elToast.hidden = true; }, 3000);
  }

  // Búsqueda completa: abre el panel de contacto si hace falta, encuentra el
  // número y consulta las cuentas. Sin número → vuelve a burbuja + aviso.
  // `buscando` se mantiene hasta que lookup() responde (lo libera su callback).
  async function buscarAhora() {
    if (buscando) return;
    buscando = true;
    setMsg("Buscando…");
    const numero = await numeroCompleto();
    if (state !== "panel") { buscando = false; return; } // se minimizó/cerró mientras buscaba
    if (!numero) { buscando = false; setState("bubble"); mostrarAviso("Sin número en este chat"); return; }
    lookup(numero);
  }

  // ----- Render -----
  function setBody(html) { elBody.innerHTML = html; }
  function setMsg(texto, esError) { setBody(`<div class="msg${esError ? " error" : ""}">${texto}</div>`); }

  function renderCuentas(numero, accounts) {
    const ord = accounts.slice().sort((a, b) => (b.is_disney ? 1 : 0) - (a.is_disney ? 1 : 0));
    const cards = ord.map((acc) => {
      const disney = !!acc.is_disney;
      const diasNeg = typeof acc.days_remaining === "number" && acc.days_remaining < 0;
      const active = acc.status === "active";
      return `
        <div class="card${disney ? " card-disney" : ""}">
          <div class="ctitle">${escapeHtml(acc.account_type_name || "Cuenta")}${disney ? '<span class="dbadge">DISNEY</span>' : ""}</div>
          <div class="cemail">${escapeHtml(acc.provider_email || "—")}</div>
          <div class="meta">
            <span class="badge${active ? " active" : ""}">${escapeHtml(acc.status || "")}</span>
            <span class="badge ${diasNeg ? "bad" : "ok"}">${escapeHtml(textoDias(acc.days_remaining))}</span>
            ${nombreProveedor(acc) ? `<span class="badge prov">${escapeHtml(nombreProveedor(acc))}</span>` : ""}
          </div>
          <button class="copy" data-email="${escapeHtml(acc.provider_email || "")}">Copiar correo</button>
          ${tgEnabled ? `<button class="pedir" data-email="${escapeHtml(acc.provider_email || "")}" data-bot="${escapeHtml(botParaCuenta(acc))}">📨 Pedir código (Telegram)</button>` : ""}
          <div class="codigo-slot"></div>
        </div>`;
    }).join("");
    setBody(`<div class="num">📱 <b>${escapeHtml(numero)}</b> · ${ord.length} cuenta(s)</div>` + cards);

    shadow.querySelectorAll(".copy").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const email = btn.getAttribute("data-email");
        if (!email) return;
        await copiar(email);
        const orig = btn.textContent;
        btn.textContent = "¡Copiado!"; btn.classList.add("done");
        setTimeout(() => { btn.textContent = orig; btn.classList.remove("done"); }, 1200);
      });
    });

    shadow.querySelectorAll(".pedir").forEach((btn) => {
      btn.addEventListener("click", () => pedirCodigo(btn));
    });
  }

  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); }
    catch (e) {
      const t = document.createElement("textarea");
      t.value = texto; document.body.appendChild(t); t.select();
      document.execCommand("copy"); document.body.removeChild(t);
    }
  }

  // ----- Pedir código en Telegram (prototipo) -----
  function pedirCodigo(btn) {
    const email = btn.getAttribute("data-email");
    if (!email) return;
    const slot = btn.parentElement.querySelector(".codigo-slot");
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Abriendo Telegram…";
    if (slot) slot.innerHTML = "";

    const bot = btn.getAttribute("data-bot") || tgBotWolf;
    chrome.runtime.sendMessage({ type: "tg-pedir-codigo", correo: email, bot }, (resp) => {
      btn.disabled = false;
      btn.textContent = orig;
      if (chrome.runtime.lastError) { if (slot) slot.innerHTML = `<div class="msg error">Error de extensión.</div>`; return; }
      if (!resp) { if (slot) slot.innerHTML = `<div class="msg error">Sin respuesta.</div>`; return; }
      if (!resp.ok) { if (slot) slot.innerHTML = `<div class="msg error">${escapeHtml(resp.error || "No se pudo.")}</div>`; return; }
      if (!slot) return;
      const nota = resp.copiado ? ' · <span class="copiado-ok">copiado ✓</span>' : "";
      if (resp.codigo) {
        slot.innerHTML = `<div class="codigo"><span>Código: <b>${escapeHtml(resp.codigo)}</b>${nota}</span><button class="ccopy">Copiar</button></div>`;
        slot.querySelector(".ccopy").addEventListener("click", async (e) => {
          await copiar(resp.codigo);
          e.target.textContent = "✓";
          setTimeout(() => { e.target.textContent = "Copiar"; }, 1200);
        });
      } else {
        slot.innerHTML = `<div class="codigo"><small>${escapeHtml((resp.texto || "Respondió sin código.").slice(0, 80))}${nota}</small></div>`;
      }
    });
  }

  // ----- Lookup (vía background, omite CORS) -----
  let reqId = 0;
  let ultimoNumero = null;

  function lookup(numero) {
    const id = ++reqId;
    ultimoNumero = numero;
    setMsg("Buscando…");
    chrome.runtime.sendMessage({ type: "elixir-lookup", numero }, (resp) => {
      buscando = false;
      if (id !== reqId) return; // respuesta vieja (cambió el chat): ignorar
      if (resp && resp.aborted) return;
      if (chrome.runtime.lastError) { setState("bubble"); mostrarAviso("No se pudo consultar (recarga la extensión)."); return; }
      if (!resp) { setState("bubble"); mostrarAviso("Sin respuesta del servicio."); return; }
      if (!resp.ok) { setState("bubble"); mostrarAviso(resp.error || "Error al consultar."); return; }
      const data = resp.data || {};
      if (!data.count || !Array.isArray(data.accounts) || data.accounts.length === 0) {
        setState("bubble"); mostrarAviso("Sin cuentas para este número");
        return;
      }
      firmaCargada = firmaChat(); // cache: reabrir el mismo chat no re-busca
      renderCuentas(numero, data.accounts);
      posicionarPanel();
    });
  }

  // ----- Detección de cambio de chat -----
  function firmaChat() {
    const header = document.querySelector("#main header");
    if (!header) return "";
    return cleanText(header.textContent).slice(0, 120);
  }

  function evaluarChat() {
    if (state !== "panel" || buscando) return;
    const firma = firmaChat();
    if (!firma) { setState("bubble"); mostrarAviso("Abre un chat"); return; }
    if (firma === firmaCargada) { posicionarPanel(); return; } // ya tenemos sus cuentas: cache
    buscarAhora();
  }

  // debounce con maxWait para no morir bajo mutaciones constantes
  let timer = null, primerScheduled = 0;
  function schedule() {
    const ahora = performance.now();
    if (!timer) primerScheduled = ahora;
    if (timer) clearTimeout(timer);
    const espera = ahora - primerScheduled > 1500 ? 0 : 350;
    timer = setTimeout(() => { timer = null; evaluarChat(); }, espera);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // ----- Botones -----
  shadow.getElementById("btnCollapse").addEventListener("click", () => setState("bubble")); // — minimiza a burbuja
  shadow.getElementById("btnClose").addEventListener("click", () => setState("hidden"));     // ✕ oculta todo
  shadow.getElementById("btnRefresh").addEventListener("click", () => { firmaCargada = null; buscarAhora(); }); // 🔍 fuerza re-búsqueda

  // ----- Arrastre (burbuja y cabecera del panel) -----
  const DRAG_UMBRAL = 5;

  function persistirPos() {
    try { chrome.storage.local.set({ overlayPos: { left: pos.left, top: pos.top } }); } catch (_) {}
  }

  // Hace arrastrable un elemento moviendo `pos` por delta. onClick (sin arrastre) opcional.
  function hacerArrastrable(handle, onClick) {
    let d = null;
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".hdr-actions")) return; // no arrastrar desde los botones del panel
      d = { x: e.clientX, y: e.clientY, baseLeft: pos.left, baseTop: pos.top, moved: false };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_UMBRAL) return;
      d.moved = true;
      handle.classList.add("dragging");
      pos = clampPos(d.baseLeft + dx, d.baseTop + dy);
      aplicarPosBurbuja();
      if (state === "panel") posicionarPanel();
    });
    handle.addEventListener("pointerup", (e) => {
      if (!d) return;
      const movido = d.moved;
      d = null;
      handle.classList.remove("dragging");
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      if (movido) persistirPos();
      else if (onClick) onClick();
    });
  }

  hacerArrastrable(elLauncher, () => setState("panel")); // clic en la burbuja abre el panel
  hacerArrastrable(shadow.querySelector(".hdr"));        // arrastrar el panel por su cabecera

  // ----- Tocar fuera del panel → minimizar a burbuja -----
  document.addEventListener("pointerdown", (e) => {
    if (state !== "panel") return;
    if (e.composedPath().includes(host)) return; // clic dentro del overlay: no cerrar
    setState("bubble");
  }, true);

  // Reubica el panel/aviso si cambia el tamaño de la ventana.
  window.addEventListener("resize", () => {
    pos = clampPos(pos.left, pos.top);
    aplicarPosBurbuja();
    if (state === "panel") posicionarPanel();
    if (!elToast.hidden) colocarFlotante(elToast);
  });

  // ----- Atajo de teclado en página: Ctrl/Cmd+Shift+Space -----
  // En la página (no chrome.commands) para evitar el límite de 4 comandos del manifest.
  document.addEventListener("keydown", (e) => {
    if (!e.shiftKey) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.code !== "Space") return;
    e.preventDefault();
    setState(state === "panel" ? "bubble" : "panel"); // toggle (también saca de "hidden")
  }, true);

  // Posición por defecto: esquina inferior-derecha, arriba del compositor.
  function posDefecto() {
    return clampPos(window.innerWidth - 16 - BW, window.innerHeight - 96 - BW);
  }

  function arrancar() {
    aplicarPosBurbuja();
    aplicarEstadoUI();
    if (state === "panel") { posicionarPanel(); evaluarChat(); }
  }

  // ----- Init -----
  try {
    chrome.storage.local.get(
      ["overlayState", "overlayEnabled", "overlayCollapsed", "overlayPos", "tgEnabled", "tgBotKh", "tgBotWolf"],
      (cfg) => {
        if (cfg && (cfg.overlayState === "bubble" || cfg.overlayState === "panel" || cfg.overlayState === "hidden")) {
          state = cfg.overlayState;
        } else if (cfg && cfg.overlayEnabled === false) {
          state = "hidden"; // migración del esquema viejo (estaba "cerrado")
        } else {
          state = "bubble"; // por defecto solo la burbuja
        }
        pos = (cfg && cfg.overlayPos && typeof cfg.overlayPos.left === "number")
          ? clampPos(cfg.overlayPos.left, cfg.overlayPos.top)
          : posDefecto();
        if (cfg && typeof cfg.tgEnabled === "boolean") tgEnabled = cfg.tgEnabled;
        if (cfg && typeof cfg.tgBotKh === "string" && cfg.tgBotKh.trim()) tgBotKh = cfg.tgBotKh.trim().replace(/^@/, "");
        if (cfg && typeof cfg.tgBotWolf === "string" && cfg.tgBotWolf.trim()) tgBotWolf = cfg.tgBotWolf.trim().replace(/^@/, "");
        arrancar();
      }
    );
  } catch (e) {
    pos = posDefecto();
    arrancar();
  }

  // Si cambian los ajustes del flag, re-renderiza el chat actual.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.tgEnabled) tgEnabled = !!changes.tgEnabled.newValue;
      if (changes.tgBotKh && typeof changes.tgBotKh.newValue === "string") tgBotKh = changes.tgBotKh.newValue.trim().replace(/^@/, "") || tgBotKh;
      if (changes.tgBotWolf && typeof changes.tgBotWolf.newValue === "string") tgBotWolf = changes.tgBotWolf.newValue.trim().replace(/^@/, "") || tgBotWolf;
      if (changes.tgEnabled || changes.tgBotKh || changes.tgBotWolf) { firmaCargada = null; evaluarChat(); }
    });
  } catch (e) {}
})();
