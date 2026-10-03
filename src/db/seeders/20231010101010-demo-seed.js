'use strict'

// Local development / CI sample data. The credentials below are for local use only.
const bcrypt = require('bcrypt')

const CURRENCY = process.env.CURRENCY || 'AED'
const toCents = (s) => Math.round(Number(s) * 100)
const fromCents = (c) => (c / 100).toFixed(2)

module.exports = {
  up: async (queryInterface) => {
    const q = queryInterface.sequelize
    const passwordHash = await bcrypt.hash('password123', 10)
    const now = Date.now()
    const ago = (minutes) => new Date(now - minutes * 60 * 1000)

    await queryInterface.bulkInsert('users', [
      { name: 'Admin User', email: 'admin@example.com', password_hash: passwordHash, role: 'admin', is_active: true, created_at: ago(5000), updated_at: ago(5000) },
      { name: 'Operator User', email: 'operator@example.com', password_hash: passwordHash, role: 'operator', is_active: true, created_at: ago(5000), updated_at: ago(5000) }
    ])
    await queryInterface.bulkInsert('customers', [
      { name: 'Test Customer', email: 'customer@example.com', password_hash: passwordHash, phone: '+971 50 555 0100', created_at: ago(5000), updated_at: ago(5000) },
      { name: 'Second Customer', email: 'customer2@example.com', password_hash: passwordHash, phone: '+971 50 555 0101', created_at: ago(5000), updated_at: ago(5000) }
    ])

    const foodRows = [
      ['Margherita Pizza', 'Classic cheese and tomato pizza', 'Pizza', '48.00', true],
      ['Pepperoni Pizza', 'Pepperoni and cheese pizza', 'Pizza', '55.00', true],
      ['Vegan Burger', 'Plant-based patty with lettuce', 'Burgers', '40.00', true],
      ['Cheeseburger', 'Beef patty with cheddar cheese', 'Burgers', '44.00', true],
      ['Caesar Salad', 'Romaine lettuce, croutons, parmesan', 'Salads', '33.00', true],
      ['Truffle Fries', 'Crispy fries with truffle oil', 'Sides', '26.00', false] // unavailable
    ]
    await queryInterface.bulkInsert('foods', foodRows.map(([name, description, category, price, is_available]) => ({
      name, description, category, price, currency: CURRENCY, is_available, created_at: ago(4000), updated_at: ago(4000)
    })))

    const [[admin]] = await q.query("SELECT id FROM users WHERE email = 'admin@example.com'")
    const [[operator]] = await q.query("SELECT id FROM users WHERE email = 'operator@example.com'")
    const [[c1]] = await q.query("SELECT id FROM customers WHERE email = 'customer@example.com'")
    const [[c2]] = await q.query("SELECT id FROM customers WHERE email = 'customer2@example.com'")
    const [foods] = await q.query('SELECT id, name, price FROM foods ORDER BY id')
    const food = (n) => foods[n - 1]

    // [customer, fulfillment, address, notes, [[foodNo, qty], ...], status path, minutes ago it was placed]
    const orders = [
      [c1, 'pickup', null, null, [[1, 1], [2, 1]], ['Placed'], 10],
      [c1, 'delivery', 'Villa 12, Al Wasl Road, Jumeirah, Dubai', 'Ring the bell twice', [[3, 2]], ['Placed', 'Accepted'], 40],
      [c2, 'pickup', null, null, [[4, 1], [5, 1]], ['Placed', 'Accepted', 'Preparing'], 70],
      [c1, 'delivery', 'Apt 1804, Marina Heights, Dubai Marina', null, [[1, 2]], ['Placed', 'Accepted', 'Preparing', 'Ready'], 100],
      [c1, 'pickup', null, null, [[2, 1], [5, 2]], ['Placed', 'Accepted', 'Preparing', 'Ready', 'Completed'], 300],
      [c2, 'pickup', null, null, [[1, 1]], ['Placed', 'Cancelled'], 500]
    ]

    for (const [customer, fulfillment, address, notes, lines, path, minutesAgo] of orders) {
      const itemRows = lines.map(([no, qty]) => {
        const f = food(no)
        return { f, qty, lineCents: toCents(f.price) * qty }
      })
      const totalCents = itemRows.reduce((s, r) => s + r.lineCents, 0)
      const placedAt = ago(minutesAgo)
      const [[{ n }]] = await q.query("SELECT nextval('order_reference_seq') AS n")
      const reference = 'FO-' + String(n).padStart(6, '0')
      const [[order]] = await q.query(
        `INSERT INTO orders (reference, customer_id, status, fulfillment_type, delivery_address, notes, subtotal, total, created_at, updated_at)
         VALUES (:reference, :customerId, :status, :fulfillment, :address, :notes, :total, :total, :placedAt, :placedAt) RETURNING id`,
        { replacements: { reference, customerId: customer.id, status: path[path.length - 1], fulfillment, address, notes, total: fromCents(totalCents), placedAt } }
      )
      for (const r of itemRows) {
        await q.query(
          `INSERT INTO order_items (order_id, food_id, food_name_snapshot, unit_price_snapshot, quantity, line_total, created_at, updated_at)
           VALUES (:orderId, :foodId, :name, :price, :qty, :line, :placedAt, :placedAt)`,
          { replacements: { orderId: order.id, foodId: r.f.id, name: r.f.name, price: r.f.price, qty: r.qty, line: fromCents(r.lineCents), placedAt } }
        )
      }
      for (let i = 0; i < path.length; i++) {
        const staff = i % 2 === 0 ? admin : operator
        await q.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, actor_type, actor_id, reason, created_at)
           VALUES (:orderId, :from, :to, :actorType, :actorId, :reason, :at)`,
          {
            replacements: {
              orderId: order.id,
              from: i === 0 ? null : path[i - 1],
              to: path[i],
              actorType: i === 0 ? 'customer' : 'staff',
              actorId: i === 0 ? customer.id : staff.id,
              reason: path[i] === 'Cancelled' ? 'Customer changed their mind' : null,
              at: new Date(placedAt.getTime() + i * 5 * 60 * 1000)
            }
          }
        )
      }
    }
  },

  down: async (queryInterface) => {
    // TRUNCATE does not fire the append-only row trigger on order_status_history.
    await queryInterface.sequelize.query(
      'TRUNCATE order_status_history, order_items, orders, foods, customers, users RESTART IDENTITY CASCADE'
    )
    await queryInterface.sequelize.query("SELECT setval('order_reference_seq', 1, false)")
  }
}
