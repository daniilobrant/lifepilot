ALTER TABLE wardrobe_sales ADD COLUMN price_class TEXT;
ALTER TABLE wardrobe_sales ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 20);
