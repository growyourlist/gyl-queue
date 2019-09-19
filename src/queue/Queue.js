const db = require('./db')
const debugLog = require('./debugLog')
const queueNextActions = require('./queueNextActions')
const sendEmailBatch = require('./sendEmailBatch')
const refreshSubscribers = require('./refreshSubscribers')
const unsubscribeSubscribers = require('./unsubscribeSubscribers')
const wrapWaitTasks = require('./wrapWaitTasks')
const readBatchSize = 50
const writeBatchSize = 25

/**
 * Flag indicating that nothing was processed on the last batch.
 */
let nothingToProcessLastBatch = false

/**
 * Processes a queue of tasks to send emails.
 */
class Queue {

	/**
	 * Gets the next batch of queued tasks.
	 * @return {Promise<object[]>}
	 */
	getBatch() {
		const getBatchParams = {
			TableName: 'Queue',
			ConsistentRead: true,
			Limit: readBatchSize,
			ScanIndexForward: false,
			KeyConditionExpression: "queuePlacement = :q and runAtModified <= :now",
			ExpressionAttributeValues: {
				":q": 'queued',
				":now": Date.now().toString(),
			}
		}
		return db.query(getBatchParams)
		.then(data => data.Items)
	}

	/**
	 * Fetches the next batch of queued tasks and processes them.
	 * @return {Promise}
	 */
	process() {
		return this.getBatch()
		.then(batch => {
			if (!batch || !batch.length) {
				if (!nothingToProcessLastBatch) {
					debugLog(`${(new Date).toISOString()}: Nothing to process`)
				}
				nothingToProcessLastBatch = true
				return []
			}
			nothingToProcessLastBatch = false
			debugLog(`${(new Date).toISOString()}: Pulled ${batch.length} items to `
			+ `process`)
			return this.processBatch(batch)
		})
	}

	/**
	 * Processes the clean up tasks.
	 */
	taskCleanUp(batch, taskCounter = 0) {
		return new Promise((resolve, reject) => {
			db.batchWrite({
				RequestItems: {
					Queue: batch
				}
			})
			.then(result => {
				const unprocessedItems = result.UnprocessedItems.Queue
				if (Array.isArray(unprocessedItems)) {
					debugLog(`${(new Date).toISOString()}: Rescheduling `
					+ `${unprocessedItems.length} unprocessed cleanup items`)
					return setTimeout(() => {
						taskCounter += (batch.length - unprocessedItems.length)
						resolve(this.taskCleanUp(unprocessedItems, taskCounter))
					}, Math.random() * 300)
				}
				return resolve(taskCounter + batch.length)
			})
			.catch(err => {
				if (err.name === 'ProvisionedThroughputExceededException') {
					debugLog(`${(new Date).toISOString()}: Requeuing cleanup batch `
					+ 'after throughput exceeded')
					return setTimeout(
						() => resolve(this.taskCleanUp(batch, taskCounter)),
						Math.random() * 500
					)
				}
				console.log(`${(new Date).toISOString()}: Clean up batch failed:`)
				console.log(err)
				resolve(taskCounter)
			})
		})
	}

	/**
	 * Processes the archive tasks.
	 * @param {object[]} batch Array of archive items.
	 * @param {Number} taskCounter Current number of tasks completed.
	 */
	addToArchive(batch, taskCounter = 0) {
		return new Promise((resolve, reject) => {
			db.batchWrite({
				RequestItems: {
					Queue: batch
				}
			})
			.then(result => {
				const unprocessedItems = result.UnprocessedItems.Queue
				if (Array.isArray(unprocessedItems)) {
					debugLog(`${(new Date).toISOString()}: Rescheduling `
					+ `${unprocessedItems.length} unprocessed archive items`)
					return setTimeout(() => {
						taskCounter += (batch.length - unprocessedItems.length)
						resolve(this.addToArchive(unprocessedItems, taskCounter))
					}, Math.random() * 800)
				}
				return resolve(taskCounter += batch.length)
			})
			.catch(err => {
				if (err.name === 'ProvisionedThroughputExceededException') {
					debugLog(`${(new Date).toISOString()}: Requeuing archive batch after `
					+ `throughput exceeded`)
					return setTimeout(
						() => resolve(this.addToArchive(batch, taskCounter)),
						Math.random() * 3000
					)
				}
				console.log(`${(new Date).toISOString()}: Archive batch failed: `)
				console.log(err)
				resolve(taskCounter)
			})
		})
	}

