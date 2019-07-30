const db = require('./db')

const unsubscribeSubscribers = batch => {
	return Promise.all(batch.map(item => {
		return db.query({
			TableName: 'Queue',
			IndexName: 'subscriberId-index',
			KeyConditionExpression: '#subscriberId = :subscriberId',
			FilterExpression: '#queuePlacement = :queued',
			ExpressionAttributeNames: {
				'#subscriberId': 'subscriberId',
				'#queuePlacement': 'queuePlacement',
			},
			ExpressionAttributeValues: {
				':subscriberId': item.subscriberId,
				':queued': 'queued',
			}
		})
		.then(queuedItemsResult => {
			return db.update({
				TableName: 'Subscribers',
				Key: { subscriberId: item.subscriberId },
				UpdateExpression: 'SET #unsubscribed = :true, #tags = :unsubtags',
				ExpressionAttributeNames: {
					'#unsubscribed': 'unsubscribed',
					'#tags': 'tags',
				},
				ExpressionAttributeValues: {
					':true': true,
					':unsubtags': ['unsubscribed'],
				}
			})
			.then(() => {
				if (!queuedItemsResult.Count) {
					return
				}
				return Promise.all(queuedItemsResult.Items.map(item => {
					return db.delete({
						TableName: 'Queue',
						Key: {
							queuePlacement: item.queuePlacement,
							runAtModified: item.runAtModified,
						}
					})
				}))
			})
		})
		.then(deleteResult => {
			return {
				item,
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

module.exports = unsubscribeSubscribers
