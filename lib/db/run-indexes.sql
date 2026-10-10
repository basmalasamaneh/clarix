-- Additive only: no data changes, constraint replacement, or privilege changes.
CREATE INDEX IF NOT EXISTS orders_factory_order_idx
  ON orders(factory_id,source_order_id);
CREATE INDEX IF NOT EXISTS orders_factory_quality_idx
  ON orders(factory_id,(metrics->>'overall'),source_order_id);
