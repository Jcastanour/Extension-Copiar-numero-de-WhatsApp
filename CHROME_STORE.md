# Publicación en Chrome Web Store — v1.6.0

Documento de apoyo para subir la versión y completar el formulario de la tienda
(justificaciones de permisos, divulgación de datos y política de privacidad).

> ⚠️ **La v1.6.0 SÍ añade dos permisos de host**: `https://storetools.co/*` y
> `https://api.fastcodemanager.com/*`. Son los servicios de dos proveedores a los
> que, **si el usuario lo activa en Ajustes**, se pide el código de verificación
> directamente en vez de a través de su bot de Telegram. Los 5 permisos de API
> siguen siendo los mismos. Como en la 1.4.0, la revisión puede tardar más.
>
> **Dato nuevo que declarar**: a esos dos servicios se envía el **correo de la
> cuenta de streaming** (dato del negocio) y, a Storetools, el **ID de consulta**
> que el propio usuario escribe en Ajustes. Hay que actualizar el Google Doc de
> la política (sección 5) **antes** de enviar el formulario.
>
> El manifest del repo lleva `http://localhost/*` para poder probar contra el
> backend del propio equipo, pero **`empaquetar.sh` lo quita del zip** trabajando
> sobre una copia. No hay que editar nada a mano ni acordarse de revertirlo.

> **Qué trae la v1.6.0:**
>
> - Para cada proveedor se elige en Ajustes si el código se pide al bot de
>   Telegram (defecto) o directo a su endpoint: ProveedorYT (Storetools) y
>   Digital KH (FastCodeManager). Netflix sigue por el buzón propio.
> - Las cuentas de ProveedorYT ya van a su bot, no al de Wolf.
> - La barra del flotante se limpia al cambiar de chat.

<details>
<summary><b>Historial: qué pasó en la v1.5.0</b> (ya publicada, se conserva por contexto)</summary>

> ✅ **La v1.5.0 NO añade permisos.** Mismos 5 permisos y mismos 5 hosts que la
> 1.4.0, así que la declaración de datos del formulario no cambió.
>
> **Qué trae la v1.5.0:**
>
> - El clic en el flotante resuelve el chat y muestra la ficha del cliente: nombre,
>   secuencia D para Google Contacts, cuentas, correos y códigos.
> - Al minimizar, el flotante conserva el nombre y los D a la vista; el hover
>   despliega la ficha resumida.
> - **Copiar datos** (correo + contraseña de un pegado) y **Copiar número**.
> - La ✕ del panel **minimiza**; el flotante se apaga desde la pantalla principal
>   del popup, y apagado no deja nada corriendo en WhatsApp.
> - Forma del flotante configurable: burbuja o barra.

</details>

<details>
<summary><b>Historial: qué pasó en la v1.4.0</b> (ya publicada, se conserva por contexto)</summary>

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

</details>

---

## 1. Build

```bash
./empaquetar.sh
```

- Genera `dist/copiar-numero-whatsapp-<versión>.zip` con `manifest.json` en la raíz.
- Comprueba solo el archivo antes de terminar y **falla** si `localhost` se coló.
- No toca el `manifest.json` del repo: el desarrollo local sigue funcionando.

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
| `https://storetools.co/*` | (v1.6.0) Consultar el servicio del proveedor ProveedorYT que devuelve el correo con el código de verificación (`/api/consultar`), si el usuario elige "endpoint directo" en Ajustes. |
| `https://api.fastcodemanager.com/*` | (v1.6.0) Consultar el servicio del proveedor Digital KH que devuelve el código de verificación (`/enterprise/…/lookup`), si el usuario elige "endpoint directo" en Ajustes. |
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

> **Novedad de la v1.5.0 que conviene mirar antes de certificar.** El botón
> *Copiar datos* copia al portapapeles el correo **y la contraseña** de la cuenta
> del proveedor, que ahora llegan desde el backend propio.
>
> Son credenciales **del negocio**, no del usuario de la extensión ni de terceros:
> viajan del servidor del propietario a sus propios trabajadores, y no se recogen
> del navegador de nadie. Por eso la lectura razonable es que **no** activa la
> categoría *Authentication information* del formulario, que trata sobre datos
> recogidos **del usuario**. Aun así, la certificación la firmas tú: decídelo con
> este dato delante en vez de heredar la declaración anterior sin mirar.

