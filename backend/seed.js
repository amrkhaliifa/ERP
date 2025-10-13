import { db } from './db.js';


const seed = db.transaction(() => {
db.prepare('DELETE FROM payments').run();
db.prepare('DELETE FROM order_items').run();
db.prepare('DELETE FROM orders').run();
db.prepare('DELETE FROM products').run();
db.prepare('DELETE FROM clients').run();

db.prepare('INSERT INTO clients(name, phone) VALUES (?, ?), (?, ?)')
.run('Ahmed Ali', '+20xxxxxxxxx', 'Mona Saad', null);


db.prepare('INSERT INTO products(name, color, unit, cost_price, default_sale_price, stock_qty) VALUES(?, ?, ?, ?, ?, ?),(?, ?, ?, ?, ?, ?),(?, ?, ?, ?, ?, ?)').run("Gate Panel", "RAL-9005", "piece", 300, 500, 10, "Wheel Rim", "RAL-7016", "piece", 150, 250, 20, "Powder Paint (Black)", "RAL-9005", "kg", 120, 200, 50);
});

seed();
console.log("Seeded.");