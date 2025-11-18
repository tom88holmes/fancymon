// Simple script to increment build number
const fs = require('fs');
const path = require('path');

const buildNumberFile = path.join(__dirname, '.build-number');

let buildNumber = 1;
try {
	if (fs.existsSync(buildNumberFile)) {
		const content = fs.readFileSync(buildNumberFile, 'utf8').trim();
		buildNumber = parseInt(content, 10) || 1;
		buildNumber++;
	}
} catch (err) {
	// If we can't read it, start at 1
	buildNumber = 1;
}

fs.writeFileSync(buildNumberFile, buildNumber.toString(), 'utf8');
console.log(`Build number: ${buildNumber}`);

// Also write it as a JSON file for easy reading
fs.writeFileSync(
	path.join(__dirname, 'build-info.json'),
	JSON.stringify({ buildNumber, timestamp: new Date().toISOString() }, null, 2),
	'utf8'
);

