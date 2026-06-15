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
  host.style.cssText = "position:fixed;z-index:2147483000;bottom:16px;right:16px;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }
      .launcher {
        width: 46px; height: 46px; border-radius: 50%;
        background: linear-gradient(135deg,#635bff 0%,#8b5cf6 100%);
        color:#fff; font-size:22px; border:none; cursor:pointer;
        box-shadow: 0 4px 14px rgba(124,58,237,.45);
        display:flex; align-items:center; justify-content:center;
      }
      .panel {
        width: 300px; max-height: 70vh; display:flex; flex-direction:column;
        background:#fff; color:#1e1b2e; border-radius:14px; overflow:hidden;
        box-shadow: 0 10px 30px rgba(20,16,41,.28);
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
        font-size:13px;
      }
      .hdr {
        background: linear-gradient(135deg,#635bff 0%,#8b5cf6 100%);
        color:#fff; padding:9px 11px; display:flex; align-items:center; justify-content:space-between;
        cursor:default;
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
      .panel.collapsed .body { display:none; }

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
      .copy { width:100%; background:#fff; color:#7c3aed; border:1px solid #ddd4ff; border-radius:8px; font-weight:600; font-size:12.5px; padding:7px; cursor:pointer; }
      .copy:hover { background:#f3f0ff; }
      .copy.done { background:#e7f7ee; color:#137a45; border-color:#bfe9cf; }
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
    </div>`;
  document.documentElement.appendChild(host);

  const elPanel = shadow.getElementById("panel");
  const elLauncher = shadow.getElementById("launcher");
  const elBody = shadow.getElementById("body");

  // ----- Estado persistido (chrome.storage.local) -----
  let enabled = true;
  let collapsed = false;

  function aplicarEstadoUI() {
    elLauncher.hidden = enabled;
    elPanel.hidden = !enabled;
    elPanel.classList.toggle("collapsed", collapsed);
  }
  function guardarEstado() {
    try { chrome.storage.local.set({ overlayEnabled: enabled, overlayCollapsed: collapsed }); } catch (e) {}
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
          </div>
          <button class="copy" data-email="${escapeHtml(acc.provider_email || "")}">Copiar correo</button>
        </div>`;
    }).join("");
    setBody(`<div class="num">📱 <b>${escapeHtml(numero)}</b> · ${ord.length} cuenta(s)</div>` + cards);

    shadow.querySelectorAll(".copy").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const email = btn.getAttribute("data-email");
        if (!email) return;
        try { await navigator.clipboard.writeText(email); }
        catch (e) {
          const t = document.createElement("textarea");
          t.value = email; document.body.appendChild(t); t.select();
          document.execCommand("copy"); document.body.removeChild(t);
        }
        const orig = btn.textContent;
        btn.textContent = "¡Copiado!"; btn.classList.add("done");
        setTimeout(() => { btn.textContent = orig; btn.classList.remove("done"); }, 1200);
      });
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
      if (id !== reqId) return; // respuesta vieja (cambió el chat): ignorar
      if (chrome.runtime.lastError) { setMsg("No se pudo consultar (recarga la extensión).", true); return; }
      if (!resp) { setMsg("Sin respuesta del servicio.", true); return; }
      if (resp.aborted) return;
      if (!resp.ok) { setMsg(resp.error || "Error al consultar.", true); return; }
      const data = resp.data || {};
      if (!data.count || !Array.isArray(data.accounts) || data.accounts.length === 0) {
        setMsg("Sin cuentas para este número.");
        return;
      }
      renderCuentas(numero, data.accounts);
    });
  }

  // ----- Detección de cambio de chat -----
  function firmaChat() {
    const header = document.querySelector("#main header");
    if (!header) return "";
    return cleanText(header.textContent).slice(0, 120);
  }

  let ultimaFirma = null;
  function evaluarChat() {
    if (!enabled || collapsed) return;
    const firma = firmaChat();
    if (firma === ultimaFirma) return;
    ultimaFirma = firma;

    if (!firma) { reqId++; ultimoNumero = null; setMsg("Abre un chat para ver las cuentas."); return; }
    const numero = numeroDesdeHeader();
    if (!numero) {
      reqId++; ultimoNumero = null;
      setMsg("Este chat no muestra número. Pulsa 🔍 para buscarlo.");
      return;
    }
    lookup(numero);
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
  shadow.getElementById("btnCollapse").addEventListener("click", () => {
    collapsed = !collapsed; aplicarEstadoUI(); guardarEstado();
    if (!collapsed) { ultimaFirma = null; evaluarChat(); }
  });
  shadow.getElementById("btnClose").addEventListener("click", () => {
    enabled = false; aplicarEstadoUI(); guardarEstado();
  });
  elLauncher.addEventListener("click", () => {
    enabled = true; aplicarEstadoUI(); guardarEstado();
    ultimaFirma = null; evaluarChat();
  });
  shadow.getElementById("btnRefresh").addEventListener("click", async () => {
    setMsg("Buscando número…");
    const numero = await numeroCompleto();
    if (!numero) { setMsg("No se encontró el número de este chat.", true); return; }
    lookup(numero);
  });

  // ----- Init -----
  try {
    chrome.storage.local.get(["overlayEnabled", "overlayCollapsed"], (cfg) => {
      if (cfg && typeof cfg.overlayEnabled === "boolean") enabled = cfg.overlayEnabled;
      if (cfg && typeof cfg.overlayCollapsed === "boolean") collapsed = cfg.overlayCollapsed;
      aplicarEstadoUI();
      ultimaFirma = null;
      evaluarChat();
    });
  } catch (e) {
    aplicarEstadoUI();
    evaluarChat();
  }
})();
