# ⚡ WhatsApp Web - Contact Extractor

Una extensión robusta para Google Chrome que te permite extraer con un clic los números telefónicos y nombres de tus chats de WhatsApp Web, de forma rápida e indetectable.

## 🚀 Características
- **Extracción Inteligente:** Reconoce números de teléfono en contexto E.164 universal (+ XX XXX XXXX) en el chat con los que te comuniques, incluso si es un perfil de WhatsApp Business.
- **Resistente a actualizaciones:** A diferencia de otras extensiones, no depende de selectores CSS frágiles ni de posiciones complejas en el código (que cambian constantemente). Utiliza búsquedas matemáticas en la interfaz (Regex y Coordenadas) para garantizar que seguirá funcionando por meses.
- **Trazabilidad Oculta:** La extensión abre milimétricamente la Información del Contacto y la vuelve a cerrar tan rápido que casi ni te percatas.
- **Integración con Google Contacts:** Abre en otra pestaña un formulario en Google listo para añadir a la persona a tu lista de contactos en un solo clic.

---

## ⚙️ Instalación Fácil

1. Clona o descarga este proyecto en tu computador local.
2. Abre Google Chrome y navega a `chrome://extensions/`.
3. Activa el **"Modo de Desarrollador"** en la esquina superior derecha.
4. Haz clic en el botón superior izquierdo **"Cargar descomprimida"** (Load unpacked).
5. Selecciona la carpeta donde guardaste los archivos de la extensión.
6. ¡Listo! Verás el icono de la extensión fijado en tu barra de tareas de Chrome.

---

## ⌨️ Atajos de Teclado y Uso Rápido

La herramienta está pensada para la máxima velocidad del teclado. Si estás dentro de la pestaña de WhatsApp Web, puedes presionar:

- **`Ctrl+Space`** (o `Cmd+Space` en Mac) ➔ Abre el menú flotante para hacer clic manual.
- **`Ctrl+Shift+C`** (o `Cmd+Shift+C`) ➔ Copia silenciosamente el **número**. (Si tu computador tiene este atajo reservado, puedes cambiarlo en _`chrome://extensions/shortcuts`_).
- **`Ctrl+Shift+X`** (o `Cmd+Shift+X`) ➔ Extrae el número y abre instantáneamente **Google Contacts**.

_Nota: Estos atajos son configurables. Ve a [chrome://extensions/shortcuts](chrome://extensions/shortcuts) y ponle los atajos que a ti te gusten más._

---

## 🛠 Para Desarrolladores

El código está estructurado para que sea fácil de mantener y leer. Para revisar cómo funciona internamente, entra y lee el archivo **`DEVELOPER_GUIDE.md`** recién incluido.
