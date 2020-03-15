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

const generateFakeBody = i => {
	const remainder = i % 3;
	switch (remainder) {
		case 1: return {
			text: 'Test text and html',
			html: '<p><i>Test text and html</i></p>',
		}
		case 2: return {
			text: 'Test text only',
		}
		default: return {
			html: '<p><strong>Test html only</strong></p>',
		}
	}
}

const generateIndividualSendFakeQueueItems = (numberOfItems, opts = {}) => {
	return Array(numberOfItems).fill(null).map((_, i) => {
		const subscriberId = uuid()
		return newQueueItem({
			type: 'send email',
			subscriber: {
				subscriberId,
				email: `me${i}@test.localhost`,
			},
			subscriberId,
			tagReason: opts.tagReason || null,
			subject: 'Test individual send',
			body: generateFakeBody(i),
		})
	})
}

module.exports = {
	generateFakeQueueItems,
	generateIndividualSendFakeQueueItems,
}
