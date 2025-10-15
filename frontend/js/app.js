const API = "/api";

async function json(url, opts = {}) {
    const controller = new AbortController();
    const timeout = opts.timeout || 10000;
    const _opts = { signal: controller.signal, ...opts };

    // Only set Content-Type when sending a body
    if (_opts.body) {
        _opts.headers = {
            "Content-Type": "application/json",
            ...(opts.headers || {}),
        };
    } else if (opts.headers) {
        _opts.headers = opts.headers;
    }

    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, _opts);
        clearTimeout(timer);

        // No content
        if (res.status === 204) return null;

        const text = await res.text();
        if (!text) {
            if (!res.ok) throw new Error(res.statusText || `HTTP ${res.status}`);
            return null;
        }

        let body;
        try {
            body = JSON.parse(text);
        } catch {
            body = text;
        }

        if (!res.ok) {
            const msg =
                (body && body.error) ||
                (typeof body === "string" && body) ||
                res.statusText ||
                `HTTP ${res.status}`;
            const e = new Error(msg);
            e.status = res.status;
            throw e;
        }
        return body;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

// --- add: centralized refresh helper ---
async function refreshAll() {
    // run independent loaders in parallel, but keep Clients -> order-client select in case it depends
    // run clients first to ensure order client select can use them if needed
    try {
        await loadClients();
    } catch (e) {
        console.warn("loadClients failed", e);
    }

    await Promise.all([
        (async() => {
            try {
                await loadClientsForOrder();
            } catch (e) {
                console.warn("loadClientsForOrder failed", e);
            }
        })(),
        (async() => {
            try {
                await loadProducts();
            } catch (e) {
                console.warn("loadProducts failed", e);
            }
        })(),
        (async() => {
            try {
                await loadProductsForOrder();
            } catch (e) {
                console.warn("loadProductsForOrder failed", e);
            }
        })(),
        (async() => {
            try {
                await loadOrders();
            } catch (e) {
                console.warn("loadOrders failed", e);
            }
        })(),
        (async() => {
            try {
                await loadOutstanding();
            } catch (e) {
                console.warn("loadOutstanding failed", e);
            }
        })(),
    ]);
}

// Tabs
const tabs = document.querySelectorAll("#tabs .nav-link");
tabs.forEach((btn) =>
    btn.addEventListener("click", async() => {
        tabs.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        document
            .querySelectorAll(".tab-pane")
            .forEach((p) => p.classList.remove("active"));
        const target = document.querySelector(btn.dataset.target);
        if (target) target.classList.add("active");

        // call loader for target pane
        try {
            const id = (btn.dataset.target || "").replace("#", "");
            if (id === "clients") await loadClients();
            else if (id === "inventory") await loadProducts();
            else if (id === "orders") await loadOrders();
            else if (id === "reports") {
                await loadOutstanding();
                // optionally keep profit data unchanged until user requests
            }
            // always refresh selects used across tabs
            await loadClientsForOrder().catch(() => {});
            await loadProductsForOrder().catch(() => {});
        } catch (e) {
            console.warn("pane load failed", e);
        }
    })
);

// Add Clients
const clientForm = document.getElementById("clientForm");
if (clientForm) {
    clientForm.addEventListener("submit", async(e) => {
        e.preventDefault();
        const fd = new FormData(clientForm);
        await json(`${API}/clients`, {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(fd)),
        });
        clientForm.reset();
        await refreshAll();
    });
} else {
    console.warn("clientForm not found in DOM.");
}

// Clients List
async function loadClients() {
    try {
        const rows = await json(`${API}/clients`);
        // fetch orders to compute purchases per client
        let orders = [];
        try {
            orders = await json(`${API}/orders`);
        } catch {
            orders = [];
        }

        const counts = {};
        (orders || []).forEach((o) => {
            // resolve client id from possible shapes
            let cid = null;
            if (o.client && typeof o.client === "object") {
                cid = o.client.id ?? o.clientId ?? o.client_id;
            } else if (o.client) {
                // could be numeric string or number
                cid = o.clientId ?? o.client_id ?? o.client;
            } else {
                cid = o.clientId ?? o.client_id ?? o.client;
            }
            cid = parseInt(cid);
            if (!Number.isNaN(cid)) counts[cid] = (counts[cid] || 0) + 1;
        });

        let table = document.getElementById("clientsTable");
        if (!table) return;
        let tbody = table.querySelector("tbody");
        if (!tbody) {
            tbody = document.createElement("tbody");
            table.appendChild(tbody);
        }

        tbody.innerHTML = (rows || [])
            .map((r) => {
                const purchases = counts[r.id] || 0;
                return `<tr>
            <td>${r.id}</td>
            <td>${escapeHtml(r.name)}</td>
            <td>${r.phone || ""}</td>
            <td>${r.address || ""}</td>
            <td>${purchases}</td>
            <td>
              <div class="row g-2">
                <div class="col-md-3 d-grid">
                  <button class="btn btn-outline-primary" onclick="editClient(${
                    r.id
                  })">Edit</button>
                </div>
                <div class="col-md-3 d-grid">
                  <button class="btn btn-outline-danger" onclick="deleteClient(${
                    r.id
                  })">Delete</button>
                </div>
              </div>
            </td>
          </tr>`;
            })
            .join("");
    } catch (err) {
        console.error("Failed to load clients:", err);
        alert(err.message || "Failed to load clients");
    }
}

// Delete client
async function deleteClient(id) {
    if (!confirm("Are you sure you want to delete this client?")) return;
    try {
        await json(`${API}/clients/${id}`, { method: "DELETE" });
    } catch (err) {
        // show error to user
        alert(err.message || "Failed to delete client");
    } finally {
        // always refresh lists so UI stays consistent
        await refreshAll();
    }
}

