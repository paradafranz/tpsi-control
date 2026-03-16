const API_BASE_URL =
  !location.hostname || location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://tpsi-verifica.onrender.com";

const currentUser = JSON.parse(localStorage.getItem("currentUser"));

if (!currentUser) {
  window.location.href = "login.html?role=user";
}

if (currentUser.role !== "user") {
  window.location.href = "login.html?role=user";
}

const userNameSpan = document.getElementById("userName");
const creditsSpan = document.getElementById("credits");
const productsList = document.getElementById("productsList");
const messageP = document.getElementById("message");

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore richiesta");
  }

  return data;
}

async function loadCurrentUser() {
  const user = await fetchJson(`${API_BASE_URL}/api/users/${currentUser.id}`);
  userNameSpan.textContent = user.name;
  creditsSpan.textContent = user.credits;
}

async function loadProducts() {
  const products = await fetchJson(`${API_BASE_URL}/api/products`);
  productsList.innerHTML = "";

  products.forEach(product => {
    const div = document.createElement("div");
    div.className = "product";

    div.innerHTML = `
      <h3>${product.name}</h3>
      <p>Prezzo: ${product.price} crediti</p>
      <p>Stock: ${product.stock}</p>
      <button ${product.stock <= 0 ? "disabled" : ""}>
        Acquista
      </button>
    `;

    const btn = div.querySelector("button");
    btn.addEventListener("click", () => purchaseProduct(product.id));

    productsList.appendChild(div);
  });
}

async function purchaseProduct(productId) {
  try {
    messageP.textContent = "";
    messageP.className = "";

    const result = await fetchJson(`${API_BASE_URL}/api/purchase`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId: currentUser.id,
        productId
      })
    });

    messageP.textContent = result.message;
    messageP.className = "success";

    await loadCurrentUser();
    await loadProducts();
  } catch (error) {
    messageP.textContent = error.message;
    messageP.className = "error";
  }
}

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("currentUser");
  window.location.href = "login.html";
});

async function init() {
  try {
    await loadCurrentUser();
    await loadProducts();
  } catch (error) {
    messageP.textContent = error.message;
    messageP.className = "error";
  }
}

init();