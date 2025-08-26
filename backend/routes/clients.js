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
  const info = db
    .prepare("DELETE FROM clients WHERE id = ?")
    .run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

export default r;