// Edit client (modal)
function attachEditModalHandlers(modal) {
    if (!modal) return;
    const form = modal.querySelector("#editClientForm");
    // dismiss buttons (X / Cancel / backdrop)
    modal.querySelectorAll("[data-dismiss='modal']").forEach((el) => {
        // avoid double-registering
        if (el.dataset.wiredDismiss) return;
        el.addEventListener("click", () => {
            modal.classList.remove("show");
            modal.setAttribute("aria-hidden", "true");
        });
        el.dataset.wiredDismiss = "1";
    });

    // backdrop click should close
    const backdrop = modal.querySelector(".modal-backdrop");
    if (backdrop && !backdrop.dataset.wiredBackdrop) {
        backdrop.addEventListener("click", () => {
            modal.classList.remove("show");
            modal.setAttribute("aria-hidden", "true");
        });
        backdrop.dataset.wiredBackdrop = "1";
    }

    // submit handler for the edit form
    if (form && !form.dataset.wiredSubmit) {
        form.addEventListener("submit", async(e) => {
            e.preventDefault();
            const fd = new FormData(form);
            const id = fd.get("id");
            if (!id) {
                alert("Missing client id.");
                return;
            }
            try {
                await json(`${API}/clients/${id}`, {
                    method: "PUT",
                    body: JSON.stringify(Object.fromEntries(fd)),
                    headers: { "Content-Type": "application/json" },
                });
                modal.classList.remove("show");
                modal.setAttribute("aria-hidden", "true");
                await refreshAll();
            } catch (err) {
                alert(err.message || "Failed to update client.");
            }
        });
        form.dataset.wiredSubmit = "1";
    }
}
// Show edit client modal
async function editClient(id) {
    try {
        const clientToEdit = await json(`${API}/clients/${id}`);

        // find existing modal/form (page may include them)
        let modal = document.getElementById("editClientModal");
        let form = document.getElementById("editClientForm");

        // if no modal in DOM, create it (keeps markup out of HTML if you prefer)
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "editClientModal";
            modal.className = "modal";
            modal.innerHTML = `
        <div class="modal-backdrop" data-dismiss="modal"></div>
        <div class="modal-content" role="dialog" aria-modal="true">
          <header class="modal-header">
            <h3>Edit Client</h3>
            <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close"></button>
          </header>
          <form id="editClientForm" class="modal-body">
            <input type="hidden" id="editClientId" name="id">
            <div class="form-row">
              <label for="editClientName">Name</label>
              <input type="text" id="editClientName" name="name" required>
            </div>
            <div class="form-row">
              <label for="editClientPhone">Phone</label>
              <input type="text" id="editClientPhone" name="phone">
            </div>
            <div class="form-row">
              <label for="editClientAddress">Address</label>
              <input type="text" id="editClientAddress" name="address">
            </div>
            <footer class="modal-footer">
              <button type="submit" class="btn btn-primary">Save</button>
              <button type="button" class="btn btn-outline-warning" data-dismiss="modal">Cancel</button>
            </footer>
          </form>
        </div>
      `;
            document.body.appendChild(modal);
            form = document.getElementById("editClientForm");
        }

        // ensure handlers are attached (works for modal provided in HTML or created above)
        attachEditModalHandlers(modal);

        // populate inputs
        const idInput = document.getElementById("editClientId");
        const nameInput = document.getElementById("editClientName");
        const phoneInput = document.getElementById("editClientPhone");
        const addrInput = document.getElementById("editClientAddress");

        if (!idInput || !nameInput || !phoneInput || !addrInput) {
            alert("Failed to initialize edit form inputs.");
            return;
        }

        idInput.value = clientToEdit.id ?? "";
        nameInput.value = clientToEdit.name ?? "";
        phoneInput.value = clientToEdit.phone ?? "";
        addrInput.value = clientToEdit.address ?? "";

        // show modal
        modal.classList.add("show");
        modal.setAttribute("aria-hidden", "false");
    } catch (err) {
        alert(err.message || "Failed to load client for editing.");
    }
}

