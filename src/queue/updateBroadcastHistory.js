const db = require('./db')
const debugLog = require('./debugLog')
const dbTablePrefix = process.env.DB_TABLE_PREFIX || '';

const broadcastHistorySettingName = 'broadcastHistory'

const updateBroadcastHistory = async broadcastData => {

	// In this function a broadcast is defined by a templateId and a 
	// dateStamp (YYYY-MM-DD) combination.
	try {
		const broadcastHistoryResult = await db.get({
			TableName: `${dbTablePrefix}Settings`,
			Key: { settingName: broadcastHistorySettingName }
		})

		const { templateId, dateStamp } = broadcastData
		const broadcastHistory = (broadcastHistoryResult.Item && broadcastHistoryResult.Item.value) || {}
		const templateBroadcastHistory = broadcastHistory[templateId] || []

		if (!templateBroadcastHistory.length) {

			// A broadcast timespan ranges from the date it was first sent (the from
			// date) until the date it was last sent (the to date). The broadcast
			// history is an array of these to/from items, so it's easy to see the
			// full history of send dates for a given templateId.
			debugLog('Initialising template broadcast history for ' + templateId)
			templateBroadcastHistory.push({
				from: dateStamp,
				to: dateStamp
			})
			broadcastHistory[templateId] = templateBroadcastHistory
			await db.put({
				TableName: `${dbTablePrefix}Settings`,
				Item: {
					settingName: broadcastHistorySettingName,
					value: broadcastHistory,
				}
			})
			return
		}

		const lastChunk = templateBroadcastHistory[templateBroadcastHistory.length - 1]

		// See if the broadcast is already known about
		if (lastChunk.to === dateStamp) {
			debugLog('Skipping saving template, already present')
			// The current date is already saved for the given email, nothing more to
			// do.
			return
		}

		// See if the broadcast was already being sent the day before
		const dayBefore = new Date(dateStamp)
		dayBefore.setDate(dayBefore.getDate() - 1)
		const dayBeforeISOCalendarDateString = dayBefore.toISOString().substring(0, 10)
		if (lastChunk.to === dayBeforeISOCalendarDateString) {
			// We already know about this broadcast, let's extend the range to include
			// the current send date as well.
			debugLog('Updating range in current broadcast chunk')
			const updatedChunk = {
				from: lastChunk.from,
				to: dateStamp,
			}
			templateBroadcastHistory.splice(templateBroadcastHistory.length-1, 1, updatedChunk)
			broadcastHistory[templateId] = templateBroadcastHistory
			await db.put({
				TableName: `${dbTablePrefix}Settings`,
				Item: {
					settingName: broadcastHistorySettingName,
					value: broadcastHistory,
				}
			})
			return
		}

		// At this point, we know that the templateId has a broadcast history, but
		// the current send is probably not part of that history. Therefore, we
		// can push a new range onto the history and save that.
		const newChunk = {
			from : dateStamp,
			to: dateStamp,
		}
		templateBroadcastHistory.push(newChunk)
		broadcastHistory[templateId] = templateBroadcastHistory
		await db.put({
			TableName: `${dbTablePrefix}Settings`,
			Item: {
				settingName: broadcastHistorySettingName,
				value: broadcastHistory,
			}
		})
	}
	catch (err) {

		// Note but ignore errors, updating broadcast history is a non-critical
		// task.
		console.error(err)
	}
}

module.exports = updateBroadcastHistory
