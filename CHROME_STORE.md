# Publicación en Chrome Web Store — v1.5.0

Documento de apoyo para subir la versión y completar el formulario de la tienda
(justificaciones de permisos, divulgación de datos y política de privacidad).

> ⚠️ **Antes de empacar la v1.5.0: quitar `http://localhost:8000/*` del manifest.**
>
> Ese host está en el repo para poder probar contra el backend local sin tocar nada,
> pero no pinta nada en el paquete que se sube: sería un permiso de host más que
> declarar y justificar, sobre un origen HTTP en claro, y eso es justo la clase de
> cosa que alarga una revisión sin darle nada a quien instala la extensión.
>
> ```bash
> # desde la raíz del repo, antes de crear el zip
> python3 - <<'PY'
> import json
> m = json.load(open("manifest.json"))
> m["host_permissions"] = [h for h in m["host_permissions"] if "localhost" not in h]
> json.dump(m, open("manifest.json", "w"), indent=2, ensure_ascii=False)
> PY
> ```
>
> Y devolverlo al terminar (`git checkout manifest.json`), que si no la próxima
> sesión de desarrollo local responde con un error de red sin explicación.

> **Qué trae la v1.5.0** (sin permisos nuevos respecto a la 1.4.0, una vez quitado
> localhost, así que la declaración de datos **no cambia**):
>
> - Estando parado en un chat se ve, sin abrir nada, el nombre del cliente y su
>   secuencia D. Es lo que sustituye al contacto de Google Contacts, que ya no se
>   puede guardar en los chats que solo exponen `@usuario`.
> - Al pasar el ratón por encima aparece la ficha de esa persona.
> - La ✕ del panel **minimiza**; el flotante se apaga desde Ajustes.
> - El panel trae el mensaje de renovación listo para copiar y avisa cuando la
>   cuenta madre se ha caído.

> ⚠️ **La v1.4.0 SÍ añadió un permiso de host nuevo**: `https://codigos.elixircuentas.com/*`.
> Es la primera versión desde la 1.1.0 que toca permisos, así que la revisión puede
> tardar más de lo habitual. Los 5 permisos de API siguen siendo los mismos.
>
> Qué trae: las cuentas de Netflix ya no piden el código por Telegram. La extensión
> consulta el servicio propio de códigos (que lee el buzón central del negocio) y
> devuelve el código al instante. Los demás proveedores siguen por Telegram, porque
> ese servicio solo entiende los correos de Netflix.
>
> **Dato nuevo que declarar**: se envía a ese servicio el **correo de la cuenta de
> streaming** (dato del negocio, no del cliente final).

---

## 1. Build

- Archivo a subir: `dist/copiar-numero-whatsapp-1.5.0.zip` (manifest.json en la raíz).
- Versión: `1.5.0`.
- Comprobar que `host_permissions` **no** lleva `localhost` (ver aviso de arriba).

## 2. Propósito único (Single purpose)

Herramienta de productividad para un negocio de cuentas de streaming: desde
WhatsApp Web identifica el contacto del chat actual (número de teléfono y, si
existe, su nombre de usuario), consulta las cuentas asociadas en el backend del
propietario y agiliza la solicitud de códigos de verificación a los bots de los
proveedores en Telegram.

## 3. Permisos y justificación (para el formulario)

| Permiso | Justificación |
|---|---|
| `activeTab` | Actuar sobre la pestaña activa cuando el usuario invoca la extensión o un atajo. |
| `scripting` | Inyectar bajo demanda los scripts de extracción del número/usuario y de automatización de Telegram. |
| `clipboardWrite` | Copiar al portapapeles el número o el código de verificación. |
| `storage` | Guardar localmente la configuración del usuario (URL del backend, API key, estado/posición del overlay, bots de Telegram) y los números que el propio usuario teclea cuando WhatsApp no los muestra. |
| `tabs` | Localizar / abrir / enfocar la pestaña de Telegram Web para enrutar la solicitud al bot correcto. |

### host_permissions

| Dominio | Uso |
|---|---|
| `*://web.whatsapp.com/*` | Leer el número, el nombre y el nombre de usuario visibles del chat, y mostrar sobre él el panel y la etiqueta con los datos del cliente. |
| `*://web.telegram.org/*` | Automatizar la solicitud de códigos a los bots de los proveedores. |
| `https://elixircuentas.com/*` | Consultar la API de cuentas (`/api/extension/lookup`). |
| `https://codigos.elixircuentas.com/*` | Consultar el servicio propio que extrae del buzón del negocio el código de verificación de Netflix (`/api/code`). |
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

