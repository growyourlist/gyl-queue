const wrapWaitTasks = batch => {
	return batch.map(item => ({
		item,
		status: 'success',
		timestamp: Date.now(),
	}))
}

module.exports = wrapWaitTasks
