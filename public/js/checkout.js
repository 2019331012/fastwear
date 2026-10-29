(async function () {
  const me = await FW.getMe();
  await FW.wireSharedHeader();
  if (!me) document.getElementById('guestNote').style.display = 'flex';
  if (!me) document.querySelectorAll('#paymentSelect option[data-user-only]').forEach(o => o.remove());
  const cart = await FW.api('/api/cart');
  if (!cart.items.length) {
    document.getElementById('checkoutGrid').innerHTML = '<div class="checkout-card" style="grid-column:1/-1;text-align:center;">Your cart is empty. <a href="/" style="color:#1e1e1e;font-weight:600;">Continue shopping</a></div>';
    return;
  }
  document.getElementById('summaryItems').innerHTML = cart.items.map(i => `
    <div class="summary-item">
      <div>${i.image_url ? `<img src="${i.image_url}" alt="" />` : `<div style="width:50px;height:50px;background:#f4f2f0;border-radius:10px;"></div>`}</div>
      <div class="summary-item-info"><div class="summary-item-name">${i.name}</div><div class="summary-item-meta">${FW.formatPrice(i.price)} × ${i.quantity}</div></div>
      <div style="font-weight:700;font-size:.9rem;">${FW.formatPrice(i.price * i.quantity)}</div>
    </div>`).join('');
  document.getElementById('summaryTotal').textContent = FW.formatPrice(cart.total);
  const form = document.getElementById('checkoutForm');
  if (me) {
    form.shipping_name.value = me.name || '';
    form.shipping_email.value = me.email || '';
    form.shipping_phone.value = me.phone || '';
    form.shipping_address.value = me.address || '';
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('error');
    const btn = document.getElementById('placeOrderBtn');
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Placing…';
    const fd = new FormData(form);
    try {
      const res = await FW.api('/api/checkout', { method: 'POST', body: JSON.stringify({
        shipping_name: fd.get('shipping_name'),
        shipping_email: fd.get('shipping_email'),
        shipping_phone: fd.get('shipping_phone'),
        shipping_address: fd.get('shipping_address'),
        payment_method: fd.get('payment_method')
      })});
      if (res.guest_token) {
        localStorage.setItem('guest_order_' + res.order_id, res.guest_token);
        location.href = `/order/${res.order_id}?token=${res.guest_token}`;
      } else location.href = '/orders?placed=' + res.order_id;
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false; btn.textContent = 'Place order';
    }
  });
})();
