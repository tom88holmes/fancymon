export function getWebviewContentHtml(cspSource: string): string {
	// Use VS Code's CSP source for script nonce (VS Code handles CSP automatically)
	// Extract nonce from cspSource (it's usually in format like "vscode-webview://...")
	// VS Code expects the nonce to match what it generates
	const nonce = cspSource || '';
	
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Serial Monitor</title>
	<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
	<style>
		* {
			box-sizing: border-box;
			margin: 0;
			padding: 0;
		}
		
		html, body {
			height: 100%;
			width: 100%;
			overflow: hidden;
		}
		
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 10px;
			display: flex;
			flex-direction: column;
		}

		.controls {
			display: flex;
			gap: 10px;
			margin-bottom: 10px;
			flex-wrap: wrap;
			align-items: center;
		}

		.controls-row {
			display: flex;
			gap: 10px;
			margin-bottom: 10px;
			flex-wrap: wrap;
			align-items: center;
			width: 100%;
		}

		.control-group {
			display: flex;
			align-items: center;
			gap: 5px;
		}

		.control-group label {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}

		select, input {
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			padding: 4px 8px;
			font-size: 12px;
			border-radius: 2px;
		}

		select:focus, input:focus {
			outline: 1px solid var(--vscode-focusBorder);
		}

		/* Fix dropdown options for dark mode */
		select {
			background-color: var(--vscode-dropdown-background);
			color: var(--vscode-dropdown-foreground);
		}

		select option {
			background-color: var(--vscode-dropdown-background);
			color: var(--vscode-dropdown-foreground);
		}

		/* Ensure input fields also respect theme */
		input[type="number"] {
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
		}

		button {
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 6px 14px;
			cursor: pointer;
			font-size: 12px;
			border-radius: 2px;
		}

		button:hover {
			background-color: var(--vscode-button-hoverBackground);
		}

		button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		button.danger {
			background-color: var(--vscode-errorForeground);
		}

		button.success {
			background-color: var(--vscode-testing-iconPassed);
		}

		button.toggle {
			position: relative;
		}

		button.toggle.active {
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}

		button.toggle.active:hover {
			background-color: var(--vscode-button-secondaryHoverBackground);
		}

		button.toggle::before {
			content: '';
			display: inline-block;
			width: 12px;
			height: 12px;
			margin-right: 6px;
			border: 2px solid currentColor;
			border-radius: 2px;
			vertical-align: middle;
		}

		button.toggle.active::before {
			background-color: currentColor;
			background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath fill='white' d='M6.564.75l-3.59 3.612-1.538-1.55L0 4.26l2.974 2.99L8 2.193z'/%3E%3C/svg%3E");
			background-size: contain;
			background-repeat: no-repeat;
			background-position: center;
		}

		.monitor {
			flex: 1 1 auto;
			min-height: 0;
			min-width: 0;
			background-color: var(--vscode-textCodeBlock-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 2px;
			padding: 10px;
			overflow-y: auto;
			overflow-x: auto;
			font-family: 'Courier New', monospace;
			font-size: 13px;
			line-height: 1.4;
			white-space: pre-wrap;
			word-wrap: break-word;
			position: relative;
		}
		
		/* Custom scrollbar styling */
		.monitor::-webkit-scrollbar {
			width: 12px;
		}
		
		.monitor::-webkit-scrollbar-track {
			background: var(--vscode-scrollbarSlider-background);
			border-radius: 6px;
		}
		
		.monitor::-webkit-scrollbar-thumb {
			background: var(--vscode-scrollbarSlider-activeBackground);
			border-radius: 6px;
		}
		
		.monitor::-webkit-scrollbar-thumb:hover {
			background: var(--vscode-scrollbarSlider-hoverBackground);
		}
		
		/* Scrollbar indicator for frozen position */
		.scrollbar-indicator {
			position: absolute;
			right: 0;
			width: 12px;
			background-color: var(--vscode-textLink-foreground);
			opacity: 0.8;
			pointer-events: none;
			z-index: 100;
			display: none;
			border-radius: 2px;
			box-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
		}
		
		.monitor.frozen .scrollbar-indicator {
			display: block;
		}

		.line {
			display: block;
			white-space: pre-wrap;
			word-break: break-word;
		}

		.line-buffer {
			opacity: 0.8;
		}

		/* Line clipping mode (no wrapping) */
		.monitor.no-wrap .line {
			white-space: pre;
			word-break: normal;
		}

		/* ANSI color classes */
		.ansi-black { color: #000000; }
		.ansi-red { color: #cd3131; }
		.ansi-green { color: #0dbc79; }
		.ansi-yellow { color: #e5e510; }
		.ansi-blue { color: #2472c8; }
		.ansi-magenta { color: #bc3fbc; }
		.ansi-cyan { color: #11a8cd; }
		.ansi-white { color: #e5e5e5; }
		.ansi-bright-black { color: #666666; }
		.ansi-bright-red { color: #f14c4c; }
		.ansi-bright-green { color: #23d18b; }
		.ansi-bright-yellow { color: #f5f543; }
		.ansi-bright-blue { color: #3b8eea; }
		.ansi-bright-magenta { color: #d670d6; }
		.ansi-bright-cyan { color: #29b8db; }
		.ansi-bright-white { color: #e5e5e5; }
		.ansi-bold { font-weight: bold; }
		.ansi-dim { opacity: 0.5; }
		.ansi-italic { font-style: italic; }
		.ansi-underline { text-decoration: underline; }

		.send-area {
			display: flex;
			gap: 5px;
			margin-top: 10px;
		}

		.send-area input {
			flex: 1;
		}

		.status {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			margin-top: 5px;
		}

		.status.connected {
			color: var(--vscode-testing-iconPassed);
		}

		.status.error {
			color: var(--vscode-errorForeground);
		}

		/* Tabs styling */
		.tabs {
			display: flex;
			gap: 5px;
			margin-bottom: 10px;
			border-bottom: 1px solid var(--vscode-panel-border);
		}

		.tab {
			background-color: transparent;
			color: var(--vscode-descriptionForeground);
			border: none;
			border-bottom: 2px solid transparent;
			padding: 8px 16px;
			cursor: pointer;
			font-size: 13px;
			transition: all 0.2s;
		}

		.tab:hover {
			color: var(--vscode-foreground);
			background-color: var(--vscode-list-hoverBackground);
		}

		.tab.active {
			color: var(--vscode-foreground);
			border-bottom-color: var(--vscode-textLink-foreground);
		}

		.tab-content {
			display: none;
			flex: 1 1 auto;
			min-height: 0;
			flex-direction: column;
		}

		.tab-content.active {
			display: flex;
		}

		.line {
			position: relative;
		}

		/* Context menu styling */
		.context-menu {
			position: fixed;
			background-color: var(--vscode-menu-background);
			border: 1px solid var(--vscode-menu-border);
			border-radius: 2px;
			padding: 4px 0;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
			z-index: 1000;
			min-width: 180px;
			display: none;
		}

		.context-menu-item {
			padding: 6px 12px;
			cursor: pointer;
			color: var(--vscode-menu-foreground);
			font-size: 13px;
			user-select: none;
		}

		.context-menu-item:hover {
			background-color: var(--vscode-menu-selectionBackground);
			color: var(--vscode-menu-selectionForeground);
		}

		/* Plot view styling */
		.plot-controls {
			display: flex;
			flex-direction: column;
			gap: 10px;
			margin-bottom: 10px;
			padding: 10px;
			background-color: var(--vscode-textCodeBlock-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 2px;
		}

		.plot-control-row {
			display: flex;
			gap: 10px;
			align-items: center;
			flex-wrap: wrap;
		}

		.plot-control-row label {
			min-width: 100px;
			font-size: 12px;
		}

		.plot-control-row input[type="text"] {
			flex: 1;
			min-width: 200px;
		}

		.extraction-preview {
			padding: 5px 10px;
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 2px;
			font-family: monospace;
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			min-height: 20px;
		}

		.extraction-preview.has-numbers {
			color: var(--vscode-textLink-foreground);
		}

		.number-selector {
			display: flex;
			gap: 10px;
			flex-wrap: wrap;
			margin-top: 5px;
		}

		.number-checkbox {
			display: flex;
			align-items: center;
			gap: 5px;
		}

		.number-checkbox input[type="checkbox"] {
			width: auto;
		}

		.variables-list {
			display: flex;
			flex-direction: column;
			gap: 5px;
			margin-top: 10px;
		}

		.variable-item {
			display: flex;
			align-items: center;
			gap: 10px;
			padding: 5px 10px;
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 2px;
		}

		.variable-item .variable-name {
			font-weight: bold;
			min-width: 150px;
		}

		.variable-item .variable-pattern {
			flex: 1;
			font-family: monospace;
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
		}

		.variable-item .variable-count {
			font-size: 11px;
			color: var(--vscode-descriptionForeground);
			min-width: 80px;
		}

		.plot-container {
			flex: 1 1 auto;
			min-height: 0;
			position: relative;
			background-color: var(--vscode-textCodeBlock-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 2px;
		}

		#plotCanvas {
			width: 100%;
			height: 100%;
		}
	</style>
</head>
<body>
	<div class="tabs">
		<button class="tab active" data-tab="monitor">Monitor</button>
		<button class="tab" data-tab="plot">Plot</button>
	</div>

	<div class="tab-content active" id="monitorTab">
	<div class="controls">
		<div class="control-group">
			<label>Port:</label>
			<select id="portSelect" style="width: 200px;">
				<option value="">Select port...</option>
			</select>
			<button id="refreshPorts">Refresh</button>
		</div>
		
		<div class="control-group">
			<label>Baud Rate:</label>
			<select id="baudRate">
				<option value="9600">9600</option>
				<option value="19200">19200</option>
				<option value="38400">38400</option>
				<option value="57600">57600</option>
				<option value="115200">115200</option>
				<option value="230400">230400</option>
				<option value="460800">460800</option>
				<option value="921600">921600</option>
				<option value="1000000" selected>1000000</option>
				<option value="2000000">2000000</option>
			</select>
			<input type="number" id="customBaudRate" placeholder="Custom" style="width: 100px;" min="1" max="10000000">
		</div>

		<div class="control-group">
			<label>Data Bits:</label>
			<select id="dataBits">
				<option value="7">7</option>
				<option value="8" selected>8</option>
			</select>
		</div>

		<div class="control-group">
			<label>Stop Bits:</label>
			<select id="stopBits">
				<option value="1" selected>1</option>
				<option value="2">2</option>
			</select>
		</div>

		<div class="control-group">
			<label>Parity:</label>
			<select id="parity">
				<option value="none" selected>None</option>
				<option value="even">Even</option>
				<option value="odd">Odd</option>
			</select>
		</div>

		<button id="sendResetBtn" disabled>Send Reset</button>
		<button id="connectToggleBtn" class="success">Connect</button>
	</div>

	<div class="controls-row">
		<button id="clearBtn">Clear</button>
		<button id="toggleWrapBtn" class="toggle active" title="Toggle line wrapping">Wrap</button>
		<div class="control-group">
			<label>Max Lines:</label>
			<input type="number" id="maxLines" value="10000" min="100" max="1000000" style="width: 100px;">
		</div>
		<div class="control-group">
			<label>Usage:</label>
			<span id="lineUsage" style="color: var(--vscode-descriptionForeground); font-size: 12px;">0% (0 / 10000)</span>
		</div>
		<button id="saveBtn">Save to File</button>
		<button id="copyAllBtn">Copy All</button>
		<button id="copyFilteredBtn">Copy All Filtered</button>
		<button id="copyVisibleBtn">Copy All Visible</button>
	</div>

	<div class="controls-row">
		<div class="control-group" style="flex: 1;">
			<label>Filter:</label>
			<input type="text" id="filterInput" placeholder="Type pattern to filter lines..." style="flex: 1; min-width: 200px;">
		</div>
	</div>

	<div class="monitor" id="monitor">
		<div class="scrollbar-indicator" id="scrollbarIndicator"></div>
	</div>

	<div class="send-area">
		<input type="text" id="sendInput" placeholder="Type message to send..." disabled>
		<button id="sendBtn" disabled>Send</button>
	</div>

	<div class="status" id="status">Disconnected</div>
	</div>

	<div class="tab-content" id="plotTab">
		<div class="plot-controls">
			<div class="plot-control-row">
				<label>Time Pattern (X-axis):</label>
				<input type="text" id="timePatternInput" placeholder="Regex pattern for time value (e.g., \\(([0-9]+)\\))" value="\\(([0-9]+)\\)">
				<span style="font-size: 11px; color: var(--vscode-descriptionForeground);">Extracts uptime from parentheses</span>
			</div>
			<div class="plot-control-row">
				<label>Pattern Input:</label>
				<input type="text" id="patternInput" placeholder="Enter or paste line text here...">
			</div>
			<div class="plot-control-row">
				<label>Extracted Numbers:</label>
				<div class="extraction-preview" id="extractionPreview">No numbers found</div>
			</div>
			<div class="plot-control-row">
				<label>Select Numbers:</label>
				<div class="number-selector" id="numberSelector"></div>
			</div>
			<div class="plot-control-row">
				<button id="addVariableBtn" disabled>Add Variable to Plot</button>
				<button id="clearPlotBtn">Clear Plot</button>
				<button id="pausePlotBtn">Pause</button>
			</div>
			<div class="variables-list" id="variablesList">
				<div style="font-size: 12px; color: var(--vscode-descriptionForeground); padding: 5px;">No variables added yet</div>
			</div>
		</div>
		<div class="plot-container">
			<canvas id="plotCanvas"></canvas>
		</div>
	</div>

	<script>
		// Use DOMContentLoaded to ensure DOM is ready
		document.addEventListener('DOMContentLoaded', function() {
			console.log('FancyMon: DOMContentLoaded fired');
			const statusEl = document.getElementById('status');
			if (statusEl) {
				statusEl.textContent = 'Script loading...';
				console.log('FancyMon: Status updated to Script loading...');
			} else {
				console.error('FancyMon: Status element not found!');
			}
		});
		
		// Also try immediate execution
		(function() {
			console.log('FancyMon: IIFE executing immediately');
			const statusEl = document.getElementById('status');
			if (statusEl) {
				statusEl.textContent = 'IIFE executed';
				console.log('FancyMon: Status updated by IIFE');
			}
		})();
		
		try {
			console.log('FancyMon: Script starting...');
			const status = document.getElementById('status');
			if (status) {
				status.textContent = 'Initializing...';
				console.log('FancyMon: Status updated to Initializing...');
			}
			
			const vscode = acquireVsCodeApi();
			console.log('FancyMon: vscode API acquired:', typeof vscode);
		
		let isConnected = false;
		let isDisconnecting = false;
		let isFollowing = true; // Auto-scroll to bottom by default
		let lastScrollTop = 0; // Track previous scroll position to detect scroll direction
		const monitor = document.getElementById('monitor');
		const portSelect = document.getElementById('portSelect');
		
		console.log('FancyMon: Elements found - monitor:', monitor, 'portSelect:', portSelect);
		
		if (!portSelect) {
			console.error('FancyMon: CRITICAL - portSelect element not found in DOM!');
			if (status) {
				status.textContent = 'Error: portSelect not found';
				status.className = 'status error';
			}
		}
		const baudRate = document.getElementById('baudRate');
		const customBaudRate = document.getElementById('customBaudRate');
		const dataBits = document.getElementById('dataBits');
		const stopBits = document.getElementById('stopBits');
		const parity = document.getElementById('parity');
		const sendResetBtn = document.getElementById('sendResetBtn');
		const connectToggleBtn = document.getElementById('connectToggleBtn');
		const clearBtn = document.getElementById('clearBtn');
		const toggleWrapBtn = document.getElementById('toggleWrapBtn');
		const sendInput = document.getElementById('sendInput');
		const sendBtn = document.getElementById('sendBtn');
		const refreshPorts = document.getElementById('refreshPorts');
		// status already declared above
		const maxLinesInput = document.getElementById('maxLines');
		const lineUsage = document.getElementById('lineUsage');
		const saveBtn = document.getElementById('saveBtn');
		const copyAllBtn = document.getElementById('copyAllBtn');
		const copyFilteredBtn = document.getElementById('copyFilteredBtn');
		const copyVisibleBtn = document.getElementById('copyVisibleBtn');
		const scrollbarIndicator = document.getElementById('scrollbarIndicator');
		const filterInput = document.getElementById('filterInput');
		
		let maxLines = 10000;
		let lineCount = 0;
		let totalTrimmedLines = 0;
		let isFrozenView = false;
		let frozenAnchorLine = null;
		let frozenAnchorOffset = 0;
		let anchorLostScrollTop = null; // Track scroll position when anchor was lost
		let lineWrapEnabled = true; // Default to wrapping enabled
		
		// Raw text storage - stores lines as strings with ANSI codes preserved
		let rawLines = [];
		let filterPattern = ''; // Filter pattern for dynamic filtering
		const newlineChar = String.fromCharCode(10);
		
		// Performance optimization: track rendering state
		let lastRenderedLineIndex = -1; // Last line index that was rendered
		let lastFilterPattern = ''; // Last filter pattern used for rendering
		let needsFullRender = false; // Flag to force full render (e.g., filter changed, lines trimmed)
		let pendingScroll = false; // Flag to throttle scroll operations
		let isProgrammaticScroll = false; // Flag to ignore programmatic scrolls in handler

		// Plotting variables
		const tabs = document.querySelectorAll('.tab');
		const monitorTab = document.getElementById('monitorTab');
		const plotTab = document.getElementById('plotTab');
		const patternInput = document.getElementById('patternInput');
		const extractionPreview = document.getElementById('extractionPreview');
		const numberSelector = document.getElementById('numberSelector');
		const addVariableBtn = document.getElementById('addVariableBtn');
		const clearPlotBtn = document.getElementById('clearPlotBtn');
		const pausePlotBtn = document.getElementById('pausePlotBtn');
		const variablesList = document.getElementById('variablesList');
		const timePatternInput = document.getElementById('timePatternInput');
		const plotCanvas = document.getElementById('plotCanvas');
		
		let plotVariables = []; // Array of {id, name, pattern, regex, data: [{time, value}], color}
		let plotChart = null;
		let isPlotPaused = false;
		let currentActiveTab = 'monitor';
		let selectedNumbers = new Set(); // Track which number indices are selected
		let extractedNumbers = []; // Current extracted numbers from pattern input

		// Tab switching
		tabs.forEach(tab => {
			tab.addEventListener('click', () => {
				const targetTab = tab.getAttribute('data-tab');
				tabs.forEach(t => t.classList.remove('active'));
				tab.classList.add('active');
				
				monitorTab.classList.remove('active');
				plotTab.classList.remove('active');
				
				if (targetTab === 'monitor') {
					monitorTab.classList.add('active');
					currentActiveTab = 'monitor';
				} else {
					plotTab.classList.add('active');
					currentActiveTab = 'plot';
					// Initialize chart if not already done
					if (!plotChart && plotCanvas && typeof Chart !== 'undefined') {
						setTimeout(() => {
							initializeChart();
						}, 100);
					} else if (plotChart) {
						// Resize chart when switching to plot tab
						setTimeout(() => {
							plotChart.resize();
						}, 100);
					}
				}
			});
		});

		// Initialize Chart.js
		function initializeChart() {
			if (!plotCanvas || typeof Chart === 'undefined') {
				console.error('Chart.js not loaded or canvas not found');
				return;
			}

			const ctx = plotCanvas.getContext('2d');
			plotChart = new Chart(ctx, {
				type: 'line',
				data: {
					datasets: []
				},
				options: {
					responsive: true,
					maintainAspectRatio: false,
					interaction: {
						mode: 'index',
						intersect: false,
					},
					scales: {
						x: {
							type: 'linear',
							position: 'bottom',
							title: {
								display: true,
								text: 'Time (uptime)'
							}
						},
						y: {
							title: {
								display: true,
								text: 'Value'
							}
						}
					},
					plugins: {
						legend: {
							display: true,
							position: 'top'
						},
						tooltip: {
							enabled: true
						}
					},
					animation: false // Disable animation for better performance with live data
				}
			});

			// Handle canvas resize
			const resizeObserver = new ResizeObserver(() => {
				if (plotChart) {
					plotChart.resize();
				}
			});
			resizeObserver.observe(plotCanvas);
			
			// Also restore existing datasets if any
			plotVariables.forEach((variable, index) => {
				if (plotChart.data.datasets[index]) {
					plotChart.data.datasets[index].data = variable.data.map(d => ({ x: d.time, y: d.value }));
				}
			});
			plotChart.update('none');
		}

		// Extract numbers from text
		function extractNumbers(text) {
			// Remove ANSI codes first
			const plainText = stripAnsiCodes(text);
			// Match numbers (integers and decimals) - use RegExp constructor to avoid template literal issues
			const numberRegex = new RegExp('(-?\\\\d+\\\\.?\\\\d*)', 'g');
			const matches = [];
			let match;
			while ((match = numberRegex.exec(plainText)) !== null) {
				matches.push({
					index: matches.length + 1,
					value: parseFloat(match[1]),
					text: match[1],
					position: match.index
				});
			}
			return matches;
		}

		// Generate regex pattern for a specific number index
		function generatePatternForNumber(text, numberIndex) {
			const numbers = extractNumbers(text);
			if (numberIndex < 1 || numberIndex > numbers.length) {
				return null;
			}

			const targetNumber = numbers[numberIndex - 1];
			const targetStart = targetNumber.position;
			const targetEnd = targetNumber.position + targetNumber.text.length;
			
			// Escape special regex characters (but preserve the number position)
			// Escape characters one by one to avoid template literal parsing issues
			function escapeRegexChars(str) {
				let result = '';
				for (let i = 0; i < str.length; i++) {
					const char = str[i];
					if (char === '\\\\' || char === '.' || char === '*' || char === '+' || char === '?' || 
						char === '^' || char === '$' || char === '{' || char === '}' || 
						char === '(' || char === ')' || char === '[' || char === ']' || char === '|') {
						result += '\\\\' + char;
					} else {
						result += char;
					}
				}
				return result;
			}
			
			// Build pattern by processing text character by character
			// Replace all numbers except the target with generic number patterns
			let pattern = '';
			let pos = 0;
			
			// Sort numbers by position
			const sortedNumbers = [...numbers].sort((a, b) => a.position - b.position);
			
			for (const num of sortedNumbers) {
				// Add text before this number
				if (num.position > pos) {
					const textBefore = text.substring(pos, num.position);
					pattern += escapeRegexChars(textBefore);
				}
				
				// Add pattern for this number
				if (num === targetNumber) {
					// Target number: use capture group
					pattern += '(-?\\\\d+\\\\.?\\\\d*)';
				} else {
					// Other numbers: use generic number pattern (allow any number)
					// Check if it's a decimal number
					if (num.text.includes('.')) {
						pattern += '-?\\\\d+\\\\.?\\\\d*';
					} else {
						pattern += '-?\\\\d+';
					}
				}
				
				pos = num.position + num.text.length;
			}
			
			// Add remaining text after last number
			if (pos < text.length) {
				const textAfter = text.substring(pos);
				pattern += escapeRegexChars(textAfter);
			}
			
			return pattern;
		}

		// Extract variable name from pattern (non-number text before the number)
		function extractVariableName(text, numberIndex) {
			const numbers = extractNumbers(text);
			if (numberIndex < 1 || numberIndex > numbers.length) {
				return 'variable' + numberIndex;
			}

			const targetNumber = numbers[numberIndex - 1];
			const beforeNumber = text.substring(0, targetNumber.position).trim();
			// Extract last word or meaningful text before the number
			const words = beforeNumber.split(/[\\s\\W]+/).filter(w => w.length > 0);
			if (words.length > 0) {
				const lastWord = words[words.length - 1];
				// Clean up the word
				const cleanWord = lastWord.replace(/[^a-zA-Z0-9]/g, '');
				if (cleanWord.length > 0) {
					return cleanWord + ':' + numberIndex;
				}
			}
			return 'value' + numberIndex;
		}

		// Update extraction preview
		function updateExtractionPreview() {
			if (!patternInput || !extractionPreview) return;
			
			const text = patternInput.value;
			const plainText = stripAnsiCodes(text);
			let allNumbers = extractNumbers(text);
			
			// Extract time value and find its position if time pattern is set
			let timeValue = null;
			let timeMatchEnd = 0; // Position after time match
			if (timePatternInput && timePatternInput.value) {
				try {
					const timePattern = timePatternInput.value.trim();
					if (timePattern) {
						const regex = new RegExp(timePattern);
						const match = regex.exec(plainText);
						if (match) {
							if (match[1]) {
								timeValue = parseFloat(match[1]);
							}
							// Get the end position of the entire match (not just capture group)
							timeMatchEnd = match.index + match[0].length;
						}
					}
				} catch (e) {
					// Ignore errors
				}
			}
			
			// Filter out numbers that come before the time pattern match
			if (timeMatchEnd > 0) {
				extractedNumbers = allNumbers.filter(num => num.position >= timeMatchEnd);
				// Re-index starting from 1, but keep original index for pattern generation
				extractedNumbers = extractedNumbers.map((num, idx) => ({
					...num,
					index: idx + 1,
					originalIndex: num.index // Keep original index for pattern generation
				}));
			} else {
				extractedNumbers = allNumbers;
			}
			
			if (extractedNumbers.length === 0) {
				if (timeValue !== null) {
					extractionPreview.textContent = 'Time: ' + timeValue + ' (no numbers found after time)';
				} else {
					extractionPreview.textContent = 'No numbers found';
				}
				extractionPreview.classList.remove('has-numbers');
				numberSelector.innerHTML = '';
				addVariableBtn.disabled = true;
				selectedNumbers.clear();
			} else {
				let preview = extractedNumbers.map(n => n.index + ': ' + n.text).join(', ');
				if (timeValue !== null) {
					preview = 'Time: ' + timeValue + ' | Numbers: ' + preview;
				}
				extractionPreview.textContent = preview;
				extractionPreview.classList.add('has-numbers');
				
				// Update number selector checkboxes
				numberSelector.innerHTML = '';
				extractedNumbers.forEach(num => {
					const checkboxDiv = document.createElement('div');
					checkboxDiv.className = 'number-checkbox';
					const checkbox = document.createElement('input');
					checkbox.type = 'checkbox';
					checkbox.id = 'num-' + num.index;
					checkbox.value = num.index;
					checkbox.addEventListener('change', () => {
						if (checkbox.checked) {
							selectedNumbers.add(num.index);
						} else {
							selectedNumbers.delete(num.index);
						}
						addVariableBtn.disabled = selectedNumbers.size === 0;
					});
					const label = document.createElement('label');
					label.htmlFor = 'num-' + num.index;
					label.textContent = num.index + ': ' + num.text;
					checkboxDiv.appendChild(checkbox);
					checkboxDiv.appendChild(label);
					numberSelector.appendChild(checkboxDiv);
				});
			}
		}

		// Add variable to plot
		function addVariableToPlot() {
			if (!patternInput || selectedNumbers.size === 0) return;

			const text = patternInput.value.trim();
			if (!text) return;

			selectedNumbers.forEach(numIndex => {
				// Find the original index if numbers were filtered
				const numObj = extractedNumbers.find(n => n.index === numIndex);
				const originalIndex = numObj && numObj.originalIndex ? numObj.originalIndex : numIndex;
				const pattern = generatePatternForNumber(text, originalIndex);
				if (!pattern) return;

				const name = extractVariableName(text, originalIndex);
				const color = getNextColor(plotVariables.length);
				
				const variable = {
					id: Date.now() + '-' + numIndex,
					name: name,
					pattern: pattern,
					regex: new RegExp(pattern),
					data: [],
					color: color
				};

				plotVariables.push(variable);
				
				// Add dataset to chart
				if (plotChart) {
					plotChart.data.datasets.push({
						label: variable.name,
						data: [],
						borderColor: color,
						backgroundColor: color + '40',
						fill: false,
						tension: 0.1
					});
					plotChart.update('none');
				}
			});

			updateVariablesList();
			// Clear selection
			selectedNumbers.clear();
			patternInput.value = '';
			updateExtractionPreview();
		}

		// Get next color for variable
		function getNextColor(index) {
			const colors = [
				'rgb(54, 162, 235)',   // Blue
				'rgb(255, 99, 132)',   // Red
				'rgb(75, 192, 192)',   // Teal
				'rgb(255, 159, 64)',   // Orange
				'rgb(153, 102, 255)',  // Purple
				'rgb(255, 205, 86)',   // Yellow
				'rgb(201, 203, 207)',  // Grey
				'rgb(255, 99, 255)'    // Magenta
			];
			return colors[index % colors.length];
		}

		// Update variables list UI
		function updateVariablesList() {
			if (!variablesList) return;

			if (plotVariables.length === 0) {
				variablesList.innerHTML = '<div style="font-size: 12px; color: var(--vscode-descriptionForeground); padding: 5px;">No variables added yet</div>';
				return;
			}

			variablesList.innerHTML = '';
			plotVariables.forEach(variable => {
				const item = document.createElement('div');
				item.className = 'variable-item';
				
				const nameSpan = document.createElement('span');
				nameSpan.className = 'variable-name';
				nameSpan.textContent = variable.name;
				nameSpan.style.color = variable.color;
				
				const patternSpan = document.createElement('span');
				patternSpan.className = 'variable-pattern';
				patternSpan.textContent = variable.pattern;
				
				const countSpan = document.createElement('span');
				countSpan.className = 'variable-count';
				countSpan.textContent = variable.data.length + ' points';
				
				const removeBtn = document.createElement('button');
				removeBtn.textContent = 'Remove';
				removeBtn.style.fontSize = '11px';
				removeBtn.addEventListener('click', () => {
					removeVariable(variable.id);
				});
				
				item.appendChild(nameSpan);
				item.appendChild(patternSpan);
				item.appendChild(countSpan);
				item.appendChild(removeBtn);
				variablesList.appendChild(item);
			});
		}

		// Remove variable
		function removeVariable(variableId) {
			const index = plotVariables.findIndex(v => v.id === variableId);
			if (index === -1) return;

			plotVariables.splice(index, 1);
			
			if (plotChart) {
				plotChart.data.datasets.splice(index, 1);
				plotChart.update();
			}

			updateVariablesList();
		}

		// Extract time value from line
		function extractTimeValue(line) {
			if (!timePatternInput || !timePatternInput.value) {
				return null;
			}

			try {
				const timePattern = timePatternInput.value.trim();
				if (!timePattern) return null;

				const regex = new RegExp(timePattern);
				const match = regex.exec(line);
				if (match && match[1]) {
					return parseFloat(match[1]);
				}
			} catch (e) {
				console.error('Error extracting time:', e);
			}
			return null;
		}

		// Process line for plotting
		function processLineForPlot(line) {
			if (isPlotPaused || plotVariables.length === 0) return;

			const plainText = stripAnsiCodes(line);
			const timeValue = extractTimeValue(plainText);
			if (timeValue === null) return;

			let chartNeedsUpdate = false;
			plotVariables.forEach((variable, index) => {
				try {
					const match = variable.regex.exec(plainText);
					if (match && match[1]) {
						const value = parseFloat(match[1]);
						if (!isNaN(value)) {
							variable.data.push({ time: timeValue, value: value });
							
							// Limit data points (keep last 1000)
							if (variable.data.length > 1000) {
								variable.data.shift();
							}

							// Update chart data (but don't update chart yet - batch updates)
							if (plotChart && plotChart.data.datasets[index]) {
								plotChart.data.datasets[index].data = variable.data.map(d => ({ x: d.time, y: d.value }));
								chartNeedsUpdate = true;
							}
						}
					}
				} catch (e) {
					console.error('Error processing variable', variable.name, ':', e);
				}
			});

			// Batch chart update (only once per line, not per variable)
			if (chartNeedsUpdate && plotChart) {
				plotChart.update('none');
			}
			
			// Only update variables list occasionally (not every line)
			// Update every 10 lines or when paused
			if (isPlotPaused || (plotVariables.length > 0 && plotVariables[0].data.length % 10 === 0)) {
				updateVariablesList();
			}
		}

		// Event listeners for plot controls
		if (patternInput) {
			patternInput.addEventListener('input', updateExtractionPreview);
		}

		if (timePatternInput) {
			timePatternInput.addEventListener('input', updateExtractionPreview);
			timePatternInput.addEventListener('change', updateExtractionPreview);
		}

		if (addVariableBtn) {
			addVariableBtn.addEventListener('click', addVariableToPlot);
		}

		if (clearPlotBtn) {
			clearPlotBtn.addEventListener('click', () => {
				plotVariables.forEach(v => v.data = []);
				if (plotChart) {
					plotChart.data.datasets.forEach(ds => ds.data = []);
					plotChart.update();
				}
				updateVariablesList();
			});
		}

		if (pausePlotBtn) {
			pausePlotBtn.addEventListener('click', () => {
				isPlotPaused = !isPlotPaused;
				pausePlotBtn.textContent = isPlotPaused ? 'Resume' : 'Pause';
			});
		}

		// Filter functions (inline for browser JavaScript)
		function stripAnsiCodes(text) {
			const pattern = '\\\\x1b\\\\[[0-9;]*[a-zA-Z]';
			const ansiRegex = new RegExp(pattern, 'g');
			return text.replace(ansiRegex, '');
		}
		
		function applyFilter(entries, pattern) {
			if (!pattern || pattern.trim() === '') {
				return entries;
			}
			const trimmedPattern = pattern.trim();
			return entries.filter(entry => {
				const plainText = stripAnsiCodes(entry.text);
				return plainText.includes(trimmedPattern);
			});
		}

		function getBaudRate() {
			if (customBaudRate.value && parseInt(customBaudRate.value) > 0) {
				return parseInt(customBaudRate.value);
			}
			return parseInt(baudRate.value);
		}

		function updateUI() {
			portSelect.disabled = isConnected || isDisconnecting;
			baudRate.disabled = isConnected || isDisconnecting;
			customBaudRate.disabled = isConnected || isDisconnecting;
			dataBits.disabled = isConnected || isDisconnecting;
			stopBits.disabled = isConnected || isDisconnecting;
			parity.disabled = isConnected || isDisconnecting;
			
			// Update toggle button based on connection state
			if (connectToggleBtn) {
				if (isConnected) {
					connectToggleBtn.textContent = 'Disconnect';
					connectToggleBtn.className = 'danger';
					connectToggleBtn.disabled = isDisconnecting;
				} else {
					connectToggleBtn.textContent = 'Connect';
					connectToggleBtn.className = 'success';
					connectToggleBtn.disabled = isDisconnecting || !portSelect.value;
				}
			}
			
			sendResetBtn.disabled = !isConnected || isDisconnecting;
			sendInput.disabled = !isConnected || isDisconnecting;
			sendBtn.disabled = !isConnected || isDisconnecting;
			refreshPorts.disabled = isConnected || isDisconnecting;
		}

		// ANSI color code mapping
		const ansiColors = {
			'30': 'ansi-black',
			'31': 'ansi-red',
			'32': 'ansi-green',
			'33': 'ansi-yellow',
			'34': 'ansi-blue',
			'35': 'ansi-magenta',
			'36': 'ansi-cyan',
			'37': 'ansi-white',
			'90': 'ansi-bright-black',
			'91': 'ansi-bright-red',
			'92': 'ansi-bright-green',
			'93': 'ansi-bright-yellow',
			'94': 'ansi-bright-blue',
			'95': 'ansi-bright-magenta',
			'96': 'ansi-bright-cyan',
			'97': 'ansi-bright-white'
		};

		// Current ANSI state
		let currentAnsiState = {
			fg: null,
			bg: null,
			bold: false,
			dim: false,
			italic: false,
			underline: false
		};

		function escapeHtml(text) {
			const div = document.createElement('div');
			div.textContent = text;
			return div.innerHTML;
		}

		function getAnsiClasses(state) {
			const classes = [];
			if (state.fg) classes.push(state.fg);
			if (state.bg) classes.push(state.bg);
			if (state.bold) classes.push('ansi-bold');
			if (state.dim) classes.push('ansi-dim');
			if (state.italic) classes.push('ansi-italic');
			if (state.underline) classes.push('ansi-underline');
			return classes.length > 0 ? ' class="' + classes.join(' ') + '"' : '';
		}

		function parseAnsi(text, initialState = null) {
			// ANSI escape sequence: ESC[ (0x1B)
			// Use character code escape sequence in regex pattern string
			// \\x1b = literal "\x1b" sequence for RegExp constructor
			const pattern = '\\\\x1b\\\\[([0-9;]*)([a-zA-Z])';
			const ansiRegex = new RegExp(pattern, 'g');
			let lastIndex = 0;
			let result = '';
			// Use provided initial state or current global state
			let state = initialState ? { ...initialState } : { ...currentAnsiState };
			let match;

			while ((match = ansiRegex.exec(text)) !== null) {
				// Add text before the ANSI code
				if (match.index > lastIndex) {
					const textBefore = text.substring(lastIndex, match.index);
					if (textBefore) {
						result += '<span' + getAnsiClasses(state) + '>' + escapeHtml(textBefore) + '</span>';
					}
				}

				const codes = match[1].split(';').filter(c => c);
				const command = match[2];

				if (command === 'm') {
					// SGR (Select Graphic Rendition) command
					if (codes.length === 0 || (codes.length === 1 && codes[0] === '')) {
						// Reset
						state = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
					} else {
						for (const code of codes) {
							const num = parseInt(code, 10);
							if (num === 0) {
								// Reset all
								state = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
							} else if (num === 1) {
								state.bold = true;
							} else if (num === 2) {
								state.dim = true;
							} else if (num === 3) {
								state.italic = true;
							} else if (num === 4) {
								state.underline = true;
							} else if (num === 22) {
								state.bold = false;
								state.dim = false;
							} else if (num === 23) {
								state.italic = false;
							} else if (num === 24) {
								state.underline = false;
							} else if (num >= 30 && num <= 37) {
								// Foreground color
								state.fg = ansiColors[code] || null;
							} else if (num >= 40 && num <= 47) {
								// Background color (we'll skip for now, or map to bg classes)
								// state.bg = ansiColors[code] || null;
							} else if (num >= 90 && num <= 97) {
								// Bright foreground color
								state.fg = ansiColors[code] || null;
							} else if (num >= 100 && num <= 107) {
								// Bright background color
								// state.bg = ansiColors[code] || null;
							} else if (num === 39) {
								// Reset foreground
								state.fg = null;
							} else if (num === 49) {
								// Reset background
								state.bg = null;
							}
						}
					}
				}

				lastIndex = match.index + match[0].length;
			}

			// Add remaining text
			if (lastIndex < text.length) {
				const textAfter = text.substring(lastIndex);
				if (textAfter) {
					result += '<span' + getAnsiClasses(state) + '>' + escapeHtml(textAfter) + '</span>';
				}
			}

			// Update global state (for continuity across renders)
			currentAnsiState = state;

			return { html: result, finalState: state };
		}


		function getLineHeightEstimate() {
			if (!monitor) {
				return 16;
			}
			const computedStyle = window.getComputedStyle(monitor);
			const lineHeight = parseFloat(computedStyle.lineHeight) || parseFloat(computedStyle.fontSize) * 1.4;
			return lineHeight || 16;
		}

		function isAtBottom() {
			// Check if scrolled to within 10 lines of the bottom
			if (!monitor) return true; // Default to bottom if monitor doesn't exist
			const lineHeight = getLineHeightEstimate();
			const linesThreshold = 10;
			const pixelThreshold = lineHeight * linesThreshold;
			
			const distanceFromBottom = monitor.scrollHeight - monitor.scrollTop - monitor.clientHeight;
			return distanceFromBottom <= pixelThreshold;
		}

		function getAnchorLineInfo(scrollTop) {
			if (!monitor) {
				return null;
			}
			const lineElements = monitor.querySelectorAll('.line[data-line]');
			for (const el of lineElements) {
				if (!(el instanceof HTMLElement)) continue;
				const top = el.offsetTop;
				const height = el.offsetHeight;
				if (top + height > scrollTop) {
					const lineAttr = el.getAttribute('data-line');
					if (!lineAttr) {
						continue;
					}
					return {
						line: parseInt(lineAttr, 10),
						offset: scrollTop - top
					};
				}
			}
			return null;
		}
		
		function updateScrollbarIndicator() {
			if (!monitor || !scrollbarIndicator || !isFrozenView || frozenAnchorLine === null) {
				if (scrollbarIndicator) {
					scrollbarIndicator.style.display = 'none';
				}
				if (monitor) {
					monitor.classList.remove('frozen');
				}
				return;
			}
			
			// Find the element with the frozen anchor line number
			const anchorEl = monitor.querySelector('.line[data-line="' + frozenAnchorLine + '"]');
			if (!(anchorEl instanceof HTMLElement)) {
				scrollbarIndicator.style.display = 'none';
				monitor.classList.remove('frozen');
				return;
			}
			
			// Calculate position as percentage of scroll height
			const scrollHeight = monitor.scrollHeight;
			const clientHeight = monitor.clientHeight;
			if (scrollHeight <= clientHeight) {
				scrollbarIndicator.style.display = 'none';
				monitor.classList.remove('frozen');
				return;
			}
			
			// Position indicator at the frozen anchor line position
			const anchorTop = anchorEl.offsetTop + frozenAnchorOffset;
			const percentage = anchorTop / scrollHeight;
			
			// Position indicator on the scrollbar track (12px wide)
			// The indicator should be a small marker (about 4px tall) at the frozen position
			const indicatorHeight = 4;
			const top = percentage * clientHeight;
			
			scrollbarIndicator.style.top = top + 'px';
			scrollbarIndicator.style.height = indicatorHeight + 'px';
			scrollbarIndicator.style.display = 'block';
			
			// Add frozen class to show indicator
			if (!monitor.classList.contains('frozen')) {
				monitor.classList.add('frozen');
			}
		}

		function freezeView() {
			if (!monitor) {
				return;
			}
			const anchorInfo = getAnchorLineInfo(monitor.scrollTop);
			if (anchorInfo) {
				frozenAnchorLine = anchorInfo.line;
				frozenAnchorOffset = anchorInfo.offset;
			} else {
				frozenAnchorLine = totalTrimmedLines + 1;
				frozenAnchorOffset = 0;
			}
			isFrozenView = true;
			updateScrollbarIndicator();
		}
		
		function unfreezeView() {
			isFrozenView = false;
			frozenAnchorLine = null;
			frozenAnchorOffset = 0;
			if (monitor) {
				monitor.classList.remove('frozen');
			}
			if (scrollbarIndicator) {
				scrollbarIndicator.style.display = 'none';
			}
		}

		function trimOldLines() {
			// Trim old lines from raw text array
			// Trim down to exactly maxLines, removing everything over the limit
			// This is called occasionally (every 100 lines) to avoid constant trimming
			if (rawLines.length > maxLines) {
				const linesToRemove = rawLines.length - maxLines;
				
				// Remove old lines from the start
				rawLines.splice(0, linesToRemove);
				lineCount = rawLines.length;
				totalTrimmedLines += linesToRemove;
				
				// Incrementally remove DOM nodes instead of full re-render (much faster!)
				if (monitor && isFollowing && !filterPattern) {
					// Direct child removal is much faster than querySelectorAll
					// Remove the first N children that are line elements (not buffer line)
					let removed = 0;
					while (removed < linesToRemove && monitor.firstElementChild) {
						const child = monitor.firstElementChild;
						// Only remove elements with data-line attribute (actual lines, not buffer)
						if (child.classList.contains('line') && child.hasAttribute('data-line')) {
							monitor.removeChild(child);
							removed++;
						} else {
							// Skip non-line elements (like scrollbar indicator) - shouldn't happen, but be safe
							break;
						}
					}
					
					// Update lastRenderedLineIndex to account for trimmed lines
					// Since we removed lines from the start, adjust the index
					if (lastRenderedLineIndex >= 0) {
						lastRenderedLineIndex = Math.max(-1, lastRenderedLineIndex - linesToRemove);
					}
					
					// CRITICAL: Scroll to bottom after trimming to maintain auto-follow
					// When lines are removed from the top, scroll position can shift
					if (!pendingScroll) {
						pendingScroll = true;
						isProgrammaticScroll = true; // Mark as programmatic scroll
						requestAnimationFrame(() => {
							if (monitor && isFollowing) {
								const newScrollTop = monitor.scrollHeight - monitor.clientHeight;
								lastScrollTop = newScrollTop; // Update BEFORE scrolling to prevent handler from thinking we scrolled up
								monitor.scrollTop = newScrollTop;
								// Reset flag after a short delay to allow scroll event to process
								setTimeout(() => {
									isProgrammaticScroll = false;
								}, 50);
							}
							pendingScroll = false;
						});
					}
				}
				
				// Don't force full render - incremental removal is much faster
			}
		}

		function updateLineUsage() {
			// Cap percentage at 100% for display, even if buffer exceeds maxLines
			// This keeps the display stable and consistent
			const displayCount = Math.min(lineCount, maxLines);
			const percent = maxLines > 0 ? Math.round((displayCount / maxLines) * 100) : 0;
			const color = percent > 90 ? 'var(--vscode-errorForeground)' : percent > 70 ? 'var(--vscode-warningForeground)' : 'var(--vscode-descriptionForeground)';
			// Always show maxLines as the max, even if we have more lines buffered
			lineUsage.textContent = percent + '% (' + displayCount.toLocaleString() + ' / ' + maxLines.toLocaleString() + ')';
			lineUsage.style.color = color;
		}

		// Buffer for incomplete lines (data that doesn't end with newline)
		let lineBuffer = '';
		
		function appendData(data) {
			// Allow disconnect/connect status messages through even when disconnecting
			// These are important status messages that should be stored
			const isStatusMessage = data && (
				data.includes('[[ DISCONNECTED ]]') ||
				data.includes('[[ CONNECTED ]]') ||
				data.includes('[[ RESET SENT TO DEVICE ]]')
			);
			
			// CRITICAL: Exit immediately if disconnecting - don't process any data
			// EXCEPT for status messages which should always be stored
			if (isDisconnecting && !isStatusMessage) {
				return; // Exit silently, don't process data during disconnect
			}
			
			// Append new data to buffer
			lineBuffer += data;
			
			// Split into complete lines (ending with newline) and remaining buffer
			// Use actual newline character, not escaped string
			const lines = lineBuffer.split(newlineChar);
			
			// Last element is either empty (if buffer ended with newline) or partial line
			if (lineBuffer.endsWith(newlineChar)) {
				// All lines are complete, buffer is empty
				lineBuffer = '';
				// Remove empty last element
				lines.pop();
			} else {
				// Last element is incomplete, keep it in buffer
				lineBuffer = lines.pop() || '';
			}
			
			// Add complete lines to raw storage
			let linesAdded = lines.length;
			for (const line of lines) {
				const completeLine = line + newlineChar;
				rawLines.push(completeLine);
				lineCount++;
				
				// Process line for plotting
				if (!isStatusMessage) {
					processLineForPlot(completeLine);
				}
			}
			
			// Trim old lines occasionally if we exceed max
			// Only trim every 100 lines when over limit to avoid constant trimming
			// This allows buffer to grow past maxLines and keeps usage display stable at 100%
			if (lineCount > maxLines && lineCount % 100 === 0) {
				const linesTrimmed = rawLines.length - maxLines;
				trimOldLines();
				// Don't force full render - trimOldLines() handles incremental DOM removal
				// Only force full render if we're not following or filter is active
				if (linesTrimmed > 0 && (!isFollowing || filterPattern)) {
					needsFullRender = true;
					lastRenderedLineIndex = -1; // Reset render tracking
				}
			}
			
			// Update usage - throttle to avoid excessive DOM updates
			// Update every 10 lines, or every 50 lines when over limit (less frequent updates when over)
			if (linesAdded > 0 && (lineCount % 10 === 0 || (lineCount > maxLines && lineCount % 50 === 0))) {
				updateLineUsage();
			}
			
			// Check if frozen view anchor has been trimmed away
			const anchorTrimmed = isFrozenView && frozenAnchorLine !== null && frozenAnchorLine <= totalTrimmedLines;
			
			// If not following (user scrolled up), handle frozen view
			if (!isFollowing) {
				// If anchor was lost and we're waiting for user to scroll 20+ lines, render normally
				if (anchorLostScrollTop !== null && !isFrozenView) {
					// Render normally maintaining scroll position - don't freeze yet
					// Keep anchorLostScrollTop fixed - don't update it, we want to track delta from when anchor was lost
					renderLinesWithBuffer();
					return;
				}
				
				// Freeze view if not already frozen
				if (!isFrozenView) {
					freezeView();
				}
				// If anchor hasn't been trimmed, skip rendering completely (frozen view)
				if (!anchorTrimmed) {
					return; // Don't render - view is frozen
				}
				// Anchor was trimmed - we must re-render, but unfreeze so user can scroll
				// Record scroll position BEFORE unfreezing (to track how far user scrolls)
				const currentScrollTop = monitor ? monitor.scrollTop : 0;
				// Set anchorLostScrollTop BEFORE unfreezing so render knows to skip anchor restoration
				anchorLostScrollTop = currentScrollTop;
				unfreezeView();
				// Render normally maintaining current scroll position (don't scroll to top)
				// anchorLostScrollTop is set, so render will skip anchor-based restoration
				renderLinesWithBuffer();
				// Update anchorLostScrollTop after render in case scroll position changed slightly
				if (monitor) {
					anchorLostScrollTop = monitor.scrollTop;
				}
				// Don't re-freeze immediately - wait for user to scroll down 20+ lines
				return;
			}
			
			// We are following - ensure view is not frozen
			if (isFrozenView) {
				unfreezeView();
			}
			
			// Optimize: only append new lines if we're following and no filter is active
			// and we haven't trimmed lines or changed filter
			if (isFollowing && !filterPattern && !needsFullRender && lastRenderedLineIndex >= 0) {
				appendNewLinesOnly(linesAdded);
			} else {
				// Full render needed (filter active, lines trimmed, or first render)
				needsFullRender = false;
				renderLinesWithBuffer();
			}
		}
		
		// Optimized function to append only new lines (when following and no filter)
		function appendNewLinesOnly(newLinesCount) {
			if (!monitor) return;
			
			// Remove existing buffer line before appending new complete lines
			// This prevents duplicates when a partial line completes
			const existingBuffer = monitor.querySelector('.line-buffer');
			if (existingBuffer) {
				existingBuffer.remove();
			}
			
			// Get the lines to append (only new ones)
			const startIndex = Math.max(0, lastRenderedLineIndex + 1);
			const endIndex = rawLines.length;
			
			if (startIndex >= endIndex) {
				// No new complete lines, just update buffer line if needed
				if (lineBuffer) {
					updateBufferLine();
				}
				return;
			}
			
			// Build HTML string for all new lines at once (much faster than DOM operations)
			let html = '';
			let state = currentAnsiState; // Use current ANSI state
			
			// Process only new lines - build HTML string
			for (let idx = startIndex; idx < endIndex; idx++) {
				const line = rawLines[idx];
				const textForDisplay = line.endsWith(newlineChar) ? line.slice(0, -1) : line;
				const result = parseAnsi(textForDisplay, state);
				const plainText = stripAnsiCodes(textForDisplay);
				
				// Escape HTML in plainText for data attribute
				const escapedPlainText = plainText.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
				
				// Build HTML string directly (much faster than DOM operations)
				html += '<div class="line" data-line="' + (totalTrimmedLines + idx + 1) + '" data-text="' + escapedPlainText + '">' + 
					result.html + 
					'</div>';
				
				state = result.finalState;
			}
			
			// Create a temporary container and set innerHTML once (single DOM operation)
			const tempDiv = document.createElement('div');
			tempDiv.innerHTML = html;
			
			// Move all children to fragment (faster than appendChild one by one)
			const fragment = document.createDocumentFragment();
			while (tempDiv.firstChild) {
				fragment.appendChild(tempDiv.firstChild);
			}
			
			// Append fragment to DOM (single reflow)
			monitor.appendChild(fragment);
			
			// Update buffer line if it exists (after appending complete lines)
			if (lineBuffer) {
				updateBufferLine();
			}
			
			// Update tracking
			lastRenderedLineIndex = endIndex - 1;
			currentAnsiState = state;
			
			// Scroll to bottom - use requestAnimationFrame to batch scroll operations
			// This prevents blocking if multiple batches arrive quickly
			if (!pendingScroll) {
				pendingScroll = true;
				isProgrammaticScroll = true; // Mark as programmatic scroll
				requestAnimationFrame(() => {
					if (monitor && isFollowing) {
						const newScrollTop = monitor.scrollHeight - monitor.clientHeight;
						lastScrollTop = newScrollTop; // Update BEFORE scrolling to prevent handler from thinking we scrolled up
						monitor.scrollTop = newScrollTop;
						// Reset flag after a short delay to allow scroll event to process
						setTimeout(() => {
							isProgrammaticScroll = false;
						}, 50);
					}
					pendingScroll = false;
				});
			}
		}
		
		// Update only the buffer line (incomplete line at the end)
		function updateBufferLine() {
			if (!monitor || !lineBuffer) return;
			
			// Remove existing buffer line if present
			const existingBuffer = monitor.querySelector('.line-buffer');
			if (existingBuffer) {
				existingBuffer.remove();
			}
			
			// Create new buffer line using innerHTML (faster than DOM operations)
			const textForDisplay = lineBuffer;
			const result = parseAnsi(textForDisplay, currentAnsiState);
			const bufferDiv = document.createElement('div');
			bufferDiv.className = 'line line-buffer';
			bufferDiv.innerHTML = result.html;
			monitor.appendChild(bufferDiv);
			currentAnsiState = result.finalState;
			
			// Scroll to bottom if following - use throttled scroll
			if (isFollowing && !pendingScroll) {
				pendingScroll = true;
				isProgrammaticScroll = true; // Mark as programmatic scroll
				requestAnimationFrame(() => {
					if (monitor && isFollowing) {
						const newScrollTop = monitor.scrollHeight - monitor.clientHeight;
						lastScrollTop = newScrollTop; // Update BEFORE scrolling
						monitor.scrollTop = newScrollTop;
						setTimeout(() => {
							isProgrammaticScroll = false;
						}, 50);
					}
					pendingScroll = false;
				});
			}
		}
		
		function renderLinesWithBuffer(forcedAnchorLine, forcedAnchorOffset) {
			// Safety check - ensure monitor element exists
			if (!monitor) {
				console.warn('FancyMon: renderLinesWithBuffer - monitor element not found!');
				return;
			}
			
			const previousScrollTop = monitor.scrollTop;
			const shouldStickToBottom = isFollowing;
			let anchorLineNumber = null;
			let anchorOffset = 0;
			
			if (!shouldStickToBottom) {
				// If anchor was lost and we're waiting for user to scroll 20+ lines,
				// don't use anchor-based restoration - just maintain scroll position
				if (anchorLostScrollTop !== null && !isFrozenView) {
					// Don't set anchorLineNumber - we'll use previousScrollTop directly
					anchorLineNumber = null;
				} else if (forcedAnchorLine !== null && forcedAnchorLine !== undefined) {
					// If forced anchor provided (e.g., from frozen view), use it
					anchorLineNumber = forcedAnchorLine;
					anchorOffset = forcedAnchorOffset || 0;
				} else if (isFrozenView && frozenAnchorLine !== null) {
					// If view is frozen, use the frozen anchor position
					anchorLineNumber = frozenAnchorLine;
					anchorOffset = frozenAnchorOffset;
				} else {
					// Otherwise, calculate from current scroll position
					const anchorInfo = getAnchorLineInfo(previousScrollTop);
					if (anchorInfo) {
						anchorLineNumber = anchorInfo.line;
						anchorOffset = anchorInfo.offset;
					}
				}
			}
			
			// Build line entries from raw lines
			let lineEntries = rawLines.map((line, idx) => ({
				text: line,
				lineNumber: totalTrimmedLines + idx + 1,
				isBuffer: false
			}));
			
			// Add incomplete buffer line if it exists (for live display)
			if (lineBuffer) {
				lineEntries = [...lineEntries, { text: lineBuffer, lineNumber: null, isBuffer: true }];
			}
			
			// Apply filter if pattern is set
			lineEntries = applyFilter(lineEntries, filterPattern);
			
			// Convert raw text lines to HTML, maintaining ANSI state across lines
			let html = '';
			let state = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
			
			for (const entry of lineEntries) {
				const textForDisplay = entry.text.endsWith(newlineChar) ? entry.text.slice(0, -1) : entry.text;
				const result = parseAnsi(textForDisplay, state);
				const plainText = stripAnsiCodes(textForDisplay);
				if (entry.lineNumber !== null && entry.lineNumber !== undefined) {
					html += '<div class="line" data-line="' + entry.lineNumber + '" data-text="' + escapeHtml(plainText) + '">' + result.html + '</div>';
				} else {
					html += '<div class="line line-buffer">' + result.html + '</div>';
				}
				state = result.finalState; // Maintain state across lines
			}
			
			// Update the monitor with rendered HTML
			monitor.innerHTML = html;
			
			// No need to attach event listeners - event delegation handles all clicks
			
			// Update render tracking after full render
			lastRenderedLineIndex = rawLines.length - 1;
			lastFilterPattern = filterPattern;
			
			// Restore scroll position based on follow state
			if (shouldStickToBottom) {
			// Scroll to bottom - use throttled scroll for better performance
			if (!pendingScroll) {
				pendingScroll = true;
				isProgrammaticScroll = true; // Mark as programmatic scroll
				requestAnimationFrame(() => {
					if (monitor && isFollowing) {
						const newScrollTop = monitor.scrollHeight - monitor.clientHeight;
						lastScrollTop = newScrollTop; // Update BEFORE scrolling
						monitor.scrollTop = newScrollTop;
						setTimeout(() => {
							isProgrammaticScroll = false;
						}, 50);
					}
					pendingScroll = false;
				});
			}
			} else {
				let restored = false;
				
				// If anchor was lost and we're waiting for user to scroll 20+ lines,
				// just maintain scroll position without anchor-based restoration
				if (anchorLostScrollTop !== null && anchorLineNumber === null) {
					const maxScroll = Math.max(0, monitor.scrollHeight - monitor.clientHeight);
					const targetTop = Math.min(previousScrollTop, maxScroll);
					monitor.scrollTop = Math.max(0, targetTop);
					restored = true;
				} else if (anchorLineNumber !== null) {
					// Check if anchor line still exists (hasn't been trimmed)
					if (anchorLineNumber > totalTrimmedLines) {
						const anchorEl = monitor.querySelector('.line[data-line="' + anchorLineNumber + '"]');
						if (anchorEl instanceof HTMLElement) {
							monitor.scrollTop = Math.max(0, anchorEl.offsetTop + anchorOffset);
							restored = true;
						}
					}
					// If anchor line was trimmed, maintain scroll position if anchorLostScrollTop is set
					// (user is scrolling after anchor was lost)
					if (!restored && anchorLineNumber <= totalTrimmedLines) {
						if (anchorLostScrollTop !== null) {
							// Maintain scroll position - user is scrolling after anchor was lost
							const maxScroll = Math.max(0, monitor.scrollHeight - monitor.clientHeight);
							const targetTop = Math.min(previousScrollTop, maxScroll);
							monitor.scrollTop = Math.max(0, targetTop);
							restored = true;
						} else {
							// No anchor lost tracking - scroll to top of remaining buffer
							monitor.scrollTop = 0;
							restored = true;
						}
					}
				}
				
				if (!restored) {
					const maxScroll = Math.max(0, monitor.scrollHeight - monitor.clientHeight);
					const targetTop = Math.min(previousScrollTop, maxScroll);
					monitor.scrollTop = Math.max(0, targetTop);
				}
			}
			lastScrollTop = monitor.scrollTop;
			
			// Update global ANSI state for new incoming data
			currentAnsiState = state;
			
			// Update scrollbar indicator if view is frozen
			updateScrollbarIndicator();
		}

		// Monitor scroll events to detect when user scrolls up/down
		if (monitor) {
			try {
				function handleScroll() {
					if (!monitor) return;
					
					// Ignore programmatic scrolls - they're from us maintaining auto-follow
					if (isProgrammaticScroll) {
						return;
					}
					
					const currentScrollTop = monitor.scrollTop;
					const scrolledUp = currentScrollTop < lastScrollTop;
					const nearBottom = isAtBottom();
					const wasFollowing = isFollowing;
					
					// Check if anchor was lost and user has scrolled down more than 20 lines
					// Do this FIRST before other checks to prevent interference
					if (anchorLostScrollTop !== null && !isFrozenView) {
						const lineHeight = getLineHeightEstimate();
						const scrollDelta = currentScrollTop - anchorLostScrollTop;
						const linesScrolled = scrollDelta / lineHeight;
						
						if (linesScrolled > 20) {
							// User has scrolled down more than 20 lines, re-freeze
							freezeView();
							anchorLostScrollTop = null; // Clear the tracking
							isFollowing = false; // Disable following since we're freezing
							lastScrollTop = currentScrollTop;
							return; // Exit early - we've frozen, don't process other scroll logic
						}
					}
					
					// Only disable following if user scrolled UP and is not near bottom
					if (scrolledUp && !nearBottom) {
						if (isFollowing) {
							isFollowing = false;
							freezeView();
							anchorLostScrollTop = null; // Clear anchor lost tracking
							// Reset render tracking when switching to non-following mode
							needsFullRender = true;
							lastRenderedLineIndex = -1;
						} else if (!isFrozenView) {
							freezeView();
							anchorLostScrollTop = null; // Clear anchor lost tracking
						}
					} else if (nearBottom) {
						// Enable following if within 10 lines of bottom
						// But don't do this if we're waiting for user to scroll 20+ lines after anchor loss
						if (!isFollowing && anchorLostScrollTop === null) {
							isFollowing = true;
							unfreezeView();
							// Reset render tracking when switching to following mode
							needsFullRender = true;
							lastRenderedLineIndex = -1;
							renderLinesWithBuffer();
						}
					}
					
					lastScrollTop = currentScrollTop;
				}
				monitor.addEventListener('scroll', handleScroll);
			} catch (e) {
				console.error('FancyMon: Error setting up scroll listener:', e);
			}
			
			// Right-click context menu for lines
			let contextMenu = null;
			let selectedLineElement = null;
			
			// Create context menu element
			function createContextMenu() {
				if (contextMenu) return contextMenu;
				contextMenu = document.createElement('div');
				contextMenu.className = 'context-menu';
				contextMenu.id = 'contextMenu';
				const menuItem = document.createElement('div');
				menuItem.className = 'context-menu-item';
				menuItem.textContent = 'Add selected line to plot';
				menuItem.addEventListener('click', () => {
					if (selectedLineElement) {
						const lineText = selectedLineElement.getAttribute('data-text');
						if (lineText && patternInput) {
							patternInput.value = lineText;
							updateExtractionPreview();
							const plotTabBtn = document.querySelector('.tab[data-tab="plot"]');
							if (plotTabBtn) {
								plotTabBtn.click();
							}
						}
					}
					hideContextMenu();
				});
				contextMenu.appendChild(menuItem);
				document.body.appendChild(contextMenu);
				return contextMenu;
			}
			
			function showContextMenu(x, y, lineElement) {
				const menu = createContextMenu();
				selectedLineElement = lineElement;
				menu.style.display = 'block';
				menu.style.left = x + 'px';
				menu.style.top = y + 'px';
			}
			
			function hideContextMenu() {
				if (contextMenu) {
					contextMenu.style.display = 'none';
					selectedLineElement = null;
				}
			}
			
			// Handle right-click on lines
			monitor.addEventListener('contextmenu', (e) => {
				// Find the closest .line element
				const lineElement = e.target.closest('.line');
				if (lineElement && lineElement.getAttribute('data-text')) {
					e.preventDefault();
					e.stopPropagation();
					showContextMenu(e.pageX, e.pageY, lineElement);
				}
			});
			
			// Hide context menu on click elsewhere
			document.addEventListener('click', (e) => {
				if (contextMenu && !contextMenu.contains(e.target)) {
					hideContextMenu();
				}
			});
			
			// Hide context menu on scroll
			monitor.addEventListener('scroll', () => {
				hideContextMenu();
			});
		}

		function setStatus(message, type = '') {
			status.textContent = message;
			status.className = 'status ' + type;
		}

		refreshPorts.addEventListener('click', () => {
			vscode.postMessage({ command: 'listPorts' });
		});

		// Connect/Disconnect toggle button
		if (connectToggleBtn) {
			connectToggleBtn.addEventListener('click', () => {
				if (isConnected) {
					// Disconnect
					if (isDisconnecting) {
						return; // Prevent multiple clicks
					}
					isDisconnecting = true;
					connectToggleBtn.disabled = true;
					vscode.postMessage({ command: 'disconnect' });
				} else {
					// Connect
					if (!portSelect.value) {
						setStatus('Please select a port', 'error');
						return;
					}
					
					vscode.postMessage({
						command: 'connect',
						config: {
							port: portSelect.value,
							baudRate: getBaudRate(),
							dataBits: parseInt(dataBits.value),
							stopBits: parseInt(stopBits.value),
							parity: parity.value,
							maxLines: maxLines
						}
					});
				}
			});
		}

		sendResetBtn.addEventListener('click', () => {
			vscode.postMessage({ command: 'sendReset' });
		});

		// Update baud rate when custom field changes
		customBaudRate.addEventListener('input', () => {
			if (customBaudRate.value) {
				baudRate.value = '';
			}
		});

		baudRate.addEventListener('change', () => {
			if (baudRate.value) {
				customBaudRate.value = '';
			}
		});

		clearBtn.addEventListener('click', () => {
			rawLines = [];
			lineBuffer = '';
			lineCount = 0;
			totalTrimmedLines = 0;
			currentAnsiState = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
			monitor.innerHTML = '';
			lastScrollTop = 0;
			isFollowing = true; // Reset to following mode after clear
			unfreezeView();
			lastRenderedLineIndex = -1; // Reset render tracking
			needsFullRender = false;
			updateLineUsage();
			vscode.postMessage({ command: 'clear' });
		});

		// Toggle line wrapping
		if (toggleWrapBtn && monitor) {
			toggleWrapBtn.addEventListener('click', () => {
				lineWrapEnabled = !lineWrapEnabled;
				if (lineWrapEnabled) {
					monitor.classList.remove('no-wrap');
					toggleWrapBtn.classList.add('active');
					toggleWrapBtn.title = 'Line wrapping enabled (click to disable)';
				} else {
					monitor.classList.add('no-wrap');
					toggleWrapBtn.classList.remove('active');
					toggleWrapBtn.title = 'Line wrapping disabled (click to enable)';
				}
				
				// Save wrap state
				vscode.postMessage({
					command: 'updateWrapState',
					lineWrapEnabled: lineWrapEnabled
				});
			});
		}

		maxLinesInput.addEventListener('change', () => {
			const newMax = parseInt(maxLinesInput.value) || 10000;
			if (newMax >= 100 && newMax <= 1000000) {
				maxLines = newMax;
				console.log('FancyMon: Max lines set to', maxLines);
				// Trim if current count exceeds new max
				if (rawLines.length > maxLines) {
					trimOldLines();
				}
				updateLineUsage();
				// Save the updated maxLines setting
				vscode.postMessage({
					command: 'updateConfig',
					config: { maxLines: maxLines }
				});
			} else {
				maxLinesInput.value = maxLines.toString();
			}
		});

		// Filter input event listener
		if (filterInput) {
			filterInput.addEventListener('input', () => {
				const newPattern = filterInput.value.trim();
				const filterChanged = newPattern !== filterPattern;
				filterPattern = newPattern;
				console.log('FancyMon: Filter pattern changed to:', filterPattern);
				// Re-render with new filter (force full render)
				if (filterChanged) {
					needsFullRender = true;
					lastRenderedLineIndex = -1;
					renderLinesWithBuffer();
				}
			});
		}

		saveBtn.addEventListener('click', () => {
			// Get raw text content (remove ANSI codes for saving)
			// Use character code escape sequence in regex pattern string
			const pattern = '\\\\x1b\\\\[[0-9;]*[a-zA-Z]';
			const ansiRegex = new RegExp(pattern, 'g');
			const content = (rawLines.join('') + lineBuffer).replace(ansiRegex, '');
			
			if (content.trim().length === 0) {
				vscode.postMessage({ command: 'error', message: 'No data to save' });
				return;
			}
			vscode.postMessage({ command: 'save', content: content });
		});

		// Copy functions
		function copyToClipboard(text) {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(text).then(() => {
					console.log('FancyMon: Copied to clipboard');
				}).catch(err => {
					console.error('FancyMon: Failed to copy:', err);
					vscode.postMessage({ command: 'error', message: 'Failed to copy to clipboard' });
				});
			} else {
				// Fallback for older browsers
				const textArea = document.createElement('textarea');
				textArea.value = text;
				textArea.style.position = 'fixed';
				textArea.style.opacity = '0';
				document.body.appendChild(textArea);
				textArea.select();
				try {
					document.execCommand('copy');
					console.log('FancyMon: Copied to clipboard (fallback)');
				} catch (err) {
					console.error('FancyMon: Failed to copy:', err);
					vscode.postMessage({ command: 'error', message: 'Failed to copy to clipboard' });
				}
				document.body.removeChild(textArea);
			}
		}

		copyAllBtn.addEventListener('click', () => {
			// Copy all raw lines (remove ANSI codes)
			const pattern = '\\\\x1b\\\\[[0-9;]*[a-zA-Z]';
			const ansiRegex = new RegExp(pattern, 'g');
			const content = (rawLines.join('') + lineBuffer).replace(ansiRegex, '');
			
			if (content.trim().length === 0) {
				vscode.postMessage({ command: 'error', message: 'No data to copy' });
				return;
			}
			copyToClipboard(content);
		});

		copyFilteredBtn.addEventListener('click', () => {
			// Copy all filtered lines (remove ANSI codes)
			if (!filterPattern || filterPattern.trim() === '') {
				vscode.postMessage({ command: 'error', message: 'No filter pattern set' });
				return;
			}
			
			// Build line entries from raw lines
			let lineEntries = rawLines.map((line, idx) => ({
				text: line,
				lineNumber: totalTrimmedLines + idx + 1,
				isBuffer: false
			}));
			
			// Add incomplete buffer line if it exists
			if (lineBuffer) {
				lineEntries = [...lineEntries, { text: lineBuffer, lineNumber: null, isBuffer: true }];
			}
			
			// Apply filter
			const filteredEntries = applyFilter(lineEntries, filterPattern);
			
			// Strip ANSI codes and join
			const pattern = '\\\\x1b\\\\[[0-9;]*[a-zA-Z]';
			const ansiRegex = new RegExp(pattern, 'g');
			const content = filteredEntries.map(entry => stripAnsiCodes(entry.text)).join('');
			
			if (content.trim().length === 0) {
				vscode.postMessage({ command: 'error', message: 'No filtered data to copy' });
				return;
			}
			copyToClipboard(content);
		});

		copyVisibleBtn.addEventListener('click', () => {
			// Copy only visible lines in the viewport
			if (!monitor) {
				vscode.postMessage({ command: 'error', message: 'Monitor element not found' });
				return;
			}
			
			const scrollTop = monitor.scrollTop;
			const clientHeight = monitor.clientHeight;
			const viewportTop = scrollTop;
			const viewportBottom = scrollTop + clientHeight;
			
			// Get all line elements
			const lineElements = monitor.querySelectorAll('.line[data-line]');
			const visibleLines = [];
			
			for (const el of lineElements) {
				if (!(el instanceof HTMLElement)) continue;
				const top = el.offsetTop;
				const bottom = top + el.offsetHeight;
				
				// Check if line is visible (overlaps with viewport)
				if (bottom > viewportTop && top < viewportBottom) {
					const lineAttr = el.getAttribute('data-line');
					if (lineAttr) {
						const lineNumber = parseInt(lineAttr, 10);
						// Get the raw text for this line
						if (lineNumber > totalTrimmedLines) {
							const idx = lineNumber - totalTrimmedLines - 1;
							if (idx >= 0 && idx < rawLines.length) {
								visibleLines.push(rawLines[idx]);
							}
						}
					}
				}
			}
			
			// Also check buffer line if visible
			const bufferLine = monitor.querySelector('.line-buffer');
			if (bufferLine instanceof HTMLElement) {
				const top = bufferLine.offsetTop;
				const bottom = top + bufferLine.offsetHeight;
				if (bottom > viewportTop && top < viewportBottom && lineBuffer) {
					visibleLines.push(lineBuffer);
				}
			}
			
			if (visibleLines.length === 0) {
				vscode.postMessage({ command: 'error', message: 'No visible data to copy' });
				return;
			}
			
			// Strip ANSI codes and join
			const pattern = '\\\\x1b\\\\[[0-9;]*[a-zA-Z]';
			const ansiRegex = new RegExp(pattern, 'g');
			const content = visibleLines.join('').replace(ansiRegex, '');
			
			if (content.trim().length === 0) {
				vscode.postMessage({ command: 'error', message: 'No visible data to copy' });
				return;
			}
			copyToClipboard(content);
		});

		sendBtn.addEventListener('click', () => {
			const data = sendInput.value;
			if (data) {
				vscode.postMessage({ command: 'send', data: data + '\\n' });
				sendInput.value = '';
			}
		});

		sendInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				sendBtn.click();
			}
		});

		portSelect.addEventListener('change', () => {
			updateUI();
		});

		// Listen for messages from extension
		console.log('FancyMon: Setting up message listener...');
		if (typeof window !== 'undefined' && window.addEventListener) {
			window.addEventListener('message', function(event) {
				try {
					const message = event.data;
					if (message?.command !== 'data') {
						console.log('FancyMon: Received message:', message ? message.command : 'null', message);
					}
					
					if (!message || !message.command) {
						console.warn('FancyMon: Received invalid message:', message);
						return;
					}
					
					switch (message.command) {
				case 'portsListed':
					console.log('FancyMon: Received ports list:', message.ports);
					console.log('FancyMon: Last config:', message.lastConfig);
					console.log('FancyMon: portSelect element:', portSelect);
					if (!portSelect) {
						console.error('FancyMon: portSelect element not found!');
						return;
					}
					portSelect.innerHTML = '<option value="">Select port...</option>';
					if (message.ports && message.ports.length > 0) {
						message.ports.forEach(port => {
							const option = document.createElement('option');
							option.value = port.path;
							option.textContent = port.path + (port.manufacturer ? ' (' + port.manufacturer + ')' : '');
							portSelect.appendChild(option);
						});
						console.log('FancyMon: Populated', message.ports.length, 'ports');
						
						// Restore last configuration if available
						if (message.lastConfig) {
							const config = message.lastConfig;
							let shouldAutoConnect = false;
							
							// Restore port selection
							if (config.port && portSelect.querySelector('option[value="' + config.port + '"]')) {
								portSelect.value = config.port;
								console.log('FancyMon: Restored port:', config.port);
								shouldAutoConnect = true; // Port exists, can auto-connect
							}
							
							// Restore baud rate
							if (config.baudRate) {
								// Check if it's in the dropdown
								const baudOption = baudRate.querySelector('option[value="' + config.baudRate + '"]');
								if (baudOption) {
									baudRate.value = config.baudRate.toString();
									customBaudRate.value = '';
									console.log('FancyMon: Restored baud rate from dropdown:', config.baudRate);
								} else {
									// Use custom baud rate field
									customBaudRate.value = config.baudRate.toString();
									baudRate.value = '';
									console.log('FancyMon: Restored custom baud rate:', config.baudRate);
								}
							} else {
								shouldAutoConnect = false; // No baud rate, can't connect
							}
							
							// Restore data bits
							if (config.dataBits) {
								dataBits.value = config.dataBits.toString();
							}
							
							// Restore stop bits
							if (config.stopBits) {
								stopBits.value = config.stopBits.toString();
							}
							
							// Restore parity
							if (config.parity) {
								parity.value = config.parity;
							}
							
							// Restore max lines
							if (config.maxLines && maxLinesInput) {
								maxLines = config.maxLines;
								maxLinesInput.value = config.maxLines.toString();
								updateLineUsage();
							}
							
							// Restore wrap state
							if (message.lineWrapEnabled !== undefined) {
								lineWrapEnabled = message.lineWrapEnabled;
								if (monitor && toggleWrapBtn) {
									if (lineWrapEnabled) {
										monitor.classList.remove('no-wrap');
										toggleWrapBtn.classList.add('active');
									} else {
										monitor.classList.add('no-wrap');
										toggleWrapBtn.classList.remove('active');
									}
									toggleWrapBtn.title = lineWrapEnabled ? 'Line wrapping enabled (click to disable)' : 'Line wrapping disabled (click to enable)';
								}
							}
							
							// Auto-connect if we have a valid configuration
							if (shouldAutoConnect && config.port && config.baudRate) {
								console.log('FancyMon: Auto-connecting with restored configuration...');
								setTimeout(() => {
									if (connectToggleBtn) {
										connectToggleBtn.click();
									}
								}, 100); // Small delay to ensure UI is updated
							}
						}
					} else {
						console.log('FancyMon: No ports available');
						const option = document.createElement('option');
						option.value = '';
						option.textContent = 'No ports found';
						portSelect.appendChild(option);
					}
					
					// Restore wrap state (even if no ports/config available)
					if (message.lineWrapEnabled !== undefined) {
						lineWrapEnabled = message.lineWrapEnabled;
						if (monitor && toggleWrapBtn) {
							if (lineWrapEnabled) {
								monitor.classList.remove('no-wrap');
								toggleWrapBtn.classList.add('active');
							} else {
								monitor.classList.add('no-wrap');
								toggleWrapBtn.classList.remove('active');
							}
							toggleWrapBtn.title = lineWrapEnabled ? 'Line wrapping enabled (click to disable)' : 'Line wrapping disabled (click to enable)';
						}
					}
					
					updateUI();
					break;
					
				case 'connected':
					isConnected = true;
					isDisconnecting = false;
					setStatus('Connected to ' + portSelect.value, 'connected');
					updateUI();
					break;
					
				case 'disconnecting':
					isDisconnecting = true;
					const pendingBytes = message.pendingBytes || 0;
					const pendingChunks = message.pendingChunks || 0;
					const elapsedMs = message.elapsedMs || 0;
					
					if (pendingBytes > 0 || pendingChunks > 0) {
						const pendingKB = (pendingBytes / 1024).toFixed(1);
						setStatus('Disconnecting... (' + pendingKB + ' KB, ' + pendingChunks + ' chunks pending, ' + elapsedMs + 'ms)', '');
					} else {
						setStatus('Disconnecting...', '');
					}
					updateUI();
					break;
					
				case 'disconnected':
					isConnected = false;
					isDisconnecting = false;
					setStatus('Disconnected', '');
					updateUI();
					break;
					
				case 'data':
					// Allow disconnect/connect status messages through even when disconnecting
					// These are important status messages that should be stored
					const isStatusMessage = message.data && (
						message.data.includes('[[ DISCONNECTED ]]') ||
						message.data.includes('[[ CONNECTED ]]') ||
						message.data.includes('[[ RESET SENT TO DEVICE ]]')
					);
					
					// Process data if not disconnecting, OR if it's a status message
					if (!isDisconnecting || isStatusMessage) {
						appendData(message.data);
					} else {
						console.log('FancyMon: Ignoring data - disconnecting');
					}
					break;
					
				case 'error':
					// Reset connection state on error (connection failed)
					isConnected = false;
					isDisconnecting = false;
					setStatus(message.message, 'error');
					updateUI();
					break;
					
				case 'clear':
					rawLines = [];
					lineBuffer = '';
					lineCount = 0;
					currentAnsiState = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
					monitor.innerHTML = '';
					lastScrollTop = 0;
					isFollowing = true; // Reset to following mode after clear
					lastRenderedLineIndex = -1; // Reset render tracking
					needsFullRender = false;
					updateLineUsage();
					break;
					
				default:
					console.warn('FancyMon: Unknown command:', message.command);
					break;
				}
				} catch (e) {
					console.error('FancyMon: Error handling message:', e, event.data);
				}
			});
		} else {
			console.error('FancyMon: window.addEventListener not available!');
		}

		// Initialize maxLines from input field
		if (maxLinesInput) {
			maxLines = parseInt(maxLinesInput.value) || 10000;
		}
		updateLineUsage();
		
		// Initialize scroll tracking
		if (monitor) {
			lastScrollTop = monitor.scrollTop;

			// Handle window resize to ensure monitor fills available space
			const resizeObserver = new ResizeObserver(() => {
			// If following, scroll to bottom after resize
			if (isFollowing && monitor) {
				isProgrammaticScroll = true;
				const newScrollTop = monitor.scrollHeight - monitor.clientHeight;
				lastScrollTop = newScrollTop;
				monitor.scrollTop = newScrollTop;
				setTimeout(() => {
					isProgrammaticScroll = false;
				}, 50);
			}
			});
			resizeObserver.observe(document.body);

			// Also listen to window resize events
			window.addEventListener('resize', () => {
			// If following, scroll to bottom after resize
			if (isFollowing && monitor) {
				isProgrammaticScroll = true;
				const newScrollTop = monitor.scrollHeight - monitor.clientHeight;
				lastScrollTop = newScrollTop;
				monitor.scrollTop = newScrollTop;
				setTimeout(() => {
					isProgrammaticScroll = false;
				}, 50);
			}
			});
		}

		// Initial port list - wait a bit for the message handler to be ready
		console.log('FancyMon: Setting up initial port list request...');
		console.log('FancyMon: vscode object check:', typeof vscode, vscode);
		console.log('FancyMon: portSelect check:', portSelect);
		
		// Also set a visual indicator that script is running
		if (status) {
			status.textContent = 'Initializing...';
		}
		
		function requestPortList() {
			console.log('FancyMon: Webview loaded, requesting port list...');
			console.log('FancyMon: vscode object:', typeof vscode);
			console.log('FancyMon: portSelect element:', portSelect);
			if (vscode && vscode.postMessage) {
				vscode.postMessage({ command: 'listPorts' });
				console.log('FancyMon: Port list request sent');
				if (status) {
					status.textContent = 'Requesting ports...';
				}
			} else {
				console.error('FancyMon: vscode.postMessage not available!');
				if (status) {
					status.textContent = 'Error: vscode API not available';
					status.className = 'status error';
				}
			}
			updateUI();
		}
		setTimeout(requestPortList, 100);
		} catch (e) {
			console.error('FancyMon: Fatal error in script:', e);
			if (typeof status !== 'undefined' && status) {
				status.textContent = 'Error: ' + (e.message || e);
				status.className = 'status error';
			}
		}
	</script>
</body>
</html>`;
}

