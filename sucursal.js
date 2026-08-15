/**
 * Selección de sucursal.
 *
 * Cada sucursal tiene su propio menú y precios (ver catalog.js), así que el
 * cliente debe elegir su sucursal ANTES de ver el menú. La selección se
 * guarda en localStorage y desde ahí se derivan los globales CATALOG y
 * CATEGORIES que usa productos.js — así productos.js no necesita saber nada
 * sobre sucursales, solo consume esos dos arreglos.
 *
 * También se usa para separar el carrito por sucursal: no tiene sentido
 * mezclar en un mismo pedido platillos de dos sucursales distintas.
 */

const SUCURSAL_STORAGE_KEY = "sucursal_actual_id";

// Globales que productos.js / app.js ya esperaban encontrar poblados
let CATALOG = [];
let CATEGORIES = [];

function getSucursalActualId() {
  return localStorage.getItem(SUCURSAL_STORAGE_KEY) || null;
}

function getSucursalActual() {
  const id = getSucursalActualId();
  return CONFIG.sucursales.find((s) => s.id === id) || null;
}

// Vuelve a armar CATALOG/CATEGORIES a partir de la sucursal activa
function refreshMenuGlobals() {
  const id = getSucursalActualId();
  CATALOG = (typeof MENU_BY_SUCURSAL !== "undefined" && MENU_BY_SUCURSAL[id]) || [];
  CATEGORIES = (typeof CATEGORIES_BY_SUCURSAL !== "undefined" && CATEGORIES_BY_SUCURSAL[id]) || [];
}

function setSucursalActual(id) {
  localStorage.setItem(SUCURSAL_STORAGE_KEY, id);
  refreshMenuGlobals();
  updateSucursalIndicator();
  updateTiendaOptionLabel();
}

function updateSucursalIndicator() {
  const el = document.getElementById("sucursalIndicatorText");
  const s = getSucursalActual();
  if (el) el.innerText = s ? s.nombre : "Elegir sucursal";
}

// Actualiza el texto de la opción "Recoger en tienda" del checkout para que
// muestre el nombre real de la sucursal activa
function updateTiendaOptionLabel() {
  const s = getSucursalActual();
  if (!s) return;
  document.querySelectorAll('#deliveryType option[value="tienda"], #agTipoEntrega option[value="tienda"]').forEach((opt) => {
    opt.innerText = `Recoger en Sucursal ${s.nombre}`;
  });
}

function buildSucursalModal() {
  if (document.getElementById("sucursalModal")) return;

  const wrap = document.createElement("div");
  wrap.id = "sucursalModal";
  wrap.className = "sucursal-modal-backdrop";
  wrap.innerHTML = `
    <div class="sucursal-modal">
      <button type="button" class="sucursal-modal-close" id="sucursalModalClose" aria-label="Cerrar">&times;</button>
      <span class="sucursal-modal-eyebrow">Antes de comenzar</span>
      <h3 class="sucursal-modal-title">¿En qué sucursal quieres ordenar?</h3>
      <p class="sucursal-modal-desc">El menú y los precios pueden variar según la sucursal.</p>
      <div class="sucursal-modal-list" id="sucursalModalList"></div>
    </div>
  `;
  document.body.appendChild(wrap);

  const list = wrap.querySelector("#sucursalModalList");
  list.innerHTML = CONFIG.sucursales
    .map(
      (s) => `
    <button type="button" class="sucursal-option" data-id="${s.id}">
      <span class="sucursal-option-name">${s.nombre}</span>
      <span class="sucursal-option-address"><i class="bi bi-geo-alt"></i> ${s.direccion}</span>
      <span class="sucursal-option-hours"><i class="bi bi-clock"></i> ${s.horario}</span>
    </button>
  `,
    )
    .join("");

  list.querySelectorAll(".sucursal-option").forEach((btn) => {
    btn.addEventListener("click", () => selectSucursal(btn.getAttribute("data-id")));
  });

  document.getElementById("sucursalModalClose").addEventListener("click", closeSucursalModal);
}

function selectSucursal(id) {
  setSucursalActual(id);
  closeSucursalModal();

  // El carrito está separado por sucursal (ver cartStorageKey en app.js):
  // al cambiar, recargamos el carrito que corresponde a la nueva sucursal.
  if (typeof loadCart === "function") {
    loadCart();
    if (typeof updateCartUI === "function") updateCartUI();
  }
  if (typeof applyFilters === "function") applyFilters();
  if (typeof renderFeaturedProducts === "function") renderFeaturedProducts();
}

function openSucursalModal() {
  buildSucursalModal();
  document.getElementById("sucursalModal").classList.add("show");
}

function closeSucursalModal() {
  const el = document.getElementById("sucursalModal");
  if (el) el.classList.remove("show");
}

// Se ejecuta apenas carga el DOM: si no hay sucursal guardada, obliga a
// elegir una antes de mostrar el menú. Si ya hay una, solo refresca los
// globales para que el resto de los scripts (productos.js, app.js) los usen.
function ensureSucursalSelected() {
  refreshMenuGlobals();
  updateSucursalIndicator();
  if (!getSucursalActualId()) {
    openSucursalModal();
  } else {
    updateTiendaOptionLabel();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  ensureSucursalSelected();
  const trigger = document.getElementById("sucursalIndicator");
  if (trigger) trigger.addEventListener("click", openSucursalModal);
});