---

## 5. Política de Privacidad (texto actualizado — reemplaza el anterior)

> Pegar tal cual en el Google Doc de la política. Frente a la v1.5.0 cambian: la
> fecha, el punto 2 (ajustes nuevos: modo por proveedor e ID de consulta), el
> punto 5 (el bot de Storetools pide plataforma e ID), el punto 6 (los dos
> servicios nuevos) y el punto 7 (los dos hosts nuevos).

**Política de Privacidad — Extensión "Copiar número de WhatsApp"**
Última actualización: 2 de noviembre de 2026

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
panel, los ajustes de los bots de Telegram, el modo elegido para cada proveedor
—bot de Telegram o consulta directa a su servicio— y el identificador de consulta
del servicio Storetools que el propio usuario escribe) se guarda exclusivamente de
forma local en el navegador mediante `chrome.storage.local`. No se almacena en
servidores de terceros.

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
verificación al portapapeles. Con el bot del proveedor Storetools, además, elige la
plataforma en el menú del bot y, si el bot lo pide, escribe el identificador de
consulta guardado en Ajustes. Esta interacción ocurre dentro de la sesión de
Telegram del propio usuario; la Extensión no almacena ni transmite esas
conversaciones a terceros.

**6. Transmisión y compartición de datos**
El número de teléfono se transmite únicamente al backend del propietario para la
función descrita. Cuando el usuario pulsa "Ver código", se envía además el correo de
la cuenta de streaming al servicio de códigos del propietario
(codigos.elixircuentas.com), que responde con el código de verificación recibido en
el buzón del negocio; ese correo es un dato del propio negocio, no del cliente
final. Si el usuario activa en Ajustes el "endpoint directo" de un proveedor, ese
mismo correo de la cuenta se envía al servicio de dicho proveedor (storetools.co o
api.fastcodemanager.com), junto con el identificador de consulta que el propio
usuario haya escrito en Ajustes, y el servicio responde con el código de
verificación. No vendemos ni transferimos los datos del usuario a terceros, ni
los usamos para publicidad, marketing o evaluación de solvencia, ni para ningún fin
ajeno a la funcionalidad principal declarada.

**7. Permisos**
La Extensión solicita los permisos mínimos necesarios para su función: `activeTab`,
`scripting`, `clipboardWrite`, `storage` y `tabs`, además de acceso a los dominios
web.whatsapp.com, web.telegram.org, los backends del propietario
(elixircuentas.com y codigos.elixircuentas.com) y los servicios de códigos de dos
proveedores (storetools.co y api.fastcodemanager.com). No accede de forma
persistente ni invasiva a otras pestañas o ventanas.

**Contacto**
Para cualquier pregunta sobre esta política, escriba al correo de contacto técnico
publicado en la ficha de la Chrome Web Store.

---

## 6. Formulario de Privacidad — textos listos para pegar (máx. 1000 caracteres por campo)

> **Para la v1.6.0 sí hay que tocar el formulario**: dos hosts nuevos
> (`storetools.co` y `api.fastcodemanager.com`). Las casillas de uso de datos y
> las tres certificaciones siguen valiendo; cambian la justificación de host y la
> política. **Actualiza primero el Google Doc** de la política con el texto de la
> sección 5, porque el formulario certifica que coincide con la política publicada.

**Descripción de un solo propósito**
> Herramienta de productividad para soporte de cuentas de streaming. Desde WhatsApp Web identifica el contacto del chat actual y muestra en un panel sus cuentas, consultándolas en el backend del propietario con una clave de API. Permite copiar el número, el nombre de usuario o el correo, y escribir un número a mano cuando WhatsApp no lo muestra. Obtiene códigos de verificación de las cuentas: de los bots de los proveedores en Telegram Web, del servicio propio para Netflix o, si el usuario lo activa en Ajustes, del servicio de códigos del proveedor (Storetools y Digital KH). Incluye una utilidad local que decodifica códigos de recarga sin enviarlos a ningún servidor. Todas las acciones las inicia el usuario.

