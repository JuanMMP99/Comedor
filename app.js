// Estado del Carrito respaldado en LocalStorage — SEPARADO POR SUCURSAL,
// porque cada sucursal tiene su propio menú y no tiene sentido mezclar
// platillos de dos sucursales en un mismo pedido.
let cart = [];
let orderModalObj = null;

function cartStorageKey() {
  const id = typeof getSucursalActualId === "function" ? getSucursalActualId() : "default";
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

  const modalElem = document.getElementById('orderModal');
  if (modalElem) {
    orderModalObj = new bootstrap.Modal(modalElem);
  }

  // Renderizar Vistas
  if (document.getElementById("featured-products-container")) renderFeaturedProducts();
  if (document.getElementById("sucursales-container")) renderSucursalesSection();

  updateCartUI();
  setupWhatsAppWidget();
  setupFormHandler();
  setMinDeliveryDate();
  enhancePhoneInputNotice();
  registrarVisita();
});

// Registra la visita a la página actual (no bloquea ni interrumpe la carga si falla)
function registrarVisita() {
  const sucursal = typeof getSucursalActual === "function" ? getSucursalActual() : null;
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

  container.innerHTML = CONFIG.sucursales.map((s) => `
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
  `).join('');
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
    notice.innerText = "Es necesario que pongas tu número de WhatsApp real para poder confirmar tu pedido.";
    buyerPhoneInput.parentNode.appendChild(notice);
  }
}

// Configura la fecha mínima de entrega = hoy
function setMinDeliveryDate() {
  const dateInput = document.getElementById("deliveryDate");
  if (!dateInput) return;
  const todayStr = new Date().toISOString().split('T')[0];
  dateInput.setAttribute('min', todayStr);
}

// FUNCIONES DEL CARRITO
function addToCart(productId) {
  const product = CATALOG.find(p => p.id === productId);
  if (!product) return;

  const existing = cart.find(item => item.id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  saveCart();
  updateCartUI();

  // Abrir Offcanvas
  const cartOffcanvasEl = document.getElementById('cartOffcanvas');
  if (cartOffcanvasEl) {
    const cartOffcanvas = bootstrap.Offcanvas.getInstance(cartOffcanvasEl) || new bootstrap.Offcanvas(cartOffcanvasEl);
    cartOffcanvas.show();
  }
}

function updateQuantity(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.id !== productId);
  }

  saveCart();
  updateCartUI();
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.id !== productId);
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
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  if (totalDisplay) totalDisplay.innerText = `$${subtotal.toLocaleString('es-MX')} MXN`;

  // Puntos calculados ($100 MXN = 1 Punto)
  const points = Math.floor(subtotal / 100);
  if (pointsDisplay) pointsDisplay.innerText = `+${points} ${CONFIG.loyaltyLabel || 'Puntos'}`;

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

  container.innerHTML = cart.map(item => `
    <div class="cart-item-card d-flex align-items-center justify-content-between gap-3 mb-3 pb-3 border-bottom">
      <img src="${item.image}" alt="${item.name}" class="rounded" style="width:60px; height:60px; object-fit:cover;">
      <div class="flex-grow-1">
        <h6 class="m-0 fw-bold small">${item.name}</h6>
        <div class="text-brand fw-semibold small">$${(item.price * item.quantity).toLocaleString('es-MX')} MXN</div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="updateQuantity('${item.id}', -1)">-</button>
        <span class="small fw-bold">${item.quantity}</span>
        <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="updateQuantity('${item.id}', 1)">+</button>
        <button class="btn btn-sm text-danger border-0 p-1 ms-1" onclick="removeFromCart('${item.id}')"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  `).join('');
}

