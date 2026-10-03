import bcrypt from 'bcrypt'
import db from '../db/models'
import config from '../configs/app.config'
import { signToken } from '../middlewares/auth'
import { unauthorized } from '../utils/ApiError'
import { toStaffUser } from '../serializers'

// Compared against when the email is unknown, so response time does not reveal whether it exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10)

export const staffLogin = async (req, res) => {
  const { email, password } = req.valid.body
  const user = await db.User.findOne({ where: { email } })
  const matches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH)

  // Same message for unknown email, wrong password and deactivated account.
  if (!user || !matches || !user.isActive) {
    throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS')
  }

  const token = signToken({ id: Number(user.id), type: 'staff', tv: user.tokenVersion })
  res.json({
    token,
    token_type: 'Bearer',
    expires_in: config.get('jwt.loginTokenExpiry'),
    user: toStaffUser(user)
  })
}

export const me = async (req, res) => {
  res.json({ user: toStaffUser(req.user) })
}

// Ends every session for this user: bumping token_version invalidates all previously issued tokens.
export const logout = async (req, res) => {
  await req.user.update({ tokenVersion: req.user.tokenVersion + 1 })
  res.status(204).end()
}
