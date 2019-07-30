const AWS = require('aws-sdk')

const debugLog = require('./queue/debugLog')
const Queue = require('./queue/Queue')

const queue = new Queue
let isProcessing = false
let processId = null
const dynamodbParams = {
	region: process.env.AWS_REGION,
}

if (process.env.DYNAMODB_ENDPOINT) {
	dynamodbParams.endpoint = process.env.DYNAMODB_ENDPOINT
}
else {
	dynamodbParams.accessKeyId = process.env.AWS_ACCESS_KEY_ID
	dynamodbParams.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
}

const db = new AWS.DynamoDB(dynamodbParams)

const getTableStatusIsActive = () => new Promise(resolve => {
	db.describeTable({
		TableName: 'Queue',
	}, (err, data) => {
		if (err) {
			console.log(`${(new Date).toISOString()}: Error describing table: `
			+ err.message)
			return resolve(false)
		}
		return resolve(data && data.Table && data.Table.TableStatus === 'ACTIVE')
	})
})

/**
 * Turns the queue on or off and keeps it processing at regular intervals.
 */
class QueueManager {

	on() {
		console.log(`${(new Date).toISOString()}: Processing queue`)
		processId = setInterval(this.processQueue, 1000)
	}

	off() {
		console.log(`${(new Date).toISOString()}: Stopping queue, please wait...`)
		if (processId) {
			clearInterval(processId)
			if (!isProcessing) {
				console.log('Safe to terminate process')
			}
		}
		processId = null
	}

	getIsProcessing() {
		return !!processId
	}

	processQueue() {
		if (isProcessing) {
			debugLog(`${(new Date()).toISOString()}: Skipping due to processing `
			+ 'overlap')
			return Promise.resolve()
		}
		isProcessing = true
		return getTableStatusIsActive()
		.then(isActive => {
			if (isActive) {
				return queue.process()
			}
			console.log(`${(new Date()).toISOString()}: Skipping due to inactive`
			+ ' table')
			return Promise.resolve()
		})
		.catch(err => {
			console.log(`${(new Date()).toISOString()}: Error processing queue:`)
			console.error(err)
		})
		.then(() => {
			isProcessing = false
			if (!processId) {
				console.log('Safe to terminate process')
			}
		})
	}
}

module.exports = QueueManager
