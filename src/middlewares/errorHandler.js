import { ApiError } from '../utils/ApiError'

const body = (code, message, details = {}) => ({ error: { code, message, details } })

export const notFoundHandler = (req, res) => {
  res.status(404).json(body('NOT_FOUND', 'Route not found'))
}

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json(body(err.code, err.message, err.details))
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(body('INVALID_JSON', 'Request body is not valid JSON'))
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json(body('PAYLOAD_TOO_LARGE', 'Request body is too large'))
  }
  if (err.code === 'CORS_FORBIDDEN') {
    return res.status(403).json(body('CORS_FORBIDDEN', err.message))
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json(body('CONFLICT', 'A record with these values already exists'))
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(409).json(body('CONFLICT', 'The record is referenced by other data'))
  }
  // Never leak internals; log the cause (without request bodies, so no passwords or tokens).
  console.error(`[error] ${req.method} ${req.path}:`, err)
  res.status(500).json(body('INTERNAL_ERROR', 'Something went wrong'))
}
