import express from "express";
import cors from "cors";
import path from "node:path";
import url from "node:url";
import { db } from "./db.js";

import clientsRouter from "./routes/clients.js";
import productsRouter from "./routes/products.js";
import ordersRouter from "./routes/orders.js";
import paymentsRouter from "./routes/payments.js";
import reportsRouter from "./routes/reports.js";

const app = express();
app.use(cors());
app.use(express.json());

// API routes
app.use("/api/clients", clientsRouter);
app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/reports", reportsRouter);

// Serve frontend (static)
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, "../frontend");
app.use("/", express.static(frontendDir));

app.get("/api/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`PowderCoatERP listening on http://localhost:${PORT}`)
);
