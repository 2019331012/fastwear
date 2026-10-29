(async function () {
  const me = await FW.getMe();
  if (!me) { location.href = '/login'; return; }
  await FW.wireSharedHeader();
  const params = new URLSearchParams(location.search);
  if (params.get('placed')) FW.showToast('Order placed successfully!');
  const orders = await FW.api('/api/orders');
  const wrap = document.getElementById('ordersList');
  if (!orders.length) { wrap.innerHTML = '<p style="color:#7a7a7a;text-align:center;padding:2rem;">No orders yet. <a href="/" style="color:#1e1e1e;font-weight:600;">Start shopping</a></p>'; return; }
  wrap.innerHTML = orders.map(o => `
    <div class="order-card">
      <div class="order-head">
        <div><h3>Order #${o.display_number}</h3><div style="color:#7a7a7a;font-size:.85rem;">${new Date(o.created_at + 'Z').toLocaleString()}</div></div>
        <span class="order-status status-${o.status}">${o.status}</span>
      </div>
      <div>${o.items.map(i => `
        <div class="summary-item">
          <div>${i.image_url ? `<img src="${i.image_url}" alt="" />` : `<div style="width:50px;height:50px;background:#f4f2f0;border-radius:10px;"></div>`}</div>
          <div class="summary-item-info"><div class="summary-item-name">${i.name}</div><div class="summary-item-meta">${FW.formatPrice(i.price)} × ${i.quantity}</div></div>
          <div style="font-weight:600;font-size:.9rem;">${FW.formatPrice(i.price * i.quantity)}</div>
        </div>`).join('')}
      </div>
      <div class="summary-total"><span>Total</span><span>${FW.formatPrice(o.total)}</span></div>
    </div>`).join('');
})();
