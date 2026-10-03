import { adminToken, bearer, closeDb, db, foodByName, http, loginCustomer, operatorToken, placeOrder } from '../helpers'

afterAll(closeDb)

describe('staff order management', () => {
  let admin
  let operator
  let customer
  let pizza
  beforeAll(async () => {
    admin = await adminToken()
    operator = await operatorToken()
    customer = await loginCustomer()
    pizza = await foodByName('Margherita Pizza')
  })

  const newOrder = (extra = {}) => placeOrder(customer, [{ food_id: pizza.id, quantity: 1 }], extra)
  const transition = (token, id, body) => http().post(`/api/v1/orders/${id}/transitions`).set(bearer(token)).send(body)

  it('lists newest first with pagination, status filter and search by reference or customer', async () => {
    const fresh = await newOrder()

    const list = await http().get('/api/v1/orders?page_size=3').set(bearer(admin))
    expect(list.status).toBe(200)
    expect(list.body.data[0].reference).toBe(fresh.reference) // newest first
    expect(list.body.data.length).toBe(3)
    expect(list.body.pagination.total).toBeGreaterThanOrEqual(7)
    const times = list.body.data.map((o) => new Date(o.created_at).getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)

    const byRef = await http().get(`/api/v1/orders?q=${fresh.reference.toLowerCase()}`).set(bearer(admin))
    expect(byRef.body.data.map((o) => o.reference)).toEqual([fresh.reference])

    const byCustomer = await http().get('/api/v1/orders?q=second customer').set(bearer(admin))
    expect(byCustomer.body.data.length).toBeGreaterThanOrEqual(2)
    expect(byCustomer.body.data.every((o) => o.customer.name === 'Second Customer')).toBe(true)

    const cancelled = await http().get('/api/v1/orders?status=Cancelled').set(bearer(admin))
    expect(cancelled.body.data.length).toBeGreaterThanOrEqual(1)
    expect(cancelled.body.data.every((o) => o.status === 'Cancelled')).toBe(true)

    expect((await http().get('/api/v1/orders?status=Bogus').set(bearer(admin))).status).toBe(400)
  })

  it('shows order detail with items, totals, customer, fulfillment and a status timeline with actor names', async () => {
    const seeded = await db.Order.findOne({ where: { reference: 'FO-000005' } })
    const res = await http().get(`/api/v1/orders/${seeded.id}`).set(bearer(admin))
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      reference: 'FO-000005',
      status: 'Completed',
      fulfillment_type: 'pickup',
      subtotal: '121.00',
      total: '121.00',
      currency: 'AED',
      customer: { name: 'Test Customer', email: 'customer@example.com' }
    })
    expect(res.body.items).toHaveLength(2)
    expect(res.body.items[0]).toHaveProperty('food_name')
    expect(res.body.status_history.map((h) => h.to_status)).toEqual(['Placed', 'Accepted', 'Preparing', 'Ready', 'Completed'])
    expect(res.body.status_history[0]).toMatchObject({ from_status: null, actor_type: 'customer', actor_name: 'Test Customer' })
    expect(res.body.status_history[1]).toMatchObject({ from_status: 'Placed', actor_type: 'staff' })
    expect(res.body.status_history[1].actor_name).toMatch(/User$/)
    expect((await http().get('/api/v1/orders/999999').set(bearer(admin))).status).toBe(404)
  })

  it('walks an order through the whole workflow and records every change', async () => {
    const order = await newOrder()
    for (const to of ['Accepted', 'Preparing', 'Ready', 'Completed']) {
      const res = await transition(to === 'Preparing' ? admin : operator, order.id, { to })
      expect(res.status).toBe(200)
      expect(res.body.status).toBe(to)
    }
    const detail = await http().get(`/api/v1/orders/${order.id}`).set(bearer(admin))
    expect(detail.body.status_history.map((h) => [h.from_status, h.to_status])).toEqual([
      [null, 'Placed'], ['Placed', 'Accepted'], ['Accepted', 'Preparing'], ['Preparing', 'Ready'], ['Ready', 'Completed']
    ])
    expect(detail.body.status_history.slice(1).every((h) => h.actor_type === 'staff' && h.actor_name)).toBe(true)
  })

  it('rejects invalid, duplicate and terminal transitions in the API', async () => {
    const order = await newOrder()
    const skip = await transition(operator, order.id, { to: 'Completed' })
    expect(skip.status).toBe(409)
    expect(skip.body.error).toMatchObject({ code: 'INVALID_TRANSITION', details: { current_status: 'Placed', requested_status: 'Completed' } })

    expect((await transition(operator, order.id, { to: 'Accepted' })).status).toBe(200)
    const dup = await transition(operator, order.id, { to: 'Accepted' })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('INVALID_TRANSITION')

    expect((await transition(operator, order.id, { to: 'Cancelled', reason: 'Kitchen closed' })).status).toBe(200)
    const terminal = await transition(operator, order.id, { to: 'Accepted' })
    expect(terminal.status).toBe(409)
    expect(terminal.body.error.code).toBe('TERMINAL_STATE')

    expect((await transition(operator, order.id, { to: 'Nonsense' })).status).toBe(400)
    expect((await transition(operator, 999999, { to: 'Accepted' })).status).toBe(404)
  })

  it('requires a reason to cancel and stores it', async () => {
    const order = await newOrder()
    const missing = await transition(operator, order.id, { to: 'Cancelled' })
    expect(missing.status).toBe(400)
    expect(missing.body.error.details.fields).toHaveProperty('reason')
    expect((await transition(operator, order.id, { to: 'Cancelled', reason: '   ' })).status).toBe(400)

    const ok = await transition(operator, order.id, { to: 'Cancelled', reason: 'Customer called' })
    expect(ok.status).toBe(200)
    const last = ok.body.status_history[ok.body.status_history.length - 1]
    expect(last).toMatchObject({ from_status: 'Placed', to_status: 'Cancelled', reason: 'Customer called' })
  })

  it('serializes two simultaneous identical transitions: exactly one wins, one history row is written', async () => {
    const order = await newOrder()
    const [a, b] = await Promise.all([
      transition(operator, order.id, { to: 'Accepted' }),
      transition(admin, order.id, { to: 'Accepted' })
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(await db.OrderStatusHistory.count({ where: { orderId: order.id, toStatus: 'Accepted' } })).toBe(1)
    expect(await db.OrderStatusHistory.count({ where: { orderId: order.id } })).toBe(2)
  })

  it('detects a stale client with the optional "from" status', async () => {
    const order = await newOrder()
    await transition(operator, order.id, { to: 'Accepted' })
    const stale = await transition(admin, order.id, { from: 'Placed', to: 'Cancelled', reason: 'Too late' })
    expect(stale.status).toBe(409)
    expect(stale.body.error).toMatchObject({ code: 'STATE_CONFLICT', details: { current_status: 'Accepted' } })
  })

  it('keeps the status history append-only at the database level', async () => {
    const order = await newOrder()
    const row = await db.OrderStatusHistory.findOne({ where: { orderId: order.id } })
    await expect(db.sequelize.query(`UPDATE order_status_history SET reason = 'tampered' WHERE id = ${Number(row.id)}`)).rejects.toThrow(/append-only/)
    await expect(db.sequelize.query(`DELETE FROM order_status_history WHERE id = ${Number(row.id)}`)).rejects.toThrow(/append-only/)
  })

  it('edits notes and fulfillment details, but never items or prices', async () => {
    const order = await newOrder()
    const notes = await http().patch(`/api/v1/orders/${order.id}`).set(bearer(operator)).send({ notes: 'No onions' })
    expect(notes.status).toBe(200)
    expect(notes.body.notes).toBe('No onions')

    const noAddress = await http().patch(`/api/v1/orders/${order.id}`).set(bearer(operator)).send({ fulfillment_type: 'delivery' })
    expect(noAddress.status).toBe(400)
    expect(noAddress.body.error.details.fields).toHaveProperty('delivery_address')

    const delivery = await http().patch(`/api/v1/orders/${order.id}`).set(bearer(operator))
      .send({ fulfillment_type: 'delivery', delivery_address: '7 Market Road', total: '0.01', items: [] })
    expect(delivery.status).toBe(200)
    expect(delivery.body).toMatchObject({ fulfillment_type: 'delivery', delivery_address: '7 Market Road', total: '48.00' })
    expect(delivery.body.items).toHaveLength(1)

    const pickup = await http().patch(`/api/v1/orders/${order.id}`).set(bearer(operator)).send({ fulfillment_type: 'pickup' })
    expect(pickup.body).toMatchObject({ fulfillment_type: 'pickup', delivery_address: null })

    expect((await http().patch(`/api/v1/orders/${order.id}`).set(bearer(operator)).send({})).status).toBe(400)
  })

  it('locks fulfillment details once an order is ready or finished, but notes stay editable', async () => {
    const order = await newOrder()
    for (const to of ['Accepted', 'Preparing', 'Ready']) await transition(operator, order.id, { to })
    const locked = await http().patch(`/api/v1/orders/${order.id}`).set(bearer(operator)).send({ fulfillment_type: 'delivery', delivery_address: 'x' })
    expect(locked.status).toBe(409)
    expect(locked.body.error.code).toBe('ORDER_LOCKED')
    expect((await http().patch(`/api/v1/orders/${order.id}`).set(bearer(operator)).send({ notes: 'Collected at 6pm' })).status).toBe(200)
  })

  it('shows dashboard counts by status', async () => {
    const res = await http().get('/api/v1/orders/metrics').set(bearer(admin))
    const sum = Object.values(res.body.counts).reduce((a, b) => a + b, 0)
    expect(res.body.total).toBe(sum)
    expect(res.body.total).toBe(await db.Order.count())
  })
})
