import { adminToken, bearer, closeDb, db, http, loginCustomer, loginStaff, operatorToken } from '../helpers'

afterAll(closeDb)

describe('staff authentication', () => {
  it('signs in an administrator and an operator', async () => {
    const admin = await http().post('/api/v1/auth/staff/login').send({ email: 'admin@example.com', password: 'password123' })
    expect(admin.status).toBe(200)
    expect(admin.body.user).toMatchObject({ email: 'admin@example.com', role: 'admin', is_active: true })
    expect(admin.body.user).not.toHaveProperty('password_hash')

    const operator = await http().post('/api/v1/auth/staff/login').send({ email: 'operator@example.com', password: 'password123' })
    expect(operator.body.user.role).toBe('operator')
  })

  it('does not reveal whether an email exists', async () => {
    const wrongPassword = await http().post('/api/v1/auth/staff/login').send({ email: 'admin@example.com', password: 'wrong-password' })
    const unknownEmail = await http().post('/api/v1/auth/staff/login').send({ email: 'nobody@example.com', password: 'wrong-password' })
    expect(wrongPassword.status).toBe(401)
    expect(unknownEmail.status).toBe(401)
    expect(unknownEmail.body).toEqual(wrongPassword.body)
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS')
  })

  it('returns field errors for malformed login requests', async () => {
    const res = await http().post('/api/v1/auth/staff/login').send({ email: 'not-an-email' })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details.fields).toHaveProperty('email')
    expect(res.body.error.details.fields).toHaveProperty('password')
  })

  it('returns the signed-in user from /auth/me', async () => {
    const res = await http().get('/api/v1/auth/me').set(bearer(await operatorToken()))
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('operator@example.com')
  })

  it('rejects missing, malformed and garbage tokens', async () => {
    expect((await http().get('/api/v1/auth/me')).status).toBe(401)
    expect((await http().get('/api/v1/auth/me').set('Authorization', 'Token abc')).status).toBe(401)
    expect((await http().get('/api/v1/auth/me').set(bearer('not.a.jwt'))).status).toBe(401)
  })

  it('logout ends every session of that user', async () => {
    const first = await loginStaff('operator@example.com')
    const second = await loginStaff('operator@example.com')
    expect((await http().get('/api/v1/auth/me').set(bearer(first))).status).toBe(200)

    expect((await http().post('/api/v1/auth/logout').set(bearer(first))).status).toBe(204)

    expect((await http().get('/api/v1/auth/me').set(bearer(first))).status).toBe(401)
    expect((await http().get('/api/v1/auth/me').set(bearer(second))).status).toBe(401)
    // A fresh login works again.
    expect((await http().get('/api/v1/auth/me').set(bearer(await loginStaff('operator@example.com')))).status).toBe(200)
  })

  it('stops working immediately for deactivated users', async () => {
    const token = await loginStaff('operator@example.com')
    await db.User.update({ isActive: false }, { where: { email: 'operator@example.com' } })
    try {
      expect((await http().get('/api/v1/auth/me').set(bearer(token))).status).toBe(401)
      const login = await http().post('/api/v1/auth/staff/login').send({ email: 'operator@example.com', password: 'password123' })
      expect(login.status).toBe(401)
      expect(login.body.error.code).toBe('INVALID_CREDENTIALS')
    } finally {
      await db.User.update({ isActive: true }, { where: { email: 'operator@example.com' } })
    }
  })
})

describe('token types are not interchangeable', () => {
  it('rejects a customer token on staff routes', async () => {
    // Customer id 1 and staff id 1 both exist, so only the token type can tell them apart.
    const customer = await loginCustomer()
    for (const path of ['/api/v1/auth/me', '/api/v1/orders', '/api/v1/foods', '/api/v1/staff-users']) {
      const res = await http().get(path).set(bearer(customer))
      expect(res.status).toBe(401)
    }
  })

  it('rejects a staff token on customer routes', async () => {
    const admin = await adminToken()
    for (const path of ['/api/v1/mobile/foods', '/api/v1/mobile/orders']) {
      const res = await http().get(path).set(bearer(admin))
      expect(res.status).toBe(401)
    }
  })
})
