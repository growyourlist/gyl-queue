const fs = require('fs')
const https = require('https')

const get = url => new Promise((resolve, reject) => {
	https.get(url, res => {
		if (res.statusCode !== 200) {
			res.resume()
			reject(new Error(`Dynamodb local download request failed with code: ${res.statusCode}`))
			return
		}
		resolve(res)
	})
	.on('error', err => reject(err))
})

const downloadFile = async (url, path) => {
	const response = await get(url)
	return new Promise((resolve, reject) => {
		const writeStream = fs.createWriteStream(path)
		writeStream.on('error', err => {
			response.resume()
			writeStream.close()
			reject(err)
		})
		response.on('error', err => {
			response.resume()
			writeStream.close()
			reject(err)
		})
		response.pipe(writeStream)
		response.on('end', () => {
			writeStream.close()
			resolve()
		})
	})
}

module.exports = downloadFile
