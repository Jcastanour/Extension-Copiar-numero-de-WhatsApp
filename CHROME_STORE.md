# Publicación en Chrome Web Store — v1.1.0

Documento de apoyo para subir la versión y completar el formulario de la tienda
(justificaciones de permisos, divulgación de datos y política de privacidad).

> ⚠️ La extensión cambió de comportamiento en la v1.1.0: ahora **sí transmite el
> número de WhatsApp a un backend propio** (para buscar las cuentas asociadas) y
> **automatiza Telegram Web** para pedir códigos. La política de privacidad
> anterior ("100% local, sin transmisión a servidores") quedó **desactualizada** y
> debe reemplazarse por la de abajo, o la revisión de la tienda puede rechazarla
> por inconsistencia con los permisos declarados.

---

## 1. Build

- Archivo a subir: `dist/copiar-numero-whatsapp-1.1.0.zip` (manifest.json en la raíz).
- Versión: `1.1.0`.

## 2. Propósito único (Single purpose)

Herramienta de productividad para un negocio de cuentas de streaming: desde
WhatsApp Web extrae el número del chat actual, consulta las cuentas asociadas en
el backend del propietario y agiliza la solicitud de códigos de verificación a los
bots de los proveedores en Telegram.

## 3. Permisos y justificación (para el formulario)

| Permiso | Justificación |
|---|---|
| `activeTab` | Actuar sobre la pestaña activa cuando el usuario invoca la extensión o un atajo. |
| `scripting` | Inyectar bajo demanda los scripts de extracción del número y de automatización de Telegram. |
| `clipboardWrite` | Copiar al portapapeles el número o el código de verificación. |
| `storage` | Guardar localmente la configuración del usuario (URL del backend, API key, estado/posición del overlay, bots de Telegram). |
| `tabs` | Localizar / abrir / enfocar la pestaña de Telegram Web para enrutar la solicitud al bot correcto. |

### host_permissions

| Dominio | Uso |
|---|---|
| `*://web.whatsapp.com/*` | Leer el número/nombre visible del chat y mostrar el panel overlay. |
| `*://web.telegram.org/*` | Automatizar la solicitud de códigos a los bots de los proveedores. |
| `https://elixircuentas.com/*` | Consultar la API de cuentas (`/api/extension/lookup`). |
| `https://elixircuentas-test.fly.dev/*` | Mismo fin, entorno de pruebas. |

## 4. Divulgación de datos (Data usage en el Dashboard)

- **Sí** se recopila/transmite: el **número de teléfono** del chat de WhatsApp se
  envía al backend del propietario para buscar las cuentas asociadas.
- Configuración (URL, API key, ajustes) se guarda **localmente** en el navegador
  (`chrome.storage.local`), no en servidores de terceros.
- **No** se venden datos a terceros. **No** se usan para publicidad/marketing ni
  para evaluar solvencia. El uso se limita a la funcionalidad declarada.

Marcar en el Dashboard: recopila *Website content* y *Personal communications*
(número telefónico), con transmisión cifrada al backend propio.

---

## 5. Política de Privacidad (texto actualizado — reemplaza el anterior)

**Política de Privacidad — Extensión "Copiar número de WhatsApp"**
Última actualización: 18 de junio de 2026

Esta Política de Privacidad describe cómo la extensión de Chrome "Copiar número de
WhatsApp" (la "Extensión") maneja la información del usuario, conforme a las
políticas del programa para desarrolladores de Chrome Web Store.

**1. Datos que se procesan**
Cuando el usuario lo activa voluntariamente, la Extensión lee del DOM de la pestaña
de WhatsApp Web (web.whatsapp.com) el número de teléfono o nombre del contacto del
chat actual. Ese número se envía al backend del propietario (elixircuentas.com, y
elixircuentas-test.fly.dev en pruebas) a través de una petición autenticada con una
clave de API, con el único fin de mostrar las cuentas de streaming asociadas a ese
número. La Extensión no recopila el contenido de los mensajes, ni el historial de
navegación, ni datos de otras pestañas.

**2. Almacenamiento local**
La configuración del usuario (URL del backend, clave de API, estado y posición del
panel, y los ajustes de los bots de Telegram) se guarda exclusivamente de forma
local en el navegador mediante `chrome.storage.local`. No se almacena en servidores
de terceros.

**3. Integración con Telegram (opcional)**
Si el usuario habilita la función y pulsa "Pedir código", la Extensión abre o
enfoca Telegram Web (web.telegram.org), escribe en el chat del bot del proveedor el
correo de la cuenta seleccionada y lee la respuesta del bot para copiar el código de
verificación al portapapeles. Esta interacción ocurre dentro de la sesión de
Telegram del propio usuario; la Extensión no almacena ni transmite esas
conversaciones a terceros.

**4. Transmisión y compartición de datos**
El número de teléfono se transmite únicamente al backend del propietario para la
función descrita. No vendemos ni transferimos los datos del usuario a terceros, ni
los usamos para publicidad, marketing o evaluación de solvencia, ni para ningún fin
ajeno a la funcionalidad principal declarada.

**5. Permisos**
La Extensión solicita los permisos mínimos necesarios para su función: `activeTab`,
`scripting`, `clipboardWrite`, `storage` y `tabs`, además de acceso a los dominios
web.whatsapp.com, web.telegram.org y el backend del propietario. No accede de forma
persistente ni invasiva a otras pestañas o ventanas.

**Contacto**
Para cualquier pregunta sobre esta política, escriba al correo de contacto técnico
publicado en la ficha de la Chrome Web Store.
