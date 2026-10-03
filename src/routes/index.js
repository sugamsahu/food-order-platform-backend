import express from 'express'
import rateLimit from 'express-rate-limit'
import db from '../db/models'
import { validate } from '../middlewares/validate'
import { hasRole, isCustomerAuthenticated, isStaffAuthenticated } from '../middlewares/auth'
import * as s from '../validation/schemas'
import * as auth from '../controllers/auth.controller'
import * as staffUsers from '../controllers/staffUsers.controller'
import * as foods from '../controllers/foods.controller'
import * as orders from '../controllers/orders.controller'
import * as mobile from '../controllers/mobile.controller'

const router = express.Router()

// Only failed attempts count, so legitimate users are never locked out by their own successes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT_MAX || 5),
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: { code: 'TOO_MANY_REQUESTS', message: 'Too many failed login attempts. Try again later.', details: {} }
  })
})

router.get('/health-check', async (req, res) => {
  try {
    await db.sequelize.authenticate()
    res.json({ status: 'UP', uptime: process.uptime(), timestamp: Date.now() })
  } catch (err) {
    res.status(503).json({ status: 'DOWN' })
  }
})

const v1 = express.Router()
router.use('/api/v1', v1)

// ---- Staff authentication
v1.post('/auth/staff/login', loginLimiter, validate({ body: s.loginBody }), auth.staffLogin)
v1.get('/auth/me', isStaffAuthenticated, auth.me)
v1.post('/auth/logout', isStaffAuthenticated, auth.logout)

// ---- Staff users (administrator only)
const staffUsersRouter = express.Router()
staffUsersRouter.use(isStaffAuthenticated, hasRole('admin'))
staffUsersRouter.get('/', validate({ query: s.staffListQuery }), staffUsers.list)
staffUsersRouter.post('/', validate({ body: s.staffCreateBody }), staffUsers.create)
staffUsersRouter.get('/:id', validate({ params: s.idParams }), staffUsers.get)
staffUsersRouter.patch('/:id', validate({ params: s.idParams, body: s.staffUpdateBody }), staffUsers.update)
staffUsersRouter.patch('/:id/deactivate', validate({ params: s.idParams }), staffUsers.deactivate)
staffUsersRouter.patch('/:id/activate', validate({ params: s.idParams }), staffUsers.activate)
staffUsersRouter.post('/:id/reset-password', validate({ params: s.idParams, body: s.resetPasswordBody }), staffUsers.resetPassword)
v1.use('/staff-users', staffUsersRouter)

// ---- Foods (administrator and operator; archiving is administrator only)
const foodsRouter = express.Router()
foodsRouter.use(isStaffAuthenticated)
foodsRouter.get('/', validate({ query: s.foodListQuery }), foods.list)
foodsRouter.get('/categories', foods.categories)
foodsRouter.post('/', validate({ body: s.foodCreateBody }), foods.create)
foodsRouter.get('/:id', validate({ params: s.idParams }), foods.get)
foodsRouter.patch('/:id', validate({ params: s.idParams, body: s.foodUpdateBody }), foods.update)
foodsRouter.patch('/:id/availability', validate({ params: s.idParams, body: s.availabilityBody }), foods.setAvailability)
foodsRouter.patch('/:id/archive', hasRole('admin'), validate({ params: s.idParams }), foods.archive)
foodsRouter.patch('/:id/restore', hasRole('admin'), validate({ params: s.idParams }), foods.restore)
v1.use('/foods', foodsRouter)

// ---- Orders (administrator and operator)
const ordersRouter = express.Router()
ordersRouter.use(isStaffAuthenticated)
ordersRouter.get('/metrics', orders.metrics)
ordersRouter.get('/', validate({ query: s.orderListQuery }), orders.list)
ordersRouter.get('/:id', validate({ params: s.idParams }), orders.get)
ordersRouter.patch('/:id', validate({ params: s.idParams, body: s.orderPatchBody }), orders.patch)
ordersRouter.post('/:id/transitions', validate({ params: s.idParams, body: s.transitionBody }), orders.transition)
v1.use('/orders', ordersRouter)

// ---- Mobile (customer token)
const mobileRouter = express.Router()
mobileRouter.post('/auth/login', loginLimiter, validate({ body: s.loginBody }), mobile.login)
mobileRouter.use(isCustomerAuthenticated)
mobileRouter.get('/foods', validate({ query: s.mobileFoodListQuery }), mobile.listFoods)
mobileRouter.post('/orders', validate({ body: s.mobileOrderBody }), mobile.createOrder)
mobileRouter.get('/orders', validate({ query: s.mobileOrderListQuery }), mobile.listOrders)
mobileRouter.get('/orders/:id', validate({ params: s.idParams }), mobile.getOrder)
v1.use('/mobile', mobileRouter)

export default router
