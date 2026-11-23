ALTER TABLE clothing_orders ADD COLUMN shipped_on TEXT;
ALTER TABLE clothing_orders ADD COLUMN estimated_on TEXT;
ALTER TABLE clothing_orders ADD COLUMN cancelled_on TEXT;
ALTER TABLE clothing_orders ADD COLUMN total_cents INTEGER;
ALTER TABLE clothing_orders ADD COLUMN refund_on TEXT;
ALTER TABLE clothing_orders ADD COLUMN refund_cents INTEGER;
ALTER TABLE clothing_orders ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'order';

CREATE TABLE order_finance_entries (
  order_id TEXT NOT NULL REFERENCES clothing_orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('purchase','refund')),
  entry_id TEXT NOT NULL REFERENCES finance_entries(id) ON DELETE CASCADE,
  PRIMARY KEY (order_id,kind),
  UNIQUE (entry_id)
);
