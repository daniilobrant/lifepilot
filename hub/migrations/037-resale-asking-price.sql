ALTER TABLE wardrobe_sales ADD COLUMN asking_price_cents INTEGER
  CHECK(asking_price_cents BETWEEN 1 AND 10000000);
