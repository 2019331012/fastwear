(function () {
  const CART_TOKEN_KEY = 'fastwear_cart_token';
  function getCartToken() {
    let t = localStorage.getItem(CART_TOKEN_KEY);
    if (!t) { t = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2); localStorage.setItem(CART_TOKEN_KEY, t); }
    return t;
  }
  /*async function api(url, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    headers['X-Cart-Token'] = getCartToken();
    const res = await fetch(url, { ...opts, headers });
    let data = null; try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }*/
  
  async function api(url, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  headers['X-Cart-Token'] = getCartToken();
    const token = localStorage.getItem('fastwear_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(url, { ...opts, headers });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }
  
  function formatPrice(n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 }) + '৳'; }
  function showToast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._timer); t._timer = setTimeout(() => t.classList.remove('show'), 2200);
  }
/*  async function refreshCartHeader() {
    try {
      const cart = await api('/api/cart');
      const ht = document.getElementById('headerTotal'); const hc = document.getElementById('headerCount');
      if (ht) ht.textContent = formatPrice(cart.total);
      if (hc) hc.textContent = cart.count;
      return cart;
    } catch { return { items: [], total: 0, count: 0 }; }
  }
*/
  async function refreshCartHeader() {
    try {
      const cart = await api('/api/cart');
      const ht = document.getElementById('headerTotal');
      const hc = document.getElementById('headerCount');
      if (ht) ht.textContent = formatPrice(cart.total);
      if (hc) hc.textContent = cart.count;
      renderCartDrawer(cart);        // <-- NEW: keep the drawer in sync
      return cart;
    } catch {
      return { items: [], total: 0, count: 0 };
    }
  }

  function renderCartDrawer(cart) {
    const container = document.getElementById('cartItems');
    if (!container) return;                          // page has no drawer

    if (!cart.items.length) {
      container.innerHTML = `
        <div class="empty-cart">
          <i class="fas fa-shopping-bag" style="font-size:2rem;margin-bottom:0.8rem;display:block;color:#ccc;"></i>
          Your cart is empty
        </div>`;
      const totalEl = document.getElementById('cartTotal');
      if (totalEl) totalEl.textContent = formatPrice(0);
      return;
    }

    container.innerHTML = cart.items.map(i => `
      <div class="cart-item" data-id="${i.id}">
        <div class="cart-item-img">
          ${i.image_url ? `<img src="${i.image_url}" alt="${i.name}" />` : '<i class="fas fa-tshirt"></i>'}
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${i.name}</div>
          <div class="cart-item-price">${formatPrice(i.price)}</div>
          <div class="cart-item-controls">
            <button class="qty-btn" data-action="dec">−</button>
            <span class="cart-item-qty">${i.quantity}</span>
            <button class="qty-btn" data-action="inc">+</button>
            <button class="cart-item-remove" data-action="remove">Remove</button>
          </div>
        </div>
      </div>
    `).join('');

    const totalEl = document.getElementById('cartTotal');
    if (totalEl) totalEl.textContent = formatPrice(cart.total);

    // wire up qty / remove buttons inside the drawer
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.cart-item');
        const itemId = parseInt(row.dataset.id, 10);
        const item = cart.items.find(x => x.id === itemId);
        if (!item) return;
        const action = btn.dataset.action;
        try {
          if (action === 'remove') {
            await api('/api/cart/remove', { method: 'POST', body: JSON.stringify({ item_id: itemId }) });
          } else if (action === 'inc') {
            await api('/api/cart/update', { method: 'POST', body: JSON.stringify({ item_id: itemId, quantity: item.quantity + 1 }) });
          } else if (action === 'dec') {
            if (item.quantity <= 1) {
              await api('/api/cart/remove', { method: 'POST', body: JSON.stringify({ item_id: itemId }) });
            } else {
              await api('/api/cart/update', { method: 'POST', body: JSON.stringify({ item_id: itemId, quantity: item.quantity - 1 }) });
            }
          }
          await refreshCartHeader();     // re-fetch + re-render everything
        } catch (e) {
          showToast(e.message || 'Failed');
        }
      });
    });
  }
  
  async function getMe() { try { return (await api('/api/auth/me')).user; } catch { return null; } }
  function productImageHTML(p) {
    if (p.image_url) return `<img src="${p.image_url}" alt="${p.name}" loading="lazy" />`;
    return `<i class="fas fa-tshirt"></i>`;
  }
  async function wireSharedHeader() {
    const sideMenu = document.getElementById('sideMenu');
    const menuOverlay = document.getElementById('menuOverlay');
    const cartDrawer = document.getElementById('cartDrawer');
    const openMenu = () => { sideMenu?.classList.add('open'); menuOverlay?.classList.add('active'); document.body.style.overflow = 'hidden'; };
    const closeMenu = () => { sideMenu?.classList.remove('open'); menuOverlay?.classList.remove('active'); document.body.style.overflow = ''; };
    const openCart = () => { cartDrawer?.classList.add('open'); menuOverlay?.classList.add('active'); };
    const closeCart = () => { cartDrawer?.classList.remove('open'); menuOverlay?.classList.remove('active'); };
    document.getElementById('hamburgerBtn')?.addEventListener('click', openMenu);
    document.getElementById('closeMenuBtn')?.addEventListener('click', closeMenu);
    document.getElementById('closeCartBtn')?.addEventListener('click', closeCart);
    document.getElementById('cartInfoBtn')?.addEventListener('click', openCart);
    menuOverlay?.addEventListener('click', () => { closeMenu(); closeCart(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); closeCart(); } });

    const slot = document.getElementById('userSlot');
    if (slot) {
      const me = await getMe();
      if (me) {
        slot.innerHTML = `
          <a class="user-chip" href="${me.is_admin ? '/admin' : '/orders'}" title="Account"><i class="fas fa-user"></i> ${me.name.split(' ')[0]}</a>
          <button class="user-chip" id="logoutBtn" title="Logout"><i class="fas fa-sign-out-alt"></i></button>
        `;
        // document.getElementById('logoutBtn').addEventListener('click', async () => {
        //   await api('/api/auth/logout', { method: 'POST' }); location.reload();
        // });
        document.getElementById('logoutBtn').addEventListener('click', () => {
          localStorage.removeItem('fastwear_token');
          location.reload();
        });
      } else {
        slot.innerHTML = `<a class="user-chip" href="/login"><i class="fas fa-user"></i> Login</a>`;
      }
    }

    const scrollBtn = document.getElementById('scrollTopBtn');
    if (scrollBtn) {
      window.addEventListener('scroll', () => scrollBtn.classList.toggle('show', window.scrollY > 300));
      scrollBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }
    await refreshCartHeader();
  }
//    window.FW = { api, getCartToken, formatPrice, showToast, refreshCartHeader, getMe, productImageHTML, wireSharedHeader };
  
  window.FW = {
    api, getCartToken, formatPrice, showToast,
    refreshCartHeader, renderCartDrawer, getMe,
    productImageHTML, wireSharedHeader
  };
  
})();

