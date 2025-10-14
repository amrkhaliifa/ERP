import { Router as Router3 } from "express";
import { db as db3 } from "../db.js";
const ro = Router3();

function recalcTotals(orderId) {
  const totals = db3
    .prepare(
      `SELECT IFNULL(SUM(oi.qty * oi.unit_price), 0) AS subtotal, IFNULL(SUM(oi.qty * oi.unit_cost_snapshot), 0) AS estimated_cost FROM order_items oi WHERE oi.order_id = ?`
    )
    .get(orderId);
  const paid = db3
    .prepare(
      "SELECT IFNULL(SUM(amount),0) AS paid FROM payments WHERE order_id = ?"
    )
    .get(orderId).paid;
  db3
    .prepare(
      "UPDATE orders SET subtotal = ?, estimated_cost = ?, total_paid = ? WHERE id = ?"
    )
    .run(totals.subtotal, totals.estimated_cost, paid, orderId);
}

ro.get("/", (req, res) => {
  const { date, limit = 50, offset = 0 } = req.query;
  let query = `SELECT o.*, c.name as client_name FROM orders o JOIN clients c ON c.id = o.client_id`;
  const params = [];
  if (date) {
    query += ` WHERE DATE(o.created_at) = ?`;
    params.push(date);
  } else {
    // Default to last 30 days if no date filter
    query += ` WHERE o.created_at >= date('now', '-30 days')`;
  }
  query += ` ORDER BY o.id DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));
  const rows = db3.prepare(query).all(...params);

  // Add items to each order for the list view
  const ordersWithItems = rows.map(order => {
    const items = db3
      .prepare(
        `SELECT oi.*, p.name AS product_name, p.color, p.unit FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
      )
      .all(order.id);
    return { ...order, items };
  });

  res.json(ordersWithItems);
});

ro.get("/:id", (req, res) => {
  const o = db3
    .prepare(
      `SELECT o.*, c.name as client_name, c.phone, c.address FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = ?`
    )
    .get(req.params.id);
  if (!o) return res.status(404).json({ error: "Not found" });
  const items = db3
    .prepare(
      `SELECT oi.*, p.name AS product_name, p.color, p.unit FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
    )
    .all(o.id);
  const payments = db3
    .prepare(
      "SELECT * FROM payments WHERE order_id = ? ORDER BY paid_at ASC, id ASC"
    )
    .all(o.id);
  res.json({ ...o, items, payments, balance: (o.subtotal - o.discount) - o.total_paid });
});

ro.post("/", (req, res) => {
  const { clientId, items = [], deposit = 0, paymentMethod, discount = 0 } = req.body;
  if (!clientId) return res.status(400).json({ error: "clientId required" });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: "items required" });
  if (!paymentMethod) return res.status(400).json({ error: "paymentMethod required" });

  const client = db3
    .prepare("SELECT id FROM clients WHERE id = ?")
    .get(clientId);
  if (!client) return res.status(400).json({ error: "Client not found" });

  const trx = db3.transaction(() => {
    const insOrder = db3.prepare(
      "INSERT INTO orders(client_id, deposit_paid, total_paid, discount, payment_method) VALUES (?, ?, 0, ?, ?)"
    );
    const orderId = insOrder.run(
      clientId,
      Number(deposit || 0),
      Number(discount || 0),
      paymentMethod
    ).lastInsertRowid;

    const insItem = db3.prepare(
      "INSERT INTO order_items(order_id, product_id, qty, unit_price, unit_cost_snapshot) VALUES (?, ?, ?, ?, ?)"
    );
    const updStock = db3.prepare(
      "UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?"
    );

    for (const it of items) {
      const product = db3
        .prepare("SELECT * FROM products WHERE id = ?")
        .get(it.productId);
      if (!product) throw new Error(`Product ${it.productId} not found`);
      if (product.stock_qty < it.qty)
        throw new Error(
          `Not enough stock for ${product.name}. In stock: ${product.stock_qty}`
        );
      const unitPrice = it.unitPrice ?? product.default_sale_price;
      insItem.run(
        orderId,
        product.id,
        Number(it.qty),
        Number(unitPrice),
        Number(product.cost_price)
      );
      updStock.run(Number(it.qty), product.id);
    }

    // Deposit as a payment record (if any)
    if (Number(deposit) > 0) {
      db3
        .prepare(
          "INSERT INTO payments(order_id, amount, note) VALUES (?, ?, ?)"
        )
        .run(orderId, Number(deposit), "Deposit");
    }

    recalcTotals(orderId);
    return orderId;
  });

  try {
    const orderId = trx();
    const saved = db3.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    res.status(201).json(saved);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

ro.delete("/:id", (req, res) => {
  const orderId = req.params.id;
  const order = db3.prepare("SELECT id FROM orders WHERE id = ?").get(orderId);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const trx = db3.transaction(() => {
    // Get order items to restore stock
    const items = db3
      .prepare("SELECT product_id, qty FROM order_items WHERE order_id = ?")
      .all(orderId);

    // Restore stock for each product
    const updStock = db3.prepare(
      "UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?"
    );
    for (const it of items) {
      updStock.run(Number(it.qty), it.product_id);
    }

    // Delete payments
    db3.prepare("DELETE FROM payments WHERE order_id = ?").run(orderId);

    // Delete order items
    db3.prepare("DELETE FROM order_items WHERE order_id = ?").run(orderId);

    // Delete order
    db3.prepare("DELETE FROM orders WHERE id = ?").run(orderId);
  });

  try {
    trx();
    res.json({ message: "Order refunded successfully" });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

export default ro;
