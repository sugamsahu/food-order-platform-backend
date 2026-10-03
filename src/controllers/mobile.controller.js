import bcrypt from 'bcrypt'
import { Op } from 'sequelize'
import db from '../db/models'
import { signToken } from '../middlewares/auth'
import { ApiError, notFound, unauthorized } from '../utils/ApiError'
import { likePattern, pageResponse, toPageOptions } from '../utils/pagination'
import { fromCents, toCents } from '../utils/money'
import { toCustomer, toFood, toMobileOrder } from '../serializers'

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

export const login = async (req, res) => {
  const { email, password } = req.valid.body
  const customer = await db.Customer.findOne({ where: { email } })
  const matches = await bcrypt.compare(password, customer ? customer.passwordHash : DUMMY_HASH)
  if (!customer || !matches) throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS')

  res.json({ token: signToken({ id: Number(customer.id), type: 'customer' }), token_type: 'Bearer', customer: toCustomer(customer) })
}

// Published foods only: available and not archived.
export const listFoods = async (req, res) => {
  const { q, category } = req.valid.query
  const where = { isAvailable: true, archivedAt: null }
  if (q) where.name = { [Op.iLike]: likePattern(q) }
  if (category) where.category = category

  const { rows, count } = await db.Food.findAndCountAll({ where, order: [['name', 'ASC'], ['id', 'ASC']], ...toPageOptions(req.valid.query) })
  res.json(pageResponse(rows.map(toFood), count, req.valid.query))
}

// Creates an order. Prices are never read from the request: the server loads current prices,
// snapshots them on each line, and computes the totals in integer cents.
export const createOrder = async (req, res) => {
  const { items, fulfillment_type: fulfillmentType, delivery_address: deliveryAddress, notes } = req.valid.body

  // Merge duplicate lines for the same food.
  const quantities = new Map()
  for (const { food_id: foodId, quantity } of items) quantities.set(foodId, (quantities.get(foodId) || 0) + quantity)
  if ([...quantities.values()].some((q) => q > 99)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', { fields: { items: ['Quantity per food must be at most 99'] } })
  }
  const foodIds = [...quantities.keys()].sort((a, b) => a - b)

  const orderId = await db.sequelize.transaction(async (t) => {
    // Shared row locks stop staff from archiving or changing a food while the order is created.
    const foods = await db.Food.findAll({ where: { id: foodIds }, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.SHARE })
    const orderable = new Map(foods.filter((f) => f.isAvailable && !f.archivedAt).map((f) => [Number(f.id), f]))
    const unavailable = foodIds.filter((id) => !orderable.has(id))
    if (unavailable.length) {
      throw new ApiError(400, 'FOOD_UNAVAILABLE', 'Some foods are unavailable or do not exist', { food_ids: unavailable })
    }

    const lines = foodIds.map((id) => {
      const food = orderable.get(id)
      const quantity = quantities.get(id)
      return { food, quantity, lineCents: toCents(food.price) * quantity }
    })
    const totalCents = lines.reduce((sum, l) => sum + l.lineCents, 0)

    const [[{ n }]] = await db.sequelize.query("SELECT nextval('order_reference_seq') AS n", { transaction: t })
    const order = await db.Order.create({
      reference: `FO-${String(n).padStart(6, '0')}`,
      customerId: req.customer.id,
      status: 'Placed',
      fulfillmentType,
      deliveryAddress: fulfillmentType === 'delivery' ? deliveryAddress : null,
      notes: notes || null,
      subtotal: fromCents(totalCents),
      total: fromCents(totalCents)
    }, { transaction: t })

    await db.OrderItem.bulkCreate(lines.map((l) => ({
      orderId: order.id,
      foodId: l.food.id,
      foodNameSnapshot: l.food.name,
      unitPriceSnapshot: l.food.price,
      quantity: l.quantity,
      lineTotal: fromCents(l.lineCents)
    })), { transaction: t })

    await db.OrderStatusHistory.create({
      orderId: order.id, fromStatus: null, toStatus: 'Placed', actorType: 'customer', actorId: req.customer.id
    }, { transaction: t })
    return order.id
  })

  const order = await loadOwnOrder(orderId, req.customer.id)
  res.status(201).json(toMobileOrder(order))
}

const ownOrderInclude = () => [
  { model: db.OrderItem, as: 'items' },
  { model: db.OrderStatusHistory, as: 'statusHistory' }
]

// Ownership is part of the query: another customer's order is indistinguishable from a missing one.
const loadOwnOrder = async (id, customerId) => {
  const order = await db.Order.findOne({
    where: { id, customerId },
    include: ownOrderInclude(),
    order: [[{ model: db.OrderItem, as: 'items' }, 'id', 'ASC'], [{ model: db.OrderStatusHistory, as: 'statusHistory' }, 'id', 'ASC']]
  })
  if (!order) throw notFound('Order not found')
  return order
}

export const listOrders = async (req, res) => {
  const where = { customerId: req.customer.id }
  if (req.valid.query.status) where.status = req.valid.query.status

  const { rows, count } = await db.Order.findAndCountAll({
    where,
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    distinct: true,
    ...toPageOptions(req.valid.query)
  })
  // Load lines and history for just this page of orders.
  const full = rows.length
    ? await db.Order.findAll({
      where: { id: rows.map((r) => r.id) },
      include: ownOrderInclude(),
      order: [['createdAt', 'DESC'], ['id', 'DESC'], [{ model: db.OrderItem, as: 'items' }, 'id', 'ASC'], [{ model: db.OrderStatusHistory, as: 'statusHistory' }, 'id', 'ASC']]
    })
    : []
  res.json(pageResponse(full.map(toMobileOrder), count, req.valid.query))
}

export const getOrder = async (req, res) => {
  res.json(toMobileOrder(await loadOwnOrder(req.valid.params.id, req.customer.id)))
}
