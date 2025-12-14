/**
 * Quick local test for plot time/number extraction without launching VS Code.
 *
 * Run:
 *   node scripts/test_plot_time_extraction.js
 *
 * Edit SAMPLE_LINE / TIME_PATTERN below to try different cases.
 */

// -------------------------
// Inputs you can tweak
// -------------------------

// If you paste a real line, keep it as a single JS string.
const SAMPLE_LINE =
  'I [2025-12-14 01:19:35.024](355777) BATT_MON: battery_monitor_update IN: V_term=3.597V, chgEn=0, I_load=72mA OUT: V_ocv=3.611V, I_chg=0 mA, soc=17.4%, soc_ob=17.3, dt=4928.0, dv=0.0, cumulated_time=0.00';

// This should be the value from the webview "Time Pattern (X-axis)" input.
// Note: in JS strings, a single backslash is written as "\\".
const TIME_PATTERN = '\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\]';

// Additional sample lines for pattern-matching checks (paste your real logs here).
const SAMPLE_LINES = [
  'I [2025-12-14 01:44:17.807](1062261) BATT_MON: battery_monitor_update IN: V_term=3.572V, chgEn:0, I_load=175mA OUT: V_ocv=3.606V, I_chg=0 mA, soc=17.1%, soc_obs=16.7%, dt=236.0ms, dv=2.0mV, cumulated_time=0.00s',
  'I [2025-12-14 01:44:18.060](1062515) BATT_MON: battery_monitor_update IN: V_term=3.568V, chgEn:0, I_load=175mA OUT: V_ocv=3.606V, I_chg=0 mA, soc=17.1%, soc_obs=16.7%, dt=230.0ms, dv=4.0mV, cumulated_time=0.00s',
  'I [2025-12-14 01:44:18.319](1062773) BATT_MON: battery_monitor_update IN: V_term=3.572V, chgEn:0, I_load=175mA OUT: V_ocv=3.606V, I_chg=0 mA, soc=17.1%, soc_obs=16.7%, dt=234.0ms, dv=4.0mV, cumulated_time=0.00s'
];

// -------------------------
// Logic (mirrors webview)
// -------------------------

function stripAnsiCodes(text) {
  // same regex as webview but safe in Node string form
  return String(text).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

function normalizeTimePatternInputValue(pattern) {
  let p = (pattern || '').trim();

  // Normalize double-escaped tokens users might paste
  p = p.split('\\\\\\\\d').join('\\\\d');
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

  if (looksLikeRtcLoose && !looksLikeRtc) {
    let out = '';
    for (let i = 0; i < p.length; i++) {
      const ch = p[i];
      if (ch === 'd' && p[i + 1] === '{' && (i === 0 || p[i - 1] !== '\\\\')) {
        let j = i + 2;
        let digits = '';
        while (j < p.length && p[j] >= '0' && p[j] <= '9') {
          digits += p[j];
          j++;
        }
        if (digits.length > 0 && p[j] === '}') {
          out += '\\\\d{' + digits + '}';
          i = j;
          continue;
        }
      }
      out += ch;
    }
    p = out;
  }

  if (looksLikeRtc || looksLikeRtcLoose) {
    if (p.includes('[') && !p.includes('\\[')) {
      p = p.replace('[', '\\[');
    }
    if (p.includes(']') && !p.includes('\\]')) {
      const last = p.lastIndexOf(']');
      if (last >= 0) {
        p = p.substring(0, last) + '\\]' + p.substring(last + 1);
      }
    }
  }

  return p;
}

function computeTimeAxisModeFromPattern(pattern) {
  const p = normalizeTimePatternInputValue(pattern);
  const hasDate = p.includes('\\d{4}-\\d{2}-\\d{2}') || p.includes('d{4}-d{2}-d{2}');
  const hasTime = p.includes('\\d{2}:\\d{2}:\\d{2}') || p.includes('d{2}:d{2}:d{2}');
  return hasDate && hasTime ? 'rtc' : 'uptime';
}

function tryParseBracketedRtcDatetime(text) {
  if (!text) return null;
  const open = text.indexOf('[');
  if (open < 0) return null;
  const close = text.indexOf(']', open + 1);
  if (close < 0) return null;

  const inner = text.substring(open + 1, close).trim();
  if (!inner.includes('-') || !inner.includes(':') || !inner.includes('.')) return null;

  const iso = inner.replace(' ', 'T');
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;

  return { inner, iso, matchStart: open, matchEnd: close + 1 };
}

function tryCreateTimeRegex(pattern) {
  try {
    const p = normalizeTimePatternInputValue(pattern);
    if (!p) return null;
    return new RegExp(p);
  } catch {
    return null;
  }
}

function extractNumbers(text) {
  const plainText = stripAnsiCodes(text);
  const re = /(-?\d+(?:\.\d+)?)/g;
  const out = [];
  let m;
  while ((m = re.exec(plainText)) !== null) {
    out.push({
      text: m[1],
      value: Number(m[1]),
      position: m.index
    });
  }
  return out;
}

function getTimeTokenEndIndexForLine(plainText, timePattern) {
  if (!plainText || !timePattern) return 0;
  const normalized = normalizeTimePatternInputValue(timePattern);
  const mode = computeTimeAxisModeFromPattern(normalized);
  if (mode === 'rtc') {
    const seg = tryParseBracketedRtcDatetime(plainText);
    return seg ? seg.matchEnd : 0;
  }
  const rx = tryCreateTimeRegex(normalized);
  if (!rx) return 0;
  const m = rx.exec(plainText);
  if (!m) return 0;
  if (m[1] == null && m[2] == null) return 0;
  return m.index + m[0].length;
}

// Pattern generator with tolerance for whitespace + ':' vs '=' (mirrors webview logic)
function generateCommonPattern(text) {
  const numbers = extractNumbers(text);
  if (!numbers.length) return null;

  function escapeRegexChars(str) {
    let result = '';
    let lastWasWhitespaceToken = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];

      // Identifier token: allow small suffix variations (e.g. soc_ob vs soc_obs)
      if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_') {
        let j = i + 1;
        while (j < str.length) {
          const c = str[j];
          const isLetter = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
          const isDigit = c >= '0' && c <= '9';
          if (isLetter || isDigit || c === '_') j++;
          else break;
        }
        const token = str.substring(i, j);
        // Escape regex meta chars inside token (should be none, but safe)
        let escaped = '';
        for (let k = 0; k < token.length; k++) {
          const t = token[k];
          if ('\\\\.^$*+?()[]{}|'.includes(t)) escaped += '\\\\' + t;
          else escaped += t;
        }
        result += escaped + '\\\\w*';
        i = j - 1;
        lastWasWhitespaceToken = false;
        continue;
      }
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        if (!lastWasWhitespaceToken) {
          result += '\\\\s*';
          lastWasWhitespaceToken = true;
        }
        continue;
      }
      lastWasWhitespaceToken = false;
      if (ch === '=' || ch === ':') {
        result += '\\\\s*[=:]\\\\s*';
        continue;
      }
      if (ch === ',') {
        result += ',\\\\s*';
        continue;
      }
      if ('\\\\.^$*+?()[]{}|'.includes(ch)) {
        result += '\\\\' + ch;
      } else {
        result += ch;
      }
    }
    return result;
  }

  let pattern = '';
  let pos = 0;
  const sorted = [...numbers].sort((a, b) => a.position - b.position);
  for (const num of sorted) {
    if (num.position > pos) {
      pattern += escapeRegexChars(text.substring(pos, num.position));
    }
    pattern += '(-?\\\\d+\\\\.?\\\\d*)';
    pattern += '(?:\\\\s*[A-Za-z%]+)?';

    // Skip optional whitespace + unit suffix in the source text so we don't bake it into literal chunks
    let nextPos = num.position + num.text.length;
    let j = nextPos;
    while (j < text.length && (text[j] === ' ' || text[j] === '\\t')) j++;
    const unitStart = j;
    while (j < text.length) {
      const ch = text[j];
      const isLetter = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
      if (isLetter || ch === '%') j++;
      else break;
    }
    if (j > unitStart) nextPos = j;

    pos = nextPos;
  }
  if (pos < text.length) {
    pattern += escapeRegexChars(text.substring(pos));
  }
  return { pattern, sortedNumbers: sorted };
}

