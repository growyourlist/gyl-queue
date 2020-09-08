require('dotenv').config();
const readline = require('readline');
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

const QueueManager = require('./QueueManager');
queueManager = new QueueManager();
queueManager.on();

process.on('SIGTERM', async () => {
	console.log('stopping queue because of SIGTERM');
	if (queueManager.getIsProcessing()) {
		await queueManager.off();
		console.log('queue stopped');
		rl.close();
	} else {
		rl.close();
	}
	process.removeAllListeners();
});

rl.on('line', (line) => {
	if (line.trim() === 'stop') {
		if (queueManager.getIsProcessing()) {
			queueManager.off();
		} else {
			console.log('Already stopped');
		}
	} else if (line.trim() === 'start') {
		if (!queueManager.getIsProcessing()) {
			queueManager.on();
		} else {
			console.log('Already running');
		}
	}
});
