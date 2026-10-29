(async function () {
  const me = await FW.getMe();
  if (!me || !me.is_admin) { location.href = '/login'; return; }
  await FW.wireSharedHeader();
  let products = [];
  const productsBody = document.getElementById('productsBody');

  async function loadProducts() {
    products = await FW.api('/api/admin/products');
    productsBody.innerHTML = products.map(p => `
      <tr>
        <td>${p.image_url ? `<img src="${p.image_url}" alt="" />` : '<div style="width:40px;height:40px;background:#f4f2f0;border-radius:8px;"></div>'}</td>
        <td>${p.name}<div style="font-size:.75rem;color:#999;">/${p.slug}</div></td>
        <td>${p.category}</td>
        <td>${FW.formatPrice(p.price)}${p.old_price ? `<div style="font-size:.75rem;color:#999;text-decoration:line-through;">${FW.formatPrice(p.old_price)}</div>` : ''}</td>
        <td>${p.stock}</td>
        <td style="text-align:right;white-space:nowrap;">
          <button class="icon-btn" data-edit="${p.id}"><i class="fas fa-pen"></i></button>
          <button class="icon-btn danger" data-del="${p.id}"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('');
    productsBody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openModal(parseInt(b.dataset.edit))));
    productsBody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Delete?')) return;
      try { await FW.api('/api/admin/products/' + b.dataset.del, { method: 'DELETE' }); FW.showToast('Deleted'); loadProducts(); }
      catch (e) { FW.showToast(e.message); }
    }));
  }

  const modal = document.getElementById('productModal');
  const form = document.getElementById('productForm');
  const modalTitle = document.getElementById('modalTitle');
  const modalError = document.getElementById('modalError');
  const imagePreview = document.getElementById('imagePreview');

  function openModal(id = null) {
    modalError.textContent = ''; form.reset(); imagePreview.style.display = 'none';
    form.querySelector('[name=id]').value = id || '';
    modalTitle.textContent = id ? 'Edit product' : 'New product';
    if (id) {
      const p = products.find(x => x.id === id);
      form.name.value = p.name; form.slug.value = p.slug;
      form.description.value = p.description || '';
      form.category.value = p.category; form.price.value = p.price;
      form.old_price.value = p.old_price || ''; form.stock.value = p.stock;
      if (p.image_url) { imagePreview.src = p.image_url; imagePreview.style.display = 'block'; }
    }
    modal.classList.add('active');
  }
  function closeModal() { modal.classList.remove('active'); }
  document.getElementById('newProductBtn').addEventListener('click', () => openModal());
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  form.image.addEventListener('change', () => {
    const f = form.image.files[0];
    if (f) { imagePreview.src = URL.createObjectURL(f); imagePreview.style.display = 'block'; }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    modalError.textContent = '';
    const id = form.id.value;
    const fd = new FormData(form);
    const url = id ? `/api/admin/products/${id}` : '/api/admin/products';
    const method = id ? 'PUT' : 'POST';
    try {
      const res = await fetch(url, { method, body: fd, headers: { 'X-Cart-Token': FW.getCartToken() } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      closeModal(); FW.showToast(id ? 'Updated' : 'Created'); loadProducts();
    } catch (e) { modalError.textContent = e.message; }
  });

  document.querySelectorAll('.admin-tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById('productsTab').style.display = t.dataset.tab === 'products' ? 'block' : 'none';
    document.getElementById('ordersTab').style.display = t.dataset.tab === 'orders' ? 'block' : 'none';
    if (t.dataset.tab === 'orders') loadOrders();
  }));

  async function loadOrders() {
    const wrap = document.getElementById('ordersBody');
    const orders = await FW.api('/api/admin/orders');
    if (!orders.length) { wrap.innerHTML = '<p style="color:#7a7a7a;">No orders yet.</p>'; return; }
    wrap.innerHTML = orders.map(o => `
      <div class="order-card">
        <div class="order-head">
          <div>
            <h3>Order #${o.id} ${o.is_guest ? '<span style="font-size:.7rem;background:#fff8e1;color:#8a6d3b;padding:.2rem .5rem;border-radius:20px;margin-left:.3rem;">GUEST</span>' : ''}</h3>
            <div style="color:#7a7a7a;font-size:.85rem;">${new Date(o.created_at + 'Z').toLocaleString()} · ${o.customer_name || '—'} (${o.customer_email || 'no email'})</div>
          </div>
          <div style="display:flex;gap:.5rem;align-items:center;">
            <span class="order-status status-${o.status}">${o.status}</span>
            <select data-status="${o.id}" style="border:1px solid #ddd;border-radius:8px;padding:.35rem;font-family:inherit;">
              <option value="">Change…</option>
              ${['pending','paid','shipped','delivered','cancelled'].map(s => `<option value="${s}" ${s===o.status?'disabled':''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
        <div>${o.items.map(i => `
          <div class="summary-item">
            <div>${i.image_url ? `<img src="${i.image_url}" alt="" />` : '<div style="width:50px;height:50px;background:#f4f2f0;border-radius:10px;"></div>'}</div>
            <div class="summary-item-info"><div class="summary-item-name">${i.name}</div><div class="summary-item-meta">${FW.formatPrice(i.price)} × ${i.quantity}</div></div>
            <div style="font-weight:600;font-size:.9rem;">${FW.formatPrice(i.price * i.quantity)}</div>
          </div>`).join('')}
        </div>
        <div class="summary-total"><span>Total</span><span>${FW.formatPrice(o.total)}</span></div>
        <div style="font-size:.8rem;color:#7a7a7a;margin-top:.5rem;">Ship to: ${o.shipping_name} · ${o.shipping_phone}${o.shipping_email ? ' · ' + o.shipping_email : ''}<br/>${o.shipping_address} · ${o.payment_method.toUpperCase()}</div>
      </div>`).join('');
    wrap.querySelectorAll('[data-status]').forEach(sel => sel.addEventListener('change', async () => {
      if (!sel.value) return;
      try { await FW.api(`/api/admin/orders/${sel.dataset.status}/status`, { method: 'PUT', body: JSON.stringify({ status: sel.value }) }); FW.showToast('Status updated'); loadOrders(); }
      catch (e) { FW.showToast(e.message); }
    }));
  }
  loadProducts();
})();
