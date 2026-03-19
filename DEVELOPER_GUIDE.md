# 🛠 Guía para Desarrolladores

Si deseas verificar, auditar o modificar la forma en la que la extensión busca e interactúa con WhatsApp Web, aquí tienes el mapa exacto de dónde encontrar cada lógica.

La extensión es **Modular**. Cada botón e inyección tiene su propio archivo, así que si una de las opciones falla, solo tienes que ir a ese archivo sin estropear las demás funciones.

---

## 📁 1. Estructura y Componentes Base

Archivos que dan vida a la infraestructura de la extensión ante Google Chrome:

- **`manifest.json`**: El corazón del proyecto. Define qué permisos solicitamos (Scripting, Portapapeles) y los atajos de teclado (`commands`). **Todo empieza aquí**.
- **`background.js`**: El Service Worker invisible. Escucha silenciosamente los eventos que manda tu computadora (como presionar los atajos de teclado) y despacha los scripts al navegador (`chrome.scripting.executeScript`).
- **`popup.html` y `popup.js`**: Construyen la pequeña caja visual que se abre al pinchar el icono. Son simplemente tres botones de HTML con Javascript enlazado que, apenas lo pisas, le inyecta la función respectiva a WhatsApp.

---

## ⚙️ 2. Scripts Inyectados (El Núcleo Operativo)

Estos tres archivos son el _"músculo"_ real del scraper. Son Scripts inyectados que se introducen a la fuerza (Content Execution) dentro de la página cargada de `web.whatsapp.com`. 

### A) `copynumber.js`
Es el archivo para el botón principal "Copia el Número".
**¿Dónde tienes que cambiar si algo se daña?**
- Si la extracción falla porque cambiaron los teléfonos: Edita `phoneRegex` (línea 3).
- Si al abrir el chat el click principal falla: Revisa la constante `clickableArea` (alrededor de la línea 40).
- Si dejó de cerrarse la pestaña derecha: El cierre se hace evaluando selectores CSS al final (`<title>ic-close</title>` o `data-icon="x"`). Búscalo en la línea 80.

### B) `content.js`
Es hermano gemelo completo de `copynumber.js` pero en lugar de solo copiar al portapapeles, **usa `window.open()` hacia `https://contacts.google.com/...`**.
**¿Dónde tienes que cambiar si algo se daña?**
- Si quieres que te exporte a Excel, Trello u otro software por URL, cambias el enlace de `window.open`.
- Funciona con una lógica de "Intentar número" -> si no hay -> "Intentar guardar el nombre". Revisa la variable `fallbackName`.

### C) `copyname.js`
Es el más sencillo. Solo sirve para leer superficialmente el encabezado (Header) principal sin abrir el panel lateral de WhatsApp.
Usa `.textContent` revisando cualquier `Span` que le corresponda a la parte top del DOM. Elimina palabras como "Escribiendo..." ("typing...").

---

## 🧠 Secretos Técnicos de la Operación

Hemos evitado deliberadamente usar XPATHS duros (`/html/body/div[1]...`) porque WhatsApp los ofusca mediante compiladores React cambiando la estructura casi semanalmente con su diseño visual. 

La extensión hoy utiliza una **Lógica Sensorial Inversa** 🥷:
1. Le da click donde detecta texto y abre el *Right Panel*.
2. Captura todos los contenedores de la página, pero usando un filtro espacial estricto (`span.getBoundingClientRect().left < window.innerWidth / 3`). Esto garantiza matemáticamente que solo se le ponga cuidado a los elementos de la zona derecha, evitando que pesque números del chat.
3. Extrae, prueba el formato contra E.164 (`/^\+?\d{7,16}$/`), finaliza localizando el botón SVG usando su Título Oculto interno (`<title>ic-close</title>`) y cierra. 

Esto garantiza máxima viabilidad futura frente a cambios estéticos de WhatsApp.
