// buscarelixir.js — Copia el número y lo busca en Elixir Cuentas.
// IIFE obligatoria: ELIXIR_BASE_URL estaba antes en el top-level del archivo y,
// como los scripts inyectados comparten el scope global de la pestaña, la
// segunda pulsación del atajo moría con "Identifier has already been declared".
(function () {
  "use strict";

  // 👇 Cambiar aquí cuando se tenga el dominio definitivo
  var ELIXIR_BASE_URL = "https://elixircuentas.com/";

  var u = window.__elixirUtils;
  if (!u) {
    alert("No se pudo cargar la extensión. Recarga la pestaña de WhatsApp Web.");
    return;
  }

  if (!u.hayChat()) {
    u.aviso("Abre un chat de WhatsApp Web primero.", true);
    return;
  }

  function abrirElixir(numero) {
    var url = ELIXIR_BASE_URL + "?" + new URLSearchParams({ q: numero }).toString();
    window.open(url, "_blank");
  }

  u.obtenerIdentidad({ permitirPanel: true, permitirManual: true, motivo: "buscar en Elixir" })
    .then(function (id) {
      if (id.fuente === "grupo") {
        u.aviso("Este es un chat de grupo: no tiene un número único.", true);
        return;
      }
      if (!id.numero) {
        u.aviso("No se encontró el número de teléfono.", true);
        return;
      }
      return u.copiar(id.numero).then(function () { abrirElixir(id.numero); });
    })
    .catch(function (e) {
      u.aviso("No se pudo leer el número: " + e, true);
    });
})();
