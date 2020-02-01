const uuid = require('uuid/v4')
const newQueueItem = require('../../src/queue/newQueueItem')

const generateFakeQueueItems = (numberOfItems, opts = {}) => {
	return Array(numberOfItems).fill(null).map((_, i) => {
		const subscriberId = uuid()
		return newQueueItem({
			type: 'send email',
			subscriber: {
				subscriberId,
				email: `me${i}@test.localhost`,
			},
			subscriberId,
			templateId: opts.templateId || 'TestTemplate',
			tagReason: opts.tagReason || null,
		})
	})
}

module.exports = generateFakeQueueItems
