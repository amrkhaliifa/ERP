import { Router as Router5 } from "express";
import { db as db5 } from "../db.js";
const rr = Router5();

rr.get("/outstanding", (req, res) => {
  const rows = db5
    .prepare(
      `SELECT o.id, c.name AS client, o.subtotal, o.discount,
(o.deposit_paid + IFNULL((SELECT SUM(amount) FROM payments WHERE order_id=o.id),0)) AS paid,
((o.subtotal - o.discount) - (o.deposit_paid + IFNULL((SELECT SUM(amount) FROM payments WHERE order_id=o.id),0))) AS balance,
o.created_at
FROM orders o JOIN clients c ON c.id=o.client_id
WHERE ((o.subtotal - o.discount) - (o.deposit_paid + IFNULL((SELECT SUM(amount) FROM payments WHERE order_id=o.id),0))) > 0
ORDER BY o.created_at DESC`
    )
    .all();
  res.json(rows);
});

rr.get("/profit", (req, res) => {
  const { from, to } = req.query; // ISO date strings
  let where = "";
  const params = [];
  if (from) {
    where += (where ? " AND" : " WHERE") + " o.created_at >= ?";
    params.push(from);
  }
  if (to) {
    where += (where ? " AND" : " WHERE") + " o.created_at <= ?";
    params.push(to);
  }

  const orders = db5
    .prepare(
      `SELECT o.id, o.created_at, o.subtotal, o.estimated_cost, (o.subtotal - o.estimated_cost) AS profit
FROM orders o${where} ORDER BY o.created_at DESC`
    )
    .all(...params);

  const totals = orders.reduce(
    (a, x) => ({
      count: a.count + 1,
      revenue: a.revenue + x.subtotal,
      cost: a.cost + x.estimated_cost,
      profit: a.profit + x.profit,
    }),
    { count: 0, revenue: 0, cost: 0, profit: 0 }
  );

  res.json({ totals, orders });
});

export default rr;