	/**
	 * Given a batch of queued tasks, goes through each tasks and acts upon it.
	 * @param  {Array} batch The todo tasks.
	 * @return {Promise}
	 */
	processBatch(batch) {
		const emailBatch = batch.filter(task => task.type === 'send email')
		const tagBatch = batch.filter(
			task => task.type === 'make choice based on tag'
		)
		const unsubscribeBatch = batch.filter(task => task.type === 'unsubscribe')
		const waitBatch = batch.filter(task => task.type === 'wait')

		// If there are no tasks to do, leave.
		if (!emailBatch.length && !tagBatch.length && !unsubscribeBatch.length
			&& !waitBatch.length) {
			return Promise.resolve()
		}

		const dateStamp = (new Date).toISOString().substring(0, 10)
		return Promise.all([
			Promise.resolve((emailBatch.length && sendEmailBatch(
				emailBatch, dateStamp
			)) || []),
			Promise.resolve((tagBatch.length && refreshSubscribers(tagBatch)) || []),
			Promise.resolve(
				(unsubscribeBatch.length &&
					unsubscribeSubscribers(unsubscribeBatch)
				) || []
			),
			Promise.resolve((waitBatch.length && wrapWaitTasks(waitBatch)) || [])
		])
		.then(resultBatches => {
			const results = resultBatches[0].concat(
				resultBatches[1], resultBatches[2], resultBatches[3]
			)
			const cleanUpTasks = results.map(result => {

				// Delete queue items that are successful or have been attempted
				// too many times (note that deleted items are still archived).
				if (result.status === 'success' || result.item.attempts > 0) {
					return {
						DeleteRequest: {
							Key: {
								queuePlacement: result.item.queuePlacement,
								runAtModified: result.item.runAtModified
							}
						}
					}
				}

				// Update queue items that can be reattempted.
				const updatedItem = {
					Item: Object.assign({}, result.item, {
						failed: true,
						attempts: result.item.attempts + 1,
						lastAttempt: result.timestamp
					})
				}
				if (result.failureReason) {
					const newFailureReason = (
						(result.item.failureReason || '' ) + ' ' + result.failureReason
					).trim()
					updatedItem.Item.failureReason = newFailureReason
				}
				return {
					PutRequest: updatedItem
				}
			})

			let currentBatch = []
			const batches = []
			cleanUpTasks.forEach(task => {
				if (currentBatch.length === writeBatchSize) {
					batches.push(currentBatch)
					currentBatch = []
				}
				currentBatch.push(task)
			})
			batches.push(currentBatch)

			return Promise.all(batches.map(cleanupBatch => {
				return this.taskCleanUp(cleanupBatch)
			}))
			.then(counters => {

				let totalTasks = 0
				counters.forEach(counter => totalTasks += counter)
				debugLog(`${(new Date).toISOString()}: ${totalTasks} cleanup tasks `
				+ `complete`)

				// Archive successful or permanently failed items
				const archiveable = results.filter(res => (
					res.status === 'success' || res.item.attempts > 0
				))

				if (!archiveable.length) {
					return
				}

				const archiveTasks = archiveable.map(result => {
					const archiveItem = {
						queuePlacement: dateStamp,
						completed: true,
						attempts: result.item.attempts + 1,
						lastAttempt: result.timestamp,
						failed: result.item.failed,
						params: null,
						runAt: result.item.runAt,
						runAtModified: result.item.runAtModified,
						subscriber: null,
						subscriberId: result.item.subscriberId,
						templateId: result.item.templateId,
						type: result.item.type,
					}
					if (result.item.failureReason) {
						archiveItem.failureReason = result.item.failureReason
					}
					return {
						PutRequest: {
							Item: archiveItem
						}
					}
				})

				let currentArchiveBatch = []
				const archiveBatches = []
				archiveTasks.forEach(archiveTask => {
					if (currentArchiveBatch.length === writeBatchSize) {
						archiveBatches.push(currentArchiveBatch)
						currentArchiveBatch = []
					}
					currentArchiveBatch.push(archiveTask)
				})
				archiveBatches.push(currentArchiveBatch)

				return Promise.all(archiveBatches.map(archiveBatch => {
					return this.addToArchive(archiveBatch)
				}))
				.then(archiveCounters => {
					let totalArchiveTasks = 0
					archiveCounters.forEach(counter => totalArchiveTasks += counter)
					debugLog(`${(new Date).toISOString()}: ${totalArchiveTasks} archive `
					+ `tasks complete`)
				})
			})
			.then(() => {

				// Queue follow up actions for successful tasks
				const successes = results.filter(res => (
					res.status === 'success'
				))

				if (!successes.length) {
					return
				}

				return queueNextActions(successes.map(res => res.item))
			})
		})
	}
}

module.exports = Queue
