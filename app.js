// Estado del Carrito respaldado en LocalStorage — SEPARADO POR SUCURSAL,
// porque cada sucursal tiene su propio menú y no tiene sentido mezclar
// platillos de dos sucursales en un mismo pedido.
let cart = [];
let orderModalObj = null;

function cartStorageKey() {
  const id =
    typeof getSucursalActualId === "function"
      ? getSucursalActualId()
      : "default";
  return "restaurant_cart_" + (id || "default");
}

function loadCart() {
  cart = JSON.parse(localStorage.getItem(cartStorageKey())) || [];
}

function saveCart() {
  localStorage.setItem(cartStorageKey(), JSON.stringify(cart));
}

document.addEventListener("DOMContentLoaded", () => {
  loadCart();

  const modalElem = document.getElementById("orderModal");
  if (modalElem) {
    orderModalObj = new bootstrap.Modal(modalElem);
  }

  // Renderizar Vistas
  if (document.getElementById("featured-products-container"))
    renderFeaturedProducts();
  if (document.getElementById("sucursales-container"))
    renderSucursalesSection();

  updateCartUI();
  setupWhatsAppWidget();
  setupFormHandler();
  setMinDeliveryDate();
  enhancePhoneInputNotice();
  registrarVisita();

  // Inicializar modal de reservación
  const resModalElem = document.getElementById("reservationModal");
  if (resModalElem) {
    reservationModal = new bootstrap.Modal(resModalElem);
  }
});

// Registra la visita a la página actual (no bloquea ni interrumpe la carga si falla)
function registrarVisita() {
  const sucursal =
    typeof getSucursalActual === "function" ? getSucursalActual() : null;
  const datosVisita = {
    url: window.location.href,
    referrer: document.referrer || "Directo",
    userAgent: navigator.userAgent,
    esMovil: /Mobi|Android/i.test(navigator.userAgent) ? "Móvil" : "Escritorio",
    sucursal: sucursal ? sucursal.nombre : "",
  };

  API.registrarVisita(datosVisita).catch((err) => {
    console.log("No se pudo registrar la visita:", err.message);
  });
}

// Renderiza dinámicamente las tarjetas de sucursales a partir de CONFIG.sucursales
// (sección "Sucursales" de index.html). Así, si agregas o quitas una sucursal en
// constants.js, esta sección se actualiza sola sin tocar el HTML.
function renderSucursalesSection() {
  const container = document.getElementById("sucursales-container");
  if (!container || !CONFIG.sucursales) return;

  container.innerHTML = CONFIG.sucursales
    .map(
      (s) => `
    <div class="col-md-6">
      <div class="sucursal-card h-100">
        <div class="sucursal-card-map">
          <iframe
            src="https://www.google.com/maps?q=${encodeURIComponent(s.direccion)}&output=embed"
            width="100%" height="220" style="border:0" loading="lazy"
            referrerpolicy="no-referrer-when-downgrade">
          </iframe>
        </div>
        <div class="sucursal-card-body">
          <h4 class="sucursal-card-title">${s.nombre}</h4>
          <p class="sucursal-card-line"><i class="bi bi-geo-alt-fill"></i> ${s.direccion}</p>
          <p class="sucursal-card-line"><i class="bi bi-clock-fill"></i> ${s.horario}</p>
          <p class="sucursal-card-line"><i class="bi bi-telephone-fill"></i> +${s.telefono}</p>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

// Agrega aviso sobre el número real de WhatsApp debajo del campo de teléfono del comprador
function enhancePhoneInputNotice() {
  const buyerPhoneInput = document.getElementById("buyerPhone");
  if (!buyerPhoneInput) return;

  let notice = document.getElementById("buyerPhoneNotice");
  if (!notice) {
    notice = document.createElement("small");
    notice.id = "buyerPhoneNotice";
    notice.className = "text-muted d-block mt-1";
    notice.style.fontSize = "0.8rem";
    notice.innerText =
      "Es necesario que pongas tu número de WhatsApp real para poder confirmar tu pedido.";
    buyerPhoneInput.parentNode.appendChild(notice);
  }
}

// Configura la fecha mínima de entrega = hoy (ahora delegado al nuevo
// selector con botones de horario; se mantiene esta función por si algún
// otro script la invoca).
function setMinDeliveryDate() {
  setupDeliveryDateTimePicker();
}

// FUNCIONES DEL CARRITO
function addToCart(productId) {
  const product = CATALOG.find((p) => p.id === productId);
  if (!product) return;

  const existing = cart.find((item) => item.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  saveCart();
  updateCartUI();

  // Abrir Offcanvas
  const cartOffcanvasEl = document.getElementById("cartOffcanvas");
  if (cartOffcanvasEl) {
    const cartOffcanvas =
      bootstrap.Offcanvas.getInstance(cartOffcanvasEl) ||
      new bootstrap.Offcanvas(cartOffcanvasEl);
    cartOffcanvas.show();
  }
}

function updateQuantity(productId, delta) {
  const item = cart.find((i) => i.id === productId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter((i) => i.id !== productId);
  }

  saveCart();
  updateCartUI();
}

function removeFromCart(productId) {
  cart = cart.filter((i) => i.id !== productId);
  saveCart();
  updateCartUI();
}

function clearCart() {
  cart = [];
  saveCart();
  updateCartUI();
}

function updateCartUI() {
  const container = document.getElementById("cart-items-container");
  const badge = document.getElementById("cart-badge");
  const totalDisplay = document.getElementById("cart-total-price");
  const pointsDisplay = document.getElementById("cart-points-earned");
  const checkoutBtn = document.getElementById("btn-proceed-checkout");

  // Conteo total
  const totalCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  if (badge) badge.innerText = totalCount;

  // Total en MXN
  const subtotal = cart.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0,
  );
  if (totalDisplay)
    totalDisplay.innerText = `$${subtotal.toLocaleString("es-MX")} MXN`;

  // Puntos calculados ($100 MXN = 1 Punto)
  const points = Math.floor(subtotal / 100);
  if (pointsDisplay)
    pointsDisplay.innerText = `+${points} ${CONFIG.loyaltyLabel || "Puntos"}`;

  if (checkoutBtn) {
    checkoutBtn.disabled = cart.length === 0;
  }

  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 text-muted">
        <i class="bi bi-bag-x display-3 mb-2 d-block opacity-50"></i>
        <p class="mb-0">Tu carrito está vacío</p>
        <small>Agrega platillos de esta sucursal para comenzar</small>
      </div>
    `;
    return;
  }

  container.innerHTML = cart
    .map(
      (item) => `
    <div class="cart-item-card d-flex align-items-center justify-content-between gap-3 mb-3 pb-3 border-bottom">
      <img src="${item.image}" alt="${item.name}" class="rounded" style="width:60px; height:60px; object-fit:cover;">
      <div class="flex-grow-1">
        <h6 class="m-0 fw-bold small">${item.name}</h6>
        <div class="text-brand fw-semibold small">$${(item.price * item.quantity).toLocaleString("es-MX")} MXN</div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="updateQuantity('${item.id}', -1)">-</button>
        <span class="small fw-bold">${item.quantity}</span>
        <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="updateQuantity('${item.id}', 1)">+</button>
        <button class="btn btn-sm text-danger border-0 p-1 ms-1" onclick="removeFromCart('${item.id}')"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  `,
    )
    .join("");
}

