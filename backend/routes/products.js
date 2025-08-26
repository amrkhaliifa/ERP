import { Router as Router2 } from "express";
import { db as db2 } from "../db.js";
const rp = Router2();

rp.get("/", (req, res) => {
  const rows = db2.prepare("SELECT * FROM products ORDER BY id DESC").all();
  res.json(rows);
});

rp.get("/:id", (req, res) => {
  const row = db2
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

rp.post("/", (req, res) => {
  const {
    name,
    color,
    unit,
    cost_price = 0,
    default_sale_price = 0,
    stock_qty = 0,
  } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const result = db2
    .prepare(
      "INSERT INTO products(name, color, unit, cost_price, default_sale_price, stock_qty) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      name,
      color ?? null,
      unit ?? null,
      cost_price,
      default_sale_price,
      stock_qty
    );
  const saved = db2
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(result.lastInsertRowid);
  res.status(201).json(saved);
});

rp.put("/:id", (req, res) => {
  const { name, color, unit, cost_price, default_sale_price, stock_qty } =
    req.body;
  const exists = db2
    .prepare("SELECT id FROM products WHERE id = ?")
    .get(req.params.id);
  if (!exists) return res.status(404).json({ error: "Not found" });
  db2
    .prepare(
      "UPDATE products SET name=?, color=?, unit=?, cost_price=?, default_sale_price=?, stock_qty=? WHERE id=?"
    )
    .run(
      name,
      color ?? null,
      unit ?? null,
      cost_price,
      default_sale_price,
      stock_qty,
      req.params.id
    );
  const saved = db2
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(req.params.id);
  res.json(saved);
});

rp.delete("/:id", (req, res) => {
  const info = db2
    .prepare("DELETE FROM products WHERE id = ?")
    .run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// Stock adjust (+/-)
rp.post("/adjust", (req, res) => {
  const { productId, delta = 0 } = req.body;
  const p = db2.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!p) return res.status(404).json({ error: "Product not found" });
  const newQty = (p.stock_qty ?? 0) + Number(delta);
  db2
    .prepare("UPDATE products SET stock_qty = ? WHERE id = ?")
    .run(newQty, productId);
  res.json({ id: p.id, name: p.name, stock_qty: newQty });
});

export default rp;
