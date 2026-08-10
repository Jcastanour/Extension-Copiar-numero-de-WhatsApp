// numero-utils.js — Lógica compartida de identidad del chat de WhatsApp Web.
//
// Antes esta lógica estaba copiada literalmente en copynumber.js, content.js,
// buscarelixir.js, popup.js y overlay.js. Ahora vive aquí y todos la consumen
// desde window.__elixirUtils.
//
// El archivo se inyecta varias veces (está declarado en el manifest Y se pasa en
// los files: de executeScript), así que va envuelto en IIFE con guard versionado:
// sin efectos secundarios al cargar, y re-inyectarlo es un no-op.
(function () {
  "use strict";

  var VERSION = "1.3.0";
  if (window.__elixirUtils && window.__elixirUtils.VERSION === VERSION) return;

  // ---------------------------------------------------------------------------
  // Texto
  // ---------------------------------------------------------------------------

  // Marcas bidi invisibles que WhatsApp intercala en los números. Se escriben
  // escapadas a propósito: antes estaban como caracteres literales en varios
  // archivos y un guardado con otra codificación las borraba sin que se notara.
  var RE_BIDI = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
  var RE_NBSP = /[\u00A0\u2007\u202F]/g;

  function limpiarTexto(t) {
    if (!t) return "";
    return String(t).replace(RE_BIDI, "").replace(RE_NBSP, " ").replace(/\s+/g, " ").trim();
  }

  // Mismo criterio que la versión original: exige un '+' explícito, así que un
  // @usuario o un nombre nunca pasan.
  function esNumero(text) {
    var clean = limpiarTexto(text);
    if (clean.length < 8 || clean.indexOf("+") === -1) return false;
    var digitos = clean.replace(/[^\d+]/g, "");
    return /^\+?\d{7,16}$/.test(digitos);
  }

  // Un usuario admite puntos por dentro (@juan.pabloc1) pero no puede terminar
  // en punto: si no, al leer "…usuario @kelytoro." se llevaría el punto final.
  var RE_USER_SUELTO = /@[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9_])?/i;
  var RE_USER_EXACTO = /^@[a-z0-9](?:[a-z0-9._]{0,28}[a-z0-9_])?$/i;

  function esUsuario(text) {
    return RE_USER_EXACTO.test(limpiarTexto(text));
  }

  // ---------------------------------------------------------------------------
  // Normalización
  // ---------------------------------------------------------------------------

  function formatoDisplay(d) {
    // Colombia con el mismo formato que muestra WhatsApp: +57 302 4220918.
    if (/^57\d{10}$/.test(d)) return "+57 " + d.slice(2, 5) + " " + d.slice(5);
    return "+" + d; // otros países: E.164, sin inventar agrupación
  }

  // Solo se asume país cuando asumirPais es true (entrada manual). El texto que
  // viene del DOM siempre trae '+', así que nunca se le adivina indicativo.
  function normalizarNumero(raw, opts) {
    var o = opts || {};
    var asumirPais = o.asumirPais === true;
    var limpio = limpiarTexto(raw);
    if (!limpio) return { ok: false, motivo: "vacio" };

    var d = limpio.replace(/\D/g, "");
    if (!d) return { ok: false, motivo: "vacio" };

    var internacional = false;
    if (limpio.slice(0, 4).indexOf("+") !== -1) internacional = true;
    else if (/^00\d{9,}$/.test(d)) { d = d.slice(2); internacional = true; }

    if (!internacional) {
      if (!asumirPais) return { ok: false, motivo: "sin-indicativo", digitos: d };
      if (/^3\d{9}$/.test(d)) d = "57" + d;            // móvil colombiano
      else if (/^57\d{10}$/.test(d)) { /* ya trae 57 sin '+' */ }
      else if (/^60\d{8}$/.test(d)) d = "57" + d;      // fijo colombiano nuevo
      else return { ok: false, motivo: "ambiguo", digitos: d };
    }

    if (!/^\d{8,15}$/.test(d)) return { ok: false, motivo: "longitud", digitos: d };
    return { ok: true, digitos: d, e164: "+" + d, display: formatoDisplay(d) };
  }

  // ---------------------------------------------------------------------------
  // Lectura del DOM — sin efectos
  // ---------------------------------------------------------------------------

  function headerChat() { return document.querySelector("#main header"); }
  function hayChat() { return !!headerChat(); }

  // Devuelve el primer texto que parezca número entre los descendientes de root.
  // Solo mira nodos hoja: si mirara contenedores, "Número de teléfono+57 302..."
  // se leería como un solo texto y no pasaría la validación.
  function primerNumeroEn(root) {
    if (!root) return null;
    var nodos = root.querySelectorAll("span, div, a");
    for (var i = 0; i < nodos.length; i++) {
      if (nodos[i].children.length) continue;
      var t = limpiarTexto(nodos[i].textContent);
      if (esNumero(t)) return t;
    }
    var propio = limpiarTexto(root.textContent);
    return esNumero(propio) ? propio : null;
  }

  function primerUsuarioEn(root) {
    if (!root) return null;
    var nodos = root.querySelectorAll("span, div, a");
    for (var i = 0; i < nodos.length; i++) {
      if (nodos[i].children.length) continue;
      var t = limpiarTexto(nodos[i].textContent);
      if (esUsuario(t)) return t;
    }
    return null;
  }

  function numeroDesdeHeader() {
    var header = headerChat();
    if (!header) return null;
    var spans = header.querySelectorAll('span[dir="auto"], span[title]');
    for (var i = 0; i < spans.length; i++) {
      var t = limpiarTexto(spans[i].textContent);
      if (esNumero(t)) return t;
    }
    return null;
  }

  function usuarioDesdeHeader() {
    var header = headerChat();
    if (!header) return null;
    var spans = header.querySelectorAll('span[dir="auto"], span[title]');
    for (var i = 0; i < spans.length; i++) {
      var t = limpiarTexto(spans[i].textContent);
      if (esUsuario(t)) return t;
    }
    return null;
  }

  // Nombre visible del chat, para el fallback por nombre de content.js.
  function nombreDesdeHeader() {
    var header = headerChat();
    if (!header) return null;
    var conTitulo = header.querySelector("span[title]");
    if (conTitulo && limpiarTexto(conTitulo.title)) return limpiarTexto(conTitulo.title);
    var spans = header.querySelectorAll('span[dir="auto"]');
    for (var i = 0; i < spans.length; i++) {
      var t = limpiarTexto(spans[i].textContent);
      var bajo = t.toLowerCase();
      if (!t) continue;
      if (bajo.indexOf("typing") !== -1 || bajo.indexOf("escribiendo") !== -1) continue;
      if (bajo.indexOf("click") !== -1) continue;
      if (esNumero(t) || esUsuario(t)) continue;
      return t;
    }
    return null;
  }

  // WhatsApp marca cada fila de mensaje con data-id="false_<jid>_<msgid>".
  // Si el jid es <dígitos>@c.us tenemos el número sin abrir nada.
  function jidDelChat() {
    var out = { jid: null, tipo: null, numero: null, esGrupo: false };
    var main = document.querySelector("#main");
    if (!main) return out;
    var fila = main.querySelector("[data-id]");
    if (!fila) return out;

    var partes = (fila.getAttribute("data-id") || "").split("_");
    if (partes.length < 2) return out;

    var jid = partes[1];
    var corte = jid.indexOf("@");
    if (corte === -1) return out;

    var local = jid.slice(0, corte);
    var sufijo = jid.slice(corte + 1);
    out.jid = jid;
    out.tipo = sufijo;
    out.esGrupo = sufijo === "g.us";

    // @lid no es un teléfono (solo sirve como clave de caché); @g.us es grupo.
    if ((sufijo === "c.us" || sufijo === "s.whatsapp.net") && /^\d{7,16}$/.test(local)) {
      out.numero = "+" + local;
    }
    return out;
  }

  function historialNoCargado() {
    var main = document.querySelector("#main");
    if (!main) return false;
    var t = limpiarTexto(main.textContent).toLowerCase();
    return t.indexOf("mensajes anteriores") !== -1 || t.indexOf("earlier messages") !== -1;
  }

  // Mensaje de sistema "+57 320 5513191 estableció el nombre de usuario @kelytoro".
  // #main está lleno de números que teclean los clientes, así que hace falta ser
  // estricto: sin estas guardas se colaría cualquier número del chat.
  var RE_FRASE_USER = /(nombre de usuario|nome de usu[áa]rio|username|user name|nom d['’]utilisateur|benutzernamen?)/i;
  var RE_NUM_EN_TEXTO = /\+\d[\d \-().]{5,20}\d/;

  function filasDeMensajes(main) {
    var filas = main.querySelectorAll('div[role="row"]');
    return filas.length ? filas : main.querySelectorAll("div.copyable-text, span[dir='auto']");
  }

  function identidadDesdeSistema() {
    var main = document.querySelector("#main");
    if (!main) return null;

    var hit = null;
    var filas = filasDeMensajes(main);

    for (var i = 0; i < filas.length; i++) {
      var fila = filas[i];

      // Los mensajes de personas llevan data-pre-plain-text ("[10:31, 5/2/2026] Kely:").
      // Los de sistema no. Es el discriminador que evita los falsos positivos.
      if (fila.querySelector("[data-pre-plain-text]") || fila.closest("[data-pre-plain-text]")) continue;

      var t = limpiarTexto(fila.textContent);
      if (t.length < 12 || t.length > 240) continue;
      if (!RE_FRASE_USER.test(t)) continue;
      if (!RE_USER_SUELTO.test(t)) continue;

      var mNum = RE_NUM_EN_TEXTO.exec(t);
      if (!mNum) continue;
      if (mNum.index > t.search(RE_FRASE_USER)) continue; // el número va antes de la frase
      if (!esNumero(mNum[0])) continue;

      var resto = t.slice(mNum.index + mNum[0].length);
      var mUser = RE_USER_SUELTO.exec(resto) || RE_USER_SUELTO.exec(t);
      // Sin break: nos quedamos con la coincidencia más reciente del DOM.
      hit = { numero: limpiarTexto(mNum[0]), username: mUser ? mUser[0] : null };
    }
    return hit;
  }

  // ---------------------------------------------------------------------------
  // Panel de "Info. del contacto" — con efectos
  // ---------------------------------------------------------------------------

  function panelAbierto() {
    return !!document.querySelector(
      '[data-testid="section-phone-number"], [data-testid="notes-section"], [data-testid="section-about"]'
    );
  }

  function abrirPanelContacto() {
    var header = headerChat();
    if (!header) return Promise.resolve(false);
    if (panelAbierto()) return Promise.resolve(true);

    var clicable =
      header.querySelector('span[dir="auto"]') ||
      header.querySelector('div[role="button"]') ||
      header;
    clicable.click();
    return new Promise(function (r) {
      setTimeout(function () { r(panelAbierto()); }, 500);
    });
  }

  // Barrido geométrico original: se conserva como red de seguridad por si
  // WhatsApp renombra los data-testid.
  function numeroPorBarrido() {
    var main = document.querySelector("#main");
    var panelIzq = document.getElementById("pane-side");
    var spans = document.querySelectorAll('span[dir="auto"], span.copyable-text');
    var estrecha = window.innerWidth <= 900;

    for (var i = 0; i < spans.length; i++) {
      var span = spans[i];
      if (main && main.contains(span)) continue;
      if (panelIzq && panelIzq.contains(span)) continue;
      // En ventanas estrechas el panel no está a la derecha; el filtro sobra.
      if (!estrecha && span.getBoundingClientRect().left < window.innerWidth / 3) continue;
      var t = limpiarTexto(span.textContent);
      if (esNumero(t)) return t;
    }
    return null;
  }

  // El valor no vive dentro del div que lleva el data-testid, sino en su hermano,
  // así que se sube al contenedor común antes de buscar.
  function contenedorDeSeccion(testid) {
    var sec = document.querySelector('[data-testid="' + testid + '"]');
    if (!sec) return null;
    return sec.parentElement || sec;
  }

  function leerPanelContacto() {
    var out = { numero: null, username: null, fuenteNumero: null };

    // 1) Ancla semántica: la sección dedicada al teléfono.
    out.numero = primerNumeroEn(contenedorDeSeccion("section-phone-number"));
    if (out.numero) out.fuenteNumero = "panel";

    // 2) Notas del cliente: si apuntaste ahí el número de alguien que solo
    //    tiene @usuario, lo aprovechamos.
    if (!out.numero) {
      out.numero = primerNumeroEn(contenedorDeSeccion("notes-section"));
      if (out.numero) out.fuenteNumero = "notas";
    }

    // 3) Red de seguridad histórica.
    if (!out.numero) {
      out.numero = numeroPorBarrido();
      if (out.numero) out.fuenteNumero = "panel";
    }

    var main = document.querySelector("#main");
    var panelIzq = document.getElementById("pane-side");
    var sub = document.querySelector('[data-testid*="contact-info-subtitle"]');
    if (sub && sub.parentElement) out.username = primerUsuarioEn(sub.parentElement.parentElement || sub.parentElement);
    if (!out.username) {
      var nodos = document.querySelectorAll('span[dir="auto"], span.copyable-text');
      for (var i = 0; i < nodos.length; i++) {
        var n = nodos[i];
        if (main && main.contains(n)) continue;
        if (panelIzq && panelIzq.contains(n)) continue;
        var t = limpiarTexto(n.textContent);
        if (esUsuario(t)) { out.username = t; break; }
      }
    }
    return out;
  }

  function cerrarPanelContacto() {
    var headers = document.querySelectorAll("header");
    for (var i = headers.length - 1; i >= 0; i--) {
      var h = headers[i];
      if (h.closest("#main")) continue;

      var cerrar = h.querySelector('span[data-icon="x"]');
      if (!cerrar) {
        var titulos = h.querySelectorAll("title");
        for (var j = 0; j < titulos.length; j++) {
          var tx = titulos[j].textContent || "";
          if (tx === "ic-close" || tx.indexOf("close") !== -1 || tx.indexOf("cerrar") !== -1) {
            cerrar = titulos[j].closest("span") || titulos[j].parentElement;
            break;
          }
        }
      }
      if (cerrar) {
        var btn = cerrar.closest('div[role="button"]') || cerrar.closest("button") || cerrar.parentElement;
        if (btn) btn.click();
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Caché de números tecleados a mano, por chat
  // ---------------------------------------------------------------------------

  var CLAVE_CACHE = "numerosManuales";

  function leerManual(clave) {
    return new Promise(function (resolve) {
      if (!clave || !window.chrome || !chrome.storage || !chrome.storage.local) return resolve(null);
      try {
        chrome.storage.local.get(CLAVE_CACHE, function (cfg) {
          if (chrome.runtime && chrome.runtime.lastError) return resolve(null);
          var mapa = (cfg && cfg[CLAVE_CACHE]) || {};
          var reg = mapa[clave];
          resolve(reg && reg.numero ? reg.numero : null);
        });
      } catch (e) { resolve(null); }
    });
  }

  function guardarManual(clave, numero) {
    return new Promise(function (resolve) {
      if (!clave || !numero || !window.chrome || !chrome.storage || !chrome.storage.local) return resolve();
      try {
        chrome.storage.local.get(CLAVE_CACHE, function (cfg) {
          var mapa = (cfg && cfg[CLAVE_CACHE]) || {};
          mapa[clave] = { numero: numero, ts: Date.now() };
          var datos = {};
          datos[CLAVE_CACHE] = mapa;
          chrome.storage.local.set(datos, function () { resolve(); });
        });
      } catch (e) { resolve(); }
    });
  }

  // ---------------------------------------------------------------------------
  // Salida
  // ---------------------------------------------------------------------------

  function copiar(texto) {
    if (!texto) return Promise.resolve(false);
    var porRespaldo = function () {
      try {
        var temp = document.createElement("textarea");
        temp.value = texto;
        temp.style.position = "fixed";
        temp.style.opacity = "0";
        document.body.appendChild(temp);
        temp.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(temp);
        return ok;
      } catch (e) { return false; }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).then(
        function () { return true; },
        function () { return porRespaldo(); }
      );
    }
    return Promise.resolve(porRespaldo());
  }

  // El overlay instala __elixirUI; los scripts inyectados por atajo no tienen UI
  // propia y así heredan el toast en vez de un alert().
  function aviso(texto, esError) {
    if (window.__elixirUI && typeof window.__elixirUI.aviso === "function") {
      window.__elixirUI.aviso(texto, esError);
      return;
    }
    alert(texto);
  }

  function pedirNumeroManual(ctx) {
    var contexto = ctx || {};
    var intentos = 0;

    function intentar() {
      var pedir = window.__elixirUI && typeof window.__elixirUI.pedirNumero === "function"
        ? window.__elixirUI.pedirNumero(contexto)
        : Promise.resolve(window.prompt(
            "No encontré el número de este chat.\nPégalo aquí (ej. 302 422 0918):", ""));

      return Promise.resolve(pedir).then(function (raw) {
        if (raw == null || limpiarTexto(raw) === "") return null; // canceló
        var n = normalizarNumero(raw, { asumirPais: true });
        if (n.ok) return n.display;
        intentos++;
        if (intentos >= 2) return null;
        contexto = Object.assign({}, contexto, {
          error: "Formato no válido. Usa 302 422 0918 o +1 305 555 0123.",
        });
        return intentar();
      });
    }
    return intentar();
  }

  // ---------------------------------------------------------------------------
  // Orquestación
  // ---------------------------------------------------------------------------

  function vacio() {
    return {
      numero: null, e164: null, username: null, fuente: null,
      jid: null, clave: null, esGrupo: false, historialVacio: false,
    };
  }

  // El texto leído del DOM se devuelve tal cual, para que lo que se copia siga
  // siendo idéntico a lo de siempre. Las dos fuentes que no vienen de un texto
  // visible (el jid, que son dígitos pelados, y lo que teclea el operador) sí se
  // formatean, para que el portapapeles quede igual mire de donde mire.
  var FUENTES_A_FORMATEAR = { manual: true, jid: true };

  function armar(numeroRaw, username, fuente, base) {
    var n = normalizarNumero(numeroRaw, { asumirPais: fuente === "manual" });
    return Object.assign({}, base, {
      numero: FUENTES_A_FORMATEAR[fuente] && n.ok ? n.display : limpiarTexto(numeroRaw),
      e164: n.ok ? n.e164 : null,
      username: username || null,
      fuente: fuente,
    });
  }

  async function obtenerIdentidad(opts) {
    var o = Object.assign(
      { rapido: false, permitirPanel: true, permitirManual: false, motivo: "" },
      opts || {}
    );

    if (!hayChat()) return Object.assign(vacio(), { fuente: "sin-chat" });

    var info = jidDelChat();
    var base = {
      jid: info.jid,
      clave: info.jid || null,
      esGrupo: info.esGrupo,
      historialVacio: historialNoCargado(),
    };

    // S1 — header
    var nHeader = numeroDesdeHeader();
    if (nHeader) return armar(nHeader, usuarioDesdeHeader(), "header", base);

    // S2 — jid de las filas de mensaje
    if (info.numero) return armar(info.numero, usuarioDesdeHeader(), "jid", base);

    // Modo rápido (overlay al cambiar de chat): ni storage ni clicks.
    if (o.rapido) return Object.assign(vacio(), base, { fuente: "no-encontrado" });

    if (info.esGrupo) return Object.assign(vacio(), base, { fuente: "grupo" });

    // S3 — mensaje de sistema del @usuario
    var sis = identidadDesdeSistema();
    if (sis && sis.numero) return armar(sis.numero, sis.username, "mensaje-sistema", base);

    // S4 — número tecleado antes para este mismo chat
    if (base.clave) {
      var enCache = await leerManual(base.clave);
      if (enCache) return armar(enCache, usuarioDesdeHeader(), "cache", base);
    }

    // S5 — panel de info del contacto (la única fuente que toca la interfaz)
    var userPanel = null;
    if (o.permitirPanel) {
      var yaEstaba = panelAbierto();
      var abierto = await abrirPanelContacto();
      var leido = abierto ? leerPanelContacto() : { numero: null, username: null };
      if (!yaEstaba) cerrarPanelContacto(); // siempre, aunque no hayamos encontrado nada
      userPanel = leido.username;
      if (leido.numero) {
        return armar(leido.numero, leido.username || (sis && sis.username), leido.fuenteNumero || "panel", base);
      }
    }

    var user = userPanel || (sis && sis.username) || null;

    // S6 — pedirlo, y recordarlo para las próximas visitas a este chat
    if (o.permitirManual) {
      var manual = await pedirNumeroManual({
        motivo: o.motivo,
        username: user,
        historialVacio: base.historialVacio,
      });
      if (manual) {
        if (base.clave) await guardarManual(base.clave, manual);
        return armar(manual, user, "manual", base);
      }
    }

    return Object.assign(vacio(), base, { username: user, fuente: "no-encontrado" });
  }

  async function obtenerUsuario(opts) {
    var o = Object.assign({ permitirPanel: true }, opts || {});
    if (!hayChat()) return { username: null, fuente: "sin-chat" };

    var enHeader = usuarioDesdeHeader();
    if (enHeader) return { username: enHeader, fuente: "header" };

    var sis = identidadDesdeSistema();
    if (sis && sis.username) return { username: sis.username, fuente: "mensaje-sistema" };

    if (o.permitirPanel) {
      var yaEstaba = panelAbierto();
      var abierto = await abrirPanelContacto();
      var leido = abierto ? leerPanelContacto() : { username: null };
      if (!yaEstaba) cerrarPanelContacto();
      if (leido.username) return { username: leido.username, fuente: "panel" };
    }
    return { username: null, fuente: "no-encontrado" };
  }

  // ---------------------------------------------------------------------------
  // Base64 de los PIN de recarga (v1.3.0 lo usará desde el popup).
  // Sin el padding '=' final, atob() devuelve el texto TRUNCADO sin avisar, lo
  // que entregaría un pin inválido a un cliente. Por eso se rellena siempre.
  // ---------------------------------------------------------------------------

  function decodificarPin(raw) {
    var s = limpiarTexto(raw).replace(/\s+/g, "");
    if (!s) return { ok: false, motivo: "vacio" };
    s = s.replace(/-/g, "+").replace(/_/g, "/"); // base64url
    s = s.replace(/=+$/, "");
    if (!/^[A-Za-z0-9+/]+$/.test(s)) return { ok: false, motivo: "no-base64" };
    s += "=".repeat((4 - (s.length % 4)) % 4);
    try {
      var out = atob(s);
      if (!out || /[\x00-\x08\x0E-\x1F]/.test(out)) return { ok: false, motivo: "no-texto" };
      return { ok: true, texto: out };
    } catch (e) {
      return { ok: false, motivo: "no-base64" };
    }
  }

  window.__elixirUtils = {
    VERSION: VERSION,

    limpiarTexto: limpiarTexto,
    esNumero: esNumero,
    esUsuario: esUsuario,
    normalizarNumero: normalizarNumero,
    formatoDisplay: formatoDisplay,

    hayChat: hayChat,
    nombreDesdeHeader: nombreDesdeHeader,
    numeroDesdeHeader: numeroDesdeHeader,
    usuarioDesdeHeader: usuarioDesdeHeader,
    jidDelChat: jidDelChat,
    identidadDesdeSistema: identidadDesdeSistema,
    historialNoCargado: historialNoCargado,

    panelAbierto: panelAbierto,
    abrirPanelContacto: abrirPanelContacto,
    leerPanelContacto: leerPanelContacto,
    cerrarPanelContacto: cerrarPanelContacto,

    leerManual: leerManual,
    guardarManual: guardarManual,

    obtenerIdentidad: obtenerIdentidad,
    obtenerUsuario: obtenerUsuario,
    pedirNumeroManual: pedirNumeroManual,

    copiar: copiar,
    aviso: aviso,
    decodificarPin: decodificarPin,
  };
})();
