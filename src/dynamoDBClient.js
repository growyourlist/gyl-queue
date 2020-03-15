const AWS = require('aws-sdk');

const dynamodbParams = {
	region: process.env.AWS_REGION,
};

if (process.env.DYNAMODB_ENDPOINT) {
	dynamodbParams.endpoint = process.env.DYNAMODB_ENDPOINT;
}
else {
	dynamodbParams.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
	dynamodbParams.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
}

module.exports = new AWS.DynamoDB(dynamodbParams);
