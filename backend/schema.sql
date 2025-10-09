CREATE TABLE IF NOT EXISTS clients (
name TEXT NOT NULL,
phone TEXT,
address TEXT
);


CREATE TABLE IF NOT EXISTS products (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT NOT NULL,
color TEXT,
unit TEXT,
cost_price REAL NOT NULL DEFAULT 0,
default_sale_price REAL NOT NULL DEFAULT 0,
stock_qty REAL NOT NULL DEFAULT 0
);


CREATE TABLE IF NOT EXISTS orders (
id INTEGER PRIMARY KEY AUTOINCREMENT,
client_id INTEGER NOT NULL,
created_at TEXT NOT NULL DEFAULT (datetime('now')),
subtotal REAL NOT NULL DEFAULT 0,
deposit_paid REAL NOT NULL DEFAULT 0,
total_paid REAL NOT NULL DEFAULT 0,
estimated_cost REAL NOT NULL DEFAULT 0,
FOREIGN KEY (client_id) REFERENCES clients(id)
);


CREATE TABLE IF NOT EXISTS order_items (
id INTEGER PRIMARY KEY AUTOINCREMENT,
order_id INTEGER NOT NULL,
product_id INTEGER NOT NULL,
qty REAL NOT NULL,
unit_price REAL NOT NULL,
unit_cost_snapshot REAL NOT NULL,
FOREIGN KEY (order_id) REFERENCES orders(id),
FOREIGN KEY (product_id) REFERENCES products(id)
);


CREATE TABLE IF NOT EXISTS payments (
id INTEGER PRIMARY KEY AUTOINCREMENT,
order_id INTEGER NOT NULL,
paid_at TEXT NOT NULL DEFAULT (datetime('now')),
amount REAL NOT NULL,
note TEXT,
FOREIGN KEY (order_id) REFERENCES orders(id)
);


CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);