const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, "data", "users.json");
const PRODUCTS_FILE = path.join(__dirname, "data", "products.json");

app.use(cors());
app.use(express.json());

async function readJson(filePath) {
  const data = await fs.readFile(filePath, "utf-8");
  return JSON.parse(data);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

app.get("/", (req, res) => {
  res.send("API E-Commerce attive");
});

// GET tutti gli utenti
app.get("/api/users", async (req, res) => {
  try {
    const users = await readJson(USERS_FILE);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Errore lettura utenti" });
  }
});

// GET singolo utente
app.get("/api/users/:id", async (req, res) => {
  try {
    const users = await readJson(USERS_FILE);
    const userId = Number(req.params.id);
    const user = users.find(u => u.id === userId);

    if (!user) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Errore lettura utente" });
  }
});

// GET catalogo prodotti
app.get("/api/products", async (req, res) => {
  try {
    const products = await readJson(PRODUCTS_FILE);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: "Errore lettura prodotti" });
  }
});

// POST acquisto prodotto
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email e password obbligatorie" });
    }

    const users = await readJson(USERS_FILE);

    const user = users.find(
      u => u.email === email && u.password === password
    );

    if (!user) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      credits: user.credits
    });
  } catch (error) {
    res.status(500).json({ error: "Errore login" });
  }
});

// POST nuovo prodotto
app.post("/api/products", async (req, res) => {
  try {
    const { name, price, stock } = req.body;

    if (!name || price === undefined || stock === undefined) {
      return res.status(400).json({ error: "name, price e stock obbligatori" });
    }

    const parsedPrice = Number(price);
    const parsedStock = Number(stock);

    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: "Prezzo non valido" });
    }

    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ error: "Stock non valido" });
    }

    const products = await readJson(PRODUCTS_FILE);

    const newProduct = {
      id: Date.now(),
      name: String(name).trim(),
      price: parsedPrice,
      stock: parsedStock
    };

    products.push(newProduct);
    await writeJson(PRODUCTS_FILE, products);

    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: "Errore creazione prodotto" });
  }
});

// PATCH modifica stock prodotto
app.patch("/api/products/:id/stock", async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const { stock } = req.body;

    const parsedStock = Number(stock);

    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ error: "Stock non valido" });
    }

    const products = await readJson(PRODUCTS_FILE);
    const product = products.find(p => p.id === productId);

    if (!product) {
      return res.status(404).json({ error: "Prodotto non trovato" });
    }

    product.stock = parsedStock;
    await writeJson(PRODUCTS_FILE, products);

    res.json({
      message: "Stock aggiornato",
      product
    });
  } catch (error) {
    res.status(500).json({ error: "Errore aggiornamento stock" });
  }
});

// POST bonus crediti a utente
app.post("/api/users/:id/credits", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { amount } = req.body;

    const parsedAmount = Number(amount);

    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Amount non valido" });
    }

    const users = await readJson(USERS_FILE);
    const user = users.find(u => u.id === userId);

    if (!user) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    user.credits += parsedAmount;
    await writeJson(USERS_FILE, users);

    res.json({
      message: "Crediti aggiornati",
      user
    });
  } catch (error) {
    res.status(500).json({ error: "Errore aggiornamento crediti" });
  }
});

app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});