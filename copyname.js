// copyname.js — Copia el nombre visible del chat (sin abrir el panel lateral).
(function () {
  "use strict";

  var u = window.__elixirUtils;
  if (!u) {
    alert("No se pudo cargar la extensión. Recarga la pestaña de WhatsApp Web.");
    return;
  }

  if (!u.hayChat()) {
    u.aviso("Abre un chat primero.", true);
    return;
  }

  var nombre = u.nombreDesdeHeader();
  if (!nombre) {
    // El título del chat es el número o el @usuario: no hay nombre que copiar.
    var usuario = u.usuarioDesdeHeader();
    u.aviso(usuario
      ? "Contacto sin nombre (solo usuario " + usuario + ")"
      : "Contacto sin nombre (solo número)", true);
    return;
  }

  u.copiar(nombre).then(function () {
    u.aviso("Nombre copiado: " + nombre);
  });
})();
