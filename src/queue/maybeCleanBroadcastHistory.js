/**
 * Returns same broadcastHistory object passed in if it contains items from the
 * same day or it is empty. If the history contains items from a different day
 * (i.e. yesterday in most cases), then a new temporary history object is
 * returned.
 * @param {object} broadcastHistory 
 */
const maybeCleanBroadcastHistory = broadcastHistory => {
	const historyKeys = Object.keys(broadcastHistory)
	if (!historyKeys.length) {
		return broadcastHistory
	}
	const today = (new Date).toISOString().substring(0, 10)
	if (today !== broadcastHistory[historyKeys[0]]) {
    return {}
	}
  return broadcastHistory
}

module.exports = maybeCleanBroadcastHistory
