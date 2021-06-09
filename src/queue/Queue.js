const db = require('../dynamoDBDocumentClient');
const debugLog = require('./debugLog');
const Logger = require('../Logger');
const queueNextActions = require('./queueNextActions');
const sendEmailBatch = require('./sendEmailBatch');
const refreshSubscribers = require('./refreshSubscribers');
const unsubscribeSubscribers = require('./unsubscribeSubscribers');
const wrapWaitTasks = require('./wrapWaitTasks');
const { readBatchSize } = require('./queue/constants');
const writeBatchSize = 25;
const dbTablePrefix = process.env.DB_TABLE_PREFIX || '';

/**
 * Flag indicating that nothing was processed on the last batch.
 */
let nothingToProcessLastBatch = false;

/**
 * Processes a queue of tasks to send emails.
 */
class Queue {
	/**
	 * Fetches the next batch of queued tasks and processes them.
	 * @return {Promise<void>}
	 */
	async process() {
		const batch = await this.getBatch();
		if (!Array.isArray(batch) || !batch.length) {
			if (!nothingToProcessLastBatch) {
				debugLog('Nothing to process');
			}
			nothingToProcessLastBatch = true;
			return;
		}
		nothingToProcessLastBatch = false;
		debugLog(`Pulled ${batch.length} items to process`);
		await this.processBatch(batch);
	}

	/**
	 * Gets the next batch of queued tasks.
	 */
	async getBatch() {
		const getBatchParams = {
			TableName: `${dbTablePrefix}Queue`,
			ConsistentRead: true,
			Limit: readBatchSize,
			ScanIndexForward: true,
			KeyConditionExpression: 'queuePlacement = :q and runAtModified <= :now',
			ExpressionAttributeValues: {
				':q': 'queued',
				':now': Date.now().toString(),
			},
		};
		const res = await db.query(getBatchParams).promise();
		return res.Items;
	}

	/**
	 * Given a batch of queued tasks, goes through each task and acts upon it.
	 * @param  {Array} batch The todo tasks.
	 * @return {Promise}
	 */
	async processBatch(batch) {
		const emailBatch = [];
		const choiceBatch = [];
		const unsubscribeBatch = [];
		const waitBatch = [];
		batch.forEach((task) => {
			switch (task.type) {
				case 'send email':
					emailBatch.push(task);
					break;
				case 'make choice based on tag':
					choiceBatch.push(task);
					break;
				case 'unsubscribe':
					unsubscribeBatch.push(task);
					break;
				case 'wait':
					waitBatch.push(task);
					break;
				default:
					break; // TODO handle unknown task types with warning.
			}
		});

		// If there are no tasks to do, leave.
		if (
			!(
				emailBatch.length ||
				choiceBatch.length ||
				unsubscribeBatch.length ||
				waitBatch.length
			)
		) {
			Logger.info('No tasks with recognised task types');
			return;
		}

		const dateStamp = new Date().toISOString().substring(0, 10);
		const resultBatches = await Promise.all([
			sendEmailBatch(emailBatch, dateStamp),
			refreshSubscribers(choiceBatch),
			unsubscribeSubscribers(unsubscribeBatch),
			wrapWaitTasks(waitBatch),
		]);
		const results = resultBatches[0].concat(
			resultBatches[1],
			resultBatches[2],
			resultBatches[3]
		);
		Logger.info(`Got ${results.length} processing results. Now cleaning up`);
		const cleanUpTasks = results.map((result) => {
			// Delete queue items that are successful or have been attempted
			// too many times (note that deleted items are still archived).
			if (result.status === 'success' || result.item.attempts > 0) {
				return {
					DeleteRequest: {
						Key: {
							queuePlacement: result.item.queuePlacement,
							runAtModified: result.item.runAtModified,
						},
					},
				};
			}

			// Update queue items that can be reattempted.
			const updatedItem = {
				Item: Object.assign({}, result.item, {
					failed: true,
					attempts: result.item.attempts + 1,
					lastAttempt: result.timestamp,
				}),
			};
			if (result.failureReason) {
				const newFailureReason = (
					(result.item.failureReason || '') +
					' ' +
					result.failureReason
				).trim();
				updatedItem.Item.failureReason = newFailureReason;
			}
			return {
				PutRequest: updatedItem,
			};
		});

		let currentBatch = [];
		const batches = [];
		cleanUpTasks.forEach((task) => {
			if (currentBatch.length === writeBatchSize) {
				batches.push(currentBatch);
				currentBatch = [];
			}
			currentBatch.push(task);
		});
		batches.push(currentBatch);

		return Promise.all(
			batches.map((cleanupBatch) => {
				return this.taskCleanUp(cleanupBatch);
			})
		)
			.then((counters) => {
				let totalTasks = 0;
				counters.forEach((counter) => (totalTasks += counter));
				debugLog(
					`${new Date().toISOString()}: ${totalTasks} cleanup tasks ` +
						`complete`
				);

				// Archive successful or permanently failed items
				const archiveable = results.filter(
					(res) => res.status === 'success' || res.item.attempts > 0
				);

				if (!archiveable.length) {
					return;
				}

				const archiveTasks = archiveable.map((result) => {
					const archiveItem = {
						// startDate is used for broadcasts
						queuePlacement: (result.item && result.item.startDate) || dateStamp,
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
					};
					if (result.item.broadcastRunAtId) {
						archiveItem.broadcastRunAtId = result.item.broadcastRunAtId;
					}
					if (result.item.failureReason) {
						archiveItem.failureReason = result.item.failureReason;
					}
					if (result.item.autoresponderId) {
						archiveItem.autoresponderId = result.item.autoresponderId;
					}
					if (result.item.autoresponderStep) {
						archiveItem.autoresponderStep = result.item.autoresponderStep;
					}
					if (result.item.tagReason) {
						archiveItem.tagReason = result.item.tagReason;
					}
					return {
						PutRequest: {
							Item: archiveItem,
						},
					};
				});

				let currentArchiveBatch = [];
				const archiveBatches = [];
				archiveTasks.forEach((archiveTask) => {
					if (currentArchiveBatch.length === writeBatchSize) {
						archiveBatches.push(currentArchiveBatch);
						currentArchiveBatch = [];
					}
					currentArchiveBatch.push(archiveTask);
				});
				archiveBatches.push(currentArchiveBatch);

				return Promise.all(
					archiveBatches.map((archiveBatch) => {
						return this.addToArchive(archiveBatch);
					})
				).then((archiveCounters) => {
					let totalArchiveTasks = 0;
					archiveCounters.forEach((counter) => (totalArchiveTasks += counter));
					debugLog(
						`${new Date().toISOString()}: ${totalArchiveTasks} archive ` +
							`tasks complete`
					);
				});
			})
			.then(() => {
				// Queue follow up actions for successful tasks
				const successes = results.filter((res) => res.status === 'success');

				if (!successes.length) {
					return;
				}

				return queueNextActions(successes.map((res) => res.item));
			});
	}

