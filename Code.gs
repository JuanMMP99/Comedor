/**
 * CRM de Pedidos - Comedor Origen (multisucursal)
 * Sistema de gestión de pedidos con Google Sheets
 */

const SHEET_NAME = "Pedidos";

// Sucursales válidas del restaurante. Debe reflejar CONFIG.sucursales del
// frontend (constants.js) — el "nombre" es lo que se guarda en cada pedido.
const SUCURSALES = [
  { id: "centro", nombre: "Centro Histórico" },
  { id: "reforma", nombre: "Reforma" },
];

// Límites de longitud para evitar abuso desde el formulario público
const FIELD_LIMITS = {
  cliente: 100,
  telefono: 20,
  sucursal: 100,
  direccion: 300,
  referencias: 300,
  destinatario: 100,
  telefonoDestinatario: 20,
  dedicatoria: 500,
  productos: 2000,
};

// Ventana de tiempo (minutos) para bloquear solicitudes duplicadas del mismo teléfono
const RATE_LIMIT_MINUTES = 5;

/* ==========================================================================
   MÓDULO DE ADMINISTRACIÓN (PANEL PRIVADO)
   ========================================================================== */
const USERS_SHEET_NAME = "Usuarios";
const SESSION_DURATION_SECONDS = 21600; // 6 horas (máximo permitido por CacheService)
const ESTADOS_VALIDOS = [
  "Pendiente",
  "Confirmado",
  "En preparación",
  "En camino",
  "Entregado",
  "Cancelado",
];

// Datos de marca para el comprobante en PDF (espejo de CONFIG.business en constants.js)
const BRAND_NAME = "Comedor Origen";
const BRAND_PHONE = "52 951 100 2233";

// Respaldo semanal de la hoja de Pedidos
const BACKUP_FOLDER_NAME = "Respaldos CRM - Pedidos Comedor Origen";
const MAX_BACKUPS_TO_KEEP = 12; // ~3 meses de respaldos semanales

/**
 * Sanea un valor antes de escribirlo en la hoja:
 * - Convierte a texto y recorta espacios
 * - Antepone un apóstrofe si el valor empieza con =, +, -, @ para evitar
 *   inyección de fórmulas (CSV/formula injection) al abrir la hoja en Excel/Sheets
 * - Trunca a una longitud máxima
 */
function sanitizeForSheet(value, maxLength) {
  if (value === null || value === undefined) return "";
  let str = String(value).trim();
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str;
  }
  if (maxLength && str.length > maxLength) {
    str = str.substring(0, maxLength);
  }
  return str;
}

/**
 * Valida que un teléfono tenga entre 10 y 15 dígitos (solo números)
 */
