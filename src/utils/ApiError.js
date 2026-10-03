// An error that carries an HTTP status and a stable machine-readable code.
export class ApiError extends Error {
  constructor (status, code, message, details = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message, details, code = 'BAD_REQUEST') => new ApiError(400, code, message, details)
export const unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED') => new ApiError(401, code, message)
export const forbidden = (message = 'You do not have permission to do this', code = 'FORBIDDEN') => new ApiError(403, code, message)
export const notFound = (message = 'Resource not found', code = 'NOT_FOUND') => new ApiError(404, code, message)
export const conflict = (message, code = 'CONFLICT', details = {}) => new ApiError(409, code, message, details)
