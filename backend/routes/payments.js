import { Router as Router4 } from "express";
import { db as db4 } from "../db.js";
const rpay = Router4();

rpay.post("/", (req, res) => {
  const { orderId, amount, note, paidAt } = req.body;
  if (!orderId || !amount)
    return res.status(400).json({ error: "orderId and amount required" });
  const exists = db4.prepare("SELECT id FROM orders WHERE id = ?").get(orderId);
  if (!exists) return res.status(400).json({ error: "Order not found" });

  const stmt = db4.prepare(
    'INSERT INTO payments(order_id, amount, note, paid_at) VALUES (?, ?, ?, COALESCE(?, datetime("now")))'
  );
  stmt.run(orderId, Number(amount), note ?? null, paidAt ?? null);

  // recalc totals
  const paid = db4
    .prepare(
      "SELECT IFNULL(SUM(amount),0) AS paid FROM payments WHERE order_id = ?"
    )
    .get(orderId).paid;
  const totals = db4
    .prepare(
      "SELECT IFNULL(SUM(qty*unit_price),0) AS subtotal, IFNULL(SUM(qty*unit_cost_snapshot),0) AS estimated_cost FROM order_items WHERE order_id = ?"
    )
    .get(orderId);
  db4
    .prepare(
      "UPDATE orders SET subtotal=?, estimated_cost=?, total_paid=? WHERE id=?"
    )
    .run(totals.subtotal, totals.estimated_cost, paid, orderId);

  const order = db4.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  res.json(order);
});

export default rpay;