	/**
	 * Processes the clean up tasks.
	 */
	async taskCleanUp(batch) {
		let itemsToProcess = batch
		let itemsCleanedUpCount = 0;
		while (itemsToProcess && itemsToProcess.length) {
			const deleteResult = await db.batchWrite({
				RequestItems: {
					[`${dbTablePrefix}Queue`]: itemsToProcess,
				}
			}).promise();
			const unprocessedItems = deleteResult.UnprocessedItems.Queue;
			if (Array.isArray(unprocessedItems) && unprocessedItems.length) {
				itemsCleanedUpCount += itemsToProcess.length - unprocessedItems.length;
				itemsToProcess = unprocessedItems;
			} else {
				itemsCleanedUpCount += itemsToProcess.length;
				itemsToProcess = false;
			}
		}
		return itemsCleanedUpCount;
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
					[`${dbTablePrefix}Queue`]: batch,
				},
			})
				.promise()
				.then((result) => {
					const unprocessedItems = result.UnprocessedItems.Queue;
					if (Array.isArray(unprocessedItems)) {
						debugLog(
							`${new Date().toISOString()}: Rescheduling ` +
								`${unprocessedItems.length} unprocessed archive items`
						);
						return setTimeout(() => {
							taskCounter += batch.length - unprocessedItems.length;
							resolve(this.addToArchive(unprocessedItems, taskCounter));
						}, Math.random() * 800);
					}
					return resolve((taskCounter += batch.length));
				})
				.catch((err) => {
					if (err.name === 'ProvisionedThroughputExceededException') {
						debugLog(
							`${new Date().toISOString()}: Requeuing archive batch after ` +
								`throughput exceeded`
						);
						return setTimeout(
							() => resolve(this.addToArchive(batch, taskCounter)),
							Math.random() * 3000
						);
					}
					console.log(`${new Date().toISOString()}: Archive batch failed: `);
					console.log(err);
					resolve(taskCounter);
				});
		});
	}
}

module.exports = Queue;
