import jwt from 'jsonwebtoken'
import db from '../db/models'
import config from '../configs/app.config'
import { forbidden, unauthorized } from '../utils/ApiError'

export const signToken = (payload) => jwt.sign(payload, config.get('jwt.loginTokenSecret'), {
  expiresIn: config.get('jwt.loginTokenExpiry')
})

const decodeBearer = (req) => {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  try {
    return jwt.verify(header.slice(7), config.get('jwt.loginTokenSecret'))
  } catch (err) {
    return null
  }
}

// Staff and customer tokens share one signing secret, so every token carries a `type` that is
// checked here. A customer id must never be looked up as a staff id (or the reverse).
export const isStaffAuthenticated = async (req, res, next) => {
  try {
    const decoded = decodeBearer(req)
    if (!decoded || decoded.type !== 'staff') throw unauthorized('Missing or invalid token', 'INVALID_TOKEN')

    const user = await db.User.findByPk(decoded.id)
    if (!user || !user.isActive || decoded.tv !== user.tokenVersion) {
      throw unauthorized('Missing or invalid token', 'INVALID_TOKEN')
    }
    req.user = user
    next()
  } catch (err) {
    next(err)
  }
}

export const hasRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(forbidden('Your role does not allow this action', 'INSUFFICIENT_ROLE'))
  }
  next()
}

export const isCustomerAuthenticated = async (req, res, next) => {
  try {
    const decoded = decodeBearer(req)
    if (!decoded || decoded.type !== 'customer') throw unauthorized('Missing or invalid token', 'INVALID_TOKEN')

    const customer = await db.Customer.findByPk(decoded.id)
    if (!customer) throw unauthorized('Missing or invalid token', 'INVALID_TOKEN')
    req.customer = customer
    next()
  } catch (err) {
    next(err)
  }
}
