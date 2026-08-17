# 🛠 Guía para Desarrolladores

Mapa de dónde vive cada cosa, para auditar o arreglar la extensión cuando WhatsApp
cambie su interfaz (que lo hace a menudo).

---

## 📁 1. Infraestructura

- **`manifest.json`**: permisos, atajos de teclado (`commands`) y qué scripts se
  cargan en qué sitio. **Todo empieza aquí.**
- **`background.js`**: el Service Worker. Escucha los atajos, despacha los scripts
  con `chrome.scripting.executeScript` y hace de proxy para el lookup a la API
  (así se evita el CORS) y para la automatización de Telegram.
- **`popup.html` / `popup.js`**: la ventanita del icono. Botones de acción, la
  búsqueda de cuentas y los ajustes.
- **`overlay.js`**: el panel flotante dentro de WhatsApp Web. Detecta el cambio de
  chat con un MutationObserver y muestra las cuentas sin abrir el popup.
  Además publica `window.__elixirUI`, que da modal y toast al resto de scripts.

---

## 🧠 2. `numero-utils.js` — donde vive TODA la lógica de extracción

**Si algo falla al leer el número o el usuario, el arreglo va aquí y solo aquí.**

Antes esta lógica estaba copiada palabra por palabra en cinco archivos, así que
cada cambio de WhatsApp obligaba a parchear cinco veces. Ahora es un solo módulo
que se publica en `window.__elixirUtils`.

Se carga de tres maneras, y las tres conviven sin problema porque el módulo tiene
un guard por versión y no hace nada al cargarse:

| Contexto | Cómo llega |
|---|---|
| `overlay.js` | Declarado en el `js` del content script del manifest |
| Scripts de atajo/botón | `files: ["numero-utils.js", "<script>.js"]` |
| Documento del popup | `<script src="numero-utils.js">` en `popup.html` |

### La cascada de `obtenerIdentidad()`

Busca el número por orden de coste y se detiene en el primero que acierte. Solo el
paso 5 toca la interfaz de WhatsApp:

1. **`header`** — el título del chat ya es el número (contactos no guardados).
2. **`jid`** — el `data-id="false_<jid>_<msgid>"` de las filas de mensaje. Si el
   jid es `<dígitos>@c.us` tienes el número gratis, sin abrir nada. Los `@lid` se
   rechazan como teléfono (solo valen de clave de caché) y los `@g.us` son grupos.
3. **`mensaje-sistema`** — el aviso "+57 … estableció el nombre de usuario @…".
4. **`cache`** — un número que el operador ya tecleó antes para este mismo chat.
5. **`panel`** — abre "Info. del contacto", lee y lo vuelve a cerrar.
6. **`manual`** — se lo pregunta al operador y lo recuerda para la próxima.

### Cómo se lee el panel (el fix de agosto de 2026)

Cuando un contacto activa su `@usuario`, WhatsApp **mueve el número** del subtítulo
a una sección propia cuyo `<span>` no tiene `dir="auto"` ni `copyable-text`. El
barrido antiguo buscaba justo esos dos selectores, así que dejó de encontrarlo y
salía "No se encontró el número de teléfono" aunque el número estuviera a la vista.

Ahora se lee por ancla semántica, en este orden:

1. `[data-testid="section-phone-number"]` — el valor **no** está dentro de ese div
   sino en su hermano, así que se sube a `.parentElement` y se busca ahí.
2. `[data-testid="notes-section"]` — las notas de cliente de WhatsApp Business. Si
   apuntas ahí el número de alguien que solo tiene `@usuario`, se aprovecha.
3. El barrido geométrico de siempre, como red de seguridad.

Los `data-testid` son nombres de producto y aguantan mucho mejor que las clases
(`x140p0ai`…), que WhatsApp regenera casi cada semana. **Si vuelve a fallar, lo
primero que hay que mirar es si renombraron esos `data-testid`.**

### Leer dentro del chat sin pescar números ajenos

`#main` está lleno de números que escriben los clientes. `identidadDesdeSistema()`
solo acepta una fila si pasa las cinco guardas a la vez: que **no** tenga
`data-pre-plain-text` (los mensajes de personas sí lo llevan y los de sistema no),
que el texto sea corto, que contenga la frase del nombre de usuario, que haya un
`@algo`, y que el número aparezca **antes** de esa frase.

