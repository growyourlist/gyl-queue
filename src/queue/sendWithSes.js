const AWS = require('aws-sdk')
const debugLog = require('./debugLog')
const getTemplateSettings = require('./getTemplateSettings')
const maybeCleanBroadcastHistory = require('./maybeCleanBroadcastHistory')
const updateBroadcastHistory = require('./updateBroadcastHistory')
const getListSettings = require('./getListSettings')

let broadcastHistory = {}

// Use real AWS.SES by default unless the SES_TEST environment variable is set
// to 'true'. In the case it is 'true', then use a mock object that will write
// to the console the actions it is taking.
const ses = process.env.SES_TEST !== 'true' ? new AWS.SES({
	region: process.env.AWS_REGION,
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
}) :
{
	sendBulkTemplatedEmail: (input, callback) => {
		const list = input.Destinations.map(
			dest => `${dest.Destination.ToAddresses[0]} (${
				dest.ReplacementTags.map(tag => {
					return tag.Value
				}).join(', ')
			})`
		).join(', ')
		console.log(`Sending "${input.Template}" template to: ${list}`)
		console.log(`From source: ${input.Source}`)
		console.log(input.DefaultTags)
		callback(null, {
			Status: input.Destinations.map(() => ({
				Status: 'Success',
			})),
		})
	}
}

const unsubLinkTemplate = process.env.UNSUBSCRIBE_LINK_TEMPLATE || ''

if (!process.env.SOURCE_EMAIL || !process.env.SOURCE_EMAIL.trim()) {
	throw new Error(`Please provide a default SOURCE_EMAIL address in the .env file. This address will be the default from address for all emails that do not have a more specific source email address (i.e. set for the template or list).`)
}

const sendWithSes = (batch, dateStamp) => {

	const templateGroups = {}
	batch.forEach(item => {
		if (templateGroups[item.templateId]) {
			templateGroups[item.templateId].push(item)
		}
		else {
			templateGroups[item.templateId] = [item]
		}
	})

	// Keep a record of which emails were sent on which day.
	const historyUpdates = []
	Object.keys(templateGroups).forEach(templateId => {
		const broadcastId = `${dateStamp} ${templateId}`
		if (!broadcastHistory[broadcastId]) {
			broadcastHistory = maybeCleanBroadcastHistory(broadcastHistory)
			debugLog(`${(new Date).toISOString()}: Adding ${broadcastId} to history`)

			// Save to history
			historyUpdates.push(
				updateBroadcastHistory({
					templateId,
					dateStamp,
				})
				.then(() => {
					broadcastHistory[broadcastId] = dateStamp
				})
			)
		}
	})

	const bulkSends = []
	for (let templateId in templateGroups) {
		bulkSends.push(new Promise(resolve => Promise.all([
				getTemplateSettings(templateId),
				getListSettings(templateGroups[templateId][0].tagReason)
			]).then(templateAndListSettings => {
				const templateSettings = templateAndListSettings[0]
				const listSourceEmail = (templateAndListSettings[1] && templateAndListSettings[1].sourceEmail) || ''
				const unsubscribeLink = (
					templateSettings.unsubscribeLink || unsubLinkTemplate
				)
				ses.sendBulkTemplatedEmail({
					Source: templateSettings.sourceEmail || 
						listSourceEmail ||
						process.env.SOURCE_EMAIL,
					Template: templateId,
					ConfigurationSetName: 'Default',
					DefaultTemplateData: JSON.stringify({}),
					DefaultTags: [
						{
							Name: 'TemplateId',
							Value: templateId
						},
						{
							Name: 'DateStamp',
							Value: dateStamp || 'none'
						},
					],
					Destinations: templateGroups[templateId].map(item => {
						const destParams = {
							Destination: { ToAddresses: [item.subscriber.email] },
							ReplacementTemplateData: JSON.stringify({
								subscriber: item.subscriber,
								unsubscribeLink: unsubscribeLink.replace(
									/\{\{subscriberId\}\}/,
									encodeURIComponent(item.subscriber.subscriberId)
								).replace(
									/\{\{email\}\}/,
									encodeURIComponent(item.subscriber.email)
								),
								params: item.params,
							}),
						}
						const replacementTags = [
							{
								Name: 'RunAtModified',
								Value: item.runAtModified.replace('.', '_'),
							}
						]
						if (item.tagOnClick) {
							replacementTags.push({
								Name: 'Interaction-Click',
								Value: `add-tag_${item.tagOnClick}`
							})
						}
						if (item.tagOnOpen) {
							replacementTags.push({
								Name: 'Interaction-Open',
								Value: `add-tag_${item.tagOnOpen}`
							})
						}
						destParams.ReplacementTags = replacementTags
						return destParams
					}),
				}, (err, data) => {
					if (err) {
						console.log(`${(new Date).toISOString()}: Error sending bulk email: `
						+ err.message)
						return resolve(templateGroups[templateId].map(item => ({
							item,
							status: 'failed',
							timestamp: Date.now(),
							failureReason: err.name || err.message,
						})))
					}
					return resolve(templateGroups[templateId].map((item, index) => {
						const rawStatus = data.Status[index].Status
						const status = (rawStatus === 'Success') ? 'success' : 'failed'
						const summary = {
							item,
							status,
							timestamp: Date.now(),
						}
						if (status !== 'success') {
							summary.failureReason = data.Status[index].Status
						}
						return summary
					}))
				})
			})
		))
	}
	return Promise.all([Promise.all(bulkSends), Promise.all(historyUpdates)])
	.then(results => {
		let allItems = []
		const groups = results[0]
		groups.forEach(group => allItems.push(...group))
		console.log(`${(new Date).toISOString()}: Processed ${allItems.length} `
		+ `emails`)
		return allItems
	})
}

module.exports = sendWithSes
