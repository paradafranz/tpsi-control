require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://paradafranz.github.io";

const ALLOWED_ORIGINS = [
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:5501",
  "http://localhost:5501",
  "http://127.0.0.1:5502",
  "http://localhost:5502",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  FRONTEND_ORIGIN
];

const sessions = new Map(); // token -> { userId, role, expiresAt }
const loginAttempts = new Map(); // ip -> { count, firstAttempt }

const SESSION_DURATION_MS = 1000 * 60 * 60 * 2;
const LOGIN_WINDOW_MS = 1000 * 60 * 1;
const MAX_LOGIN_ATTEMPTS = 999;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("Origin non consentita da CORS"));
    }
  })
);

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
    return res.status(429).json({ error: "Troppi tentativi di login. Riprova più tardi." });
  }

  record.count += 1;
  loginAttempts.set(ip, record);
  next();
}
//piccolo controllo 
console.log("DATABASE_URL presente:", !!process.env.DATABASE_URL);

app.get("/", (req, res) => {
  res.json({ message: "API E-Commerce attive", status: "ok" });
});

/* LOGIN */
app.post("/api/login", loginRateLimit, async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "").trim();
    const expectedRole = String(req.body.expectedRole || "").trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ error: "Email e password obbligatorie" });
    }

    if (expectedRole && !["user", "admin"].includes(expectedRole)) {
      return res.status(400).json({ error: "Ruolo richiesto non valido" });
    }
    //piccolo controllo login
    console.log("Tentativo login:", req.body.email);

    const result = await pool.query(
      `select id, name, email, password, role, credits
       from users
       where lower(email) = $1`,
      [email]
    );

    const user = result.rows[0];

    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    if (expectedRole && user.role !== expectedRole) {
      return res.status(403).json({
        error: `Questo account non può accedere alla vista ${expectedRole}`
      });
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

/* LOGOUT */
app.post("/api/logout", authRequired, (req, res) => {
  sessions.delete(req.token);
  res.json({ message: "Logout effettuato" });
});

/* UTENTE CORRENTE */
app.get("/api/me", authRequired, async (req, res, next) => {
  try {
    const result = await pool.query(
      `select id, name, email, role, credits
       from users
       where id = $1`,
      [req.auth.userId]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

/* CATALOGO PUBBLICO */
app.get("/api/products", async (req, res, next) => {
  try {
    const result = await pool.query(
      `select id, name, price, stock
       from products
       order by id asc`
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/* ACQUISTO PRODOTTO */
app.post("/api/purchase", authRequired, async (req, res, next) => {
  const client = await pool.connect();

  try {
    const productId = parseId(req.body.productId);

    if (!productId) {
      return res.status(400).json({ error: "productId non valido" });
    }

    await client.query("BEGIN");

    const userRes = await client.query(
      `select id, name, email, role, credits
       from users
       where id = $1
       for update`,
      [req.auth.userId]
    );

    const productRes = await client.query(
      `select id, name, price, stock
       from products
       where id = $1
       for update`,
      [productId]
    );

    const user = userRes.rows[0];
    const product = productRes.rows[0];

    if (!user) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Utente non trovato" });
    }

    if (!product) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Prodotto non trovato" });
    }

    if (product.stock <= 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Prodotto esaurito" });
    }

    if (user.credits < product.price) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Crediti insufficienti" });
    }

    await client.query(
      `update users
       set credits = credits - $1+(10/100*$1)
       where id = $2`,
      [product.price, user.id]
    );

    await client.query(
      `update products
       set stock = stock - 1
       where id = $1`,
      [product.id]
    );

    await client.query(
      `insert into purchases (user_id, product_id, product_name, price)
       values ($1, $2, $3, $4)`,
      [user.id, product.id, product.name, product.price]
    );

    await client.query("COMMIT");

    const updatedUserRes = await client.query(
      `select id, name, email, role, credits
       from users
       where id = $1`,
      [user.id]
    );

    const updatedProductRes = await client.query(
      `select id, name, price, stock
       from products
       where id = $1`,
      [product.id]
    );

    res.json({
      message: `Acquisto completato: ${product.name}`,
      user: updatedUserRes.rows[0],
      product: updatedProductRes.rows[0]
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    next(error);
  } finally {
    client.release();
  }
});

/* ADMIN - LISTA UTENTI */
app.get("/api/admin/users", authRequired, requireRole("admin"), async (req, res, next) => {
  try {
    const result = await pool.query(
      `select id, name, email, role, credits
       from users
       order by id asc`
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/* ADMIN - NUOVO PRODOTTO */
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

    const result = await pool.query(
      `insert into products (name, price, stock)
       values ($1, $2, $3)
       returning id, name, price, stock`,
      [name, price, stock]
    );

    res.status(201).json({
      message: "Prodotto creato con successo",
      product: result.rows[0]
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "Prodotto già esistente" });
    }
    next(error);
  }
});

/* ADMIN - MODIFICA STOCK */
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

    const result = await pool.query(
      `update products
       set stock = $1
       where id = $2
       returning id, name, price, stock`,
      [stock, productId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Prodotto non trovato" });
    }

    res.json({
      message: "Stock aggiornato",
      product: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/* ADMIN - BONUS CREDITI */
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

    const result = await pool.query(
      `update users
       set credits = credits + $1
       where id = $2
       returning id, name, email, role, credits`,
      [amount, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Utente non trovato" });
    }

    res.json({
      message: "Crediti aggiornati",
      user: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/* ADMIN - DASHBOARD */
app.get("/api/admin/summary", authRequired, requireRole("admin"), async (req, res, next) => {
  try {
    const usersRes = await pool.query(
      `select count(*)::int as count, coalesce(sum(credits), 0)::int as total_credits
       from users`
    );

    const productsRes = await pool.query(
      `select count(*)::int as count, coalesce(sum(stock), 0)::int as total_stock
       from products`
    );

    const lowStockRes = await pool.query(
      `select id, name, price, stock
       from products
       where stock <= 2
       order by stock asc, name asc`
    );

    res.json({
      usersCount: usersRes.rows[0].count,
      productsCount: productsRes.rows[0].count,
      totalCredits: usersRes.rows[0].total_credits,
      totalStock: productsRes.rows[0].total_stock,
      lowStockProducts: lowStockRes.rows
    });
  } catch (error) {
    next(error);
  }
});

/* 404 API */
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint API non trovato" });
});

/* ERROR HANDLER */
app.use((error, req, res, next) => {
  console.error("[SERVER ERROR]", error);

  if (error.message && error.message.includes("CORS")) {
    return res.status(403).json({ error: "Richiesta bloccata da CORS" });
  }

  res.status(500).json({ error: "Errore interno del server" });
});

app.listen(PORT, () => {
  console.log(`Server attivo sulla porta ${PORT}`);
});
