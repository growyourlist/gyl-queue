import test from 'ava'

import maybeCleanBroadcastHistory from '../src/queue/maybeCleanBroadcastHistory'

test('maybeCleanBroadcastHistory does not modify empty history', t => {
  const emptyHistory = {}
  const result = maybeCleanBroadcastHistory(emptyHistory)
  t.assert(emptyHistory === result)
})

test('maybeCleanBroadcastHistory does not modify same day history', t => {

  // Set up
  const realDate = Date
  const currentDate = new Date('2019-01-01T12:00:00.000Z')
  global.Date = class extends Date {
    constructor(date) {
      if (date) {
        return super(date)
      }
      return currentDate
    }
  }

  // Test
  const todaysHistory = {
    'ExampleTemplateId1': '2019-01-01',
    'ExampleTemplateId2': '2019-01-01',
  }
  const result = maybeCleanBroadcastHistory(todaysHistory)
  t.assert(Object.keys(result).length === 2)
  t.assert(todaysHistory === result)

  // Clean up
  global.Date = realDate
})

test('maybeCleanBroadcastHistory empties old history', t => {

    // Set up
    const realDate = Date
    const currentDate = new Date('2019-01-02T12:00:00.000Z')
    global.Date = class extends Date {
      constructor(date) {
        if (date) {
          return super(date)
        }
        return currentDate
      }
    }

    // Test
    const todaysHistory = {
      'ExampleTemplateId1': '2019-01-01',
      'ExampleTemplateId2': '2019-01-01',
    }
    const result = maybeCleanBroadcastHistory(todaysHistory)
    t.assert(Object.keys(result).length === 0)

    // Clean up
    global.Date = realDate
})
