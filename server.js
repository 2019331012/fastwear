// server.js
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { put } = require('@vercel/blob');
const { db, initDb } = require('./database');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- uploads (Vercel Blob) ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
    cb(ok ? null : new Error('Only images allowed'), ok);
  }
});

// ---------- auth helpers ----------
const requireAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Login required' });
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.userId = payload.userId;
    req.isAdmin = payload.isAdmin;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
const requireAdmin = (req, res, next) => {
  requireAuth(req, res, () => {
    if (!req.isAdmin) return res.status(403).json({ error: 'Admin only' });
    next();
  });
};

// ---------- cart helpers (async) ----------
async function getOrCreateCart(token, userId = null) {
  let r = await db.execute({ sql: 'SELECT * FROM carts WHERE token = ?', args: [token] });
  let cart = r.rows[0];
  if (!cart) {
    await db.execute({ sql: 'INSERT INTO carts (token, user_id) VALUES (?, ?)', args: [token, userId] });
    r = await db.execute({ sql: 'SELECT * FROM carts WHERE token = ?', args: [token] });
    cart = r.rows[0];
  } else if (userId && !cart.user_id) {
    await db.execute({ sql: 'UPDATE carts SET user_id = ? WHERE id = ?', args: [userId, cart.id] });
    cart.user_id = userId;
  }
  return cart;
}

// attach cart token
app.use((req, res, next) => {
  let token = req.header('X-Cart-Token');
  if (!token) token = crypto.randomBytes(16).toString('hex');
  res.setHeader('X-Cart-Token', token);
  req.cartToken = token;
  next();
});

/* ==================================================================
   AUTH
   ================================================================== */
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { email, password, name, phone, address } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 chars' });

    const exists = (await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [email.toLowerCase()]
    })).rows[0];
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const hash = bcrypt.hashSync(password, 10);
    await db.execute({
      sql: 'INSERT INTO users (email, password_hash, name, phone, address) VALUES (?, ?, ?, ?, ?)',
      args: [email.toLowerCase(), hash, name, phone || null, address || null]
    });
    const u = (await db.execute({
      sql: 'SELECT id, email, name, is_admin FROM users WHERE email = ?',
      args: [email.toLowerCase()]
    })).rows[0];

    const token = jwt.sign({ userId: u.id, isAdmin: !!u.is_admin }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ ok: true, token, user: { id: u.id, email: u.email, name: u.name, is_admin: u.is_admin } });
  } catch (e) { next(e); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email, password required' });

    const user = (await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email.toLowerCase()]
    })).rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    await getOrCreateCart(req.cartToken, user.id);
    const token = jwt.sign({ userId: user.id, isAdmin: !!user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ ok: true, token, user: { id: user.id, email: user.email, name: user.name, is_admin: user.is_admin } });
  } catch (e) { next(e); }
});

app.post('/api/auth/logout', (req, res) => res.json({ ok: true }));

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const u = (await db.execute({
      sql: 'SELECT id, email, name, phone, address, is_admin FROM users WHERE id = ?',
      args: [req.userId]
    })).rows[0];
    res.json({ user: u || null });
  } catch (e) { next(e); }
});

/* ==================================================================
   PRODUCTS
   ================================================================== */
app.get('/api/products', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    const category = (req.query.category || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || 8));
    const offset = (page - 1) * limit;

    const where = [];
    const args = [];
    if (q) { where.push('(name LIKE ? OR description LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
    if (category && category !== 'all') { where.push('category = ?'); args.push(category); }
    const wsql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const totalRow = (await db.execute({ sql: `SELECT COUNT(*) AS c FROM products ${wsql}`, args })).rows[0];
    const total = totalRow ? totalRow.c : 0;

    const rows = (await db.execute({
      sql: `SELECT * FROM products ${wsql} ORDER BY id LIMIT ? OFFSET ?`,
      args: [...args, limit, offset]
    })).rows;

    const cats = (await db.execute('SELECT DISTINCT category FROM products ORDER BY category')).rows.map(r => r.category);

    res.json({
      products: rows,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      categories: cats
    });
  } catch (e) { next(e); }
});

