// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  ingredients: [],
  filter: "all",
  search: "",
  selectedLocationId: localStorage.getItem("kroger_location_id") ?? "",
  selectedLocationName: localStorage.getItem("kroger_location_name") ?? "",
};

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json();
}

// ── Load ingredients ──────────────────────────────────────────────────────────
async function loadIngredients() {
  showState("loading");
  try {
    state.ingredients = await api("/api/notion/ingredients");
    renderList();
    updateProgress();
    document.getElementById("toolbar").style.display = "flex";
    document.getElementById("progress-bar-wrap").style.display = "block";
    document.getElementById("progress-counter").style.display = "flex";
    if (state.selectedLocationName) updateLocationDisplay();
  } catch (e) {
    showState("error");
    document.getElementById("error-message").textContent = e.message;
  }
}

// ── Render ────────────────────────────────────────────────────────────────────
function getFiltered() {
  return state.ingredients.filter((ing) => {
    if (state.filter === "unlinked" && ing.krogerProductId) return false;
    if (state.filter === "linked" && !ing.krogerProductId) return false;
    if (state.search && !ing.name.toLowerCase().includes(state.search.toLowerCase())) return false;
    return true;
  });
}

function renderList() {
  hideStates();
  const list = document.getElementById("ingredient-list");
  const filtered = getFiltered();

  if (filtered.length === 0) {
    list.innerHTML = "";
    showState("empty");
    return;
  }

  // Diff: only add/remove rows that changed, preserve existing ones
  const existing = new Map([...list.querySelectorAll(".ingredient-row")].map((el) => [el.dataset.id, el]));
  const toKeep = new Set(filtered.map((i) => i.id));

  // Remove rows no longer in filtered set
  existing.forEach((el, id) => { if (!toKeep.has(id)) el.remove(); });

  // Add/update rows
  filtered.forEach((ing, idx) => {
    if (existing.has(ing.id)) {
      // Already rendered — just reorder
      list.appendChild(existing.get(ing.id));
    } else {
      const row = buildIngredientRow(ing);
      list.appendChild(row);
    }
  });
}

function buildIngredientRow(ing) {
  const tmpl = document.getElementById("ingredient-template");
  const row = tmpl.content.cloneNode(true).querySelector(".ingredient-row");

  row.dataset.id = ing.id;
  if (ing.krogerProductId) row.classList.add("is-linked");

  row.querySelector(".ingredient-name").textContent = ing.name;

  if (ing.krogerProductId) {
    row.querySelector(".ingredient-linked-name").textContent = ing.krogerProductName;
    if (ing.krogerProductImage) {
      const img = row.querySelector(".thumb-img");
      img.src = ing.krogerProductImage;
      img.style.display = "block";
      img.onerror = () => { img.style.display = "none"; };
      row.querySelector(".thumb-placeholder").style.display = "none";
    }
  }

  row.querySelector(".search-btn").addEventListener("click", () => doSearch(ing, row));

  return row;
}

// ── Search ────────────────────────────────────────────────────────────────────
async function doSearch(ing, row) {
  const btn = row.querySelector(".search-btn");
  const resultsWrap = row.querySelector(".product-results");
  const grid = row.querySelector(".product-grid");
  const noResults = row.querySelector(".no-results");
  const errorEl = row.querySelector(".ingredient-error");

  btn.textContent = "Searching…";
  btn.disabled = true;
  errorEl.style.display = "none";

  try {
    const params = new URLSearchParams({ q: ing.name });
    if (state.selectedLocationId) params.set("locationId", state.selectedLocationId);

    const products = await api(`/api/kroger/search?${params}`);

    grid.innerHTML = "";
    noResults.style.display = products.length === 0 ? "block" : "none";

    let selectedProduct = null;
    const saveBtn = row.querySelector(".save-btn");

    products.forEach((p) => {
      const card = buildProductCard(p);
      card.addEventListener("click", () => {
        grid.querySelectorAll(".product-card").forEach((c) => c.classList.remove("selected"));
        card.classList.add("selected");
        selectedProduct = p;
        saveBtn.style.display = "inline-flex";
      });
      grid.appendChild(card);
    });

    saveBtn.style.display = "none";
    saveBtn.onclick = () => doSave(ing, row, selectedProduct);

    resultsWrap.style.display = "block";
    btn.textContent = "Cancel";
    btn.disabled = false;
    btn.onclick = () => {
      resultsWrap.style.display = "none";
      saveBtn.style.display = "none";
      btn.textContent = ing.krogerProductId ? "Re-link" : "Search";
      btn.onclick = null;
      btn.addEventListener("click", () => doSearch(ing, row));
    };
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.style.display = "block";
    btn.textContent = ing.krogerProductId ? "Re-link" : "Search";
    btn.disabled = false;
  }
}

