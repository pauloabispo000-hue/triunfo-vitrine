-- Execute este arquivo no PostgreSQL antes de iniciar a API.
CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 username VARCHAR(40) NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role VARCHAR(16) NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
 active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 name VARCHAR(120) NOT NULL,
 price_cents INTEGER NOT NULL DEFAULT 0 CHECK(price_cents>=0),
 status VARCHAR(20) NOT NULL DEFAULT 'voting' CHECK(status IN ('available','voting','viability','production','archived')),
 image_url TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS votes (
 user_id UUID NOT NULL REFERENCES users(id),
 product_id UUID NOT NULL REFERENCES products(id),
 favorable BOOLEAN NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,product_id)
);
CREATE TABLE IF NOT EXISTS suggestions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id),
 name VARCHAR(120) NOT NULL,
 image_url TEXT,
 status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id),
 total_cents INTEGER NOT NULL CHECK(total_cents>0),
 recognized_cents INTEGER,
 status VARCHAR(30) NOT NULL DEFAULT 'awaiting_receipt' CHECK(status IN ('awaiting_receipt','under_review','amount_matches','amount_pending','manual_review','confirmed','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_items (
 order_id UUID NOT NULL REFERENCES orders(id),
 product_id UUID NOT NULL REFERENCES products(id),
 qty INTEGER NOT NULL CHECK(qty>0),
 unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents>=0),
 PRIMARY KEY(order_id,product_id)
);
CREATE TABLE IF NOT EXISTS receipts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id UUID NOT NULL REFERENCES orders(id),
 user_id UUID NOT NULL REFERENCES users(id),
 file_path TEXT NOT NULL,
 original_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 sha256 CHAR(64) NOT NULL,
 recognized_cents INTEGER,
 ocr_text TEXT,
 status VARCHAR(24) NOT NULL DEFAULT 'processing',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receipts_order_idx ON receipts(order_id);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (
 id BIGSERIAL PRIMARY KEY,
 actor_id UUID REFERENCES users(id),
 action TEXT NOT NULL,
 target_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
