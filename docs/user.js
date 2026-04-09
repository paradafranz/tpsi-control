const API_BASE_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://tpsi-verifica.onrender.com";

const token = localStorage.getItem("token");
const storedUser = JSON.parse(localStorage.getItem("user") || "null");

const userNameSpan = document.getElementById("userName");
const creditsSpan = document.getElementById("credits");
const productsList = document.getElementById("productsList");
const messageP = document.getElementById("message");

function redirectToLogin() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "login.html";
}

if (!token || !storedUser) {
  redirectToLogin();
}

function setMessage(text, type = "") {
  messageP.textContent = text;
  messageP.className = type;
}

function clearMessage() {
  messageP.textContent = "";
  messageP.className = "";
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
    throw new Error("Operazione non autorizzata.");
  }

  if (!response.ok) {
    throw new Error(data?.error || "Errore richiesta");
  }

  return data;
}

async function verifyUserAccess() {
  const data = await fetchJson(`${API_BASE_URL}/api/me`);
  const user = data.user;

  if (!user || user.role !== "user") {
    throw new Error("Accesso utente non autorizzato.");
  }

  localStorage.setItem("user", JSON.stringify(user));
  return user;
}

async function loadCurrentUser() {
  const data = await fetchJson(`${API_BASE_URL}/api/me`);
  const user = data.user;

  userNameSpan.textContent = user.name;
  creditsSpan.textContent = user.credits;

  localStorage.setItem("user", JSON.stringify(user));
  return user;
}

function createProductCard(product, currentCredits) {
  const div = document.createElement("div");
  div.className = "product";

  const canAfford = currentCredits >= product.price;
  const isAvailable = product.stock > 0;
  const canBuy = canAfford && isAvailable;

  let statusText = "";
  let statusClass = "";

  if (!isAvailable) {
    statusText = "Prodotto esaurito";
    statusClass = "error";
  } else if (!canAfford) {
    statusText = "Crediti insufficienti";
    statusClass = "error";
  } else {
    statusText = "Acquistabile";
    statusClass = "success";
  }

  div.innerHTML = `
    <h3>${product.name}</h3>
    <p>Prezzo: <strong>${product.price}</strong> crediti</p>
    <p>Stock: <strong>${product.stock}</strong></p>
    <p class="${statusClass}">${statusText}</p>
    <button ${canBuy ? "" : "disabled"} type="button">
      ${isAvailable ? "Acquista" : "Non disponibile"}
    </button>
  `;

  const btn = div.querySelector("button");

  btn.addEventListener("click", async () => {
    clearMessage();
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Acquisto...";

    try {
      const result = await fetchJson(`${API_BASE_URL}/api/purchase`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ productId: product.id })
      });

      setMessage(result.message, "success");

      await loadCurrentUser();
      await loadProducts();
    } catch (error) {
      setMessage(error.message, "error");
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  return div;
}

async function loadProducts() {
  const products = await fetchJson(`${API_BASE_URL}/api/products`);
  const currentCredits = Number(creditsSpan.textContent) || 0;

  productsList.innerHTML = "";

  if (!products.length) {
    productsList.innerHTML = "<p>Nessun prodotto disponibile.</p>";
    return;
  }

  products.forEach(product => {
    productsList.appendChild(createProductCard(product, currentCredits));
  });
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await fetchJson(`${API_BASE_URL}/api/logout`, {
      method: "POST"
    });
  } catch {
    // anche se fallisce, faccio comunque pulizia locale
  } finally {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "login.html";
  }
});

async function init() {
  try {
    setMessage("Caricamento dati utente...", "info");

    await verifyUserAccess();
    await loadCurrentUser();
    await loadProducts();

    clearMessage();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

init();
