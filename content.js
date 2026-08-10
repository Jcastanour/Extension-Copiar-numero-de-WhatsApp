// content.js — Copia el número y abre Google Contactos para guardar/buscar.
// Si no hay número usable cae al nombre del chat, igual que antes.
(function () {
  "use strict";

  var u = window.__elixirUtils;
  if (!u) {
    alert("No se pudo cargar la extensión. Recarga la pestaña de WhatsApp Web.");
    return;
  }

  if (!u.hayChat()) {
    u.aviso("Abre un chat de WhatsApp Web primero.", true);
    return;
  }

  function buscarEnContactos(termino) {
    window.open("https://contacts.google.com/search/" + encodeURIComponent(termino), "_blank");
  }

  u.obtenerIdentidad({ permitirPanel: true, permitirManual: true, motivo: "guardar contacto" })
    .then(function (id) {
      if (id.numero) {
        return u.copiar(id.numero).then(function () { buscarEnContactos(id.numero); });
      }

      // Google Contactos no tiene campo para el usuario de WhatsApp: buscar por
      // el @usuario solo encuentra al contacto si lo escribiste en sus notas.
      if (id.username) {
        return u.copiar(id.username).then(function () { buscarEnContactos(id.username); });
      }

      var nombre = u.nombreDesdeHeader();
      if (nombre) {
        buscarEnContactos(nombre);
        return;
      }
      u.aviso("No se encontró ni número ni nombre válido.", true);
    })
    .catch(function (e) {
      u.aviso("No se pudo leer el contacto: " + e, true);
    });
})();
