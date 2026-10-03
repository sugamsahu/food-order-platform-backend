'use strict'

// Brings the schema in line with the assignment brief:
//  - users.is_active (instead of a status string) and token_version (bumped on logout / password reset)
//  - foods: category, currency, image_url, archived_at, positive-price check
//  - orders: unique human-readable reference, fulfillment type, subtotal/total, delivery address
//  - order_items: name and price snapshots, line_total, RESTRICT on food deletion
//  - order_status_history: from/to status, actor_id, append-only trigger
//  - drops the unused OTP table (customers sign in with email + password)
// Existing rows are back-filled. This migration is not reversible; use `npm run db:reset`.

module.exports = {
  up: async (queryInterface) => {
    const run = (sql, t) => queryInterface.sequelize.query(sql, { transaction: t })

    await queryInterface.sequelize.transaction(async (t) => {
      // ---- users
      await run('ALTER TABLE users ADD COLUMN is_active boolean NOT NULL DEFAULT true', t)
      await run("UPDATE users SET is_active = (status = 'active')", t)
      await run('ALTER TABLE users DROP COLUMN status', t)
      await run('ALTER TABLE users ADD COLUMN token_version integer NOT NULL DEFAULT 0', t)

      // ---- foods
      await run("ALTER TABLE foods ADD COLUMN category varchar(100) NOT NULL DEFAULT 'Uncategorized'", t)
      await run("ALTER TABLE foods ADD COLUMN currency varchar(3) NOT NULL DEFAULT 'AED'", t)
      await run('ALTER TABLE foods ADD COLUMN image_url text', t)
      await run('ALTER TABLE foods ADD COLUMN archived_at timestamptz', t)
      await run('ALTER TABLE foods ALTER COLUMN price TYPE numeric(10,2)', t)
      await run('ALTER TABLE foods ADD CONSTRAINT foods_price_positive CHECK (price > 0)', t)
      await run('DROP INDEX IF EXISTS foods_name_idx', t)
      await run('CREATE INDEX foods_lower_name_idx ON foods (lower(name))', t)
      await run('CREATE INDEX foods_category_idx ON foods (category)', t)

      // ---- orders
      await run('CREATE SEQUENCE order_reference_seq', t)
      await run('ALTER TABLE orders ADD COLUMN reference varchar(20)', t)
      await run(`UPDATE orders o SET reference = 'FO-' || lpad(r.n::text, 6, '0')
                 FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM orders) r WHERE r.id = o.id`, t)
      await run("SELECT setval('order_reference_seq', (SELECT count(*) FROM orders) + 1, false)", t)
      await run('ALTER TABLE orders ALTER COLUMN reference SET NOT NULL', t)
      await run('ALTER TABLE orders ADD CONSTRAINT orders_reference_key UNIQUE (reference)', t)
      await run("CREATE TYPE enum_orders_fulfillment_type AS ENUM ('pickup', 'delivery')", t)
      await run("ALTER TABLE orders ADD COLUMN fulfillment_type enum_orders_fulfillment_type NOT NULL DEFAULT 'pickup'", t)
      await run('ALTER TABLE orders ADD COLUMN delivery_address text', t)
      await run('ALTER TABLE orders ADD COLUMN subtotal numeric(10,2)', t)
      await run('UPDATE orders SET subtotal = total_amount', t)
      await run('ALTER TABLE orders ALTER COLUMN subtotal SET NOT NULL', t)
      await run('ALTER TABLE orders ALTER COLUMN total_amount TYPE numeric(10,2)', t)
      await run('ALTER TABLE orders RENAME COLUMN total_amount TO total', t)
      await run('ALTER TABLE orders ADD CONSTRAINT orders_amounts_nonnegative CHECK (subtotal >= 0 AND total >= 0)', t)
      await run("ALTER TABLE orders ADD CONSTRAINT orders_delivery_needs_address CHECK (fulfillment_type <> 'delivery' OR delivery_address IS NOT NULL)", t)
      await run('DROP INDEX IF EXISTS orders_id_idx', t)
      await run('CREATE INDEX orders_created_at_idx ON orders (created_at DESC, id DESC)', t)
      await run('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_customer_id_fkey', t)
      await run('ALTER TABLE orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers (id) ON UPDATE CASCADE ON DELETE RESTRICT', t)

      // ---- order_items
      await run('ALTER TABLE order_items ADD COLUMN food_name_snapshot varchar(255)', t)
      await run('UPDATE order_items i SET food_name_snapshot = f.name FROM foods f WHERE f.id = i.food_id', t)
      await run('ALTER TABLE order_items ALTER COLUMN food_name_snapshot SET NOT NULL', t)
      await run('ALTER TABLE order_items ALTER COLUMN unit_price TYPE numeric(10,2)', t)
      await run('ALTER TABLE order_items RENAME COLUMN unit_price TO unit_price_snapshot', t)
      await run('ALTER TABLE order_items ADD COLUMN line_total numeric(10,2)', t)
      await run('UPDATE order_items SET line_total = unit_price_snapshot * quantity', t)
      await run('ALTER TABLE order_items ALTER COLUMN line_total SET NOT NULL', t)
      await run('ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0)', t)
      await run('ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_food_id_fkey', t)
      await run('ALTER TABLE order_items ADD CONSTRAINT order_items_food_id_fkey FOREIGN KEY (food_id) REFERENCES foods (id) ON UPDATE CASCADE ON DELETE RESTRICT', t)
      await run('CREATE INDEX order_items_order_id_idx ON order_items (order_id)', t)
      await run('CREATE INDEX order_items_food_id_idx ON order_items (food_id)', t)

      // ---- order_status_history
      await run('ALTER TABLE order_status_history RENAME COLUMN status TO to_status', t)
      await run('ALTER TABLE order_status_history ADD COLUMN from_status enum_order_status_history_status', t)
      await run('ALTER TABLE order_status_history ADD COLUMN actor_id bigint', t)
      await run('UPDATE order_status_history SET actor_id = changed_by_user_id', t)
      await run('ALTER TABLE order_status_history DROP COLUMN changed_by_user_id', t)
      await run('ALTER TABLE order_status_history DROP COLUMN updated_at', t)
      await run('CREATE INDEX order_status_history_order_created_idx ON order_status_history (order_id, created_at)', t)
      await run(`CREATE FUNCTION order_status_history_append_only() RETURNS trigger AS $$
                 BEGIN RAISE EXCEPTION 'order_status_history is append-only'; END;
                 $$ LANGUAGE plpgsql`, t)
      await run(`CREATE TRIGGER order_status_history_no_update_delete
                 BEFORE UPDATE OR DELETE ON order_status_history
                 FOR EACH ROW EXECUTE FUNCTION order_status_history_append_only()`, t)

      // ---- OTP table is no longer used
      await run('DROP TABLE IF EXISTS otps', t)
    })
  },

  down: async () => {
    throw new Error('This migration is not reversible. Use `npm run db:reset` to rebuild the database.')
  }
}
