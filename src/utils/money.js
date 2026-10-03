// Money is handled as integer cents in code and numeric(10,2) in the database, so totals never
// suffer floating point drift. Values cross the API as decimal strings such as "12.99".
export const toCents = (value) => {
  const [whole, frac = ''] = String(value).split('.')
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2))
}

export const fromCents = (cents) => {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
