require('dotenv').config()
const { exec, spawn } = require('child_process')
const { createTables } = require('gyl-init')
const dynopromise = require('dynopromise-client')

const downloadDynamodb = require('./helpers/downloadDynamodb')
const generateFakeQueueItems = require('./helpers/generateFakeQueueItems')
const QueueManager = require('../src/QueueManager')

const dynamodbCmd = 'java -DDynamodDBLocal_lib/ -jar DynamoDBLocal.jar '
+ '-inMemory'

const dbPrefix = process.env.DB_PREFIX || ''

const db = dynopromise({
	region: process.env.AWS_REGION,
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	endpoint: process.env.DYNAMODB_ENDPOINT,
})

const startDynamodbLocal = () => new Promise((resolve, reject) => {
	try {
		isRunning = false
		const dynamodbProcess = exec(dynamodbCmd, {
			cwd: 'dynamodb_local_latest',
			killSignal: 'SIGINT',
		})
		dynamodbProcess.stdout.on('data', chunk => {
			if (chunk.indexOf('CorsParams') >= 0) {
				isRunning = true
				resolve(dynamodbProcess)
			}
		})
		dynamodbProcess.stderr.on('error', err => console.error(err))
		setTimeout(() => {
			if (!isRunning) {
				reject(new Error('Timed out waiting for DynamoDB Local to start'))
			}
		}, 2000)
	}
	catch (err) {
		reject(err)
	}
})

const addFakeItems = async () => {
	const fakeItems1 = generateFakeQueueItems(3, {
		tagReason: ['list-test']
	})
	await Promise.all(fakeItems1.map(Item => db.put({
		TableName: `${dbPrefix}Queue`,
		Item
	})))
	const fakeItems2 = generateFakeQueueItems(3, {
		tagReason: ['list-testb']
	})
	await Promise.all(fakeItems2.map(Item => db.put({
		TableName: `${dbPrefix}Queue`,
		Item
	})))
	const fakeItems3 = generateFakeQueueItems(3, {
		tagReason: ['list-test'],
		templateId: 'TestSourceTemplate',
	})
	await Promise.all(fakeItems3.map(Item => db.put({
		TableName: `${dbPrefix}Queue`,
		Item
	})))
}

const setListSettings = async () => {
	await db.put({
		TableName: `${dbPrefix}Settings`,
		Item: {
			"settingName": "lists",
			"value": [
				{
					"id": "list-test",
					"name": "Ima Tester",
					"sourceEmail": "=?utf-8?B?4q2Q?= Ima <tester@test.localhost>"
				}
			]
		}
	})
}

const setTestSourceTemplateSettings = async () => {
	await db.put({
		TableName: `${dbPrefix}Settings`,
		Item: {
			"settingName": "template-TestSourceTemplate",
			"value": {
				"sourceEmail": "Source Test <tester2@test.localhost>"
			}
		}
	})
}

const run = async () => {
	await downloadDynamodb()
	const processes = {
		dynamoDB: await startDynamodbLocal(),
	}

	const quitDynamoDB = async () => {
		// Exit DynamoDB
		if (!processes.dynamoDB) {
			console.warn('Could not find DynamoDB process')
			return
		}
		if (typeof processes.dynamoDB.kill === 'function') {
			try {
				await new Promise((resolve, reject) => {
					if (!processes.dynamoDB || processes.dynamoDB.killed) {
						return resolve()
					}
					let timeoutId = setTimeout(() => {
						reject(new Error('Could not close DynamoDB'))
					}, 2000)
					processes.dynamoDB.on('exit', () => {
						clearTimeout(timeoutId)
						timeoutId = null
						process.dynamoDB = null
						resolve()
					})
					spawn("taskkill", ["/pid", processes.dynamoDB.pid, '/f', '/t']);
				})
			}
			catch (err) {
				console.error(err)
			}
		}
		else {
			console.warn('Could not find DynamoDB kill function')
		}
	}

	try {
		if (!process.env.DYNAMODB_ENDPOINT) {
			throw new Error('Expected DynamoDB endpoint to be used for testing')
		}

		await createTables({
			region: process.env.AWS_REGION,
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			endpoint: process.env.DYNAMODB_ENDPOINT,
		})

		await addFakeItems()
		await setListSettings()
		await setTestSourceTemplateSettings()

		await new Promise(async (resolve, reject) => {
			try {
				const queueManager = new QueueManager
				queueManager.on()
				await new Promise(resolve => setTimeout(resolve, 1000))
				await addFakeItems()
				await new Promise(resolve => setTimeout(resolve, 1000))
				await addFakeItems()
				setTimeout(async () => {
					try {
						await queueManager.off()
						resolve()
					}
					catch (err) {
						console.error(err)
					}
				}, 4000)
			}
			catch (err) {
				reject(err)
			}
		})
	}
	catch (err) {
		console.error(err)
	}
	finally {
		await quitDynamoDB()
		process.exit()
	}
}

run().catch(err => console.error(err))
