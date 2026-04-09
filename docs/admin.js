const API_BASE_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://tpsi-control.onrender.com";

const token = localStorage.getItem("token");
const storedUser = JSON.parse(localStorage.getItem("user") || "null");

const adminMessage = document.getElementById("adminMessage");
const bonusUserSelect = document.getElementById("bonusUserSelect");
const addProductBtn = document.getElementById("addProductBtn");
const addCreditsBtn = document.getElementById("addCreditsBtn");
const adminProductsList = document.getElementById("adminProductsList");
const summaryBox = document.getElementById("summaryBox");

function redirectToLogin() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "login.html";
}

if (!token || !storedUser) {
  redirectToLogin();
}

function setMessage(text, type = "") {
  adminMessage.textContent = text;
  adminMessage.className = `message ${type}`.trim();
}

function clearMessage() {
  adminMessage.textContent = "";
  adminMessage.className = "message";
}

function setButtonLoading(button, isLoading, loadingText = "Caricamento...") {
  if (!button) return;

  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Sessione scaduta. Effettua di nuovo il login.");
  }

  if (response.status === 403) {
    throw new Error("Non hai i permessi per questa operazione.");
  }

  if (!response.ok) {
    throw new Error(data?.error || "Errore richiesta");
  }

  return data;
}

async function verifyAdminAccess() {
  const data = await fetchJson(`${API_BASE_URL}/api/me`);
  const user = data.user;

  if (!user || user.role !== "admin") {
    throw new Error("Accesso admin non autorizzato.");
  }

  localStorage.setItem("user", JSON.stringify(user));
  return user;
}

async function loadSummary() {
  const summary = await fetchJson(`${API_BASE_URL}/api/admin/summary`);

  const lowStockHtml = summary.lowStockProducts.length
    ? summary.lowStockProducts
        .map(p => `<li>${p.name} — stock: ${p.stock}</li>`)
        .join("")
    : "<li>Nessun prodotto in low stock</li>";

  summaryBox.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <strong>Utenti</strong>
        <span>${summary.usersCount}</span>
      </div>
      <div class="summary-card">
        <strong>Prodotti</strong>
        <span>${summary.productsCount}</span>
      </div>
      <div class="summary-card">
        <strong>Crediti totali</strong>
        <span>${summary.totalCredits}</span>
      </div>
      <div class="summary-card">
        <strong>Stock totale</strong>
        <span>${summary.totalStock}</span>
      </div>
    </div>

    <div class="low-stock-box">
      <h3>Prodotti con stock basso</h3>
      <ul>${lowStockHtml}</ul>
    </div>
  `;
}

async function loadUsers() {
  const users = await fetchJson(`${API_BASE_URL}/api/admin/users`);
  bonusUserSelect.innerHTML = "";

  const normalUsers = users.filter(user => user.role === "user");

  if (normalUsers.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nessun utente disponibile";
    bonusUserSelect.appendChild(option);
    return;
  }

  normalUsers.forEach(user => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.name} (${user.email}) - crediti: ${user.credits}`;
    bonusUserSelect.appendChild(option);
  });
}

function createStockCard(product) {
  const div = document.createElement("div");
  div.className = "product";

  const isLowStock = product.stock <= 2;
  const lowStockLabel = isLowStock
    ? `<span class="badge badge-warning">Low stock</span>`
    : `<span class="badge badge-ok">Disponibile</span>`;

  div.innerHTML = `
    <div class="product-header">
      <h3>${product.name}</h3>
      ${lowStockLabel}
    </div>
    <p>Prezzo: <strong>${product.price}</strong> crediti</p>
    <p>Stock attuale: <strong>${product.stock}</strong></p>
    <div class="row">
      <input type="number" min="0" step="1" value="${product.stock}" id="stock-${product.id}" />
      <button class="update-stock-btn">Aggiorna stock</button>
    </div>
  `;

  const btn = div.querySelector(".update-stock-btn");

  btn.addEventListener("click", async () => {
    const input = document.getElementById(`stock-${product.id}`);
    const stock = Number(input.value);

    if (!Number.isInteger(stock) || stock < 0) {
      setMessage("Inserisci uno stock valido (numero intero >= 0)", "error");
      return;
    }

    clearMessage();
    setButtonLoading(btn, true, "Aggiorno...");

    try {
      await fetchJson(`${API_BASE_URL}/api/admin/products/${product.id}/stock`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ stock })
      });

      setMessage("Stock aggiornato con successo", "success");
      await Promise.all([loadProducts(), loadSummary()]);
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      setButtonLoading(btn, false);
    }
  });

  return div;
}

async function loadProducts() {
  const products = await fetchJson(`${API_BASE_URL}/api/products`);
  adminProductsList.innerHTML = "";

  if (!products.length) {
    adminProductsList.innerHTML = "<p>Nessun prodotto disponibile.</p>";
    return;
  }

  products.forEach(product => {
    adminProductsList.appendChild(createStockCard(product));
  });
}

addProductBtn.addEventListener("click", async () => {
  const nameInput = document.getElementById("productName");
  const priceInput = document.getElementById("productPrice");
  const stockInput = document.getElementById("productStock");

  const name = nameInput.value.trim();
  const price = Number(priceInput.value);
  const stock = Number(stockInput.value);

  if (!name) {
    setMessage("Inserisci il nome del prodotto", "error");
    return;
  }

  if (!Number.isFinite(price) || price < 0) {
    setMessage("Inserisci un prezzo valido", "error");
    return;
  }

  if (!Number.isInteger(stock) || stock < 0) {
    setMessage("Inserisci uno stock valido", "error");
    return;
  }

  clearMessage();
  setButtonLoading(addProductBtn, true, "Aggiungo...");

  try {
    await fetchJson(`${API_BASE_URL}/api/admin/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name, price, stock })
    });

    setMessage("Prodotto aggiunto con successo", "success");
    nameInput.value = "";
    priceInput.value = "";
    stockInput.value = "";

    await Promise.all([loadProducts(), loadSummary()]);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setButtonLoading(addProductBtn, false);
  }
});

addCreditsBtn.addEventListener("click", async () => {
  const userId = Number(bonusUserSelect.value);
  const amountInput = document.getElementById("bonusAmount");
  const amount = Number(amountInput.value);

  if (!userId) {
    setMessage("Seleziona un utente valido", "error");
    return;
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    setMessage("Inserisci un bonus crediti valido", "error");
    return;
  }

  clearMessage();
  setButtonLoading(addCreditsBtn, true, "Assegno...");

  try {
    await fetchJson(`${API_BASE_URL}/api/admin/users/${userId}/credits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ amount })
    });

    setMessage("Crediti assegnati con successo", "success");
    amountInput.value = "";

    await Promise.all([loadUsers(), loadSummary()]);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setButtonLoading(addCreditsBtn, false);
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await fetchJson(`${API_BASE_URL}/api/logout`, {
      method: "POST"
    });
  } catch {
    // anche se fallisce, pulizia locale
  } finally {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "login.html";
  }
});

async function init() {
  try {
    setMessage("Caricamento dashboard admin...", "info");

    await verifyAdminAccess();
    await Promise.all([loadSummary(), loadUsers(), loadProducts()]);

    clearMessage();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

init();