// RENDER DESTACADOS EN INDEX (los primeros platillos del menú de la sucursal activa)
function renderFeaturedProducts() {
  const container = document.getElementById("featured-products-container");
  if (!container) return;

  const featured = CATALOG.slice(0, 4);
  container.innerHTML = featured
    .map(
      (p) => `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="card h-100 border-0 shadow-sm rounded-4 overflow-hidden product-card d-flex flex-column justify-content-between">
        <img src="${p.image}" class="card-img-top" alt="${p.name}">
        <div class="card-body p-3 d-flex flex-column justify-content-between">
          <div>
            <span class="text-uppercase tracking-wider text-muted small d-block mb-1">${p.category}</span>
            <h6 class="fw-bold text-dark mb-2">${p.name}</h6>
          </div>
          <div>
            <div class="fw-bold text-brand fs-5 mb-3">$${p.price.toLocaleString("es-MX", { minimumFractionDigits: 2 })} MXN</div>
            <button class="btn btn-soft-pink w-100 py-2 rounded-pill fw-semibold btn-sm" onclick="addToCart('${p.id}')">
              <i class="bi bi-bag-plus me-1"></i> Agregar al Carrito
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
    )
    .join("");
}

// ABRIR MODAL CHECKOUT
function openCheckoutModal() {
  if (cart.length === 0) return;

  // Cerrar Offcanvas del carrito si está abierto
  const cartOffcanvasEl = document.getElementById("cartOffcanvas");
  if (cartOffcanvasEl) {
    const cartOffcanvas = bootstrap.Offcanvas.getInstance(cartOffcanvasEl);
    if (cartOffcanvas) cartOffcanvas.hide();
  }

  // Llenar resumen en el modal
  const itemsList = document.getElementById("checkout-items-list");
  const totalPrice = document.getElementById("checkout-total-price");
  const subtotal = cart.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0,
  );

  if (itemsList) {
    itemsList.innerHTML = cart
      .map(
        (item) => `
      <li class="d-flex justify-content-between mb-1">
        <span>${item.quantity}x ${item.name}</span>
        <span class="fw-semibold">$${(item.price * item.quantity).toLocaleString("es-MX")} MXN</span>
      </li>
    `,
      )
      .join("");
  }

  if (totalPrice) {
    totalPrice.innerText = `$${subtotal.toLocaleString("es-MX")} MXN`;
  }

  updateTiendaOptionLabel();
  toggleDeliveryFields();
  setupDeliveryDateTimePicker();
  if (orderModalObj) orderModalObj.show();
}

// TOGGLE CAMPOS DE ENVÍO
function toggleDeliveryFields() {
  const deliveryType = document.getElementById("deliveryType")?.value;
  const deliverySection = document.getElementById("deliveryFieldsSection");
  const reqFields = document.querySelectorAll(".delivery-req");

  if (deliveryType === "tienda") {
    if (deliverySection) deliverySection.classList.add("d-none");
    reqFields.forEach((f) => f.removeAttribute("required"));
  } else {
    if (deliverySection) deliverySection.classList.remove("d-none");
    reqFields.forEach((f) => f.setAttribute("required", "required"));
  }
}

// MANEJO DEL FORMULARIO Y REGISTRO
function setupFormHandler() {
  const orderForm = document.getElementById("orderForm");
  if (!orderForm) return;

  orderForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Verificación Honeypot anti-spam
    const honeypot = document.getElementById("formWebsite")?.value;
    if (honeypot) {
      console.warn("Spam detectado.");
      return;
    }

    const sucursal =
      typeof getSucursalActual === "function" ? getSucursalActual() : null;
    if (!sucursal) {
      alert(
        "No se detectó una sucursal seleccionada. Por favor elige tu sucursal antes de continuar.",
      );
      if (typeof openSucursalModal === "function") openSucursalModal();
      return;
    }

    // Validar fecha y hora de entrega (nuevo selector con botones)
    const fechaEntregaVal = document.getElementById("deliveryDate")?.value;
    const horaEntregaVal = document.getElementById("deliveryTime")?.value;
    if (!fechaEntregaVal) {
      alert("Elige una fecha de entrega válida.");
      document.getElementById("deliveryDateInput")?.focus();
      return;
    }
    if (!horaEntregaVal) {
      alert("Elige un horario de entrega disponible.");
      return;
    }

    // UI Loading & Spinner
    const submitBtn = document.getElementById("orderSubmitBtn");
    const spinner = document.getElementById("orderSubmitSpinner");
    const btnText = document.getElementById("orderSubmitText");

    if (submitBtn) submitBtn.disabled = true;
    if (spinner) spinner.classList.remove("d-none");
    if (btnText) btnText.innerHTML = "Procesando pedido...";

    // Estructurar datos del pedido
    const subtotal = cart.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0,
    );
    const orderData = {
      cliente: document.getElementById("buyerName")?.value.trim(),
      telefono: document.getElementById("buyerPhone")?.value.trim(),
      sucursal: sucursal.nombre,
      sucursalId: sucursal.id,
      tipoEntrega: document.getElementById("deliveryType")?.value,
      destinatario:
        document.getElementById("recipientName")?.value.trim() || "",
      telefonoDestinatario:
        document.getElementById("recipientPhone")?.value.trim() || "",
      direccion: document.getElementById("address")?.value.trim() || "",
      referencias: document.getElementById("addressRef")?.value.trim() || "",
      metodoPago: document.getElementById("paymentMethod")?.value,
      fechaEntrega: document.getElementById("deliveryDate")?.value,
      horaEntrega: document.getElementById("deliveryTime")?.value,
      dedicatoria: document.getElementById("cardMessage")?.value.trim() || "",
      productos: cart,
      total: subtotal,
    };

    try {
      // 1. Guardar en Backend (Google Apps Script)
      await API.crearPedido(orderData);

      // 2. Ocultar modal de checkout
      if (orderModalObj) orderModalObj.hide();

      // 3. Mostrar modal / alerta de éxito
      showSuccessModal();

      // 4. Limpiar formulario y carrito
      orderForm.reset();
      setupDeliveryDateTimePicker();
      clearCart();
    } catch (error) {
      alert(
        "Ocurrió un inconveniente al guardar tu pedido: " +
          error.message +
          ". Por favor, inténtalo de nuevo.",
      );
    } finally {
      // Restaurar UI del botón
      if (submitBtn) submitBtn.disabled = false;
      if (spinner) spinner.classList.add("d-none");
      if (btnText)
        btnText.innerHTML =
          'Confirmar Pedido <i class="bi bi-check-circle ms-2"></i>';
    }
  });
}

// MODAL DE CONFIRMACIÓN DE ÉXITO
function showSuccessModal() {
  const successModalHtml = `
    <div class="modal fade" id="successOrderModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content text-center p-4 border-0 shadow">
          <div class="modal-body">
            <div class="text-success mb-3">
              <i class="bi bi-check-circle-fill display-1"></i>
            </div>
            <h4 class="fw-bold mb-2">¡Pedido recibido con éxito!</h4>
            <p class="text-muted fs-6 mb-4">
              Te confirmaremos tu pedido por WhatsApp. Por favor, mantente al pendiente de tus mensajes.
            </p>
            <button type="button" class="btn btn-brand px-4 py-2 fw-semibold" data-bs-dismiss="modal">
              Entendido
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remover modal previo si existiera
  const oldModal = document.getElementById("successOrderModal");
  if (oldModal) oldModal.remove();

  document.body.insertAdjacentHTML("beforeend", successModalHtml);
  const successModalEl = document.getElementById("successOrderModal");
  const successModal = new bootstrap.Modal(successModalEl);
  successModal.show();
}

// WIDGET WHATSAPP FLOTANTE (Dudas generales) — usa el teléfono de la sucursal activa
function setupWhatsAppWidget() {
  const trigger = document.getElementById("wa-main-trigger");
  const popup = document.getElementById("wa-popup");
  const closeBtn = document.getElementById("close-popup");
  const widgetBtn = document.getElementById("wa-widget-btn");

  if (!trigger || !popup) return;

  trigger.addEventListener("click", () => {
    popup.classList.toggle("show");
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      popup.classList.remove("show");
    });
  }

  const sucursal =
    typeof getSucursalActual === "function" ? getSucursalActual() : null;
  const telefono = sucursal
    ? sucursal.telefono
    : CONFIG.sucursales[0] && CONFIG.sucursales[0].telefono;

  if (widgetBtn && telefono) {
    widgetBtn.href = `https://wa.me/${telefono}?text=${encodeURIComponent("¡Hola! 🌽 Quisiera consultar sobre disponibilidad de pedidos en Oaxaca.")}`;
  }
}

