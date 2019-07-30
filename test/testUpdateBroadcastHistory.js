const test = require('ava')
const sinon = require('sinon')

const updateBroadcastHistory = require('../src/queue/updateBroadcastHistory')

const broadcastHistorySettingName = 'broadcastHistory'

const mockDb = global.mockDb

test.afterEach(() => {
  sinon.restore()
})

test.serial('updating broadcast history works with no prior history', async t => {

  // When history is fetched, no DynamoDB Item is returned
  const stubGet = sinon.stub(mockDb, 'get').callsFake(() => Promise.resolve({}))
  
  // Spy on the put method which should be run during the history update
  const spyPut = sinon.spy(mockDb, 'put')

  await updateBroadcastHistory({
    templateId: 'TestTemplate',
    dateStamp: '2019-01-01',
  })

  // Current history was retrieved
  t.is(stubGet.callCount, 1) 

  // New history was saved in correct format
  t.deepEqual(spyPut.args[0][[0]], {
    TableName: 'Settings',
    Item: {
      settingName: broadcastHistorySettingName,
      value: {
        TestTemplate: [
          {
            from: '2019-01-01',
            to: '2019-01-01',
          }
        ]
      }
    }
  })
})

test.serial('updating broadcast history extends range from previous day', async t => {
  const stubGet = sinon.stub(mockDb, 'get').callsFake(() => Promise.resolve({
    Item: {
      settingName: broadcastHistorySettingName,
      value: {
        'TestTemplate123': [
          {
            from: '2019-01-01',
            to: '2019-01-01',
          }
        ]
      }
    }
  }))
  
  const spyPut = sinon.spy(mockDb, 'put')

  await updateBroadcastHistory({
    templateId: 'TestTemplate123',
    dateStamp: '2019-01-02',
  })

  t.is(stubGet.callCount, 1)
  t.is(spyPut.callCount, 1)
  t.deepEqual(spyPut.args[0][0], {
    TableName: 'Settings',
    Item: {
      settingName: broadcastHistorySettingName,
      value: {
        TestTemplate123: [
          {
            from: '2019-01-01',
            to: '2019-01-02',
          }
        ]
      }
    }
  })
})

test.serial('repeated broadcast dates are ignored', async t => {
  const stubGet = sinon.stub(mockDb, 'get').callsFake(() => Promise.resolve({
    Item: {
      settingName: broadcastHistorySettingName,
      value: {
        'TestTemplate123': [
          {
            from: '2019-01-01',
            to: '2019-01-02',
          }
        ]
      }
    }
  }))
  
  const spyPut = sinon.spy(mockDb, 'put')

  await updateBroadcastHistory({
    templateId: 'TestTemplate123',
    dateStamp: '2019-01-02',
  })

  t.is(stubGet.callCount, 1)
  t.is(spyPut.callCount, 0)
})

test.serial('sending email two or more days after last starts new range', async t => {
  const stubGet = sinon.stub(mockDb, 'get').callsFake(() => Promise.resolve({
    Item: {
      settingName: broadcastHistorySettingName,
      value: {
        'TestTemplate123': [
          {
            from: '2019-01-01',
            to: '2019-01-02',
          }
        ]
      }
    }
  }))

  const spyPut = sinon.spy(mockDb, 'put')

  await updateBroadcastHistory({
    templateId: 'TestTemplate123',
    dateStamp: '2019-01-04',
  })

  t.is(stubGet.callCount, 1)
  t.is(spyPut.callCount, 1)
  t.deepEqual(spyPut.args[0][0], {
    TableName: 'Settings',
    Item: {
      settingName: broadcastHistorySettingName,
      value: {
        TestTemplate123: [
          {
            from: '2019-01-01',
            to: '2019-01-02',
          },
          {
            from: '2019-01-04',
            to: '2019-01-04',
          }
        ]
      }
    }
  })
})

test.serial('db get does not cause error to be thrown', async t => {
  sinon.stub(console, 'error')
  const stubGet = sinon.stub(mockDb, 'get').callsFake(
    () => { throw new Error('Fake Get Error') }
  )

  const spyPut = sinon.spy(mockDb, 'put')

  try {
    await updateBroadcastHistory({
      templateId: 'TestTemplate123',
      dateStamp: '2019-01-04',
    })
  }
  catch (err) {
    t.fail()
  }

  t.is(stubGet.callCount, 1)
  t.true(stubGet.alwaysThrew())

  // No update should be made if get request failed
  t.is(spyPut.callCount, 0)
})

test.serial('db put does not cause error to be thrown', async t => {
  sinon.stub(console, 'error')
  const stubPut = sinon.stub(mockDb, 'put').callsFake(
    () => { throw new Error('Fake Put Error') }
  )

  try {
    await updateBroadcastHistory({
      templateId: 'TestTemplate123',
      dateStamp: '2019-01-04',
    })
  }
  catch (err) {
    t.fail()
  }

  t.is(stubPut.callCount, 1)
  t.true(stubPut.alwaysThrew())
})

// Need to handle the scenario when the broadcast history grows over 400 KB
test.serial.todo('Handles oversized DynamoDB Item error')