function buildProductCard(p) {
  const tmpl = document.getElementById("product-template");
  const card = tmpl.content.cloneNode(true).querySelector(".product-card");

  card.querySelector(".product-name").textContent = p.description;
  card.querySelector(".product-meta").textContent =
    [p.brand, p.size].filter(Boolean).join(" · ");
  if (p.price != null) {
    card.querySelector(".product-price").textContent = `$${parseFloat(p.price).toFixed(2)}`;
  }

  const img = card.querySelector(".product-img");
  const placeholder = card.querySelector(".product-img-placeholder");
  if (p.imageUrl) {
    img.src = p.imageUrl;
    img.style.display = "block";
    placeholder.style.display = "none";
    img.onerror = () => { img.style.display = "none"; placeholder.style.display = "block"; };
  } else {
    img.style.display = "none";
  }

  return card;
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function doSave(ing, row, product) {
  if (!product) return;

  const saveBtn = row.querySelector(".save-btn");
  const savedBadge = row.querySelector(".saved-badge");
  const savingBadge = row.querySelector(".saving-badge");
  const errorEl = row.querySelector(".ingredient-error");

  saveBtn.style.display = "none";
  savingBadge.style.display = "inline";
  errorEl.style.display = "none";

  try {
    await api(`/api/notion/ingredients/${ing.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        productId: product.productId,
        productName: product.description,
        imageUrl: product.imageUrl ?? "",
      }),
    });

    // Update local state
    const stateIng = state.ingredients.find((i) => i.id === ing.id);
    if (stateIng) {
      stateIng.krogerProductId = product.productId;
      stateIng.krogerProductName = product.description;
      stateIng.krogerProductImage = product.imageUrl ?? "";
    }

    // Update row UI
    row.querySelector(".ingredient-linked-name").textContent = product.description;
    row.classList.add("is-linked");
    if (product.imageUrl) {
      const img = row.querySelector(".thumb-img");
      img.src = product.imageUrl;
      img.style.display = "block";
      row.querySelector(".thumb-placeholder").style.display = "none";
    }

    savingBadge.style.display = "none";
    savedBadge.style.display = "inline";
    row.querySelector(".product-results").style.display = "none";

    const searchBtn = row.querySelector(".search-btn");
    searchBtn.textContent = "Re-link";
    searchBtn.disabled = false;
    searchBtn.onclick = null;
    searchBtn.addEventListener("click", () => doSearch(stateIng, row));

    setTimeout(() => { savedBadge.style.display = "none"; }, 3000);
    updateProgress();
  } catch (e) {
    savingBadge.style.display = "none";
    saveBtn.style.display = "inline-flex";
    errorEl.textContent = e.message;
    errorEl.style.display = "block";
  }
}

// ── Store Finder ──────────────────────────────────────────────────────────────
document.getElementById("find-store-btn").addEventListener("click", async () => {
  const zip = document.getElementById("zip-input").value.trim();
  if (zip.length !== 5) return;

  const btn = document.getElementById("find-store-btn");
  btn.textContent = "Searching…";
  btn.disabled = true;

  try {
    const locations = await api(`/api/kroger/locations?zip=${zip}`);
    const wrap = document.getElementById("store-results");
    wrap.innerHTML = "";
    wrap.style.display = "flex";

    if (locations.length === 0) {
      wrap.innerHTML = `<div style="font-size:12px;color:var(--text3);font-family:var(--mono)">No stores found near ${zip}.</div>`;
    } else {
      locations.forEach((loc) => {
        const el = document.createElement("div");
        el.className = "store-option" + (loc.locationId === state.selectedLocationId ? " selected" : "");
        el.innerHTML = `
          <div>
            <div class="store-name">${loc.name}</div>
            <div class="store-address">${loc.address}</div>
          </div>
          <div class="store-select-btn">${loc.locationId === state.selectedLocationId ? "✓ Selected" : "Select"}</div>
        `;
        el.addEventListener("click", () => {
          state.selectedLocationId = loc.locationId;
          state.selectedLocationName = loc.name;
          localStorage.setItem("kroger_location_id", loc.locationId);
          localStorage.setItem("kroger_location_name", loc.name);
          wrap.querySelectorAll(".store-option").forEach((o) => {
            o.classList.remove("selected");
            o.querySelector(".store-select-btn").textContent = "Select";
          });
          el.classList.add("selected");
          el.querySelector(".store-select-btn").textContent = "✓ Selected";
          updateLocationDisplay();
        });
        wrap.appendChild(el);
      });
    }
  } catch (e) {
    document.getElementById("store-results").innerHTML =
      `<div style="font-size:12px;color:var(--red);font-family:var(--mono)">${e.message}</div>`;
    document.getElementById("store-results").style.display = "flex";
  } finally {
    btn.textContent = "Find Store";
    btn.disabled = false;
  }
});

function updateLocationDisplay() {
  const el = document.getElementById("location-display");
  if (state.selectedLocationName) {
    el.textContent = "📍 " + state.selectedLocationName;
    el.style.display = "block";
  }
}

// ── Progress ──────────────────────────────────────────────────────────────────
function updateProgress() {
  const linked = state.ingredients.filter((i) => i.krogerProductId).length;
  const total = state.ingredients.length;
  document.getElementById("linked-count").textContent = linked;
  document.getElementById("total-count").textContent = total;
  document.getElementById("progress-bar").style.width = total ? `${(linked / total) * 100}%` : "0%";
}

// ── Filters & Search ──────────────────────────────────────────────────────────
document.querySelectorAll(".filter-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".filter-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.filter = tab.dataset.filter;
    renderList();
  });
});

document.getElementById("search-input").addEventListener("input", (e) => {
  state.search = e.target.value;
  renderList();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function showState(name) {
  hideStates();
  document.getElementById(`state-${name}`).style.display = "flex";
}

function hideStates() {
  ["loading", "error", "empty"].forEach((s) => {
    document.getElementById(`state-${s}`).style.display = "none";
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
if (state.selectedLocationName) updateLocationDisplay();
loadIngredients();
