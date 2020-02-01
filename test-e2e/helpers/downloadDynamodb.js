const fs = require('fs')
const unzipper = require('unzipper')

const downloadFile = require('./downloadFile')

const dynamodbUrl = 'https://s3.eu-central-1.amazonaws.com/dynamodb-local-frankfurt/dynamodb_local_latest.zip'
const downloadPath = 'dynamodb_local_latest.zip'
const dynamodbPath = 'dynamodb_local_latest'

const downloadDynamodb = async () => {
	if (!fs.existsSync(dynamodbPath)) {
		console.log(`Downloading latest DynamoDB Local`)
		await downloadFile(dynamodbUrl, downloadPath)
		return new Promise((resolve, reject) => {
			const readStream = fs.createReadStream(downloadPath)
			readStream.pipe(unzipper.Extract({path: dynamodbPath}))
			.on('error', err => reject(err))
			.on('end', () => {
				readStream.close()
				fs.unlinkSync(downloadPath)
				resolve()
			})
		})
	}
	else {
		console.log(`DynamoDB folder already exists: ${dynamodbPath}`)
	}
}

module.exports = downloadDynamodb
