ALTER TABLE returns ADD COLUMN other_refund INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sale_items ADD COLUMN name_dari TEXT NOT NULL DEFAULT '';
CREATE TABLE stock_counts(id TEXT PRIMARY KEY,lot_id TEXT NOT NULL REFERENCES lots(id),expected INTEGER NOT NULL,counted INTEGER NOT NULL,reason TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE customer_payments(id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),amount INTEGER NOT NULL CHECK(amount>0),method TEXT NOT NULL CHECK(method IN('cash','other')),actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE supplier_payments(id TEXT PRIMARY KEY,supplier_id TEXT NOT NULL REFERENCES suppliers(id),amount INTEGER NOT NULL CHECK(amount>0),method TEXT NOT NULL CHECK(method IN('cash','other')),actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
INSERT INTO schema_migrations(version) VALUES(2);
