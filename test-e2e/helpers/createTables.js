const dynamodb = require('../../src/dynamoDBClient');
const Logger = require('../../src/Logger');

const tableDefinitions = require('./tableDefinitions');

const createTables = async () => {
	// Only one table with a secondary index can be created at a time. Therefore,
	// only create one table at a time.
	for (let i = 0; i < tableDefinitions.length; i++) {
		const tableDefinition = tableDefinitions[i];
		const { TableName } = tableDefinition
		try {
			Logger.info(`Checking for table: ${TableName}`)
			await dynamodb.describeTable({ TableName }).promise()
		}
		catch (err) {
			if (err.code === 'ResourceNotFoundException') {
				console.log(`Creating table: ${TableName}`);
				await dynamodb.createTable(tableDefinition).promise();
				await dynamodb.waitFor('tableExists', { TableName }).promise();
			}
			else {
				throw err
			}
		}
	}
}

module.exports = createTables
