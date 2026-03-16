const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const USERS_FILE = path.join(__dirname, "data", "users.json");
const PRODUCTS_FILE = path.join(__dirname, "data", "products.json");

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "https://TUO-USERNAME.github.io" // cambia questo quando pubblichi
];

const sessions = new Map(); // token -> { userId, role, expiresAt }
const loginAttempts = new Map(); // ip -> { count, firstAttempt }

const SESSION_DURATION_MS = 1000 * 60 * 60 * 2; // 2 ore
const LOGIN_WINDOW_MS = 1000 * 60 * 10; // 10 minuti
const MAX_LOGIN_ATTEMPTS = 10;

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true); // Postman, curl, ecc.
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error("Origin non consentita da CORS"));
  }
}));

app.use(express.json({ limit: "50kb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    credits: user.credits
  };
}

async function readJson(filePath) {
  const data = await fs.readFile(filePath, "utf-8");
  return JSON.parse(data);
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function parseId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "Token mancante o non valido" });
  }

  const session = sessions.get(token);

  if (!session) {
    return res.status(401).json({ error: "Sessione non valida" });
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ error: "Sessione scaduta" });
  }

  req.auth = session;
  req.token = token;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.auth || req.auth.role !== role) {
      return res.status(403).json({ error: "Permessi insufficienti" });
    }
    next();
  };
}

function loginRateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const now = Date.now();

  const record = loginAttempts.get(ip);

  if (!record) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return next();
  }

  if (now - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return next();
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    return res.status(429).json({
      error: "Troppi tentativi di login. Riprova più tardi."
    });
  }

  record.count += 1;
  loginAttempts.set(ip, record);
  next();
}

let fileLock = Promise.resolve();

function withFileLock(task) {
  fileLock = fileLock.then(task, task);
  return fileLock;
}

app.get("/", (req, res) => {
  res.json({
    message: "API E-Commerce attive",
    status: "ok"
  });
});

/**
 * LOGIN
 */
