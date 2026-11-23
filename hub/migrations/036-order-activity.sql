CREATE TABLE clothing_order_activity (
  order_id TEXT NOT NULL REFERENCES clothing_orders(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  PRIMARY KEY(order_id,day)
);
