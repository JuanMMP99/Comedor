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

// Configura la fecha mínima de entrega = hoy
function setMinDeliveryDate() {
  const dateInput = document.getElementById("deliveryDate");
  if (!dateInput) return;
  const todayStr = new Date().toISOString().split("T")[0];
  dateInput.setAttribute("min", todayStr);
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

let reservationModal = null;
let selectedTable = null;

function openReservationModal() {
  const modalElem = document.getElementById("reservationModal");
  if (!modalElem) {
    console.warn("Modal de reservación no encontrado");
    return;
  }

  // Inicializar el modal si no existe
  if (!reservationModal) {
    reservationModal = new bootstrap.Modal(modalElem);
  }

  // Poblar sucursales
  const selectSucursal = document.getElementById("resSucursal");
  if (selectSucursal && CONFIG.sucursales) {
    selectSucursal.innerHTML = CONFIG.sucursales
      .map((s) => `<option value="${s.nombre}">${s.nombre}</option>`)
      .join("");
    // Seleccionar la sucursal actual si existe
    const actual = getSucursalActual();
    if (actual) {
      selectSucursal.value = actual.nombre;
    }
  }

  // Configurar fecha mínima (hoy)
  const fechaInput = document.getElementById("resFecha");
  if (fechaInput) {
    const today = new Date().toISOString().split("T")[0];
    fechaInput.setAttribute("min", today);
    fechaInput.value = today;
  }

  // Configurar hora por defecto (una hora después)
  const horaInput = document.getElementById("resHora");
  if (horaInput) {
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const horas = String(now.getHours()).padStart(2, "0");
    const minutos = String(now.getMinutes()).padStart(2, "0");
    horaInput.value = `${horas}:${minutos}`;
  }

  // Limpiar selección
  selectedTable = null;

  // Cargar mesas disponibles
  loadAvailableTables();

  // Configurar eventos
  setupReservationEvents();

  reservationModal.show();
}

function setupReservationEvents() {
  const form = document.getElementById("reservationForm");
  if (form) {
    // Remover event listener previo para evitar duplicados
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    newForm.addEventListener("submit", submitReservation);
  }

  // Eventos para refrescar mesas
  const sucursalSelect = document.getElementById("resSucursal");
  const fechaInput = document.getElementById("resFecha");
  const horaInput = document.getElementById("resHora");

  [sucursalSelect, fechaInput, horaInput].forEach((el) => {
    if (el) {
      el.addEventListener("change", loadAvailableTables);
    }
  });
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
  loading.classList.remove("d-none");

  try {
    const result = await API.getAvailableTables(sucursal, fecha, hora);
    loading.classList.add("d-none");

    if (!result.success) {
      container.innerHTML = `<p class="text-danger text-center">${result.error}</p>`;
      container.classList.remove("d-none");
      return;
    }

    if (!result.mesas || result.mesas.length === 0) {
      container.innerHTML =
        '<p class="text-muted text-center">No hay mesas disponibles en esta sucursal</p>';
      container.classList.remove("d-none");
      return;
    }

    // Renderizar mesas
    container.innerHTML = result.mesas
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
                    : `<div class="table-status" style="color:#c62828;">✗ Reservada</div>
                     ${
                       mesa.horaLiberacion
                         ? `<div class="table-timer">Libera ~${new Date(mesa.horaLiberacion).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</div>`
                         : ""
                     }`
                }
            </div>
        `,
      )
      .join("");

    container.classList.remove("d-none");

    // Actualizar selector de mesas
    const selectMesa = document.getElementById("resMesaSelect");
    if (selectMesa) {
      const disponibles = result.mesas.filter((m) => m.disponible);
      selectMesa.innerHTML =
        '<option value="">— Elige una mesa —</option>' +
        disponibles
          .map(
            (m) =>
              `<option value="${m.nombre}" data-capacidad="${m.capacidad}">${m.nombre} (${m.capacidad} pers.)</option>`,
          )
          .join("");
      selectMesa.onchange = function () {
        const option = this.options[this.selectedIndex];
        if (option && option.value) {
          selectTable(option.value, parseInt(option.dataset.capacidad));
        }
      };
    }
  } catch (error) {
    loading.classList.add("d-none");
    container.innerHTML = `<p class="text-danger text-center">Error al cargar mesas: ${error.message}</p>`;
    container.classList.remove("d-none");
  }
}

function selectTable(mesa, capacidad) {
  selectedTable = { nombre: mesa, capacidad: capacidad };

  // Actualizar UI
  document.querySelectorAll(".floor-table-card").forEach((el) => {
    el.classList.toggle("selected", el.dataset.mesa === mesa);
  });

  // Actualizar selector
  const select = document.getElementById("resMesaSelect");
  if (select) {
    select.value = mesa;
  }

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
