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

/* ==========================================================================
   RESERVACIONES - Configuración
   ========================================================================== */
const RESERVATIONS_SHEET_NAME = "Reservaciones";
const TABLES_SHEET_NAME = "Mesas";
const RESERVATION_DURATION_MINUTES = 60; // Tiempo estimado por mesa (minutos)
const RESERVATION_STATUSES = ["Confirmada", "Cancelada", "Completada"];
const RESERVATION_MIN_ADVANCE_HOURS = 0;

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

    // Permitir solicitudes GET para obtener mesas disponibles (frontend)
    if (e && e.parameter && e.parameter.action === "getAvailableTables") {
      const sucursal = e.parameter.sucursal || "";
      const fecha = e.parameter.fecha || "";
      const hora = e.parameter.hora || "";
      const resultado = getAvailableTables(sucursal, fecha, hora);

      // Devolver directamente el resultado sin envolver en buildResponse
      // porque el frontend espera { success: true, mesas: [...] }
      return ContentService.createTextOutput(
        JSON.stringify(resultado),
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // Permitir solicitudes GET para obtener las horas disponibles de una
    // sucursal/fecha (usado por el nuevo selector de horario en botones del
    // formulario público de reservaciones)
    if (e && e.parameter && e.parameter.action === "getAvailableHours") {
      const sucursal = e.parameter.sucursal || "";
      const fecha = e.parameter.fecha || "";
      let resultado;
      try {
        const horas = getAvailableHours(sucursal, fecha);
        resultado = { success: true, horas: horas };
      } catch (error) {
        resultado = { success: false, error: error.toString() };
      }
      return ContentService.createTextOutput(
        JSON.stringify(resultado),
      ).setMimeType(ContentService.MimeType.JSON);
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

/* ==========================================================================
   RESERVACIONES - Funciones de Backend
   ========================================================================== */

/**
 * Obtiene o crea la hoja de Reservaciones
 */
/**
 * Obtiene o crea la hoja de Reservaciones en el Spreadsheet activo.
 * Retorna siempre la instancia de la hoja (Sheet) para operaciones de I/O.
 * 
 * @return {GoogleAppsScript.Spreadsheet.Sheet} Instancia de la hoja de reservaciones.
 */
function getReservationsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(RESERVATIONS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(RESERVATIONS_SHEET_NAME);
    const headers = [
      "ID",
      "Sucursal",
      "Cliente",
      "Teléfono",
      "Fecha",
      "Hora",
      "Mesa",
      "Capacidad",
      "Personas",
      "Estado",
      "Notas",
      "Timestamp",
      "TiempoEstimado",
      "HoraLiberacion"
    ];
    
    // Encabezados con formato inicial
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Obtiene o crea la hoja de Mesas (configuración por sucursal)
 */
function getTablesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(TABLES_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(TABLES_SHEET_NAME);
    const headers = ["Sucursal", "Mesa", "Capacidad", "Activa"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1);

    // Datos de ejemplo para las sucursales
    const mesasEjemplo = [
      ["Centro Histórico", "Mesa 1", 2, true],
      ["Centro Histórico", "Mesa 2", 2, true],
      ["Centro Histórico", "Mesa 3", 4, true],
      ["Centro Histórico", "Mesa 4", 4, true],
      ["Centro Histórico", "Mesa 5", 6, true],
      ["Centro Histórico", "Mesa 6", 8, true],
      ["Reforma", "Mesa 1", 2, true],
      ["Reforma", "Mesa 2", 4, true],
      ["Reforma", "Mesa 3", 4, true],
      ["Reforma", "Mesa 4", 6, true],
    ];
    if (mesasEjemplo.length > 0) {
      sheet
        .getRange(2, 1, mesasEjemplo.length, mesasEjemplo[0].length)
        .setValues(mesasEjemplo);
    }
  }

  return sheet;
}

/**
 * Verifica si una mesa está disponible en una fecha y hora específicas.
 *
 * BUGFIX: antes esta función solo comparaba la hora de forma EXACTA
 * (rowHora === hora), así que si una reservación era a las 14:00 con 60 min
 * de ocupación, una nueva reservación a las 14:15 o 14:30 se aceptaba como
 * "disponible" aunque la mesa siguiera ocupada — es decir, nunca se validaba
 * el rango real de la reservación, solo el minuto exacto. Ahora se calcula
 * el rango de ocupación real (hora de inicio → hora de inicio + duración) de
 * cada reservación existente y se verifica si se traslapa con el rango
 * solicitado.
 */
function verificarDisponibilidadMesa(sucursal, mesa, fecha, hora, excluirId) {
  const sheet = getReservationsSheet_();
  const values = sheet.getDataRange().getValues();

  const horaDate = new Date(fecha + "T" + hora + ":00");
  if (isNaN(horaDate.getTime())) {
    return {
      disponible: false,
      mensaje: "Fecha u hora inválida",
      reservacionExistente: null,
    };
  }

  const ahora = new Date();
  const todayStr = Utilities.formatDate(ahora, Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  // Si es hoy, no permitir horas pasadas
  if (fecha === todayStr) {
    const nowMinutes = ahora.getHours() * 60 + ahora.getMinutes();
    const hourMinutes = parseInt(hora.split(":")[0]) * 60 + parseInt(hora.split(":")[1] || 0);
    if (hourMinutes < nowMinutes + 30) {
      return {
        disponible: false,
        mensaje: "No se pueden reservar horas pasadas",
        reservacionExistente: null,
      };
    }
  }

  const diffHoras = (horaDate.getTime() - ahora.getTime()) / (1000 * 60 * 60);
  if (diffHoras < RESERVATION_MIN_ADVANCE_HOURS) {
    return {
      disponible: false,
      mensaje: `Las reservaciones deben hacerse con al menos ${RESERVATION_MIN_ADVANCE_HOURS} hora de anticipación`,
      reservacionExistente: null,
    };
  }

  // Rango de ocupación que solicita esta nueva reservación
  const nuevoInicio = horaDate.getTime();
  const nuevoFin = nuevoInicio + RESERVATION_DURATION_MINUTES * 60 * 1000;

  // Verificar traslape con cualquier reservación existente de la misma mesa
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const id = String(row[0] || "");
    const rowSucursal = String(row[1] || "");
    const rowMesa = String(row[6] || "");
    const rowEstado = String(row[9] || "");
    const rowFecha = normalizeDate(row[4]);
    const rowHora = normalizeTime(row[5]);
    const rowHoraLiberacion = row[13];
    const rowDuracion = Number(row[12]) || RESERVATION_DURATION_MINUTES;

    if (excluirId && id === excluirId) continue;
    if (rowEstado !== "Confirmada") continue;
    if (rowSucursal !== sucursal || rowMesa !== mesa) continue;
    if (rowFecha !== fecha) continue;

    const existenteInicioDate = new Date(rowFecha + "T" + rowHora + ":00");
    if (isNaN(existenteInicioDate.getTime())) continue;
    const existenteInicio = existenteInicioDate.getTime();
    const existenteFin = existenteInicio + rowDuracion * 60 * 1000;

    // Traslape de rangos: [nuevoInicio, nuevoFin) vs [existenteInicio, existenteFin)
    const seTraslapan = nuevoInicio < existenteFin && existenteInicio < nuevoFin;

    if (seTraslapan) {
      return {
        disponible: false,
        mensaje: `La mesa está ocupada de las ${rowHora} a las ${Utilities.formatDate(new Date(existenteFin), Session.getScriptTimeZone(), "HH:mm")} hrs`,
        reservacionExistente: {
          id: id,
          cliente: String(row[2] || ""),
          hora: rowHora,
          horaLiberacion: rowHoraLiberacion,
        },
      };
    }
  }

  return {
    disponible: true,
    mensaje: "Mesa disponible",
    reservacionExistente: null,
  };
}

/**
 * Obtiene la configuración de mesas para una sucursal
 */
function obtenerMesasConfiguracion_(sucursal) {
  const sheet = getTablesSheet_();
  const values = sheet.getDataRange().getValues();
  const mesas = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const rowSucursal = String(row[0] || "").trim();
    if (rowSucursal !== sucursal) continue;

    mesas.push({
      nombre: String(row[1] || ""),
      capacidad: Number(row[2]) || 2,
      activa: row[3] === true || row[3] === "TRUE",
    });
  }

  return mesas;
}

/**
 * Obtiene todas las mesas de una sucursal con su estado de disponibilidad
 */
function obtenerMesasConDisponibilidad(sucursal, fecha, hora) {
  let mesas = obtenerMesasConfiguracion_(sucursal);

  // Si no hay mesas configuradas, usar mesas por defecto
  if (mesas.length === 0) {
    const mesasDefault = [
      { nombre: "Mesa 1", capacidad: 2, activa: true },
      { nombre: "Mesa 2", capacidad: 2, activa: true },
      { nombre: "Mesa 3", capacidad: 4, activa: true },
      { nombre: "Mesa 4", capacidad: 4, activa: true },
      { nombre: "Mesa 5", capacidad: 6, activa: true },
      { nombre: "Mesa 6", capacidad: 8, activa: true },
    ];
    mesas = mesasDefault;
  }

  // Filtrar mesas activas
  mesas = mesas.filter((m) => m.activa);

  // Verificar disponibilidad de cada mesa
  const resultado = mesas.map((mesa) => {
    const disponibilidad = verificarDisponibilidadMesa(
      sucursal,
      mesa.nombre,
      fecha,
      hora,
    );
    return {
      nombre: mesa.nombre,
      capacidad: mesa.capacidad,
      disponible: disponibilidad.disponible,
      mensaje: disponibilidad.mensaje,
      reservacionExistente: disponibilidad.reservacionExistente,
      horaLiberacion: disponibilidad.reservacionExistente
        ? disponibilidad.reservacionExistente.horaLiberacion
        : null,
    };
  });

  // Ordenar: disponibles primero, luego por capacidad
  resultado.sort((a, b) => {
    if (a.disponible && !b.disponible) return -1;
    if (!a.disponible && b.disponible) return 1;
    return a.capacidad - b.capacidad;
  });

  return resultado;
}

/**
 * Endpoint para obtener mesas disponibles (GET y POST)
 */
function getAvailableTables(sucursal, fecha, hora) {
  if (!sucursal || !fecha || !hora) {
    return {
      success: false,
      error: "Faltan parámetros: sucursal, fecha y hora son requeridos",
    };
  }

  try {
    const mesas = obtenerMesasConDisponibilidad(sucursal, fecha, hora);
    return { success: true, mesas: mesas };
  } catch (error) {
    console.error("Error al obtener mesas:", error);
    return { success: false, error: error.toString() };
  }
}

/**
 * Crea una nueva reservación
 */
function crearReservacion(data) {
  const required = [
    "sucursal",
    "cliente",
    "telefono",
    "fecha",
    "hora",
    "mesa",
    "personas",
  ];
  const missing = required.filter(
    (field) => !data[field] || data[field].trim() === "",
  );

  if (missing.length > 0) {
    return { success: false, error: `Faltan campos: ${missing.join(", ")}` };
  }

  const sucursal = data.sucursal.trim();
  const mesa = data.mesa.trim();
  const fecha = data.fecha.trim();
  const hora = data.hora.trim();
  const personas = Number(data.personas) || 1;
  const notas = (data.notas || "").trim();
  const cliente = data.cliente.trim();
  const telefono = data.telefono.trim();

  if (!isValidPhone(telefono)) {
    return {
      success: false,
      error: "El teléfono debe tener entre 10 y 15 dígitos",
    };
  }

  const fechaHora = new Date(fecha + "T" + hora);
  if (isNaN(fechaHora.getTime())) {
    return { success: false, error: "Fecha u hora inválida" };
  }

  const ahora = new Date();
  if (fechaHora.getTime() < ahora.getTime()) {
    return {
      success: false,
      error: "No se pueden hacer reservaciones en el pasado",
    };
  }

  const diffHoras = (fechaHora.getTime() - ahora.getTime()) / (1000 * 60 * 60);
  if (diffHoras < RESERVATION_MIN_ADVANCE_HOURS) {
    return {
      success: false,
      error: `Las reservaciones deben hacerse con al menos ${RESERVATION_MIN_ADVANCE_HOURS} hora de anticipación`,
    };
  }

  const disponibilidad = verificarDisponibilidadMesa(
    sucursal,
    mesa,
    fecha,
    hora,
  );
  if (!disponibilidad.disponible) {
    return { success: false, error: disponibilidad.mensaje };
  }

  const mesas = obtenerMesasConfiguracion_(sucursal);
  const mesaConfig = mesas.find((m) => m.nombre === mesa);
  if (!mesaConfig) {
    return { success: false, error: "La mesa no existe en esta sucursal" };
  }

  if (personas > mesaConfig.capacidad) {
    return {
      success: false,
      error: `La mesa tiene capacidad para ${mesaConfig.capacidad} personas`,
    };
  }

  const fechaLiberacion = new Date(
    fechaHora.getTime() + RESERVATION_DURATION_MINUTES * 60 * 1000,
  );
  const horaLiberacionStr = Utilities.formatDate(
    fechaLiberacion,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm:ss",
  );

  const id = Utilities.getUuid();

  const sheet = getReservationsSheet_();
  const rowData = [
    id,
    sucursal,
    cliente,
    "'" + telefono,
    "'" + fecha,
    "'" + hora,
    mesa,
    mesaConfig.capacidad,
    personas,
    "Confirmada",
    notas,
    new Date().toISOString(),
    RESERVATION_DURATION_MINUTES,
    horaLiberacionStr,
  ];

  sheet.appendRow(rowData);

  try {
    enviarNotificacionReservacion(
      cliente,
      telefono,
      sucursal,
      mesa,
      fecha,
      hora,
      personas,
    );
  } catch (e) {
    console.error("Error al enviar notificación de reservación:", e);
  }

  return {
    success: true,
    mensaje: "Reservación creada exitosamente",
    id: id,
    data: {
      cliente,
      sucursal,
      mesa,
      fecha,
      hora,
      personas,
      capacidad: mesaConfig.capacidad,
      horaLiberacion: horaLiberacionStr,
    },
  };
}

/**
 * Envía notificación por correo de una nueva reservación
 */
function enviarNotificacionReservacion(
  cliente,
  telefono,
  sucursal,
  mesa,
  fecha,
  hora,
  personas,
) {
  const emailDestino = "juanposicionsatelital@gmail.com";

  const asunto = `📅 Nueva Reservación - ${sucursal}: ${cliente} - ${fecha}`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px;">
      <h2 style="color: #2c3e50; border-bottom: 2px solid #c23b68; padding-bottom: 8px;">Nueva Reservación de Mesa</h2>
      <p>Se ha registrado una nueva reservación:</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Sucursal:</td><td style="padding: 8px;"><strong>${sucursal}</strong></td></tr>
        <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Cliente:</td><td style="padding: 8px;">${cliente}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Teléfono:</td><td style="padding: 8px;">${telefono}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Mesa:</td><td style="padding: 8px;"><strong>${mesa}</strong></td></tr>
        <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Fecha:</td><td style="padding: 8px;">${fecha}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Hora:</td><td style="padding: 8px;">${hora} hrs</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Personas:</td><td style="padding: 8px;">${personas}</td></tr>
        <tr><td style="padding: 8px; font-weight: bold; background-color: #f8f9fa;">Duración estimada:</td><td style="padding: 8px;">${RESERVATION_DURATION_MINUTES} minutos</td></tr>
      </table>
    </div>
  `;

  MailApp.sendEmail({
    to: emailDestino,
    subject: asunto,
    htmlBody: htmlBody,
  });
}

/**
 * Handler para crear reservación desde POST
 */
function handleCrearReservacion(data) {
  const resultado = crearReservacion(data);
  if (resultado.success) {
    return buildResponse(resultado, true);
  } else {
    return buildResponse({ error: resultado.error }, false);
  }
}

/* ==========================================================================
   FUNCIONES ADMIN - RESERVACIONES
   ========================================================================== */

/**
 * Obtiene todas las reservaciones para el panel admin
 */
/**
 * Obtiene todas las reservaciones para el panel admin
 */
function adminGetReservations(token, filtros) {
  validateToken_(token);
  filtros = filtros || {};

  const sheet = getReservationsSheet_();
  const values = sheet.getDataRange().getValues();
  const reservaciones = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[0] && row[0] !== 0) continue; // ID vacío

    // Leer todos los campos con sus índices correctos
    const reserva = {
      id: String(row[0] || ""),
      sucursal: String(row[1] || ""),
      cliente: String(row[2] || ""),
      telefono: String(row[3] || ""),
      fecha: normalizeDate(row[4]),
      hora: normalizeTime(row[5]),
      mesa: String(row[6] || ""),
      capacidad: Number(row[7]) || 0,
      personas: Number(row[8]) || 0,
      estado: String(row[9] || "Confirmada"),
      notas: String(row[10] || ""),
      timestamp: row[11],
      tiempoEstimado: Number(row[12]) || 60,
      horaLiberacion: row[13] || "",
      rowIndex: i + 1,
    };

    // Aplicar filtros
    if (filtros.sucursal && filtros.sucursal !== "all" && reserva.sucursal !== filtros.sucursal) continue;
    if (filtros.estado && filtros.estado !== "all" && reserva.estado !== filtros.estado) continue;
    if (filtros.fecha && reserva.fecha !== filtros.fecha) continue;
    if (filtros.busqueda) {
      const q = String(filtros.busqueda).toLowerCase();
      const haystack = (reserva.cliente + " " + reserva.telefono + " " + reserva.mesa).toLowerCase();
      if (!haystack.includes(q)) continue;
    }

    reservaciones.push(reserva);
  }

  // Ordenar por fecha y hora
  reservaciones.sort((a, b) => {
    const fechaA = new Date(a.fecha + "T" + a.hora);
    const fechaB = new Date(b.fecha + "T" + b.hora);
    return fechaA - fechaB;
  });

  return reservaciones;
}

/**
 * Actualiza el estado de una reservación
 */
function adminActualizarReservacion(token, id, nuevoEstado) {
  validateToken_(token);

  if (RESERVATION_STATUSES.indexOf(nuevoEstado) === -1) {
    throw new Error("Estado no válido");
  }

  const sheet = getReservationsSheet_();
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      sheet.getRange(i + 1, 10).setValue(nuevoEstado);
      return {
        success: true,
        mensaje: `Reservación actualizada a ${nuevoEstado}`,
      };
    }
  }

  throw new Error("No se encontró la reservación");
}

/**
 * Libera una mesa manualmente (marcar como completada)
 */
function adminLiberarMesa(token, id) {
  validateToken_(token);

  const sheet = getReservationsSheet_();
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      sheet.getRange(i + 1, 10).setValue("Completada");
      return { success: true, mensaje: "Mesa liberada correctamente" };
    }
  }

  throw new Error("No se encontró la reservación");
}

/* ==========================================================================
   FUNCIONES PÚBLICAS PARA CONFIGURACIÓN Y PRUEBAS
   ========================================================================== */

/**
 * FUNCIÓN PÚBLICA: Crea la hoja de Reservaciones
 * Ejecutar desde el editor de Apps Script
 */
function crearHojaReservaciones() {
  try {
    const sheet = getReservationsSheet_();
    Logger.log("✅ Hoja 'Reservaciones' creada/verificada correctamente");
    Logger.log(`📊 Filas: ${sheet.getLastRow()}`);
    return "Hoja 'Reservaciones' lista";
  } catch (error) {
    Logger.log("❌ Error:", error);
    throw error;
  }
}

/**
 * FUNCIÓN PÚBLICA: Crea la hoja de Mesas con datos de ejemplo
 * Ejecutar desde el editor de Apps Script
 */
function crearHojaMesas() {
  try {
    const sheet = getTablesSheet_();
    Logger.log("✅ Hoja 'Mesas' creada/verificada correctamente");
    Logger.log(`📊 Mesas configuradas: ${sheet.getLastRow() - 1}`);

    // Mostrar las mesas configuradas
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      Logger.log(
        `  🪑 ${values[i][0]} - ${values[i][1]} (Cap: ${values[i][2]})`,
      );
    }
    return "Hoja 'Mesas' lista";
  } catch (error) {
    Logger.log("❌ Error:", error);
    throw error;
  }
}

/**
 * FUNCIÓN PÚBLICA: Prueba completa del sistema de reservaciones
 * Ejecutar desde el editor de Apps Script
 */
function probarReservaciones() {
  try {
    Logger.log("=== 🧪 INICIANDO PRUEBA DE RESERVACIONES ===");

    // 1. Verificar hojas
    Logger.log("📋 Verificando hoja de Reservaciones...");
    const resSheet = getReservationsSheet_();
    Logger.log(`   ✅ Reservaciones: ${resSheet.getLastRow()} filas`);

    Logger.log("📋 Verificando hoja de Mesas...");
    const tablesSheet = getTablesSheet_();
    Logger.log(
      `   ✅ Mesas: ${tablesSheet.getLastRow() - 1} mesas configuradas`,
    );

    // 2. Probar disponibilidad con datos de ejemplo
    Logger.log("🔍 Probando disponibilidad de mesas...");
    const resultado = obtenerMesasConDisponibilidad(
      "Centro Histórico",
      "2026-08-16",
      "14:00",
    );
    Logger.log(`   ✅ ${resultado.length} mesas encontradas`);
    resultado.forEach((m) => {
      Logger.log(
        `   🪑 ${m.nombre} (Cap: ${m.capacidad}) → ${m.disponible ? "✅ Disponible" : "❌ Reservada"}`,
      );
    });

    Logger.log("=== ✅ PRUEBA COMPLETADA ===");
    return "Prueba completada exitosamente";
  } catch (error) {
    Logger.log("❌ Error en prueba:", error);
    throw error;
  }
}

/**
 * FUNCIÓN PÚBLICA: Limpia todas las reservaciones (para pruebas)
 * ⚠️ SOLO USAR EN ENTORNO DE PRUEBAS
 */
function limpiarReservaciones() {
  const confirmacion = Browser.msgBox(
    "⚠️ ADVERTENCIA",
    "¿Estás seguro de que quieres ELIMINAR TODAS las reservaciones?\nEsta acción NO se puede deshacer.",
    Browser.Buttons.YES_NO,
  );

  if (confirmacion === "yes") {
    const sheet = getReservationsSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.deleteRows(2, lastRow - 1);
      Logger.log(`🗑️ Eliminadas ${lastRow - 1} reservaciones`);
      return "Reservaciones eliminadas";
    } else {
      Logger.log("ℹ️ No había reservaciones para eliminar");
      return "No había reservaciones";
    }
  }
  return "Operación cancelada";
}

/**
 * FUNCIÓN PÚBLICA: Muestra el estado actual de las reservaciones
 * Ejecutar desde el editor de Apps Script
 */
function verReservaciones() {
  try {
    const sheet = getReservationsSheet_();
    const values = sheet.getDataRange().getValues();

    if (values.length <= 1) {
      Logger.log("ℹ️ No hay reservaciones registradas");
      return "No hay reservaciones";
    }

    Logger.log(`📊 ${values.length - 1} reservaciones encontradas:`);
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      Logger.log(
        `  🪑 ${row[6]} | ${row[2]} | ${row[4]} ${row[5]} | ${row[9]}`,
      );
    }
    return `Mostradas ${values.length - 1} reservaciones`;
  } catch (error) {
    Logger.log("❌ Error:", error);
    throw error;
  }
}

/* ==========================================================================
   Manejador único de peticiones POST
   ========================================================================== */

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
      case "crearReservacion":
        return handleCrearReservacion(data);
      default:
        return buildResponse({ error: "Accion no valida: " + action }, false);
    }
  } catch (err) {
    console.error("Error en doPost:", err);
    return buildResponse({ error: err.toString() }, false);
  }
}

// ==========================================================================
// RESERVACIONES - Funciones de Backend (MEJORADAS)
// ==========================================================================

/**
 * Obtiene las horas disponibles para una fecha y sucursal específicas
 * Retorna un array de horas en formato "HH:mm" que están disponibles
 *
 * BUGFIX: antes se marcaba una hora como "no disponible" si CUALQUIER mesa
 * de la sucursal tenía una reservación a esa hora exacta — es decir, una
 * sola mesa ocupada bloqueaba el horario para TODAS las mesas de la
 * sucursal. Ahora una hora se considera disponible si existe AL MENOS UNA
 * mesa libre en ese horario (usando el traslape real de 60 minutos, no la
 * coincidencia exacta de minuto). Además ahora genera franjas cada 30
 * minutos en vez de solo en punto.
 */
function getAvailableHours(sucursal, fecha) {
  if (!sucursal || !fecha) {
    return [];
  }

  const now = new Date();
  const todayStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Horario de atención: 9:00 a 21:00. Última hora reservable: 20:00
  // (para que la ocupación de 60 min termine antes del cierre).
  const OPEN_MIN = 9 * 60;
  const CLOSE_MIN = 21 * 60;
  const lastStartMin = CLOSE_MIN - RESERVATION_DURATION_MINUTES;

  const allSlots = [];
  for (let m = OPEN_MIN; m <= lastStartMin; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    allSlots.push(String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0"));
  }

  const mesasSucursal = obtenerMesasConfiguracion_(sucursal).filter((m) => m.activa);
  // Si no hay mesas configuradas para la sucursal, usar el total por defecto
  // (obtenerMesasConDisponibilidad ya resuelve ese caso internamente)
  const totalMesas = mesasSucursal.length > 0 ? mesasSucursal.length : 6;

  const availableHours = allSlots.filter((hour) => {
    // Si es hoy, no permitir horas ya pasadas (con 30 min de margen)
    if (fecha === todayStr) {
      const hourMinutes = parseInt(hour.split(":")[0]) * 60 + parseInt(hour.split(":")[1]);
      if (hourMinutes < currentMinutes + 30) return false;
    }

    // Disponible si al menos una mesa está libre en ese horario
    const mesasConDisponibilidad = obtenerMesasConDisponibilidad(sucursal, fecha, hour);
    return mesasConDisponibilidad.some((m) => m.disponible);
  });

  return availableHours;
}

/**
 * Obtiene las reservaciones del día para una sucursal específica
 */
function getReservationsForDay(sucursal, fecha) {
  if (!sucursal || !fecha) {
    return [];
  }
  
  const sheet = getReservationsSheet_();
  const values = sheet.getDataRange().getValues();
  const reservaciones = [];
  
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue;
    
    const rowSucursal = String(row[1] || "");
    const rowFecha = normalizeDate(row[4]);
    
    if (rowSucursal === sucursal && rowFecha === fecha) {
      reservaciones.push({
        id: String(row[0]),
        sucursal: rowSucursal,
        cliente: String(row[2] || ""),
        telefono: String(row[3] || ""),
        fecha: rowFecha,
        hora: normalizeTime(row[5]),
        mesa: String(row[6] || ""),
        capacidad: Number(row[7]) || 0,
        personas: Number(row[8]) || 0,
        estado: String(row[9] || "Confirmada"),
        notas: String(row[10] || ""),
        timestamp: row[11],
        horaLiberacion: row[13]
      });
    }
  }
  
  // Ordenar por hora
  reservaciones.sort((a, b) => {
    if (a.hora < b.hora) return -1;
    if (a.hora > b.hora) return 1;
    return 0;
  });
  
  return reservaciones;
}

/**
 * Obtiene mesas disponibles para una fecha y hora específicas
 * (versión mejorada con validación de hora)
 */
function getAvailableTablesWithHours(sucursal, fecha, hora) {
  if (!sucursal || !fecha || !hora) {
    return { success: false, error: "Faltan parámetros" };
  }
  
  // Validar que la hora esté en el rango permitido
  const hourNum = parseInt(hora.split(":")[0]);
  if (hourNum < 9 || hourNum > 21) {
    return { success: false, error: "Horario de atención: 9:00 AM a 9:00 PM" };
  }
  
  // Validar que no sea una hora pasada (si es hoy)
  const now = new Date();
  const todayStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  if (fecha === todayStr) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const hourMinutes = hourNum * 60;
    if (hourMinutes < nowMinutes + 30) {
      return { success: false, error: "No se pueden reservar horas pasadas" };
    }
  }
  
  const mesas = obtenerMesasConDisponibilidad(sucursal, fecha, hora);
  return { success: true, mesas: mesas };
}

/**
 * Obtiene la configuración de mesas desde la hoja "Mesas"
 * para que el panel administrativo pueda mostrarlas
 */
function adminGetMesasConfig(token) {
  validateToken_(token);
  
  const sheet = getTablesSheet_();
  const values = sheet.getDataRange().getValues();
  const mesas = [];
  
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row[0]) continue; // Sucursal vacía
    
    mesas.push({
      sucursal: String(row[0] || ""),
      mesa: String(row[1] || ""),
      nombre: String(row[1] || ""),
      capacidad: Number(row[2]) || 4,
      activa: row[3] === true || row[3] === "TRUE"
    });
  }
  
  return mesas;
}

/**
 * ==========================================================================
 * BUGFIX: las siguientes tres funciones ("getAvailableHours",
 * "getReservationsForDay" y "getAvailableTablesWithHours") NO reciben un
 * "token" como primer parámetro porque también las usa el sitio público
 * (sin sesión de admin) a través de doGet.
 *
 * Admin.html sí las llamaba pasando "sessionToken" como primer argumento
 * (gasCall("getReservationsForDay", sessionToken, sucursal, fecha)), lo que
 * hacía que adentro de la función "sucursal" recibiera en realidad el token
 * y "fecha" recibiera la sucursal — nunca encontraba coincidencias y por eso
 * el panel admin no mostraba ni las horas, ni la mesa, ni las reservaciones
 * del día. Estas funciones "adminXxx" son las que debe llamar el panel
 * (con el token correcto) y delegan en las funciones públicas de arriba.
 * ==========================================================================
 */
function adminGetAvailableHours(token, sucursal, fecha) {
  validateToken_(token);
  return getAvailableHours(sucursal, fecha);
}

function adminGetReservationsForDay(token, sucursal, fecha) {
  validateToken_(token);
  return getReservationsForDay(sucursal, fecha);
}

function adminGetAvailableTablesWithHours(token, sucursal, fecha, hora) {
  validateToken_(token);
  return getAvailableTablesWithHours(sucursal, fecha, hora);
}

/**
 * Crea una reservación desde el panel administrativo
 */
function adminCrearReservacion(token, data) {
  validateToken_(token);
  
  // Validar campos requeridos
  const required = ["sucursal", "cliente", "telefono", "fecha", "hora", "mesa", "personas"];
  const missing = required.filter(field => !data[field] || data[field].trim() === "");
  if (missing.length > 0) {
    throw new Error(`Faltan campos: ${missing.join(", ")}`);
  }
  
  // Usar la función existente de creación
  const resultado = crearReservacion(data);
  if (!resultado.success) {
    throw new Error(resultado.error);
  }
  
  return resultado;
}