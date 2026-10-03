import { TRANSITIONS, allowedNext, checkTransition } from '../../src/domain/orderStateMachine'

describe('order state machine', () => {
  it('allows exactly the transitions in the brief', () => {
    expect(TRANSITIONS).toEqual({
      Placed: ['Accepted', 'Cancelled'],
      Accepted: ['Preparing', 'Cancelled'],
      Preparing: ['Ready', 'Cancelled'],
      Ready: ['Completed'],
      Completed: [],
      Cancelled: []
    })
  })

  it('accepts every allowed transition', () => {
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      for (const to of tos) expect(checkTransition(from, to)).toBeNull()
    }
  })

  it('rejects skipping steps, going backwards and repeating a status', () => {
    expect(checkTransition('Placed', 'Completed').code).toBe('INVALID_TRANSITION')
    expect(checkTransition('Preparing', 'Accepted').code).toBe('INVALID_TRANSITION')
    expect(checkTransition('Accepted', 'Accepted').code).toBe('INVALID_TRANSITION')
    expect(checkTransition('Ready', 'Cancelled').code).toBe('INVALID_TRANSITION')
  })

  it('treats Completed and Cancelled as terminal', () => {
    expect(checkTransition('Completed', 'Cancelled').code).toBe('TERMINAL_STATE')
    expect(checkTransition('Cancelled', 'Placed').code).toBe('TERMINAL_STATE')
    expect(allowedNext('Completed')).toEqual([])
  })
})
