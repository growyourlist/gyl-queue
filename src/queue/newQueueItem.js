/**
 * Returns a new object containing default values for necessary queue item
 * properties that are not contained in the given itemData.
 * @param {object} itemData 
 * @param {Number} runAt 
 */
const newQueueItem = (itemData, runAt = Date.now()) => {
	const runAtModified = `${runAt}${Math.random().toString().substring(1)}`
	return Object.assign({}, itemData, {
		queuePlacement: 'queued',
		runAtModified: runAtModified,
		runAt: runAt,
		attempts: 0,
		failed: false,
		completed: false,
	})
}

module.exports = newQueueItem
