/**
 * Verify regex strings in the webview HTML produced by getWebviewContentHtml().
 * This is the actual runtime source (not dist/extension.js bundle escaping).
 *
 * Run: npx tsx scripts/verify_webview_template_regex.js
 */
'use strict';

import { getWebviewContentHtml } from '../src/webviewContent.ts';

const html = getWebviewContentHtml('');

function unescapeJsString(s) {
	return s.replace(/\\(.)/g, (_, c) => {
		if (c === 'n') {
			return '\n';
		}
		if (c === 'r') {
			return '\r';
		}
		if (c === 't') {
			return '\t';
		}
		return c;
	});
}

function extractQuotedConst(name) {
	const re = new RegExp('const ' + name + ' = ("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')');
	const m = html.match(re);
	if (!m) {
		return null;
	}
	const lit = m[1];
	const quote = lit[0];
	const body = lit.slice(1, -1);
	return quote === '"' ? JSON.parse(lit) : unescapeJsString(body);
}

function extractStripAnsiPattern() {
	if (html.includes('FANCYMON_STRIP_ANSI_PATTERN')) {
		const m = html.match(/const FANCYMON_STRIP_ANSI_PATTERN = ("(?:[^"\\\\]|\\\\.)*")/);
		return m ? JSON.parse(m[1]) : null;
	}
	const m = html.match(/function stripAnsiCodes\(text\) \{\s*const pattern = '([^']*)'/);
	return m ? m[1] : null;
}

function extractHostWallPrefixRe() {
	const m = html.match(/function buildHostWallTimestampPrefixRe\(\) \{[\s\S]*?return new RegExp\('([^']*)'/);
	return m ? m[1] : null;
}

function testRegExp(label, pattern, sample, expectMatch) {
	if (!pattern) {
		return { label, ok: false, error: 'pattern missing' };
	}
	let re;
	try {
		re = new RegExp(pattern);
	} catch (e) {
		return { label, ok: false, error: 'Invalid RegExp: ' + e.message, pattern };
	}
	const m = re.exec(sample);
	const matched = !!m;
	return {
		label,
		ok: matched === expectMatch,
		pattern,
		sample: sample.slice(0, 72),
		match: m ? m[0] : null,
		capture1: m && m[1] != null ? m[1] : null
	};
}

const LOCAL = extractQuotedConst('LOCAL_BRACKETED_TIME_PATTERN');
const RTC = extractQuotedConst('RTC_DATETIME_TIME_PATTERN');
const UPTIME = extractQuotedConst('DEFAULT_UPTIME_TIME_PATTERN');
const stripAnsiPat = extractStripAnsiPattern();
const hostWallPat = extractHostWallPrefixRe();

const sampleHost =
	'[17:54:11.583] I [2026-05-18 05:54:09.776](1409827) mem_util: internal: 43KB';
const sampleRtc = 'I [2026-05-18 05:54:09.776](1409827) mem_util';
const sampleUptime = 'I [2026-05-18 05:54:09.776](1409827) mem_util';

const tests = [
	testRegExp('LOCAL_BRACKETED (host wall)', LOCAL, sampleHost, true),
	testRegExp('RTC_DATETIME', RTC, sampleRtc, true),
	testRegExp('DEFAULT_UPTIME', UPTIME, sampleUptime, true),
	testRegExp('LOCAL must not match RTC-only line', LOCAL, sampleRtc, false)
];

if (stripAnsiPat) {
	const ansi = '\x1b[31m';
	const stripped = (ansi + sampleHost).replace(new RegExp(stripAnsiPat, 'g'), '');
	tests.push({
		label: 'stripAnsi removes ESC[ only',
		ok: stripped === sampleHost,
		pattern: stripAnsiPat,
		sample: 'ESC[31m + line',
		match: stripped.slice(0, 40)
	});
}

if (hostWallPat) {
	tests.push(
		testRegExp('hostWallTimestampPrefixRe', hostWallPat, '[17:54:11.583] I [2026]', true)
	);
}

// generateCommonPattern number token in emitted script
const numM = html.match(/pattern \+= '\(-\?([^']*)'\)/);
if (numM) {
	tests.push(
		testRegExp(
			'generateCommonPattern number capture',
			'(-?' + numM[1] + ')',
			'internal: 43KB(44979)',
			true
		)
	);
}

// fileLineRegex — must not be corrupted to literal "d" instead of digit class
const fileLineM = html.match(/const fileLineRegex = ([^;]+);/);
if (fileLineM) {
	try {
		const re = eval(fileLineM[1]);
		const sample = 'path/foo.c:233';
		const m = re.exec(sample);
		tests.push({
			label: 'fileLineRegex literal /.../ in template',
			ok: !!m && m[1] === 'path/foo.c' && m[2] === '233',
			pattern: String(re),
			sample,
			match: m ? m[0] : null
		});
	} catch (e) {
		tests.push({ label: 'fileLineRegex', ok: false, error: String(e) });
	}
}

console.log('FancyMon webview template regex verification (getWebviewContentHtml output)\n');
let failed = 0;
for (const t of tests) {
	const status = t.ok ? 'OK' : 'FAIL';
	if (!t.ok) {
		failed++;
	}
	console.log(status + '  ' + t.label);
	if (!t.ok) {
		if (t.error) {
			console.log('     error:', t.error);
		}
		console.log('     pattern:', JSON.stringify(t.pattern));
		console.log('     sample:', t.sample);
		console.log('     match:', t.match);
	}
}

console.log('\nRuntime pattern strings (as seen by the webview script):');
console.log('  LOCAL:     ', JSON.stringify(LOCAL));
console.log('  RTC:       ', JSON.stringify(RTC));
console.log('  UPTIME:    ', JSON.stringify(UPTIME));
console.log('  stripAnsi: ', JSON.stringify(stripAnsiPat));
console.log('  hostWall:  ', JSON.stringify(hostWallPat));

process.exit(failed > 0 ? 1 : 0);
