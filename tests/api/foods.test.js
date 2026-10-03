import { adminToken, bearer, closeDb, db, foodByName, http, loginCustomer, placeOrder } from '../helpers'

afterAll(closeDb)

describe('food catalog', () => {
  let admin
  beforeAll(async () => { admin = await adminToken() })

  it('creates a food with decimal price, currency and optional fields', async () => {
    const res = await http().post('/api/v1/foods').set(bearer(admin)).send({
      name: 'Test Ramen', description: 'Noodles', category: 'Noodles', price: '9.50', image_url: 'https://example.com/ramen.jpg'
    })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      name: 'Test Ramen',
      category: 'Noodles',
      price: '9.50',
      currency: 'AED',
      is_available: true,
      archived_at: null,
      image_url: 'https://example.com/ramen.jpg'
    })
  })

  it('rejects invalid input with field errors', async () => {
    const res = await http().post('/api/v1/foods').set(bearer(admin)).send({ name: '', price: '-3', image_url: 'ftp://x' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(res.body.error.details.fields).sort()).toEqual(['image_url', 'name', 'price'])

    const tooPrecise = await http().post('/api/v1/foods').set(bearer(admin)).send({ name: 'X', price: '1.999' })
    expect(tooPrecise.status).toBe(400)
  })

  it('returns detail, 404 for unknown ids and 400 for malformed ids', async () => {
    const food = await foodByName('Margherita Pizza')
    const ok = await http().get(`/api/v1/foods/${food.id}`).set(bearer(admin))
    expect(ok.status).toBe(200)
    expect(ok.body.name).toBe('Margherita Pizza')
    expect((await http().get('/api/v1/foods/999999').set(bearer(admin))).status).toBe(404)
    expect((await http().get('/api/v1/foods/abc').set(bearer(admin))).status).toBe(400)
  })

  it('searches, filters by availability and category, and paginates', async () => {
    const pizza = await http().get('/api/v1/foods?q=pizza').set(bearer(admin))
    expect(pizza.body.data.map((f) => f.name)).toEqual(['Margherita Pizza', 'Pepperoni Pizza'])
    expect(pizza.body.pagination).toEqual({ page: 1, page_size: 20, total: 2, total_pages: 1 })

    const unavailable = await http().get('/api/v1/foods?availability=unavailable').set(bearer(admin))
    expect(unavailable.body.data.map((f) => f.name)).toContain('Truffle Fries')
    expect(unavailable.body.data.every((f) => f.is_available === false)).toBe(true)

    const burgers = await http().get('/api/v1/foods?category=Burgers').set(bearer(admin))
    expect(burgers.body.data.length).toBe(2)

    const page = await http().get('/api/v1/foods?page=2&page_size=2').set(bearer(admin))
    expect(page.body.data.length).toBe(2)
    expect(page.body.pagination).toMatchObject({ page: 2, page_size: 2 })
    expect(page.body.pagination.total).toBeGreaterThanOrEqual(6)

    expect((await http().get('/api/v1/foods?page_size=1000').set(bearer(admin))).status).toBe(400)
    // Wildcards are matched literally.
    expect((await http().get('/api/v1/foods?q=%25').set(bearer(admin))).body.data).toEqual([])
  })

  it('lists categories', async () => {
    const res = await http().get('/api/v1/foods/categories').set(bearer(admin))
    expect(res.body.data).toEqual(expect.arrayContaining(['Pizza', 'Burgers', 'Salads', 'Sides']))
  })

  it('toggles availability', async () => {
    const created = await http().post('/api/v1/foods').set(bearer(admin)).send({ name: 'Toggle Taco', price: '3.00' })
    const off = await http().patch(`/api/v1/foods/${created.body.id}/availability`).set(bearer(admin)).send({ is_available: false })
    expect(off.body.is_available).toBe(false)
    const bad = await http().patch(`/api/v1/foods/${created.body.id}/availability`).set(bearer(admin)).send({ is_available: 'maybe' })
    expect(bad.status).toBe(400)
  })

  it('archives instead of deleting: history stays readable and the food cannot be ordered', async () => {
    const created = await http().post('/api/v1/foods').set(bearer(admin)).send({ name: 'Archive Curry', price: '7.00' })
    const customer = await loginCustomer()
    const order = await placeOrder(customer, [{ food_id: created.body.id, quantity: 2 }])

    const archived = await http().patch(`/api/v1/foods/${created.body.id}/archive`).set(bearer(admin))
    expect(archived.status).toBe(200)
    expect(archived.body.archived_at).not.toBeNull()
    expect(archived.body.is_available).toBe(false)

    // Hidden from the default list, visible when asked for.
    const hidden = await http().get('/api/v1/foods?q=Archive Curry').set(bearer(admin))
    expect(hidden.body.data).toEqual([])
    const shown = await http().get('/api/v1/foods?q=Archive Curry&include_archived=true').set(bearer(admin))
    expect(shown.body.data.length).toBe(1)

    // The customer cannot see or order it.
    const mobile = await http().get('/api/v1/mobile/foods?q=Archive Curry').set(bearer(customer))
    expect(mobile.body.data).toEqual([])
    const again = await http().post('/api/v1/mobile/orders').set(bearer(customer)).send({ items: [{ food_id: created.body.id, quantity: 1 }] })
    expect(again.status).toBe(400)
    expect(again.body.error.code).toBe('FOOD_UNAVAILABLE')

    // The old order is still fully readable, including the snapshot name and price.
    const detail = await http().get(`/api/v1/orders/${order.id}`).set(bearer(admin))
    expect(detail.body.items[0]).toMatchObject({ food_name: 'Archive Curry', unit_price: '7.00', quantity: 2, line_total: '14.00' })

    // Archived foods cannot be edited until restored.
    const edit = await http().patch(`/api/v1/foods/${created.body.id}`).set(bearer(admin)).send({ name: 'Renamed' })
    expect(edit.status).toBe(409)
    expect(edit.body.error.code).toBe('FOOD_ARCHIVED')
    const restored = await http().patch(`/api/v1/foods/${created.body.id}/restore`).set(bearer(admin))
    expect(restored.body.archived_at).toBeNull()
  })

  it('cannot hard-delete a food that is referenced by an order (database RESTRICT)', async () => {
    const food = await foodByName('Margherita Pizza')
    await expect(db.Food.destroy({ where: { id: food.id } })).rejects.toThrow()
  })
})
