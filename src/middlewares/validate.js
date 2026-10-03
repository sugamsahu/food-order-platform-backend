import { ApiError } from '../utils/ApiError'

// Validates request parts with zod schemas and exposes the parsed values as req.valid.
// Unknown body keys are stripped, so a client cannot smuggle in fields such as prices.
export const validate = ({ body, query, params }) => (req, res, next) => {
  const fields = {}
  req.valid = {}
  for (const [part, schema] of Object.entries({ body, query, params })) {
    if (!schema) continue
    const result = schema.safeParse(part === 'body' ? (req.body ?? {}) : req[part])
    if (result.success) {
      req.valid[part] = result.data
    } else {
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || part
        ;(fields[key] = fields[key] || []).push(issue.message)
      }
    }
  }
  if (Object.keys(fields).length) {
    return next(new ApiError(400, 'VALIDATION_ERROR', 'Validation failed', { fields }))
  }
  next()
}
