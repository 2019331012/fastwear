(async function () {
  await FW.wireSharedHeader();
  const slug = location.pathname.split('/').pop();
  let p;
  try { p = await FW.api('/api/products/' + slug); }
  catch { document.getElementById('productDetail').innerHTML = '<p style="width:100%;text-align:center;color:#c0392b;">Product not found.</p>'; return; }
  document.title = `${p.name} | FastWear`;
  document.getElementById('pageTitle').textContent = p.name;
  document.getElementById('pageBreadcrumb').textContent = `Home / ${p.category} / ${p.name}`;
  document.getElementById('productDetail').innerHTML = `
    <div class="product-gallery">${FW.productImageHTML(p)}</div>
    <div class="product-summary">
      <h2>${p.name}</h2>
      <div class="price-block">
        <span class="current">${FW.formatPrice(p.price)}</span>
        ${p.old_price ? `<span class="old">${FW.formatPrice(p.old_price)}</span>` : ''}
      </div>
      <p style="color:#5c5c5c;font-size:.95rem;">${p.description || ''}</p>
      <div class="quantity-row"><span class="quantity-label">Quantity</span>
        <div class="quantity-selector">
          <button id="qtyMinus">−</button>
          <input type="number" id="qtyInput" value="1" min="1" max="99" />
          <button id="qtyPlus">+</button>
        </div>
      </div>
      <button class="btn-add-to-cart" id="addToCartBtn"><i class="fas fa-shopping-cart"></i> Add to cart</button>
      <div class="product-meta">
        <p><i class="fas fa-truck"></i> Cash on delivery available</p>
        <p><i class="fas fa-exchange-alt"></i> Easy 7‑day return</p>
        <p><i class="fas fa-phone"></i> Order: 01748‑711230</p>
      </div>
    </div>`;
  const qtyInput = document.getElementById('qtyInput');
  document.getElementById('qtyMinus').addEventListener('click', () => qtyInput.value = Math.max(1, Math.min(99, (parseInt(qtyInput.value)||1) - 1)));
  document.getElementById('qtyPlus').addEventListener('click', () => qtyInput.value = Math.max(1, Math.min(99, (parseInt(qtyInput.value)||1) + 1)));
  const addBtn = document.getElementById('addToCartBtn');
  addBtn.addEventListener('click', async () => {
    const qty = parseInt(qtyInput.value) || 1;
    addBtn.disabled = true;
    const orig = addBtn.innerHTML;
    addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding…';
    try {
      await FW.api('/api/cart/add', { method: 'POST', body: JSON.stringify({ product_id: p.id, quantity: qty }) });
      await FW.refreshCartHeader(); FW.showToast(`${qty} × ${p.name} added`);
      addBtn.innerHTML = '<i class="fas fa-check"></i> Added!'; addBtn.style.background = '#2e7d32';
      setTimeout(() => { addBtn.innerHTML = orig; addBtn.style.background = ''; }, 1500);
    } catch { FW.showToast('Failed to add'); addBtn.innerHTML = orig; }
    addBtn.disabled = false;
  });
})();
