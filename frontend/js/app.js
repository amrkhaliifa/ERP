const API = "/api";

async function json(url, opts = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Tabs
const tabs = document.querySelectorAll('#tabs .nav-link');
tabs.forEach(btn => btn.addEventListener('click', () => {
tabs.forEach(b => b.classList.remove('active'));
btn.classList.add('active');
document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
document.querySelector(btn.dataset.target).classList.add('active');
}));

// Clients
const clientForm = document.getElementById('clientForm');
clientForm.addEventListener('submit', async (e) => {
e.preventDefault();
const fd = new FormData(clientForm);
await json(`${API}/clients`, { method: 'POST', body: JSON.stringify(Object.fromEntries(fd)) });
clientForm.reset();
loadClients();
loadClientsForOrder();
});

async function loadClients() {
  const rows = await json(`${API}/clients`);
  const tbody = document.querySelector("#clientsTable tbody");
  tbody.innerHTML = rows
    .map(
      (r) =>
        `<tr><td>${r.id}</td><td>${r.name}</td><td>${r.phone || ""}</td><td>${
          r.address || ""
        }</td></tr>`
    )
    .join("");
}

async function loadClientsForOrder() {
  const rows = await json(`${API}/clients`);
  const sel = document.getElementById("orderClient");
  sel.innerHTML = rows
    .map((r) => `<option value="${r.id}">${r.name}</option>`)
    .join("");
}

// Products
const productForm = document.getElementById('productForm');
productForm.addEventListener('submit', async (e) => {
e.preventDefault();
const fd = new FormData(productForm);
const data = Object.fromEntries(fd);
['cost_price','default_sale_price'].forEach(k => data[k] = parseFloat(data[k]||0));
await json(`${API}/products`, { method: 'POST', body: JSON.stringify(data) });
productForm.reset();
loadProducts();
});


async function loadProducts() {
const rows = await json(`${API}/products`);
const tbody = document.querySelector('#productsTable tbody');
tbody.innerHTML = rows.map(p => `<tr><td>${p.id}</td><td>${p.name}</td><td>${p.color||''}</td><td>${p.unit||''}</td><td>${p.cost_price}</td><td>${p.default_sale_price}</td><td>${p.stock_qty}</td></tr>`).join('');
}

// Orders
const orderForm = document.getElementById('orderForm');
orderForm.addEventListener('submit', async (e) => {
e.preventDefault();
const fd = new FormData(orderForm);
const clientId = parseInt(fd.get('clientId')); const deposit = parseFloat(fd.get('deposit')||0);
let items = [];
try { items = JSON.parse(fd.get('items')||'[]'); } catch {}
await json(`${API}/orders`, { method: 'POST', body: JSON.stringify({ clientId, deposit, items }) });
orderForm.reset();
loadOrders();
loadProducts();
});

async function loadOrders() {
  const rows = await json(`${API}/orders`);
  const tbody = document.querySelector("#ordersTable tbody");
  tbody.innerHTML = rows
    .map((o) => {
      const paid = o.total_paid;
      const balance = o.subtotal - o.total_paid;
      return `<tr><td>${o.id}</td><td>${
        o.client_name
      }</td><td>${o.subtotal.toFixed(2)}</td><td>${paid.toFixed(
        2
      )}</td><td>${balance.toFixed(2)}</td><td>${o.created_at}</td></tr>`;
    })
    .join("");
}

// Reports
async function loadOutstanding() {
const rows = await json(`${API}/reports/outstanding`);
const tbody = document.querySelector('#outstandingTable tbody');
tbody.innerHTML = rows.map(r => `<tr><td>${r.id}</td><td>${r.client}</td><td>${r.subtotal.toFixed(2)}</td><td>${r.paid.toFixed(2)}</td><td>${r.balance.toFixed(2)}</td><td>${r.created_at}</td></tr>`).join('');
}


document.getElementById('loadProfit').addEventListener('click', async () => {
const from = document.getElementById('from').value;
const to = document.getElementById('to').value;
const qs = new URLSearchParams({ ...(from?{from}:{}) , ...(to?{to}:{}) }).toString();
const data = await json(`${API}/reports/profit${qs ? '?' + qs : ''}`);
const d = data.totals;
document.getElementById('profitTotals').innerHTML = `<div class="alert alert-info">Orders: <b>${d.count}</b> — Revenue: <b>${d.revenue.toFixed(2)}</b> — Cost: <b>${d.cost.toFixed(2)}</b> — Profit: <b>${d.profit.toFixed(2)}</b></div>`;
});

// Init
(async function init(){
await loadClients();
await loadClientsForOrder();
await loadProducts();
await loadOrders();
await loadOutstanding();
})();