Al tocar esto hay que repetir la prueba negativa: escribir un número en un chat
normal y comprobar que la extensión sigue diciendo que no lo encontró.

### Normalización

`normalizarNumero(raw, {asumirPais})` solo asume Colombia cuando `asumirPais` es
`true`, y eso únicamente ocurre con lo que teclea el operador. Un `+1 305 555 0123`
nunca se toca. Lo leído del DOM se copia tal cual; solo el jid y la entrada manual
se reformatean a `+57 302 4220918`.

---

## ⚙️ 3. Scripts de acción

Todos son envoltorios finos: piden la identidad al módulo y hacen una cosa.

| Archivo | Qué hace |
|---|---|
| `copynumber.js` | Copia el número |
| `copyusername.js` | Copia el `@usuario` (aparte del número, a propósito) |
| `copyname.js` | Copia el nombre visible del chat |
| `content.js` | Copia el número y abre Google Contactos |
| `buscarelixir.js` | Copia el número y lo busca en Elixir Cuentas |

**Regla obligatoria**: van envueltos en IIFE y **sin `const`/`let` en el nivel
superior del archivo**. Los scripts inyectados comparten el scope global de la
pestaña mientras esta viva: `function` se puede redeclarar, pero un `const`
repetido lanza `Identifier has already been declared` y el script no llega ni a
ejecutarse. Es exactamente lo que le pasaba a `buscarelixir.js` al pulsar su atajo
dos veces sin recargar.

---

## 🪟 4. Estados del panel flotante (y por qué importa)

Desde la v1.5.0 hay **dos ejes independientes**, y esa separación es deliberada:

| Clave en `chrome.storage.local` | Qué significa |
|---|---|
| `overlayState` | Dónde estoy: `bubble` (por defecto) o `panel` |
| `overlayEnabled` | Si el flotante existe. Solo se apaga desde Ajustes del popup |

En `bubble` se ven la burbuja ⚡ y el **chip** con el nombre y los D del cliente; en `panel`, el
panel abierto (el chip sobra, porque su información está dentro y con más detalle).

**Por qué se separaron.** Antes había un tercer estado, `hidden`, al que llevaba la ✕ del panel. Se
persistía, así que sobrevivía a recargar: quien pulsaba la ✕ sin conocer el atajo
`Ctrl/Cmd+Shift+Space` —que no está escrito en ninguna parte de la interfaz— se quedaba sin panel
**para siempre** en esa instalación. Pasó de verdad, en Edge. Cerrar una cosa y desinstalarla no
pueden ser el mismo botón.

Ahora la ✕ minimiza y el apagado real es una decisión explícita, que se deshace donde se tomó.
`hidden` ya no existe, pero sigue habiendo dos sitios que lo tratan y **no hay que quitarlos**:

- El init lo migra a `{overlayEnabled: false, overlayState: "bubble"}` y lo reescribe en storage.
  Sin eso, quien pulsó la ✕ en una versión vieja seguiría sin ver nada tras actualizar.
- El listener de `onChanged` lo lee como `bubble`: mientras convivan las dos versiones, una pestaña
  con la antigua todavía puede escribirlo.

Salidas que conviene mantener:

1. El checkbox de Ajustes (patrón calcado de `cfgTgEnabled`, con el default seguro `x !== false`).
2. El botón `◱` del popup, que además fuerza `overlayEnabled: true` — es lo primero que prueba
   quien no encuentra el panel.
3. `chrome.storage.onChanged` aplica ambas claves **en vivo**, sin recargar WhatsApp. Ojo: ahí se
   llama a `aplicarEstadoUI()` y no a `setState()`, para no volver a escribir en storage y provocar
   un bucle de eventos.

Regla general: **ninguna acción de un clic debe poder dejar la extensión sin una salida visible.**

---

## 🔎 5. El chip, la ficha y por qué la búsqueda corre siempre

