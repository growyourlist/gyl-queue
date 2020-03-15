const sendWithSes = require('./sendWithSes')

/**
 * Sends an email using the configured send method.
 *
 * In the future, smtp could be supported here by using:
 * switch (process.env.EMAIL_SERVICE) {
 *	case 'ses': return sendWithSes(batch)
 *	case 'smtp': return sendWithSmtp(batch)
 *	default: throw new Error('Unknown email delivery method')
 * }
 *
 * Of course, sendWithSmtp would need to be created!
 *
 * @param  {Array} batch
 * @return {Promise}
 */
const sendEmailBatch = async (batch, dateStamp) => {
	if (!batch.length) {
		return batch;
	}
	return await sendWithSes(batch, dateStamp)
}

module.exports = sendEmailBatch
