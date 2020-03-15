const isVerbose = !!process.env.VERBOSE

const Logger = {
	info: message => {
		if (isVerbose) {
			console.info(message)
		}
	},
	log: message => console.log(message),
	warn: message => console.warn(message),
	error: message => console.error(message),
}

module.exports = Logger
