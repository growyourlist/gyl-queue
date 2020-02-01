const db = require('./db')

const cachedLists = {}

// Cache template settings for 10 minutes
const cacheExpiration = 600000

/**
 * Fetches the list settings associated with the given tags (only the first
 * list is used) from the cache if it is cached, otherwise from the database.
 * @param  {String} tags
 * @return {Promise}
 */
const getListSettings = async tags => {
    const listId = (
        (Array.isArray(tags) && tags) || 
        ((typeof tags === 'string') && [tags]) ||
        []
    ).filter(tag => tag.indexOf('list-') === 0)[0]
    if (!listId) {
        return null
    }

	const inCache = cachedLists[listId] && cachedLists[listId].cachedAt > (
		Date.now() - cacheExpiration
	)
	if (inCache) {
		return Promise.resolve(cachedLists[listId].item)
    }
    try {
        // Get the lists settings from the db.
        const listSettingsResponse = await db.get({
            TableName: 'Settings',
            Key: {
                settingName: `lists`
            }
        })

        // Create a placeholder if no lists are found in the db.
        if (!listSettingsResponse.Item ||
            !Array.isArray(listSettingsResponse.Item.value)
        ) {
            cachedLists[listId] = {
                cachedAt: Date.now() + parseInt(Math.random() * 15000),
                item: {
                    id: listId,
                    sourceEmail: process.env.FALLBACK_SOURCE_EMAIL,
                }
            }
            return Promise.resolve(cachedLists[listId].item)
        }

        // Cache all the list settings in a quick-to-retrieve way.
        const cachedAt = Date.now() + parseInt(Math.random() * 15000)
        listSettingsResponse.Item.value.forEach(list => {
            cachedLists[list.id] = {
                item: list,
                cachedAt,
            }
        })

        if (cachedLists[listId] && cachedLists[listId].item) {
            return Promise.resolve(cachedLists[listId].item)
        }

        // The list we're searching for was not in the cache, so add an empty
        // version of it.
        cachedLists[listId] = {
			cachedAt: Date.now() + parseInt(Math.random() * 15000),
			item: {
				id: listId,
				sourceEmail: process.env.FALLBACK_SOURCE_EMAIL,
			}
        }
        return Promise.resolve(cachedLists[listId].item)
    }
	catch (err) {
        // Log the error, but then use the fallback email.
        console.error(err)
		cachedLists[listId] = {
			cachedAt: Date.now() + parseInt(Math.random() * 15000),
			item: {
				id: listId,
				sourceEmail: process.env.FALLBACK_SOURCE_EMAIL,
			}
		}
		return Promise.resolve(cachedLists[listId].item)
	}
}

module.exports = getListSettings