**Justificación de activeTab**
> Se usa 'activeTab' para actuar sobre la pestaña actual cuando el usuario invoca la extensión (icono o atajo de teclado), leyendo la información necesaria en ese momento sin requerir acceso permanente a todas las pestañas, lo que protege la privacidad del navegador.

**Justificación de scripting**
> Se usa 'scripting' para inyectar bajo demanda los scripts que leen el número, el nombre o el nombre de usuario en el DOM de WhatsApp Web (numero-utils.js, overlay.js, copynumber.js, copyusername.js, copyname.js, content.js, buscarelixir.js) y para automatizar Telegram Web (telegram.js) al solicitar códigos. Sin esta inyección no es posible leer los selectores del DOM ni ejecutar la función.

**Justificación de clipboardWrite**
> Se usa 'clipboardWrite' para copiar al portapapeles del sistema el número extraído o el código de verificación, de modo que el usuario pueda pegarlo inmediatamente en sus programas.

**Justificación de storage**
> Se usa 'storage' (chrome.storage.local) para guardar localmente la configuración del usuario: URL del backend, clave de API, estado y posición del panel, nombres de los bots de Telegram, el modo elegido para pedir el código a cada proveedor y el identificador de consulta de Storetools que el usuario escribe. También guarda los números que el usuario teclea cuando WhatsApp no los muestra, para no volver a pedírselos. Nada de esto se guarda en servidores de terceros.

**Justificación de tabs**
> Se usa 'tabs' para localizar, abrir o enfocar la pestaña de Telegram Web y enrutar la solicitud de código al bot del proveedor correcto, además de detectar cuándo terminó de cargar. No se inspecciona el contenido de pestañas ajenas a esta función.

**Justificación de Permiso de host**
> web.whatsapp.com: leer el número, el nombre y el usuario del chat visible, y mostrar el panel. web.telegram.org: automatizar la solicitud de códigos a los bots de los proveedores. elixircuentas.com (y elixircuentas-test.fly.dev en pruebas): consultar la API del propietario con las cuentas asociadas al número. codigos.elixircuentas.com: obtener del servicio del propietario el código de verificación de Netflix de una cuenta del negocio. storetools.co y api.fastcodemanager.com: solo si el usuario lo activa en Ajustes, obtener del servicio del proveedor el código de verificación de una cuenta del negocio, en lugar de pedirlo a su bot. Cada host se declara para limitar la extensión a esos dominios.

**¿Usas código remoto?** → No.

**Uso de datos (casillas a marcar):**
- ✅ Información de identificación personal — el número de teléfono del contacto (se envía al backend del propietario).
- ✅ Contenido de sitios web — se lee texto visible del DOM de WhatsApp Web.
- (No marcar las demás; no se recopilan mensajes, salud, finanzas, ubicación, etc.)

**Certificaciones:** marcar las tres (no vender/transferir a terceros, no usar para fines ajenos, no usar para solvencia).

**URL de política de privacidad:** la misma del Google Doc (tras actualizar su contenido con la sección 5).

---

## 7. Descripción de la tienda (v1.6.0) — para pegar en el listing

**Nombre**
> Elixir Cuentas — panel de clientes en WhatsApp

**Descripción breve** (132 caracteres máx.)
> Muestra sobre el chat de WhatsApp quién es el cliente, sus días de cobro y sus cuentas de streaming.

**Descripción detallada**
> Herramienta interna para el equipo de Elixir Cuentas.
>
En una conversación de WhatsApp Web, un clic en el botón flotante identifica al contacto y muestra su ficha: nombre, secuencia de días de cobro, cuentas activas con vencimiento y precio, y avisos de garantía o notas importantes.
>
Con un clic se copia el número, el correo de la cuenta, o el correo y la contraseña juntos. Para Netflix obtiene el código de verificación al instante. Para los demás proveedores lo pide a su bot de Telegram o, si se elige en Ajustes para cada proveedor, directamente a su servicio de códigos.
>
El botón se coloca donde convenga, se minimiza y se apaga desde el popup.
>
Requiere una cuenta y una clave de API de Elixir Cuentas: sin ellas no consulta nada.
