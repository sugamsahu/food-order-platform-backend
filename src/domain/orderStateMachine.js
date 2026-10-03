export const ORDER_STATUSES = ['Placed', 'Accepted', 'Preparing', 'Ready', 'Completed', 'Cancelled']
export const TERMINAL_STATUSES = ['Completed', 'Cancelled']

export const TRANSITIONS = {
  Placed: ['Accepted', 'Cancelled'],
  Accepted: ['Preparing', 'Cancelled'],
  Preparing: ['Ready', 'Cancelled'],
  Ready: ['Completed'],
  Completed: [],
  Cancelled: []
}

export const allowedNext = (from) => TRANSITIONS[from] || []

// Returns null when the transition is allowed, otherwise an error descriptor.
export const checkTransition = (from, to) => {
  if (TERMINAL_STATUSES.includes(from)) {
    return { code: 'TERMINAL_STATE', message: `Order is ${from} and can no longer be changed` }
  }
  if (!allowedNext(from).includes(to)) {
    return { code: 'INVALID_TRANSITION', message: `Cannot transition from ${from} to ${to}` }
  }
  return null
}
