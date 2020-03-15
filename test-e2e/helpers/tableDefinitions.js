const tablePrefix = process.env.DB_TABLE_PREFIX || ''

const tableDefinitions = [
	{
		TableName: `${tablePrefix}Settings`,
		ProvisionedThroughput: {
			ReadCapacityUnits: 1,
			WriteCapacityUnits: 1,
		},
		KeySchema: [
			{
				AttributeName: 'settingName',
				KeyType: 'HASH',
			}
		],
		AttributeDefinitions: [
			{
				AttributeName: 'settingName',
				AttributeType: 'S'
			}
		]
	},
	{
		TableName: `${tablePrefix}Queue`,
		ProvisionedThroughput: {
			ReadCapacityUnits: 1,
			WriteCapacityUnits: 1,
		},
		KeySchema: [
			{
				AttributeName: 'queuePlacement',
				KeyType: 'HASH',
			},
			{
				AttributeName: 'runAtModified',
				KeyType: 'RANGE',
			}
		],
		GlobalSecondaryIndexes: [
			{
				IndexName: 'subscriberIdAndTagReason-index',
				KeySchema: [
					{
						AttributeName: 'subscriberId',
						KeyType: 'HASH',
					}
				],
				Projection: {
					NonKeyAttributes: [
						'tagReason'
					],
					ProjectionType: 'INCLUDE',
				},
				ProvisionedThroughput: {
					ReadCapacityUnits: 1,
					WriteCapacityUnits: 1,
				}
			}
		],
		AttributeDefinitions: [
			{
				AttributeName: 'queuePlacement',
				AttributeType: 'S',
			},
			{
				AttributeName: 'runAtModified',
				AttributeType: 'S',
			},
			{
				AttributeName: 'subscriberId',
				AttributeType: 'S',
			},
		],
	},
	{
		TableName: `${tablePrefix}Subscribers`,
		ProvisionedThroughput: {
			ReadCapacityUnits: 1,
			WriteCapacityUnits: 1,
		},
		KeySchema: [
			{
				AttributeName: 'subscriberId',
				KeyType: 'HASH',
			}
		],
		GlobalSecondaryIndexes: [
			{
				IndexName: 'EmailToStatusIndex',
				KeySchema: [
					{
						AttributeName: 'email',
						KeyType: 'HASH',
					}
				],
				Projection: {
					NonKeyAttributes: [
						'tagReason',
						'unsubscribed',
						'confirmed',
						'tags',
					],
					ProjectionType: 'INCLUDE',
				},
				ProvisionedThroughput: {
					ReadCapacityUnits: 1,
					WriteCapacityUnits: 1,
				}
			}
		],
		AttributeDefinitions: [
			{
				AttributeName: 'subscriberId',
				AttributeType: 'S',
			},
			{
				AttributeName: 'email',
				AttributeType: 'S',
			}
		]
	},
]

module.exports = tableDefinitions
