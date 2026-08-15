# Sistema de Pedidos - Comedor Origen (multisucursal)

### Guía de implementación paso a paso (mismo patrón que tus otros proyectos: Apps Script + Sheets)

Este sistema usa **Google Sheets como base de datos** y **Google Apps Script como backend**, sin costo de hosting. Tiene dos partes:

1. **API pública** — recibe los pedidos desde `productos.html` / `index.html` y los guarda en una hoja de cálculo.
2. **Panel administrativo** (`Admin.html`) — CRM privado con login, dashboard, listado de pedidos, agendado manual, directorio de clientes (separado por sucursal), PDF y respaldos.

Este proyecto tiene **2 sucursales de ejemplo** (Centro Histórico y Reforma) con **menús independientes**. El cliente elige su sucursal antes de ver el menú, y esa elección viaja con el carrito y con cada pedido.

---

## ANTES DE EMPEZAR — datos que debes reemplazar

Todo el contenido de este proyecto es de plantilla. Antes de desplegar, reemplaza:

| Dato | Dónde |
|---|---|
| Nombre del restaurante | `constants.js` → `CONFIG.restaurantName` / `CONFIG.business.name`, y el texto "Comedor Origen" en `index.html`, `productos.html`, `Admin.html` (título y sidebar) |
| Sucursales (nombre, dirección, teléfono, horario) | `constants.js` → `CONFIG.sucursales` **y** `Code.gs` → `SUCURSALES` (deben tener el mismo `id` y `nombre` en ambos lados) |
| Menú y precios por sucursal | `catalog.js` → `MENU_BY_SUCURSAL` y `CATEGORIES_BY_SUCURSAL` |
| Correo de notificación de pedidos | `Code.gs` → función `handleCrearPedido()`, busca `juanposicionsatelital@gmail.com` |
| Redes sociales | `constants.js` → `CONFIG.business.socials` |

> Si agregas o quitas una sucursal, solo necesitas: (1) agregarla a `CONFIG.sucursales` en `constants.js`, (2) agregarla a `SUCURSALES` en `Code.gs`, y (3) agregar su bloque de menú en `catalog.js`. La sección "Sucursales" de `index.html` y el selector inicial se actualizan solos porque se arman por código a partir de esa lista.

---

## PASO 1 — Crear la hoja de cálculo

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja nueva.
2. Nómbrala, por ejemplo: **"Comedor Origen - CRM Pedidos"**.
3. No necesitas crear las pestañas **Pedidos**, **Usuarios** ni **Visitas** a mano: el código las crea automáticamente cuando se ejecutan las funciones correspondientes (`getSheet()`, `getUsersSheet_()`, `getVisitasSheet_()`).

---

## PASO 2 — Crear el proyecto de Apps Script

1. En la hoja, ve a **Extensiones → Apps Script**.
2. Esto crea un proyecto de Apps Script **vinculado a esta hoja específica**. Es importante que sea así, porque `getSheet()` utiliza `SpreadsheetApp.getActiveSpreadsheet()` y no un ID fijo.
3. Borra el contenido de `Código.gs` y pega **todo** el contenido de `Code.gs` (el archivo que te entregué).
4. En el menú lateral de archivos, crea un archivo HTML nuevo llamado exactamente **`Admin`** (Apps Script le pondrá la extensión `.html` automáticamente) y pega el contenido de `Admin.html`.
5. Guarda el proyecto (ícono de disquete). Nómbralo, por ejemplo: **"Comedor Origen - Backend"**.

---

## PASO 3 — Inicializar y probar el backend

Antes de crear los despliegues, ejecuta las funciones de prueba para comprobar que el proyecto está correctamente conectado a la hoja y que se creen las estructuras necesarias.

1. En el selector de funciones, arriba, junto al botón **▷ Ejecutar**, busca `testConnection`.
2. Selecciona `testConnection` y dale **Ejecutar**.
3. La primera vez Google te pedirá autorizar los permisos del proyecto. Autorízalos con la cuenta que administra la hoja.
4. Revisa el **Registro de ejecución** para confirmar que la prueba terminó correctamente.
5. Después, en el selector de funciones, busca `handleRegistrarVisita`.
6. Selecciona `handleRegistrarVisita` y dale **Ejecutar**.
7. Revisa nuevamente el **Registro de ejecución** y confirma que la función terminó correctamente.
8. Abre la hoja de cálculo y verifica que se hayan creado las pestañas necesarias, incluyendo **Visitas** (con su columna **Sucursal**). Las demás pestañas se crean automáticamente conforme las funciones del backend las necesiten.

> **Importante:** ejecuta `testConnection()` y `handleRegistrarVisita()` antes de continuar con los despliegues.

---

## PASO 4 — Crear tu primer usuario administrador

1. Abre la función `crearPrimerAdmin()` en el código.
2. Edita estas tres líneas con tus datos reales:

   ```js
   const nombre = 'Comedor Origen';
   const email = 'tu-correo-real@gmail.com';
   const passwordPlano = 'unaContraseñaSegura123';
   ```
3. Selecciona `crearPrimerAdmin` en el menú de funciones y dale **Ejecutar**.
4. Esta función solo se puede correr **una vez** (queda protegida). Si necesitas correrla de nuevo, primero ejecuta `resetearSetup()`.
5. Revisa el **Registro de ejecución** para confirmar que el usuario fue creado correctamente.
6. Después de crear usuarios adicionales, hazlo desde el panel (no desde aquí). El panel funciona igual para todas las sucursales: un mismo usuario ve y filtra por cualquier sucursal.