> Pegar tal cual en el Google Doc de la política. Frente a la v1.1.0 cambian: la
> fecha, el punto 1 (ahora también se lee el nombre de usuario) y el punto 3, que
> es nuevo.

**Política de Privacidad — Extensión "Copiar número de WhatsApp"**
Última actualización: 9 de agosto de 2026

Esta Política de Privacidad describe cómo la extensión de Chrome "Copiar número de
WhatsApp" (la "Extensión") maneja la información del usuario, conforme a las
políticas del programa para desarrolladores de Chrome Web Store.

**1. Datos que se procesan**
Cuando el usuario lo activa voluntariamente, la Extensión lee del DOM de la pestaña
de WhatsApp Web (web.whatsapp.com) los datos identificativos del contacto del chat
actual: su número de teléfono y, si el contacto lo tiene configurado, su nombre de
usuario. Ese número se envía al backend del propietario (elixircuentas.com, y
elixircuentas-test.fly.dev en pruebas) a través de una petición autenticada con una
clave de API, con el único fin de mostrar las cuentas de streaming asociadas a ese
número. El nombre de usuario no se envía a ningún servidor: solo se muestra y se
copia al portapapeles cuando el usuario lo pide. La Extensión no recopila el
contenido de los mensajes, ni el historial de navegación, ni datos de otras
pestañas.

**2. Almacenamiento local**
La configuración del usuario (URL del backend, clave de API, estado y posición del
panel, y los ajustes de los bots de Telegram) se guarda exclusivamente de forma
local en el navegador mediante `chrome.storage.local`. No se almacena en servidores
de terceros.

**3. Datos que introduce el propio usuario**
Cuando WhatsApp Web no muestra el número de un contacto (por ejemplo, contactos que
solo exponen un nombre de usuario), la Extensión permite al usuario escribirlo a
mano. Ese número se normaliza en el propio navegador y se guarda de forma local en
`chrome.storage.local`, asociado a ese chat, para no volver a pedirlo. No se
transmite a ningún servidor salvo, si el usuario lo solicita, al backend del
propietario para la misma consulta de cuentas descrita en el punto 1.

**4. Utilidades locales**
La Extensión incluye una utilidad para decodificar los códigos de recarga que el
proveedor del usuario entrega codificados en base64, y para normalizar números de
teléfono escritos a mano. Ambas se ejecutan íntegramente en el navegador del
usuario: esa información no se transmite a ningún servidor. El último código
decodificado se conserva de forma temporal en `chrome.storage.local`, con
caducidad automática, únicamente para que siga disponible al cambiar de pestaña.

**5. Integración con Telegram (opcional)**
Si el usuario habilita la función y pulsa "Pedir código", la Extensión abre o
enfoca Telegram Web (web.telegram.org), escribe en el chat del bot del proveedor el
correo de la cuenta seleccionada y lee la respuesta del bot para copiar el código de
verificación al portapapeles. Esta interacción ocurre dentro de la sesión de
Telegram del propio usuario; la Extensión no almacena ni transmite esas
conversaciones a terceros.

**6. Transmisión y compartición de datos**
El número de teléfono se transmite únicamente al backend del propietario para la
función descrita. Cuando el usuario pulsa "Ver código", se envía además el correo de
la cuenta de streaming al servicio de códigos del propietario
(codigos.elixircuentas.com), que responde con el código de verificación recibido en
el buzón del negocio; ese correo es un dato del propio negocio, no del cliente
final. No vendemos ni transferimos los datos del usuario a terceros, ni
los usamos para publicidad, marketing o evaluación de solvencia, ni para ningún fin
ajeno a la funcionalidad principal declarada.

**7. Permisos**
La Extensión solicita los permisos mínimos necesarios para su función: `activeTab`,
`scripting`, `clipboardWrite`, `storage` y `tabs`, además de acceso a los dominios
web.whatsapp.com, web.telegram.org y los backends del propietario
(elixircuentas.com y codigos.elixircuentas.com). No accede de forma
persistente ni invasiva a otras pestañas o ventanas.

