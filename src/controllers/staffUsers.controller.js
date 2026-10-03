import bcrypt from 'bcrypt'
import { Op } from 'sequelize'
import db from '../db/models'
import { ApiError, conflict, notFound } from '../utils/ApiError'
import { likePattern, pageResponse, toPageOptions } from '../utils/pagination'
import { toStaffUser } from '../serializers'

const findOr404 = async (id, options = {}) => {
  const user = await db.User.findByPk(id, options)
  if (!user) throw notFound('Staff user not found')
  return user
}

// Lock order matters: every request that may remove an administrator first locks ALL active admin
// rows in id order, and only then the target row. A fixed order cannot deadlock, and it makes two
// concurrent requests (for example two admins deactivating each other) run one after the other,
// so the last-administrator check always sees committed data.
const lockActiveAdmins = (transaction) => db.User.findAll({
  where: { role: 'admin', isActive: true },
  order: [['id', 'ASC']],
  transaction,
  lock: transaction.LOCK.UPDATE
})

export const list = async (req, res) => {
  const { q, role, is_active: isActive } = req.valid.query
  const where = {}
  if (q) where[Op.or] = [{ name: { [Op.iLike]: likePattern(q) } }, { email: { [Op.iLike]: likePattern(q) } }]
  if (role) where.role = role
  if (isActive !== undefined) where.isActive = isActive

  const { rows, count } = await db.User.findAndCountAll({ where, order: [['id', 'ASC']], ...toPageOptions(req.valid.query) })
  res.json(pageResponse(rows.map(toStaffUser), count, req.valid.query))
}

export const create = async (req, res) => {
  const { name, email, password, role } = req.valid.body
  if (await db.User.findOne({ where: { email } })) {
    throw conflict('A staff user with this email already exists', 'EMAIL_TAKEN')
  }
  const user = await db.User.create({ name, email, role, passwordHash: await bcrypt.hash(password, 10) })
  res.status(201).json(toStaffUser(user))
}

export const get = async (req, res) => {
  res.json(toStaffUser(await findOr404(req.valid.params.id)))
}

export const update = async (req, res) => {
  const changes = req.valid.body
  // Respond only after the transaction has committed, so the client never sees (or acts on) state
  // that is not yet visible to other requests.
  const updated = await db.sequelize.transaction(async (t) => {
    const admins = await lockActiveAdmins(t)
    const user = await findOr404(req.valid.params.id, { transaction: t, lock: t.LOCK.UPDATE })

    if (changes.email && changes.email !== user.email) {
      if (await db.User.findOne({ where: { email: changes.email }, transaction: t })) {
        throw conflict('A staff user with this email already exists', 'EMAIL_TAKEN')
      }
    }
    const demotingAdmin = user.role === 'admin' && user.isActive && changes.role && changes.role !== 'admin'
    if (demotingAdmin && admins.filter((a) => String(a.id) !== String(user.id)).length === 0) {
      throw conflict('The last active administrator cannot be demoted', 'LAST_ADMIN')
    }
    await user.update(changes, { transaction: t })
    return user
  })
  res.json(toStaffUser(updated))
}

export const deactivate = async (req, res) => {
  const deactivated = await db.sequelize.transaction(async (t) => {
    const admins = await lockActiveAdmins(t)
    const user = await findOr404(req.valid.params.id, { transaction: t, lock: t.LOCK.UPDATE })
    if (String(user.id) === String(req.user.id)) {
      throw new ApiError(400, 'CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account')
    }
    if (user.role === 'admin' && user.isActive && admins.filter((a) => String(a.id) !== String(user.id)).length === 0) {
      throw conflict('The last active administrator cannot be deactivated', 'LAST_ADMIN')
    }
    await user.update({ isActive: false, tokenVersion: user.tokenVersion + 1 }, { transaction: t })
    return user
  })
  res.json(toStaffUser(deactivated))
}

export const activate = async (req, res) => {
  const user = await findOr404(req.valid.params.id)
  await user.update({ isActive: true })
  res.json(toStaffUser(user))
}

// An administrator sets a new password for a staff user. All of that user's sessions end.
export const resetPassword = async (req, res) => {
  const user = await findOr404(req.valid.params.id)
  await user.update({
    passwordHash: await bcrypt.hash(req.valid.body.password, 10),
    tokenVersion: user.tokenVersion + 1
  })
  res.status(204).end()
}
