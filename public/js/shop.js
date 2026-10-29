(async function () {
  await FW.wireSharedHeader();
  const grid = document.getElementById('productGrid');
  const paginationEl = document.getElementById('pagination');
  const chipsEl = document.getElementById('categoryChips');
  const searchEl = document.getElementById('searchInput');
  const state = { q: '', category: 'all', page: 1, limit: 8 };
  const usp = new URLSearchParams(location.search);
  if (usp.get('q')) state.q = usp.get('q');
  if (usp.get('category')) state.category = usp.get('category');
  if (usp.get('page')) state.page = parseInt(usp.get('page'), 10) || 1;
  searchEl.value = state.q;
  let chipsRendered = false;

  async function load() {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#999;padding:2rem;">Loading…</p>';
    const q = new URLSearchParams({ q: state.q, category: state.category, page: state.page, limit: state.limit });
    let data;
    try { data = await FW.api('/api/products?' + q.toString()); }
    catch { grid.innerHTML = '<p style="grid-column:1/-1;color:#c0392b;">Failed to load.</p>'; return; }

    if (!chipsRendered) {
      chipsEl.innerHTML = `<button class="chip ${state.category==='all'?'active':''}" data-cat="all">All</button>` +
        data.categories.map(c => `<button class="chip ${state.category===c?'active':''}" data-cat="${c}">${c.replace(/-/g,' ')}</button>`).join('');
      chipsEl.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
        state.category = c.dataset.cat; state.page = 1;
        chipsEl.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x === c));
        syncURL(); load();
      }));
      chipsRendered = true;
    }
    if (!data.products.length) grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#999;padding:2rem;">No products match.</p>';
    else {
      grid.innerHTML = data.products.map(p => `
        <a class="product-card" href="/product/${p.slug}">
          <div class="product-image">${FW.productImageHTML(p)}</div>
          <div class="product-info">
            <div class="product-name">${p.name}</div>
            <div class="price-wrapper">
              ${p.old_price ? `<span class="original-price">${FW.formatPrice(p.old_price)}</span>` : ''}
              <span class="current-price">${FW.formatPrice(p.price)}</span>
            </div>
            <button class="add-to-cart" data-id="${p.id}"><i class="fas fa-plus"></i> Quick add</button>
          </div>
        </a>`).join('');
      grid.querySelectorAll('.add-to-cart').forEach(b => b.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation(); b.disabled = true;
        try { await FW.api('/api/cart/add', { method: 'POST', body: JSON.stringify({ product_id: parseInt(b.dataset.id), quantity: 1 }) });
          await FW.refreshCartHeader(); FW.showToast('Added to cart');
        } catch { FW.showToast('Failed to add'); }
        b.disabled = false;
      }));
    }
    renderPagination(data);
  }
  function renderPagination(data) {
    if (data.pages <= 1) { paginationEl.innerHTML = ''; return; }
    const btns = [`<button class="page-btn" data-page="${data.page-1}" ${data.page<=1?'disabled':''}>‹</button>`];
    const cur = data.page, total = data.pages, w = 2;
    let pages = [];
    for (let i = 1; i <= total; i++) if (i===1 || i===total || (i>=cur-w && i<=cur+w)) pages.push(i);
    let prev = 0;
    for (const p of pages) {
      if (prev && p - prev > 1) btns.push('<span class="page-info">…</span>');
      btns.push(`<button class="page-btn ${p===cur?'active':''}" data-page="${p}">${p}</button>`);
      prev = p;
    }
    btns.push(`<button class="page-btn" data-page="${data.page+1}" ${data.page>=total?'disabled':''}>›</button>`);
    paginationEl.innerHTML = btns.join('');
    paginationEl.querySelectorAll('.page-btn[data-page]').forEach(b => b.addEventListener('click', () => {
      const p = parseInt(b.dataset.page, 10);
      if (p<1 || p>total || p===cur) return;
      state.page = p; syncURL(); load();
      window.scrollTo({ top: 200, behavior: 'smooth' });
    }));
  }
  function syncURL() {
    const q = new URLSearchParams();
    if (state.q) q.set('q', state.q);
    if (state.category && state.category !== 'all') q.set('category', state.category);
    if (state.page > 1) q.set('page', state.page);
    const s = q.toString();
    history.replaceState(null, '', s ? '?' + s : location.pathname);
  }
  let t;
  searchEl.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = searchEl.value.trim(); state.page = 1; syncURL(); load(); }, 300);
  });
  load();
})();
