import request from 'supertest'
import app from '../src/app'
import db from '../src/db/models'

export const http = () => request(app)
export const bearer = (token) => ({ Authorization: `Bearer ${token}` })
export const PASSWORD = 'password123'

export const loginStaff = async (email, password = PASSWORD) => {
  const res = await request(app).post('/api/v1/auth/staff/login').send({ email, password })
  if (res.status !== 200) throw new Error(`staff login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body.token
}

export const loginCustomer = async (email = 'customer@example.com', password = PASSWORD) => {
  const res = await request(app).post('/api/v1/mobile/auth/login').send({ email, password })
  if (res.status !== 200) throw new Error(`customer login failed for ${email}: ${res.status}`)
  return res.body.token
}

export const adminToken = () => loginStaff('admin@example.com')
export const operatorToken = () => loginStaff('operator@example.com')

export const foodByName = (name) => db.Food.findOne({ where: { name } })

// Places an order as a customer; returns the response body.
export const placeOrder = async (token, items, extra = {}) => {
  const res = await request(app).post('/api/v1/mobile/orders').set(bearer(token)).send({ items, ...extra })
  if (res.status !== 201) throw new Error(`placeOrder failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body
}

export const closeDb = () => db.sequelize.close()
export { db }