function getTimeMatchEndForFiltering(line, timePattern) {
  const plain = stripAnsiCodes(line);
  const normalized = normalizeTimePatternInputValue(timePattern);
  const mode = computeTimeAxisModeFromPattern(normalized);

  let timeValue = null;
  let timeMatchEnd = 0;

  if (mode === 'rtc') {
    const seg = tryParseBracketedRtcDatetime(plain);
    if (seg) {
      timeValue = seg.inner;
      timeMatchEnd = seg.matchEnd;
    }
  }

  const rx = tryCreateTimeRegex(normalized);
  if (rx) {
    const match = rx.exec(plain);
    if (match) {
      const captured = match[2] ?? match[1] ?? null;
      if (captured != null) {
        timeValue = String(captured);
        timeMatchEnd = match.index + match[0].length;
      }
    }
  }

  return { mode, timeValue, timeMatchEnd, normalized };
}

// -------------------------
// Run
// -------------------------

const { mode, timeValue, timeMatchEnd, normalized } = getTimeMatchEndForFiltering(SAMPLE_LINE, TIME_PATTERN);
const allNumbers = extractNumbers(SAMPLE_LINE);
const filtered = timeMatchEnd > 0 ? allNumbers.filter((n) => n.position >= timeMatchEnd) : allNumbers;

console.log('--- Time extraction test ---');
console.log('mode:', mode);
console.log('timePattern(normalized):', normalized);
console.log('timeValue:', timeValue);
console.log('timeMatchEnd:', timeMatchEnd);
console.log('allNumbers:', allNumbers.map((n) => n.text).join(', '));
console.log('filteredNumbers:', filtered.map((n) => n.text).join(', '));

// Generate a "future-proof" pattern from the portion after the time token and test it against sample future lines
const timeEnd = getTimeTokenEndIndexForLine(stripAnsiCodes(SAMPLE_LINE), TIME_PATTERN);
const afterTime = timeEnd > 0 ? stripAnsiCodes(SAMPLE_LINE).substring(timeEnd) : stripAnsiCodes(SAMPLE_LINE);
const patRes = generateCommonPattern(afterTime);
if (patRes) {
  const re = new RegExp(patRes.pattern);
  console.log('\\n--- Pattern match test ---');
  console.log('generatedPattern:', patRes.pattern);
  SAMPLE_LINES.forEach((line, idx) => {
    const pt = stripAnsiCodes(line);
    const te = getTimeTokenEndIndexForLine(pt, TIME_PATTERN);
    const aft = te > 0 ? pt.substring(te) : pt;
    const m = re.exec(aft);
    console.log('line', idx + 1, 'match:', !!m, 'captures:', m ? (m.length - 1) : 0);
  });
}