app.post("/api/login", loginRateLimit, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "").trim();

    if (!email || !password) {
      return res.status(400).json({ error: "Email e password obbligatorie" });
    }

    const users = await readJson(USERS_FILE);
    const user = users.find(
      u => String(u.email).toLowerCase() === email && u.password === password
    );

    if (!user) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    const token = crypto.randomBytes(24).toString("hex");

    sessions.set(token, {
      userId: user.id,
      role: user.role,
      expiresAt: Date.now() + SESSION_DURATION_MS
    });

    res.json({
      message: "Login effettuato con successo",
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

/**
 * LOGOUT
 */
app.post("/api/logout", authRequired, (req, res) => {
  sessions.delete(req.token);
  res.json({ message: "Logout effettuato" });
});

/**
 * UTENTE CORRENTE
 */
app.get("/api/me", authRequired, async (req, res, next) => {
  try {
    const users = await readJson(USERS_FILE);
    const user = users.find(u => u.id === req.auth.userId);

    if (!user) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    res.json({ user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
});

/**
 * CATALOGO PUBBLICO
 */
app.get("/api/products", async (req, res, next) => {
  try {
    const products = await readJson(PRODUCTS_FILE);
    res.json(products);
  } catch (error) {
    next(error);
  }
});

/**
 * ACQUISTO PRODOTTO (solo utente loggato)
 */
app.post("/api/purchase", authRequired, async (req, res, next) => {
  try {
    const productId = parseId(req.body.productId);

    if (!productId) {
      return res.status(400).json({ error: "productId non valido" });
    }

    await withFileLock(async () => {
      const users = await readJson(USERS_FILE);
      const products = await readJson(PRODUCTS_FILE);

      const user = users.find(u => u.id === req.auth.userId);
      const product = products.find(p => p.id === productId);

      if (!user) {
        return res.status(404).json({ error: "Utente non trovato" });
      }

      if (!product) {
        return res.status(404).json({ error: "Prodotto non trovato" });
      }

      if (product.stock <= 0) {
        return res.status(409).json({ error: "Prodotto esaurito" });
      }

      if (user.credits < product.price) {
        return res.status(409).json({ error: "Crediti insufficienti" });
      }

      user.credits -= product.price;
      product.stock -= 1;

      await writeJson(USERS_FILE, users);
      await writeJson(PRODUCTS_FILE, products);

      return res.json({
        message: `Acquisto completato: ${product.name}`,
        user: sanitizeUser(user),
        product
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ADMIN - LISTA UTENTI (senza password)
 */
app.get("/api/admin/users", authRequired, requireRole("admin"), async (req, res, next) => {
  try {
    const users = await readJson(USERS_FILE);
    res.json(users.map(sanitizeUser));
  } catch (error) {
    next(error);
  }
});

/**
 * ADMIN - NUOVO PRODOTTO
 */
app.post("/api/admin/products", authRequired, requireRole("admin"), async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const price = Number(req.body.price);
    const stock = Number(req.body.stock);

    if (!name) {
      return res.status(400).json({ error: "Nome prodotto obbligatorio" });
    }

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: "Prezzo non valido" });
    }

    if (!isNonNegativeInteger(stock)) {
      return res.status(400).json({ error: "Stock non valido" });
    }

    await withFileLock(async () => {
      const products = await readJson(PRODUCTS_FILE);

      const alreadyExists = products.some(
        p => String(p.name).toLowerCase() === name.toLowerCase()
      );

      if (alreadyExists) {
        return res.status(409).json({ error: "Prodotto già esistente" });
      }

      const newProduct = {
        id: Date.now(),
        name,
        price,
        stock
      };

      products.push(newProduct);
      await writeJson(PRODUCTS_FILE, products);

      return res.status(201).json({
        message: "Prodotto creato con successo",
        product: newProduct
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ADMIN - MODIFICA STOCK
 */
app.patch("/api/admin/products/:id/stock", authRequired, requireRole("admin"), async (req, res, next) => {
  try {
    const productId = parseId(req.params.id);
    const stock = Number(req.body.stock);

    if (!productId) {
      return res.status(400).json({ error: "ID prodotto non valido" });
    }

    if (!isNonNegativeInteger(stock)) {
      return res.status(400).json({ error: "Stock non valido" });
    }

    await withFileLock(async () => {
      const products = await readJson(PRODUCTS_FILE);
      const product = products.find(p => p.id === productId);

      if (!product) {
        return res.status(404).json({ error: "Prodotto non trovato" });
      }

      product.stock = stock;
      await writeJson(PRODUCTS_FILE, products);

      return res.json({
        message: "Stock aggiornato",
        product
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ADMIN - BONUS CREDITI
 */
app.post("/api/admin/users/:id/credits", authRequired, requireRole("admin"), async (req, res, next) => {
  try {
    const userId = parseId(req.params.id);
    const amount = Number(req.body.amount);

    if (!userId) {
      return res.status(400).json({ error: "ID utente non valido" });
    }

    if (!isPositiveInteger(amount)) {
      return res.status(400).json({ error: "Amount non valido" });
    }

    await withFileLock(async () => {
      const users = await readJson(USERS_FILE);
      const user = users.find(u => u.id === userId);

      if (!user) {
        return res.status(404).json({ error: "Utente non trovato" });
      }

      user.credits += amount;
      await writeJson(USERS_FILE, users);

      return res.json({
        message: "Crediti aggiornati",
        user: sanitizeUser(user)
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * ADMIN - DASHBOARD SUMMARY
 */
app.get("/api/admin/summary", authRequired, requireRole("admin"), async (req, res, next) => {
  try {
    const users = await readJson(USERS_FILE);
    const products = await readJson(PRODUCTS_FILE);

    const totalCredits = users.reduce((sum, u) => sum + (u.credits || 0), 0);
    const totalStock = products.reduce((sum, p) => sum + (p.stock || 0), 0);
    const lowStockProducts = products.filter(p => p.stock <= 2);

    res.json({
      usersCount: users.length,
      productsCount: products.length,
      totalCredits,
      totalStock,
      lowStockProducts
    });
  } catch (error) {
    next(error);
  }
});

/**
 * 404 API
 */
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint API non trovato" });
});

/**
 * ERROR HANDLER
 */
app.use((error, req, res, next) => {
  console.error("[SERVER ERROR]", error);

  if (error.message && error.message.includes("CORS")) {
    return res.status(403).json({ error: "Richiesta bloccata da CORS" });
  }

  res.status(500).json({
    error: "Errore interno del server"
  });
});

app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});