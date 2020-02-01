const db = require('./db')

const cachedTemplates = {}

// Cache template settings for 10 minutes
const cacheExpiration = 600000

/**
 * Fetches the template settings associated with the given template id from the
 * cache if it is cached, otherwise from the database.
 * @param  {String} templateId
 * @return {Promise}
 */
const getTemplateSettings = templateId => {
	const inCache = cachedTemplates[templateId]
	&& cachedTemplates[templateId].cachedAt > (
		Date.now() - cacheExpiration
	)
	if (inCache) {
		return Promise.resolve(cachedTemplates[templateId].item)
	}
	return db.get({
		TableName: 'Settings',
		Key: {
			settingName: `template-${templateId}`
		}
	})
	.then(data => {
		if (!data.Item) {
			throw new Error('Item not found')
		}
		cachedTemplates[templateId] = {
			cachedAt: Date.now() + parseInt(Math.random() * 15000),
			item: data.Item.value,
		}
		return data.Item.value
	})
	.catch(err => {
		cachedTemplates[templateId] = {
			cachedAt: Date.now() + parseInt(Math.random() * 15000),
			item: {
				templateId,
				sourceEmail: null,
			}
		}
		return cachedTemplates[templateId].item
	})
}

module.exports = getTemplateSettings
