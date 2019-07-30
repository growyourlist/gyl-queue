const getAutoresponder = require('./getAutoresponder')
const newQueueItem = require('./newQueueItem')
const batchWriteBatchesUntilDone = require('./batchWriteBatchesUntilDone')

/**
 * Looks through a batch of queued tasks. For each task that has a follow up
 * action, this action is added to the queue with the appropriate delay as
 * specified in the current batch action.
 * @param  {Array} batch Batch of queue tasks.
 * @return {Promise}
 */
const queueNextActions = batch => {
	if (!batch.length) {
		return Promise.resolve()
	}

	const putRequests = []
	const promises = []
	// For each task in the batch, look up the autoresponder definition and work
	// out the next action to queue, if a next action is found.
	batch.forEach(task => {

		// If the queue item is not attached to an autoresponder, there's nothing
		// more to do here.
		if (!task.autoresponderId || !task.autoresponderStep) {
			return
		}

		promises.push(
			getAutoresponder(task.autoresponderId)
			.then(autoresponder => {
				if (!autoresponder || !autoresponder.steps[task.autoresponderStep]) {
					return
				}

				// Get the update-to-date definition of the current step of the workflow
				// in the autoresponder.
				const currentStep = autoresponder.steps[task.autoresponderStep]
				if (!currentStep) {
					console.log(`autoresponder step ${task.autoresponderStep} not found`)
					// If the step doesn't exist in the autoresponder anymore, ignore it
					return
				}

				let nextActionName = null
				if (currentStep.nextAction) {
					nextActionName = currentStep.nextAction
				}
				else if (currentStep.type === 'make choice based on tag') {
					const tagToCheck = currentStep.tagToCheck
					const hasTag = task.subscriber.tags && task.subscriber.tags.length
					&& task.subscriber.tags.indexOf(tagToCheck) >= 0
					if (hasTag) {
						nextActionName = currentStep.yesAction
					}
					else {
						nextActionName = currentStep.noAction
					}
				}

				const nextAction = nextActionName && autoresponder.steps[nextActionName]

				// If no next action was found based, then nothing more to do here. This
				// is acceptable; for example, if no 'noAction' is defined for an
				// autoresponder step, then it is okay to leave the autoresponder.
				if (!nextAction) {
					return
				}

				const runAt = ((
					currentStep.runNextIn && Date.now() + currentStep.runNextIn
				) || Date.now())
				putRequests.push({
					PutRequest: {
						Item: newQueueItem(
							Object.assign({}, nextAction, {
								subscriber: task.subscriber,
								subscriberId: task.subscriberId,
								autoresponderId: task.autoresponderId,
								autoresponderStep: nextActionName,
							}),
							runAt
						)
					}
				})
			})
		)
	})

	return Promise.all(promises)
	.then(() => {
		if (!putRequests.length) {
			return null
		}

		return batchWriteBatchesUntilDone(putRequests, 'Queue')
		.catch(err => console.log(`Error adding follow up tasks: ${err.message}`))
	})
}

module.exports = queueNextActions
