/**
 * Filtering module for serial monitor lines
 */

export interface LineEntry {
	text: string;
	lineNumber: number | null;
	isBuffer: boolean;
}

/**
 * Remove ANSI escape codes from text
 */
export function stripAnsiCodes(text: string): string {
	// ANSI escape sequence: ESC[ (0x1B)
	// Use character code escape sequence in regex pattern string
	const pattern = '\\\\x1b\\\\[[0-9;]*[a-zA-Z]';
	const ansiRegex = new RegExp(pattern, 'g');
	return text.replace(ansiRegex, '');
}

/**
 * Apply simple text filter to line entries
 * @param entries Array of line entries to filter
 * @param pattern Filter pattern (simple substring match)
 * @returns Filtered array of line entries
 */
export function applyFilter(entries: LineEntry[], pattern: string): LineEntry[] {
	if (!pattern || pattern.trim() === '') {
		return entries;
	}

	const trimmedPattern = pattern.trim();
	return entries.filter(entry => {
		const plainText = stripAnsiCodes(entry.text);
		return plainText.includes(trimmedPattern);
	});
}