// ==========================================================================
// RESERVACIONES - Frontend (Modal)
// ==========================================================================
// RESERVACIÓN DE MESA — Formulario tipo asistente (wizard) por pasos:
// 1) Sucursal  2) Fecha y hora  3) Mesa  4) Datos del cliente
// ==========================================================================

let reservationModal = null;
let selectedTable = null;
let resCurrentStep = 1;

function openReservationModal() {
  const modalElem = document.getElementById("reservationModal");
  if (!modalElem) return;

  if (!reservationModal) {
    reservationModal = new bootstrap.Modal(modalElem);
  }

  // Poblar sucursales y preseleccionar la sucursal activa del cliente
  const selectSucursal = document.getElementById("resSucursal");
  if (selectSucursal && CONFIG.sucursales) {
    selectSucursal.innerHTML =
      '<option value="">Selecciona una sucursal...</option>' +
      CONFIG.sucursales
        .map((s) => `<option value="${s.nombre}">${s.nombre}</option>`)
        .join("");

    const actual = getSucursalActual();
    if (actual) {
      selectSucursal.value = actual.nombre;
    }
  }

  // Reset de campos ocultos y estado
  selectedTable = null;
  ["resFecha", "resHora", "resMesaSelect"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const mesaInfo = document.getElementById("resMesaInfo");
  if (mesaInfo) mesaInfo.textContent = "";

  setupReservationEvents();
  goToResStep(1);
  reservationModal.show();
}

function goToResStep(step) {
  resCurrentStep = step;

  document.querySelectorAll(".res-step-panel").forEach((panel) => {
    panel.classList.toggle(
      "d-none",
      Number(panel.getAttribute("data-step-panel")) !== step,
    );
  });

  document.querySelectorAll(".res-step").forEach((el) => {
    const n = Number(el.getAttribute("data-step"));
    el.classList.toggle("active", n === step);
    el.classList.toggle("done", n < step);
  });

  if (step === 4) {
    renderResSummary();
  }

  // Al abrir el paso, hacer scroll al inicio del modal-body
  const body = document.querySelector("#reservationModal .modal-body");
  if (body) body.scrollTop = 0;
}

function renderResSummary() {
  const box = document.getElementById("resResumenBox");
  if (!box) return;
  const sucursal = document.getElementById("resSucursal")?.value || "—";
  const fecha = document.getElementById("resFecha")?.value || "—";
  const hora = document.getElementById("resHora")?.value || "—";
  const mesa = selectedTable ? selectedTable.nombre : "—";
  const cap = selectedTable ? selectedTable.capacidad : null;

  box.innerHTML = `
    <div class="d-flex justify-content-between flex-wrap gap-1">
      <span><i class="bi bi-geo-alt text-brand me-1"></i>${sucursal}</span>
      <span><i class="bi bi-calendar3 text-brand me-1"></i>${fecha}</span>
      <span><i class="bi bi-clock text-brand me-1"></i>${hora} hrs</span>
      <span><i class="bi bi-grid-3x3-gap-fill text-brand me-1"></i>Mesa ${mesa}${cap ? ` (cap. ${cap})` : ""}</span>
    </div>
  `;
}

function setupReservationEvents() {
  const form = document.getElementById("reservationForm");
  if (form) {
    // Remover event listener previo para evitar duplicados
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    newForm.addEventListener("submit", submitReservation);
  }

  // --- Paso 1: sucursal ---
  const step1Next = document.getElementById("resStep1Next");
  if (step1Next) {
    step1Next.onclick = () => {
      const sucursal = document.getElementById("resSucursal")?.value;
      if (!sucursal) {
        alert("Selecciona una sucursal para continuar");
        return;
      }
      setupResFechaInput();
      goToResStep(2);
    };
  }

  // --- Botones "Atrás" ---
  document.querySelectorAll("[data-step-back]").forEach((btn) => {
    btn.onclick = () => {
      const target = Number(btn.getAttribute("data-step-back"));
      goToResStep(target);
    };
  });

  // --- Paso 2: fecha + hora ---
  const fechaInput = document.getElementById("resFechaInput");
  if (fechaInput) {
    fechaInput.addEventListener("change", onResFechaChange);
  }

  const step2Next = document.getElementById("resStep2Next");
  if (step2Next) {
    step2Next.onclick = () => {
      const hora = document.getElementById("resHora")?.value;
      if (!hora) {
        alert("Selecciona un horario disponible para continuar");
        return;
      }
      selectedTable = null;
      goToResStep(3);
      loadAvailableTables();
    };
  }

  // --- Paso 3: mesa ---
  const step3Next = document.getElementById("resStep3Next");
  if (step3Next) {
    step3Next.onclick = () => {
      if (!selectedTable) {
        alert("Selecciona una mesa disponible para continuar");
        return;
      }
      goToResStep(4);
    };
  }
}

// Inicializa el input de fecha (mínimo hoy) y dispara la primera carga de horarios
function setupResFechaInput() {
  const fechaInput = document.getElementById("resFechaInput");
  if (!fechaInput) return;
  const today = new Date().toISOString().split("T")[0];
  fechaInput.setAttribute("min", today);
  if (!fechaInput.value) {
    fechaInput.value = today;
  }
  onResFechaChange();
}

function onResFechaChange() {
  const fechaInput = document.getElementById("resFechaInput");
  const validezEl = document.getElementById("resFechaValidez");
  const hiddenFecha = document.getElementById("resFecha");
  const step2Next = document.getElementById("resStep2Next");

  const value = fechaInput?.value || "";
  const today = new Date().toISOString().split("T")[0];

  if (!value || value < today) {
    if (validezEl) {
      validezEl.className = "fecha-validez invalida";
      validezEl.innerHTML =
        '<i class="bi bi-x-circle-fill"></i> Elige una fecha igual o posterior a hoy';
    }
    if (hiddenFecha) hiddenFecha.value = "";
    if (step2Next) step2Next.disabled = true;
    resetHorariosUI();
    return;
  }

  if (validezEl) {
    validezEl.className = "fecha-validez valida";
    validezEl.innerHTML = '<i class="bi bi-check-circle-fill"></i> Fecha válida';
  }
  if (hiddenFecha) hiddenFecha.value = value;

  // Cambiar de fecha invalida la hora y mesa ya elegidas
  const hiddenHora = document.getElementById("resHora");
  if (hiddenHora) hiddenHora.value = "";
  selectedTable = null;
  if (step2Next) step2Next.disabled = true;

  loadReservationHours();
}

function resetHorariosUI() {
  const wrap = document.getElementById("resHorariosWrap");
  const vacio = document.getElementById("resHorariosVacio");
  const loading = document.getElementById("resHorariosLoading");
  if (wrap) wrap.classList.add("d-none");
  if (vacio) vacio.classList.remove("d-none");
  if (loading) loading.classList.add("d-none");
}

// Consulta al backend los horarios realmente disponibles (considerando
// mesas libres) para la sucursal y fecha elegidas, y los pinta como botones
// agrupados en Mañana / Tarde.
async function loadReservationHours() {
  const sucursal = document.getElementById("resSucursal")?.value;
  const fecha = document.getElementById("resFecha")?.value;

  const loading = document.getElementById("resHorariosLoading");
  const wrap = document.getElementById("resHorariosWrap");
  const vacio = document.getElementById("resHorariosVacio");
  const resumen = document.getElementById("resHorariosResumen");
  const grupoManana = document.querySelector("#resHorariosManana .res-hour-buttons");
  const grupoTarde = document.querySelector("#resHorariosTarde .res-hour-buttons");

  if (!sucursal || !fecha) {
    resetHorariosUI();
    return;
  }

  if (vacio) vacio.classList.add("d-none");
  if (wrap) wrap.classList.add("d-none");
  if (loading) loading.classList.remove("d-none");

  try {
    const url = `${CONFIG.API_URL}?action=getAvailableHours&sucursal=${encodeURIComponent(sucursal)}&fecha=${encodeURIComponent(fecha)}`;
    const response = await fetch(url, { method: "GET", redirect: "follow" });
    if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
    const result = await response.json();

    const horas = result && result.success ? result.horas || [] : [];

    if (loading) loading.classList.add("d-none");

    if (!horas.length) {
      if (resumen)
        resumen.innerHTML =
          '<span class="text-danger">No hay horarios disponibles para esta fecha. Intenta con otro día.</span>';
      if (grupoManana) grupoManana.innerHTML = "";
      if (grupoTarde) grupoTarde.innerHTML = "";
      if (wrap) wrap.classList.remove("d-none");
      return;
    }

    const manana = horas.filter((h) => parseInt(h.split(":")[0]) < 13);
    const tarde = horas.filter((h) => parseInt(h.split(":")[0]) >= 13);

    const renderBtn = (h) =>
      `<button type="button" class="res-hour-btn" data-hora="${h}">${h}</button>`;

    if (grupoManana) {
      grupoManana.innerHTML = manana.map(renderBtn).join("");
      document
        .getElementById("resHorariosManana")
        .classList.toggle("d-none", manana.length === 0);
    }
    if (grupoTarde) {
      grupoTarde.innerHTML = tarde.map(renderBtn).join("");
      document
        .getElementById("resHorariosTarde")
        .classList.toggle("d-none", tarde.length === 0);
    }

    // Listeners de selección de hora
    document.querySelectorAll("#resHorariosWrap .res-hour-btn").forEach((btn) => {
      btn.addEventListener("click", () => selectResHora(btn.getAttribute("data-hora")));
    });

    const hoyStr = new Date().toISOString().split("T")[0];
    const etiquetaFecha = fecha === hoyStr ? "hoy" : `el ${fecha}`;
    if (resumen) {
      resumen.innerHTML = `<i class="bi bi-check-circle text-success"></i> ${horas.length} horarios disponibles para ${etiquetaFecha}`;
    }

    if (wrap) wrap.classList.remove("d-none");
  } catch (error) {
    if (loading) loading.classList.add("d-none");
    if (resumen) {
      resumen.innerHTML = `<span class="text-danger">Error al consultar horarios: ${error.message}</span>`;
    }
    if (wrap) wrap.classList.remove("d-none");
    console.error("Error en loadReservationHours:", error);
  }
}

function selectResHora(hora) {
  const hiddenHora = document.getElementById("resHora");
  if (hiddenHora) hiddenHora.value = hora;

  document.querySelectorAll("#resHorariosWrap .res-hour-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.getAttribute("data-hora") === hora);
  });

  const step2Next = document.getElementById("resStep2Next");
  if (step2Next) step2Next.disabled = false;
}

