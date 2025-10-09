import { Router } from "express";
import { db } from "../db.js";
const r = Router();

r.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM clients ORDER BY id DESC").all();
  res.json(rows);
});

r.get("/:id", (req, res) => {
  const row = db
    .prepare("SELECT * FROM clients WHERE id = ?")
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

r.post("/", (req, res) => {
  const { name, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const stmt = db.prepare(
    "INSERT INTO clients(name, phone, address) VALUES (?, ?, ?)"
  );
  const result = stmt.run(name, phone ?? null, address ?? null);
  const saved = db
    .prepare("SELECT * FROM clients WHERE id = ?")
    .get(result.lastInsertRowid);
  res.status(201).json(saved);
});

r.put("/:id", (req, res) => {
  const { name, phone, address } = req.body;
  const exists = db
    .prepare("SELECT id FROM clients WHERE id = ?")
    .get(req.params.id);
  if (!exists) return res.status(404).json({ error: "Not found" });
  db.prepare(
    "UPDATE clients SET name = ?, phone = ?, address = ? WHERE id = ?"
  ).run(name, phone ?? null, address ?? null, req.params.id);
  const saved = db
    .prepare("SELECT * FROM clients WHERE id = ?")
    .get(req.params.id);
  res.json(saved);
});

r.delete("/:id", (req, res) => {
  const clientId = parseInt(req.params.id, 10);
  if (!clientId) return res.status(400).json({ error: "Invalid client id" });

  const tableExists = (name) =>
    !!db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
      .get(name);

  const tx = db.transaction((cid) => {
    // get all order ids for client
    const orders = db
      .prepare("SELECT id FROM orders WHERE client_id = ?")
      .all(cid);
    const orderIds = orders.map((o) => o.id);

    if (orderIds.length) {
      // delete payments linked to each order (if payments table exists)
      if (tableExists("payments")) {
        const delPay = db.prepare("DELETE FROM payments WHERE order_id = ?");
        for (const oid of orderIds) delPay.run(oid);
      }
      // delete order_items / items if present
      if (tableExists("order_items")) {
        const delItems = db.prepare(
          "DELETE FROM order_items WHERE order_id = ?"
        );
        for (const oid of orderIds) delItems.run(oid);
      }
      // delete orders
      const delOrder = db.prepare("DELETE FROM orders WHERE id = ?");
      for (const oid of orderIds) delOrder.run(oid);
    }

    // finally delete client
    db.prepare("DELETE FROM clients WHERE id = ?").run(cid);
  });

  try {
    tx(clientId);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Failed to delete client:", err);
    return res.status(500).json({ error: String(err) });
  }
});

export default r;
