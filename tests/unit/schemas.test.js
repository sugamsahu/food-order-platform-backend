import { foodCreateBody, mobileOrderBody, transitionBody, staffCreateBody } from '../../src/validation/schemas'

const fields = (result) => Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]))

describe('request validation schemas', () => {
  it('requires a positive price with at most two decimals', () => {
    expect(foodCreateBody.safeParse({ name: 'Soup', price: '5.50' }).success).toBe(true)
    expect(foodCreateBody.safeParse({ name: 'Soup', price: 5.5 }).success).toBe(true)
    for (const bad of ['0', '-1', '1.234', 'abc', '', 1e12]) {
      const r = foodCreateBody.safeParse({ name: 'Soup', price: bad })
      expect(r.success).toBe(false)
      expect(fields(r)).toHaveProperty('price')
    }
  })

  it('requires a name', () => {
    const r = foodCreateBody.safeParse({ name: '   ', price: '1.00' })
    expect(fields(r)).toHaveProperty('name')
  })

  it('strips client-supplied prices from order lines', () => {
    const r = mobileOrderBody.parse({ items: [{ food_id: 1, quantity: 2, unit_price: '0.01' }], fulfillment_type: 'pickup' })
    expect(r.items[0]).toEqual({ food_id: 1, quantity: 2 })
  })

  it('rejects empty orders, bad quantities and delivery without address', () => {
    expect(mobileOrderBody.safeParse({ items: [] }).success).toBe(false)
    expect(mobileOrderBody.safeParse({ items: [{ food_id: 1, quantity: 0 }] }).success).toBe(false)
    expect(mobileOrderBody.safeParse({ items: [{ food_id: 1, quantity: 1.5 }] }).success).toBe(false)
    const r = mobileOrderBody.safeParse({ items: [{ food_id: 1, quantity: 1 }], fulfillment_type: 'delivery' })
    expect(fields(r)).toHaveProperty('delivery_address')
  })

  it('requires a reason to cancel', () => {
    expect(fields(transitionBody.safeParse({ to: 'Cancelled' }))).toHaveProperty('reason')
    expect(transitionBody.safeParse({ to: 'Cancelled', reason: 'Out of stock' }).success).toBe(true)
    expect(transitionBody.safeParse({ to: 'Accepted' }).success).toBe(true)
  })

  it('validates staff creation', () => {
    expect(staffCreateBody.safeParse({ name: 'A', email: 'A@Example.com', password: 'longenough', role: 'operator' }).data.email).toBe('a@example.com')
    expect(fields(staffCreateBody.safeParse({ name: 'A', email: 'nope', password: 'short', role: 'boss' }))).toEqual(
      expect.objectContaining({ email: expect.any(String), password: expect.any(String), role: expect.any(String) })
    )
  })
})