async function loadAvailableTables() {
  const sucursal = document.getElementById("resSucursal")?.value;
  const fecha = document.getElementById("resFecha")?.value;
  const hora = document.getElementById("resHora")?.value;

  const container = document.getElementById("resFloorGrid");
  const loading = document.getElementById("resFloorLoading");

  if (!container || !loading) return;

  if (!sucursal || !fecha || !hora) {
    container.innerHTML =
      '<p class="text-muted text-center py-3">Selecciona sucursal, fecha y hora para ver disponibilidad</p>';
    container.classList.remove("d-none");
    loading.classList.add("d-none");
    return;
  }

  container.innerHTML = "";
  container.classList.add("d-none");
  loading.classList.remove("d-none");

  try {
    // --- LLAMADA DIRECTA A LA API ---
    const url = `${CONFIG.API_URL}?action=getAvailableTables&sucursal=${encodeURIComponent(sucursal)}&fecha=${encodeURIComponent(fecha)}&hora=${encodeURIComponent(hora)}`;

    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`Error HTTP: ${response.status}`);
    }

    const result = await response.json();

    loading.classList.add("d-none");

    let mesas = [];
    if (result.success === true && result.mesas) {
      mesas = result.mesas;
    } else if (Array.isArray(result)) {
      mesas = result;
    }

    if (result.error || result.status === "error") {
      const errorMsg =
        result.error || result.message || "Error al cargar mesas";
      container.innerHTML = `<p class="text-danger text-center">${errorMsg}</p>`;
      container.classList.remove("d-none");
      return;
    }

    if (!mesas || mesas.length === 0) {
      container.innerHTML =
        '<p class="text-muted text-center">No hay mesas disponibles en esta sucursal para la fecha y hora seleccionada</p>';
      container.classList.remove("d-none");
      return;
    }

    // --- RENDERIZAR MESAS ---
    container.innerHTML = mesas
      .map(
        (mesa) => `
        <div class="floor-table-card ${mesa.disponible ? "available" : "reserved"}
             ${!mesa.disponible ? "cursor-not-allowed" : ""}"
             data-mesa="${mesa.nombre}"
             data-capacidad="${mesa.capacidad}"
             onclick="${mesa.disponible ? `selectTable('${mesa.nombre}', ${mesa.capacidad})` : ""}">
            <div class="table-name">${mesa.nombre}</div>
            <div class="table-capacity"><i class="bi bi-people"></i> ${mesa.capacidad}</div>
            ${
              mesa.disponible
                ? `<div class="table-status" style="color:#2e7d32;">✓ Disponible</div>`
                : `<div class="table-status" style="color:#c62828;">✗ ${mesa.mensaje || "Reservada"}</div>`
            }
        </div>
    `,
      )
      .join("");

    container.classList.remove("d-none");
  } catch (error) {
    loading.classList.add("d-none");
    container.innerHTML = `<p class="text-danger text-center">Error al cargar mesas: ${error.message}</p>`;
    container.classList.remove("d-none");
    console.error("Error en loadAvailableTables:", error);
  }
}

