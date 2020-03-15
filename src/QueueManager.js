const debugLog = require('./queue/debugLog');
const Queue = require('./queue/Queue');
const db = require('./dynamoDBClient');

const dbTablePrefix = process.env.DB_TABLE_PREFIX || '';

const queue = new Queue();
let isProcessing = false;
let processId = null;

/**
 * Returns true if the Queue table exists and is active, false otherwise.
 * @returns {Promise<boolean>}
 */
const getTableStatusIsActive = () => db.describeTable(
	{ TableName: `${dbTablePrefix}Queue` }
)
	.promise()
	.then(res => res  && res.Table && res.Table.TableStatus === 'ACTIVE')
	.catch(err => {
		console.log(`Error describing table: ${err.message}`);
		return false;
	});

/**
 * Turns the queue on or off and keeps it processing at regular intervals.
 */
class QueueManager {

	/**
	 * Starts a regular interval for queue processing.
	 */
	on() {
		console.log(`Started processing queue`);
		processId = setInterval(this.processQueue, 1000);
	}

	/**
	 * Turns off queue processing, waits for the current batch to complete then
	 * stops.
	 * @returns {Promise<void>}
	 */
	off() {
		return new Promise((resolve, reject) => {
			console.log(`Stopping queue, please wait...`);
			if (processId) {
				clearInterval(processId);
				if (!isProcessing) {
					console.log('Safe to terminate process');
					return resolve();
				}
				let checks = 0;
				let checkOffInterval = setInterval(() => {
					if (!isProcessing) {
						clearInterval(checkOffInterval);
						checkOffInterval = null;
						return resolve();
					}
					checks++;
					// Continue checking for up to 2 seconds
					if (checks > 20) {
						clearInterval(checkOffInterval);
						checkOffInterval = null;
						return reject(new Error('Timed out waiting for queue to exit'));
					}
				}, 100);
				processId = null;
			}
			return resolve();
		});
	}

	/**
	 * Returns true if the QueueManager is processing the queue, false otherwise.
	 * @returns {boolean}
	 */
	getIsProcessing() {
		return !!processId;
	}

	/**
	 * Triggers one batch of queue processing after checking Queue table is
	 * active. Catches errors during queue processing.
	 * @returns {Promise<void>}
	 */
	async processQueue() {
		if (isProcessing) {
			debugLog('Skipping due to processing overlap');
			return;
		}
		isProcessing = true;
		try {
			const tableIsActive = await getTableStatusIsActive();
			if (tableIsActive) {
				await queue.process()
			}
			else {
				console.log('Skipping due to inactive table');
			}
		} catch (err) {
			console.error('Error processing queue')
			console.error(err)
		}
		isProcessing = false;
		if (!processId) {
			console.log('Safe to terminate process');
		}
	}
}

module.exports = QueueManager;
