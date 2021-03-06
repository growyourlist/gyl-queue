const db = require('./db')
const dbTablePrefix = process.env.DB_TABLE_PREFIX || '';

const refreshSubscribers = batch => {
	return Promise.all(batch.map(item => {
		return db.get({
			TableName: `${dbTablePrefix}Subscribers`,
			Key: { subscriberId: item.subscriberId }
		})
		.then(subscriberResult => {
			if (!subscriberResult || !subscriberResult.Item) {
				throw new Error('Subscriber not found')
			}
			const subscriber = subscriberResult.Item
			return {
				item: Object.assign({}, item, { subscriber }),
				status: 'success',
				timestamp: Date.now(),
			}
		})
		.catch(err => {
			return {
				item,
				status: 'failed',
				timestamp: Date.now(),
				failureReason: err.message,
			}
		})
	}))
}

module.exports = refreshSubscribers
