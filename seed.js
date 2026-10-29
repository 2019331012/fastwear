// seed-remote.js
// Run once with OIDC env vars set:
//   node --env-file=.env.local seed-remote.js
// (Or ensure VERCEL_OIDC_TOKEN and BLOB_STORE_ID are in your shell environment)

require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { put } = require('@vercel/blob');
const { db, initDb } = require('./database');

const IMAGE_DIR = path.join(__dirname, 'seed-images');

const PRODUCTS = [
  {
    file: 'boxer-denim-combo.jpg',
    slug: 'boxer-denim-combo',
    name: 'Boxer and Denim Jeans Combo',
    price: 1890, old_price: 2200, category: 'combo',
    description: 'Boxer + Denim jeans bundle.'
  },
  {
    file: 'boxer-1box.jpg',
    slug: 'boxer-1box-3pcs',
    name: 'Premium Export Quality Boxer 1BOX (3 PCS)',
    price: 699, old_price: 800, category: 'boxer',
    description: '3-piece premium export quality boxer set.'
  },
  {
    file: 'boxer-2box.jpg',
    slug: 'boxer-2box-6pcs',
    name: 'Premium Export Quality Boxer 2BOX (6 PCS)',
    price: 1099, old_price: 1400, category: 'boxer',
    description: '6-piece premium export quality boxer set.'
  },
  {
    file: 'rookies-jeans.jpg',
    slug: 'rookies-deep-blue-jeans',
    name: 'Rookies Deep Blue denim Jeans - 100% Export Quality',
    price: 1499, old_price: 1750, category: 'denim',
    description: 'Deep blue denim, export quality.'
  },
  {
    file: 't-shirt-1.jpg',
    slug: 't-shirt-1',
    name: 'T-Shirt 1',
    price: 700, old_price: 1000, category: 'tshirt',
    description: 'Classic cotton tee.'
  },
  {
    file: 't-shirt-2.jpg',
    slug: 't-shirt-2',
    name: 'T-Shirt 2',
    price: 1200, old_price: 2000, category: 'tshirt',
    description: 'Premium cotton tee.'
  },
  {
    file: 't-shirt-3.jpg',
    slug: 't-shirt-3',
    name: 'T-Shirt 3',
    price: 1500, old_price: 3000, category: 'tshirt',
    description: 'Limited edition tee.'
  },
  {
    file: 'matador-black.jpg',
    slug: 'matador-black-drop-shoulder',
    name: 'Matador Black Color – Drop Shoulder',
    price: 600, old_price: null, category: 'drop-shoulder',
    description: 'Matador black drop shoulder tee. Premium cotton, relaxed fit.'
  }
];

(async () => {
  console.log('🛠  Initializing database tables…');
  await initDb();

  // ---- 1. products ----
  console.log('📦 Seeding products…');
  for (const p of PRODUCTS) {
    const existing = (await db.execute({
      sql: 'SELECT id FROM products WHERE slug = ?',
      args: [p.slug]
    })).rows[0];

    if (existing) {
      console.log(`   ↳ ${p.slug} already exists, skipping`);
      continue;
    }

    const filePath = path.join(IMAGE_DIR, p.file);
    let image_url = '';
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      
      // OIDC AUTHENTICATION BLOCK
      const blob = await put(p.file, buffer, {
        access: 'public',
        addRandomSuffix: true,
        contentType: 'image/jpeg',
        // Pass OIDC credentials explicitly for local script execution
        oidcToken: process.env.VERCEL_OIDC_TOKEN,
        storeId: process.env.BLOB_STORE_ID,
      });
      
      image_url = blob.url;
      console.log(`   ↳ uploaded ${p.file} → ${blob.url}`);
    } else {
      console.warn(`   ⚠ ${p.file} not found in seed-images/, inserting with empty image`);
    }

    await db.execute({
      sql: 'INSERT INTO products (slug, name, description, price, old_price, category, image_url, stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [p.slug, p.name, p.description, p.price, p.old_price, p.category, image_url, 100]
    });
    console.log(`   ✅ inserted ${p.slug}`);
  }

  // ---- 2. admin user ----
  // ... (keep your existing admin user creation logic) ...
  const adminEmail = 'admin@fastwear.local';
  const existingAdmin = (await db.execute({
    sql: 'SELECT id FROM users WHERE email = ?',
    args: [adminEmail]
  })).rows[0];

  if (!existingAdmin) {
    const hash = bcrypt.hashSync('admin123', 10);
    await db.execute({
      sql: 'INSERT INTO users (email, password_hash, name, phone, address, is_admin) VALUES (?, ?, ?, ?, ?, 1)',
      args: [adminEmail, hash, 'Admin', '01748-711230', 'FastWear HQ, Dhaka']
    });
    console.log(`✅ Admin created: ${adminEmail} / admin123`);
  } else {
    console.log('ℹ️  Admin already exists.');
  }
  
  console.log('\n🎉 Done.');
  process.exit(0);
})().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});