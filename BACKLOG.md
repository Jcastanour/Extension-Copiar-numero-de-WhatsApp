# Backlog de la extensión

Lo que está en marcha, lo que espera y lo que es solo una idea. Cada ítem dice **por qué**, **dónde
vive** en el código y **cómo se comprueba**. Se actualiza al cerrar cada cosa; lo cerrado baja a
"Hecho" con la versión en la que salió.

---

## Ahora (v1.6.0)

### 1. El nombre del cliente anterior se queda en la barra al cambiar de chat — bug · hecho
- **Por qué:** en forma *barra* el nombre y los D van dentro del flotante, y `pintarChip()` salía
  sin repintarlo en los estados `vacio`/`buscando`. Dejar el cliente anterior sobre otro chat es lo
  que el DEVELOPER_GUIDE §5 dice que nunca debe pasar.
- **Dónde:** `overlay.js` → `pintarChip()` / `pintarLauncher()`.
- **Cómo se comprueba:** forma barra, abrir chat A con ficha, cambiar a B → la barra vuelve a ⚡ en
  menos de un segundo sin tocar nada. Con el panel abierto, igual.

### 2. Texto desalineado en la barra — cosmético · hecho (revisar a ojo)
- **Por qué:** el ⚡ es un emoji con métrica vertical propia y descuadraba el centrado del nombre.
- **Dónde:** CSS de `.launcher.barra` en `overlay.js` (`.b-ray`, `line-height:1`).
- **Cómo se comprueba:** captura al 100 % y al 125 % de zoom con "Nombre D01".

### 3. ProveedorYT pedía el código al bot de Wolf — bug · hecho
- **Por qué:** `botParaCuenta()` no conocía ese proveedor y caía al bot por defecto, que contestaba
  "No tienes autorización para usar este correo".
- **Dónde:** `numero-utils.js` → `proveedorDe()` (ProveedorYT se prueba antes que kh/wolf).
- **Cómo se comprueba:** tarjeta de una cuenta ProveedorYT → el botón de Telegram apunta al bot de
  Storetools. `node test/run.js`.

### 4. Interruptor por proveedor: Telegram o endpoint directo — feature · hecho
- **Por qué:** Juan Pablo quiere decidir **por proveedor y por separado** cómo se pide el código.
  Telegram es lo de siempre y sigue siendo el defecto; el directo solo entra si está configurado,
  y si falta algo se vuelve a Telegram sin fallar. Un solo botón por tarjeta.
- **Dónde:** `numero-utils.js` → `rutaCodigo()`; Ajustes en `popup.html`/`popup.js` (`modoCodigo`).
- **Cómo se comprueba:** `node test/run.js` (rutas) y cambiar el interruptor en Ajustes → el botón
  de la tarjeta cambia de texto sin recargar WhatsApp.

### 5. Código de Storetools por endpoint directo — feature · hecho, falta probar en vivo
- **Por qué:** es el servicio del propio negocio; devuelve el correo entero en HTML y el código se
  extrae en la extensión. Probado contra Max, Disney+ y Prime reales (fixtures en `test/`).
- **Dónde:** `background.js` → `codigoStoretools()`; `codigo-html.js` → `extraerCodigoDeHtml()`.
- **Cómo se comprueba:** Ajustes → ProveedorYT en "Endpoint directo" + ID de consulta → botón
  "Ver código (Storetools)" → código pintado y copiado. Sin ID → sigue Telegram.
- **Pendiente:** probar con una cuenta cuyo tipo no case (aparece el selector de plataforma).

### 6. Código de Storetools por bot de Telegram — feature · hecho, falta probar en vivo
- **Por qué:** el bot pide elegir plataforma con botones, el correo y, si la cuenta está protegida,
  el ID de consulta. Antes la extensión solo sabía "pegar el correo y leer".
- **Dónde:** `telegram.js` → `elegirPlataforma()`, `RE_PIDE_ID`; `background.js` pasa `plataforma`
  e `idConsulta`.
- **Cómo se comprueba:** con Telegram cerrado, en otro bot y ya en el de Storetools: elige la
  plataforma, manda el correo, mete el ID si lo piden y copia el código.
- **Ojo:** confirmar el @ del bot (`tgBotStore`, por defecto `CodigosTV_bot`; el chat se llama
  "Storetoolsbot"). Los selectores de los botones inline de Telegram K pueden cambiar.

### 7. Código de KH por endpoint directo (FastCodeManager) — feature · hecho, falta probar en vivo
- **Por qué:** el endpoint ya devuelve el código extraído y el listado de servicios es público.
  Probado contra Amazon y Disney+ reales.
- **Dónde:** `background.js` → `codigoKh()`, `serviciosKh()`.
- **Cómo se comprueba:** Ajustes → Digital KH en "Endpoint directo" → "Ver código (KH)".

### 8. Enrutamiento duplicado en overlay y popup — deuda · hecho
- **Dónde:** antes `botParaCuenta`/`esNetflix`/`botonCodigo` vivían dos veces; ahora en
  `numero-utils.js` y los dos solo pintan.

---

## Pendiente

### 9. Endpoint directo para Wolf / Andrés
- **Por qué:** hoy solo hay bot de Telegram. El bot le pega a algún endpoint: hay que mirar cuál y
  construir la llamada. Cuando exista, se enchufa con el mismo interruptor (`modoCodigo.wolf`) y
  una función más en `background.js`; el selector de Ajustes ya está, deshabilitado.

### 10. Feature grande — por describir
- Juan Pablo la va a contar en una próxima sesión. Reservado.

### 11. Probar `overlay.js` en jsdom
- El DEVELOPER_GUIDE §8 describe cómo; falta dejar el script en `test/` para que cualquiera lo
  corra. Hoy `test/run.js` cubre la extracción de códigos y el enrutamiento.

---

## Ideas / no ahora

- **Que el backend mande la plataforma de Storetools por tipo de cuenta** y la extensión deje de
  casar nombres por palabra clave (hoy "Amazon" → Prime, "Disney Premium" → Disney+). Mismo
  criterio que con los D: la convención vive en el backend.
- **Cerrar con token el endpoint de KH** (hoy responde sin cookie a quien sepa el slug y un
  correo). Si se cierra, la extensión necesitará un campo en Ajustes.
- **Netflix Elixir por Telegram**: existe el bot, pero el directo funciona y es más rápido. No vale
  la pena.

---

## Hecho

| Versión | Qué |
|---|---|
| 1.5.0 | Ficha del cliente en el flotante, copiar datos, ✕ minimiza, forma barra/burbuja. |
| 1.4.0 | Netflix pide el código al buzón propio, sin Telegram. |
| 1.3.0 | Panel flotante, Telegram por defecto, decodificador de PIN. |
