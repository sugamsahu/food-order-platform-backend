import { closeDb, http } from '../helpers'

afterAll(closeDb)

describe('login rate limiting', () => {
  it('blocks further attempts after repeated failures, then also blocks correct passwords', async () => {
    const codes = []
    for (let i = 0; i < 7; i++) {
      const res = await http().post('/api/v1/auth/staff/login').send({ email: 'admin@example.com', password: 'wrong-password' })
      codes.push(res.status)
    }
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401])
    expect(codes.slice(5)).toEqual([429, 429])

    const res = await http().post('/api/v1/auth/staff/login').send({ email: 'admin@example.com', password: 'password123' })
    expect(res.status).toBe(429)
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS')
  })
})
