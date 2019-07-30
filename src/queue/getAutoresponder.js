const db = require('./db')

const cachedAutoresponders = {}

// Cache autoresponders for 10 minutes
const cacheExpiration = 600000

/**
 * Fetches the autoresponder associated with the given autoresponder id from the
 * cache if it is cached, otherwise from the database.
 * @param  {String} autoresponderId
 * @return {Promise}
 */
const getAutoresponder = autoresponderId => {
	const inCache = cachedAutoresponders[autoresponderId]
	&& cachedAutoresponders[autoresponderId].cachedAt > (
		Date.now() - cacheExpiration
	)
	if (inCache) {
		return Promise.resolve(cachedAutoresponders[autoresponderId].item)
	}
	return db.get({
		TableName: 'Settings',
		Key: {
			settingName: `autoresponder-${autoresponderId}`
		}
	}).then(data => {
		cachedAutoresponders[autoresponderId] = {
			cachedAt: Date.now() + parseInt(Math.random() * 15000),
			item: data.Item.value,
		}
		return data.Item.value
	})
}

module.exports = getAutoresponder
