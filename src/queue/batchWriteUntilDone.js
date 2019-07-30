const db = require('./db')
const debugLog = require('./debugLog')

/**
 * Continuously attempts to write the batch items to the given table in the db
 * until all items have succeeded.
 */
const batchWriteUntilDone = (batch, tableName, taskCounter = 0) => {
	return new Promise((resolve, reject) => {
		db.batchWrite({
			RequestItems: {
				[tableName]: batch
			}
		})
		.then(result => {
			const unprocessedItems = result.UnprocessedItems[tableName]
			if (Array.isArray(unprocessedItems)) {
				debugLog(`${(new Date).toISOString()}: Rescheduling `
				+ `${unprocessedItems.length} unprocessed ${tableName} items`)
				return setTimeout(() => {
					taskCounter += (batch.length - unprocessedItems.length)
					resolve(
						batchWriteUntilDone(unprocessedItems, tableName, taskCounter)
					)
				}, Math.random() * 300)
			}
			return resolve(taskCounter += batch.length)
		})
		.catch(err => {
			if (err.name === 'ProvisionedThroughputExceededException') {
				debugLog(`${(new Date).toISOString()}: Requeuing ${tableName} batch `
				+ `after throughput exceeded`)
				return setTimeout(
					() => resolve(
						batchWriteUntilDone(batch, tableName, taskCounter)
					),
					Math.random() * 500
				)
			}
			console.log(`${(new Date).toISOString()}: ${tableName} batch failed: `)
			console.log(err)
			console.log(batch[0].PutRequest.Item)
			resolve(taskCounter)
		})
	})
}

module.exports = batchWriteUntilDone
