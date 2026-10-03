import { z } from 'zod'
import { ORDER_STATUSES } from '../domain/orderStateMachine'
import { paginationSchema } from '../utils/pagination'

const text = (max) => z.string().trim().max(max)
const requiredText = (max) => z.string().trim().min(1, 'Is required').max(max)
const id = z.coerce.number().int().positive()
const bool = z.enum(['true', 'false']).transform((v) => v === 'true')
const email = z.string().trim().toLowerCase().pipe(z.email('Must be a valid email address'))
const password = z.string().min(8, 'Must be at least 8 characters').max(72, 'Must be at most 72 characters')

// Decimal money: up to 8 integer digits and 2 decimals, strictly positive. Accepts "12.5" or 12.5.
const price = z.union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,8}(\.\d{1,2})?$/.test(v), 'Must be a number with at most 2 decimals')
  .refine((v) => Number(v) > 0, 'Must be greater than zero')

const atLeastOne = (schema) => schema.refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update')

export const idParams = z.object({ id })

// ---- auth
export const loginBody = z.object({ email, password: z.string().min(1, 'Is required').max(200) })

// ---- staff users
export const staffListQuery = paginationSchema.extend({
  q: text(100).optional(),
  role: z.enum(['admin', 'operator']).optional(),
  is_active: bool.optional()
})
export const staffCreateBody = z.object({ name: requiredText(100), email, password, role: z.enum(['admin', 'operator']) })
export const staffUpdateBody = atLeastOne(z.object({
  name: requiredText(100).optional(),
  email: email.optional(),
  role: z.enum(['admin', 'operator']).optional()
}))
export const resetPasswordBody = z.object({ password })

// ---- foods
const foodFields = {
  name: requiredText(120),
  description: text(1000).nullable(),
  category: requiredText(60),
  price,
  image_url: z.url({ protocol: /^https?$/, message: 'Must be an http(s) URL' }).max(2000).nullable(),
  is_available: z.boolean()
}
export const foodListQuery = paginationSchema.extend({
  q: text(100).optional(),
  availability: z.enum(['all', 'available', 'unavailable']).default('all'),
  category: text(60).optional(),
  include_archived: bool.default(false)
})
export const foodCreateBody = z.object({
  name: foodFields.name,
  description: foodFields.description.optional(),
  category: foodFields.category.default('Uncategorized'),
  price: foodFields.price,
  image_url: foodFields.image_url.optional(),
  is_available: foodFields.is_available.default(true)
})
export const foodUpdateBody = atLeastOne(z.object({
  name: foodFields.name.optional(),
  description: foodFields.description.optional(),
  category: foodFields.category.optional(),
  price: foodFields.price.optional(),
  image_url: foodFields.image_url.optional(),
  is_available: foodFields.is_available.optional()
}))
export const availabilityBody = z.object({ is_available: z.boolean() })

// ---- orders (staff)
const status = z.enum(ORDER_STATUSES)
const fulfillment = z.enum(['pickup', 'delivery'])
export const orderListQuery = paginationSchema.extend({
  q: text(100).optional(),
  status: status.optional(),
  fulfillment_type: fulfillment.optional()
})
export const orderPatchBody = atLeastOne(z.object({
  notes: text(1000).nullable().optional(),
  fulfillment_type: fulfillment.optional(),
  delivery_address: text(500).nullable().optional()
}))
export const transitionBody = z.object({
  to: status,
  from: status.optional(),
  reason: text(255).optional()
}).refine((v) => v.to !== 'Cancelled' || (v.reason && v.reason.length > 0), {
  path: ['reason'],
  message: 'A reason is required when cancelling an order'
})

// ---- mobile
export const mobileOrderListQuery = paginationSchema.extend({ status: status.optional() })
export const mobileFoodListQuery = paginationSchema.extend({ q: text(100).optional(), category: text(60).optional() })
export const mobileOrderBody = z.object({
  items: z.array(z.object({
    food_id: id,
    quantity: z.number().int().min(1).max(99)
  })).min(1, 'Add at least one item').max(50),
  fulfillment_type: fulfillment.default('pickup'),
  delivery_address: text(500).nullable().optional(),
  notes: text(500).nullable().optional()
}).refine((v) => v.fulfillment_type !== 'delivery' || (v.delivery_address && v.delivery_address.length > 0), {
  path: ['delivery_address'],
  message: 'A delivery address is required for delivery orders'
})
