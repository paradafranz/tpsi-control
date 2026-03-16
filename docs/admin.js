const API_BASE_URL =
  !location.hostname || location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://tpsi-verifica.onrender.com";

const currentUser = JSON.parse(localStorage.getItem("currentUser"));

if (!currentUser) {
  window.location.href = "login.html?role=admin";
}

if (currentUser.role !== "admin") {
  window.location.href = "login.html?role=admin";
}

const adminMessage = document.getElementById("adminMessage");
const bonusUserSelect = document.getElementById("bonusUserSelect");
const addProductBtn = document.getElementById("addProductBtn");
const addCreditsBtn = document.getElementById("addCreditsBtn");
const adminProductsList = document.getElementById("adminProductsList");

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore richiesta");
  }

  return data;
}

function setMessage(text, type) {
  adminMessage.textContent = text;
  adminMessage.className = type;
}

async function loadUsers() {
  const users = await fetchJson(`${API_BASE_URL}/api/users`);
  bonusUserSelect.innerHTML = "";

  const normalUsers = users.filter(user => user.role === "user");

  normalUsers.forEach(user => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = `${user.name} (crediti: ${user.credits})`;
    bonusUserSelect.appendChild(option);
  });
}

async function loadProducts() {
  const products = await fetchJson(`${API_BASE_URL}/api/products`);
  adminProductsList.innerHTML = "";

  products.forEach(product => {
    const div = document.createElement("div");
    div.className = "product";

    div.innerHTML = `
      <h3>${product.name}</h3>
      <p>Prezzo: ${product.price} crediti</p>
      <p>Stock attuale: ${product.stock}</p>
      <div class="row">
        <input type="number" min="0" value="${product.stock}" id="stock-${product.id}" />
        <button>Aggiorna stock</button>
      </div>
    `;

    const btn = div.querySelector("button");
    btn.addEventListener("click", async () => {
      const input = document.getElementById(`stock-${product.id}`);
      const stock = Number(input.value);

      try {
        await fetchJson(`${API_BASE_URL}/api/products/${product.id}/stock`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ stock })
        });

        setMessage("Stock aggiornato con successo", "success");
        await loadProducts();
      } catch (error) {
        setMessage(error.message, "error");
      }
    });

    adminProductsList.appendChild(div);
  });
}

addProductBtn.addEventListener("click", async () => {
  const name = document.getElementById("productName").value.trim();
  const price = Number(document.getElementById("productPrice").value);
  const stock = Number(document.getElementById("productStock").value);

  try {
    await fetchJson(`${API_BASE_URL}/api/products`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name, price, stock })
    });

    setMessage("Prodotto aggiunto", "success");
    document.getElementById("productName").value = "";
    document.getElementById("productPrice").value = "";
    document.getElementById("productStock").value = "";

    await loadProducts();
  } catch (error) {
    setMessage(error.message, "error");
  }
});

addCreditsBtn.addEventListener("click", async () => {
  const userId = bonusUserSelect.value;
  const amount = Number(document.getElementById("bonusAmount").value);

  try {
    await fetchJson(`${API_BASE_URL}/api/users/${userId}/credits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ amount })
    });

    setMessage("Crediti assegnati", "success");
    document.getElementById("bonusAmount").value = "";

    await loadUsers();
  } catch (error) {
    setMessage(error.message, "error");
  }
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem("currentUser");
  window.location.href = "login.html";
});

async function init() {
  try {
    await loadUsers();
    await loadProducts();
  } catch (error) {
    setMessage(error.message, "error");
  }
}

init();