app.get('/api/products/:slug', async (req, res, next) => {
  try {
    const row = (await db.execute({ sql: 'SELECT * FROM products WHERE slug = ?', args: [req.params.slug] })).rows[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { next(e); }
});

/* ==================================================================
   CART
   ================================================================== */
app.get('/api/cart', async (req, res, next) => {
  try {
    const cart = await getOrCreateCart(req.cartToken, req.userId || null);
    const items = (await db.execute({
      sql: `SELECT ci.id, ci.product_id, ci.quantity, p.name, p.slug, p.price, p.image_url
            FROM cart_items ci JOIN products p ON p.id = ci.product_id
            WHERE ci.cart_id = ?`,
      args: [cart.id]
    })).rows;
    const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const count = items.reduce((s, i) => s + i.quantity, 0);
    res.json({ items, total, count });
  } catch (e) { next(e); }
});

app.post('/api/cart/add', async (req, res, next) => {
  try {
    const { product_id, quantity = 1 } = req.body;
    if (!product_id) return res.status(400).json({ error: 'product_id required' });

    const prod = (await db.execute({ sql: 'SELECT id FROM products WHERE id = ?', args: [product_id] })).rows[0];
    if (!prod) return res.status(404).json({ error: 'Product not found' });

    const cart = await getOrCreateCart(req.cartToken, req.userId || null);
    const q = Math.max(1, Math.min(99, parseInt(quantity, 10) || 1));

    const existing = (await db.execute({
      sql: 'SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?',
      args: [cart.id, product_id]
    })).rows[0];

    if (existing) {
      await db.execute({
        sql: 'UPDATE cart_items SET quantity = quantity + ? WHERE id = ?',
        args: [q, existing.id]
      });
    } else {
      await db.execute({
        sql: 'INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)',
        args: [cart.id, product_id, q]
      });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/api/cart/update', async (req, res, next) => {
  try {
    const { item_id, quantity } = req.body;
    const cart = await getOrCreateCart(req.cartToken, req.userId || null);
    const q = Math.max(1, Math.min(99, parseInt(quantity, 10) || 1));
    await db.execute({
      sql: 'UPDATE cart_items SET quantity = ? WHERE id = ? AND cart_id = ?',
      args: [q, item_id, cart.id]
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.post('/api/cart/remove', async (req, res, next) => {
  try {
    const { item_id } = req.body;
    const cart = await getOrCreateCart(req.cartToken, req.userId || null);
    await db.execute({
      sql: 'DELETE FROM cart_items WHERE id = ? AND cart_id = ?',
      args: [item_id, cart.id]
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ==================================================================
   CHECKOUT / ORDERS
   ================================================================== */
app.post('/api/checkout', async (req, res, next) => {
  try {
    const {
      shipping_name, shipping_phone, shipping_address,
      shipping_email, payment_method = 'cod'
    } = req.body;

    if (!shipping_name || !shipping_phone || !shipping_address) {
      return res.status(400).json({ error: 'Name, phone and address are required' });
    }
    const loggedIn = !!req.userId;
    if (!loggedIn && payment_method !== 'cod') {
      return res.status(400).json({ error: 'Guests can only pay with Cash on Delivery. Log in to use other methods.' });
    }
    if (!loggedIn && !shipping_email) {
      return res.status(400).json({ error: 'Email is required so we can send order updates' });
    }

    const cart = await getOrCreateCart(req.cartToken, req.userId || null);
    const items = (await db.execute({
      sql: `SELECT ci.product_id, ci.quantity, p.name, p.price, p.image_url
            FROM cart_items ci JOIN products p ON p.id = ci.product_id
            WHERE ci.cart_id = ?`,
      args: [cart.id]
    })).rows;
    if (!items.length) return res.status(400).json({ error: 'Cart is empty' });

    const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const guestToken = loggedIn ? null : crypto.randomBytes(24).toString('hex');

    // per-user or per-email sequence
    let userSeq = 1;
    if (loggedIn) {
      const r = (await db.execute({
        sql: 'SELECT MAX(user_seq) AS m FROM orders WHERE user_id = ?',
        args: [req.userId]
      })).rows[0];
      userSeq = (r?.m || 0) + 1;
    } else {
      const r = (await db.execute({
        sql: 'SELECT MAX(user_seq) AS m FROM orders WHERE guest_email = ?',
        args: [shipping_email]
      })).rows[0];
      userSeq = (r?.m || 0) + 1;
    }

    const ins = await db.execute({
      sql: `INSERT INTO orders
              (user_id, guest_token, guest_email, total, status, payment_method,
               shipping_name, shipping_phone, shipping_email, shipping_address, user_seq)
            VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      args: [
        req.userId || null,
        guestToken,
        loggedIn ? null : shipping_email,
        total, payment_method,
        shipping_name, shipping_phone,
        shipping_email || null,
        shipping_address,
        userSeq
      ]
    });
    const orderId = Number(ins.lastInsertRowid);

    for (const i of items) {
      await db.execute({
        sql: `INSERT INTO order_items (order_id, product_id, name, price, image_url, quantity)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [orderId, i.product_id, i.name, i.price, i.image_url, i.quantity]
      });
    }
    await db.execute({ sql: 'DELETE FROM cart_items WHERE cart_id = ?', args: [cart.id] });

    res.json({ ok: true, order_id: orderId, total, guest_token: guestToken });
  } catch (e) { next(e); }
});

app.get('/api/orders', requireAuth, async (req, res, next) => {
  try {
    const orders = (await db.execute({
      sql: 'SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC',
      args: [req.userId]
    })).rows;

    const out = [];
    for (const o of orders) {
      const items = (await db.execute({
        sql: 'SELECT * FROM order_items WHERE order_id = ?',
        args: [o.id]
      })).rows;
      out.push({
        display_number: o.user_seq || '—',
        total: o.total,
        status: o.status,
        payment_method: o.payment_method,
        shipping_name: o.shipping_name,
        shipping_phone: o.shipping_phone,
        shipping_email: o.shipping_email,
        shipping_address: o.shipping_address,
        created_at: o.created_at,
        items
      });
    }
    res.json(out);
  } catch (e) { next(e); }
});

app.get('/api/orders/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const token = req.query.token;

    // Admin bypass
    if (req.userId) {
      const u = (await db.execute({ sql: 'SELECT is_admin FROM users WHERE id = ?', args: [req.userId] })).rows[0];
      if (u && u.is_admin) {
        const o = (await db.execute({ sql: 'SELECT * FROM orders WHERE id = ?', args: [id] })).rows[0];
        if (o) {
          o.items = (await db.execute({ sql: 'SELECT * FROM order_items WHERE order_id = ?', args: [o.id] })).rows;
          return res.json({ ...o, is_admin_view: true });
        }
      }
    }

    let o = null;
    if (req.userId) {
      o = (await db.execute({ sql: 'SELECT * FROM orders WHERE id = ? AND user_id = ?', args: [id, req.userId] })).rows[0];
    }
    if (!o && token) {
      o = (await db.execute({ sql: 'SELECT * FROM orders WHERE id = ? AND guest_token = ?', args: [id, token] })).rows[0];
    }
    if (!o) return res.status(404).json({ error: 'Order not found' });

    const items = (await db.execute({ sql: 'SELECT * FROM order_items WHERE order_id = ?', args: [o.id] })).rows;
    res.json({
      display_number: o.user_seq || '—',
      total: o.total,
      status: o.status,
      payment_method: o.payment_method,
      shipping_name: o.shipping_name,
      shipping_phone: o.shipping_phone,
      shipping_email: o.shipping_email,
      shipping_address: o.shipping_address,
      created_at: o.created_at,
      items
    });
  } catch (e) { next(e); }
});

/* ==================================================================
   ADMIN — products
   ================================================================== */
app.get('/api/admin/products', requireAdmin, async (req, res, next) => {
  try {
    const rows = (await db.execute('SELECT * FROM products ORDER BY id')).rows;
    res.json(rows);
  } catch (e) { next(e); }
});

app.post('/api/admin/products', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    const { name, slug, description = '', price, old_price, category, stock = 100 } = req.body;
    if (!name || !slug || !price || !category) return res.status(400).json({ error: 'name, slug, price, category required' });

    let image_url = '';
    if (req.file) {
      const blob = await put(req.file.originalname, req.file.buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      image_url = blob.url;
    }

    await db.execute({
      sql: 'INSERT INTO products (slug, name, description, price, old_price, category, image_url, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [slug, name, description, parseFloat(price), old_price ? parseFloat(old_price) : null, category, image_url, parseInt(stock, 10) || 100]
    });
    const p = (await db.execute({ sql: 'SELECT id FROM products WHERE slug = ?', args: [slug] })).rows[0];
    res.json({ ok: true, id: p.id });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'Slug already exists' });
    next(e);
  }
});

app.put('/api/admin/products/:id', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const ex = (await db.execute({ sql: 'SELECT * FROM products WHERE id = ?', args: [id] })).rows[0];
    if (!ex) return res.status(404).json({ error: 'Product not found' });

    const { name, slug, description, price, old_price, category, stock } = req.body;
    let image_url = ex.image_url;
    if (req.file) {
      const blob = await put(req.file.originalname, req.file.buffer, {
        access: 'public',
        token: process.env.BLOB_READ_WRITE_TOKEN
      });
      image_url = blob.url;
    }

    await db.execute({
      sql: `UPDATE products SET
              name = ?, slug = ?, description = ?, price = ?, old_price = ?,
              category = ?, image_url = ?, stock = ?
            WHERE id = ?`,
      args: [
        name ?? ex.name,
        slug ?? ex.slug,
        description ?? ex.description,
        price ? parseFloat(price) : ex.price,
        old_price === '' ? null : (old_price ? parseFloat(old_price) : ex.old_price),
        category ?? ex.category,
        image_url,
        stock ? parseInt(stock, 10) : ex.stock,
        id
      ]
    });
    res.json({ ok: true });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({ error: 'Slug already exists' });
    next(e);
  }
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res, next) => {
  try {
    await db.execute({ sql: 'DELETE FROM products WHERE id = ?', args: [parseInt(req.params.id)] });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ==================================================================
   ADMIN — orders
   ================================================================== */
app.get('/api/admin/orders', requireAdmin, async (req, res, next) => {
  try {
    const orders = (await db.execute(`
      SELECT o.*, u.email AS user_email, u.name AS user_name
      FROM orders o LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.id DESC
    `)).rows;

    const out = [];
    for (const o of orders) {
      const items = (await db.execute({ sql: 'SELECT * FROM order_items WHERE order_id = ?', args: [o.id] })).rows;
      out.push({
        ...o,
        items,
        customer_email: o.user_email || o.guest_email,
        customer_name: o.user_name || o.shipping_name,
        is_guest: o.user_id === null
      });
    }
    res.json(out);
  } catch (e) { next(e); }
});

app.put('/api/admin/orders/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await db.execute({ sql: 'UPDATE orders SET status = ? WHERE id = ?', args: [status, req.params.id] });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ==================================================================
   HTML ROUTES
   ================================================================== */
const send = (f) => (req, res) => res.sendFile(path.join(__dirname, 'public', f));
app.get('/', send('index.html'));
app.get('/product/:slug', send('product.html'));
app.get('/login', send('login.html'));
app.get('/register', send('register.html'));
app.get('/cart', send('cart.html'));
app.get('/checkout', send('checkout.html'));
app.get('/orders', send('orders.html'));
app.get('/order/:id', send('order-view.html'));
app.get('/admin', send('admin.html'));

// error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api/')) return res.status(400).json({ error: err.message || 'Request failed' });
  res.status(500).send('Server error');
});

// init DB once per cold start, then export
// initDb().catch(console.error);

let initPromise;
async function ensureDb() {
  if (!initPromise) initPromise = initDb();
  return initPromise;
}
ensureDb().catch(console.error);

module.exports = app;
