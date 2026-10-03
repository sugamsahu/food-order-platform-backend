import { fromCents, toCents } from '../../src/utils/money'

describe('money helpers', () => {
  it('converts decimal strings to integer cents without float drift', () => {
    expect(toCents('12.99')).toBe(1299)
    expect(toCents('0.10')).toBe(10)
    expect(toCents('19.9')).toBe(1990)
    expect(toCents('5')).toBe(500)
    expect(toCents('0.29')).toBe(29) // 0.29 * 100 is 28.999999999999996 in floating point
  })

  it('formats cents as a two-decimal string', () => {
    expect(fromCents(1299)).toBe('12.99')
    expect(fromCents(5)).toBe('0.05')
    expect(fromCents(100000)).toBe('1000.00')
  })

  it('sums lines exactly', () => {
    const lines = ['0.10', '0.20', '0.30'].map(toCents)
    expect(fromCents(lines.reduce((a, b) => a + b, 0))).toBe('0.60')
  })
})