// Load clients into order form select
async function loadClientsForOrder() {
    const rows = await json(`${API}/clients`);
  clients = rows || [];
  const select = document.getElementById("orderClient");
  if (!select) return;
  select.innerHTML =
    `<option value="">Select a client</option>` +
    clients
      .map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`)
      .join("");
  makeSearchable(select);
    
    const input = document.getElementById("orderClient");
    if (input) makeSearchable(input);
}

async function loadProductsForOrder() {
    const rows = await json(`${API}/products`);
    products = rows || [];
    const select = document.getElementById("orderProduct");
    if (!select) return;
    select.innerHTML = `<option value="">Select a product</option>` +
        products.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    makeSearchable(select);
}

// Make select searchable
function makeSearchable(select) {
    if (!select || select.dataset.searchable) return;
    select.dataset.searchable = "true";

    // Create wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "searchable-select-wrapper";
    wrapper.style.position = "relative";
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);

    // Create input for searching
    const input = document.createElement("input");
    input.type = "text";
    input.className = "form-control searchable-input";
    input.placeholder = "";
    wrapper.appendChild(input);

    // Initialize input with selected option's text if a value is pre-selected
    if (select.value) {
        const selectedOption = Array.from(select.options).find(o => o.value == select.value);
        if (selectedOption) {
            input.value = selectedOption.textContent;
        }
    }

    // Create dropdown list
    const dropdown = document.createElement("div");
    dropdown.className = "searchable-dropdown";
    dropdown.style.display = "none";
    dropdown.style.position = "absolute";
    dropdown.style.top = "100%";
    dropdown.style.left = "0";
    dropdown.style.right = "0";
    dropdown.style.background = "white";
    dropdown.style.border = "1px solid #ccc";
    dropdown.style.borderTop = "none";
    dropdown.style.maxHeight = "200px";
    dropdown.style.overflowY = "auto";
    dropdown.style.zIndex = "1000";
    wrapper.appendChild(dropdown);

    let options = Array.from(select.options).filter(o => o.value !== ""); // Exclude placeholder
    let filteredOptions = [...options];
    let currentIndex = -1;

    function updateDropdown() {
        dropdown.innerHTML = "";
        filteredOptions.forEach((option, index) => {
            const item = document.createElement("div");
            item.className = "searchable-option";
            item.textContent = option.textContent;
            item.style.padding = "8px 12px";
            item.style.cursor = "pointer";
            item.style.borderBottom = "1px solid #eee";
            if (index === currentIndex) {
                item.classList.add("highlighted");
                item.style.backgroundColor = "#007bff";
                item.style.color = "white";
            }
            item.addEventListener("click", () => {
                selectOption(option);
            });
            item.addEventListener("mouseenter", () => {
                if (index !== currentIndex) {
                    item.style.backgroundColor = "#f8f9fa";
                    item.style.color = "black";
                }
            });
            item.addEventListener("mouseleave", () => {
                if (index !== currentIndex) {
                    item.style.backgroundColor = "white";
                    item.style.color = "black";
                }
            });
            dropdown.appendChild(item);
        });
    }

    function selectOption(option) {
        select.value = option.value;
        input.value = option.textContent;
        dropdown.style.display = "none";
        currentIndex = -1;
        select.dispatchEvent(new Event("change"));
    }

    function highlightOption(index) {
        const items = dropdown.querySelectorAll(".searchable-option");
        items.forEach((item, i) => {
            if (i === index) {
                item.classList.add("highlighted");
                item.style.backgroundColor = "#007bff";
                item.style.color = "white";
            } else {
                item.classList.remove("highlighted");
                item.style.backgroundColor = "white";
                item.style.color = "black";
            }
        });
    }

    input.addEventListener("input", () => {
        const query = input.value.toLowerCase();
        filteredOptions = options.filter(option =>
            option.textContent.toLowerCase().includes(query)
        );
        currentIndex = filteredOptions.length > 0 ? 0 : -1;
        updateDropdown();
        if (dropdown.style.display !== "block") {
            dropdown.style.display = "block";
        }
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (currentIndex < filteredOptions.length - 1) {
                currentIndex++;
                highlightOption(currentIndex);
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (currentIndex > 0) {
                currentIndex--;
                highlightOption(currentIndex);
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (currentIndex >= 0 && currentIndex < filteredOptions.length) {
                selectOption(filteredOptions[currentIndex]);
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            dropdown.style.display = "none";
            currentIndex = -1;
        }
    });

    input.addEventListener("focus", () => {
        filteredOptions = [...options];
        currentIndex = filteredOptions.length > 0 ? 0 : -1;
        updateDropdown();
        dropdown.style.display = "block";
    });

    input.addEventListener("blur", () => {
        setTimeout(() => {
            if (input.value.trim() === "") {
                select.value = "";
                dropdown.style.display = "none";
                currentIndex = -1;
                return;
            }
            const lowerInput = input.value.toLowerCase();
            const matchingOption = options.find(o => o.textContent.toLowerCase().includes(lowerInput));
            if (matchingOption) {
                select.value = matchingOption.value;
                input.value = matchingOption.textContent;
                select.dispatchEvent(new Event("change"));
            } else {
                select.value = "";
                input.value = "";
            }
            dropdown.style.display = "none";
            currentIndex = -1;
        }, 150);
    });

    // Hide select, show input
    select.style.display = "none";
    input.style.display = "block";

    // Initial setup
    updateDropdown();
}

// Products

async function loadProducts() {
    const rows = await json(`${API}/products`);
    let table = document.getElementById("productsTable");
    if (!table) return;
    let tbody = table.querySelector("tbody");
    if (!tbody) {
        tbody = document.createElement("tbody");
        table.appendChild(tbody);
    }
    const lowStockThreshold = 100;
    tbody.innerHTML = (rows || [])
        .map((p) => {
            const stockQty = Number(p.stock_qty ?? 0);
            const stockClass =
                stockQty <= lowStockThreshold ? "low-stock" : "normal-stock";

            return `<tr>
        <td>${p.id}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.color || "")}</td>
        <td>${escapeHtml(p.unit || "")}</td>
        <td>${Number(p.cost_price ?? 0).toFixed(2)}</td>
        <td>${Number(p.default_sale_price ?? 0).toFixed(2)}</td>
        <td class="${stockClass}">${stockQty}</td>
        <td>
          <div class="row g-2">
            <div class="col-md-3 d-grid">
              <button class="btn btn-outline-primary" onclick="editProduct(${
                p.id
              })">Edit</button>
            </div>
            <div class="col-md-3 d-grid">
              <button class="btn btn-outline-danger" onclick="deleteProduct(${
                p.id
              })">Delete</button>
            </div>
          </div>
        </td>
      </tr>`;
        })
        .join("");
}

// editProduct: populate productForm for editing
async function editProduct(id) {
    try {
        const p = await json(`${API}/products/${id}`);
        const form = document.getElementById("productForm");
        if (!form) return alert("Product form not found.");
        // ensure hidden id field exists
        let idInput = form.querySelector("#editProductId");
        if (!idInput) {
            idInput = document.createElement("input");
            idInput.type = "hidden";
            idInput.id = "editProductId";
            idInput.name = "id";
            form.prepend(idInput);
        }
        idInput.value = p.id ?? "";

        // populate known fields (by name)
        const set = (name, value) => {
            const el = form.querySelector(`[name="${name}"]`);
            if (el) el.value = value ?? "";
        };
        set("name", p.name);
        set("color", p.color || "");
        set("unit", p.unit || "");
        set("cost_price", p.cost_price ?? "");
        set("default_sale_price", p.default_sale_price ?? "");
        set("stock_qty", p.stock_qty ?? "");

        // focus name for convenience
        const nameEl = form.querySelector('[name="name"]');
        if (nameEl) nameEl.focus();
    } catch (err) {
        alert(err.message || "Failed to load product for editing.");
    }
}

// deleteProduct: call API then refresh
async function deleteProduct(id) {
    if (!confirm("Are you sure you want to delete this product?")) return;
    try {
        await json(`${API}/products/${id}`, { method: "DELETE" });
        await refreshAll();
    } catch (err) {
        alert(err.message || "Failed to delete product.");
    }
}

// update productForm submit to support create (POST) and update (PUT)
const productForm = document.getElementById("productForm");
if (productForm) {
    // remove previously attached listener if any (best-effort)
    try {
        productForm.removeEventListener("submit", () => {});
    } catch {}
    productForm.addEventListener("submit", async(e) => {
        e.preventDefault();
        const fd = new FormData(productForm);
        const data = Object.fromEntries(fd);
        ["cost_price", "default_sale_price", "stock_qty"].forEach(
            (k) => (data[k] = parseFloat(data[k] || 0))
        );

        // detect edit mode by hidden id field
        const idInput = productForm.querySelector("#editProductId");
        try {
            if (idInput && idInput.value) {
                // update
                const id = idInput.value;
                await json(`${API}/products/${id}`, {
                    method: "PUT",
                    body: JSON.stringify(data),
                    headers: { "Content-Type": "application/json" },
                });
                // remove edit marker
                idInput.remove();
            } else {
                // create
                await json(`${API}/products`, {
                    method: "POST",
                    body: JSON.stringify(data),
                    headers: { "Content-Type": "application/json" },
                });
            }
            productForm.reset();
            await refreshAll();
        } catch (err) {
            alert(err.message || "Failed to save product.");
        }
    });
}

// Orders
let orderItems = [];
let currentOrderDateFilter = null;
let clients = [];
let products = [];

function renderOrderItems() {
    const tbody = document.querySelector("#orderItemsTable tbody");
    tbody.innerHTML = orderItems
        .map(
            (it, idx) =>
            `<tr data-idx="${idx}">
          <td>${escapeHtml(it.name || "")}</td>
          <td>${it.qty}</td>
          <td>${escapeHtml(it.unit || "")}</td>
          <td>${formatCurrency(it.cost_price || 0)}</td>
          <td>${formatCurrency(it.price || 0)}</td>
          <td class="text-end"><button type="button" class="btn btn-sm btn-outline-danger remove-item" data-idx="${idx}">Remove</button></td>
        </tr>`
        )
        .join("");

    // Update total
    const total = orderItems.reduce((sum, i) => sum + i.qty * (i.price || 0), 0);
    const totalCell = document.getElementById("orderTotal");
    if (totalCell) totalCell.textContent = formatCurrency(total);

    // keep hidden input in sync
    const itemsInput = document.getElementById("items");
    if (itemsInput)
        itemsInput.value = JSON.stringify(
            orderItems.map((i) => ({ productId: i.productId, qty: i.qty }))
        );
}

function escapeHtml(s = "") {
    return String(s).replace(
        /[&<>"']/g,
        (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
            c
        ])
    );
}

// add item button handler
const addItemBtn = document.getElementById("addItemBtn");
if (addItemBtn) {
    addItemBtn.addEventListener("click", () => {
        const prodInput = document.getElementById("orderProduct");
        const qtyEl = document.getElementById("orderQty");
        if (!prodInput || !qtyEl)
            return alert("Product selector or quantity missing.");
      const productId = parseInt(prodInput.value);
      if (!productId || !products) return alert("Select a valid product.");
      const product = products.find((p) => p.id === productId);
      
        if (!product) return alert("Product not found.");
        
        const name = product.name;
        const qty = Math.max(1, parseFloat(qtyEl.value || 1));
        const unit = product.unit || "";
        const cost_price = product.cost_price || 0;
        const price = product.default_sale_price || 0;
        const existing = orderItems.find((i) => i.productId === productId);
        if (existing) {
            existing.qty += qty;
        } else {
            orderItems.push({ productId, name, qty, unit, cost_price, price });
        }
        renderOrderItems();
        // clear inputs
        prodInput.value = "";
        qtyEl.value = 1;
    });
}

// remove item via delegation
const orderItemsTable = document.getElementById("orderItemsTable");
if (orderItemsTable) {
    orderItemsTable.addEventListener("click", (ev) => {
        if (!ev.target.matches(".remove-item")) return;
        const idx = Number(ev.target.dataset.idx);
        if (Number.isFinite(idx)) {
            orderItems.splice(idx, 1);
            renderOrderItems();
        }
    });
}

// Adjust order submit to prefer in-memory orderItems if present
// replace earlier orderForm submit handler (the one that parses items)
const orderForm = document.getElementById("orderForm");
if (!orderForm) {
    console.warn("orderForm not found in DOM.");
} else {
    // remove any previous listeners if needed, then attach new
    orderForm.addEventListener("submit", async(e) => {
        e.preventDefault();
        try {
          const fd = new FormData(orderForm);

          // clientId
          let clientId = fd.get("clientId");
          if (!clientId) {
            const sel = document.getElementById("orderClient");
             clientId = sel ? sel.value : null;
          }
          clientId = parseInt(clientId);
          if (!clientId || Number.isNaN(clientId)) {
            alert("Please select a client for the order.");
            return;
          }

          // deposit
          let deposit = fd.get("deposit");
          if (deposit == null) {
            const depEl = document.getElementById("deposit");
            deposit = depEl ? depEl.value : "0";
          }
          deposit = parseFloat(deposit || 0);

          // items: prefer in-memory orderItems, fallback to hidden input / FormData
          let items = [];
          if (orderItems && orderItems.length) {
            items = orderItems.map((it) => ({
              productId: it.productId,
              qty: it.qty,
            }));
          } else {
            const itemsRaw =
              fd.get("items") ||
              document.getElementById("items")?.value ||
              "[]";
            try {
              items = JSON.parse(itemsRaw);
            } catch {
              items = [];
            }
          }

          if (!Array.isArray(items) || items.length === 0) {
            alert("No items in the order. Add at least one product.");
            return;
          }

          // normalize
          items = items
            .map((it) => ({
              productId: parseInt(it.productId),
              qty: parseFloat(it.qty || 0),
            }))
            .filter((it) => it.productId && it.qty > 0);

          if (items.length === 0) {
            alert("No valid items found for the order.");
            return;
          }

          // paymentMethod
          let paymentMethod = fd.get("paymentMethod");
          if (!paymentMethod) {
            const pmEl = document.getElementById("paymentMethod");
            paymentMethod = pmEl ? pmEl.value : "Cash";
          }

          // discount
          let discount = fd.get("discount");
          if (discount == null) {
            const discEl = document.getElementById("discount");
            discount = discEl ? discEl.value : "0";
          }
          discount = parseFloat(discount || 0);

          // Check if editing
          const editOrderIdInput = document.getElementById("editOrderId");
          const isEdit = editOrderIdInput && editOrderIdInput.value;
          const method = isEdit ? "PUT" : "POST";
          const url = isEdit ? `${API}/orders/${editOrderIdInput.value}` : `${API}/orders`;

          await json(url, {
            method,
            body: JSON.stringify({
              clientId,
              deposit,
              items,
              paymentMethod,
              discount,
            }),
            headers: { "Content-Type": "application/json" },
          });

          // clear UI and internal items
          orderForm.reset();
          orderItems = [];
          renderOrderItems();
          // Remove edit marker if present
          if (editOrderIdInput) editOrderIdInput.remove();
          await refreshAll();
        } catch (err) {
            alert(err.message || "Failed to save order.");
        }
    });
}

// helper formatters
function formatCurrency(v) {
    if (v == null || Number.isNaN(Number(v))) return "0.00";
    return Number(v).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function formatDate(d) {
    if (!d) return "";
    const dt = new Date(d);
    if (isNaN(dt)) return String(d);
    return dt.toLocaleString();
}

// Orders list loader
async function loadOrders(dateFilter = currentOrderDateFilter) {
    try {
        const rows = await json(
                `${API}/orders${dateFilter ? `?date=${dateFilter}` : ""}`
    );
    const table = document.getElementById("ordersTable");
    if (!table) return;
    let tbody = table.querySelector("tbody");
    if (!tbody) {
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
    }

    let totalSubtotal = 0;
    let totalDiscount = 0;
    let totalPaid = 0;
    let totalBalance = 0;

    tbody.innerHTML = (rows || [])
      .map((r) => {
        const id = r.id ?? r.orderId ?? "";
        const clientName =
          r.clientName ?? r.client_name ?? r.client ?? "Unknown";
        const subtotal = Number(r.subtotal ?? r.total ?? 0);
        const discount = Number(r.discount ?? 0);
        const paid = Number(r.total_paid ?? r.paid ?? 0);
        const balance = paid - (subtotal - discount); // Calculate balance as negative if unpaid
        const date = r.created_at ?? r.date ?? "Unknown";

        // Accumulate totals
        totalSubtotal += subtotal;
        totalDiscount += discount;
        totalPaid += paid;
        totalBalance += balance;

        // Apply red color for negative balance (unpaid)
        const balanceClass = balance < 0 ? "text-danger" : "";

        return `<tr>
          <td>${id}</td>
          <td>${escapeHtml(clientName)}</td>
          <td>${formatCurrency(subtotal)}</td>
          <td>${formatCurrency(discount)}</td>
          <td>${formatCurrency(paid)}</td>
          <td class="${balanceClass}">${formatCurrency(balance)}</td>
          <td>${escapeHtml(r.payment_method || "Cash")}</td>
          <td>${formatDate(date)}</td>
          <td>
            <div class="row g-1">
              <div class="col-auto">
                <button class="btn btn-sm btn-outline-info" onclick="viewOrder(${id})">View</button>
              </div>
              <div class="col-auto">
                <button class="btn btn-sm btn-outline-warning" onclick="editOrder(${id})">Edit</button>
              </div>
              <div class="col-auto">
                <button class="btn btn-sm btn-outline-danger" onclick="refundOrder(${id})">Refund</button>
              </div>
            </div>
          </td>
        </tr>`;
      })
      .join("");

    // Update tfoot totals
    document.getElementById("totalSubtotal").textContent =
      formatCurrency(totalSubtotal);
    document.getElementById("totalDiscount").textContent =
      formatCurrency(totalDiscount);
    document.getElementById("totalPaid").textContent =
      formatCurrency(totalPaid);
    document.getElementById("totalBalance").textContent =
      formatCurrency(totalBalance);
  } catch (err) {
    console.error("Failed to load orders:", err);
    alert(err.message || "Failed to load orders");
  }
}

// Reports
async function loadOutstanding() {
  try {
    const rows = await json(`${API}/reports/outstanding`);
    const table = document.getElementById("outstandingTable");
    if (!table) return;
    let tbody = table.querySelector("tbody");
    if (!tbody) {
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
    }

    const calcPaid = (r) => {
      if (r == null) return 0;
      if (r.paid != null) return Number(r.paid) || 0;
      if (r.paid_amount != null) return Number(r.paid_amount) || 0;
      if (r.payments_total != null) return Number(r.payments_total) || 0;
      if (Array.isArray(r.payments) && r.payments.length) {
        return r.payments.reduce(
          (s, p) => s + Number(p.amount ?? p.paid ?? p.value ?? 0),
          0
        );
      }
      if (
        r.payments &&
        typeof r.payments === "object" &&
        r.payments.total != null
      )
        return Number(r.payments.total) || 0;
      return 0;
    };

    tbody.innerHTML = (rows || [])
      .map((r) => {
        const subtotal = Number(r.subtotal ?? 0);
        const paid = calcPaid(r);
        const balance = Number(r.balance ?? paid - subtotal);
        const balanceClass = balance < 0 ? "text-danger" : "";
        return `<tr>
            <td>${r.id ?? ""}</td>
            <td>${escapeHtml(r.client ?? r.clientName ?? "")}</td>
            <td>${subtotal.toFixed(2)}</td>
            <td>${paid.toFixed(2)}</td>
            <td class="${balanceClass}">${balance.toFixed(2)}</td>
            <td>${escapeHtml(r.created_at ?? r.date ?? "")}</td>
          </tr>`;
      })
      .join("");
  } catch (err) {
    console.error("Failed to load outstanding:", err);
  }
}

// Reports: client selector + per-client orders view
async function loadReportClients() {
  try {
    const sel = document.getElementById("reportClient");
    if (!sel) return;
    const rows = await json(`${API}/clients`);
    sel.innerHTML =
      `<option value="">All clients</option>` +
      (rows || [])
        .map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join("");
    sel.removeEventListener("change", onReportClientChange);
    sel.addEventListener("change", onReportClientChange);
  } catch (err) {
    console.warn("loadReportClients failed", err);
  }
}

async function onReportClientChange() {
  const sel = document.getElementById("reportClient");
  if (!sel) return;
  const cid = sel.value;
  if (!cid) {
    // show aggregated/outstanding view when no client selected
    await loadOutstanding();
    return;
  }
  await loadClientOrders(parseInt(cid, 10));
}

async function loadClientOrders(clientId) {
  try {
    const orders = await json(`${API}/orders`);
    const table = document.getElementById("outstandingTable");
    if (!table) return;
    let tbody = table.querySelector("tbody");
    if (!tbody) {
      tbody = document.createElement("tbody");
      table.appendChild(tbody);
    }

    const filtered = (orders || []).filter((o) => {
      let cid = null;
      if (o.client && typeof o.client === "object")
        cid = o.client.id ?? o.clientId ?? o.client_id;
      else cid = o.clientId ?? o.client_id ?? o.client;
      return String(cid) === String(clientId);
    });

    const calcPaid = (r) => {
      if (r == null) return 0;
      if (r.paid != null) return Number(r.paid) || 0;
      if (r.paid_amount != null) return Number(r.paid_amount) || 0;
      if (r.payments_total != null) return Number(r.payments_total) || 0;
      if (Array.isArray(r.payments) && r.payments.length) {
        return r.payments.reduce(
          (s, p) => s + Number(p.amount ?? p.paid ?? p.value ?? 0),
          0
        );
      }
      if (
        r.payments &&
        typeof r.payments === "object" &&
        r.payments.total != null
      )
        return Number(r.payments.total) || 0;
      return 0;
    };

    tbody.innerHTML = (filtered || [])
      .map((r) => {
        const id = r.id ?? r.orderId ?? "";
        // resolve client name
        let clientName = "";
        if (r.client) {
          if (typeof r.client === "string") clientName = r.client;
          else if (typeof r.client === "object")
            clientName = r.client.name ?? r.clientName ?? "";
        }
        clientName = clientName || r.clientName || "";

        const subtotal = Number(r.subtotal ?? r.total ?? 0);
        const paid = calcPaid(r);
        const balance = Number(r.balance ?? paid - subtotal);
        const balanceClass = balance < 0 ? "text-danger" : "";
        const date = r.created_at ?? r.date ?? r.createdAt ?? "";
        return `<tr>
          <td>${id}</td>
          <td>${escapeHtml(clientName)}</td>
          <td>${formatCurrency(subtotal)}</td>
          <td>${formatCurrency(paid)}</td>
          <td class="${balanceClass}">${formatCurrency(balance)}</td>
          <td>${formatDate(date)}</td>
        </tr>`;
      })
      .join("");
  } catch (err) {
    console.error("loadClientOrders failed", err);
  }
}

const loadProfitBtn = document.getElementById("loadProfit");
if (loadProfitBtn) {
  loadProfitBtn.addEventListener("click", async () => {
    const from = document.getElementById("from")?.value;
    const to = document.getElementById("to")?.value;
    const qs = new URLSearchParams({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }).toString();
    try {
      const data = await json(`${API}/reports/profit${qs ? "?" + qs : ""}`);
      const d = data.totals || { count: 0, revenue: 0, cost: 0, profit: 0 };
      const el = document.getElementById("profitTotals");
      if (el) {
        el.innerHTML = `<div class="alert alert-info">Orders: <b>${
          d.count
        }</b> — Revenue: <b>${(d.revenue || 0).toFixed(2)}</b> — Cost: <b>${(
          d.cost || 0
        ).toFixed(2)}</b> — Profit: <b>${(d.profit || 0).toFixed(2)}</b></div>`;
      }
    } catch (err) {
      console.warn("loadProfit failed", err);
      alert(err.message || "Failed to load profit");
    }
  });
} else {
  console.warn("loadProfit button not found in DOM.");
}

// Refund order
async function refundOrder(orderId) {
  if (!confirm("Are you sure you want to refund this order? This will restore inventory and delete the order.")) return;
  try {
    await json(`${API}/orders/${orderId}`, { method: "DELETE" });
    alert("Order refunded successfully.");
    await refreshAll();
  } catch (err) {
    alert(err.message || "Failed to refund order.");
  }
}

// Edit order in modal
async function editOrder(orderId) {
  try {
    const order = await json(`${API}/orders/${orderId}`);
    if (!order) {
      alert("Order not found.");
      return;
    }

    // Create modal if not exists
    let modal = document.getElementById("editOrderModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "editOrderModal";
      modal.className = "modal";
      modal.innerHTML = `
        <div class="modal-backdrop" data-dismiss="modal"></div>
        <div class="modal-content" role="dialog" aria-modal="true" style="max-width: 900px;">
          <header class="modal-header">
            <h3>Edit Order - #${orderId}</h3>
            <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close"></button>
          </header>
          <div id="editOrderContent" class="modal-body">
            <!-- Content will be populated here -->
          </div>
          <footer class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-dismiss="modal">Cancel</button>
            <button type="button" id="saveEditOrderBtn" class="btn btn-success">Save Changes</button>
          </footer>
        </div>
      `;
      document.body.appendChild(modal);

      // Attach dismiss handlers
      modal.querySelectorAll("[data-dismiss='modal']").forEach((el) => {
        el.addEventListener("click", () => {
          modal.classList.remove("show");
          modal.setAttribute("aria-hidden", "true");
        });
      });
      const backdrop = modal.querySelector(".modal-backdrop");
      if (backdrop) {
        backdrop.addEventListener("click", () => {
          modal.classList.remove("show");
          modal.setAttribute("aria-hidden", "true");
        });
      }
    }

    // Populate modal content
    const content = document.getElementById("editOrderContent");
    if (content) {
      renderOrderView(order, orderId, content, true);
    }

    // Attach save button handler
    const saveBtn = document.getElementById("saveEditOrderBtn");
    if (saveBtn) {
      saveBtn.onclick = () => saveOrderChanges(orderId, content, modal);
    }

    // Show modal
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  } catch (err) {
    alert(err.message || "Failed to load order for editing.");
  }
}

// View order details in modal
async function viewOrder(orderId) {
  try {
    const order = await json(`${API}/orders/${orderId}`);
    if (!order) {
      alert("Order not found.");
      return;
    }

    // Create modal if not exists
    let modal = document.getElementById("viewOrderModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "viewOrderModal";
      modal.className = "modal";
      modal.innerHTML = `
        <div class="modal-backdrop" data-dismiss="modal"></div>
        <div class="modal-content" role="dialog" aria-modal="true" style="max-width: 800px;">
          <header class="modal-header">
            <h3>Order Details - #${orderId}</h3>
            <button type="button" class="btn-close" data-dismiss="modal" aria-label="Close"></button>
          </header>
          <div id="orderDetailsContent" class="modal-body">
            <!-- Content will be populated here -->
          </div>
          <footer class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-dismiss="modal">Close</button>
          </footer>
        </div>
      `;
      document.body.appendChild(modal);

      // Attach dismiss handlers
      modal.querySelectorAll("[data-dismiss='modal']").forEach((el) => {
        el.addEventListener("click", () => {
          modal.classList.remove("show");
          modal.setAttribute("aria-hidden", "true");
        });
      });
      const backdrop = modal.querySelector(".modal-backdrop");
      if (backdrop) {
        backdrop.addEventListener("click", () => {
          modal.classList.remove("show");
          modal.setAttribute("aria-hidden", "true");
        });
      }
    }

    // Populate modal content
    const content = document.getElementById("orderDetailsContent");
    if (content) {
      // Resolve client name
      let clientName = "";
      if (order.client) {
        if (typeof order.client === "string") clientName = order.client;
        else if (typeof order.client === "object")
          clientName = order.client.name ?? order.client.clientName ?? "";
      }
      clientName =
        clientName || order.clientName || order.client_name || "Unknown";

      const subtotal = Number(order.subtotal ?? order.total ?? 0);
      const calcPaid = (r) => {
        if (r == null) return 0;
        if (r.paid != null) return Number(r.paid) || 0;
        if (r.paid_amount != null) return Number(r.paid_amount) || 0;
        if (r.payments_total != null) return Number(r.payments_total) || 0;
        if (Array.isArray(r.payments) && r.payments.length) {
          return r.payments.reduce(
            (s, p) => s + Number(p.amount ?? p.paid ?? p.value ?? 0),
            0
          );
        }
        if (
          r.payments &&
          typeof r.payments === "object" &&
          r.payments.total != null
        )
          return Number(r.payments.total) || 0;
        return 0;
      };
      const paid = calcPaid(order);
      const discount = Number(order.discount || 0);
      const orderTotal = subtotal - discount;
      const balance = paid - orderTotal;
      const date = order.created_at ?? order.date ?? order.createdAt ?? "";

      content.innerHTML = `
        <div class="row mb-3">
          <div class="col-md-6">
            <strong>Client:</strong> ${escapeHtml(clientName)}
          </div>
          <div class="col-md-6">
            <strong>Date:</strong> ${formatDate(date)}
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-md-3">
            <strong>Subtotal:</strong> ${formatCurrency(subtotal)}
          </div>
          <div class="col-md-3">
            <strong>Discount:</strong> ${formatCurrency(discount)}
          </div>
          <div class="col-md-3">
            <strong>Paid:</strong> ${formatCurrency(paid)}
          </div>
          <div class="col-md-3">
            <strong>Balance:</strong> <span class="${
              balance < 0 ? "text-danger" : ""
            }">${formatCurrency(balance)}</span>
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-md-6">
            <strong>Payment Method:</strong> ${escapeHtml(
              order.payment_method || "Cash"
            )}
          </div>
          <div class="col-md-6">
            <strong>Order Total:</strong> ${formatCurrency(orderTotal)}
          </div>
        </div>
        <h5>Order Items</h5>
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Product</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Cost</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              Array.isArray(order.items)
                ? order.items
                    .map(
                      (item) => `
              <tr>
                <td>${escapeHtml(item.product_name || item.name || "")}</td>
                <td>${item.qty || 0}</td>
                <td>${escapeHtml(item.unit || "")}</td>
                <td>${formatCurrency(
                  item.unit_cost_snapshot || item.cost_price || 0
                )}</td>
                <td>${formatCurrency(item.unit_price || 0)}</td>
                <td>${formatCurrency(
                  (item.qty || 0) * (item.unit_price || 0)
                )}</td>
              </tr>
            `
                    )
                    .join("")
                : ""
            }
          </tbody>
        </table>
        ${
          Array.isArray(order.payments) && order.payments.length
            ? `
          <h5>Payments</h5>
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
              </tr>
            </thead>
            <tbody>
              ${order.payments
                .map(
                  (payment) => `
                <tr>
                  <td>${formatDate(
                    payment.date ?? payment.created_at ?? payment.paid_at ?? ""
                  )}</td>
                  <td>${formatCurrency(
                    payment.amount ?? payment.paid ?? 0
                  )}</td>
                  <td>${escapeHtml(order.payment_method || "Cash")}</td>
                </tr>
              `
                )
                .join("")}
          </tbody>
        </table>
      `
            : ""
        }
      `;
    }

    // Show modal
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  } catch (err) {
    alert(err.message || "Failed to load order details.");
  }
}

// Render order view (view or edit mode)
function renderOrderView(order, orderId, content, isEditMode) {
  // Resolve client name and ID
  let clientName = "";
  let clientId = null;
  if (order.client) {
    if (typeof order.client === "string") clientName = order.client;
    else if (typeof order.client === "object") {
      clientName = order.client.name ?? order.client.clientName ?? "";
      clientId = order.client.id ?? order.clientId ?? order.client_id;
    }
  }
  clientName = clientName || order.clientName || order.client_name || "Unknown";
  clientId = clientId ?? order.clientId ?? order.client_id;

  const subtotal = Number(order.subtotal ?? order.total ?? 0);
  const calcPaid = (r) => {
    if (r == null) return 0;
    if (r.paid != null) return Number(r.paid) || 0;
    if (r.paid_amount != null) return Number(r.paid_amount) || 0;
    if (r.payments_total != null) return Number(r.payments_total) || 0;
    if (Array.isArray(r.payments) && r.payments.length) {
      return r.payments.reduce(
        (s, p) => s + Number(p.amount ?? p.paid ?? p.value ?? 0),
        0
      );
    }
    if (
      r.payments &&
      typeof r.payments === "object" &&
      r.payments.total != null
    )
      return Number(r.payments.total) || 0;
    return 0;
  };
  const paid = calcPaid(order);
  const discount = Number(order.discount || 0);
  const orderTotal = subtotal - discount;
  const balance = paid - orderTotal;
  const date = order.created_at ?? order.date ?? order.createdAt ?? "";

  if (isEditMode) {
    // Edit mode content
    content.innerHTML = `
      <form id="editOrderForm">
        <div class="row mb-3">
          <div class="col-md-6">
            <label for="editClientSelect" class="form-label"><strong>Client:</strong> ${escapeHtml(clientName)}</label>
            <select id="editClientSelect" class="form-control" required>
              <option value="">Select a client</option>
            </select>
          </div>
          <div class="col-md-6">
            <strong>Date:</strong> ${formatDate(date)}
          </div>
        </div>
        <div class="row mb-3">
          <div class="col-md-3">
            <label for="editDeposit" class="form-label"><strong>Deposit:</strong></label>
            <input type="number" id="editDeposit" class="form-control" step="0.01" value="${order.deposit ?? paid ?? 0}">
          </div>
          <div class="col-md-3">
            <label for="editDiscount" class="form-label"><strong>Discount:</strong></label>
            <input type="number" id="editDiscount" class="form-control" step="0.01" value="${discount}">
          </div>
          <div class="col-md-3">
            <label for="editPaymentMethod" class="form-label"><strong>Payment Method:</strong></label>
            <select id="editPaymentMethod" class="form-control">
              <option value="Cash" ${order.payment_method === "Cash" ? "selected" : ""}>Cash</option>
              <option value="Installment" ${order.payment_method === "Installment" ? "selected" : ""}>Installment</option>
            </select>
          </div>
          <div class="col-md-3">
            <strong>Subtotal:</strong> <span id="editSubtotal">${formatCurrency(subtotal)}</span><br>
            <strong>Order Total:</strong> <span id="editOrderTotal">${formatCurrency(orderTotal)}</span><br>
            <strong>Balance:</strong> <span id="editBalance" class="${balance < 0 ? "text-danger" : ""}">${formatCurrency(balance)}</span>
          </div>
        </div>
        <h5>Order Items</h5>
        <div id="editOrderItems">
          <!-- Items will be populated here -->
        </div>
        <div class="mb-3">
          <button type="button" id="addItemToOrder" class="btn btn-outline-primary btn-sm">Add Item</button>
        </div>
      </form>
    `;

    // Populate client select
    const clientSelect = document.getElementById("editClientSelect");
    if (clientSelect) {
      clientSelect.innerHTML = `<option value="">Select a client</option>` +
        clients.map((c) => `<option value="${c.id}" ${c.id == clientId ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
      makeSearchable(clientSelect);
    }

    // Populate items
    const itemsContainer = document.getElementById("editOrderItems");
    if (itemsContainer && Array.isArray(order.items)) {
      itemsContainer.innerHTML = order.items.map((item, index) => `
        <div class="row mb-2 align-items-center" data-item-index="${index}">
          <div class="col-md-4">
            <select class="form-control edit-item-product" required>
              <option value="">Select product</option>
              ${products.map(p => `<option value="${p.id}" ${p.id == item.product_id ? "selected" : ""}>${escapeHtml(p.name)} (${escapeHtml(p.unit || "")})</option>`).join("")}
            </select>
          </div>
          <div class="col-md-2">
            <input type="number" class="form-control edit-item-qty" min="1" step="0.01" value="${item.qty ?? item.quantity ?? 0}" required>
          </div>
          <div class="col-md-2">
            <span class="form-text edit-item-unit">${escapeHtml(item.unit || "")}</span>
          </div>
          <div class="col-md-2">
            <span class="form-text edit-item-price">${formatCurrency(item.unit_price ?? item.price ?? 0)}</span>
          </div>
          <div class="col-md-2">
            <button type="button" class="btn btn-outline-danger btn-sm remove-edit-item">Remove</button>
          </div>
        </div>
      `).join("");

      // Make product selects searchable
      itemsContainer.querySelectorAll(".edit-item-product").forEach(select => makeSearchable(select));
    }

    // Add item button
    const addItemBtn = document.getElementById("addItemToOrder");
    if (addItemBtn) {
      addItemBtn.onclick = () => addEditItem(itemsContainer);
    }

    // Remove item handlers
    itemsContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-edit-item")) {
        e.target.closest(".row").remove();
        updateEditTotals();
      }
    });

    // Add event listeners for real-time updates
    const depositInput = document.getElementById("editDeposit");
    const discountInput = document.getElementById("editDiscount");

    if (depositInput) {
      depositInput.addEventListener("input", updateEditTotals);
    }
    if (discountInput) {
      discountInput.addEventListener("input", updateEditTotals);
    }

    // Event listeners for item changes
    itemsContainer.addEventListener("change", (e) => {
      if (e.target.classList.contains("edit-item-product")) {
        const row = e.target.closest(".row");
        const productId = parseInt(e.target.value);
        const product = products.find(p => p.id === productId);
        if (product) {
          row.querySelector(".edit-item-unit").textContent = escapeHtml(product.unit || "");
          row.querySelector(".edit-item-price").textContent = formatCurrency(product.default_sale_price || 0);
        }
        updateEditTotals();
      } else if (e.target.classList.contains("edit-item-qty")) {
        updateEditTotals();
      }
    });

    itemsContainer.addEventListener("input", (e) => {
      if (e.target.classList.contains("edit-item-qty")) {
        updateEditTotals();
      }
    });

  } else {
    // View mode content
    content.innerHTML = `
      <div class="row mb-3">
        <div class="col-md-6">
          <strong>Client:</strong> ${escapeHtml(clientName)}
        </div>
        <div class="col-md-6">
          <strong>Date:</strong> ${formatDate(date)}
        </div>
      </div>
      <div class="row mb-3">
        <div class="col-md-3">
          <strong>Deposit:</strong> ${formatCurrency(paid)}
        </div>
        <div class="col-md-3">
          <strong>Discount:</strong> ${formatCurrency(discount)}
        </div>
        <div class="col-md-3">
          <strong>Subtotal:</strong> ${formatCurrency(subtotal)}
        </div>
        <div class="col-md-3">
          <strong>Balance:</strong> <span class="${
            balance < 0 ? "text-danger" : ""
          }">${formatCurrency(balance)}</span>
        </div>
      </div>
      <div class="row mb-3">
        <div class="col-md-6">
          <strong>Payment Method:</strong> ${escapeHtml(
            order.payment_method || "Cash"
          )}
        </div>
        <div class="col-md-6">
          <strong>Order Total:</strong> ${formatCurrency(orderTotal)}
        </div>
      </div>
      <h5>Order Items</h5>
      <table class="table table-sm">
        <thead>
          <tr>
            <th>Product</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Cost</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${
            Array.isArray(order.items)
              ? order.items
                  .map(
                    (item) => `
            <tr>
              <td>${escapeHtml(item.product_name || item.name || "")}</td>
              <td>${item.qty || 0}</td>
              <td>${escapeHtml(item.unit || "")}</td>
              <td>${formatCurrency(
                item.unit_cost_snapshot || item.cost_price || 0
              )}</td>
              <td>${formatCurrency(item.unit_price || 0)}</td>
              <td>${formatCurrency(
                (item.qty || 0) * (item.unit_price || 0)
              )}</td>
            </tr>
          `
                  )
                  .join("")
              : ""
          }
        </tbody>
      </table>
      ${
        Array.isArray(order.payments) && order.payments.length
          ? `
        <h5>Payments</h5>
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Method</th>
            </tr>
          </thead>
          <tbody>
            ${order.payments
              .map(
                (payment) => `
              <tr>
                <td>${formatDate(
                  payment.date ?? payment.created_at ?? payment.paid_at ?? ""
                )}</td>
                <td>${formatCurrency(
                  payment.amount ?? payment.paid ?? 0
                )}</td>
                <td>${escapeHtml(order.payment_method || "Cash")}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `
          : ""
      }
    `;
  }
}

// Update totals in edit form
function updateEditTotals() {
  const itemsContainer = document.getElementById("editOrderItems");
  if (!itemsContainer) return;

  let subtotal = 0;
  const itemRows = itemsContainer.querySelectorAll(".row");
  itemRows.forEach(row => {
    const qtyInput = row.querySelector(".edit-item-qty");
    const priceSpan = row.querySelector(".edit-item-price");
    if (qtyInput && priceSpan) {
      const qty = parseFloat(qtyInput.value) || 0;
      const price = parseFloat(priceSpan.textContent.replace(/[^0-9.-]/g, "")) || 0;
      subtotal += qty * price;
    }
  });

  const discount = parseFloat(document.getElementById("editDiscount").value) || 0;
  const deposit = parseFloat(document.getElementById("editDeposit").value) || 0;
  const orderTotal = subtotal - discount;
  const balance = deposit - orderTotal;

  document.getElementById("editSubtotal").textContent = formatCurrency(subtotal);
  document.getElementById("editOrderTotal").textContent = formatCurrency(orderTotal);
  const balanceEl = document.getElementById("editBalance");
  balanceEl.textContent = formatCurrency(balance);
  balanceEl.className = balance < 0 ? "text-danger" : "";
}

// Add new item to edit form
function addEditItem(container) {
  const newItem = document.createElement("div");
  newItem.className = "row mb-2 align-items-center";
  newItem.innerHTML = `
    <div class="col-md-4">
      <select class="form-control edit-item-product" required>
        <option value="">Select product</option>
        ${products.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}
      </select>
    </div>
    <div class="col-md-2">
      <input type="number" class="form-control edit-item-qty" min="1" step="0.01" value="1" required>
    </div>
    <div class="col-md-2">
      <span class="form-text">Unit</span>
    </div>
    <div class="col-md-2">
      <span class="form-text">Price</span>
    </div>
    <div class="col-md-2">
      <button type="button" class="btn btn-outline-danger btn-sm remove-edit-item">Remove</button>
    </div>
  `;
  container.appendChild(newItem);
  makeSearchable(newItem.querySelector(".edit-item-product"));
}

// Save order changes
async function saveOrderChanges(orderId, content) {
  try {
    const form = document.getElementById("editOrderForm");
    if (!form) return;

    const clientId = document.getElementById("editClientSelect").value;
    const deposit = parseFloat(document.getElementById("editDeposit").value || 0);
    const discount = parseFloat(document.getElementById("editDiscount").value || 0);
    const paymentMethod = document.getElementById("editPaymentMethod").value;

    // Collect items
    const items = [];
    const itemRows = content.querySelectorAll("#editOrderItems .row");
    for (const row of itemRows) {
      const productSelect = row.querySelector(".edit-item-product");
      const qtyInput = row.querySelector(".edit-item-qty");
      if (productSelect && qtyInput) {
        const productId = parseInt(productSelect.value);
        const qty = parseFloat(qtyInput.value);
        if (productId && qty > 0) {
          items.push({ productId, qty });
        }
      }
    }

    if (!clientId || !items.length) {
      alert("Please select a client and add at least one item.");
      return;
    }

    await json(`${API}/orders/${orderId}`, {
      method: "PUT",
      body: JSON.stringify({
        clientId: parseInt(clientId),
        deposit,
        items,
        paymentMethod,
        discount,
      }),
      headers: { "Content-Type": "application/json" },
    });

    alert("Order updated successfully!");
    // Refresh and close modal
    await refreshAll();
    const modal = document.getElementById("viewOrderModal");
    if (modal) {
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
    }
  } catch (err) {
    alert(err.message || "Failed to update order.");
  }
}

// Date filtering for orders
const prevDayBtn = document.getElementById("prevDay");
const nextDayBtn = document.getElementById("nextDay");
const clearDateFilterBtn = document.getElementById("clearDateFilter");
const orderDateFilterInput = document.getElementById("orderDateFilter");

if (prevDayBtn) {
  prevDayBtn.addEventListener("click", () => {
    let current;
    if (currentOrderDateFilter) {
      const [y, m, d] = currentOrderDateFilter.split("-").map(Number);
      current = new Date(y, m - 1, d);
    } else {
      current = new Date();
    }
    current.setDate(current.getDate() - 1);
    currentOrderDateFilter = `${current.getFullYear()}-${String(
      current.getMonth() + 1
    ).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
    orderDateFilterInput.value = currentOrderDateFilter;
    loadOrders(currentOrderDateFilter);
  });
}

