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

`overlay.js` tiene tres estados, persistidos en `chrome.storage.local` bajo `overlayState`:

| Estado | Qué se ve |
|---|---|
| `bubble` | Solo la burbuja ⚡ (por defecto) |
| `panel` | El panel abierto; al entrar dispara el lookup del chat |
| `hidden` | Nada |

**Cuidado al tocar esto.** `hidden` se persiste, así que sobrevive a recargar la página. Hasta la
v1.3.0 la única forma de salir de ese estado era el atajo `Ctrl/Cmd+Shift+Space`, que no está
escrito en ninguna parte de la interfaz: si el navegador se quedaba con esa combinación, el panel
quedaba **inaccesible para siempre** en esa instalación. Pasó de verdad, en Edge.

Ahora hay tres salidas y conviene mantener las tres:

1. El botón `◱` del popup escribe `overlayState: "bubble"`.
2. `chrome.storage.onChanged` en `overlay.js` escucha `overlayState` y aplica el cambio **en vivo**.
   Ojo: ahí se llama a `aplicarEstadoUI()` y no a `setState()`, para no volver a escribir en storage
   y provocar un bucle de eventos.
3. Al pulsar ✕ sale un aviso diciendo cómo volver. El toast es independiente del panel y del
   launcher, por eso se ve aunque ambos estén ocultos.

Regla general: **ninguna acción de un clic debe poder dejar la extensión sin una salida visible.**

---

## ⌨️ 5. Atajos

Chrome solo permite **4 comandos con tecla sugerida** por extensión, y el manifest
ya los tiene todos (`_execute_action` cuenta). Por eso:

- `copiar-usuario-auto` está declarado **sin** tecla: se le asigna a mano en
  `chrome://extensions/shortcuts`.
- El overlay escucha `Ctrl/Cmd+Shift+Space` (mostrar/ocultar) y
  `Ctrl/Cmd+Shift+U` (copiar usuario) **desde la propia página**, que no consume
  cupo de `chrome.commands`.

---

## 🧪 6. Probar sin recargar nada

En las DevTools de WhatsApp Web, cambia el contexto de la consola de `top` a
**"Copiar número de WhatsApp"** y evalúa:

```js
__elixirUtils.VERSION
await __elixirUtils.obtenerIdentidad({ permitirPanel: false })
__elixirUtils.leerPanelContacto()          // con el panel de contacto abierto
__elixirUtils.normalizarNumero("302 422 0918", { asumirPais: true })
```

Es la forma más rápida de iterar los selectores cuando WhatsApp vuelva a cambiar.
