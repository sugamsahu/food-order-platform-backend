import { adminToken, bearer, closeDb, db, http, loginStaff } from '../helpers'

afterAll(closeDb)

const makeStaff = async (admin, overrides = {}) => {
  const email = overrides.email || `staff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`
  const res = await http().post('/api/v1/staff-users').set(bearer(admin))
    .send({ name: 'Temp Staff', email, password: 'password123', role: 'operator', ...overrides })
  expect(res.status).toBe(201)
  return res.body
}

// Leave the seeded accounts exactly as the other test files expect them.
const restoreSeedAccounts = async () => {
  await db.User.update({ role: 'admin', isActive: true }, { where: { email: 'admin@example.com' } })
  await db.User.update({ role: 'operator', isActive: true }, { where: { email: 'operator@example.com' } })
  await db.User.update({ isActive: false }, { where: { email: { [db.Sequelize.Op.like]: 'staff-%' } } })
}

describe('staff user administration', () => {
  let admin
  beforeAll(async () => { admin = await adminToken() })
  afterAll(restoreSeedAccounts)

  it('creates, reads, lists and searches staff users', async () => {
    const created = await makeStaff(admin, { name: 'Searchable Sam', email: 'staff-sam@example.com' })
    expect(created).toMatchObject({ name: 'Searchable Sam', role: 'operator', is_active: true })
    expect(created).not.toHaveProperty('password_hash')

    expect((await http().get(`/api/v1/staff-users/${created.id}`).set(bearer(admin))).body.email).toBe('staff-sam@example.com')
    const found = await http().get('/api/v1/staff-users?q=searchable').set(bearer(admin))
    expect(found.body.data.map((u) => u.email)).toContain('staff-sam@example.com')
    const operators = await http().get('/api/v1/staff-users?role=operator&is_active=true').set(bearer(admin))
    expect(operators.body.data.every((u) => u.role === 'operator' && u.is_active)).toBe(true)
  })

  it('rejects duplicate emails and weak input', async () => {
    const dup = await http().post('/api/v1/staff-users').set(bearer(admin))
      .send({ name: 'Dup', email: 'ADMIN@example.com', password: 'password123', role: 'operator' })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('EMAIL_TAKEN')

    const weak = await http().post('/api/v1/staff-users').set(bearer(admin)).send({ name: 'W', email: 'w@example.com', password: 'short', role: 'operator' })
    expect(weak.status).toBe(400)
    expect(weak.body.error.details.fields).toHaveProperty('password')
  })

  it('updates name, email and role', async () => {
    const staff = await makeStaff(admin)
    const res = await http().patch(`/api/v1/staff-users/${staff.id}`).set(bearer(admin)).send({ name: 'Renamed', role: 'admin' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Renamed', role: 'admin' })
    expect((await http().patch(`/api/v1/staff-users/${staff.id}`).set(bearer(admin)).send({})).status).toBe(400)
    const taken = await http().patch(`/api/v1/staff-users/${staff.id}`).set(bearer(admin)).send({ email: 'operator@example.com' })
    expect(taken.status).toBe(409)
    await http().patch(`/api/v1/staff-users/${staff.id}/deactivate`).set(bearer(admin))
  })

  it('deactivates and reactivates; deactivated users are locked out at once', async () => {
    const staff = await makeStaff(admin, { password: 'password123' })
    const token = await loginStaff(staff.email)

    const off = await http().patch(`/api/v1/staff-users/${staff.id}/deactivate`).set(bearer(admin))
    expect(off.body.is_active).toBe(false)
    expect((await http().get('/api/v1/auth/me').set(bearer(token))).status).toBe(401)

    const on = await http().patch(`/api/v1/staff-users/${staff.id}/activate`).set(bearer(admin))
    expect(on.body.is_active).toBe(true)
    expect((await loginStaff(staff.email)).length).toBeGreaterThan(10)
    await http().patch(`/api/v1/staff-users/${staff.id}/deactivate`).set(bearer(admin))
  })

  it('resets a password: the old one stops working and old sessions end', async () => {
    const staff = await makeStaff(admin, { password: 'old-password-1' })
    const oldToken = await loginStaff(staff.email, 'old-password-1')

    const reset = await http().post(`/api/v1/staff-users/${staff.id}/reset-password`).set(bearer(admin)).send({ password: 'new-password-2' })
    expect(reset.status).toBe(204)

    expect((await http().get('/api/v1/auth/me').set(bearer(oldToken))).status).toBe(401)
    const oldLogin = await http().post('/api/v1/auth/staff/login').send({ email: staff.email, password: 'old-password-1' })
    expect(oldLogin.status).toBe(401)
    expect((await loginStaff(staff.email, 'new-password-2')).length).toBeGreaterThan(10)

    const weak = await http().post(`/api/v1/staff-users/${staff.id}/reset-password`).set(bearer(admin)).send({ password: 'short' })
    expect(weak.status).toBe(400)
    await http().patch(`/api/v1/staff-users/${staff.id}/deactivate`).set(bearer(admin))
  })

  it('does not let you deactivate yourself', async () => {
    const me = (await http().get('/api/v1/auth/me').set(bearer(admin))).body.user
    const res = await http().patch(`/api/v1/staff-users/${me.id}/deactivate`).set(bearer(admin))
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('CANNOT_DEACTIVATE_SELF')
  })

  it('protects the last active administrator from demotion', async () => {
    await db.User.update({ isActive: false }, { where: { role: 'admin', email: { [db.Sequelize.Op.ne]: 'admin@example.com' } } })
    const me = (await http().get('/api/v1/auth/me').set(bearer(admin))).body.user
    const res = await http().patch(`/api/v1/staff-users/${me.id}`).set(bearer(admin)).send({ role: 'operator' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('LAST_ADMIN')
    expect((await db.User.findByPk(me.id)).role).toBe('admin')
  })

  it('two administrators cannot deactivate each other at the same time', async () => {
    await db.User.update({ isActive: false }, { where: { role: 'admin', email: { [db.Sequelize.Op.ne]: 'admin@example.com' } } })
    const second = await makeStaff(admin, { role: 'admin', password: 'password123' })
    const secondToken = await loginStaff(second.email)
    const firstId = (await http().get('/api/v1/auth/me').set(bearer(admin))).body.user.id

    const [a, b] = await Promise.all([
      http().patch(`/api/v1/staff-users/${second.id}/deactivate`).set(bearer(admin)),
      http().patch(`/api/v1/staff-users/${firstId}/deactivate`).set(bearer(secondToken))
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(await db.User.count({ where: { role: 'admin', isActive: true } })).toBe(1)
  })
})
