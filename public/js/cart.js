(async function () {
  await FW.wireSharedHeader();

  const wrap = document.getElementById('cartWrap');

  async function render() {
    let cart;
    try { cart = await FW.api('/api/cart'); }
    catch {
      wrap.innerHTML = '<p style="color:#c0392b;text-align:center;padding:2rem;">Failed to load cart.</p>';
      return;
    }

    // ---- Empty state, matching the reference exactly ----
    if (!cart.items.length) {
      wrap.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-icon"><i class="fas fa-shopping-bag"></i></div>
          <p class="cart-empty-msg">Your cart is currently empty.</p>
          <a href="/" class="btn-return-shop">Return to shop</a>
        </div>
      `;
      return;
    }

    // ---- Populated state ----
    wrap.innerHTML = `
      <div class="cart-page-grid">
        <div class="cart-page-items">
          <div class="cart-page-head">
            <span>Product</span><span>Price</span><span>Quantity</span><span>Total</span><span></span>
          </div>
          ${cart.items.map(i => `
            <div class="cart-page-row" data-id="${i.id}">
              <div class="cart-page-product">
                <div class="cart-page-img">
                  ${i.image_url ? `<img src="${i.image_url}" alt="${i.name}" />` : '<i class="fas fa-tshirt"></i>'}
                </div>
                <div>
                  <a class="cart-page-name" href="/product/${i.slug}">${i.name}</a>
                </div>
              </div>
              <div class="cart-page-price">${FW.formatPrice(i.price)}</div>
              <div class="cart-page-qty">
                <button class="qty-btn" data-action="dec">−</button>
                <span class="cart-page-qty-val">${i.quantity}</span>
                <button class="qty-btn" data-action="inc">+</button>
              </div>
              <div class="cart-page-total">${FW.formatPrice(i.price * i.quantity)}</div>
              <div class="cart-page-remove">
                <button class="remove-btn" data-action="remove" aria-label="Remove"><i class="fas fa-times"></i></button>
              </div>
            </div>
          `).join('')}
        </div>

        <aside class="cart-page-summary">
          <h3>Cart totals</h3>
          <div class="cart-summary-row">
            <span>Subtotal</span><span>${FW.formatPrice(cart.total)}</span>
          </div>
          <div class="cart-summary-row">
            <span>Shipping</span><span style="color:#7a7a7a;font-size:0.85rem;">Calculated at checkout</span>
          </div>
          <div class="cart-summary-row total">
            <span>Total</span><span>${FW.formatPrice(cart.total)}</span>
          </div>
          <a href="/checkout" class="btn-primary" style="text-decoration:none;display:block;text-align:center;margin-top:1rem;">Proceed to checkout</a>
          <a href="/" class="btn-continue" style="display:block;text-align:center;margin-top:0.7rem;">Continue shopping</a>
        </aside>
      </div>
    `;

    // wire up qty / remove
    wrap.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.cart-page-row');
        const itemId = parseInt(row.dataset.id, 10);
        const item = cart.items.find(i => i.id === itemId);
        if (!item) return;
        const action = btn.dataset.action;

        try {
          if (action === 'remove') {
            await FW.api('/api/cart/remove', { method: 'POST', body: JSON.stringify({ item_id: itemId }) });
          } else if (action === 'inc') {
            await FW.api('/api/cart/update', { method: 'POST', body: JSON.stringify({ item_id: itemId, quantity: item.quantity + 1 }) });
          } else if (action === 'dec') {
            if (item.quantity <= 1) {
              await FW.api('/api/cart/remove', { method: 'POST', body: JSON.stringify({ item_id: itemId }) });
            } else {
              await FW.api('/api/cart/update', { method: 'POST', body: JSON.stringify({ item_id: itemId, quantity: item.quantity - 1 }) });
            }
          }
          await FW.refreshCartHeader();
          await render();
        } catch (e) {
          FW.showToast(e.message);
        }
      });
    });
  }

  await render();
})();
