import { Router as Router5 } from "express";
import { db as db5 } from "../db.js";
const rr = Router5();

rr.get("/outstanding", (req, res) => {
  const rows = db5
    .prepare(
      `SELECT o.id, c.name AS client, o.subtotal, o.discount,
(o.deposit_paid + IFNULL((SELECT SUM(amount) FROM payments WHERE order_id=o.id),0)) AS paid,
((o.subtotal - o.discount) - (o.deposit_paid + IFNULL((SELECT SUM(amount) FROM payments WHERE order_id=o.id),0))) AS balance,
o.payment_method, o.created_at
FROM orders o JOIN clients c ON c.id=o.client_id
ORDER BY o.created_at DESC`
    )
    .all();
  res.json(rows);
});

rr.get("/profit", (req, res) => {
  const { from, to, clientId } = req.query; // ISO date strings and clientId
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
  if (clientId) {
    where += (where ? " AND" : " WHERE") + " o.client_id = ?";
    params.push(parseInt(clientId));
  }

  const orders = db5
    .prepare(
      `SELECT o.id, o.created_at, o.subtotal, o.estimated_cost, (o.subtotal - o.estimated_cost) AS profit, o.payment_method
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

  // Payment method breakdown
  const paymentBreakdown = {};
  orders.forEach((order) => {
    const method = order.payment_method || "Unknown";
    if (!paymentBreakdown[method]) {
      paymentBreakdown[method] = { count: 0, revenue: 0, cost: 0, profit: 0 };
    }
    paymentBreakdown[method].count += 1;
    paymentBreakdown[method].revenue += order.subtotal;
    paymentBreakdown[method].cost += order.estimated_cost;
    paymentBreakdown[method].profit += order.profit;
  });

  res.json({ totals, orders, paymentBreakdown });
});

rr.get("/payment-methods", (req, res) => {
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

  const rows = db5
    .prepare(
      `SELECT o.payment_method, COUNT(o.id) AS order_count, SUM(o.subtotal) AS total_revenue, SUM(o.estimated_cost) AS total_cost, SUM(o.subtotal - o.estimated_cost) AS total_profit
FROM orders o${where} GROUP BY o.payment_method ORDER BY o.payment_method`
    )
    .all(...params);

  res.json(rows);
});

rr.get("/orders", (req, res) => {
  const { client_name } = req.query;
  if (!client_name) {
    return res
      .status(400)
      .json({ error: "client_name query parameter required" });
  }
  const rows = db5
    .prepare(
      `SELECT o.*, c.name AS client_name FROM orders o JOIN clients c ON o.client_id = c.id WHERE c.name LIKE ? ORDER BY o.created_at DESC`
    )
    .all(`%${client_name}%`);
  res.json(rows);
});

export default rr;