function selectTable(mesa, capacidad) {
  selectedTable = { nombre: mesa, capacidad: capacidad };

  // Actualizar UI
  document.querySelectorAll(".floor-table-card").forEach((el) => {
    el.classList.toggle("selected", el.dataset.mesa === mesa);
  });

  const hiddenMesa = document.getElementById("resMesaSelect");
  if (hiddenMesa) hiddenMesa.value = mesa;

  // Actualizar info
  const info = document.getElementById("resMesaInfo");
  if (info) {
    info.textContent = `Mesa seleccionada: ${mesa} (${capacidad} personas)`;
  }

  // Actualizar capacidad máxima
  const personasInput = document.getElementById("resPersonas");
  if (personasInput) {
    personasInput.max = capacidad;
    if (parseInt(personasInput.value) > capacidad) {
      personasInput.value = capacidad;
    }
  }

  const step3Next = document.getElementById("resStep3Next");
  if (step3Next) step3Next.disabled = false;
}

async function submitReservation(e) {
  e.preventDefault();

  // Verificar honeypot
  const honeypot = document.getElementById("resWebsite")?.value;
  if (honeypot) {
    console.warn("Spam detectado en reservación");
    return;
  }

  if (!selectedTable) {
    alert("Por favor selecciona una mesa disponible");
    goToResStep(3);
    return;
  }

  const data = {
    sucursal: document.getElementById("resSucursal").value,
    cliente: document.getElementById("resCliente").value.trim(),
    telefono: document.getElementById("resTelefono").value.trim(),
    fecha: document.getElementById("resFecha").value,
    hora: document.getElementById("resHora").value,
    mesa: selectedTable.nombre,
    personas: document.getElementById("resPersonas").value,
    notas: document.getElementById("resNotas").value.trim(),
  };

  // Validar
  if (!data.cliente || !data.telefono || !data.fecha || !data.hora) {
    alert("Por favor completa todos los campos requeridos");
    return;
  }

  const btn = document.getElementById("resSubmitBtn");
  const spinner = document.getElementById("resSubmitSpinner");
  const text = document.getElementById("resSubmitText");

  btn.disabled = true;
  spinner.classList.remove("d-none");
  text.innerHTML = "Registrando...";

  try {
    const result = await API.crearReservacion(data);

    if (result.success) {
      reservationModal.hide();
      showReservationSuccessModal(result);
      document.getElementById("reservationForm").reset();
      selectedTable = null;
      // Resetear el grid
      const grid = document.getElementById("resFloorGrid");
      if (grid) grid.innerHTML = "";
    } else {
      alert("Error: " + (result.error || "No se pudo crear la reservación"));
    }
  } catch (error) {
    alert("Error al crear la reservación: " + error.message);
  } finally {
    btn.disabled = false;
    spinner.classList.add("d-none");
    text.innerHTML =
      '<i class="bi bi-check-circle me-2"></i>Confirmar Reservación';
  }
}

