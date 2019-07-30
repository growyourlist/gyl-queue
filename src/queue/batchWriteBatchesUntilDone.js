const batchWriteUntilDone = require('./batchWriteUntilDone')
const splitDbRequestsIntoBatches = require('./splitDbRequestsIntoBatches')

/**
 * Splits the db requests into batches then writes them to the db.
 */
const batchWriteBatchesUntilDone = (dbRequests, tableName) => {
	const batches = splitDbRequestsIntoBatches(dbRequests)
	return Promise.all(batches.map(
		batch => batchWriteUntilDone(batch, tableName)
	))
}

module.exports = batchWriteBatchesUntilDone
