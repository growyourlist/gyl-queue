/* istanbul ignore file */

const isDebug = process.env.DEBUG === 'true' || !!process.env.VERBOSE;

const debugLog = message => {
	if (isDebug) {
		console.log(message)
	}
}

module.exports = debugLog