El chip es el sustituto del nombre del contacto de Google Contacts, que es donde vivían el nombre
real del cliente y su secuencia D hasta que WhatsApp empezó a esconder el teléfono. Para que sirva
tiene que estar al día sin que nadie abra nada, así que `schedule()` **ya no** sale temprano cuando
el panel está cerrado. Lo que sostiene el coste:

- Debounce de 350 ms con `maxWait` 1500 ms.
- `evaluarChat()` compara por `firmaChat()` (solo el título del chat, no el subtítulo de presencia)
  y corta antes de tocar la red en casi todas las mutaciones.
- Nada con la pestaña en segundo plano; `visibilitychange` re-evalúa al volver.
- Caché por conversación: 30 entradas, TTL 5 min.

Tres detalles que parecen de adorno y no lo son:

- **La búsqueda automática usa `rapido: true`**, que impide abrir el panel de contacto de WhatsApp
  y sacar el modal. Ocurre sola en cada chat: si tocara la interfaz sería insoportable. Solo el
  botón 🔍, que es explícito, puede hacerlo.
- **Toda búsqueda termina en `finBusqueda()`**, que re-evalúa. Si el chat cambió a media búsqueda,
  el guard de `buscando` bloqueó la segunda y sin esto el chat nuevo no se consultaría nunca.
- **La ficha del hover no lleva correos ni contraseñas.** Se despliega sola con solo pasar el ratón
  y puede quedar a la vista en una pantalla compartida. Eso vive en el panel, tras un clic.

`normalizarLookup()` traduce la respuesta del backend en un solo sitio y **ningún campo nuevo es
obligatorio**: producción puede ir por detrás de test, y la extensión tiene que funcionar contra
ambos contratos. Lo que falte, no se pinta.

Los D **no se derivan en la extensión**. La convención (D01–D03 con cero, D4+ sin él, dedupe, y que
D31 no existe) vive en el backend, y duplicarla aquí sería garantizar que un día diverja de lo que
ve el operador en la web.

---

## ⌨️ 6. Atajos

Chrome solo permite **4 comandos con tecla sugerida** por extensión, y el manifest
ya los tiene todos (`_execute_action` cuenta). Por eso:

- `copiar-usuario-auto` está declarado **sin** tecla: se le asigna a mano en
  `chrome://extensions/shortcuts`.
- El overlay escucha `Ctrl/Cmd+Shift+Space` (mostrar/ocultar) y
  `Ctrl/Cmd+Shift+U` (copiar usuario) **desde la propia página**, que no consume
  cupo de `chrome.commands`.

---

## 🧪 7. Probar sin recargar nada

En las DevTools de WhatsApp Web, cambia el contexto de la consola de `top` a
**"Copiar número de WhatsApp"** y evalúa:

```js
__elixirUtils.VERSION
await __elixirUtils.obtenerIdentidad({ permitirPanel: false })
await __elixirUtils.obtenerIdentidad({ rapido: true })   // lo que usa el chip
__elixirUtils.leerPanelContacto()          // con el panel de contacto abierto
__elixirUtils.normalizarNumero("302 422 0918", { asumirPais: true })
```

Es la forma más rápida de iterar los selectores cuando WhatsApp vuelva a cambiar.

### Contra el backend local

En Ajustes, `BASE_URL` = `http://localhost:8000` (ya está en `host_permissions`; sin esa entrada
el `fetch` del service worker se bloquea sin decir por qué) y la `EXTENSION_API_KEY` del `.env` del
backend. Si esa variable está vacía en el servidor, **todo responde 401** y parece que el endpoint
está roto.

### Sin abrir Chrome

`overlay.js` arranca en jsdom con un WhatsApp de mentira, lo que caza errores de arranque, TDZ y
typos en segundos. Hace falta stubear `ResizeObserver`, `setPointerCapture`/`releasePointerCapture`
y `chrome.*`, y **definir `navigator.clipboard` desde dentro de la ventana** (`window.eval`): el
`navigator` que ve el código evaluado no es el mismo objeto que `window.navigator` visto desde Node.
Guardando respuestas reales del backend en un `.json` se prueban de golpe el contrato nuevo, el
viejo de producción, la persona sin cuentas activas y el número desconocido.
