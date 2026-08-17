// overlay.js — Panel flotante "en vivo" dentro de WhatsApp Web (Fase 2).
// Detecta cambio de chat (MutationObserver + debounce), obtiene la identidad del
// chat con numero-utils.js, pide el lookup al background (que omite CORS) y
// pinta las cuentas. Aislado en un Shadow DOM.
//
// También es el proveedor de UI del resto de la extensión: publica
// window.__elixirUI para que los scripts inyectados por atajo, que no tienen
// interfaz propia, pidan el número con un modal en vez de con un prompt().
(function () {
  // El módulo se comprueba antes de marcar el overlay como cargado: si aún no
  // está, una inyección posterior debe poder reintentarlo.
  const utils = window.__elixirUtils;
  if (!utils) return;

  if (window.__elixirOverlayCargado) return; // evita doble inyección
  window.__elixirOverlayCargado = true;

  const cleanText = utils.limpiarTexto;

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

  // close_reason viene crudo del backend. Las etiquetas son las mismas que usa la
  // web en CLOSE_REASON_LABELS (ClientHistoryPage), para que el motivo se lea
  // igual mire donde mire el operador. manual_delete es el que escribe la tabla
  // de clientes al borrar a mano y no está en el mapa de la web, donde sale crudo.
  const MOTIVO_CIERRE = {
    no_renew: "no renovó",
    closing: "cierre manual",
    guarantee: "garantía",
    manual: "manual",
    manual_delete: "borrado a mano",
  };

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
      /* Burbuja, panel y toast viven en (0,0) y se mueven SOLO con transform:
         composición en GPU, sin layout ni repaint por frame. will-change los
         promociona a su propia capa desde el arranque (son 3 elementos chicos). */
      .launcher {
        position: fixed; left: 0; top: 0; will-change: transform;
        width: 46px; height: 46px; border-radius: 50%;
        background: linear-gradient(135deg,#635bff 0%,#8b5cf6 100%);
        color:#fff; font-size:22px; border:none; cursor:grab;
        box-shadow: 0 4px 14px rgba(124,58,237,.45);
        display:flex; align-items:center; justify-content:center;
        touch-action:none; user-select:none;
      }
      .launcher.dragging { cursor:grabbing; }
      /* Chip: la identidad del cliente, siempre a la vista. Mismo truco de
         posicionamiento que la burbuja (fixed en 0,0 + transform) para que
         arrastrar no provoque layout. */
      .chip {
        position: fixed; left: 0; top: 0; will-change: transform;
        display:flex; align-items:center; gap:7px;
        max-width: 260px; padding:6px 10px; border-radius:11px;
        background:#fff; color:#1e1b2e; cursor:grab;
        border:1.5px solid #ddd4ff;
        box-shadow: 0 4px 14px rgba(20,16,41,.18);
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
        font-size:12.5px; line-height:1.25;
        touch-action:none; user-select:none;
      }
      .chip.dragging { cursor:grabbing; }
      .chip .nom { font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .chip .ds { font-family:ui-monospace,Menlo,monospace; font-weight:700; color:#6d28d9; white-space:nowrap; }
      .chip .nota { color:#9ca3af; white-space:nowrap; }
      /* Borde por urgencia: el color lo pone el vencimiento más próximo. */
      .chip.urge { border-color:#fca5a5; }
      .chip.pronto { border-color:#fcd34d; }
      .chip.apagado { border-color:#e7e7ef; color:#6b7280; }
      .chip .alerta { color:#dc2626; font-size:14px; line-height:1; }

      /* Ficha al hover: quién es y cómo está, sin abrir nada. A propósito NO
         lleva correos ni contraseñas — se despliega sola con solo pasar el ratón
         y puede quedar a la vista en una pantalla compartida. Eso vive en el
         panel, detrás de un clic deliberado. */
      .ficha {
        position: fixed; left: 0; top: 0; will-change: transform;
        width: 290px; background:#fff; color:#1e1b2e;
        border-radius:13px; overflow:hidden; padding:11px 12px;
        box-shadow: 0 10px 30px rgba(20,16,41,.28);
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
        font-size:12.5px; line-height:1.4;
      }
      .ficha .cab { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
      .ficha .cab b { font-size:14px; }
      .ficha .cab .anti { color:#9ca3af; font-size:11px; white-space:nowrap; }
      .ficha .tel { font-family:ui-monospace,Menlo,monospace; font-size:11.5px; color:#6b7280; margin-top:1px; }
      .ficha .sep { border-top:1px solid #eceaf5; margin:8px 0; }
      /* Mismo bloque ámbar que el panel y que la web: los D son siempre "lo que
         va en el nombre del contacto", y deben reconocerse al instante. */
      .ficha .dfila {
        display:flex; align-items:center; gap:8px;
        border:1px solid #fcd34d; background:#fffbeb; border-radius:9px; padding:7px 9px;
      }
      .ficha .dfila .ds {
        flex:1; font-family:ui-monospace,Menlo,monospace; font-weight:700;
        font-size:16px; color:#451a03; letter-spacing:.5px; word-break:break-word;
      }
      .ficha .cop {
        background:#fff; color:#78350f; border:1px solid #b45309; border-radius:7px;
        font-size:11px; font-weight:600; padding:3px 8px; cursor:pointer; white-space:nowrap;
      }
      .ficha .cop:hover { background:#fef3c7; }
      .ficha .resumen { color:#4b5563; margin-top:6px; }
      .ficha .flag { border-radius:8px; padding:6px 8px; margin-top:6px; font-size:11.5px; }
      .ficha .flag.roja { background:#fdeaea; color:#991b1b; }
      .ficha .flag.ambar { background:#fff7ed; color:#7c2d12; }
      .ficha .flag.gris { background:#f3f4f6; color:#374151; }
      .ficha ul.cuentas { list-style:none; margin:8px 0 0; padding:0; }
      .ficha ul.cuentas li {
        display:flex; justify-content:space-between; gap:8px;
        padding:3px 0; border-top:1px solid #f4f3fa;
      }
      .ficha ul.cuentas li span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .ficha .dias { font-variant-numeric:tabular-nums; white-space:nowrap; color:#6b7280; }
      .ficha .dias.urge { color:#b42318; font-weight:600; }
      .ficha .dias.pronto { color:#a16207; font-weight:600; }
      .ficha .mas { color:#9ca3af; font-size:11px; margin-top:5px; }
      .panel {
        position: fixed; left: 0; top: 0; will-change: transform;
        width: 300px; max-height: 70vh; display:flex; flex-direction:column;
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
        position: fixed; left: 0; top: 0; will-change: transform;
        max-width: 220px;
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

      /* Quién es, arriba del todo. El nombre manda: es lo que uno busca al
         asomarse al panel. */
      .quien { margin:0 2px 9px; }
      .quien-nom { font-size:16px; font-weight:800; line-height:1.2; }
      .quien-sub { margin-top:2px; font-size:11.5px; color:#6b7280; font-family:ui-monospace,Menlo,monospace; }

      /* La secuencia D, con el mismo lenguaje visual que la ficha de la web
         (ClientHistoryPage → ContactDaysPanel). Es lo que hay que dejar escrito
         en el nombre del contacto, así que tiene que leerse de un vistazo y no
         como una nota al pie. */
      .dcard { border:1px solid #fcd34d; background:#fffbeb; border-radius:11px; padding:10px; margin-bottom:10px; }
      .dcard-tit { font-size:11.5px; font-weight:600; color:#78350f; }
      .dcard-ds {
        margin-top:3px; font-family:ui-monospace,Menlo,monospace;
        font-size:19px; font-weight:700; color:#451a03; letter-spacing:.5px; word-break:break-word;
      }
      .dcard-ds.vacio { font-size:14px; font-weight:600; color:#92400e; }
      .dcard-acc { display:flex; gap:6px; margin-top:8px; }
      .dbtn {
        background:#fff; border:1px solid #b45309; color:#78350f; border-radius:8px;
        font-size:11.5px; font-weight:600; padding:4px 10px; cursor:pointer;
      }
      .dbtn:hover { background:#fef3c7; }
      .dbtn.done { background:#e7f7ee; color:#137a45; border-color:#bfe9cf; }

      .msg { color:#6b7280; text-align:center; padding:12px; font-size:12.5px; }
      .msg.error { color:#b42318; }
      .tenue { color:#9ca3af; }
      .aviso { border-radius:10px; padding:10px; font-size:12.5px; line-height:1.45; margin-bottom:9px; }
      .aviso.limpieza { background:#fff7ed; color:#7c2d12; border:1px solid #fed7aa; }
      .cerradas { font-size:12px; color:#6b7280; }
      .cerradas b { color:#4b5563; }
      .cerradas ul { margin:4px 0 0; padding-left:18px; }
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
      .copy, .renov { width:100%; background:#fff; color:#7c3aed; border:1px solid #ddd4ff; border-radius:8px; font-weight:600; font-size:12.5px; padding:7px; cursor:pointer; }
      .copy:hover, .renov:hover { background:#f3f0ff; }
      .copy.done, .renov.done { background:#e7f7ee; color:#137a45; border-color:#bfe9cf; }
      .renov { margin-top:6px; }
      .aviso.caida { background:#fdeaea; color:#991b1b; border:1px solid #f6c9c9; }
      .aviso.plazo { background:#fffbeb; color:#78350f; border:1px solid #fde68a; }
      .pedir { width:100%; margin-top:6px; background:linear-gradient(135deg,#635bff,#8b5cf6); color:#fff; border:none; border-radius:8px; font-weight:600; font-size:12.5px; padding:7px; cursor:pointer; }
      .pedir:hover { filter:brightness(1.05); }
      .pedir:disabled { opacity:.7; cursor:default; }
      .codigo { margin-top:6px; background:#0f172a; color:#fff; border-radius:8px; padding:7px 9px; font-family:ui-monospace,Menlo,monospace; font-size:13px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .codigo b { font-size:15px; letter-spacing:1px; }
      .codigo small { color:#cbd5e1; font-weight:400; }
      .codigo .ccopy { background:rgba(255,255,255,.16); border:none; color:#fff; border-radius:6px; padding:3px 8px; font-size:11.5px; cursor:pointer; }
      .codigo .copiado-ok { color:#34d399; font-size:11px; font-weight:600; }

      /* Modal para teclear el número cuando WhatsApp no lo expone */
      .modal-fondo {
        position:fixed; inset:0; background:rgba(15,12,35,.45);
        display:flex; align-items:center; justify-content:center;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;
      }
      .modal {
        width:320px; max-width:calc(100vw - 32px); background:#fff; color:#1e1b2e;
        border-radius:14px; overflow:hidden; box-shadow:0 14px 40px rgba(20,16,41,.35);
      }
      .modal .hdr { cursor:default; }
      .modal-body { padding:13px; }
      .modal-body p { margin:0 0 10px; font-size:12.5px; color:#4b5563; line-height:1.45; }
      .modal-body p b { color:#7c3aed; }
      .modal input {
        width:100%; padding:10px 11px; font-size:14px; border:1px solid #ddd4ff;
        border-radius:9px; color:#1e1b2e; background:#fff;
      }
      .modal input:focus { outline:none; border-color:#8b5cf6; box-shadow:0 0 0 3px rgba(139,92,246,.18); }
      .modal .previo { margin-top:8px; font-size:12.5px; color:#137a45; font-weight:600; min-height:17px; }
      .modal .previo.mal { color:#b42318; font-weight:500; }
      .modal-acciones { display:flex; gap:7px; margin-top:11px; }
      .modal-acciones button { flex:1; border-radius:9px; font-weight:600; font-size:12.5px; padding:9px; cursor:pointer; }
      .modal .ok { background:linear-gradient(135deg,#635bff,#8b5cf6); color:#fff; border:none; }
      .modal .ok:disabled { opacity:.5; cursor:default; }
      .modal .cancelar { background:#fff; color:#6b7280; border:1px solid #e7e7ef; }
    </style>
    <button class="launcher" id="launcher" title="Mostrar cuentas Elixir" hidden>⚡</button>
    <div class="chip" id="chip" title="Clic para ver las cuentas" hidden></div>
    <div class="ficha" id="ficha" hidden></div>
    <div class="panel" id="panel" hidden>
      <div class="hdr">
        <span class="ttl">⚡ Cuentas</span>
        <div class="hdr-actions">
          <button class="mini" id="btnRefresh" title="Buscar ahora">🔍</button>
          <button class="mini" id="btnClose" title="Minimizar">✕</button>
        </div>
      </div>
      <div class="body" id="body">
        <div class="msg">Abre un chat para ver las cuentas.</div>
      </div>
    </div>
    <div class="toast" id="toast" hidden></div>
    <div class="modal-fondo" id="modalFondo" hidden>
      <div class="modal">
        <div class="hdr"><span class="ttl">⚡ Falta el número</span></div>
        <div class="modal-body">
          <p id="modalTexto"></p>
          <input type="text" id="modalInput" placeholder="302 422 0918" autocomplete="off" spellcheck="false" />
          <div class="previo" id="modalPrevio"></div>
          <div class="modal-acciones">
            <button class="cancelar" id="modalCancelar">Cancelar</button>
            <button class="ok" id="modalOk" disabled>Usar número</button>
          </div>
        </div>
      </div>
    </div>`;
  document.documentElement.appendChild(host);

  const elPanel = shadow.getElementById("panel");
  const elLauncher = shadow.getElementById("launcher");
  const elChip = shadow.getElementById("chip");
  const elFicha = shadow.getElementById("ficha");
  const elBody = shadow.getElementById("body");
  const elToast = shadow.getElementById("toast");
  const elModal = shadow.getElementById("modalFondo");

  // ----- Posición (burbuja, panel y toast: fixed en 0,0 + transform) -----
  // El camino caliente del arrastre no lee NADA del layout: viewport y tamaños
  // van cacheados (resize y ResizeObserver los refrescan), y escribir transform
  // no invalida layout — la GPU compone y ya.
  const BW = 46;        // tamaño de la burbuja
  const GAP = 8;        // separación burbuja↔panel/toast
  let pos = { left: 16, top: 16 }; // esquina sup-izq de la burbuja (se fija en init)
  let vw = window.innerWidth, vh = window.innerHeight; // viewport cacheado
  let panelW = 300, panelH = 0;                        // tamaño real del panel (ResizeObserver)
  let toastW = 0, toastH = 0;                          // tamaño del toast (medido al mostrarlo)
  let chipW = 0, chipH = 0;                            // tamaño del chip (ResizeObserver)

  function clampPos(left, top) {
    const maxLeft = Math.max(0, vw - BW);
    const maxTop = Math.max(0, vh - BW);
    return { left: Math.min(Math.max(0, left), maxLeft), top: Math.min(Math.max(0, top), maxTop) };
  }
  function mover(el, x, y) {
    el.style.transform = "translate3d(" + x + "px," + y + "px,0)";
  }
  function aplicarPosBurbuja() { mover(elLauncher, pos.left, pos.top); }

  // Coloca un flotante junto a la burbuja abriendo hacia el interior de la
  // pantalla, con tamaño CACHEADO (nada de offsetWidth/Height por frame) y
  // acotado al viewport para que nunca quede medio afuera.
  function colocarFlotante(el, w, h) {
    const cx = pos.left + BW / 2, cy = pos.top + BW / 2;
    const x = cx > vw / 2 ? (pos.left + BW) - w : pos.left;
    const y = cy < vh / 2 ? pos.top + BW + GAP : pos.top - GAP - h;
    mover(el, Math.min(Math.max(0, x), Math.max(0, vw - w)), Math.min(Math.max(0, y), Math.max(0, vh - h)));
  }
  function posicionarPanel() {
    if (!panelH) { // primer uso antes de que el observer reporte: medir una vez
      panelH = elPanel.offsetHeight || 0;
      panelW = elPanel.offsetWidth || panelW;
    }
    colocarFlotante(elPanel, panelW, panelH);
  }
  function posicionarToast() { colocarFlotante(elToast, toastW, toastH); }

  // El chip va PEGADO al lado de la burbuja, no encima ni debajo: es la etiqueta
  // de la burbuja. Se coloca hacia el interior de la pantalla, igual que todo lo
  // demás, para que en la esquina no se salga.
  function posicionarChip() {
    if (!chipH) { chipH = elChip.offsetHeight || 0; chipW = elChip.offsetWidth || 0; }
    const alaIzquierda = pos.left + BW / 2 > vw / 2;
    const x = alaIzquierda ? pos.left - GAP - chipW : pos.left + BW + GAP;
    const y = pos.top + (BW - chipH) / 2;   // centrado con la burbuja
    mover(elChip, Math.min(Math.max(0, x), Math.max(0, vw - chipW)),
                  Math.min(Math.max(0, y), Math.max(0, vh - chipH)));
  }

  // El contenido cambia (mensajes, tarjetas, nombres más o menos largos): cuando
  // el tamaño cambia, reposicionar con el que reporta el observer — cero lecturas
  // de layout. Durante el arrastre no dispara (el tamaño no cambia), así que no
  // molesta.
  function observarTamano(el, aplicar) {
    if (typeof ResizeObserver !== "function") return;
    new ResizeObserver((entradas) => {
      const caja = entradas[entradas.length - 1].borderBoxSize;
      const w = caja && caja.length ? caja[0].inlineSize : el.offsetWidth;
      const h = caja && caja.length ? caja[0].blockSize : el.offsetHeight;
      // Al ocultarse (display:none) el observer reporta 0x0: se ignora para no
      // pisar la caché — así reabrir usa el último tamaño bueno al instante,
      // sin volver a medir layout en cada apertura.
      if (!w || !h) return;
      aplicar(w, h);
    }).observe(el);
  }

  observarTamano(elPanel, (w, h) => {
    panelW = w; panelH = h;
    if (state === "panel" && !elPanel.hidden) posicionarPanel();
  });
  observarTamano(elChip, (w, h) => {
    chipW = w; chipH = h;
    if (!elChip.hidden) posicionarChip();
  });

  // ----- Estado persistido (chrome.storage.local) -----
  // Dos ejes independientes, a propósito:
  //
  //   overlayState  DÓNDE estoy — "bubble" (defecto) o "panel".
  //   overlayEnabled  SI el flotante existe. Solo se apaga desde Ajustes.
  //
  // Antes había un tercer estado, "hidden", al que llevaba la ✕ del panel. Como
  // se persistía, quien no conociera el atajo se quedaba sin flotante para
  // siempre: recargar no lo devolvía. Ahora la ✕ minimiza y el apagado de verdad
  // es una decisión explícita en Ajustes, que sí se puede deshacer desde ahí.
  let state = "bubble";
  let overlayEnabled = true;      // el flotante siempre activo (se apaga en Ajustes)
  let tgEnabled = true;           // Telegram encendido por defecto (se apaga en Ajustes)
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
  // ¿Cuenta de Netflix? Basta con que el nombre o la categoría contengan
  // "netflix", para que entren todas las variantes del catálogo (Exterior, Cel,
  // NR / No Renovable, Extra…). Mismo criterio que _is_disney() en el backend.
  function esNetflix(acc) {
    const txt = ((acc.account_type_name || "") + " " + (acc.category || ""))
      .toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return txt.indexOf("netflix") !== -1;
  }

  // Netflix se resuelve leyendo el buzón central: instantáneo y sin salir de
  // WhatsApp. Los demás proveedores no están soportados ahí y siguen por Telegram.
  function botonCodigo(acc, email) {
    if (!email) return "";
    if (esNetflix(acc)) {
      return `<button class="pedir correo" data-email="${email}">📬 Ver código (correo)</button>`;
    }
    if (!tgEnabled) return "";
    return `<button class="pedir" data-email="${email}" data-bot="${escapeHtml(botParaCuenta(acc))}">📨 Pedir código (Telegram)</button>`;
  }

  // Nombre del proveedor para mostrar en la tarjeta (badge).
  function nombreProveedor(acc) {
    return acc.provider || acc.provider_name || acc.proveedor || "";
  }
  let buscando = false;         // evita búsquedas concurrentes (re-entradas del observer)
  let firmaActual = null;       // firma del chat abierto AHORA (lo que queremos mostrar)
  let firmaCargada = null;      // firma del chat al que corresponde datosChat
  let datosChat = null;         // lo que sabemos del chat actual (ver ponerDatos)

  // ----- Normalización de la respuesta del backend -----
  //
  // El endpoint fue creciendo y sigue creciendo. Traducirlo aquí, en un solo
  // sitio, permite que el resto del archivo no sepa nada del contrato: si mañana
  // cambia un nombre de campo, se toca esta función y ya.
  //
  // Y sobre todo: NINGÚN campo nuevo es obligatorio. Producción todavía sirve el
  // contrato viejo (solo test está desplegado), y la extensión tiene que seguir
  // funcionando contra ambos. Lo que falte simplemente no se pinta.
  function normalizarLookup(data, termino) {
    const d = data || {};
    const accounts = Array.isArray(d.accounts) ? d.accounts : [];

    // days_remaining puede venir null (cuenta sin vencimiento): esos no cuentan
    // para el "más urgente" ni deben colarse como un 0.
    const dias = accounts
      .map((a) => a.days_remaining)
      .filter((n) => typeof n === "number");

    return {
      estado: "ok",
      termino,
      // Backend viejo: no manda `found`, pero tener cuentas ya implica que existe.
      found: typeof d.found === "boolean" ? d.found : accounts.length > 0,
      // El nombre del cliente es el dato que sustituye al contacto de Google.
      nombre: d.client_name || (accounts[0] && accounts[0].profile_name) || "",
      // Los D NO se derivan aquí: la convención (D01–D03 con cero, D4+ sin él,
      // y que D31 no existe) vive en el backend. Si no viene, no se muestra.
      dStr: typeof d.contact_format_string === "string" ? d.contact_format_string : "",
      activas: typeof d.active_count === "number" ? d.active_count : accounts.length,
      cerradas: typeof d.closed_count === "number" ? d.closed_count : null,
      // Derivado en local aunque el backend lo mande: sale gratis y así el color
      // de urgencia funciona igual contra el contrato viejo.
      minDias: dias.length ? Math.min.apply(null, dias) : null,
      mensual: typeof d.total_monthly === "number" ? d.total_monthly : null,
      consent: d.consent || null,
      garantia: d.has_pending_guarantee === true,
      notas: Array.isArray(d.important_notes) ? d.important_notes : [],
      meses: typeof d.tenure_months === "number" ? d.tenure_months : null,
      renovaciones: typeof d.renewal_count === "number" ? d.renewal_count : null,
      cerradasRecientes: Array.isArray(d.closed_recent) ? d.closed_recent : [],
      accounts,
    };
  }

  // ----- Caché por chat -----
  //
  // Antes solo se recordaba el último chat consultado. Ahora la búsqueda salta en
  // CADA chat que se abre, así que ir y volver entre dos conversaciones —lo más
  // normal del mundo— sería un request por visita. Con esto, volver es instantáneo.
  //
  // El TTL existe porque los días restantes y los estados cambian mientras se
  // trabaja; el tope, para que una jornada larga no acumule cientos de fichas.
  const CACHE_TTL_MS = 5 * 60 * 1000;
  const CACHE_MAX = 30;
  const cacheChats = new Map();

  function leerCache(firma) {
    const reg = cacheChats.get(firma);
    if (!reg) return null;
    if (Date.now() - reg.ts > CACHE_TTL_MS) { cacheChats.delete(firma); return null; }
    return reg.datos;
  }

  function guardarCache(firma, datos) {
    if (!firma) return;
    // Map itera en orden de inserción: la primera clave es la más vieja.
    if (cacheChats.size >= CACHE_MAX && !cacheChats.has(firma)) {
      cacheChats.delete(cacheChats.keys().next().value);
    }
    cacheChats.set(firma, { datos, ts: Date.now() });
  }

  let chipConContenido = false; // ¿el chip tiene algo que decir de este chat?

  function aplicarEstadoUI() {
    elLauncher.hidden = !overlayEnabled || state !== "bubble";
    // El chip acompaña a la burbuja. Con el panel abierto sobra: la misma
    // información está dentro, y en mayor detalle.
    elChip.hidden = !overlayEnabled || state !== "bubble" || !chipConContenido;
    elPanel.hidden = !overlayEnabled || state !== "panel";
    if (elChip.hidden) elChip.classList.remove("apagado");
    if (!overlayEnabled || state === "panel") ocultarHover();
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
      // pintarPanel primero: el panel estaba oculto y por eso no se repintaba,
      // así que al abrirlo hay que volcar lo que ya sabemos. evaluarChat() solo
      // añade la búsqueda si el chat cambió mientras estaba cerrado.
      pintarPanel();
      posicionarPanel();
      evaluarChat();
    }
  }

  // ----- Aviso flotante (toast) junto a la burbuja -----
  let toastTimer = null;
  function mostrarAviso(texto, ms) {
    elToast.textContent = texto;
    elToast.hidden = false;
    // Se mide UNA vez al mostrarlo (el texto cambió); durante el arrastre se
    // reusa este tamaño cacheado y el toast viaja con la burbuja sin medir nada.
    toastW = elToast.offsetWidth;
    toastH = elToast.offsetHeight;
    posicionarToast();
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { elToast.hidden = true; }, ms || 3000);
  }

  // ----- Modal para teclear el número que WhatsApp no expone -----
  // Vive dentro de este mismo shadow root a propósito: la guarda de
  // "clic fuera → minimizar" comprueba composedPath().includes(host), así que
  // montarlo en otro host haría que el modal se cerrara solo al escribir en él.
  let modalResolver = null;

  function cerrarModal(valor) {
    elModal.hidden = true;
    const r = modalResolver;
    modalResolver = null;
    if (r) r(valor);
  }

  function pedirNumeroEnModal(ctx) {
    const c = ctx || {};
    const input = shadow.getElementById("modalInput");
    const previo = shadow.getElementById("modalPrevio");
    const ok = shadow.getElementById("modalOk");
    const texto = shadow.getElementById("modalTexto");

    const quien = c.username ? ` de <b>${escapeHtml(c.username)}</b>` : "";
    texto.innerHTML = c.error
      ? escapeHtml(c.error)
      : `WhatsApp no muestra el número${quien}${c.historialVacio ? " y el chat no tiene historial cargado" : ""}. Escríbelo y lo recuerdo para este chat.`;

    input.value = "";
    previo.textContent = "";
    ok.disabled = true;
    elModal.hidden = false;
    setTimeout(() => input.focus(), 0);

    return new Promise((resolve) => { modalResolver = resolve; });
  }

  (function cablearModal() {
    const input = shadow.getElementById("modalInput");
    const previo = shadow.getElementById("modalPrevio");
    const ok = shadow.getElementById("modalOk");

    // WhatsApp tiene handlers globales de teclado que roban el foco hacia el
    // compositor. Sin parar la propagación en captura, no se puede escribir.
    ["keydown", "keyup", "keypress"].forEach((ev) => {
      input.addEventListener(ev, (e) => { e.stopPropagation(); }, true);
    });

    input.addEventListener("input", () => {
      const n = utils.normalizarNumero(input.value, { asumirPais: true });
      if (n.ok) {
        previo.textContent = "Se usará: " + n.display;
        previo.classList.remove("mal");
        ok.disabled = false;
      } else {
        previo.textContent = input.value.trim() ? "Escribe 302 422 0918 o +1 305 555 0123" : "";
        previo.classList.add("mal");
        ok.disabled = true;
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !ok.disabled) cerrarModal(input.value);
      if (e.key === "Escape") cerrarModal(null);
    });
    ok.addEventListener("click", () => cerrarModal(input.value));
    shadow.getElementById("modalCancelar").addEventListener("click", () => cerrarModal(null));
  })();

  // Contrato con numero-utils.js: los scripts inyectados por atajo no tienen UI
  // propia, así que heredan este modal y este toast en vez de un alert().
  window.__elixirUI = {
    pedirNumero: pedirNumeroEnModal,
    aviso: (texto) => mostrarAviso(texto),
  };

  // Busca la identidad del chat y consulta sus cuentas.
  //
  // auto = lo disparó un cambio de chat, no el operador. En ese caso NO puede
  // tocar la interfaz de WhatsApp (abrir el panel de contacto, sacar el modal):
  // ocurre solo, a cada chat, y sería insoportable. Con el botón 🔍 sí, porque
  // ahí el operador está pidiendo explícitamente que se busque.
  //
  // `buscando` se mantiene hasta que lookup() responde (lo libera su callback).
  // Chats a los que ya se les abrió el panel de contacto sin encontrar nada. Sin
  // esto, un chat que de verdad no expone el teléfono abriría el panel cada vez
  // que se entra en él.
  const sinNumeroConocido = new Set();

  async function buscarAhora(opts) {
    const auto = !!(opts && opts.auto);
    if (buscando) return;
    buscando = true;
    const firmaAlEmpezar = firmaActual;
    ponerDatos({ estado: "buscando" });

    // Primera pasada: solo lectura, sin tocar la interfaz de WhatsApp.
    let id = await utils.obtenerIdentidad({
      rapido: auto,
      permitirPanel: !auto,
      permitirManual: !auto,
      motivo: "buscar cuentas",
    });

    // Muchos contactos ya no muestran el teléfono en ningún sitio salvo en "Info.
    // del contacto" — es justo lo que WhatsApp está cambiando. Renunciar ahí
    // dejaba el chip en "Sin número" en chats donde Ctrl/Cmd+Shift+C sí lo saca,
    // que es lo peor de los dos mundos. Así que se abre el panel, pero UNA sola
    // vez por chat: el número se guarda y las visitas siguientes salen de la
    // caché sin tocar nada.
    if (auto && !id.numero && id.fuente !== "grupo" && id.clave && !sinNumeroConocido.has(id.clave)) {
      id = await utils.obtenerIdentidad({
        rapido: false, permitirPanel: true, permitirManual: false,
      });
      if (id.numero) await utils.guardarManual(id.clave, id.numero);
      else sinNumeroConocido.add(id.clave);
    }

    // Cambió de chat mientras se resolvía la identidad: lo que venga ya no es de
    // este chat. Se descarta sin pintar nada — el cambio ya programó su propia
    // búsqueda.
    if (firmaChat() !== firmaAlEmpezar) { buscando = false; return; }

    if (id.fuente === "grupo") { ponerDatos({ estado: "grupo" }); finBusqueda(); return; }
    if (!id.numero) {
      ponerDatos({ estado: "sin-numero", username: id.username || null });
      finBusqueda();
      return;
    }
    lookup(id.numero);
  }

  // Cierra una búsqueda y re-evalúa. Si el chat cambió mientras se buscaba, esa
  // búsqueda quedó bloqueada por el guard de `buscando` y hay que lanzarla ahora;
  // si no cambió, evaluarChat() sale en la primera línea. Sin esto, cambiar de
  // chat a media búsqueda dejaba el chat nuevo sin consultar nunca.
  function finBusqueda() {
    buscando = false;
    evaluarChat();
  }

  // Guarda lo que sabemos del chat y lo pinta. Todos los caminos terminan aquí:
  // es el único sitio que escribe datosChat.
  //
  //   ok | buscando | sin-chat | grupo | sin-numero | error
  //
  function ponerDatos(d) {
    datosChat = d;
    // "buscando" es un estado de paso: marcar el chat como cargado con él haría
    // que evaluarChat() lo diera por resuelto y nunca completara la búsqueda.
    if (d && d.estado !== "buscando") firmaCargada = firmaActual;
    pintarChip();
    pintarPanel();
    pintarHover();
  }

  // ----- Chip: la identidad del cliente, sin abrir nada -----
  //
  // Es el sustituto del nombre del contacto en Google Contacts, que es donde
  // vivían el nombre real y la secuencia D hasta que WhatsApp empezó a esconder
  // el teléfono.
  function pintarChip() {
    const d = datosChat;

    // Sin chat, grupo o error: el chip no dice nada. Un fallo del backend no es
    // asunto del operador mientras conversa; si abre el panel, ahí lo verá.
    if (!d || d.estado === "sin-chat" || d.estado === "grupo" || d.estado === "error") {
      chipConContenido = false;
      aplicarEstadoUI();
      return;
    }

    let clase = "", html = "", alerta = "";

    if (d.estado === "buscando") {
      // No se vacía el chip mientras busca: parpadearía en cada cambio de chat.
      // Se conserva lo anterior, atenuado, hasta que llegue lo nuevo.
      if (chipConContenido) elChip.classList.add("apagado");
      aplicarEstadoUI();
      return;
    }

    if (d.estado === "sin-numero") {
      clase = "apagado";
      html = `<span class="nom">Sin número</span>` +
             (d.username ? `<span class="nota">${escapeHtml(d.username)}</span>` : "");
    } else if (!d.found) {
      clase = "apagado";
      html = `<span class="nom">Desconocido</span>`;
    } else {
      // Aviso de que hay algo que mirar antes de contestar.
      if (d.notas.length || d.garantia || tieneCuentaCaida(d)) alerta = `<span class="alerta">●</span>`;

      if (!d.activas) {
        clase = "apagado";
        html = `<span class="nom">${escapeHtml(d.nombre || "Cliente")}</span>` +
               `<span class="nota">sin activas</span>`;
      } else {
        clase = urgenciaClase(d.minDias);
        html = `<span class="nom">${escapeHtml(d.nombre || "Cliente")}</span>` +
               (d.dStr ? `<span class="ds">${escapeHtml(d.dStr)}</span>` : "");
      }
    }

    elChip.className = "chip" + (clase ? " " + clase : "");
    elChip.innerHTML = html + alerta;
    chipConContenido = true;
    aplicarEstadoUI();
    if (!elChip.hidden) posicionarChip();
  }

  // Alguna cuenta madre caída: lo que el cliente está escribiendo probablemente
  // es una garantía, no una renovación.
  function tieneCuentaCaida(d) {
    return d.accounts.some((a) => a.provider_account_status === "limbo" || a.provider_account_status === "dead");
  }

  function urgenciaClase(dias) {
    if (typeof dias !== "number") return "";
    if (dias < 0) return "urge";
    if (dias <= 3) return "pronto";
    return "";
  }

  function moneda(n) {
    if (typeof n !== "number") return "";
    return "$" + Math.round(n).toLocaleString("es-CO");
  }

  // ----- Ficha al hover -----
  //
  // Pasar el ratón por encima y saber con quién se está hablando, sin abrir nada
  // y sin perder el sitio en la conversación.
  const HOVER_CIERRE_MS = 180;
  const MAX_CUENTAS_FICHA = 6;
  let hoverTimer = null;
  let hoverAbierto = false;
  let arrastrando = false;
  let fichaW = 0, fichaH = 0;

  observarTamano(elFicha, (w, h) => {
    fichaW = w; fichaH = h;
    if (!elFicha.hidden) colocarFlotante(elFicha, fichaW, fichaH);
  });

  function ocultarHover() {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    hoverAbierto = false;
    elFicha.hidden = true;
  }

  function mostrarHover() {
    // Con el panel abierto sobra: la misma información está dentro y con más
    // detalle. Y durante el arrastre solo estorbaría.
    if (!overlayEnabled || state !== "bubble" || arrastrando) return;
    if (!datosChat || !chipConContenido) return;
    hoverAbierto = true;
    pintarHover();
  }

  function pintarHover() {
    if (!hoverAbierto) return;
    const d = datosChat;
    if (!d) { ocultarHover(); return; }

    // Mientras se busca, la ficha se queda con lo anterior en vez de vaciarse:
    // al cambiar de chat con el ratón encima, parpadearía.
    if (d.estado === "buscando" && !elFicha.hidden) return;

    if (d.estado === "sin-numero") {
      elFicha.innerHTML =
        `<div class="cab"><b>Sin número</b></div>` +
        (d.username ? `<div class="tel">${escapeHtml(d.username)}</div>` : "") +
        `<div class="flag gris">WhatsApp no expone el teléfono en este chat. Ábrelo para escribirlo una vez y lo recuerdo.</div>`;
    } else if (!d.found) {
      elFicha.innerHTML =
        `<div class="cab"><b>Desconocido</b></div>` +
        `<div class="tel">${escapeHtml(d.termino)}</div>` +
        `<div class="flag gris">Sin registro en Elixir.</div>`;
    } else {
      elFicha.innerHTML = fichaHtml(d);
    }

    elFicha.hidden = false;
    if (!fichaH) { fichaH = elFicha.offsetHeight || 0; fichaW = elFicha.offsetWidth || 0; }
    colocarFlotante(elFicha, fichaW, fichaH);

    const cop = elFicha.querySelector(".cop");
    if (cop) {
      cop.addEventListener("click", async (e) => {
        e.stopPropagation();
        await copiar(d.dStr);
        cop.textContent = "✓";
        setTimeout(() => { cop.textContent = "Copiar"; }, 1200);
      });
    }
  }

  function fichaHtml(d) {
    const antiguedad = [
      typeof d.meses === "number" && d.meses > 0 ? d.meses + (d.meses === 1 ? " mes" : " meses") : "",
      typeof d.renovaciones === "number" && d.renovaciones > 0 ? d.renovaciones + " renov." : "",
    ].filter(Boolean).join(" · ");

    const resumen = [
      d.activas + (d.activas === 1 ? " activa" : " activas"),
      typeof d.cerradas === "number" && d.cerradas > 0
        ? d.cerradas + (d.cerradas === 1 ? " cerrada" : " cerradas") : "",
      d.mensual ? moneda(d.mensual) + "/mes" : "",
    ].filter(Boolean).join(" · ");

    let avisos = "";
    d.notas.slice(0, 2).forEach((n) => {
      avisos += `<div class="flag ambar">📌 ${escapeHtml(n.content || "")}</div>`;
    });
    if (d.garantia) avisos += `<div class="flag roja">🛠️ Tiene una garantía pendiente.</div>`;
    if (tieneCuentaCaida(d)) avisos += `<div class="flag roja">⚠️ Una cuenta madre está caída: si reclama, es garantía.</div>`;
    if (d.consent === "do_not_ask") avisos += `<div class="flag gris">🚫 Pidió que no le ofrezcan renovación.</div>`;

    // Sin cuentas activas: la instrucción es limpiar el contacto, y lo último que
    // se le cerró explica por qué ya no tiene nada.
    let cuerpo;
    if (!d.activas) {
      cuerpo = `<div class="flag ambar">🧹 <b>Limpieza total</b>: quitar la etiqueta <i>pagos</i> y toda D del nombre.</div>`;
      if (d.cerradasRecientes.length) {
        cuerpo += `<ul class="cuentas">` + d.cerradasRecientes.map((r) =>
          `<li><span>${escapeHtml(r.account_type_name || "Cuenta")}</span>` +
          `<span class="dias">${escapeHtml(MOTIVO_CIERRE[r.close_reason] || r.close_reason || "cerrada")}</span></li>`
        ).join("") + `</ul>`;
      }
    } else {
      const ord = d.accounts.slice().sort((a, b) => {
        const x = typeof a.days_remaining === "number" ? a.days_remaining : 9999;
        const y = typeof b.days_remaining === "number" ? b.days_remaining : 9999;
        return x - y;   // lo más urgente arriba: es lo que hay que mirar
      });
      cuerpo = `<ul class="cuentas">` + ord.slice(0, MAX_CUENTAS_FICHA).map((a) =>
        `<li><span>${escapeHtml(a.account_type_name || "Cuenta")}</span>` +
        `<span class="dias ${urgenciaClase(a.days_remaining)}">${escapeHtml(textoDias(a.days_remaining) || "—")}</span></li>`
      ).join("") + `</ul>`;
      if (ord.length > MAX_CUENTAS_FICHA) {
        cuerpo += `<div class="mas">y ${ord.length - MAX_CUENTAS_FICHA} más — clic para verlas todas</div>`;
      }
    }

    return (
      `<div class="cab"><b>${escapeHtml(d.nombre || "Cliente")}</b>` +
      (antiguedad ? `<span class="anti">${escapeHtml(antiguedad)}</span>` : "") + `</div>` +
      `<div class="tel">${escapeHtml(d.termino)}</div>` +
      `<div class="sep"></div>` +
      (d.dStr
        ? `<div class="dfila"><span class="ds">${escapeHtml(d.dStr)}</span><button class="cop">Copiar</button></div>`
        : "") +
      (resumen ? `<div class="resumen">${escapeHtml(resumen)}</div>` : "") +
      avisos + cuerpo
    );
  }

  // Escape cierra la ficha. Va en su propio listener y sin capture: el de abajo
  // filtra por Ctrl/Cmd+Shift y Escape nunca llegaría, y no se puede parar la
  // propagación porque WhatsApp usa Escape para sus propias cosas.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && hoverAbierto) ocultarHover();
  });

  // La zona sensible es burbuja + chip + ficha. El cierre se retrasa porque entre
  // la burbuja y la ficha hay un hueco de GAP px: sin margen, cruzarlo con el
  // ratón cerraría la ficha justo cuando se va a leer.
  [elLauncher, elChip, elFicha].forEach((el) => {
    el.addEventListener("mouseenter", () => {
      if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
      if (!hoverAbierto) mostrarHover();
    });
    el.addEventListener("mouseleave", () => {
      if (hoverTimer) clearTimeout(hoverTimer);
      hoverTimer = setTimeout(ocultarHover, HOVER_CIERRE_MS);
    });
  });

  // ----- Render -----
  function setBody(html) { elBody.innerHTML = html; }
  function setMsg(texto, esError) { setBody(`<div class="msg${esError ? " error" : ""}">${texto}</div>`); }

  // Pinta el panel según lo que sepamos del chat. Antes, "sin cuentas" y los
  // errores minimizaban el panel y sacaban un toast; ahora se quedan dentro del
  // panel. Cerrarle al operador lo que acaba de abrir es hostil, y con la
  // búsqueda corriendo en cada chat un backend caído habría sacado un toast por
  // cada conversación que abriera.
  function pintarPanel() {
    if (elPanel.hidden) return;
    const d = datosChat;
    if (!d) { setMsg("Abre un chat para ver las cuentas."); return; }

    if (d.estado === "buscando") { setMsg("Buscando…"); return; }
    if (d.estado === "sin-chat") { setMsg("Abre un chat para ver las cuentas."); return; }
    if (d.estado === "grupo") { setMsg("Es un chat de grupo: no tiene un número único."); return; }
    if (d.estado === "error") { setMsg(escapeHtml(d.mensaje || "Error al consultar."), true); return; }

    if (d.estado === "sin-numero") {
      const quien = d.username ? ` de <b>${escapeHtml(d.username)}</b>` : "";
      setBody(
        `<div class="msg">WhatsApp no muestra el número${quien} en este chat.</div>` +
        `<button class="pedir" id="btnTeclear">✏️ Escribir el número</button>`
      );
      // Reintento explícito: al no ser automático, sí puede abrir el panel de
      // contacto y, si aun así no aparece, pedirlo por el modal (y recordarlo).
      const b = shadow.getElementById("btnTeclear");
      if (b) b.addEventListener("click", () => buscarAhora({ auto: false }));
      return;
    }

    renderCuentas(d);
  }

  // Lo último que se le cerró. Responde al "¿y mi Max?" sin abrir la app: esa
  // cuenta ya no existe, y aquí está por qué.
  function cerradasHtml(d) {
    if (!d.cerradasRecientes.length) return "";
    const filas = d.cerradasRecientes.map((r) =>
      `<li>${escapeHtml(r.account_type_name || "Cuenta")}` +
      (r.close_reason ? ` <span class="tenue">(${escapeHtml(MOTIVO_CIERRE[r.close_reason] || r.close_reason)})</span>` : "") +
      `</li>`
    ).join("");
    return `<div class="cerradas"><b>Últimas cerradas</b><ul>${filas}</ul></div>`;
  }

  // Cabecera del panel: quién es y qué D debe llevar su contacto.
  function cabeceraHtml(d, nCuentas) {
    const sub = [
      escapeHtml(d.termino),
      typeof nCuentas === "number" ? nCuentas + (nCuentas === 1 ? " cuenta" : " cuentas") : "",
    ].filter(Boolean).join(" · ");
    return (
      `<div class="quien">` +
        (d.nombre ? `<div class="quien-nom">${escapeHtml(d.nombre)}</div>` : "") +
        `<div class="quien-sub">${sub}</div>` +
      `</div>` +
      `<div class="dcard">` +
        `<div class="dcard-tit">Google Contacts — debe tener</div>` +
        (d.dStr
          ? `<div class="dcard-ds">${escapeHtml(d.dStr)}</div>` +
            `<div class="dcard-acc">` +
              `<button class="dbtn" id="btnCopiarD">Copiar</button>` +
              `<button class="dbtn" id="btnContacts">Abrir contacts</button>` +
            `</div>`
          : `<div class="dcard-ds vacio">(ningún D)</div>`) +
      `</div>`
    );
  }

  // Cablea los botones de la tarjeta D. Va aparte porque la cabecera se pinta
  // desde dos sitios (con cuentas y sin ellas).
  function cablearCabecera(d) {
    const bCopiar = shadow.getElementById("btnCopiarD");
    if (bCopiar) {
      bCopiar.addEventListener("click", async () => {
        await copiar(d.dStr);
        bCopiar.textContent = "¡Copiado!"; bCopiar.classList.add("done");
        setTimeout(() => { bCopiar.textContent = "Copiar"; bCopiar.classList.remove("done"); }, 1400);
      });
    }
    const bContacts = shadow.getElementById("btnContacts");
    if (bContacts) {
      bContacts.title = "Abrir Google Contacts (copia " + d.dStr + ")";
      bContacts.addEventListener("click", async () => {
        // Se copia la secuencia antes de abrir, que es lo que hay que pegar en el
        // nombre. Mismo gesto que el botón de la web.
        await copiar(d.dStr);
        window.open("https://contacts.google.com/search/" + encodeURIComponent(d.termino), "_blank");
      });
    }
  }

  function renderCuentas(d) {
    const accounts = d.accounts;

    // Persona conocida sin nada activo. Antes esto era indistinguible de un
    // número desconocido y el panel se cerraba con un "sin cuentas"; en realidad
    // es una instrucción de trabajo, y de las importantes.
    if (!accounts.length) {
      if (!d.found) { setMsg("Sin cuentas para este número."); return; }
      setBody(
        cabeceraHtml(d, 0) +
        `<div class="aviso limpieza">🧹 <b>Limpieza total:</b> quitar la etiqueta ` +
        `<i>pagos</i> y toda D del nombre del contacto.</div>` +
        cerradasHtml(d)
      );
      cablearCabecera(d);
      return;
    }

    const ord = accounts.slice().sort((a, b) => (b.is_disney ? 1 : 0) - (a.is_disney ? 1 : 0));
    const cards = ord.map((acc, i) => {
      const disney = !!acc.is_disney;
      const diasNeg = typeof acc.days_remaining === "number" && acc.days_remaining < 0;
      const active = acc.status === "active";
      // La cuenta madre caída manda sobre todo lo demás: lo que el cliente está
      // escribiendo es un reclamo de garantía, no una renovación, y contestarle
      // con el mensaje de renovación sería meter la pata.
      const caida = acc.provider_account_status === "limbo" || acc.provider_account_status === "dead";
      return `
        <div class="card${disney ? " card-disney" : ""}">
          <div class="ctitle">${escapeHtml(acc.account_type_name || "Cuenta")}${disney ? '<span class="dbadge">DISNEY</span>' : ""}</div>
          <div class="cemail">${escapeHtml(acc.provider_email || "—")}</div>
          <div class="meta">
            <span class="badge${active ? " active" : ""}">${escapeHtml(acc.status || "")}</span>
            <span class="badge ${diasNeg ? "bad" : "ok"}">${escapeHtml(textoDias(acc.days_remaining))}</span>
            ${typeof acc.price === "number" ? `<span class="badge">${escapeHtml(moneda(acc.price))}</span>` : ""}
            ${nombreProveedor(acc) ? `<span class="badge prov">${escapeHtml(nombreProveedor(acc))}</span>` : ""}
            ${acc.combo_group_id ? `<span class="badge prov" title="Va en combo: no renovar una sola">combo</span>` : ""}
          </div>
          ${caida ? `<div class="aviso caida">⚠️ La cuenta madre está caída: si reclama, es <b>garantía</b>.</div>` : ""}
          ${acc.payment_deadline ? `<div class="aviso plazo">⏳ Plazo de pago hasta el <b>${escapeHtml(acc.payment_deadline)}</b>.</div>` : ""}
          <button class="copy" data-email="${escapeHtml(acc.provider_email || "")}">Copiar correo</button>
          ${acc.renewal_message ? `<button class="renov" data-idx="${i}">💬 Copiar mensaje de renovación</button>` : ""}
          ${botonCodigo(acc, escapeHtml(acc.provider_email || ""))}
          <div class="codigo-slot"></div>
        </div>`;
    }).join("");
    setBody(cabeceraHtml(d, ord.length) + cards);
    cablearCabecera(d);

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

    // El mensaje de renovación se coge de los datos, no de un atributo: lleva
    // saltos de línea, asteriscos y comillas, y meterlo en el HTML sería pedir
    // que un correo con un carácter raro rompa la tarjeta.
    shadow.querySelectorAll(".renov").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const acc = ord[Number(btn.getAttribute("data-idx"))];
        if (!acc || !acc.renewal_message) return;
        await copiar(acc.renewal_message);
        const orig = btn.textContent;
        btn.textContent = "¡Copiado! Pégalo en el chat"; btn.classList.add("done");
        setTimeout(() => { btn.textContent = orig; btn.classList.remove("done"); }, 1600);
      });
    });

    shadow.querySelectorAll(".pedir").forEach((btn) => {
      btn.addEventListener("click", () =>
        btn.classList.contains("correo") ? pedirCodigoCorreo(btn) : pedirCodigo(btn)
      );
    });
  }

  // ----- Netflix: código leído del buzón central, sin abrir Telegram -----
  function pedirCodigoCorreo(btn) {
    const email = btn.getAttribute("data-email");
    if (!email) return;
    const slot = btn.parentElement.querySelector(".codigo-slot");
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Buscando…";

    chrome.runtime.sendMessage({ type: "codigo-correo", correo: email }, (resp) => {
      btn.disabled = false;
      btn.textContent = original;
      if (chrome.runtime.lastError) {
        if (slot) slot.innerHTML = `<div class="msg error">Error de extensión.</div>`;
        return;
      }
      if (!resp || !resp.ok) {
        if (slot) slot.innerHTML = `<div class="msg error">${escapeHtml((resp && resp.error) || "No se pudo consultar.")}</div>`;
        return;
      }

      // Perfil y dispositivo: para comprobar que el código es del cliente que escribe.
      const quien = [resp.perfil, resp.dispositivo].filter(Boolean).map(escapeHtml).join(" · ");
      const pie = quien ? `<div class="num">${quien}</div>` : "";

      if (resp.codigo) {
        slot.innerHTML = `<div class="codigo"><span>Código: <b>${escapeHtml(resp.codigo)}</b></span><button class="ccopy">Copiar</button></div>${pie}`;
        slot.querySelector(".ccopy").addEventListener("click", async (e) => {
          await copiar(resp.codigo);
          e.target.textContent = "✓";
          setTimeout(() => { e.target.textContent = "Copiar"; }, 1200);
        });
        copiar(resp.codigo);
        return;
      }

      if (resp.link) {
        // No se abre solo: el de hogar confirma el cambio al pulsarlo y el de
        // viaje es de un solo uso. Lo abre el operador cuando corresponde.
        slot.innerHTML = `<div class="codigo"><span>${resp.tipo === "household" ? "Confirmar hogar" : "Enlace"}</span><button class="ccopy">Abrir</button></div>${pie}`;
        slot.querySelector(".ccopy").addEventListener("click", () => window.open(resp.link, "_blank"));
        return;
      }

      slot.innerHTML = `<div class="msg">Llegó un correo pero sin código utilizable.</div>`;
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

  // `termino` y no `numero`: hoy siempre es un teléfono, pero la columna whatsapp
  // de la web aceptará también nombres de usuario. Cuando pase, esto viaja igual
  // y es el backend quien decide cómo buscar.
  function lookup(termino) {
    const id = ++reqId;
    const firmaAlEmpezar = firmaActual;
    chrome.runtime.sendMessage({ type: "elixir-lookup", termino }, (resp) => {
      if (id !== reqId) { buscando = false; return; }   // respuesta vieja: ignorar
      if (resp && resp.aborted) { buscando = false; return; }

      const fallo = chrome.runtime.lastError
        ? "No se pudo consultar (recarga la extensión)."
        : !resp ? "Sin respuesta del servicio."
        : !resp.ok ? (resp.error || "Error al consultar.")
        : null;

      // Un fallo NO se guarda en caché: el backend puede estar reiniciándose y el
      // siguiente intento tiene que volver a preguntar.
      if (fallo) { ponerDatos({ estado: "error", mensaje: fallo }); finBusqueda(); return; }

      const datos = normalizarLookup(resp.data, termino);
      guardarCache(firmaAlEmpezar, datos);
      ponerDatos(datos);
      // Solo si el panel sigue abierto: si se minimizó mientras la respuesta
      // venía en vuelo, no hay que medir/posicionar un panel oculto.
      if (state === "panel") posicionarPanel();
      finBusqueda();
    });
  }

  // ----- Detección de cambio de chat -----
  function firmaChat() {
    const header = document.querySelector("#main header");
    if (!header) return "";
    // Solo el TÍTULO del chat (nombre/número), no el header completo: el subtítulo
    // de presencia ("en línea", "escribiendo…", "haz clic aquí…") cambia solo y
    // dispararía re-búsquedas falsas.
    const titulo = header.querySelector('span[dir="auto"]');
    const txt = titulo ? cleanText(titulo.textContent) : cleanText(header.textContent);
    return txt.slice(0, 120);
  }

  function evaluarChat() {
    if (!overlayEnabled) return;

    const firma = firmaChat();
    if (!firma) {
      firmaActual = null;
      if (datosChat && datosChat.estado === "sin-chat") return;
      ponerDatos({ estado: "sin-chat" });
      return;
    }

    firmaActual = firma;
    if (firma === firmaCargada) {          // ya sabemos de este chat
      if (state === "panel") posicionarPanel();
      return;
    }

    const guardado = leerCache(firma);     // visitado hace poco: sin red
    if (guardado) { ponerDatos(guardado); if (state === "panel") posicionarPanel(); return; }

    if (buscando) return;                  // hay una en vuelo; finBusqueda re-evalúa
    buscarAhora({ auto: true });
  }

  // debounce con maxWait para no morir bajo mutaciones constantes
  let timer = null, primerScheduled = 0;
  function schedule() {
    // Antes esto salía cuando el panel estaba cerrado, para no gastar CPU. Ya no
    // se puede: el chip tiene que estar al día SIEMPRE, que es justo la gracia de
    // no tener que abrir nada. Lo que sostiene el coste son el debounce de abajo
    // y la comparación por firma en evaluarChat(), que corta antes de tocar la red
    // en la inmensa mayoría de las mutaciones.
    if (!overlayEnabled) return;
    // Pestaña en segundo plano: WhatsApp sigue mutando el DOM (mensajes que
    // entran, presencia) pero no hay nadie mirando. Al volver, visibilitychange
    // re-evalúa, así que no se pierde nada.
    if (document.hidden) return;

    const ahora = performance.now();
    if (!timer) primerScheduled = ahora;
    if (timer) clearTimeout(timer);
    const espera = ahora - primerScheduled > 1500 ? 0 : 350;
    timer = setTimeout(() => { timer = null; evaluarChat(); }, espera);
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule();
  });

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // ----- Botones -----
  // ✕ minimiza a la burbuja. No apaga nada: el flotante está siempre disponible y
  // el interruptor de verdad vive en Ajustes del popup. Sin aviso, porque ya no
  // hay nada que explicar — la burbuja sigue ahí, a la vista.
  shadow.getElementById("btnClose").addEventListener("click", () => setState("bubble"));
  // 🔍 fuerza re-búsqueda: invalida la caché de ESTE chat y busca de nuevo. Al ser
  // una acción explícita, puede abrir el panel de contacto y pedir el número.
  shadow.getElementById("btnRefresh").addEventListener("click", () => {
    if (firmaActual) cacheChats.delete(firmaActual);
    // También se olvida el "aquí no hay número": si se pulsa refrescar es
    // justamente para que vuelva a intentarlo todo.
    sinNumeroConocido.clear();
    firmaCargada = null;
    buscarAhora({ auto: false });
  });

  // ----- Arrastre (burbuja y cabecera del panel) -----
  const DRAG_UMBRAL = 5;

  function persistirPos() {
    try { chrome.storage.local.set({ overlayPos: { left: pos.left, top: pos.top } }); } catch (_) {}
  }

  // Hace arrastrable un elemento moviendo `pos` por delta. onClick (sin arrastre) opcional.
  //
  // Fluidez: pointermove puede disparar a 120–1000 Hz (mouse gamer, pantalla de
  // alta tasa) — mucho más rápido de lo que la pantalla puede pintar. Escribir
  // estilos en cada evento desperdicia CPU y produce tirones en equipos flojos.
  // Aquí cada evento solo ANOTA la última coordenada; requestAnimationFrame
  // aplica UNA escritura por frame de pantalla, exactamente sincronizada con el
  // refresco. Todo lo que se mueve (burbuja, panel, toast) se mueve en el mismo
  // frame para que nada quede rezagado.
  function hacerArrastrable(handle, onClick) {
    let d = null;

    function frame() {
      if (!d) return; // el arrastre terminó con un rAF aún en vuelo
      d.raf = 0;
      pos = clampPos(d.baseLeft + (d.lx - d.x), d.baseTop + (d.ly - d.y));
      aplicarPosBurbuja();
      if (!elChip.hidden) posicionarChip();    // el chip va pegado a la burbuja
      if (state === "panel") posicionarPanel();
      if (!elToast.hidden) posicionarToast(); // la nota viaja con la burbuja
    }

    function terminar(aplicarFinal) {
      if (!d) return false;
      if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0; }
      const movido = d.moved;
      if (movido && aplicarFinal) frame(); // aplica la última coordenada ya mismo
      d = null;
      arrastrando = false;
      handle.classList.remove("dragging");
      if (movido) persistirPos();
      return movido;
    }

    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest(".hdr-actions")) return; // no arrastrar desde los botones del panel
      d = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY,
            baseLeft: pos.left, baseTop: pos.top, moved: false, raf: 0 };
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener("pointermove", (e) => {
      if (!d) return;
      d.lx = e.clientX; d.ly = e.clientY;
      if (!d.moved) {
        if (Math.hypot(d.lx - d.x, d.ly - d.y) < DRAG_UMBRAL) return;
        d.moved = true;
        arrastrando = true;
        ocultarHover();   // la ficha estorba mientras se coloca la burbuja
        handle.classList.add("dragging"); // una sola vez, no en cada move
      }
      if (!d.raf) d.raf = requestAnimationFrame(frame);
    });
    handle.addEventListener("pointerup", (e) => {
      if (!d) return;
      const movido = terminar(true); // aplica la última posición sin esperar otro frame
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      if (!movido && onClick) onClick();
    });
    // Sin esto, si el navegador cancela el puntero a mitad de arrastre (alt-tab,
    // gesto del sistema), `d` quedaba vivo y la burbuja seguía al cursor SIN
    // botón presionado — la burbuja "pegada" al mouse.
    handle.addEventListener("pointercancel", () => terminar(false));
  }

  hacerArrastrable(elLauncher, () => setState("panel")); // clic en la burbuja abre el panel
  hacerArrastrable(elChip, () => setState("panel"));     // y el chip es parte de la burbuja
  hacerArrastrable(shadow.querySelector(".hdr"));        // arrastrar el panel por su cabecera

  // ----- Tocar fuera del panel → minimizar a burbuja -----
  document.addEventListener("pointerdown", (e) => {
    if (state !== "panel") return;
    if (e.composedPath().includes(host)) return; // clic dentro del overlay: no cerrar
    setState("bubble");
  }, true);

  // Reubica el panel/aviso si cambia el tamaño de la ventana (y refresca el
  // viewport cacheado que usa el camino caliente del arrastre).
  window.addEventListener("resize", () => {
    vw = window.innerWidth;
    vh = window.innerHeight;
    pos = clampPos(pos.left, pos.top);
    aplicarPosBurbuja();
    if (!elChip.hidden) posicionarChip();
    if (state === "panel") posicionarPanel();
    if (!elToast.hidden) posicionarToast();
    ocultarHover(); // reposicionarla sería peor que rehacerla al volver a entrar
  });

  // ----- Atajo de teclado en página: Ctrl/Cmd+Shift+Space -----
  // En la página (no chrome.commands) para evitar el límite de 4 comandos del manifest.
  document.addEventListener("keydown", (e) => {
    if (!e.shiftKey) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    if (!elModal.hidden) return; // escribiendo el número: no robar las teclas

    if (e.code === "Space") {
      e.preventDefault();
      // Apagado desde Ajustes = apagado: el atajo no lo resucita. Volver es una
      // decisión explícita, en el mismo sitio donde se apagó.
      if (!overlayEnabled) return;
      setState(state === "panel" ? "bubble" : "panel");
      return;
    }

    // Ctrl/Cmd+Shift+U: copiar el @usuario. Va aquí y no en chrome.commands
    // porque el manifest ya agotó los 4 atajos con tecla sugerida que permite Chrome.
    if (e.code === "KeyU") {
      e.preventDefault();
      utils.obtenerUsuario({ permitirPanel: true }).then((r) => {
        if (!r.username) { mostrarAviso("Este contacto no tiene usuario"); return; }
        utils.copiar(r.username).then(() => mostrarAviso("Usuario copiado: " + r.username));
      });
    }
  }, true);

  // Posición por defecto: esquina inferior-derecha, arriba del compositor.
  function posDefecto() {
    return clampPos(vw - 16 - BW, vh - 96 - BW);
  }

  function arrancar() {
    aplicarPosBurbuja();
    aplicarEstadoUI();
    if (state === "panel") posicionarPanel();
    // Se evalúa siempre, no solo con el panel abierto: el chip tiene que salir
    // solo al cargar la página, sin que nadie abra nada.
    evaluarChat();
  }

  // ----- Init -----
  try {
    chrome.storage.local.get(
      ["overlayState", "overlayEnabled", "overlayCollapsed", "overlayPos", "tgEnabled", "tgBotKh", "tgBotWolf"],
      (cfg) => {
        // Migración: quien pulsó la ✕ en una versión anterior tiene guardado
        // "hidden" y, sin esto, seguiría sin ver el flotante después de
        // actualizar — que es justo el atasco que veníamos a quitar. Ese
        // "hidden" se reinterpreta como lo que de verdad quiso decir: apagado.
        // Se reescribe en storage para no volver a migrarlo en cada carga.
        if (cfg && cfg.overlayState === "hidden") {
          state = "bubble";
          overlayEnabled = false;
          try { chrome.storage.local.set({ overlayState: "bubble", overlayEnabled: false }); } catch (_) {}
        } else {
          state = (cfg && cfg.overlayState === "panel") ? "panel" : "bubble";
          // Solo se apaga con un false guardado a propósito: quien nunca tocó el
          // ajuste debe ver el flotante.
          if (cfg && cfg.overlayEnabled === false) overlayEnabled = false;
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

      // El interruptor de Ajustes. Es la única forma de apagar y de encender el
      // flotante, y surte efecto sin recargar WhatsApp.
      if (changes.overlayEnabled) {
        const activo = changes.overlayEnabled.newValue !== false;
        if (activo !== overlayEnabled) {
          overlayEnabled = activo;
          aplicarEstadoUI();
          if (overlayEnabled && state === "panel") { posicionarPanel(); evaluarChat(); }
        }
      }

      // El popup también puede mover el overlay entre burbuja y panel.
      if (changes.overlayState) {
        // Una pestaña con la versión anterior todavía puede escribir "hidden":
        // aquí se lee como burbuja, que es lo que la ✕ significa ahora.
        const nuevo = changes.overlayState.newValue === "panel" ? "panel" : "bubble";
        if (nuevo !== state) {
          state = nuevo;
          aplicarEstadoUI();
          if (overlayEnabled && state === "panel") { posicionarPanel(); evaluarChat(); }
        }
      }

      if (changes.tgEnabled) tgEnabled = !!changes.tgEnabled.newValue;
      if (changes.tgBotKh && typeof changes.tgBotKh.newValue === "string") tgBotKh = changes.tgBotKh.newValue.trim().replace(/^@/, "") || tgBotKh;
      if (changes.tgBotWolf && typeof changes.tgBotWolf.newValue === "string") tgBotWolf = changes.tgBotWolf.newValue.trim().replace(/^@/, "") || tgBotWolf;
      // Los botones de código dependen de estos ajustes: hay que repintar. Los
      // datos siguen siendo válidos, así que se repinta sin volver a consultar.
      if (changes.tgEnabled || changes.tgBotKh || changes.tgBotWolf) pintarPanel();
    });
  } catch (e) {}
})();