// RENDER DESTACADOS EN INDEX (los primeros platillos del menú de la sucursal activa)
function renderFeaturedProducts() {
  const container = document.getElementById("featured-products-container");
  if (!container) return;

  const featured = CATALOG.slice(0, 4);
  container.innerHTML = featured.map(p => `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="card h-100 border-0 shadow-sm rounded-4 overflow-hidden product-card d-flex flex-column justify-content-between">
        <img src="${p.image}" class="card-img-top" alt="${p.name}">
        <div class="card-body p-3 d-flex flex-column justify-content-between">
          <div>
            <span class="text-uppercase tracking-wider text-muted small d-block mb-1">${p.category}</span>
            <h6 class="fw-bold text-dark mb-2">${p.name}</h6>
          </div>
          <div>
            <div class="fw-bold text-brand fs-5 mb-3">$${p.price.toLocaleString('es-MX', {minimumFractionDigits: 2})} MXN</div>
            <button class="btn btn-soft-pink w-100 py-2 rounded-pill fw-semibold btn-sm" onclick="addToCart('${p.id}')">
              <i class="bi bi-bag-plus me-1"></i> Agregar al Carrito
            </button>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

// ABRIR MODAL CHECKOUT
function openCheckoutModal() {
  if (cart.length === 0) return;

  // Cerrar Offcanvas del carrito si está abierto
  const cartOffcanvasEl = document.getElementById('cartOffcanvas');
  if (cartOffcanvasEl) {
    const cartOffcanvas = bootstrap.Offcanvas.getInstance(cartOffcanvasEl);
    if (cartOffcanvas) cartOffcanvas.hide();
  }

  // Llenar resumen en el modal
  const itemsList = document.getElementById("checkout-items-list");
  const totalPrice = document.getElementById("checkout-total-price");
  const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  if (itemsList) {
    itemsList.innerHTML = cart.map(item => `
      <li class="d-flex justify-content-between mb-1">
        <span>${item.quantity}x ${item.name}</span>
        <span class="fw-semibold">$${(item.price * item.quantity).toLocaleString('es-MX')} MXN</span>
      </li>
    `).join('');
  }

  if (totalPrice) {
    totalPrice.innerText = `$${subtotal.toLocaleString('es-MX')} MXN`;
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
    reqFields.forEach(f => f.removeAttribute("required"));
  } else {
    if (deliverySection) deliverySection.classList.remove("d-none");
    reqFields.forEach(f => f.setAttribute("required", "required"));
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

    const sucursal = typeof getSucursalActual === "function" ? getSucursalActual() : null;
    if (!sucursal) {
      alert("No se detectó una sucursal seleccionada. Por favor elige tu sucursal antes de continuar.");
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
    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const orderData = {
      cliente: document.getElementById("buyerName")?.value.trim(),
      telefono: document.getElementById("buyerPhone")?.value.trim(),
      sucursal: sucursal.nombre,
      sucursalId: sucursal.id,
      tipoEntrega: document.getElementById("deliveryType")?.value,
      destinatario: document.getElementById("recipientName")?.value.trim() || "",
      telefonoDestinatario: document.getElementById("recipientPhone")?.value.trim() || "",
      direccion: document.getElementById("address")?.value.trim() || "",
      referencias: document.getElementById("addressRef")?.value.trim() || "",
      metodoPago: document.getElementById("paymentMethod")?.value,
      fechaEntrega: document.getElementById("deliveryDate")?.value,
      horaEntrega: document.getElementById("deliveryTime")?.value,
      dedicatoria: document.getElementById("cardMessage")?.value.trim() || "",
      productos: cart,
      total: subtotal
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
      alert("Ocurrió un inconveniente al guardar tu pedido: " + error.message + ". Por favor, inténtalo de nuevo.");
    } finally {
      // Restaurar UI del botón
      if (submitBtn) submitBtn.disabled = false;
      if (spinner) spinner.classList.add("d-none");
      if (btnText) btnText.innerHTML = 'Confirmar Pedido <i class="bi bi-check-circle ms-2"></i>';
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

  const sucursal = typeof getSucursalActual === "function" ? getSucursalActual() : null;
  const telefono = sucursal ? sucursal.telefono : (CONFIG.sucursales[0] && CONFIG.sucursales[0].telefono);

  if (widgetBtn && telefono) {
    widgetBtn.href = `https://wa.me/${telefono}?text=${encodeURIComponent('¡Hola! 🌽 Quisiera consultar sobre disponibilidad de pedidos en Oaxaca.')}`;
  }
}