function showReservationSuccessModal(result) {
  const html = `
        <div class="modal fade" id="reservationSuccessModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content text-center p-4 border-0 shadow">
                    <div class="modal-body">
                        <div class="text-success mb-3">
                            <i class="bi bi-check-circle-fill display-1"></i>
                        </div>
                        <h4 class="fw-bold mb-2">¡Reservación confirmada!</h4>
                        <p class="text-muted fs-6 mb-2">
                            Mesa <strong>${result.data.mesa}</strong> reservada para <strong>${result.data.personas}</strong> personas
                        </p>
                        <p class="text-muted small">
                            ${result.data.fecha} a las ${result.data.hora} hrs
                        </p>
                        <p class="text-muted small mb-4">
                            Recibirás un mensaje de confirmación por WhatsApp.
                        </p>
                        <button type="button" class="btn btn-brand px-4 py-2 fw-semibold" data-bs-dismiss="modal">
                            Entendido
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

  const oldModal = document.getElementById("reservationSuccessModal");
  if (oldModal) oldModal.remove();

  document.body.insertAdjacentHTML("beforeend", html);
  const modalEl = document.getElementById("reservationSuccessModal");
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

// ==========================================================================
// FECHA Y HORA DE ENTREGA DEL PEDIDO — mismo estilo de fecha validada +
// botones de horario que la reservación, pero sin mesa (solo disponibilidad
// dentro del horario de atención del restaurante).
// ==========================================================================

function generarFranjasHorario(inicioMin, finMin, pasoMin) {
  const franjas = [];
  for (let m = inicioMin; m <= finMin; m += pasoMin) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    franjas.push(String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0"));
  }
  return franjas;
}

function setupDeliveryDateTimePicker() {
  const dateInput = document.getElementById("deliveryDateInput");
  if (!dateInput) return;

  const today = new Date().toISOString().split("T")[0];
  dateInput.setAttribute("min", today);
  if (!dateInput.value) dateInput.value = today;

  dateInput.removeEventListener("change", onDeliveryDateChange);
  dateInput.addEventListener("change", onDeliveryDateChange);

  onDeliveryDateChange();
}

function onDeliveryDateChange() {
  const dateInput = document.getElementById("deliveryDateInput");
  const validezEl = document.getElementById("deliveryDateValidez");
  const hiddenDate = document.getElementById("deliveryDate");
  const hiddenTime = document.getElementById("deliveryTime");

  const value = dateInput?.value || "";
  const today = new Date().toISOString().split("T")[0];

  if (!value || value < today) {
    if (validezEl) {
      validezEl.className = "fecha-validez invalida";
      validezEl.innerHTML =
        '<i class="bi bi-x-circle-fill"></i> Elige una fecha igual o posterior a hoy';
    }
    if (hiddenDate) hiddenDate.value = "";
    if (hiddenTime) hiddenTime.value = "";
    const wrap = document.getElementById("deliveryHorariosWrap");
    const vacio = document.getElementById("deliveryHorariosVacio");
    if (wrap) wrap.classList.add("d-none");
    if (vacio) vacio.classList.remove("d-none");
    return;
  }

  if (validezEl) {
    validezEl.className = "fecha-validez valida";
    validezEl.innerHTML = '<i class="bi bi-check-circle-fill"></i> Fecha válida';
  }
  if (hiddenDate) hiddenDate.value = value;
  if (hiddenTime) hiddenTime.value = "";

  renderDeliveryHours(value);
}

function renderDeliveryHours(fecha) {
  const vacio = document.getElementById("deliveryHorariosVacio");
  const wrap = document.getElementById("deliveryHorariosWrap");
  const grupoManana = document.getElementById("deliveryHorariosManana");
  const grupoTarde = document.getElementById("deliveryHorariosTarde");
  const resumen = document.getElementById("deliveryHorariosResumen");

  // Horario de atención: 9:00 a 21:00, franjas cada 30 minutos
  let franjas = generarFranjasHorario(9 * 60, 21 * 60, 30);

  const today = new Date().toISOString().split("T")[0];
  if (fecha === today) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    franjas = franjas.filter((h) => {
      const m = parseInt(h.split(":")[0]) * 60 + parseInt(h.split(":")[1]);
      return m >= nowMinutes + 30;
    });
  }

  if (vacio) vacio.classList.add("d-none");

  if (!franjas.length) {
    if (resumen)
      resumen.innerHTML =
        '<span class="text-danger">No hay horarios disponibles para hoy. Intenta con otra fecha.</span>';
    if (grupoManana) grupoManana.innerHTML = "";
    if (grupoTarde) grupoTarde.innerHTML = "";
    if (wrap) wrap.classList.remove("d-none");
    return;
  }

  const manana = franjas.filter((h) => parseInt(h.split(":")[0]) < 13);
  const tarde = franjas.filter((h) => parseInt(h.split(":")[0]) >= 13);

  const renderBtn = (h) =>
    `<button type="button" class="res-hour-btn" data-hora="${h}">${h}</button>`;

  if (grupoManana) grupoManana.innerHTML = manana.map(renderBtn).join("");
  if (grupoTarde) grupoTarde.innerHTML = tarde.map(renderBtn).join("");

  document.querySelectorAll("#deliveryHorariosWrap .res-hour-btn").forEach((btn) => {
    btn.addEventListener("click", () => selectDeliveryHora(btn.getAttribute("data-hora")));
  });

  const etiquetaFecha = fecha === today ? "hoy" : `el ${fecha}`;
  if (resumen) {
    resumen.innerHTML = `<i class="bi bi-check-circle text-success"></i> ${franjas.length} horarios disponibles para ${etiquetaFecha}`;
  }

  if (wrap) wrap.classList.remove("d-none");
}

function selectDeliveryHora(hora) {
  const hiddenTime = document.getElementById("deliveryTime");
  if (hiddenTime) hiddenTime.value = hora;

  document.querySelectorAll("#deliveryHorariosWrap .res-hour-btn").forEach((btn) => {
    btn.classList.toggle("selected", btn.getAttribute("data-hora") === hora);
  });
}