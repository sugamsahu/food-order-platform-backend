import { Op } from 'sequelize'
import db from '../db/models'
import config from '../configs/app.config'
import { conflict, notFound } from '../utils/ApiError'
import { likePattern, pageResponse, toPageOptions } from '../utils/pagination'
import { toFood } from '../serializers'

const findOr404 = async (id) => {
  const food = await db.Food.findByPk(id)
  if (!food) throw notFound('Food not found')
  return food
}

const assertNotArchived = (food) => {
  if (food.archivedAt) throw conflict('This food is archived. Restore it first.', 'FOOD_ARCHIVED')
}

// Maps API (snake_case) fields to model attributes.
const toAttributes = (b) => {
  const attrs = {}
  if (b.name !== undefined) attrs.name = b.name
  if (b.description !== undefined) attrs.description = b.description || null
  if (b.category !== undefined) attrs.category = b.category
  if (b.price !== undefined) attrs.price = b.price
  if (b.image_url !== undefined) attrs.imageUrl = b.image_url || null
  if (b.is_available !== undefined) attrs.isAvailable = b.is_available
  return attrs
}

export const list = async (req, res) => {
  const { q, availability, category, include_archived: includeArchived } = req.valid.query
  const where = {}
  if (!includeArchived) where.archivedAt = null
  if (q) where[Op.or] = [{ name: { [Op.iLike]: likePattern(q) } }, { description: { [Op.iLike]: likePattern(q) } }]
  if (availability !== 'all') where.isAvailable = availability === 'available'
  if (category) where.category = category

  const { rows, count } = await db.Food.findAndCountAll({
    where,
    order: [['name', 'ASC'], ['id', 'ASC']],
    ...toPageOptions(req.valid.query)
  })
  res.json(pageResponse(rows.map(toFood), count, req.valid.query))
}

export const categories = async (req, res) => {
  const rows = await db.Food.findAll({
    attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('category')), 'category']],
    where: { archivedAt: null },
    order: [['category', 'ASC']],
    raw: true
  })
  res.json({ data: rows.map((r) => r.category) })
}

export const get = async (req, res) => {
  res.json(toFood(await findOr404(req.valid.params.id)))
}

export const create = async (req, res) => {
  const food = await db.Food.create({ ...toAttributes(req.valid.body), currency: config.get('restaurant.currency') })
  res.status(201).json(toFood(food))
}

export const update = async (req, res) => {
  const food = await findOr404(req.valid.params.id)
  assertNotArchived(food)
  await food.update(toAttributes(req.valid.body))
  res.json(toFood(food))
}

export const setAvailability = async (req, res) => {
  const food = await findOr404(req.valid.params.id)
  assertNotArchived(food)
  await food.update({ isAvailable: req.valid.body.is_available })
  res.json(toFood(food))
}

// Soft delete. The food disappears from lists and cannot be ordered, while existing orders keep
// their lines (and the foreign key from order_items is RESTRICT, so a hard delete is impossible).
export const archive = async (req, res) => {
  const food = await findOr404(req.valid.params.id)
  if (!food.archivedAt) await food.update({ archivedAt: new Date(), isAvailable: false })
  res.json(toFood(food))
}

export const restore = async (req, res) => {
  const food = await findOr404(req.valid.params.id)
  if (food.archivedAt) await food.update({ archivedAt: null })
  res.json(toFood(food))
}