function isValidPhone(telefono) {
  const digits = String(telefono || "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Revisa si ya existe una solicitud reciente del mismo teléfono
 * (protección básica anti-spam / doble envío accidental)
 */
function hasRecentDuplicateRequest(telefono) {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const digits = String(telefono || "").replace(/\D/g, "");
  const cutoff = new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000);

  for (let i = values.length - 1; i >= 1; i--) {
    const rowPhoneDigits = String(values[i][1] || "").replace(/\D/g, "");
    const rowTimestamp = values[i][15];
    if (rowPhoneDigits && rowPhoneDigits === digits && rowTimestamp) {
      const ts = new Date(rowTimestamp);
      if (!isNaN(ts.getTime()) && ts > cutoff) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Normaliza cualquier valor de fecha al formato YYYY-MM-DD
 */
function normalizeDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  const str = String(val).trim();
  if (str.includes("T")) {
    return str.split("T")[0];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return str;
}

/**
 * Normaliza cualquier valor de hora al formato HH:mm (ej: "9:00" -> "09:00")
 */
function normalizeTime(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "HH:mm");
  }
  let str = String(val).trim();
  const parts = str.split(":");
  if (parts.length >= 2) {
    let h = parts[0].padStart(2, "0");
    let m = parts[1].padStart(2, "0");
    return `${h}:${m}`;
  }
  return str;
}

/**
 * Maneja las solicitudes GET
 */
function doGet(e) {
  try {
    // Esta implementación (deployment) puede estar dedicada exclusivamente al panel
    // administrativo. Si la URL desde la que se ejecuta coincide con la URL guardada
    // como "implementación de administración", siempre se sirve el panel — sin
    // importar qué parámetros traiga la petición. Cualquier otra implementación
    // (por ejemplo la pública, usada por el formulario de pedidos) NUNCA sirve el
    // panel, así conozcan o no el parámetro "?page=admin".
    const adminDeploymentUrl =
      PropertiesService.getScriptProperties().getProperty(
        "ADMIN_DEPLOYMENT_URL",
      );
    const currentUrl = ScriptApp.getService().getUrl();

    if (adminDeploymentUrl && currentUrl === adminDeploymentUrl) {
      return HtmlService.createHtmlOutputFromFile("Admin")
        .setTitle("Panel Administrativo - Comedor Origen")
        .addMetaTag("viewport", "width=device-width, initial-scale=1")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    if (!e || !e.parameter) {
      return buildResponse(
        {
          error: "Solicitud inválida. Se requieren parámetros.",
          help: "Usa ?action=testConnection",
        },
        false,
      );
    }

    const action = e.parameter.action;

    if (!action) {
      return buildResponse(
        {
          message: "API de Pedidos funcionando correctamente",
          actions: ["testConnection"],
        },
        true,
      );
    }

    switch (action) {
      case "testConnection":
        return buildResponse({ message: "Conexión exitosa" }, true);
      default:
        return buildResponse(
          {
            error: "Acción no válida",
            actions: ["testConnection"],
          },
          false,
        );
    }
  } catch (error) {
    console.error("Error en doGet:", error);
    return buildResponse(
      {
        error: error.toString(),
        stack: error.stack,
      },
      false,
    );
  }
}

/**
 * Crea un nuevo pedido y envía notificación por correo electrónico
 */
function handleCrearPedido(data) {
  const required = [
    "cliente",
    "telefono",
    "sucursal",
    "tipoEntrega",
    "metodoPago",
    "fechaEntrega",
    "horaEntrega",
    "productos",
    "total",
  ];
  const missing = required.filter(
    (field) =>
      data[field] === undefined || data[field] === null || data[field] === "",
  );

  if (missing.length > 0) {
    return buildResponse(
      {
        error: "Faltan campos requeridos",
        missing: missing,
        required: required,
      },
      false,
    );
  }

  // Sanear y truncar cada campo antes de usarlo
  const cliente = sanitizeForSheet(data.cliente, FIELD_LIMITS.cliente);
  const telefono = sanitizeForSheet(data.telefono, FIELD_LIMITS.telefono);
  const sucursal = sanitizeForSheet(data.sucursal, FIELD_LIMITS.sucursal);
  const tipoEntrega = data.tipoEntrega === "tienda" ? "tienda" : "envio";
  const direccion = sanitizeForSheet(data.direccion, FIELD_LIMITS.direccion);
  const referencias = sanitizeForSheet(
    data.referencias,
    FIELD_LIMITS.referencias,
  );
  const destinatario = sanitizeForSheet(
    data.destinatario,
    FIELD_LIMITS.destinatario,
  );
  const telefonoDestinatario = sanitizeForSheet(
    data.telefonoDestinatario,
    FIELD_LIMITS.telefonoDestinatario,
  );
  const metodoPago = sanitizeForSheet(data.metodoPago, 50);
  const dedicatoria = sanitizeForSheet(
    data.dedicatoria,
    FIELD_LIMITS.dedicatoria,
  );
  const estado = "Pendiente";
  const fecha = data.fechaEntrega;
  const hora = data.horaEntrega;

  if (!isValidPhone(telefono)) {
    return buildResponse(
      { error: "El teléfono debe tener entre 10 y 15 dígitos" },
      false,
    );
  }

  if (
    tipoEntrega === "envio" &&
    (!direccion || !destinatario || !telefonoDestinatario)
  ) {
    return buildResponse(
      {
        error:
          "Para envío a domicilio se requieren destinatario, teléfono del destinatario y dirección",
      },
      false,
    );
  }

  const fechaNorm = normalizeDate(fecha);
  const horaNorm = normalizeTime(hora);

  // Protección anti-spam
  if (hasRecentDuplicateRequest(telefono)) {
    return buildResponse(
      {
        error:
          "Ya recibimos un pedido reciente con este teléfono. Espera unos minutos antes de intentar de nuevo.",
      },
      false,
    );
  }

  // Los productos llegan como array [{id, name, price, quantity}]; los guardamos como JSON
  let productosArr = [];
  try {
    productosArr = Array.isArray(data.productos)
      ? data.productos
      : JSON.parse(data.productos);
  } catch (err) {
    return buildResponse({ error: "Formato de productos inválido" }, false);
  }
  if (!productosArr || productosArr.length === 0) {
    return buildResponse(
      { error: "El pedido debe incluir al menos un producto" },
      false,
    );
  }
  const productosJson = sanitizeForSheet(
    JSON.stringify(productosArr),
    FIELD_LIMITS.productos,
  );

  const total = Number(data.total) || 0;
  const puntos = Math.floor(total / 100);

  // Guardar pedido en la hoja
  const sheet = getSheet();
  const nextRow = sheet.getLastRow() + 1;

  const rowData = [
    cliente,
    "'" + telefono,
    tipoEntrega,
    direccion,
    referencias,
    destinatario,
    "'" + telefonoDestinatario,
    metodoPago,
    fechaNorm,
    horaNorm,
    dedicatoria,
    productosJson,
    total,
    puntos,
    estado,
    new Date().toISOString(),
    Utilities.getUuid(),
    sucursal, // Columna 18 — agregada al final para no romper índices existentes
  ];

  sheet.getRange(nextRow, 1, 1, rowData.length).setValues([rowData]);

  // =========================================================================
  // 📧 ENVÍO DE NOTIFICACIÓN POR CORREO
  // =========================================================================
  try {
    const emailDestino = "juanposicionsatelital@gmail.com"; // 👈 Reemplaza por tu dirección de correo
    const asunto = `🌽 Nuevo Pedido [${sucursal}]: ${cliente} - ${fechaNorm}`;

    const listaProductos = productosArr
      .map((p) => `${p.quantity}x ${p.name} ($${p.price * p.quantity} MXN)`)
      .join("<br>");

    const htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px;">
                <h2 style="color: #2c3e50; border-bottom: 2px solid #c23b68; padding-bottom: 8px;">Nuevo Pedido Recibido</h2>
                <p>Se ha recibido un nuevo pedido desde el sitio web con los siguientes detalles:</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Sucursal:</td><td style="padding: 8px;"><strong>${sucursal}</strong></td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Cliente:</td><td style="padding: 8px;">${cliente}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Teléfono:</td><td style="padding: 8px;">${telefono}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Modalidad:</td><td style="padding: 8px;">${tipoEntrega === "envio" ? "Envío a Domicilio" : "Recoger en Tienda"}</td></tr>
                    ${
                      tipoEntrega === "envio"
                        ? `
                    <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Destinatario:</td><td style="padding: 8px;">${destinatario} (${telefonoDestinatario})</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Dirección:</td><td style="padding: 8px;">${direccion}${referencias ? " — " + referencias : ""}</td></tr>
                    `
                        : ""
                    }
                    <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Método de Pago:</td><td style="padding: 8px;">${metodoPago}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Fecha de Entrega:</td><td style="padding: 8px;">${fechaNorm} a las ${horaNorm} hrs</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Productos:</td><td style="padding: 8px;">${listaProductos}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Total:</td><td style="padding: 8px;"><strong>$${total.toLocaleString()} MXN</strong> (+${puntos} Puntos Origen)</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Dedicatoria:</td><td style="padding: 8px;">${dedicatoria || "—"}</td></tr>
                    <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Estatus:</td><td style="padding: 8px;"><span style="background-color: #ffeaa7; padding: 3px 8px; border-radius: 4px; font-weight: bold;">${estado}</span></td></tr>
                </table>
            </div>
        `;

    MailApp.sendEmail({
      to: emailDestino,
      subject: asunto,
      htmlBody: htmlBody,
    });
  } catch (e) {
    console.error("Error al enviar la notificación por correo:", e);
  }
  // =========================================================================

  return buildResponse(
    {
      success: true,
      message: "Pedido registrado correctamente",
      data: {
        cliente,
        telefono,
        sucursal,
        tipoEntrega,
        fecha: fechaNorm,
        hora: horaNorm,
        total,
        puntos,
        estado,
      },
    },
    true,
  );
}

/**
 * Obtiene o crea la hoja de pedidos
 */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    const headers = [
      "Cliente",
      "Teléfono",
      "TipoEntrega",
      "Dirección",
      "Referencias",
      "Destinatario",
      "TelefonoDestinatario",
      "MetodoPago",
      "FechaEntrega",
      "HoraEntrega",
      "Dedicatoria",
      "Productos",
      "Total",
      "Puntos",
      "Estado",
      "Timestamp",
      "UUID",
      "Sucursal",
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Construye la respuesta JSON
 */
function buildResponse(data, success = true) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: success ? "success" : "error",
      data: data,
    }),
  ).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Función de prueba para verificar la conexión
 */
function testConnection() {
  try {
    const sheet = getSheet();
    const lastRow = sheet.getLastRow();

    Logger.log("✅ Conexión exitosa a la hoja de cálculo");
    Logger.log(`📊 Pedidos registrados: ${lastRow - 1}`);

    return buildResponse(
      {
        message: "Conexión exitosa",
        pedidosRegistrados: lastRow - 1,
        sheetName: SHEET_NAME,
      },
      true,
    );
  } catch (error) {
    Logger.log("❌ Error:", error);
    return buildResponse(
      {
        error: error.toString(),
      },
      false,
    );
  }
}

/**
 * Obtiene URL de pruebas
 */
function getTestUrl() {
  const url = ScriptApp.getService().getUrl();
  return url + "?action=testConnection";
}

/**
 * Configura cuál URL de despliegue (deployment) queda dedicada al panel administrativo.
 * Ejecútala UNA VEZ manualmente desde el editor, después de crear la segunda implementación,
 * pegando su URL completa dentro de la función antes de correrla.
 */
function configurarUrlAdmin() {
  // 🔧 EDITA ESTE VALOR ANTES DE EJECUTAR: pega aquí la URL de tu implementación
  // dedicada al panel (la segunda que crees, distinta de la de la API pública).
  const urlDelPanelAdmin =
    "https://script.google.com/macros/s/AKfycbycQWpXcPFtenv2bhhLCiEG1OIK8c-tfAWkbl8PVPtlFd2s4OJVNzkFDxnRtfJUbG-E/exec";

  PropertiesService.getScriptProperties().setProperty(
    "ADMIN_DEPLOYMENT_URL",
    urlDelPanelAdmin.trim(),
  );
  Logger.log(
    "✅ URL del panel administrativo configurada: " + urlDelPanelAdmin.trim(),
  );
}

/* ==========================================================================
   AUTENTICACIÓN Y SESIONES DEL PANEL ADMINISTRATIVO
   ========================================================================== */

/**
 * Obtiene (o crea) la hoja oculta de usuarios administrativos.
 * Nunca se expone vía la API pública; solo se usa dentro de este módulo.
 */
function getUsersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(USERS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(USERS_SHEET_NAME);
    const headers = [
      "Nombre",
      "Email",
      "PasswordHash",
      "Salt",
      "Rol",
      "Activo",
      "FechaCreacion",
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }

  return sheet;
}

function generarSalt_() {
  return Utilities.getUuid();
}

function hashPassword_(password, salt) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(password) + String(salt),
    Utilities.Charset.UTF_8,
  );
  return Utilities.base64Encode(raw);
}

function findUserByEmail_(email) {
  const sheet = getUsersSheet_();
  const values = sheet.getDataRange().getValues();
  const target = String(email || "")
    .trim()
    .toLowerCase();

  for (let i = 1; i < values.length; i++) {
    const rowEmail = String(values[i][1] || "")
      .trim()
      .toLowerCase();
    if (rowEmail && rowEmail === target) {
      return {
        rowIndex: i + 1,
        nombre: values[i][0],
        email: values[i][1],
        passwordHash: values[i][2],
        salt: values[i][3],
        rol: values[i][4],
        activo: values[i][5] === true || values[i][5] === "TRUE",
      };
    }
  }
  return null;
}

function crearOActualizarUsuario_(nombre, email, passwordPlano, rol, activo) {
  const sheet = getUsersSheet_();
  const salt = generarSalt_();
  const hash = hashPassword_(passwordPlano, salt);
  const existente = findUserByEmail_(email);

  if (existente) {
    sheet
      .getRange(existente.rowIndex, 1, 1, 6)
      .setValues([[nombre, email, hash, salt, rol, activo]]);
  } else {
    sheet.appendRow([
      nombre,
      email,
      hash,
      salt,
      rol,
      activo,
      new Date().toISOString(),
    ]);
  }
}

/**
 * Configuración inicial: crea el primer usuario administrador.
 * Solo funciona UNA vez (protegido por una bandera en Propiedades del Script).
 * Ejecútala manualmente desde el editor de Apps Script (menú Ejecutar > crearPrimerAdmin),
 * después de escribir el nombre, correo y contraseña reales aquí abajo.
 */
function crearPrimerAdmin() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("SETUP_COMPLETE") === "true") {
    throw new Error(
      "La configuración inicial ya se completó. Usa el panel para crear más usuarios.",
    );
  }

  // 🔧 EDITA ESTOS TRES VALORES ANTES DE EJECUTAR:
  const nombre = "Comedor Origen";
  const email = "usuario@gmail.com";
  const passwordPlano = "usuario";

  crearOActualizarUsuario_(nombre, email, passwordPlano, "admin", true);
  props.setProperty("SETUP_COMPLETE", "true");
  Logger.log(
    "Usuario administrador creado: " +
      email +
      " — ¡cambia la contraseña por defecto desde el panel!",
  );
}

/**
 * Crea o actualiza usuarios adicionales del panel. Requiere sesión de un admin existente.
 */
function crearUsuarioAdmin(token, nombre, email, passwordPlano, rol) {
  const session = validateToken_(token);
  if (session.rol !== "admin") {
    throw new Error("No tienes permisos para crear usuarios");
  }
  if (!nombre || !email || !passwordPlano) {
    throw new Error("Nombre, correo y contraseña son obligatorios");
  }
  const rolFinal = rol === "admin" ? "admin" : "staff";
  crearOActualizarUsuario_(
    nombre.trim(),
    email.trim(),
    passwordPlano,
    rolFinal,
    true,
  );
  return { success: true };
}

function createSessionToken_(email, nombre, rol) {
  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  cache.put(
    "session_" + token,
    JSON.stringify({ email, nombre, rol }),
    SESSION_DURATION_SECONDS,
  );
  return token;
}

/**
 * Valida un token de sesión. Lanza un error si no es válido o expiró.
 * Todas las funciones del panel que exponen o modifican datos deben llamarla primero.
 */
function validateToken_(token) {
  if (!token) {
    throw new Error("Sesión no válida. Inicia sesión nuevamente.");
  }
  const cache = CacheService.getScriptCache();
  const payload = cache.get("session_" + token);
  if (!payload) {
    throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
  }
  return JSON.parse(payload);
}

/**
 * Inicio de sesión con correo y contraseña.
 */
function loginWithPassword(email, password) {
  const user = findUserByEmail_(email);
  if (!user || !user.activo) {
    throw new Error("Correo o contraseña incorrectos");
  }
  const hash = hashPassword_(password, user.salt);
  if (hash !== user.passwordHash) {
    throw new Error("Correo o contraseña incorrectos");
  }
  const token = createSessionToken_(user.email, user.nombre, user.rol);
  return {
    token: token,
    nombre: user.nombre,
    email: user.email,
    rol: user.rol,
  };
}

/**
 * Intento de inicio de sesión automático con la cuenta de Google activa.
 * Solo funciona si el despliegue se publicó como "Ejecutar como: Usuario que accede"
 * y esa persona ya está autorizada en la hoja de Usuarios. Si no aplica, el panel
 * simplemente muestra el formulario de correo y contraseña.
 */
function checkGoogleSession() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (!email) return { authenticated: false };

    const user = findUserByEmail_(email);
    if (user && user.activo) {
      const token = createSessionToken_(user.email, user.nombre, user.rol);
      return {
        authenticated: true,
        token: token,
        nombre: user.nombre,
        email: user.email,
      };
    }
    return { authenticated: false };
  } catch (err) {
    return { authenticated: false };
  }
}

function logout(token) {
  if (token) {
    CacheService.getScriptCache().remove("session_" + token);
  }
  return true;
}

/* ==========================================================================
   FUNCIONES DEL PANEL: PEDIDOS
   ========================================================================== */

/**
 * Devuelve todos los pedidos (más recientes primero), con filtros opcionales.
 * filtros = { estado, fechaDesde, fechaHasta, busqueda }
 */
/**
 * Devuelve la lista de sucursales configuradas (para poblar filtros y
 * selects del panel administrativo).
 */
function adminGetSucursales(token) {
  validateToken_(token);
  return SUCURSALES;
}

function adminGetPedidos(token, filtros) {
  validateToken_(token);
  filtros = filtros || {};

  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();

  const pedidos = [];
  for (let i = 1; i < values.length; i++) {
    const rowVal = values[i];
    const rowDisp = displayValues[i];
    if (!rowVal[16]) continue; // sin UUID, fila vacía

    let productos = [];
    try {
      productos = JSON.parse(rowVal[11] || "[]");
    } catch (e) {
      productos = [];
    }

    const pedido = {
      cliente: String(rowDisp[0] || ""),
      telefono: String(rowDisp[1] || ""),
      tipoEntrega: String(rowDisp[2] || ""),
      direccion: String(rowDisp[3] || ""),
      referencias: String(rowDisp[4] || ""),
      destinatario: String(rowDisp[5] || ""),
      telefonoDestinatario: String(rowDisp[6] || ""),
      metodoPago: String(rowDisp[7] || ""),
      fechaEntrega: normalizeDate(rowVal[8] || rowDisp[8]),
      horaEntrega: normalizeTime(rowVal[9] || rowDisp[9]),
      dedicatoria: String(rowDisp[10] || ""),
      productos: productos,
      total: Number(rowVal[12]) || 0,
      puntos: Number(rowVal[13]) || 0,
      estado: String(rowDisp[14] || "Pendiente"),
      timestamp: rowVal[15],
      uuid: String(rowVal[16] || ""),
      sucursal: String(rowDisp[17] || ""),
      rowIndex: i + 1,
    };

    if (
      filtros.estado &&
      filtros.estado !== "all" &&
      pedido.estado !== filtros.estado
    )
      continue;
    if (
      filtros.sucursal &&
      filtros.sucursal !== "all" &&
      pedido.sucursal !== filtros.sucursal
    )
      continue;
    if (filtros.fechaDesde && pedido.fechaEntrega < filtros.fechaDesde)
      continue;
    if (filtros.fechaHasta && pedido.fechaEntrega > filtros.fechaHasta)
      continue;
    if (filtros.busqueda) {
      const q = String(filtros.busqueda).toLowerCase();
      const haystack = (
        pedido.cliente +
        " " +
        pedido.telefono +
        " " +
        pedido.destinatario
      ).toLowerCase();
      if (!haystack.includes(q)) continue;
    }

    pedidos.push(pedido);
  }

  pedidos.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return pedidos;
}

/**
 * Busca la fila de un pedido por su UUID.
 */
function getPedidoRowByUuid_(uuid) {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][16]) === String(uuid)) {
      return { rowIndex: i + 1, row: values[i] };
    }
  }
  return null;
}

/**
 * Actualiza el estado de un pedido (ej: Pendiente -> Confirmado -> En camino -> Entregado).
 */
function adminActualizarEstadoPedido(token, uuid, nuevoEstado) {
  validateToken_(token);
  if (ESTADOS_VALIDOS.indexOf(nuevoEstado) === -1) {
    throw new Error("Estado no válido");
  }
  const found = getPedidoRowByUuid_(uuid);
  if (!found) throw new Error("No se encontró el pedido");

  getSheet().getRange(found.rowIndex, 15).setValue(nuevoEstado);
  return { success: true };
}

/**
 * Crea un pedido manualmente desde el panel (ej. pedido tomado por teléfono).
 * Reutiliza la misma validación que el formulario público.
 */
function adminCrearPedidoManual(token, data) {
  validateToken_(token);
  const response = handleCrearPedido(data);
  const parsed = JSON.parse(response.getContent());
  if (parsed.status === "error") {
    throw new Error(parsed.data.error || "No se pudo crear el pedido");
  }
  return parsed.data;
}

/**
 * Elimina un pedido (uso restringido a administradores).
 */
function adminEliminarPedido(token, uuid) {
  const session = validateToken_(token);
  if (session.rol !== "admin") {
    throw new Error("No tienes permisos para eliminar pedidos");
  }
  const found = getPedidoRowByUuid_(uuid);
  if (!found) throw new Error("No se encontró el pedido");
  getSheet().deleteRow(found.rowIndex);
  return { success: true };
}

/* ==========================================================================
   FUNCIONES DEL PANEL: DASHBOARD
   ========================================================================== */
function adminGetDashboard(token, sucursalFiltro) {
  validateToken_(token);

  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();
  const tz = Session.getScriptTimeZone();
  const todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");

  const hoy = new Date(todayStr + "T00:00:00");
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() - hoy.getDay());
  const inicioSemanaStr = Utilities.formatDate(inicioSemana, tz, "yyyy-MM-dd");

  const porEstado = {};
  const porTipoEntrega = {};
  const porSucursal = {};
  let total = 0;
  let ventasTotales = 0;
  let entregasHoy = 0;
  let pedidosSemana = 0;
  let ventasSemana = 0;

  for (let i = 1; i < values.length; i++) {
    const rowVal = values[i];
    const rowDisp = displayValues[i];
    if (!rowVal[16]) continue;

    const sucursal = String(rowDisp[17] || "Sin especificar");
    if (
      sucursalFiltro &&
      sucursalFiltro !== "all" &&
      sucursal !== sucursalFiltro
    )
      continue;

    total += 1;
    const montoTotal = Number(rowVal[12]) || 0;
    ventasTotales += montoTotal;

    const estado = String(rowDisp[14] || "Pendiente");
    porEstado[estado] = (porEstado[estado] || 0) + 1;

    const tipoEntrega = String(rowDisp[2] || "");
    porTipoEntrega[tipoEntrega] = (porTipoEntrega[tipoEntrega] || 0) + 1;

    if (!porSucursal[sucursal]) {
      porSucursal[sucursal] = { pedidos: 0, ventas: 0 };
    }
    porSucursal[sucursal].pedidos += 1;
    porSucursal[sucursal].ventas += montoTotal;

    const fechaEntrega = normalizeDate(rowVal[8] || rowDisp[8]);
    if (fechaEntrega === todayStr) entregasHoy += 1;

    const fechaPedido = normalizeDate(rowVal[15]);
    if (fechaPedido >= inicioSemanaStr) {
      pedidosSemana += 1;
      ventasSemana += montoTotal;
    }
  }

  return {
    total,
    ventasTotales,
    entregasHoy,
    pedidosSemana,
    ventasSemana,
    porEstado,
    porTipoEntrega,
    porSucursal,
  };
}

/* ==========================================================================
   FUNCIONES DEL PANEL: CLIENTES (directorio derivado de Pedidos)
   ========================================================================== */
function adminGetClientes(token, sucursalFiltro) {
  validateToken_(token);

  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const displayValues = sheet.getDataRange().getDisplayValues();

  const clientesMap = {};

  for (let i = 1; i < values.length; i++) {
    const rowVal = values[i];
    const rowDisp = displayValues[i];
    if (!rowVal[16]) continue;

    const telefono = String(rowDisp[1] || "").trim();
    if (!telefono) continue;

    const sucursal = String(rowDisp[17] || "Sin especificar");
    if (
      sucursalFiltro &&
      sucursalFiltro !== "all" &&
      sucursal !== sucursalFiltro
    )
      continue;

    // Directorio SEPARADO por sucursal: el mismo teléfono en dos sucursales
    // distintas se registra como dos clientes independientes.
    const key = telefono + "|" + sucursal;

    const total = Number(rowVal[12]) || 0;
    const fechaPedido = normalizeDate(rowVal[15]);

    if (!clientesMap[key]) {
      clientesMap[key] = {
        nombre: String(rowDisp[0] || ""),
        telefono: telefono,
        sucursal: sucursal,
        pedidos: 0,
        totalGastado: 0,
        puntosAcumulados: 0,
        ultimoPedido: fechaPedido,
      };
    }

    const c = clientesMap[key];
    c.pedidos += 1;
    c.totalGastado += total;
    c.puntosAcumulados += Number(rowVal[13]) || 0;
    if (fechaPedido > c.ultimoPedido) c.ultimoPedido = fechaPedido;
  }

  return Object.values(clientesMap).sort(
    (a, b) => b.totalGastado - a.totalGastado,
  );
}

/* ==========================================================================
   EXPORTAR COMPROBANTE DE PEDIDO A PDF
   ========================================================================== */

/**
 * Genera un PDF con los datos de un pedido y lo devuelve en base64
 * (se crea un Google Doc temporal solo para el proceso y se elimina después).
 */
function adminExportPedidoPDF(token, uuid) {
  validateToken_(token);

  const found = getPedidoRowByUuid_(uuid);
  if (!found) throw new Error("No se encontró el pedido");

  const displayRow = getSheet()
    .getRange(found.rowIndex, 1, 1, 18)
    .getDisplayValues()[0];
  let productos = [];
  try {
    productos = JSON.parse(
      getSheet().getRange(found.rowIndex, 12).getValue() || "[]",
    );
  } catch (e) {
    productos = [];
  }

  const pedido = {
    cliente: displayRow[0] || "Sin nombre",
    telefono: displayRow[1] || "",
    tipoEntrega:
      displayRow[2] === "tienda" ? "Recoger en sucursal" : "Envío a domicilio",
    direccion: displayRow[3] || "—",
    destinatario: displayRow[5] || "—",
    metodoPago: displayRow[7] || "",
    fecha: normalizeDate(displayRow[8]),
    hora: normalizeTime(displayRow[9]),
    dedicatoria: displayRow[10] || "—",
    total: displayRow[12] || "0",
    estado: displayRow[14] || "Pendiente",
    sucursal: displayRow[17] || "—",
  };

  const doc = DocumentApp.create(
    "Comprobante de Pedido - " + pedido.cliente + " - " + pedido.fecha,
  );
  const body = doc.getBody();
  body
    .setMarginTop(50)
    .setMarginBottom(50)
    .setMarginLeft(50)
    .setMarginRight(50);

  body
    .appendParagraph(BRAND_NAME)
    .setHeading(DocumentApp.ParagraphHeading.TITLE);
  body
    .appendParagraph("Comprobante de Pedido")
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendHorizontalRule();

  const filas = [
    ["Sucursal", pedido.sucursal],
    ["Cliente", pedido.cliente],
    ["Teléfono", pedido.telefono],
    ["Modalidad", pedido.tipoEntrega],
    ["Destinatario", pedido.destinatario],
    ["Dirección", pedido.direccion],
    ["Método de Pago", pedido.metodoPago],
    ["Fecha de Entrega", pedido.fecha],
    ["Hora de Entrega", pedido.hora],
    ["Estatus", pedido.estado],
  ];

  const table = body.appendTable(filas);
  for (let i = 0; i < filas.length; i++) {
    const labelCell = table.getRow(i).getCell(0);
    labelCell.editAsText().setBold(true);
    labelCell.setWidth(140);
  }

  body.appendParagraph(" ");
  body
    .appendParagraph("Productos")
    .setHeading(DocumentApp.ParagraphHeading.HEADING3);
  const filasProductos = productos.map((p) => [
    p.name,
    String(p.quantity),
    "$" + p.price * p.quantity + " MXN",
  ]);
  filasProductos.unshift(["Producto", "Cantidad", "Subtotal"]);
  const tablaProductos = body.appendTable(filasProductos);
  tablaProductos.getRow(0).editAsText().setBold(true);

  body.appendParagraph(" ");
  body.appendParagraph("Total: $" + pedido.total + " MXN").setBold(true);
  body.appendParagraph("Dedicatoria: " + pedido.dedicatoria);

  body.appendParagraph(" ");
  body.appendParagraph(BRAND_PHONE).setFontSize(9);
  body
    .appendParagraph(
      "Generado el " +
        Utilities.formatDate(
          new Date(),
          Session.getScriptTimeZone(),
          "dd/MM/yyyy HH:mm",
        ),
    )
    .setItalic(true)
    .setFontSize(9);

  doc.saveAndClose();

  const pdfBlob = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF);
  const base64 = Utilities.base64Encode(pdfBlob.getBytes());

  // El documento temporal ya no se necesita: solo sirvió para generar el PDF
  DriveApp.getFileById(doc.getId()).setTrashed(true);

  const nombreArchivo =
    "Pedido_" +
    pedido.cliente.replace(/[^a-zA-Z0-9]+/g, "_") +
    "_" +
    pedido.fecha +
    ".pdf";

  return {
    base64: base64,
    filename: nombreArchivo,
    mimeType: "application/pdf",
  };
}

/* ==========================================================================
   RESPALDO SEMANAL DE LA HOJA DE PEDIDOS A EXCEL (.xlsx)
   ========================================================================== */

function getOrCreateBackupFolder_() {
  const folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(BACKUP_FOLDER_NAME);
}

function limpiarRespaldosAntiguos_(folder) {
  const archivos = [];
  const it = folder.getFilesByType(MimeType.MICROSOFT_EXCEL);
  while (it.hasNext()) archivos.push(it.next());

  archivos.sort(
    (a, b) => b.getDateCreated().getTime() - a.getDateCreated().getTime(),
  );

  for (let i = MAX_BACKUPS_TO_KEEP; i < archivos.length; i++) {
    archivos[i].setTrashed(true);
  }
}

/**
 * Exporta SOLO la hoja de Pedidos (nunca la hoja de Usuarios) a un archivo .xlsx
 * dentro de una carpeta de Drive dedicada. Pensada para correr automáticamente
 * cada semana mediante un disparador de tiempo (ver instalarTriggerRespaldoSemanal).
 */
function backupPedidosSemanal() {
  const sourceSheet = getSheet();

  // Se crea una hoja de cálculo temporal con una copia de SOLO la hoja de Pedidos,
  // para que el respaldo nunca incluya la hoja oculta de Usuarios (contraseñas).
  const tempSS = SpreadsheetApp.create(
    "Respaldo temporal - Pedidos - " + new Date().toISOString(),
  );
  const copiaPedidos = sourceSheet.copyTo(tempSS);
  copiaPedidos.setName("Pedidos");

  const hojaPorDefecto = tempSS
    .getSheets()
    .find((s) => s.getSheetId() !== copiaPedidos.getSheetId());
  if (hojaPorDefecto) tempSS.deleteSheet(hojaPorDefecto);

  SpreadsheetApp.flush();

  const url =
    "https://docs.google.com/spreadsheets/d/" +
    tempSS.getId() +
    "/export?format=xlsx";
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
  });

  const nombreArchivo =
    "Pedidos_Respaldo_" +
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd",
    ) +
    ".xlsx";
  const blob = response.getBlob().setName(nombreArchivo);

  const folder = getOrCreateBackupFolder_();
  const file = folder.createFile(blob);

  // La hoja de cálculo temporal ya cumplió su función (solo servía para exportar)
  DriveApp.getFileById(tempSS.getId()).setTrashed(true);

  const props = PropertiesService.getScriptProperties();
  props.setProperty("LAST_BACKUP_DATE", new Date().toISOString());
  props.setProperty("LAST_BACKUP_URL", file.getUrl());

  limpiarRespaldosAntiguos_(folder);

  const base64 = Utilities.base64Encode(blob.getBytes());

  return {
    fileId: file.getId(),
    fileName: file.getName(),
    url: file.getUrl(),
    base64: base64,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
}

/**
 * Instala el disparador semanal (cada lunes ~2:00 AM). Ejecútala UNA VEZ manualmente
 * desde el editor de Apps Script (menú Ejecutar > instalarTriggerRespaldoSemanal).
 */
function instalarTriggerRespaldoSemanal() {
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === "backupPedidosSemanal")
      ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger("backupPedidosSemanal")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(2)
    .create();

  Logger.log(
    "✅ Respaldo automático instalado: cada lunes alrededor de las 2:00 AM.",
  );
}

/**
 * Info del último respaldo, para mostrar en el panel.
 */
function adminGetBackupInfo(token) {
  validateToken_(token);
  const props = PropertiesService.getScriptProperties();
  return {
    lastBackupDate: props.getProperty("LAST_BACKUP_DATE") || null,
    lastBackupUrl: props.getProperty("LAST_BACKUP_URL") || null,
  };
}

/**
 * Permite generar un respaldo manualmente desde el panel (además del automático semanal).
 */
function adminForzarRespaldo(token) {
  validateToken_(token);
  return backupPedidosSemanal();
}

function resetearSetup() {
  PropertiesService.getScriptProperties().deleteProperty("SETUP_COMPLETE");
  Logger.log("✅ Permiso de configuración restablecido correctamente.");
}

/**
 * Obtiene o crea la hoja de Visitas
 */
function getVisitasSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName("Visitas");

  if (!sheet) {
    sheet = ss.insertSheet("Visitas");
    const headers = [
      "Fecha y Hora",
      "Pagina / URL",
      "Origen (Referrer)",
      "Dispositivo",
      "Navegador / User Agent",
      "Sucursal",
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Registra una visita al sitio en la hoja "Visitas"
 */
function handleRegistrarVisita(data) {
  data = data || {};
  const sheet = getVisitasSheet_();
  sheet.appendRow([
    new Date(),
    sanitizeForSheet(data.url, 500),
    sanitizeForSheet(data.referrer, 500),
    sanitizeForSheet(data.esMovil, 20),
    sanitizeForSheet(data.userAgent, 500),
    sanitizeForSheet(data.sucursal, 100),
  ]);
  return buildResponse({ message: "Visita registrada" }, true);
}

/**
 * Manejador unico de peticiones POST (pedidos y registro de visitas).
 * El cliente siempre envia: { action: "...", data: {...} }
 */
function doPost(e) {
  try {
    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;
    const data = contents.data || contents.visita || contents.pedido || {};

    switch (action) {
      case "crearPedido":
        return handleCrearPedido(data);
      case "registrarVisita":
        return handleRegistrarVisita(data);
      default:
        return buildResponse({ error: "Accion no valida: " + action }, false);
    }
  } catch (err) {
    console.error("Error en doPost:", err);
    return buildResponse({ error: err.toString() }, false);
  }
}
