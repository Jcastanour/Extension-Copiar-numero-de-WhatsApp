// codigo-html.js — Saca el código de un correo entregado como HTML.
//
// Lo usa el service worker (importScripts) para las respuestas de Storetools,
// que devuelven el correo entero en `mensaje` y NO un campo `codigo`. No hay
// DOMParser en un service worker, así que todo es texto y expresiones regulares.
//
// También se carga en Node (test/) con los correos reales guardados en
// test/fixtures: cualquier cambio aquí se prueba contra Max, Disney+ y Prime
// sin gastar consultas del servicio (están medidas).
(function (raiz) {
  "use strict";

  var INVISIBLES = /[​‌‍­﻿⁠]/g;

  var ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

  function decodificarEntidades(t) {
    return t
      .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&([a-z]+);/gi, function (m, n) { var v = ENTIDADES[n.toLowerCase()]; return v == null ? m : v; });
  }

  // HTML → una línea de texto plano, sin estilos, scripts, comentarios ni
  // caracteres invisibles. El preheader de Disney mete cientos de ZWNJ entre
  // "passcode" y el número: sin quitarlos la palabra clave no lo encuentra.
  function textoDeHtml(html) {
    var t = String(html == null ? "" : html);
    t = t.replace(/<!--[\s\S]*?-->/g, " ");
    t = t.replace(/<(style|script|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
    t = t.replace(/<br\s*\/?>|<\/(p|div|td|tr|li|h\d)>/gi, " ");
    t = t.replace(/<[^>]+>/g, " ");
    t = decodificarEntidades(t);
    t = t.replace(INVISIBLES, "");
    return t.replace(/\s+/g, " ").trim();
  }

  var RE_PALABRA = /(?:code|c[oó]digo|passcode|pin|clave)\D{0,40}?(\d{4,8})\b/i;
  var RE_SEIS = /(?<![\d©#])\b(\d{6})\b/;
  var RE_BLOQUE = /(?<![\d©#])\b(\d{4,8})\b/g;

  function esAnio(d) { return /^20\d\d$/.test(d); }

  // Hosts de los enlaces que SÍ sirven como "enlace de código" (hogar, viaje).
  // Los de tracking (ablink…, click…, track…) no se devuelven nunca.
  var RE_HOST_UTIL = /^https?:\/\/(?:[a-z0-9-]+\.)*(netflix\.com|disneyplus\.com|primevideo\.com|amazon\.com|max\.com|hbomax\.com|paramountplus\.com|vix\.com|crunchyroll\.com|spotify\.com)\//i;
  var RE_HOST_TRACK = /ablink|\/click|track|\/ls\//i;

  function enlaceUtil(html) {
    var re = /href\s*=\s*["']([^"']+)["']/gi, m;
    while ((m = re.exec(String(html || "")))) {
      var u = m[1];
      if (RE_HOST_TRACK.test(u)) continue;
      if (RE_HOST_UTIL.test(u)) return u;
    }
    return null;
  }

  // Devuelve { codigo, link, como } (como = cómo se encontró, para depurar).
  function extraerCodigoDeHtml(html) {
    var t = textoDeHtml(html);
    var m = RE_PALABRA.exec(t);
    if (m && !esAnio(m[1])) return { codigo: m[1], link: null, como: "palabra clave" };
    m = RE_SEIS.exec(t);
    if (m) return { codigo: m[1], link: null, como: "bloque de 6" };
    RE_BLOQUE.lastIndex = 0;
    while ((m = RE_BLOQUE.exec(t))) {
      if (!esAnio(m[1])) return { codigo: m[1], link: null, como: "bloque 4-8" };
    }
    var link = enlaceUtil(html);
    if (link) return { codigo: null, link: link, como: "enlace" };
    return { codigo: null, link: null, como: "sin código" };
  }

  var api = { textoDeHtml: textoDeHtml, extraerCodigoDeHtml: extraerCodigoDeHtml, enlaceUtil: enlaceUtil };
  raiz.__elixirCodigoHtml = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
