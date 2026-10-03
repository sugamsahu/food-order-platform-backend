import { adminToken, bearer, closeDb, db, foodByName, http, loginCustomer, operatorToken, placeOrder } from '../helpers'

afterAll(closeDb)

describe('mobile customer API', () => {
  let customerA
  let customerB
  let pizza
  let burger
  beforeAll(async () => {
    customerA = await loginCustomer('customer@example.com')
    customerB = await loginCustomer('customer2@example.com')
    pizza = await foodByName('Margherita Pizza')
    burger = await foodByName('Vegan Burger')
  })

  it('signs in the seeded customer and hides whether an email exists', async () => {
    const ok = await http().post('/api/v1/mobile/auth/login').send({ email: 'customer@example.com', password: 'password123' })
    expect(ok.status).toBe(200)
    expect(ok.body.customer).toMatchObject({ email: 'customer@example.com' })
    expect(ok.body.customer).not.toHaveProperty('password_hash')

    const wrong = await http().post('/api/v1/mobile/auth/login').send({ email: 'customer@example.com', password: 'nope-nope' })
    const unknown = await http().post('/api/v1/mobile/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope' })
    expect(wrong.status).toBe(401)
    expect(unknown.body).toEqual(wrong.body)
  })

  it('requires a customer token for foods and orders', async () => {
    for (const [method, path] of [['get', '/api/v1/mobile/foods'], ['get', '/api/v1/mobile/orders'], ['post', '/api/v1/mobile/orders'], ['get', '/api/v1/mobile/orders/1']]) {
      expect((await http()[method](path)).status).toBe(401)
    }
  })

  it('lists only published foods (available and not archived), paginated', async () => {
    const res = await http().get('/api/v1/mobile/foods').set(bearer(customerA))
    expect(res.status).toBe(200)
    const names = res.body.data.map((f) => f.name)
    expect(names).toContain('Margherita Pizza')
    expect(names).not.toContain('Truffle Fries') // unavailable in the seed
    expect(res.body.data.every((f) => f.is_available && f.archived_at === null)).toBe(true)
    expect(res.body.pagination).toHaveProperty('total_pages')
    const small = await http().get('/api/v1/mobile/foods?page_size=2').set(bearer(customerA))
    expect(small.body.data).toHaveLength(2)
  })

  it('creates an order with a unique reference, snapshots and server-calculated totals', async () => {
    const res = await http().post('/api/v1/mobile/orders').set(bearer(customerA)).send({
      items: [{ food_id: pizza.id, quantity: 2 }, { food_id: burger.id, quantity: 1, unit_price: '0.01' }],
      fulfillment_type: 'delivery',
      delivery_address: '12 Park Street',
      notes: 'Extra napkins',
      total: '0.01',
      subtotal: '0.01' // ignored: the client never sets money
    })
    expect(res.status).toBe(201)
    expect(res.body.reference).toMatch(/^FO-\d{6}$/)
    expect(res.body).toMatchObject({
      status: 'Placed',
      fulfillment_type: 'delivery',
      delivery_address: '12 Park Street',
      notes: 'Extra napkins',
      subtotal: '136.00',
      total: '136.00',
      currency: 'AED'
    })
    expect(res.body.items.map((i) => [i.food_name, i.unit_price, i.quantity, i.line_total])).toEqual([
      ['Margherita Pizza', '48.00', 2, '96.00'],
      ['Vegan Burger', '40.00', 1, '40.00']
    ])
    expect(res.body.status_history).toHaveLength(1)
    expect(res.body.status_history[0]).toMatchObject({ from_status: null, to_status: 'Placed' })

    const other = await placeOrder(customerA, [{ food_id: pizza.id, quantity: 1 }])
    expect(other.reference).not.toBe(res.body.reference)
  })

  it('keeps old prices on existing orders when the menu price changes', async () => {
    const admin = await adminToken()
    const food = await http().post('/api/v1/foods').set(bearer(admin)).send({ name: 'Price Change Pasta', price: '10.00' })
    const order = await placeOrder(customerA, [{ food_id: food.body.id, quantity: 3 }])
    await http().patch(`/api/v1/foods/${food.body.id}`).set(bearer(admin)).send({ name: 'Renamed Pasta', price: '99.00' })

    const detail = await http().get(`/api/v1/orders/${order.id}`).set(bearer(admin))
    expect(detail.body.items[0]).toMatchObject({ food_name: 'Price Change Pasta', unit_price: '10.00', line_total: '30.00' })
    expect(detail.body.total).toBe('30.00')

    const next = await placeOrder(customerA, [{ food_id: food.body.id, quantity: 1 }])
    expect(next.total).toBe('99.00')
  })

  it('merges duplicate lines and avoids floating point drift', async () => {
    const admin = await adminToken()
    const food = await http().post('/api/v1/foods').set(bearer(admin)).send({ name: 'Drift Test', price: '0.29' })
    const order = await placeOrder(customerA, [{ food_id: food.body.id, quantity: 1 }, { food_id: food.body.id, quantity: 2 }])
    expect(order.items).toHaveLength(1)
    expect(order.items[0]).toMatchObject({ quantity: 3, line_total: '0.87' })
    expect(order.total).toBe('0.87')
  })

  it('rejects unavailable, unknown and archived foods without creating anything', async () => {
    const before = await db.Order.count()
    const truffle = await foodByName('Truffle Fries')
    const unavailable = await http().post('/api/v1/mobile/orders').set(bearer(customerA)).send({ items: [{ food_id: pizza.id, quantity: 1 }, { food_id: truffle.id, quantity: 1 }] })
    expect(unavailable.status).toBe(400)
    expect(unavailable.body.error).toMatchObject({ code: 'FOOD_UNAVAILABLE', details: { food_ids: [Number(truffle.id)] } })

    const unknown = await http().post('/api/v1/mobile/orders').set(bearer(customerA)).send({ items: [{ food_id: 999999, quantity: 1 }] })
    expect(unknown.body.error.code).toBe('FOOD_UNAVAILABLE')
    expect(await db.Order.count()).toBe(before) // all-or-nothing
  })

  it('validates the order body', async () => {
    const post = (body) => http().post('/api/v1/mobile/orders').set(bearer(customerA)).send(body)
    expect((await post({ items: [] })).status).toBe(400)
    expect((await post({})).status).toBe(400)
    expect((await post({ items: [{ food_id: pizza.id, quantity: 0 }] })).status).toBe(400)
    expect((await post({ items: [{ food_id: pizza.id, quantity: 100 }] })).status).toBe(400)
    expect((await post({ items: [{ food_id: pizza.id, quantity: 1.5 }] })).status).toBe(400)
    expect((await post({ items: [{ food_id: 'abc', quantity: 1 }] })).status).toBe(400)
    const noAddress = await post({ items: [{ food_id: pizza.id, quantity: 1 }], fulfillment_type: 'delivery' })
    expect(noAddress.body.error.details.fields).toHaveProperty('delivery_address')
    expect((await post({ items: [{ food_id: pizza.id, quantity: 1 }], fulfillment_type: 'drone' })).status).toBe(400)
  })

  it('blocks customer A from customer B\'s orders on every read', async () => {
    const orderB = await placeOrder(customerB, [{ food_id: burger.id, quantity: 1 }])

    // Direct lookup: indistinguishable from a missing order.
    const direct = await http().get(`/api/v1/mobile/orders/${orderB.id}`).set(bearer(customerA))
    expect(direct.status).toBe(404)
    expect(direct.body.error.code).toBe('NOT_FOUND')
    expect((await http().get(`/api/v1/mobile/orders/${orderB.id}`).set(bearer(customerB))).status).toBe(200)

    // Lists contain only the caller's own orders.
    const listA = await http().get('/api/v1/mobile/orders?page_size=100').set(bearer(customerA))
    const listB = await http().get('/api/v1/mobile/orders?page_size=100').set(bearer(customerB))
    expect(listA.body.data.map((o) => o.reference)).not.toContain(orderB.reference)
    expect(listB.body.data.map((o) => o.reference)).toContain(orderB.reference)
    const refsA = new Set(listA.body.data.map((o) => o.reference))
    expect(listB.body.data.some((o) => refsA.has(o.reference))).toBe(false)
  })

  it('lets a customer follow their order status and see no staff identities', async () => {
    const operator = await operatorToken()
    const order = await placeOrder(customerA, [{ food_id: pizza.id, quantity: 1 }])
    await http().post(`/api/v1/orders/${order.id}/transitions`).set(bearer(operator)).send({ to: 'Accepted' })

    const res = await http().get(`/api/v1/mobile/orders/${order.id}`).set(bearer(customerA))
    expect(res.body.status).toBe('Accepted')
    expect(res.body.status_history.map((h) => h.to_status)).toEqual(['Placed', 'Accepted'])
    expect(JSON.stringify(res.body)).not.toMatch(/actor|operator@|admin@/)

    const list = await http().get('/api/v1/mobile/orders?status=Accepted').set(bearer(customerA))
    expect(list.body.data.every((o) => o.status === 'Accepted')).toBe(true)
    expect(list.body.data.map((o) => o.reference)).toContain(order.reference)
  })
})
