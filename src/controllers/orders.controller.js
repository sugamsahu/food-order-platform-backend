import { Op } from 'sequelize'
import db from '../db/models'
import { ApiError, conflict, notFound } from '../utils/ApiError'
import { likePattern, pageResponse, toPageOptions } from '../utils/pagination'
import { ORDER_STATUSES, TERMINAL_STATUSES, checkTransition } from '../domain/orderStateMachine'
import { toOrderDetail, toOrderSummary } from '../serializers'

const detailInclude = () => [
  { model: db.Customer, as: 'customer' },
  { model: db.OrderItem, as: 'items' },
  { model: db.OrderStatusHistory, as: 'statusHistory' }
]

// Resolves actor ids on the history rows to display names.
const loadActors = async (order) => {
  const ids = (type) => [...new Set((order.statusHistory || []).filter((h) => h.actorType === type && h.actorId).map((h) => String(h.actorId)))]
  const toMap = (rows) => new Map(rows.map((r) => [String(r.id), r.name]))
  const [staff, customer] = await Promise.all([
    ids('staff').length ? db.User.findAll({ where: { id: ids('staff') }, attributes: ['id', 'name'] }) : [],
    ids('customer').length ? db.Customer.findAll({ where: { id: ids('customer') }, attributes: ['id', 'name'] }) : []
  ])
  return { staff: toMap(staff), customer: toMap(customer) }
}

export const loadOrderDetail = async (id, options = {}) => {
  const order = await db.Order.findByPk(id, {
    include: detailInclude(),
    order: [[{ model: db.OrderItem, as: 'items' }, 'id', 'ASC'], [{ model: db.OrderStatusHistory, as: 'statusHistory' }, 'id', 'ASC']],
    ...options
  })
  if (!order) throw notFound('Order not found')
  return order
}

const sendDetail = async (res, id, status = 200) => {
  const order = await loadOrderDetail(id)
  res.status(status).json(toOrderDetail(order, await loadActors(order)))
}

export const metrics = async (req, res) => {
  const rows = await db.Order.findAll({
    attributes: ['status', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']],
    group: ['status'],
    raw: true
  })
  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]))
  let total = 0
  for (const r of rows) {
    counts[r.status] = Number(r.count)
    total += Number(r.count)
  }
  res.json({ counts, total })
}

export const list = async (req, res) => {
  const { q, status, fulfillment_type: fulfillmentType } = req.valid.query
  const where = {}
  if (status) where.status = status
  if (fulfillmentType) where.fulfillmentType = fulfillmentType
  if (q) {
    const like = { [Op.iLike]: likePattern(q) }
    where[Op.or] = [{ reference: like }, { '$customer.name$': like }, { '$customer.email$': like }]
  }

  const { rows, count } = await db.Order.findAndCountAll({
    where,
    include: [{ model: db.Customer, as: 'customer', required: true }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']], // newest first
    ...toPageOptions(req.valid.query)
  })
  res.json(pageResponse(rows.map(toOrderSummary), count, req.valid.query))
}

export const get = async (req, res) => {
  await sendDetail(res, req.valid.params.id)
}

// Staff may edit notes and fulfillment details. Items, quantities and prices are never editable.
export const patch = async (req, res) => {
  const { notes, fulfillment_type: fulfillmentType, delivery_address: deliveryAddress } = req.valid.body
  await db.sequelize.transaction(async (t) => {
    const order = await db.Order.findByPk(req.valid.params.id, { transaction: t, lock: t.LOCK.UPDATE })
    if (!order) throw notFound('Order not found')

    const touchesFulfillment = fulfillmentType !== undefined || deliveryAddress !== undefined
    if (touchesFulfillment && (TERMINAL_STATUSES.includes(order.status) || order.status === 'Ready')) {
      throw conflict(`Fulfillment details can no longer be changed for a ${order.status} order`, 'ORDER_LOCKED')
    }

    const next = {
      fulfillmentType: fulfillmentType ?? order.fulfillmentType,
      deliveryAddress: deliveryAddress !== undefined ? deliveryAddress || null : order.deliveryAddress
    }
    if (next.fulfillmentType === 'pickup') next.deliveryAddress = null
    if (next.fulfillmentType === 'delivery' && !next.deliveryAddress) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', {
        fields: { delivery_address: ['A delivery address is required for delivery orders'] }
      })
    }

    const changes = { ...next }
    if (notes !== undefined) changes.notes = notes || null
    await order.update(changes, { transaction: t })
  })
  await sendDetail(res, req.valid.params.id)
}

// Moves an order along the workflow. The order row is locked for the duration of the transaction,
// so two simultaneous requests are serialized: the second sees the new status and is rejected.
export const transition = async (req, res) => {
  const { to, from, reason } = req.valid.body
  await db.sequelize.transaction(async (t) => {
    const order = await db.Order.findByPk(req.valid.params.id, { transaction: t, lock: t.LOCK.UPDATE })
    if (!order) throw notFound('Order not found')

    if (from && from !== order.status) {
      throw conflict(`The order is now ${order.status}, not ${from}`, 'STATE_CONFLICT', { current_status: order.status })
    }
    const problem = checkTransition(order.status, to)
    if (problem) {
      throw conflict(problem.message, problem.code, { current_status: order.status, requested_status: to })
    }

    const fromStatus = order.status
    await order.update({ status: to }, { transaction: t })
    await db.OrderStatusHistory.create({
      orderId: order.id,
      fromStatus,
      toStatus: to,
      actorType: 'staff',
      actorId: req.user.id,
      reason: to === 'Cancelled' ? reason : null
    }, { transaction: t })
  })
  await sendDetail(res, req.valid.params.id)
}
