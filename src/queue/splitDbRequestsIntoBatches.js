const batchWriteSize = 25

/**
 * Splits DB requests into batches of the maximum size allowed by the DB.
 */
const splitDbRequestsIntoBatches = dbRequests => {
	let currentBatch = []
	const batches = []

	dbRequests.forEach(dbRequest => {
		if (currentBatch.length === batchWriteSize) {
			batches.push(currentBatch)
			currentBatch = []
		}
		currentBatch.push(dbRequest)
	})
	batches.push(currentBatch)
	return batches
}

module.exports = splitDbRequestsIntoBatches
