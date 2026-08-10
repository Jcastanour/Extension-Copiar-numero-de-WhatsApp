// copynumber.js — Copia el número del chat actual (atajo y botón del popup).
// La extracción vive en numero-utils.js, que se inyecta justo antes que este
// archivo. Va en IIFE porque se re-inyecta en cada pulsación del atajo.
(function () {
  "use strict";

  var u = window.__elixirUtils;
  if (!u) {
    alert("No se pudo cargar la extensión. Recarga la pestaña de WhatsApp Web.");
    return;
  }

  if (!u.hayChat()) {
    u.aviso("Por favor abre un chat de WhatsApp Web primero.", true);
    return;
  }

  u.obtenerIdentidad({ permitirPanel: true, permitirManual: true, motivo: "copiar" })
    .then(function (id) {
      if (id.fuente === "grupo") {
        u.aviso("Este es un chat de grupo: no tiene un número único.", true);
        return;
      }
      if (!id.numero) {
        u.aviso("No se encontró el número de teléfono.", true);
        return;
      }
      return u.copiar(id.numero).then(function () {
        u.aviso("Número copiado: " + id.numero);
      });
    })
    .catch(function (e) {
      u.aviso("No se pudo leer el número: " + e, true);
    });
})();
