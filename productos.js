document.addEventListener("DOMContentLoaded", () => {
  populateCategoryFilter();
  applyFilters();
});

// Llena el <select> de categorías dinámicamente a partir de CATEGORIES
// para que nunca se desincronice con los datos reales del catálogo.
function populateCategoryFilter() {
  const select = document.getElementById("categoryFilter");
  if (!select) return;

  const options = CATEGORIES
    .filter(cat => cat.name !== "Todos")
    .map(cat => `<option value="${cat.name}">${cat.name} (${cat.count})</option>`)
    .join('');

  select.innerHTML = `<option value="all">Todas las categorías</option>${options}`;
}

function applyFilters() {
  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const priceRange = document.getElementById("priceRange");
  const sortOrder = document.getElementById("sortOrder");
  const priceDisplay = document.getElementById("priceDisplay");

  const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
  const category = categoryFilter ? categoryFilter.value : "all";
  const maxPrice = priceRange ? Number(priceRange.value) : Infinity;
  const order = sortOrder ? sortOrder.value : "default";

  if (priceDisplay && priceRange) {
    priceDisplay.innerText = `$${Number(priceRange.value).toLocaleString('es-MX')} MXN`;
  }

  let filtered = CATALOG.filter(p => {
    const matchCategory = category === "all" || p.category === category;
    const matchSearch = p.name.toLowerCase().includes(query);
    const matchPrice = p.price <= maxPrice;
    return matchCategory && matchSearch && matchPrice;
  });

  if (order === "low-high") {
    filtered = filtered.slice().sort((a, b) => a.price - b.price);
  } else if (order === "high-low") {
    filtered = filtered.slice().sort((a, b) => b.price - a.price);
  }

  renderGrid(filtered);
  updateResultsUI(filtered.length);
}

function updateResultsUI(count) {
  const countLabel = document.getElementById("productCount");
  const noResults = document.getElementById("noResults");
  const container = document.getElementById("catalog-container");

  if (countLabel) countLabel.innerText = count;
  if (noResults) noResults.classList.toggle("d-none", count !== 0);
  if (container) container.classList.toggle("d-none", count === 0);
}

function renderGrid(products) {
  const container = document.getElementById("catalog-container");
  if (!container) return;

  container.innerHTML = products.map(p => `
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

function resetFilters() {
  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const priceRange = document.getElementById("priceRange");
  const sortOrder = document.getElementById("sortOrder");

  if (searchInput) searchInput.value = "";
  if (categoryFilter) categoryFilter.value = "all";
  if (priceRange) priceRange.value = priceRange.max;
  if (sortOrder) sortOrder.value = "default";

  applyFilters();
}