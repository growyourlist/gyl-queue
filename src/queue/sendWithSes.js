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
	sendBulkTemplatedEmail: (input) => {
		return {
			promise: () => new Promise((resolve) => {
				const list = input.Destinations.map(
					dest => `${dest.Destination.ToAddresses[0]} (${
						dest.ReplacementTags.map(tag => {
							return tag.Value
						}).join(', ')
					})`
				)
				console.log(`Sending "${input.Template}" template to: ${list.slice(0, 2).join(', ')}${list.length > 2 ? '...' : ''}`)
				console.log(`From source: ${input.Source}`)
				resolve({
					Status: input.Destinations.map(() => ({
						Status: 'Success',
					}))
				})
				return;
			})
		}
	},
	sendEmail: (input) => {
		return {
			promise: () => new Promise((resolve) => {
				const messageKeys = Object.keys(input.Message.Body)
				console.log(`Sending ${messageKeys.length ? messageKeys.join(' and ') : 'blank'} email to ${input.Destination.ToAddresses[0]}`)
				resolve({MessageId: 'MockMessageId'})
				return;
			})
		}
	}
}

const unsubLinkTemplate = process.env.UNSUBSCRIBE_LINK_TEMPLATE || ''

if (!process.env.SOURCE_EMAIL || !process.env.SOURCE_EMAIL.trim()) {
	throw new Error(`Please provide a default SOURCE_EMAIL address in the .env file. This address will be the default from address for all emails that do not have a more specific source email address (i.e. set for the template or list).`)
}

const generateBody = itemBody => {
	const Body = {}
	if (itemBody.html) {
		Body.Html = {
			Data: itemBody.html,
			Charset: 'UTF-8',
		}
	}
	if (itemBody.text) {
		Body.Text = {
			Data: itemBody.text,
			Charset: 'UTF-8',
		}
	}
	return Body;
}

const sendWithSes = async (batch, dateStamp) => {
	const templateGroups = {};
	const textHtmlEmails = [];

	// Sort emails into template groups or, if no template applies, then plain
	// text/html emails.
	batch.forEach(item => {
		if (!item.templateId) {
			textHtmlEmails.push(item)
		}
		else if (templateGroups[item.templateId]) {
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
			debugLog(`Adding ${broadcastId} to history`)

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
			]).then(async templateAndListSettings => {
				const templateSettings = templateAndListSettings[0]
				const listSourceEmail = (templateAndListSettings[1] && templateAndListSettings[1].sourceEmail) || ''
				const unsubscribeLink = (
					templateSettings.unsubscribeLink || unsubLinkTemplate
				)
				try {
					const sesRes = await ses.sendBulkTemplatedEmail({
						Source: templateSettings.sourceEmail || 
							listSourceEmail ||
							process.env.SOURCE_EMAIL,
						Template: templateId,
						ConfigurationSetName: process.env.SES_CONFIGURATION_SET_NAME || 'GylSesConfigurationSet',
						DefaultTemplateData: JSON.stringify({}),
						DefaultTags: [
							{ Name: 'TemplateId', Value: templateId },
							{ Name: 'DateStamp', Value: dateStamp || 'none' },
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
							};
							const replacementTags = [
								{
									Name: 'RunAtModified',
									Value: item.runAtModified.replace('.', '_'),
								}
							];
							if (item.tagOnClick) {
								replacementTags.push({
									Name: 'Interaction-Click',
									Value: `add-tag_${item.tagOnClick}`
								})
							};
							if (item.tagOnOpen) {
								replacementTags.push({
									Name: 'Interaction-Open',
									Value: `add-tag_${item.tagOnOpen}`
								})
							};
							destParams.ReplacementTags = replacementTags;
							return destParams;
						}),
					}).promise();
					resolve(templateGroups[templateId].map((item, index) => {
						const rawStatus = sesRes.Status[index].Status
						const status = (rawStatus === 'Success') ? 'success' : 'failed'
						const summary = {
							item,
							status,
							timestamp: Date.now(),
						}
						if (status !== 'success') {
							summary.failureReason = sesRes.Status[index].Status
						}
						return summary
					}))
				}
				catch (err) {
					console.log(`Error sending bulk email: ${err.message}`)
					resolve(templateGroups[templateId].map(item => ({
						item,
						status: 'failed',
						timestamp: Date.now(),
						failureReason: err.name || err.message,
					})))
				}
			})
		))
	}

	const individualSends = []
	textHtmlEmails.forEach(item => {
		individualSends.push(
			getListSettings(item.tagReason)
			.then(async listSettings => {
				return await ses.sendEmail({
					Destination: { ToAddresses: [ item.subscriber.email ] },
					Source: item.sourceEmail || (listSettings && listSettings.sourceEmail) || process.env.SOURCE_EMAIL,
					Message: {
						Subject: {
							Charset: 'UTF-8',
							Data: item.subject,
						},
						Body: generateBody(item.body)
					}
				})
				.promise()
				.then(() => {
					const summary = {
						item,
						status: 'success',
						timestamp: Date.now(),
					};
					return summary;
				})
				.catch(err => {
					console.log(`Error sending individual message: ${err.message}`)
					const summary = {
						item,
						status: 'failed',
						timestamp: Date.now(),
						failureReason: err.name || err.message
					};
					return summary;
				})
			})
		)
	})

	const results = await Promise.all([
		Promise.all(individualSends),
		Promise.all(bulkSends),
		Promise.all(historyUpdates),
	])

	// Start by collecting results in individualSends
	const allItems = results[0];

	// Then cycle through all the template groups and collect those results too.
	const groups = results[1];
	groups.forEach(group => allItems.push(...group));
	console.log(`Processed ${allItems.length} emails`);
	return allItems;
}

module.exports = sendWithSes
