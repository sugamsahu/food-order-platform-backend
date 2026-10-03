import config from './configs/app.config'
import { fromCents, toCents } from './utils/money'

const num = (v) => (v === null || v === undefined ? null : Number(v))
const iso = (d) => (d ? new Date(d).toISOString() : null)
const money = (v) => fromCents(toCents(v))
const currency = () => config.get('restaurant.currency')

export const toStaffUser = (u) => ({
  id: num(u.id),
  name: u.name,
  email: u.email,
  role: u.role,
  is_active: u.isActive,
  created_at: iso(u.createdAt),
  updated_at: iso(u.updatedAt)
})

export const toCustomer = (c) => ({ id: num(c.id), name: c.name, email: c.email, phone: c.phone || null })

export const toFood = (f) => ({
  id: num(f.id),
  name: f.name,
  description: f.description || null,
  category: f.category,
  price: money(f.price),
  currency: f.currency,
  image_url: f.imageUrl || null,
  is_available: f.isAvailable,
  archived_at: iso(f.archivedAt),
  created_at: iso(f.createdAt),
  updated_at: iso(f.updatedAt)
})

export const toOrderSummary = (o) => ({
  id: num(o.id),
  reference: o.reference,
  status: o.status,
  fulfillment_type: o.fulfillmentType,
  total: money(o.total),
  currency: currency(),
  created_at: iso(o.createdAt),
  updated_at: iso(o.updatedAt),
  customer: o.customer ? { id: num(o.customer.id), name: o.customer.name, email: o.customer.email } : null
})

const toItem = (i) => ({
  id: num(i.id),
  food_id: num(i.foodId),
  food_name: i.foodNameSnapshot,
  unit_price: money(i.unitPriceSnapshot),
  quantity: i.quantity,
  line_total: money(i.lineTotal)
})

// actors: { staff: Map(id -> name), customer: Map(id -> name) }
export const toOrderDetail = (o, actors) => ({
  ...toOrderSummary(o),
  subtotal: money(o.subtotal),
  delivery_address: o.deliveryAddress || null,
  notes: o.notes || null,
  customer: o.customer ? toCustomer(o.customer) : null,
  items: (o.items || []).map(toItem),
  status_history: (o.statusHistory || []).map((h) => ({
    id: num(h.id),
    from_status: h.fromStatus,
    to_status: h.toStatus,
    actor_type: h.actorType,
    actor_id: num(h.actorId),
    actor_name: actors && actors[h.actorType] ? actors[h.actorType].get(String(h.actorId)) || null : null,
    reason: h.reason || null,
    created_at: iso(h.createdAt)
  }))
})

// What a customer may see of their own order (no staff identities).
export const toMobileOrder = (o) => ({
  id: num(o.id),
  reference: o.reference,
  status: o.status,
  fulfillment_type: o.fulfillmentType,
  delivery_address: o.deliveryAddress || null,
  notes: o.notes || null,
  subtotal: money(o.subtotal),
  total: money(o.total),
  currency: currency(),
  created_at: iso(o.createdAt),
  items: (o.items || []).map(toItem),
  status_history: (o.statusHistory || []).map((h) => ({
    from_status: h.fromStatus,
    to_status: h.toStatus,
    reason: h.reason || null,
    created_at: iso(h.createdAt)
  }))
})
