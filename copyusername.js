// copyusername.js — Copia el nombre de usuario (@algo) del chat actual.
// Va aparte del número a propósito: el número sigue siendo el dato principal
// del negocio y el @usuario todavía no se envía al backend.
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

  u.obtenerUsuario({ permitirPanel: true })
    .then(function (r) {
      if (!r.username) {
        u.aviso("Este contacto no tiene nombre de usuario.", true);
        return;
      }
      return u.copiar(r.username).then(function () {
        u.aviso("Usuario copiado: " + r.username);
      });
    })
    .catch(function (e) {
      u.aviso("No se pudo leer el usuario: " + e, true);
    });
})();