**Contacto**
Para cualquier pregunta sobre esta política, escriba al correo de contacto técnico
publicado en la ficha de la Chrome Web Store.

---

## 6. Formulario de Privacidad — textos listos para pegar (v1.4.0)

> Frente a la v1.3.0 cambian el propósito único, la justificación del permiso de
> host (hay un dominio nuevo) y el punto 6 de la política. Las casillas de uso de
> datos y las tres certificaciones se quedan **igual**: no aparece ninguna categoría
> de datos nueva. **Actualiza primero el Google Doc** de la
> política con el texto de la sección 5 (el formulario certifica que coincide con la
> política publicada).

**Descripción de un solo propósito**
> Herramienta de productividad para soporte de cuentas de streaming. Desde WhatsApp Web identifica el contacto del chat actual (su número de teléfono y, si existe, su nombre de usuario) y muestra en un panel las cuentas asociadas a ese número, consultándolas en el backend del propietario mediante una clave de API. Permite copiar al portapapeles el número, el nombre de usuario o el correo, y escribir y normalizar un número a mano cuando WhatsApp no lo muestra, guardándolo localmente para ese chat. De forma opcional solicita códigos de verificación a los bots de los proveedores en Telegram Web y copia el código. Para las cuentas de Netflix obtiene el código de verificación consultando un servicio del propietario que lee el buzón del negocio, sin abrir Telegram. Incluye además una utilidad local que decodifica los códigos de recarga que el proveedor entrega codificados, sin enviarlos a ningún servidor. Todas las acciones las inicia el usuario.

**Justificación de activeTab**
> Se usa 'activeTab' para actuar sobre la pestaña actual cuando el usuario invoca la extensión (icono o atajo de teclado), leyendo la información necesaria en ese momento sin requerir acceso permanente a todas las pestañas, lo que protege la privacidad del navegador.

**Justificación de scripting**
> Se usa 'scripting' para inyectar bajo demanda los scripts que leen el número, el nombre o el nombre de usuario en el DOM de WhatsApp Web (numero-utils.js, overlay.js, copynumber.js, copyusername.js, copyname.js, content.js, buscarelixir.js) y para automatizar Telegram Web (telegram.js) al solicitar códigos. Sin esta inyección no es posible leer los selectores del DOM ni ejecutar la función.

**Justificación de clipboardWrite**
> Se usa 'clipboardWrite' para copiar al portapapeles del sistema el número extraído o el código de verificación, de modo que el usuario pueda pegarlo inmediatamente en sus programas.

**Justificación de storage**
> Se usa 'storage' (chrome.storage.local) para guardar localmente en el navegador la configuración del usuario: la URL del backend, la clave de API, el estado y la posición del panel, y los nombres de los bots de Telegram. También guarda los números de teléfono que el propio usuario escribe cuando WhatsApp no los muestra, asociados a su chat, para no volver a pedírselos. No se guarda en servidores de terceros.

**Justificación de tabs**
> Se usa 'tabs' para localizar, abrir o enfocar la pestaña de Telegram Web y enrutar la solicitud de código al bot del proveedor correcto, además de detectar cuándo terminó de cargar. No se inspecciona el contenido de pestañas ajenas a esta función.

**Justificación de Permiso de host**
> web.whatsapp.com: leer el número, el nombre y el nombre de usuario del chat visible, y mostrar el panel.
> codigos.elixircuentas.com: consultar el servicio del propietario que devuelve el código de verificación de Netflix asociado al correo de una cuenta del negocio. web.telegram.org: automatizar la solicitud de códigos de verificación a los bots de los proveedores. elixircuentas.com (y elixircuentas-test.fly.dev en pruebas): consultar la API del propietario que devuelve las cuentas asociadas al número. Cada host se declara explícitamente para limitar la acción de la extensión a esos dominios.

**¿Usas código remoto?** → No.

**Uso de datos (casillas a marcar):**
- ✅ Información de identificación personal — el número de teléfono del contacto (se envía al backend del propietario).
- ✅ Contenido de sitios web — se lee texto visible del DOM de WhatsApp Web.
- (No marcar las demás; no se recopilan mensajes, salud, finanzas, ubicación, etc.)

**Certificaciones:** marcar las tres (no vender/transferir a terceros, no usar para fines ajenos, no usar para solvencia).

**URL de política de privacidad:** la misma del Google Doc (tras actualizar su contenido con la sección 5).
