const API_BASE_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://tpsi-control.onrender.com";

const loginBtn = document.getElementById("loginBtn");
const message = document.getElementById("message");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = type;
}

function setButtonLoading(isLoading) {
  loginBtn.disabled = isLoading;
  loginBtn.textContent = isLoading ? "Accesso..." : "Accedi";
}

function redirectByRole(user) {
  if (user.role === "admin") {
    window.location.href = "admin.html";
  } else {
    window.location.href = "user.html";
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || "Errore nella richiesta");
  }

  return data;
}

function checkExistingSession() {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user") || "null");

  if (token && user) {
    redirectByRole(user);
  }
}

async function handleLogin() {
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value.trim();

  if (!email) {
    setMessage("Inserisci l'email", "error");
    return;
  }

  if (!password) {
    setMessage("Inserisci la password", "error");
    return;
  }

  setMessage("Verifica credenziali...", "info");
  setButtonLoading(true);

  try {
    const data = await fetchJson(`${API_BASE_URL}/api/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));

    setMessage("Login effettuato con successo", "success");
    redirectByRole(data.user);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setButtonLoading(false);
  }
}

loginBtn.addEventListener("click", handleLogin);

passwordInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    handleLogin();
  }
});

emailInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    handleLogin();
  }
});

checkExistingSession();
