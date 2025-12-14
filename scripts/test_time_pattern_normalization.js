// Test script for time pattern normalization
// Run with: node scripts/test_time_pattern_normalization.js

function normalizeTimePatternInputValue(pattern) {
	if (!pattern) return '';
	let p = (pattern || '').trim();
	
	// Normalize double-escapes (from UI display) to single escapes (for RegExp)
	p = p.split('\\\\\\\\s').join('\\\\s');
	p = p.split('\\\\\\\\t').join('\\\\t');
	p = p.split('\\\\\\\\r').join('\\\\r');
	p = p.split('\\\\\\\\n').join('\\\\n');
	p = p.split('\\\\\\\\[').join('\\\\[');
	p = p.split('\\\\\\\\]').join('\\\\]');
	p = p.split('\\\\\\\\(').join('\\\\(');
	p = p.split('\\\\\\\\)').join('\\\\)');
	p = p.split('\\\\\\\\.').join('\\\\.');
	p = p.split('\\\\\\\\+').join('\\\\+');
	p = p.split('\\\\\\\\*').join('\\\\*');
	p = p.split('\\\\\\\\?').join('\\\\?');
	p = p.split('\\\\\\\\{').join('\\\\{');
	p = p.split('\\\\\\\\}').join('\\\\}');

	const looksLikeRtc = p.includes('\\d{4}-\\d{2}-\\d{2}') && p.includes('\\d{2}:\\d{2}:\\d{2}');
	const looksLikeRtcLoose = p.includes('d{4}-d{2}-d{2}') && p.includes('d{2}:d{2}:d{2}');
	
	const looksLikeRtcWithBrackets = (p.startsWith('[') || p.includes('[')) && 
		(p.includes('d{4}') || p.includes('\\d{4}')) && 
		(p.includes('d{2}:') || p.includes('\\d{2}:') || p.includes('d{2}-') || p.includes('\\d{2}-'));

	console.log('  looksLikeRtc:', looksLikeRtc, 'looksLikeRtcLoose:', looksLikeRtcLoose, 'looksLikeRtcWithBrackets:', looksLikeRtcWithBrackets);

	// Step 1: Convert d{N} -> \d{N}
	let hasUnescapedD = false;
	for (let i = 0; i < p.length - 1; i++) {
		if (p[i] === 'd' && p[i + 1] === '{' && (i === 0 || p[i - 1] !== '\\')) {
			hasUnescapedD = true;
			break;
		}
	}
	
	if (p.includes('d{') && !p.includes('\\d{')) {
		console.log('  Converting d{N} to \\d{N}');
		let out = '';
		for (let i = 0; i < p.length; i++) {
			const ch = p[i];
			const prevIsBackslash = i > 0 && p[i - 1] === '\\';
			if (ch === 'd' && p[i + 1] === '{' && !prevIsBackslash) {
				let j = i + 2;
				let digits = '';
				while (j < p.length && p[j] >= '0' && p[j] <= '9') {
					digits += p[j];
					j++;
				}
				if (digits.length > 0 && p[j] === '}') {
					out += '\\d{' + digits + '}';
					i = j;
					continue;
				}
			}
			out += ch;
		}
		p = out;
	}

	// Step 2: Escape brackets and dots
	const needsBracketEscaping = (looksLikeRtc || looksLikeRtcLoose || looksLikeRtcWithBrackets) || 
		(p.startsWith('[') && (p.includes('d{4}') || p.includes('\\d{4}') || p.includes('-') && p.includes(':')));
	
	if (needsBracketEscaping) {
		console.log('  Escaping brackets and dots');
		let result = '';
		for (let i = 0; i < p.length; i++) {
			const prevIsBackslash = i > 0 && p[i - 1] === '\\';
			if (p[i] === '[' && !prevIsBackslash) {
				result += '\\[';
			} else if (p[i] === ']' && !prevIsBackslash) {
				result += '\\]';
			} else {
				result += p[i];
			}
		}
		p = result;
		
		result = '';
		for (let i = 0; i < p.length; i++) {
			const prevIsBackslash = i > 0 && p[i - 1] === '\\';
			if (p[i] === '.' && !prevIsBackslash) {
				result += '\\.';
			} else {
				result += p[i];
			}
		}
		p = result;
	}

	return p;
}

// Test cases
const testCases = [
	{
		name: 'User input pattern with unescaped brackets and d{N}',
		input: '[(d{4}-d{2}-d{2} d{2}:d{2}:d{2}.d{3})]',
		expected: '\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\]'
	},
	{
		name: 'Pattern with already escaped brackets but unescaped d{N}',
		input: '\\[(d{4}-d{2}-d{2} d{2}:d{2}:d{2}\\.d{3})\\]',
		expected: '\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\]'
	},
	{
		name: 'Fully escaped pattern (should remain unchanged)',
		input: '\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\]',
		expected: '\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\]'
	},
	{
		name: 'Uptime pattern (should remain unchanged)',
		input: '\\(\\d+\\)',
		expected: '\\(\\d+\\)'
	}
];

console.log('Testing time pattern normalization:\n');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
	console.log(`Test: ${testCase.name}`);
	console.log(`  Input:    ${testCase.input}`);
	
	const result = normalizeTimePatternInputValue(testCase.input);
	console.log(`  Output:   ${result}`);
	console.log(`  Expected: ${testCase.expected}`);
	
	// Test if the result creates a valid RegExp
	let isValidRegex = false;
	try {
		new RegExp(result);
		isValidRegex = true;
	} catch (e) {
		console.log(`  ERROR: Invalid regex - ${e.message}`);
	}
	
	const matches = result === testCase.expected;
	
	if (matches && isValidRegex) {
		console.log(`  ✓ PASSED\n`);
		passed++;
	} else {
		console.log(`  ✗ FAILED`);
		if (!matches) {
			console.log(`    Output doesn't match expected`);
		}
		if (!isValidRegex) {
			console.log(`    Result is not a valid regex`);
		}
		console.log('');
		failed++;
	}
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed > 0) {
	process.exit(1);
}

