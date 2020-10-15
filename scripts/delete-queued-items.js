require('dotenv').config();
const AWS = require('aws-sdk');
const { writeAllForDynamoDB } = require('write-all-for-dynamodb');
const { queryAllForDynamoDB } = require('query-all-for-dynamodb');

const dbTablePrefix = process.env.DB_TABLE_PREFIX || '';
const dynamodbParams = {
	region: process.env.AWS_REGION,
};

if (process.env.DYNAMODB_ENDPOINT) {
	dynamodbParams.endpoint = process.env.DYNAMODB_ENDPOINT;
} else {
	dynamodbParams.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
	dynamodbParams.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
}

const db = new AWS.DynamoDB.DocumentClient(dynamodbParams);

const deleteQueuedItems = async () => {
	try {
		const queueItems = await queryAllForDynamoDB(db, {
			TableName: `${dbTablePrefix}Queue`,
			KeyConditionExpression: '#queuePlacement = :queued',
			ExpressionAttributeNames: {
				'#queuePlacement': 'queuePlacement',
			},
			ExpressionAttributeValues: {
				':queued': 'queued',
			},
		});
		if (queueItems.Count) {
			await writeAllForDynamoDB(db, {
				RequestItems: {
					[`${dbTablePrefix}Queue`]: queueItems.Items.map((item) => ({
						DeleteRequest: {
							Key: {
								queuePlacement: item.queuePlacement,
								runAtModified: item.runAtModified,
							},
						},
					})),
				},
			});
			console.log(`Queue cleared: ${queueItems.Count} items deleted`);
		} else {
			console.log('No queued items found');
		}
	} catch (err) {
		console.error(err);
	}
};

deleteQueuedItems();
