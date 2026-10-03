import { adminToken, bearer, closeDb, http, operatorToken } from '../helpers'

afterAll(closeDb)

describe('role-based access', () => {
  let admin
  let operator
  beforeAll(async () => {
    admin = await adminToken()
    operator = await operatorToken()
  })

  it('denies an operator every staff-user management endpoint', async () => {
    const calls = [
      http().get('/api/v1/staff-users'),
      http().post('/api/v1/staff-users').send({ name: 'X', email: 'x@example.com', password: 'longenough', role: 'admin' }),
      http().get('/api/v1/staff-users/1'),
      http().patch('/api/v1/staff-users/2').send({ role: 'admin' }), // an operator cannot promote themself
      http().patch('/api/v1/staff-users/1/deactivate'),
      http().post('/api/v1/staff-users/1/reset-password').send({ password: 'longenough' })
    ]
    for (const call of calls) {
      const res = await call.set(bearer(operator))
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('INSUFFICIENT_ROLE')
    }
  })

  it('lets an administrator list staff users', async () => {
    const res = await http().get('/api/v1/staff-users').set(bearer(admin))
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(res.body)).not.toMatch(/password/i)
  })

  it('lets an operator create and edit foods but not archive them', async () => {
    const created = await http().post('/api/v1/foods').set(bearer(operator)).send({ name: 'Operator Soup', price: '4.25', category: 'Soups' })
    expect(created.status).toBe(201)

    const edited = await http().patch(`/api/v1/foods/${created.body.id}`).set(bearer(operator)).send({ price: '4.75' })
    expect(edited.status).toBe(200)
    expect(edited.body.price).toBe('4.75')

    const archived = await http().patch(`/api/v1/foods/${created.body.id}/archive`).set(bearer(operator))
    expect(archived.status).toBe(403)

    expect((await http().patch(`/api/v1/foods/${created.body.id}/archive`).set(bearer(admin))).status).toBe(200)
  })

  it('lets an operator view orders and metrics', async () => {
    expect((await http().get('/api/v1/orders').set(bearer(operator))).status).toBe(200)
    const metrics = await http().get('/api/v1/orders/metrics').set(bearer(operator))
    expect(metrics.status).toBe(200)
    expect(metrics.body.counts).toHaveProperty('Placed')
  })

  it('requires authentication on every staff route', async () => {
    for (const [method, path] of [['get', '/api/v1/foods'], ['get', '/api/v1/orders'], ['get', '/api/v1/orders/metrics'], ['get', '/api/v1/staff-users']]) {
      expect((await http()[method](path)).status).toBe(401)
    }
  })
})