if (nextDayBtn) {
  nextDayBtn.addEventListener("click", () => {
    let current;
    if (currentOrderDateFilter) {
      const [y, m, d] = currentOrderDateFilter.split("-").map(Number);
      current = new Date(y, m - 1, d);
    } else {
      current = new Date();
    }
    current.setDate(current.getDate() + 1);
    currentOrderDateFilter = `${current.getFullYear()}-${String(
      current.getMonth() + 1
    ).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
    orderDateFilterInput.value = currentOrderDateFilter;
    loadOrders(currentOrderDateFilter);
  });
}

if (clearDateFilterBtn) {
  clearDateFilterBtn.addEventListener("click", () => {
    currentOrderDateFilter = null;
    orderDateFilterInput.value = "";
    loadOrders();
  });
}

if (orderDateFilterInput) {
  orderDateFilterInput.addEventListener("change", () => {
    currentOrderDateFilter = orderDateFilterInput.value || null;
    loadOrders(currentOrderDateFilter);
  });
}

// Payment method change handler
const paymentMethodSel = document.getElementById("paymentMethod");
if (paymentMethodSel) {
  paymentMethodSel.addEventListener("change", () => {
    const method = paymentMethodSel.value;
    const depositEl = document.getElementById("deposit");
    const depositLabel = document.getElementById("depositLabel");
    if (method === "Cash") {
      depositLabel.textContent = "Cash Received";
      const total =
        parseFloat(
          document
            .getElementById("orderTotal")
            .textContent.replace(/[^0-9.-]/g, "")
        ) || 0;
      depositEl.value = total.toFixed(2);
    } else if (method === "Installment") {
      depositLabel.textContent = "Down Payment";
      depositEl.value = "0";
    }
  });
}

// Init - run after DOM ready so element lookups succeed
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await refreshAll();
  } catch (e) {
    console.warn("refreshAll failed on DOMContentLoaded", e);
  }
  try {
    await loadReportClients();
  } catch (e) {
    console.warn("loadReportClients failed on DOMContentLoaded", e);
  }
});