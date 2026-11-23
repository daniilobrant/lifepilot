CREATE TABLE clothing_orders (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  sender TEXT NOT NULL,
  reference TEXT NOT NULL,
  merchant TEXT NOT NULL,
  ordered_on TEXT NOT NULL,
  delivered_on TEXT,
  deadline TEXT,
  task_id TEXT REFERENCES tasks(id),
  UNIQUE(account,sender,reference)
);

CREATE TABLE clothing_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES clothing_orders(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  wardrobe_id TEXT REFERENCES wardrobe_items(id) ON DELETE SET NULL,
  details TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  image_checked INTEGER NOT NULL DEFAULT 0,
  arrived INTEGER NOT NULL DEFAULT 0 CHECK(arrived IN (0,1)),
  decision TEXT NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','kept','return','returned')),
  UNIQUE(order_id,item_key)
);
CREATE UNIQUE INDEX clothing_order_wardrobe ON clothing_order_items(wardrobe_id);
CREATE INDEX clothing_orders_task ON clothing_orders(task_id);

CREATE TABLE clothing_order_mail (
  account TEXT NOT NULL,
  source_key TEXT NOT NULL,
  sender TEXT NOT NULL,
  reference TEXT NOT NULL,
  tracking TEXT NOT NULL,
  day TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(account,source_key)
);
CREATE TABLE clothing_order_shipments (
  account TEXT NOT NULL,
  tracking TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES clothing_orders(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  received INTEGER NOT NULL DEFAULT 0 CHECK(received IN (0,1)),
  PRIMARY KEY(account,tracking)
);
CREATE INDEX clothing_order_mail_tracking ON clothing_order_mail(account,tracking);
CREATE INDEX clothing_order_mail_reference ON clothing_order_mail(account,sender,reference);

UPDATE grocery_shopping AS item SET data=json_set(data,'$.note','')
WHERE coalesce(json_extract(item.data,'$.note'),'')!='' AND (
  EXISTS (
    SELECT 1 FROM grocery_chat AS entry, json_each(entry.data,'$.rows') AS ingredient
    WHERE json_array_length(entry.data,'$.steps')>0
      AND json_extract(item.data,'$.note')=substr(json_extract(entry.data,'$.title'),1,120)
      AND lower(json_extract(item.data,'$.name'))=lower(json_extract(ingredient.value,'$.name'))
  )
  OR EXISTS (
    SELECT 1 FROM grocery_recipes AS recipe, json_each(recipe.data,'$.ingredients') AS ingredient
    WHERE json_extract(item.data,'$.note')=substr(json_extract(recipe.data,'$.title'),1,120)
      AND lower(json_extract(item.data,'$.name'))=lower(json_extract(ingredient.value,'$.name'))
  )
);