---

## PASO 5 — Primer despliegue: API pública

1. Arriba a la derecha, clic en **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Configuración:

   * **Ejecutar como:** Yo (tu cuenta)
   * **Quién tiene acceso:** Cualquier usuario
4. Clic en **Implementar** y autoriza los permisos que pida Google.
5. Copia la **URL de la aplicación web** que te da — termina en `/exec`. Esa es tu **URL pública de la API**.

---

## PASO 6 — Segundo despliegue: Panel administrativo

Vas a crear una **segunda implementación**, con otra URL, dedicada solo al panel.

1. Clic otra vez en **Implementar → Nueva implementación**.
2. Tipo: **Aplicación web**.
3. Configuración:

   * **Ejecutar como:** Yo (tu cuenta)
   * **Quién tiene acceso:** Cualquier usuario
4. Implementar y copiar esta **segunda URL** — esta es tu **URL del panel admin**.

---

## PASO 7 — Vincular la URL del panel admin

1. En el editor de Apps Script, abre la función `configurarUrlAdmin()`.
2. Reemplaza `'PEGA_AQUI_LA_URL_DE_TU_DEPLOYMENT_ADMIN'` con la **URL del panel** que copiaste en el Paso 6.
3. Selecciónala `configurarUrlAdmin` en el menú desplegable de funciones (arriba) y dale **Ejecutar**.
4. Revisa el registro (Ver → Registro) — debe decir **"URL del panel administrativo configurada"**.

---

## PASO 8 — Activar el respaldo semanal automático (opcional pero recomendado)

1. Selecciona la función `instalarTriggerRespaldoSemanal` en el menú de funciones.
2. Dale **Ejecutar** una sola vez.
3. Esto crea un disparador que corre cada **lunes ~2:00 AM** y guarda un `.xlsx` con la hoja de Pedidos (incluye la columna Sucursal) en una carpeta de Drive llamada **"Respaldos CRM - Pedidos Comedor Origen"**.
4. Confirma en **Triggers / Disparadores** que el disparador quedó creado correctamente.

---

## PASO 9 — Conectar el sitio público al backend

1. Abre `constants.js`.
2. Reemplaza:

   ```js
   API_URL: 'PEGA_AQUI_LA_URL_DE_TU_DEPLOYMENT_PUBLICO',
   ```

   con la **URL pública del Paso 5**.
3. Confirma que `CONFIG.sucursales` en `constants.js` tenga exactamente los mismos `id` que `SUCURSALES` en `Code.gs`.
4. Sube todos estos archivos a tu hosting:

   * `constants.js`, `catalog.js`, `sucursal.js`, `api.js`, `app.js`, `productos.js`
   * `index.html`, `productos.html`, `styles.css`

---

## PASO 10 — Probar todo el flujo

1. Abre tu sitio público. Debe aparecer el selector de sucursal antes del menú.
2. Elige una sucursal y verifica que se registre una visita (con esa sucursal) en la pestaña **Visitas**.
3. Agrega platillos al carrito, cambia de sucursal desde la pastilla del navbar y confirma que el carrito de la otra sucursal es independiente.
4. Completa el formulario de pedido y envíalo.
5. Deberías ver:

   * Un mensaje de confirmación en el sitio.
   * Un correo de notificación con la sucursal indicada en el asunto.
6. Abre la **URL del panel admin** (Paso 6) e inicia sesión.
7. Ve a **Pedidos**, filtra por sucursal y verifica que el pedido aparezca.
8. Ve a **Dashboard**, cambia el filtro de sucursal y confirma que las cifras cambian.
9. Ve a **Clientes**, filtra por sucursal y confirma que un mismo teléfono en dos sucursales aparece como dos clientes distintos.
10. Desde **Agendar Pedido**, registra un pedido manual eligiendo sucursal.
11. Prueba **exportar el PDF de un pedido** (debe mostrar la sucursal) y **forzar un respaldo manual**.

---

## Resumen de las pestañas del panel

| Pestaña | Qué hace |
|---|---|
| **Dashboard** | Totales, ventas, entregas de hoy, desglose por sucursal, por estatus y por modalidad, respaldo manual |
| **Pedidos** | Lista filtrable (por sucursal, estatus, fecha, búsqueda), ver detalle, cambiar estatus, exportar comprobante a PDF |
| **Agendar Pedido** | Registrar un pedido tomado por teléfono/en tienda, eligiendo sucursal, con productos y total capturados a mano |
| **Clientes** | Directorio derivado del historial de pedidos, **separado por sucursal** (mismo teléfono en dos sucursales = dos registros) |

Además, el backend utiliza la pestaña **Visitas** (con columna Sucursal) para registrar las visitas del sitio público y **Usuarios** para gestionar los usuarios del panel.

## Notas importantes

* **Nunca compartas la URL del panel admin públicamente.**
* Los **Puntos Origen** se calculan automáticamente ($100 MXN = 1 punto), igual en pedidos del sitio que en los agendados manualmente.
* Si cambias el menú (`catalog.js`), no hace falta tocar el backend: los pedidos guardan el nombre/precio tal como estaban al momento de la compra.
* El correo de notificación se envía desde tu cuenta de Google (la que creó el script), sin configuración adicional de SMTP.
* **`testConnection()` y `handleRegistrarVisita()` deben ejecutarse durante la configuración inicial, antes de realizar los despliegues.**
