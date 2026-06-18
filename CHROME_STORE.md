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

---

## 6. Formulario de Privacidad — textos listos para pegar (v1.1.0)

> Reemplazan los de la versión anterior. **Actualiza primero el Google Doc** de la
> política con el texto de la sección 5 (el formulario certifica que coincide con la
> política publicada).

**Descripción de un solo propósito**
> Herramienta de productividad para soporte de cuentas de streaming. Desde WhatsApp Web extrae el número del chat actual y muestra en un panel las cuentas asociadas a ese número, consultándolas en el backend del propietario mediante una clave de API. Permite copiar el número o el correo al portapapeles y, de forma opcional, solicitar códigos de verificación a los bots de los proveedores en Telegram Web y copiar el código. Todas las acciones las inicia el usuario.

**Justificación de activeTab**
> Se usa 'activeTab' para actuar sobre la pestaña actual cuando el usuario invoca la extensión (icono o atajo de teclado), leyendo la información necesaria en ese momento sin requerir acceso permanente a todas las pestañas, lo que protege la privacidad del navegador.

**Justificación de scripting**
> Se usa 'scripting' para inyectar bajo demanda los scripts que leen el número/nombre en el DOM de WhatsApp Web (overlay.js, copynumber.js, copyname.js, content.js, buscarelixir.js) y para automatizar Telegram Web (telegram.js) al solicitar códigos. Sin esta inyección no es posible leer los selectores del DOM ni ejecutar la función.

**Justificación de clipboardWrite**
> Se usa 'clipboardWrite' para copiar al portapapeles del sistema el número extraído o el código de verificación, de modo que el usuario pueda pegarlo inmediatamente en sus programas.

**Justificación de storage**
> Se usa 'storage' (chrome.storage.local) para guardar localmente en el navegador la configuración del usuario: la URL del backend, la clave de API, el estado y la posición del panel, y los nombres de los bots de Telegram. No se guarda en servidores de terceros.

**Justificación de tabs**
> Se usa 'tabs' para localizar, abrir o enfocar la pestaña de Telegram Web y enrutar la solicitud de código al bot del proveedor correcto, además de detectar cuándo terminó de cargar. No se inspecciona el contenido de pestañas ajenas a esta función.

**Justificación de Permiso de host**
> web.whatsapp.com: leer el número/nombre del chat visible y mostrar el panel. web.telegram.org: automatizar la solicitud de códigos de verificación a los bots de los proveedores. elixircuentas.com (y elixircuentas-test.fly.dev en pruebas): consultar la API del propietario que devuelve las cuentas asociadas al número. Cada host se declara explícitamente para limitar la acción de la extensión a esos dominios.

**¿Usas código remoto?** → No.

**Uso de datos (casillas a marcar):**
- ✅ Información de identificación personal — el número de teléfono del contacto (se envía al backend del propietario).
- ✅ Contenido de sitios web — se lee texto visible del DOM de WhatsApp Web.
- (No marcar las demás; no se recopilan mensajes, salud, finanzas, ubicación, etc.)

**Certificaciones:** marcar las tres (no vender/transferir a terceros, no usar para fines ajenos, no usar para solvencia).

**URL de política de privacidad:** la misma del Google Doc (tras actualizar su contenido con la sección 5).
