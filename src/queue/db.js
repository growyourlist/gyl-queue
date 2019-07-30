/* istanbul ignore file */

const dynamodb = require('dynopromise-client')

const dynamodbParams = {
	region: process.env.AWS_REGION
}

// Allow the ability to point dynamodb to a local endpoint for testing.
if (process.env.DYNAMODB_ENDPOINT) {
	dynamodbParams.endpoint = process.env.DYNAMODB_ENDPOINT
}
else {
	dynamodbParams.accessKeyId = process.env.AWS_ACCESS_KEY_ID
	dynamodbParams.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
}

const mockDb = {
	batchGet: params => Promise.resolve({}),
	batchWrite: params => Promise.resolve({}),
	delete: params => Promise.resolve({}),
	get: params => Promise.resolve({}),
	put: params => Promise.resolve({}),
	query: params => Promise.resolve({}),
	scan: params => Promise.resolve({}),
	transactGet: params => Promise.resolve({}),
	transactWrite: params => Promise.resolve({}),
	update: params => Promise.resolve({}),
}

const db = process.env.NODE_ENV === 'test' ? mockDb : dynamodb(dynamodbParams)

if (process.env.NODE_ENV === 'test') {
	global.mockDb = db
}

module.exports = db
