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
	<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
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
		
		/* Ensure no hidden margins on labels or inputs */
		label, input, span {
			margin: 0;
			padding: 0;
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
			overflow: visible;
		}

		.control-group {
			display: flex;
			align-items: center;
			gap: 5px;
			overflow: visible;
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

		.send-input-wrapper {
			flex: 1;
			position: relative;
			display: flex;
			z-index: 1001;
		}

		.send-area input {
			flex: 1;
			border-left: none;
			border-radius: 0 2px 2px 0;
		}

		.history-btn {
			width: 30px;
			padding: 0;
			font-size: 12px;
			border-right: none;
			border-radius: 2px 0 0 2px;
			cursor: pointer;
			background-color: var(--vscode-input-background);
			color: var(--vscode-foreground);
			border: 1px solid var(--vscode-input-border);
			border-right: none;
		}

		.history-btn:hover:not(:disabled) {
			background-color: var(--vscode-list-hoverBackground);
		}

		.history-btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.history-dropdown {
			position: absolute;
			bottom: 100%;
			left: 0;
			width: 100%;
			height: 300px;
			max-height: 300px;
			overflow-y: auto;
			overflow-x: hidden;
			background-color: var(--vscode-dropdown-background);
			border: 1px solid var(--vscode-dropdown-border);
			border-radius: 2px;
			box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.3);
			z-index: 1002;
			margin-bottom: 2px;
		}

		/* Special styling for filter dropdowns that should appear BELOW the input */
		.filter-dropdown {
			top: 100%;
			bottom: auto;
			margin-top: 2px;
			margin-bottom: 0;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		}

		.history-item {
			padding: 6px 10px;
			cursor: pointer;
			border-bottom: 1px solid var(--vscode-dropdown-border);
			font-size: 12px;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
			display: block;
			min-height: 24px;
		}

		.history-item:hover {
			background-color: var(--vscode-list-hoverBackground);
		}

		.history-item:last-child {
			border-bottom: none;
		}

		.history-item.empty {
			padding: 10px;
			text-align: center;
			color: var(--vscode-descriptionForeground);
			cursor: default;
		}

		.history-item.selected {
			background-color: var(--vscode-list-activeSelectionBackground);
			color: var(--vscode-list-activeSelectionForeground);
		}

		.history-separator {
			padding: 6px 10px;
			font-size: 10px;
			color: var(--vscode-descriptionForeground);
			border-bottom: 1px solid var(--vscode-dropdown-border);
			letter-spacing: 0.5px;
			text-transform: uppercase;
			cursor: default;
			user-select: none;
		}

		.history-item.pinned {
			font-weight: 600;
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

		.plot-control-row input[type="text"],
		.plot-control-row select {
			flex: 1;
			min-width: 200px;
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border: 1px solid var(--vscode-input-border);
			border-radius: 2px;
			padding: 4px 8px;
			font-size: 12px;
			font-family: var(--vscode-font-family);
		}

		.plot-control-row select {
			cursor: pointer;
		}

		.plot-control-row select:hover {
			border-color: var(--vscode-inputOption-activeBorder);
		}

		.plot-control-row select:focus {
			outline: 1px solid var(--vscode-focusBorder);
			outline-offset: -1px;
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
			flex-wrap: wrap;
			gap: 5px;
			margin-top: 10px;
		}

		.variable-item {
			display: flex;
			align-items: center;
			gap: 5px;
			padding: 2px 8px;
			background-color: var(--vscode-input-background);
			border: 1px solid var(--vscode-input-border);
			border-radius: 2px;
			flex: 0 1 auto;
		}

		.variable-item .variable-name {
			font-weight: bold;
			font-size: 11px;
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
			min-width: 60px;
		}

		.plot-container {
			flex: 1 1 auto;
			min-height: 0;
			position: relative;
			background-color: var(--vscode-textCodeBlock-background);
			border: 1px solid var(--vscode-panel-border);
			border-radius: 2px;
		}

		#plotDiv {
			width: 100%;
			height: 100%;
		}

		.custom-legend {
			position: absolute;
			top: 10px;
			display: flex;
			flex-direction: row;
			gap: 15px;
			background-color: rgba(255, 255, 255, 0.9);
			padding: 5px 10px;
			border-radius: 3px;
			border: 1px solid var(--vscode-panel-border);
			font-size: 12px;
			z-index: 10;
			pointer-events: auto;
		}

		.y1-legend {
			left: 10px;
		}

		.y2-legend {
			right: 280px;
			display: grid !important;
			grid-template-columns: repeat(2, auto);
			grid-auto-flow: row;
			gap: 5px 15px;
			align-items: start;
			flex-direction: unset;
		}

		.y2-legend .custom-legend-item {
			display: flex;
			align-items: center;
			gap: 5px;
			cursor: pointer;
			padding: 2px 5px;
			border-radius: 2px;
			width: max-content;
		}

		.custom-legend-item {
			display: flex;
			align-items: center;
			gap: 5px;
			cursor: pointer;
			padding: 2px 5px;
			border-radius: 2px;
		}

		.custom-legend-item:hover {
			background-color: var(--vscode-list-hoverBackground);
		}

		.custom-legend-item.hidden {
			opacity: 0.4;
			text-decoration: line-through;
		}

		.custom-legend-color {
			width: 12px;
			height: 12px;
			border-radius: 2px;
			display: inline-block;
		}

		.custom-legend-item span:not(.custom-legend-color) {
			color: #000000;
			font-weight: 500;
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
		<button id="selectElfBtn" title="Load ELF File">Load ELF File</button>
		<button id="testBacktraceBtn" title="Simulate Backtrace Data">Test</button>
	</div>

	<div class="controls-row">
		<div class="control-group" style="flex: 1;">
			<label>Include:</label>
			<div class="filter-input-wrapper" style="flex: 1; position: relative; display: flex; z-index: 1001; overflow: visible;">
				<button id="includeHistoryBtn" class="history-btn" title="Filter history">▼</button>
				<input type="text" id="filterInput" placeholder="Comma-separated patterns to include..." style="flex: 1; min-width: 200px; border-left: none; border-radius: 0 2px 2px 0;">
				<div id="includeHistoryDropdown" class="history-dropdown filter-dropdown" style="display: none;"></div>
			</div>
		</div>
		<div class="control-group" style="flex: 1;">
			<label>Exclude:</label>
			<div class="filter-input-wrapper" style="flex: 1; position: relative; display: flex; z-index: 1001; overflow: visible;">
				<button id="excludeHistoryBtn" class="history-btn" title="Filter history">▼</button>
				<input type="text" id="excludeFilterInput" placeholder="Comma-separated patterns to exclude..." style="flex: 1; min-width: 200px; border-left: none; border-radius: 0 2px 2px 0;">
				<div id="excludeHistoryDropdown" class="history-dropdown filter-dropdown" style="display: none;"></div>
			</div>
		</div>
	</div>

	<div class="monitor" id="monitor">
		<div class="scrollbar-indicator" id="scrollbarIndicator"></div>
	</div>

	<div class="send-area">
		<div class="send-input-wrapper">
			<button id="historyBtn" class="history-btn" disabled title="Message history">▼</button>
			<input type="text" id="sendInput" placeholder="Type message to send..." disabled>
			<div id="historyDropdown" class="history-dropdown" style="display: none;"></div>
		</div>
		<button id="sendBtn" disabled>Send</button>
	</div>

	<div class="status" id="status">Disconnected</div>
	</div>

	<div class="tab-content" id="plotTab">
		<div class="plot-controls">
			<div class="plot-control-row">
				<label>Time Pattern (X-axis):</label>
				<div class="time-pattern-wrapper" style="flex: 1; position: relative; display: flex; z-index: 1001; overflow: visible;">
					<button id="timePatternHistoryBtn" class="history-btn" title="Time pattern history">▼</button>
					<input type="text" id="timePatternInput" placeholder="Regex pattern for time value (e.g., \\(([0-9]+)\\))" value="\\(([0-9]+)\\)" style="flex: 1; min-width: 200px; border-left: none; border-radius: 0 2px 2px 0;">
					<div id="timePatternHistoryDropdown" class="history-dropdown filter-dropdown" style="display: none;"></div>
				</div>
				<span id="timePatternHint" style="font-size: 11px; color: var(--vscode-descriptionForeground);">Extracts uptime from parentheses</span>
			</div>
			<div class="plot-control-row">
				<label>Session:</label>
				<select id="sessionSelect" style="flex: 1; min-width: 200px;">
					<option value="">New session</option>
				</select>
			</div>
			<div class="plot-control-row">
				<label>Pattern Input:</label>
				<input type="text" id="patternInput" placeholder="Enter or paste line text here..." style="flex: 1; min-width: 200px;">
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
			<div id="plotDiv"></div>
			<div id="y1Legend" class="custom-legend y1-legend"></div>
			<div id="y2Legend" class="custom-legend y2-legend"></div>
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
		const historyBtn = document.getElementById('historyBtn');
		const historyDropdown = document.getElementById('historyDropdown');
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
		const excludeFilterInput = document.getElementById('excludeFilterInput');
		const includeHistoryBtn = document.getElementById('includeHistoryBtn');
		const excludeHistoryBtn = document.getElementById('excludeHistoryBtn');
		const includeHistoryDropdown = document.getElementById('includeHistoryDropdown');
		const excludeHistoryDropdown = document.getElementById('excludeHistoryDropdown');
		const testBacktraceBtn = document.getElementById('testBacktraceBtn');
		const timePatternHistoryBtn = document.getElementById('timePatternHistoryBtn');
		const timePatternHistoryDropdown = document.getElementById('timePatternHistoryDropdown');
		const timePatternHint = document.getElementById('timePatternHint');
		
		let maxLines = 10000;
		let lineCount = 0;
		let totalTrimmedLines = 0;
		let isFrozenView = false;
		
		// Message history (most recent first, max 30 items)
		let messageHistory = [];
		const MAX_HISTORY = 30;
		let selectedHistoryIndex = -1; // Track selected item for keyboard navigation
		
		// Filter history (most recent first, max 30 items)
		let includeFilterHistory = [];
		let excludeFilterHistory = [];
		const MAX_FILTER_HISTORY = 30;
		let selectedIncludeHistoryIndex = -1;
		let selectedExcludeHistoryIndex = -1;

		// Time pattern history (most recent first, max 30 items)
		let timePatternHistory = [];
		const MAX_TIME_PATTERN_HISTORY = 30;
		let selectedTimePatternHistoryIndex = -1;
		let timePatternDebounceTimer = null;
		const TIME_PATTERN_HISTORY_DEBOUNCE_MS = 5000;
		let timePatternDropdownItems = []; // Flattened list of selectable items (recent + pinned)

		// Pinned time patterns (always visible at bottom of dropdown)
		// IMPORTANT: These strings are what the user should type into the input (single backslashes),
		// i.e. \d means "digit" in RegExp, and \[ means "literal ["
		// NOTE: Inside template string, '\\' in source becomes '\' at runtime
		// So '\\d' in source = '\d' at runtime (correct - single backslash before d)
		// The pattern constant is defined with '\\' to get '\' at runtime
		const DEFAULT_UPTIME_TIME_PATTERN = '\\\\(([0-9]+)\\\\)';
		const RTC_DATETIME_TIME_PATTERN = '\\[(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3})\\]';
		const PINNED_TIME_PATTERNS = [
			{
				label: 'RTC datetime [YYYY-MM-DD HH:MM:SS.mmm]',
				pattern: RTC_DATETIME_TIME_PATTERN,
				hint: 'Extracts RTC datetime from brackets'
			},
			{
				label: 'Uptime (ticks) (####)',
				pattern: DEFAULT_UPTIME_TIME_PATTERN,
				hint: 'Extracts uptime from parentheses'
			}
		];

		let currentTimeAxisMode = 'uptime'; // 'uptime' | 'rtc'
		
		// Debounce timers for filter history (5 seconds)
		let includeFilterDebounceTimer = null;
		let excludeFilterDebounceTimer = null;
		const FILTER_HISTORY_DEBOUNCE_MS = 5000;
		let frozenAnchorLine = null;
		let frozenAnchorOffset = 0;
		let anchorLostScrollTop = null; // Track scroll position when anchor was lost
		let lineWrapEnabled = true; // Default to wrapping enabled
		
		// Raw text storage - stores lines as strings with ANSI codes preserved
		let rawLines = [];
		let filterPattern = ''; // Include filter pattern for dynamic filtering
		let excludeFilterPattern = ''; // Exclude filter pattern for dynamic filtering
		let lastExcludeFilterPattern = ''; // Last exclude filter pattern used for rendering
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
		const plotDiv = document.getElementById('plotDiv');
		
		let plotVariables = []; // Array of {id, name, pattern, regex, data: [{time, value}], color}
		let plotInitialized = false;
		let isPlotPaused = false;
		const MAX_PLOT_POINTS = 10000; // Maximum number of data points per variable
		let currentActiveTab = 'monitor';
		let selectedNumbers = new Map(); // Track which number indices are selected and their axis ('y' or 'y2')
		let extractedNumbers = []; // Current extracted numbers from pattern input
		let plotSessions = []; // Array of saved plot sessions
		const sessionSelect = document.getElementById('sessionSelect');
		let isLoadingSession = false; // Flag to prevent auto-save during session loading

		function normalizeTimePatternInputValue(pattern) {
			// Our pinned patterns used to be incorrectly double-escaped (e.g. "\\\\d{4}" shown as "\\d{4}" in the UI).
			// Normalize common escapes so they behave as real regex tokens when fed to 'new RegExp(...)'.
			let p = (pattern || '').trim();
			// IMPORTANT: Avoid regex literals here. Some patterns (notably ones containing '[')
			// can accidentally become invalid RegExp literals after template-string escaping,
			// causing a *parse-time* webview crash ("Invalid regular expression: missing /").
			// Use literal string replacements instead.
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

			// Heuristic auto-fix: if this looks like the RTC datetime pattern but '[' / ']' aren't escaped,
			// escape them so the regex matches literal brackets instead of starting a character class.
			// Also support the common "missing backslash" form: d{4}-d{2}-... (caused by editing issues).
			//
			// IMPORTANT: Avoid regex literals with backslashes inside the webview HTML template string.
			// They are extremely easy to break via template-string escaping and can crash the webview at parse-time.
			const looksLikeRtc = p.includes('\\d{4}-\\d{2}-\\d{2}') && p.includes('\\d{2}:\\d{2}:\\d{2}');
			const looksLikeRtcLoose = p.includes('d{4}-d{2}-d{2}') && p.includes('d{2}:d{2}:d{2}');
			
			// Also check for patterns that start with '[' and contain date/time patterns (user might have typed it literally)
			// This catches patterns like "[(d{4}-d{2}-d{2} d{2}:d{2}:d{2}.d{3})]"
			const looksLikeRtcWithBrackets = (p.startsWith('[') || p.includes('[')) && 
				(p.includes('d{4}') || p.includes('\\d{4}')) && 
				(p.includes('d{2}:') || p.includes('\\d{2}:') || p.includes('d{2}-') || p.includes('\\d{2}-'));


			// Step 1: Convert d{N} -> \d{N} FIRST (before escaping brackets, so we can detect the pattern correctly)
			// Always convert d{N} to \d{N} if it exists and isn't already escaped
			// Check more carefully: look for actual d{ pattern, not just any \d
			// Avoid regex literals - check manually if d{ exists without preceding backslash
			let hasUnescapedD = false;
			for (let i = 0; i < p.length - 1; i++) {
				if (p[i] === 'd' && p[i + 1] === '{' && (i === 0 || p[i - 1] !== '\\\\')) {
					hasUnescapedD = true;
					break;
				}
			}
			// Check more carefully: look for actual \d{ pattern (backslash directly before d{)
			// Not just any backslash somewhere before d{ (like \.d{ which has \. not \d{)
			let hasEscapedD = false;
			for (let i = 0; i < p.length - 2; i++) {
				if (p[i] === '\\\\' && p[i + 1] === 'd' && p[i + 2] === '{') {
					hasEscapedD = true;
					break;
				}
			}
			
			if (hasUnescapedD && !hasEscapedD) {
				// Convert d{N} -> \d{N} when it's not already escaped.
				// (Implemented without regex literals to avoid template-string escaping issues.)
				let out = '';
				for (let i = 0; i < p.length; i++) {
					const ch = p[i];
					// Detect "d{<digits>}" with no preceding backslash.
					// NOTE: This code lives inside the webview HTML template string, so backslashes must be doubled.
					// We want to compare against a single backslash character at runtime, which in JS source is '\\'.
					// Check if previous char is NOT a backslash (or we're at start)
					// In template literal: '\\\\' in source = '\' at runtime (one backslash)
					// p[i-1] is a single char, so compare to '\\\\' which becomes '\' at runtime
					const prevIsBackslash = i > 0 && p[i - 1] === '\\\\';
					if (ch === 'd' && p[i + 1] === '{' && !prevIsBackslash) {
						let j = i + 2;
						let digits = '';
						while (j < p.length && p[j] >= '0' && p[j] <= '9') {
							digits += p[j];
							j++;
						}
						if (digits.length > 0 && p[j] === '}') {
							// We want to insert \d{N} into the pattern string at runtime; in JS source this is '\\d{N}'.
							out += '\\\\d{' + digits + '}';
							i = j; // skip to closing brace
							continue;
						}
					}
					out += ch;
				}
				p = out;
				// Re-check after conversion
				const looksLikeRtcAfter = p.includes('\\d{4}-\\d{2}-\\d{2}') && p.includes('\\d{2}:\\d{2}:\\d{2}');
				if (looksLikeRtcAfter) {
					// Pattern is now properly escaped, treat as RTC
				}
			}

			// Step 2: Escape brackets and dots for RTC patterns
			// Be aggressive: if pattern starts with '[' and looks date-like, always escape brackets/dots
			const needsBracketEscaping = (looksLikeRtc || looksLikeRtcLoose || looksLikeRtcWithBrackets) || 
				(p.startsWith('[') && (p.includes('d{4}') || p.includes('\\d{4}') || p.includes('-') && p.includes(':')));
			
			if (needsBracketEscaping) {
				// Escape all unescaped '[' and ']' characters
				// NOTE: Inside template literal, we need to check for actual backslash character.
				// At runtime, a single backslash in source is '\\', so we compare to '\\\\' (which becomes '\\' at runtime = single backslash).
				let result = '';
				for (let i = 0; i < p.length; i++) {
					// Check if previous character is a backslash (at runtime, '\\' in source becomes '\' at runtime)
					// In source: '\\\\' is two backslashes, which becomes one backslash at runtime
					// So we compare p[i-1] (a single char) to '\\\\' (which is '\\' in source = one backslash at runtime)
					const prevIsBackslash = i > 0 && p[i - 1] === '\\\\';
					if (p[i] === '[' && !prevIsBackslash) {
						result += '\\\\[';
					} else if (p[i] === ']' && !prevIsBackslash) {
						result += '\\\\]';
					} else {
						result += p[i];
					}
				}
				p = result;
				
				// Also escape unescaped '.' characters (for the milliseconds part)
				result = '';
				for (let i = 0; i < p.length; i++) {
					const prevIsBackslash = i > 0 && p[i - 1] === '\\\\';
					if (p[i] === '.' && !prevIsBackslash) {
						result += '\\\\.';
					} else {
						result += p[i];
					}
				}
				p = result;
			}

			return p;
		}

		// Detect and parse the common ESP-IDF RTC datetime token:
		//   "[YYYY-MM-DD HH:MM:SS.mmm]"
		// Implemented without regex to avoid template-string escaping pitfalls.
		function tryParseBracketedRtcDatetime(text) {
			if (!text) return null;
			const open = text.indexOf('[');
			if (open < 0) return null;
			const close = text.indexOf(']', open + 1);
			if (close < 0) return null;

			const inner = text.substring(open + 1, close).trim();
			// Basic shape check to avoid treating arbitrary bracketed text as a datetime
			if (!inner.includes('-') || !inner.includes(':') || !inner.includes('.')) return null;

			const iso = inner.replace(' ', 'T');
			const ms = Date.parse(iso);
			if (Number.isNaN(ms)) return null;

			return {
				iso,          // "YYYY-MM-DDTHH:MM:SS.mmm"
				inner,        // "YYYY-MM-DD HH:MM:SS.mmm"
				matchStart: open,
				matchEnd: close + 1
			};
		}

		// Find where the time token ends so we can safely ignore it for variable extraction / matching.
		// Returns the index immediately after the matched time token, or 0 if not found.
		function getTimeTokenEndIndexForLine(plainText) {
			if (!plainText || !timePatternInput || !timePatternInput.value) {
				return 0;
			}

			try {
				const timePattern = normalizeTimePatternInputValue(timePatternInput.value);
				const axisMode = computeTimeAxisModeFromPattern(timePattern);

				// RTC: deterministically use the bracketed datetime token.
				if (axisMode === 'rtc') {
					const seg = tryParseBracketedRtcDatetime(plainText);
					return seg ? seg.matchEnd : 0;
				}

				// Uptime: use user regex only if it has a capture group (to avoid partial matches).
				const rx = tryCreateTimeRegex();
				if (!rx) return 0;
				const m = rx.exec(plainText);
				if (!m) return 0;
				if (m[1] == null && m[2] == null) return 0;
				return m.index + m[0].length;
			} catch {
				return 0;
			}
		}

		function tryCreateTimeRegex() {
			try {
				const rawValue = timePatternInput ? timePatternInput.value : '';
				const pattern = normalizeTimePatternInputValue(rawValue);
				if (!pattern) return null;
				return new RegExp(pattern);
			} catch (e) {
				// Invalid regex while user is editing; treat as "no time pattern"
				console.error('FancyMon: tryCreateTimeRegex - error:', e, 'pattern was:', timePatternInput ? timePatternInput.value : '');
				return null;
			}
		}

		function setInputValuePreserveCaret(inputEl, newValue) {
			if (!inputEl) return;
			const oldValue = inputEl.value ?? '';
			if (oldValue === newValue) return;

			// Preserve caret/selection so normalization doesn't jump the cursor to the end.
			const start = inputEl.selectionStart ?? oldValue.length;
			const end = inputEl.selectionEnd ?? oldValue.length;

			inputEl.value = newValue;

			// Best-effort: keep the selection in the same place (clamped to new length).
			const newLen = newValue.length;
			const newStart = Math.min(start, newLen);
			const newEnd = Math.min(end, newLen);
			try {
				inputEl.setSelectionRange(newStart, newEnd);
			} catch {
				// Ignore if not supported
			}
		}

		function isPinnedTimePattern(pattern) {
			const p = normalizeTimePatternInputValue(pattern);
			return PINNED_TIME_PATTERNS.some(x => x.pattern === p);
		}

		function computeTimeAxisModeFromPattern(pattern) {
			const p = normalizeTimePatternInputValue(pattern);
			// First check if it matches the pinned RTC pattern
			const normalizedRtcPattern = normalizeTimePatternInputValue(RTC_DATETIME_TIME_PATTERN);
			if (p === normalizedRtcPattern) {
				return 'rtc';
			}
			
			// Heuristic: date-like patterns typically contain YYYY-MM-DD and HH:MM:SS portions
			// Avoid regex literals here as well; string checks are sufficient.
			const hasDate = p.includes('\\d{4}-\\d{2}-\\d{2}') || p.includes('d{4}-d{2}-d{2}');
			const hasTime = p.includes('\\d{2}:\\d{2}:\\d{2}') || p.includes('d{2}:d{2}:d{2}');
			return (hasDate && hasTime) ? 'rtc' : 'uptime';
		}

		function updateTimePatternHintAndAxis() {
			if (!timePatternInput) return;
			const pattern = normalizeTimePatternInputValue(timePatternInput.value || '');
			// Keep the field normalized so users don't end up with confusing double escapes.
			if (timePatternInput.value !== pattern) {
				setInputValuePreserveCaret(timePatternInput, pattern);
			}
			const mode = computeTimeAxisModeFromPattern(pattern);
			const hoverTemplateRtc = '<b>%{fullData.name}</b><br>Time: %{x|%Y-%m-%d %H:%M:%S.%L}<br>Value: %{y}<extra></extra>';
			const hoverTemplateUptime = '<b>%{fullData.name}</b><br>Time: %{x}<br>Value: %{y}<extra></extra>';

			// Update hint text
			if (timePatternHint) {
				const pinned = PINNED_TIME_PATTERNS.find(x => x.pattern === pattern);
				timePatternHint.textContent = pinned?.hint || (mode === 'rtc' ? 'Extracts RTC datetime from brackets' : 'Extracts time from capture group 1');
			}

			// If mode changes, clear plot data to avoid mixing numeric uptime with date-time values
			if (mode !== currentTimeAxisMode) {
				currentTimeAxisMode = mode;
				if (plotVariables.length > 0) {
					plotVariables.forEach(v => v.data = []);
					updateVariablesList();
					if (plotInitialized && plotDiv) {
						updateChart();
					}
				}
			}

			// Update chart axis type/title if plot already initialized
			if (plotInitialized && plotDiv) {
				const xTitle = mode === 'rtc' ? 'RTC DateTime' : 'CPU Uptime (ms)';
				const xType = mode === 'rtc' ? 'date' : 'linear';
				Plotly.relayout(plotDiv, {
					'xaxis.title.text': xTitle,
					'xaxis.type': xType,
					'xaxis.tickformat': mode === 'rtc' ? '%H:%M:%S.%L' : null,
					'xaxis.hoverformat': mode === 'rtc' ? '%Y-%m-%d %H:%M:%S.%L' : null
				});

				// Keep hover formatting consistent with axis mode
				Plotly.restyle(plotDiv, {
					hovertemplate: mode === 'rtc' ? hoverTemplateRtc : hoverTemplateUptime
				});
			}
		}

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
					if (!plotInitialized && plotDiv && typeof Plotly !== 'undefined') {
						setTimeout(() => {
							initializeChart();
						}, 100);
					} else if (plotInitialized) {
						// Resize chart and ensure axis title is correct when switching to plot tab
						setTimeout(() => {
							Plotly.Plots.resize(plotDiv);
							// Ensure axis title matches current mode by calling updateTimePatternHintAndAxis
							updateTimePatternHintAndAxis();
						}, 100);
					}
				}
			});
		});

		// Initialize Plotly.js
		function initializeChart() {
			if (!plotDiv || typeof Plotly === 'undefined') {
				console.error('Plotly.js not loaded or plot div not found');
				return;
			}

			const axisMode = computeTimeAxisModeFromPattern(timePatternInput ? timePatternInput.value : DEFAULT_UPTIME_TIME_PATTERN);
			currentTimeAxisMode = axisMode;
			const xAxisTitle = axisMode === 'rtc' ? 'RTC DateTime' : 'CPU Uptime (ms)';
			const xAxisType = axisMode === 'rtc' ? 'date' : 'linear';
			const xTickFormat = axisMode === 'rtc' ? '%H:%M:%S.%L' : undefined;
			const xHoverFormat = axisMode === 'rtc' ? '%Y-%m-%d %H:%M:%S.%L' : undefined;
			const hoverTemplate = axisMode === 'rtc'
				? '<b>%{fullData.name}</b><br>Time: %{x|%Y-%m-%d %H:%M:%S.%L}<br>Value: %{y}<extra></extra>'
				: '<b>%{fullData.name}</b><br>Time: %{x}<br>Value: %{y}<extra></extra>';

			// Prepare data traces from existing variables
			const traces = plotVariables.map(variable => ({
				x: variable.data.map(d => d.time),
				y: variable.data.map(d => d.value),
				name: variable.name,
				yaxis: variable.axis === 'y2' ? 'y2' : 'y',
				legendgroup: variable.axis === 'y2' ? 'y2' : 'y1',
				// Hide all traces from Plotly's native legend (using custom legends)
				showlegend: false,
				type: 'scatter',
				mode: 'lines',
				line: {
					color: variable.color,
					width: 2
				},
				hovertemplate: hoverTemplate
			}));

			const layout = {
				title: {
					text: 'Real-time Data Plot',
					font: {
						color: 'var(--vscode-foreground)'
					}
				},
				xaxis: {
					title: {
						text: xAxisTitle,
						font: {
							color: 'var(--vscode-foreground)'
						}
					},
					type: xAxisType,
					tickformat: xTickFormat,
					hoverformat: xHoverFormat,
					gridcolor: 'var(--vscode-panel-border)',
					zerolinecolor: 'var(--vscode-panel-border)',
					color: 'var(--vscode-foreground)'
				},
				yaxis: {
					title: {
						text: 'Y1',
						font: {
							color: 'var(--vscode-foreground)'
						}
					},
					gridcolor: 'var(--vscode-panel-border)',
					zerolinecolor: 'var(--vscode-panel-border)',
					color: 'var(--vscode-foreground)'
				},
				yaxis2: {
					title: {
						text: 'Y2',
						font: {
							color: 'var(--vscode-foreground)'
						},
						standoff: 15
					},
					gridcolor: 'transparent',
					zerolinecolor: 'transparent',
					color: 'var(--vscode-foreground)',
					overlaying: 'y',
					side: 'right'
				},
				plot_bgcolor: 'var(--vscode-textCodeBlock-background)',
				paper_bgcolor: 'var(--vscode-textCodeBlock-background)',
				font: {
					color: 'var(--vscode-foreground)'
				},
				// Hide Plotly's native legend (using custom HTML legends)
				showlegend: false,
				margin: { l: 60, r: 60, t: 80, b: 50 },
				hovermode: 'x unified'
			};

			const config = {
				responsive: true,
				displayModeBar: true,
				displaylogo: false,
				modeBarButtonsToRemove: ['lasso2d', 'select2d'],
				toImageButtonOptions: {
					format: 'png',
					filename: 'fancymon-plot',
					height: 600,
					width: 1200,
					scale: 1
				}
			};

			Plotly.newPlot(plotDiv, traces, layout, config);
			plotInitialized = true;

			// Handle resize
			const resizeObserver = new ResizeObserver(() => {
				if (plotInitialized) {
					Plotly.Plots.resize(plotDiv);
				}
			});
			resizeObserver.observe(plotDiv);
		}

		// Update Plotly chart with current data
		function updateChart() {
			if (!plotInitialized || !plotDiv) return;

			// Prepare data arrays for all traces
			const xArrays = plotVariables.map(variable => variable.data.map(d => d.time));
			const yArrays = plotVariables.map(variable => variable.data.map(d => d.value));
			const traceIndices = Array.from({ length: plotVariables.length }, (_, i) => i);

			// Use restyle for efficient updates (only updates data, not layout)
			Plotly.restyle(plotDiv, {
				x: xArrays,
				y: yArrays
			}, traceIndices);
		}

		// Extract numbers from text
		function extractNumbers(text) {
			// Remove ANSI codes first
			const plainText = stripAnsiCodes(text);
			// Match numbers (integers and decimals) - use String.fromCharCode to build regex pattern
			const bs = String.fromCharCode(92);
			const numberRegex = new RegExp('(-?' + bs + 'd+(?:' + bs + '.' + bs + 'd+)?)', 'g');
			const matches = [];
			let match;
			let execCount = 0;
			while ((match = numberRegex.exec(plainText)) !== null) {
				execCount++;
				const numberText = match[1];
				const numberValue = parseFloat(numberText);
				// Validate it's actually a valid number (not NaN and finite)
				if (!isNaN(numberValue) && isFinite(numberValue) && numberText.length > 0) {
					// Additional validation: ensure the matched text only contains digits, minus, and decimal point
					const validNumberRegex = new RegExp('^-?' + bs + 'd+(' + bs + '.' + bs + 'd+)?$');
					const isValid = validNumberRegex.test(numberText);
					if (isValid) {
						matches.push({
							index: matches.length + 1,
							value: numberValue,
							text: numberText,
							position: match.index
						});
					}
				}
				// Safety check to prevent infinite loops
				if (execCount > 1000) {
					console.error('FancyMon: extractNumbers - too many iterations, breaking');
					break;
				}
			}
			return matches;
		}

		// Generate regex pattern that captures ALL numbers in the text
		// This allows one regex to serve multiple variables
		function generateCommonPattern(text) {
			const sourceText = stripAnsiCodes(text);
			const numbers = extractNumbers(sourceText);
			if (numbers.length === 0) return null;
			
			// Escape special regex characters, but be tolerant of minor formatting differences between lines known to occur
			// in logs (spaces after commas, '=' vs ':', varying whitespace).
			function escapeRegexChars(str) {
				let result = '';
				let lastWasWhitespaceToken = false;
				for (let i = 0; i < str.length; i++) {
					const char = str[i];

					// Identifier run: keep it mostly literal, but allow small suffix variations (e.g. soc_ob vs soc_obs)
					if ((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || char === '_') {
						let j = i + 1;
						while (j < str.length) {
							const c = str[j];
							const isLetter = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
							const isDigit = (c >= '0' && c <= '9');
							if (isLetter || isDigit || c === '_') {
								j++;
							} else {
								break;
							}
						}
						const token = str.substring(i, j);
						// Escape regex meta chars inside token (should be none, but safe)
						let escaped = '';
						for (let k = 0; k < token.length; k++) {
							const t = token[k];
							if (t === '\\\\' || t === '.' || t === '*' || t === '+' || t === '?' ||
								t === '^' || t === '$' || t === '{' || t === '}' ||
								t === '(' || t === ')' || t === '[' || t === ']' || t === '|') {
								escaped += '\\\\' + t;
							} else {
								escaped += t;
							}
						}
						result += escaped + '\\\\w*';
						i = j - 1;
						lastWasWhitespaceToken = false;
						continue;
					}

					// Collapse any whitespace runs to \s*
					if (char === ' ' || char === '\\t' || char === '\\r' || char === '\\n') {
						if (!lastWasWhitespaceToken) {
							result += '\\\\s*';
							lastWasWhitespaceToken = true;
						}
						continue;
					}
					lastWasWhitespaceToken = false;

					// Common separator differences in logs: "key=val" vs "key:val"
					if (char === '=' || char === ':') {
						result += '\\\\s*[=:]\\\\s*';
						continue;
					}

					// After commas, logs sometimes have 0/1+ spaces
					if (char === ',') {
						result += ',\\\\s*';
						continue;
					}

					// Default: escape regex meta chars, otherwise emit literal
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
			
			let pattern = '';
			let pos = 0;
			
			// Sort numbers by position
			const sortedNumbers = [...numbers].sort((a, b) => a.position - b.position);
			
			for (const num of sortedNumbers) {
				// Add text before this number
				if (num.position > pos) {
					const textBefore = sourceText.substring(pos, num.position);
					pattern += escapeRegexChars(textBefore);
				}
				
				// Add capture group for this number
				// Always capture every number
				pattern += '(-?\\\\d+\\\\.?\\\\d*)';

				// Many logs append units to numbers (e.g. "3.57V", "175mA", "236.0ms", "2.0mV", "0.00s", "17.1%").
				// If we treat those unit letters as literal text, the generated pattern becomes too strict and won't match
				// future lines when units appear/disappear or change. So:
				// - Allow an optional unit suffix after every number
				// - Also skip the unit suffix (and optional whitespace before it) in the source-text cursor,
				//   so we don't bake it into the literal text segments between numbers.
				pattern += '(?:\\\\s*[A-Za-z%]+)?';

				let nextPos = num.position + num.text.length;
				let j = nextPos;
				// Optional whitespace before unit
				while (j < sourceText.length && (sourceText[j] === ' ' || sourceText[j] === '\\t')) {
					j++;
				}
				const unitStart = j;
				while (j < sourceText.length) {
					const ch = sourceText[j];
					const isLetter = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
					if (isLetter || ch === '%') {
						j++;
					} else {
						break;
					}
				}
				if (j > unitStart) {
					nextPos = j;
				}

				pos = nextPos;
			}
			
			// Add remaining text after last number
			if (pos < sourceText.length) {
				const textAfter = sourceText.substring(pos);
				pattern += escapeRegexChars(textAfter);
			}
			
			return { pattern, sortedNumbers };
		}
		
		// Legacy function wrapper for compatibility if needed elsewhere
		function generatePatternForNumber(text, numberIndex) {
			const result = generateCommonPattern(text);
			if (!result) return null;
			return result.pattern;
		}

		// Suggest a variable name by looking immediately before the number.
		// We allow separators between name and value: ':', '=' or whitespace.
		// Examples:
		//   "TEMP: 12.3"  -> "TEMP"
		//   "foo=123"     -> "foo"
		//   "bar 99"      -> "bar"
		//   "baz99"       -> "baz"
		function suggestVariableNameFromContext(text, numberPosition) {
			if (typeof numberPosition !== 'number' || numberPosition < 0) {
				return null;
			}

			// text is already stripped in our context, but ensure consistency
			const plainText = text || '';
			let i = Math.min(numberPosition - 1, plainText.length - 1);
			if (i < 0) {
				return null;
			}

			// Skip whitespace directly before number
			// Use RegExp constructor to avoid template literal escaping issues with /\s/
			const wsRegex = new RegExp(String.fromCharCode(92) + 's');
			while (i >= 0 && wsRegex.test(plainText[i])) {
				i--;
			}

			// Optional ':' or '=' separator, then optional whitespace
			if (i >= 0 && (plainText[i] === ':' || plainText[i] === '=')) {
				i--;
				while (i >= 0 && wsRegex.test(plainText[i])) {
					i--;
				}
			}

			// Scan backwards for identifier characters
			// end should be the last character of the identifier (before separator)
			// i is currently at the last identifier character
			const end = i;
			let scanI = i;
			const identifierRegex = new RegExp('[A-Za-z0-9_]');
			while (scanI >= 0 && identifierRegex.test(plainText[scanI])) {
				scanI--;
			}

			const start = scanI + 1;
			// end is the last character position, so substring should be (start, end + 1)
			if (start <= end && end >= 0 && end < plainText.length) {
				const token = plainText.substring(start, end + 1);
				const startsWithLetter = new RegExp('^[A-Za-z_]');
				if (startsWithLetter.test(token)) {
					return token;
				}
			}

			return null;
		}

		// Extract variable name (prefer custom name; otherwise prefer suggested context name; fallback to number text)
		function extractVariableName(text, numberIndex) {
			const numbers = extractNumbers(text);
			if (numberIndex < 1 || numberIndex > numbers.length) {
				return 'variable' + numberIndex;
			}
			
			// Check if there is a custom name entered in the UI
			// We need to look up the input field for this number index
			// IMPORTANT: The UI uses the index from the FILTERED list (extractedNumbers),
			// but we are passed the original index.
			// However, in updateExtractionPreview, we map extractedNumbers to have 'index' property
			// which IS the original index? No, let's check updateExtractionPreview.
			
			// In updateExtractionPreview:
			// extractedNumbers = extractedNumbers.map((num, idx) => ({ ...num, index: idx + 1, originalIndex: num.index }));
			// So num.index (the displayed index) is 1, 2, 3... corresponding to the filtered list position.
			// And num.originalIndex is the index in the full list.
			
			// The input field has data-index set to num.index (the filtered list index).
			// But addVariableToPlot calls this with originalIndex.
			
			// So we need to find the filtered list index corresponding to this originalIndex.
			if (numberSelector && typeof extractedNumbers !== 'undefined') {
				// Find the item in extractedNumbers that matches this originalIndex
				const item = extractedNumbers.find(n => (n.originalIndex || n.index) === numberIndex);
				if (item) {
					// The UI index is item.index
					const selector = 'input[type="text"][data-index="' + item.index + '"]';
					const nameInput = numberSelector.querySelector(selector);
					if (nameInput && nameInput.value.trim().length > 0) {
						return nameInput.value.trim();
					}
				}
			}

			const targetNumber = numbers[numberIndex - 1];
			const suggested = suggestVariableNameFromContext(text, targetNumber.position);
			return suggested || targetNumber.text;
		}

		// Update extraction preview
		function updateExtractionPreview() {
			if (!patternInput || !extractionPreview) return;
			
			const text = patternInput.value;
			const plainText = stripAnsiCodes(text);
			
			// Extract time value and find its position if time pattern is set
			let timeValue = null;
			let timeMatchEnd = 0; // Position after time match
			if (timePatternInput && timePatternInput.value) {
				try {
					const timePattern = normalizeTimePatternInputValue(timePatternInput.value);
					if (timePatternInput.value !== timePattern) {
						setInputValuePreserveCaret(timePatternInput, timePattern);
					}
					const axisMode = computeTimeAxisModeFromPattern(timePattern);

					// If we're in RTC mode, deterministically strip the bracketed datetime token so it never shows up as a variable.
					// This is robust even if the user's regex is malformed (e.g. missing escapes).
					let rtcMatchEnd = 0;
					if (axisMode === 'rtc') {
						const seg = tryParseBracketedRtcDatetime(plainText);
						if (seg) {
							timeValue = seg.inner;
							rtcMatchEnd = seg.matchEnd;
							timeMatchEnd = rtcMatchEnd; // Set initial value from RTC parser
						}
					}

					// 1) Try the user-provided time regex, but ONLY accept it if it actually contains a capture group.
					// Accepting match[0] is dangerous: if the user accidentally types an unescaped '[',
					// the regex can degrade into a character class and "match" a single character inside the datetime,
					// which would make us treat most of the datetime as plot variables.
					// In RTC mode, only use the user's regex if it matches at least as much as the RTC parser found.
					const regex = tryCreateTimeRegex();
					if (regex) {
						const match = regex.exec(plainText);
						if (match) {
							const capturedValue = match[2] ?? match[1] ?? null;
							if (capturedValue !== null) {
								const userMatchEnd = match.index + match[0].length;
								// In RTC mode: only use user's regex if it matches at least as much as RTC parser
								// This prevents malformed regexes from overriding the correct RTC match
								if (axisMode === 'rtc' && rtcMatchEnd > 0) {
									if (userMatchEnd >= rtcMatchEnd) {
										timeValue = String(capturedValue);
										timeMatchEnd = userMatchEnd;
									}
									// Otherwise, keep the RTC parser's timeMatchEnd
								} else {
									// Uptime mode: use user's regex match
									timeValue = String(capturedValue);
									timeMatchEnd = userMatchEnd;
								}
							}
						}
					}

					// Note: In RTC mode, tryParseBracketedRtcDatetime already provides the “correct” filtering boundary.
					// In uptime mode: if the user's pattern is invalid / doesn't capture, we just won't filter.
				} catch (e) {
					console.error('FancyMon: Error matching time pattern:', e);
				}
			}
			
			// Extract numbers - pass plainText to ensure positions match
			// extractNumbers strips ANSI codes internally, but we need to pass the already-stripped text
			// to ensure positions are consistent. However, extractNumbers expects the original text.
			// So we'll extract numbers and then verify positions match plainText
			let allNumbers = extractNumbers(text);
			
			// Verify positions are correct by checking against plainText
			// If extractNumbers used a different plainText (due to different ANSI stripping),
			// positions might be off. But since both use the same stripAnsiCodes function, they should match.
			
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
					const rowDiv = document.createElement('div');
					rowDiv.className = 'number-selection-row';
					rowDiv.style.display = 'flex';
					rowDiv.style.alignItems = 'center';
					rowDiv.style.marginBottom = '5px';

					// Variable label
					const label = document.createElement('span');
					label.innerHTML = '<b>' + num.index + ':</b> ';
					label.style.marginRight = '5px';
					label.style.minWidth = '30px';
					rowDiv.appendChild(label);

					// Custom Name Input
					const nameInput = document.createElement('input');
					nameInput.type = 'text';
					// Prefer auto-suggested identifier name (TEMP/voltage/etc); include value in parentheses as a hint
					// num.position is in plainText (stripped), so use plainText for name extraction
					const suggestedName = suggestVariableNameFromContext(plainText, num.position);
					nameInput.placeholder = suggestedName ? (suggestedName + ' (' + num.text + ')') : num.text;
					nameInput.style.width = '120px';
					nameInput.style.marginRight = '5px';
					nameInput.style.fontSize = '11px';
					nameInput.dataset.index = num.index; // Store index to retrieve later
					
					// Auto-select Y1 when user types in name, if not already selected
					nameInput.addEventListener('input', () => {
						if (nameInput.value.trim().length > 0) {
							if (!y1Check.checked && !y2Check.checked) {
								y1Check.checked = true;
								updateSelection();
							}
						}
					});
					
					rowDiv.appendChild(nameInput);

					// Container for Y1 and Y2 to keep them close
					const checkboxesContainer = document.createElement('div');
					checkboxesContainer.style.display = 'inline-flex'; // Use inline-flex to minimize width
					checkboxesContainer.style.alignItems = 'center';
					checkboxesContainer.style.gap = '5px'; // Explicit gap between Y1 and Y2 groups
					checkboxesContainer.style.marginLeft = '5px'; // Small gap from the name input

					// Y1 Checkbox Group
					const y1Label = document.createElement('label');
					y1Label.style.display = 'flex';
					y1Label.style.alignItems = 'center';
					y1Label.style.cursor = 'pointer';
					y1Label.style.margin = '0';
					y1Label.style.padding = '0';
					y1Label.style.minWidth = '0'; // Override global label min-width
					y1Label.style.width = 'auto'; // Ensure width is auto
					
					const y1Check = document.createElement('input');
					y1Check.type = 'checkbox';
					y1Check.style.margin = '0 2px 0 0'; // Right margin only
					y1Check.style.padding = '0';
					y1Check.checked = false;
					
					y1Label.appendChild(y1Check);
					y1Label.appendChild(document.createTextNode('Y1'));
					checkboxesContainer.appendChild(y1Label);

					// Y2 Checkbox Group
					const y2Label = document.createElement('label');
					y2Label.style.display = 'flex';
					y2Label.style.alignItems = 'center';
					y2Label.style.cursor = 'pointer';
					y2Label.style.margin = '0 20px 0 0'; // Add spacing AFTER Y2 to separate from next variable
					y2Label.style.padding = '0';
					y2Label.style.minWidth = '0'; // Override global label min-width
					y2Label.style.width = 'auto'; // Ensure width is auto

					const y2Check = document.createElement('input');
					y2Check.type = 'checkbox';
					y2Check.style.margin = '0 2px 0 0'; // Right margin only
					y2Check.style.padding = '0';
					y2Check.checked = false;

					y2Label.appendChild(y2Check);
					y2Label.appendChild(document.createTextNode('Y2'));
					checkboxesContainer.appendChild(y2Label);
					
					rowDiv.appendChild(checkboxesContainer);

					// Logic to ensure mutual exclusivity and update selection
					const updateSelection = () => {
						if (y1Check.checked) {
							y2Check.checked = false;
							selectedNumbers.set(num.index, 'y');
						} else if (y2Check.checked) {
							y1Check.checked = false;
							selectedNumbers.set(num.index, 'y2');
						} else {
							selectedNumbers.delete(num.index);
						}
						addVariableBtn.disabled = selectedNumbers.size === 0;
					};

					y1Check.addEventListener('change', () => {
						if (y1Check.checked) y2Check.checked = false;
						updateSelection();
					});
					
					y2Check.addEventListener('change', () => {
						if (y2Check.checked) y1Check.checked = false;
						updateSelection();
					});

					numberSelector.appendChild(rowDiv);
				});
			}
		}

		// Add variable to plot
		function addVariableToPlot() {
			if (!patternInput || selectedNumbers.size === 0) return;

			const rawText = patternInput.value;
			if (!rawText || rawText.trim().length === 0) return;

			const plainText = stripAnsiCodes(rawText);

			// IMPORTANT: The generated regex must match future lines.
			// So we generate the pattern from the portion AFTER the time token, and we will also
			// apply the regex to that same substring at runtime.
			const timeEnd = getTimeTokenEndIndexForLine(plainText);
			const matchFromTimeToken = timeEnd > 0;
			const patternSourceText = matchFromTimeToken ? plainText.substring(timeEnd) : plainText;

			// Generate a common pattern that captures ALL numbers
			const patternResult = generateCommonPattern(patternSourceText);
			if (!patternResult) return;
			
			const { pattern, sortedNumbers } = patternResult;
			const regex = new RegExp(pattern);

			selectedNumbers.forEach((axis, numIndex) => {
				// numIndex is the index in the *filtered* list shown in the UI (1..N).
				// Since we generate the pattern from the portion after the time token, the extracted numbers
				// in that substring are also indexed 1..N in the same order. So we map directly by n.index.
				const targetNumInSorted = sortedNumbers.find(n => n.index === numIndex);
				if (!targetNumInSorted) return;
				
				const captureIndex = sortedNumbers.indexOf(targetNumInSorted) + 1;

				// Resolve display name:
				// - prefer user-entered custom name (data-index == numIndex)
				// - else use suggested identifier from original full line
				// - else fallback to number text itself
				let name = null;
				if (numberSelector) {
					const selector = 'input[type="text"][data-index="' + numIndex + '"]';
					const nameInput = numberSelector.querySelector(selector);
					if (nameInput && nameInput.value.trim().length > 0) {
						name = nameInput.value.trim();
					}
				}
				if (!name) {
					const numObj = extractedNumbers.find(n => n.index === numIndex);
					if (numObj) {
						// numObj.position is in plainText (full stripped text).
						// For name extraction, use the FULL plainText (not patternSourceText).
						const suggested = suggestVariableNameFromContext(plainText, numObj.position);
						name = suggested || numObj.text;
					} else {
						name = 'variable' + numIndex;
					}
				}
				const color = getNextColor(plotVariables.length);

				// If we can identify a key name (e.g. "V_term", "soc_obs"), prefer key-based matching.
				// This is dramatically more robust than a fully-literal line pattern, because log formatting
				// often changes slightly between lines (":" vs "=", added units like "ms/mV/%/s", spacing, etc).
				let keyName = null;
				const numObjForKey = extractedNumbers.find(n => n.index === numIndex);
				if (numObjForKey) {
					// Use patternSourceText (after time token) for key detection, since that's what we'll match against at runtime.
					// IMPORTANT: extractedNumbers positions are in plainText (full text), but we need position in patternSourceText.
					// If matchFromTimeToken, we need to find the number's position in patternSourceText.
					let keyPosition;
					if (matchFromTimeToken) {
						// The position in numObjForKey is in plainText (full stripped text).
						// patternSourceText is plainText.substring(timeEnd), so we just subtract timeEnd.
						keyPosition = numObjForKey.position - timeEnd;
					} else {
						keyPosition = numObjForKey.position;
					}
					if (keyPosition >= 0 && keyPosition < patternSourceText.length) {
						keyName = suggestVariableNameFromContext(patternSourceText, keyPosition);
					}
				}

				const keyRegex = keyName
					// keyName comes from suggestVariableNameFromContext and is limited to [A-Za-z_][A-Za-z0-9_]*,
					// so it is already safe to embed directly into a RegExp pattern without extra escaping.
					// Allow optional units (V, mA, %, ms, mV, s, etc.) after the number.
					? (() => {
						// Build pattern string - use String.fromCharCode to avoid template literal backslash issues
						// We need \s (whitespace) and \d (digit) in the regex, so we build the pattern carefully
						const bs = String.fromCharCode(92); // backslash
						// Pattern: (?:^|[^A-Za-z0-9_])KEYNAME\s*[=:]\s*(-?\d+\.?\d*)(?:\s*[A-Za-z%]+)?
						const pattern = '(?:^|[^A-Za-z0-9_])' + keyName + bs + 's*[=:]' + bs + 's*(-?' + bs + 'd+' + bs + '.' + '?' + bs + 'd*)(?:' + bs + 's*[A-Za-z%]+)?';
						try {
							return new RegExp(pattern);
						} catch (e) {
							console.error('FancyMon: Failed to create keyRegex:', e, 'pattern:', pattern);
							return null;
						}
					})()
					: null;
				
				
				const variable = {
					id: Date.now() + '-' + numIndex,
					name: name,
					pattern: pattern,
					regex: regex, // Re-use the same regex object? No, better new one or share string
					// Actually, for caching in processLineForPlot, we key by pattern string.
					// So it doesn't matter if regex object is different, as long as pattern string is same.
					captureIndex: captureIndex,
					keyName: keyName,
					keyRegex: keyRegex,
					data: [],
					color: color,
					axis: axis,
					matchFromTimeToken: matchFromTimeToken
				};

				plotVariables.push(variable);
				
				// Initialize chart if needed and add trace
				if (!plotInitialized && plotDiv && typeof Plotly !== 'undefined') {
					initializeChart();
				} else if (plotInitialized) {
					// Add new trace to existing plot
					const newTrace = {
						x: [],
						y: [],
						name: variable.name,
						yaxis: axis === 'y2' ? 'y2' : 'y',
						legendgroup: axis === 'y2' ? 'y2' : 'y1',
						// Hide all traces from Plotly's native legend (using custom legends)
						showlegend: false,
						type: 'scatter',
						mode: 'lines',
						line: {
							color: color,
							width: 2
						},
						hovertemplate: currentTimeAxisMode === 'rtc'
							? '<b>%{fullData.name}</b><br>Time: %{x|%Y-%m-%d %H:%M:%S.%L}<br>Value: %{y}<extra></extra>'
							: '<b>%{fullData.name}</b><br>Time: %{x}<br>Value: %{y}<extra></extra>'
					};
					Plotly.addTraces(plotDiv, newTrace);
				}
			});

			updateVariablesList();
			// Clear selection
			selectedNumbers.clear();
			patternInput.value = '';
			updateExtractionPreview();
			
			// Auto-save session when variables change
			saveCurrentSession();
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
				nameSpan.textContent = variable.name + (variable.axis === 'y2' ? ' (Y2)' : ' (Y1)');
				nameSpan.style.color = variable.color;
				
				// Don't show pattern - too long
				// const patternSpan = document.createElement('span');
				// patternSpan.className = 'variable-pattern';
				// patternSpan.textContent = variable.pattern;
				
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
				// item.appendChild(patternSpan);
				item.appendChild(countSpan);
				item.appendChild(removeBtn);
				variablesList.appendChild(item);
			});
			
			// Update custom legends
			updateY1Legend();
			updateY2Legend();
		}
		
		// Update custom Y1 legend (left side)
		function updateY1Legend() {
			const y1Legend = document.getElementById('y1Legend');
			if (!y1Legend) return;
			
			const y1Variables = plotVariables.filter(v => v.axis !== 'y2');
			
			if (y1Variables.length === 0) {
				y1Legend.style.display = 'none';
				return;
			}
			
			y1Legend.style.display = 'block';
			y1Legend.innerHTML = '';
			
			y1Variables.forEach((variable) => {
				const item = document.createElement('div');
				item.className = 'custom-legend-item';
				item.dataset.variableId = variable.id;
				
				const colorBox = document.createElement('span');
				colorBox.className = 'custom-legend-color';
				colorBox.style.backgroundColor = variable.color;
				
				const nameSpan = document.createElement('span');
				nameSpan.textContent = variable.name;
				
				item.appendChild(colorBox);
				item.appendChild(nameSpan);
				
				// Click to toggle visibility
				item.addEventListener('click', () => {
					if (plotInitialized && plotDiv) {
						const traceIndex = plotVariables.findIndex(v => v.id === variable.id);
						if (traceIndex >= 0) {
							const isHidden = item.classList.contains('hidden');
							Plotly.restyle(plotDiv, { visible: isHidden ? true : 'legendonly' }, [traceIndex]);
							item.classList.toggle('hidden');
						}
					}
				});
				
				y1Legend.appendChild(item);
			});
		}
		
		// Update custom Y2 legend (right side)
		function updateY2Legend() {
			const y2Legend = document.getElementById('y2Legend');
			if (!y2Legend) return;
			
			const y2Variables = plotVariables.filter(v => v.axis === 'y2');
			
			if (y2Variables.length === 0) {
				y2Legend.style.display = 'none';
				return;
			}
			
			y2Legend.style.display = 'block';
			y2Legend.innerHTML = '';
			
			y2Variables.forEach((variable) => {
				const item = document.createElement('div');
				item.className = 'custom-legend-item';
				item.dataset.variableId = variable.id;
				
				const colorBox = document.createElement('span');
				colorBox.className = 'custom-legend-color';
				colorBox.style.backgroundColor = variable.color;
				
				const nameSpan = document.createElement('span');
				nameSpan.textContent = variable.name;
				
				item.appendChild(colorBox);
				item.appendChild(nameSpan);
				
				// Click to toggle visibility
				item.addEventListener('click', () => {
					if (plotInitialized && plotDiv) {
						const traceIndex = plotVariables.findIndex(v => v.id === variable.id);
						if (traceIndex >= 0) {
							const isHidden = item.classList.contains('hidden');
							Plotly.restyle(plotDiv, { visible: isHidden ? true : 'legendonly' }, [traceIndex]);
							item.classList.toggle('hidden');
						}
					}
				});
				
				y2Legend.appendChild(item);
			});
		}

		// Remove variable
		function removeVariable(variableId) {
			const index = plotVariables.findIndex(v => v.id === variableId);
			if (index === -1) return;

			plotVariables.splice(index, 1);
			
			if (plotInitialized && plotDiv) {
				Plotly.deleteTraces(plotDiv, index);
			}

			updateVariablesList();
			updateY1Legend();
			updateY2Legend();
			
			// Auto-save session when variables change
			saveCurrentSession();
		}

		// Generate a unique key for a session based on variable list
		function generateSessionKey(variables) {
			if (!variables || variables.length === 0) return '';
			const names = variables.map(v => v.name || '').filter(n => n).sort();
			return names.join(', ');
		}

		// Save current session
		function saveCurrentSession() {
			if (isLoadingSession) return; // Don't save while loading
			if (!timePatternInput || !patternInput) return;
			
			const variableList = generateSessionKey(plotVariables);
			if (!variableList) return; // Don't save empty sessions
			
			const session = {
				timePattern: timePatternInput.value || '',
				extractionPattern: patternInput.value || '',
				variableList: variableList,
				variables: plotVariables.map(v => ({
					name: v.name,
					pattern: v.pattern,
					captureIndex: v.captureIndex,
					keyName: v.keyName,
					axis: v.axis,
					color: v.color
				}))
			};
			
			vscode.postMessage({
				command: 'savePlotSession',
				session: session
			});
			
			// Request updated sessions list to refresh dropdown
			vscode.postMessage({
				command: 'loadPlotSessions'
			});
		}

		// Load a session
		function loadSession(session) {
			console.log('FancyMon: Loading session:', session);
			if (!session || !timePatternInput || !patternInput) {
				console.error('FancyMon: Cannot load session - missing session or inputs');
				return;
			}
			
			isLoadingSession = true;
			
			// Clear current variables (without triggering save)
			while (plotVariables.length > 0) {
				const index = plotVariables.findIndex(v => v.id === plotVariables[0].id);
				if (index === -1) break;
				
				plotVariables.splice(index, 1);
				
				if (plotInitialized && plotDiv) {
					Plotly.deleteTraces(plotDiv, index);
				}
			}
			
			updateVariablesList();
			updateY1Legend();
			updateY2Legend();
			
			// Restore patterns first
			if (session.timePattern) {
				timePatternInput.value = session.timePattern;
				updateTimePatternHintAndAxis();
			}
			
			const extractionPattern = session.extractionPattern || '';
			if (extractionPattern) {
				patternInput.value = extractionPattern;
				updateExtractionPreview();
			}
			
			// Restore variables - use saved pattern and captureIndex directly
			if (session.variables && session.variables.length > 0) {
				// Use the saved pattern from the first variable (they all share the same pattern)
				const savedPattern = session.variables[0].pattern;
				if (savedPattern) {
					const regex = new RegExp(savedPattern);
					
					// Determine if we should match from time token (check if we have extraction pattern)
					const plainText = stripAnsiCodes(extractionPattern);
					const timeEnd = plainText ? getTimeTokenEndIndexForLine(plainText) : 0;
					
					session.variables.forEach((savedVar, idx) => {
						// Reconstruct keyRegex if we have keyName
						let keyRegex = null;
						if (savedVar.keyName) {
							const bs = String.fromCharCode(92);
							const keyName = savedVar.keyName;
							const keyPattern = '(?:^|[^A-Za-z0-9_])' + keyName + bs + 's*[=:]' + bs + 's*(-?' + bs + 'd+' + bs + '.' + '?' + bs + 'd*)(?:' + bs + 's*[A-Za-z%]+)?';
							try {
								keyRegex = new RegExp(keyPattern);
							} catch (e) {
								console.error('FancyMon: Failed to recreate keyRegex:', e);
							}
						}
						
						const variable = {
							id: Date.now() + '-' + idx,
							name: savedVar.name,
							pattern: savedPattern,
							regex: regex,
							captureIndex: savedVar.captureIndex || (idx + 1), // Use saved captureIndex
							keyName: savedVar.keyName,
							keyRegex: keyRegex,
							data: [],
							color: savedVar.color || getNextColor(),
							axis: savedVar.axis || 'y',
							matchFromTimeToken: timeEnd > 0
						};
						
						plotVariables.push(variable);
						
						// Add trace to plot
						if (!plotInitialized && plotDiv && typeof Plotly !== 'undefined') {
							initializeChart();
						} else if (plotInitialized) {
							const newTrace = {
								x: [],
								y: [],
								name: variable.name,
								yaxis: variable.axis === 'y2' ? 'y2' : 'y',
								legendgroup: variable.axis === 'y2' ? 'y2' : 'y1',
								showlegend: false,
								type: 'scatter',
								mode: 'lines',
								line: {
									color: variable.color,
									width: 2
								},
								hovertemplate: currentTimeAxisMode === 'rtc'
									? '<b>%{fullData.name}</b><br>Time: %{x|%Y-%m-%d %H:%M:%S.%L}<br>Value: %{y}<extra></extra>'
									: '<b>%{fullData.name}</b><br>Time: %{x}<br>Value: %{y}<extra></extra>'
							};
							Plotly.addTraces(plotDiv, newTrace);
						}
					});
					
					console.log('FancyMon: Restored', plotVariables.length, 'variables');
					updateVariablesList();
					updateY1Legend();
					updateY2Legend();
				} else {
					console.error('FancyMon: No saved pattern found in session variables');
				}
			}
			
			isLoadingSession = false;
		}

		// Update session dropdown
		function updateSessionDropdown() {
			if (!sessionSelect) {
				console.error('FancyMon: sessionSelect element not found in updateSessionDropdown');
				return;
			}
			
			console.log('FancyMon: Updating session dropdown with', plotSessions.length, 'sessions');
			// Keep the "New session" option
			const currentValue = sessionSelect.value;
			sessionSelect.innerHTML = '<option value="">New session</option>';
			
			plotSessions.forEach((session, index) => {
				const option = document.createElement('option');
				option.value = index.toString();
				option.textContent = session.variableList || 'Empty session';
				sessionSelect.appendChild(option);
			});
			
			// Restore selection if it was a valid session
			if (currentValue && currentValue !== '') {
				const sessionIndex = parseInt(currentValue, 10);
				if (!isNaN(sessionIndex) && sessionIndex >= 0 && sessionIndex < plotSessions.length) {
					sessionSelect.value = currentValue;
				}
			}
		}

		// Extract time value from line
		function extractTimeValue(line) {
			if (!timePatternInput || !timePatternInput.value) {
				return null;
			}

			try {
				const rawPattern = timePatternInput.value;
				const timePattern = normalizeTimePatternInputValue(rawPattern);
				if (!timePattern) {
					return null;
				}

				const regex = tryCreateTimeRegex();
				if (!regex) {
					return null;
				}
				const match = regex.exec(line);
				if (match && match[1]) {
					const raw = String(match[1]);
					// RTC datetime like "2025-12-13 04:56:14.632"
					// IMPORTANT: Do not use a regex literal containing "\d" inside this HTML template string;
					// it gets de-escaped at build time and breaks the detection (leading to year-only plots via parseFloat()).
					const trimmed = raw.trim();
					const isoCandidate = trimmed.replace(' ', 'T');
					const parsedMs = Date.parse(isoCandidate);
					if (!Number.isNaN(parsedMs) && trimmed.includes('-') && trimmed.includes(':')) {
						return isoCandidate;
					}

					// Numeric uptime
					const num = parseFloat(raw);
					return isNaN(num) ? null : num;
				}

				// Fallback for RTC datetime
				// Use tryParseBracketedRtcDatetime instead of regex to avoid escaping issues
				const rtcFallback = tryParseBracketedRtcDatetime(line);
				if (rtcFallback && rtcFallback.inner) {
					return rtcFallback.inner.replace(' ', 'T');
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
			if (timeValue === null) {
				return;
			}

			let chartNeedsUpdate = false;
			
			// Cache regex matches for variables sharing the same pattern
			// Map pattern string -> Match result (or null if no match)
			const matchCache = new Map();
			const matchCacheAfterTime = new Map();

			// Precompute the substring after the time token for variables that need it
			const timeEnd = getTimeTokenEndIndexForLine(plainText);
			const afterTimeText = timeEnd > 0 ? plainText.substring(timeEnd) : '';
			
			plotVariables.forEach((variable, index) => {
				try {
					let match;
					const matchText = variable.matchFromTimeToken ? afterTimeText : plainText;
					const cache = variable.matchFromTimeToken ? matchCacheAfterTime : matchCache;
					
					// Prefer key-based extraction when available.
					if (variable.keyRegex) {
						match = variable.keyRegex.exec(matchText);
						if (match && match[1]) {
							const value = parseFloat(match[1]);
							if (!isNaN(value)) {
								variable.data.push({ time: timeValue, value: value });
								if (variable.data.length > MAX_PLOT_POINTS) {
									variable.data = variable.data.slice(-MAX_PLOT_POINTS);
								}
								chartNeedsUpdate = true;
							}
						} else {
							console.log('FancyMon: keyRegex did not match for', variable.name, 'keyName:', variable.keyName, 'matchText sample:', matchText.substring(0, 100));
						}
						return;
					}

					// Optimization: Check cache first
					if (cache.has(variable.pattern)) {
						match = cache.get(variable.pattern);
					} else {
						// Execute regex and cache result
						// If variable.regex is missing (legacy), create it
						if (!variable.regex) {
							variable.regex = new RegExp(variable.pattern);
						}
						match = variable.regex.exec(matchText);
						cache.set(variable.pattern, match);
					}
					
					// Use specific capture group index if available (new logic), otherwise default to 1 (legacy)
					const captureIndex = variable.captureIndex || 1;
					
					if (match && match[captureIndex]) {
						const value = parseFloat(match[captureIndex]);
						if (!isNaN(value)) {
							variable.data.push({ time: timeValue, value: value });
							
							// Limit data points (keep last MAX_PLOT_POINTS)
							if (variable.data.length > MAX_PLOT_POINTS) {
								variable.data.shift();
							}

							chartNeedsUpdate = true;
						}
					}
				} catch (e) {
					console.error('Error processing variable', variable.name, ':', e);
				}
			});

			// Batch chart update (only once per line, not per variable)
			if (chartNeedsUpdate && plotInitialized && plotDiv) {
				updateChart();
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
		
		// Session selector
		if (sessionSelect) {
			console.log('FancyMon: Session select element found');
			sessionSelect.addEventListener('change', () => {
				const selectedIndex = sessionSelect.value;
				console.log('FancyMon: Session select changed, value:', selectedIndex, 'plotSessions.length:', plotSessions.length);
				if (selectedIndex === '' || selectedIndex === null) {
					// "New session" selected - clear everything
					if (!isLoadingSession) {
						// Clear current variables
						while (plotVariables.length > 0) {
							const index = plotVariables.findIndex(v => v.id === plotVariables[0].id);
							if (index === -1) break;
							
							plotVariables.splice(index, 1);
							
							if (plotInitialized && plotDiv) {
								Plotly.deleteTraces(plotDiv, index);
							}
						}
						
						updateVariablesList();
						updateY1Legend();
						updateY2Legend();
						
						// Clear patterns
						if (patternInput) patternInput.value = '';
						if (timePatternInput) timePatternInput.value = '';
						updateExtractionPreview();
						updateTimePatternHintAndAxis();
					}
				} else {
					// Session selected - load it
					const sessionIndex = parseInt(selectedIndex, 10);
					console.log('FancyMon: Parsed session index:', sessionIndex);
					if (!isNaN(sessionIndex) && sessionIndex >= 0 && sessionIndex < plotSessions.length) {
						console.log('FancyMon: Loading session at index', sessionIndex, ':', plotSessions[sessionIndex]);
						loadSession(plotSessions[sessionIndex]);
					} else {
						console.error('FancyMon: Invalid session index:', sessionIndex, 'plotSessions.length:', plotSessions.length);
					}
				}
			});
		} else {
			console.error('FancyMon: Session select element not found!');
		}

		if (timePatternInput) {
			timePatternInput.addEventListener('input', () => {
				updateExtractionPreview();
				updateTimePatternHintAndAxis();
				// Persist current value
				vscode.postMessage({ command: 'updateTimePatternValue', value: timePatternInput.value });
				// Debounced add-to-history (avoid storing partial patterns)
				if (timePatternDebounceTimer) {
					clearTimeout(timePatternDebounceTimer);
				}
				timePatternDebounceTimer = setTimeout(() => {
					const v = (timePatternInput.value || '').trim();
					if (v) {
						addToTimePatternHistory(v);
					}
					timePatternDebounceTimer = null;
				}, TIME_PATTERN_HISTORY_DEBOUNCE_MS);
			});
			timePatternInput.addEventListener('change', () => {
				updateExtractionPreview();
				updateTimePatternHintAndAxis();
				vscode.postMessage({ command: 'updateTimePatternValue', value: timePatternInput.value });
				const v = (timePatternInput.value || '').trim();
				if (v) {
					addToTimePatternHistory(v);
				}
			});

			timePatternInput.addEventListener('keydown', (e) => {
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					navigateTimePatternHistory('up');
				} else if (e.key === 'ArrowDown') {
					e.preventDefault();
					navigateTimePatternHistory('down');
				} else if (e.key === 'Escape') {
					if (timePatternHistoryDropdown && timePatternHistoryDropdown.style.display === 'block') {
						timePatternHistoryDropdown.style.display = 'none';
						selectedTimePatternHistoryIndex = -1;
					}
				} else if (e.key === 'Enter' && selectedTimePatternHistoryIndex >= 0 && timePatternHistoryDropdown && timePatternHistoryDropdown.style.display === 'block') {
					e.preventDefault();
					selectTimePatternHistoryItem(selectedTimePatternHistoryIndex);
				}
			});
		}

		// Initialize hint/axis mode once on load (before any persisted value arrives)
		if (timePatternInput) {
			updateTimePatternHintAndAxis();
		}

		if (addVariableBtn) {
			addVariableBtn.addEventListener('click', addVariableToPlot);
		}

		if (clearPlotBtn) {
			clearPlotBtn.addEventListener('click', () => {
				plotVariables.forEach(v => v.data = []);
				if (plotInitialized && plotDiv) {
					updateChart();
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
		
		function applyFilter(entries, includePattern, excludePattern) {
			let filtered = entries;
			
			// Apply include filter (comma-separated patterns)
			if (includePattern && includePattern.trim() !== '') {
				const includePatterns = includePattern.split(',').map(p => p.trim()).filter(p => p.length > 0);
				if (includePatterns.length > 0) {
					filtered = filtered.filter(entry => {
						const plainText = stripAnsiCodes(entry.text);
						// Line must match at least one include pattern
						return includePatterns.some(pattern => plainText.includes(pattern));
					});
				}
			}
			
			// Apply exclude filter (comma-separated patterns)
			if (excludePattern && excludePattern.trim() !== '') {
				const excludePatterns = excludePattern.split(',').map(p => p.trim()).filter(p => p.length > 0);
				if (excludePatterns.length > 0) {
					filtered = filtered.filter(entry => {
						const plainText = stripAnsiCodes(entry.text);
						// Line must not match any exclude pattern
						return !excludePatterns.some(pattern => plainText.includes(pattern));
					});
				}
			}
			
			return filtered;
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
			if (historyBtn) {
				historyBtn.disabled = !isConnected || isDisconnecting;
			}
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
		
		function escapeHtmlAttribute(text) {
			// Escape for HTML attribute values - handles quotes, newlines, etc.
			return String(text)
				.replace(new RegExp('&', 'g'), '&amp;')
				.replace(new RegExp('"', 'g'), '&quot;')
				.replace(new RegExp("'", 'g'), '&#39;')
				.replace(new RegExp('<', 'g'), '&lt;')
				.replace(new RegExp('>', 'g'), '&gt;')
				.replace(new RegExp('\\r', 'g'), '&#13;')
				.replace(new RegExp('\\n', 'g'), '&#10;')
				.replace(new RegExp('\\t', 'g'), '&#9;');
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
				if (monitor && isFollowing && !filterPattern && !excludeFilterPattern) {
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
				if (linesTrimmed > 0 && (!isFollowing || filterPattern || excludeFilterPattern)) {
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
			if (isFollowing && !filterPattern && !excludeFilterPattern && !needsFullRender && lastRenderedLineIndex >= 0) {
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
				const escapedPlainText = escapeHtmlAttribute(plainText);
				
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
			lineEntries = applyFilter(lineEntries, filterPattern, excludeFilterPattern);
			
			// Convert raw text lines to HTML, maintaining ANSI state across lines
			let html = '';
			let state = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
			
			for (const entry of lineEntries) {
				const textForDisplay = entry.text.endsWith(newlineChar) ? entry.text.slice(0, -1) : entry.text;
				const result = parseAnsi(textForDisplay, state);
				const plainText = stripAnsiCodes(textForDisplay);
				if (entry.lineNumber !== null && entry.lineNumber !== undefined) {
					html += '<div class="line" data-line="' + entry.lineNumber + '" data-text="' + escapeHtmlAttribute(plainText) + '">' + result.html + '</div>';
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
			lastExcludeFilterPattern = excludeFilterPattern;
			
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
			let selectedText = ''; // Store the actual text selection
			
			// Create context menu element
			function createContextMenu() {
				if (contextMenu) return contextMenu;
				contextMenu = document.createElement('div');
				contextMenu.className = 'context-menu';
				contextMenu.id = 'contextMenu';
				
				// Copy menu item
				const copyMenuItem = document.createElement('div');
				copyMenuItem.className = 'context-menu-item';
				copyMenuItem.textContent = 'Copy';
				copyMenuItem.addEventListener('click', () => {
					let textToCopy = '';
					
					// First, try to get the selected text (if user highlighted something)
					if (selectedText && selectedText.trim().length > 0) {
						textToCopy = selectedText;
					} else if (selectedLineElement) {
						// Fall back to the entire line if no selection
						const lineText = selectedLineElement.getAttribute('data-text');
						if (lineText) {
							textToCopy = lineText;
						}
					}
					
					if (textToCopy) {
						// Strip ANSI codes before copying
						const plainText = stripAnsiCodes(textToCopy);
						copyToClipboard(plainText);
					}
					hideContextMenu();
				});
				contextMenu.appendChild(copyMenuItem);
				
				// Copy All menu item
				const copyAllMenuItem = document.createElement('div');
				copyAllMenuItem.className = 'context-menu-item';
				copyAllMenuItem.textContent = 'Copy All';
				copyAllMenuItem.addEventListener('click', () => {
					// Copy all raw lines (remove ANSI codes)
					const allContent = rawLines.join('') + (lineBuffer || '');
					const content = stripAnsiCodes(allContent);
					
					if (content.trim().length === 0) {
						vscode.postMessage({ command: 'error', message: 'No data to copy' });
					} else {
						copyToClipboard(content);
					}
					hideContextMenu();
				});
				contextMenu.appendChild(copyAllMenuItem);
				
				// Add to plot menu item
				const plotMenuItem = document.createElement('div');
				plotMenuItem.className = 'context-menu-item';
				plotMenuItem.textContent = 'Add selected line to plot';
				plotMenuItem.addEventListener('click', () => {
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
				contextMenu.appendChild(plotMenuItem);
				
				document.body.appendChild(contextMenu);
				return contextMenu;
			}
			
			function showContextMenu(x, y, lineElement) {
				const menu = createContextMenu();
				selectedLineElement = lineElement;
				
				// Capture the current text selection
				const selection = window.getSelection();
				if (selection && selection.toString().trim().length > 0) {
					selectedText = selection.toString();
				} else {
					selectedText = '';
				}
				
				menu.style.display = 'block';
				menu.style.left = x + 'px';
				menu.style.top = y + 'px';
			}
			
			function hideContextMenu() {
				if (contextMenu) {
					contextMenu.style.display = 'none';
					selectedLineElement = null;
					selectedText = '';
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
				console.log('FancyMon: Connect button clicked! isConnected:', isConnected);
				if (isConnected) {
					// Disconnect
					console.log('FancyMon: Disconnecting...');
					if (isDisconnecting) {
						console.log('FancyMon: Already disconnecting, ignoring click');
						return; // Prevent multiple clicks
					}
					isDisconnecting = true;
					connectToggleBtn.disabled = true;
					vscode.postMessage({ command: 'disconnect' });
				} else {
					// Connect
					console.log('FancyMon: Connect button clicked - preparing to connect...');
					if (!portSelect.value) {
						console.log('FancyMon: No port selected!');
						setStatus('Please select a port', 'error');
						return;
					}
					
					const config = {
						port: portSelect.value,
						baudRate: getBaudRate(),
						dataBits: parseInt(dataBits.value),
						stopBits: parseInt(stopBits.value),
						parity: parity.value,
						maxLines: maxLines
					};
					console.log('FancyMon: Sending connect message with config:', JSON.stringify(config));
					vscode.postMessage({
						command: 'connect',
						config: config
					});
					console.log('FancyMon: Connect message sent!');
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

		// ELF File selection
		if (selectElfBtn) {
			selectElfBtn.addEventListener('click', () => {
				vscode.postMessage({ command: 'selectElfFile' });
			});
			
			// Right-click to clear
			selectElfBtn.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				vscode.postMessage({ command: 'clearElfFile' });
			});
		}

		if (testBacktraceBtn) {
			testBacktraceBtn.addEventListener('click', () => {
				console.log('FancyMon: Test button clicked!');
				vscode.postMessage({ command: 'testBacktrace' });
			});
		}

		// Filter input event listener
		if (filterInput) {
			filterInput.addEventListener('input', () => {
				const newPattern = filterInput.value.trim();
				const filterChanged = newPattern !== filterPattern;
				filterPattern = newPattern;
				console.log('FancyMon: Include filter pattern changed to:', filterPattern);
				// Re-render with new filter (force full render)
				if (filterChanged) {
					needsFullRender = true;
					lastRenderedLineIndex = -1;
					renderLinesWithBuffer();
				}
				
				// Debounce adding to history (5 seconds)
				if (includeFilterDebounceTimer) {
					clearTimeout(includeFilterDebounceTimer);
				}
				includeFilterDebounceTimer = setTimeout(() => {
					if (filterPattern && filterPattern.trim() !== '') {
						addToIncludeFilterHistory(filterPattern);
					}
					includeFilterDebounceTimer = null;
				}, FILTER_HISTORY_DEBOUNCE_MS);
			});
			
			// Keyboard navigation for include filter
			filterInput.addEventListener('keydown', (e) => {
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					navigateIncludeFilterHistory('up');
				} else if (e.key === 'ArrowDown') {
					e.preventDefault();
					navigateIncludeFilterHistory('down');
				} else if (e.key === 'Escape') {
					if (includeHistoryDropdown && includeHistoryDropdown.style.display === 'block') {
						includeHistoryDropdown.style.display = 'none';
						selectedIncludeHistoryIndex = -1;
					}
				} else if (e.key === 'Enter' && selectedIncludeHistoryIndex >= 0 && includeHistoryDropdown && includeHistoryDropdown.style.display === 'block') {
					e.preventDefault();
					selectIncludeFilterHistoryItem(selectedIncludeHistoryIndex);
				}
			});
		}

		// Exclude filter input event listener
		if (excludeFilterInput) {
			excludeFilterInput.addEventListener('input', () => {
				const newPattern = excludeFilterInput.value.trim();
				const filterChanged = newPattern !== excludeFilterPattern;
				excludeFilterPattern = newPattern;
				console.log('FancyMon: Exclude filter pattern changed to:', excludeFilterPattern);
				// Re-render with new filter (force full render)
				if (filterChanged) {
					needsFullRender = true;
					lastRenderedLineIndex = -1;
					renderLinesWithBuffer();
				}
				
				// Debounce adding to history (5 seconds)
				if (excludeFilterDebounceTimer) {
					clearTimeout(excludeFilterDebounceTimer);
				}
				excludeFilterDebounceTimer = setTimeout(() => {
					if (excludeFilterPattern && excludeFilterPattern.trim() !== '') {
						addToExcludeFilterHistory(excludeFilterPattern);
					}
					excludeFilterDebounceTimer = null;
				}, FILTER_HISTORY_DEBOUNCE_MS);
			});
			
			// Keyboard navigation for exclude filter
			excludeFilterInput.addEventListener('keydown', (e) => {
				if (e.key === 'ArrowUp') {
					e.preventDefault();
					navigateExcludeFilterHistory('up');
				} else if (e.key === 'ArrowDown') {
					e.preventDefault();
					navigateExcludeFilterHistory('down');
				} else if (e.key === 'Escape') {
					if (excludeHistoryDropdown && excludeHistoryDropdown.style.display === 'block') {
						excludeHistoryDropdown.style.display = 'none';
						selectedExcludeHistoryIndex = -1;
					}
				} else if (e.key === 'Enter' && selectedExcludeHistoryIndex >= 0 && excludeHistoryDropdown && excludeHistoryDropdown.style.display === 'block') {
					e.preventDefault();
					selectExcludeFilterHistoryItem(selectedExcludeHistoryIndex);
				}
			});
		}
		
		// History button event listeners
		if (includeHistoryBtn) {
			includeHistoryBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				toggleIncludeFilterHistoryDropdown();
			});
		}
		
		if (excludeHistoryBtn) {
			excludeHistoryBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				toggleExcludeFilterHistoryDropdown();
			});
		}

		if (timePatternHistoryBtn) {
			timePatternHistoryBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				toggleTimePatternHistoryDropdown();
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
			if ((!filterPattern || filterPattern.trim() === '') && (!excludeFilterPattern || excludeFilterPattern.trim() === '')) {
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
			const filteredEntries = applyFilter(lineEntries, filterPattern, excludeFilterPattern);
			
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

		// History management functions
		function addToHistory(message) {
			if (!message || message.trim() === '') {
				return; // Don't add empty messages
			}
			const trimmedMessage = message.trim();
			
			// Remove if already exists (to move to top and avoid duplicates)
			const index = messageHistory.indexOf(trimmedMessage);
			if (index > -1) {
				messageHistory.splice(index, 1);
			}
			// Add to beginning
			messageHistory.unshift(trimmedMessage);
			// Limit to MAX_HISTORY items
			if (messageHistory.length > MAX_HISTORY) {
				messageHistory = messageHistory.slice(0, MAX_HISTORY);
			}
			console.log('FancyMon: History after adding:', messageHistory.length, 'items:', messageHistory);
			// Save to extension
			vscode.postMessage({ command: 'updateMessageHistory', history: messageHistory });
		}

		function renderHistoryDropdown() {
			if (!historyDropdown) {
				console.error('FancyMon: historyDropdown element not found!');
				return;
			}
			
			console.log('FancyMon: Rendering dropdown with', messageHistory.length, 'items:', messageHistory);
			
			historyDropdown.innerHTML = '';
			selectedHistoryIndex = -1;
			
			if (messageHistory.length === 0) {
				const emptyItem = document.createElement('div');
				emptyItem.className = 'history-item empty';
				emptyItem.textContent = 'No history';
				historyDropdown.appendChild(emptyItem);
			} else {
				// Show all history items (up to 30)
				messageHistory.forEach((msg, index) => {
					const item = document.createElement('div');
					item.className = 'history-item';
					item.setAttribute('data-index', index.toString());
					item.textContent = msg;
					item.title = msg;
					item.addEventListener('click', () => {
						selectHistoryItem(index);
					});
					item.addEventListener('mouseenter', () => {
						selectedHistoryIndex = index;
						updateHistorySelection();
					});
					historyDropdown.appendChild(item);
					console.log('FancyMon: Added history item', index, ':', msg);
				});
				console.log('FancyMon: Dropdown now has', historyDropdown.children.length, 'children');
			}
		}

		function updateHistorySelection() {
			if (!historyDropdown) return;
			const items = historyDropdown.querySelectorAll('.history-item:not(.empty)');
			items.forEach((item, index) => {
				if (index === selectedHistoryIndex) {
					item.classList.add('selected');
					// Scroll into view if needed
					item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
				} else {
					item.classList.remove('selected');
				}
			});
		}

		function selectHistoryItem(index) {
			if (index >= 0 && index < messageHistory.length) {
				sendInput.value = messageHistory[index];
				historyDropdown.style.display = 'none';
				selectedHistoryIndex = -1;
				sendInput.focus();
			}
		}

		function navigateHistory(direction) {
			if (!historyDropdown || historyDropdown.style.display === 'none' || !historyDropdown.style.display) {
				// Show dropdown if hidden
				renderHistoryDropdown();
				historyDropdown.style.display = 'block';
				selectedHistoryIndex = 0;
			} else {
				// Navigate within dropdown
				if (direction === 'up') {
					selectedHistoryIndex = Math.max(0, selectedHistoryIndex - 1);
				} else if (direction === 'down') {
					selectedHistoryIndex = Math.min(messageHistory.length - 1, selectedHistoryIndex + 1);
				}
			}
			updateHistorySelection();
		}

		function toggleHistoryDropdown() {
			if (!historyDropdown || !historyBtn) return;
			
			if (historyDropdown.style.display === 'none' || !historyDropdown.style.display) {
				renderHistoryDropdown();
				historyDropdown.style.display = 'block';
			} else {
				historyDropdown.style.display = 'none';
			}
		}

		// Close dropdown when clicking outside
		document.addEventListener('click', (e) => {
			if (historyDropdown && historyBtn && 
			    !historyDropdown.contains(e.target) && 
			    !historyBtn.contains(e.target)) {
				historyDropdown.style.display = 'none';
			}
			if (includeHistoryDropdown && includeHistoryBtn && 
			    !includeHistoryDropdown.contains(e.target) && 
			    !includeHistoryBtn.contains(e.target) &&
			    !filterInput.contains(e.target)) {
				includeHistoryDropdown.style.display = 'none';
			}
			if (excludeHistoryDropdown && excludeHistoryBtn && 
			    !excludeHistoryDropdown.contains(e.target) && 
			    !excludeHistoryBtn.contains(e.target) &&
			    !excludeFilterInput.contains(e.target)) {
				excludeHistoryDropdown.style.display = 'none';
			}
			if (timePatternHistoryDropdown && timePatternHistoryBtn && timePatternInput &&
			    !timePatternHistoryDropdown.contains(e.target) &&
			    !timePatternHistoryBtn.contains(e.target) &&
			    !timePatternInput.contains(e.target)) {
				timePatternHistoryDropdown.style.display = 'none';
			}
		});

		// Time pattern history management functions (mirrors filter history UX)
		function addToTimePatternHistory(pattern) {
			if (!pattern || pattern.trim() === '') {
				return;
			}
			const trimmed = pattern.trim();
			// Don't store pinned defaults; they are always shown in pinned section
			if (isPinnedTimePattern(trimmed)) {
				return;
			}

			const idx = timePatternHistory.indexOf(trimmed);
			if (idx > -1) {
				timePatternHistory.splice(idx, 1);
			}
			timePatternHistory.unshift(trimmed);
			if (timePatternHistory.length > MAX_TIME_PATTERN_HISTORY) {
				timePatternHistory = timePatternHistory.slice(0, MAX_TIME_PATTERN_HISTORY);
			}
			vscode.postMessage({ command: 'updateTimePatternHistory', history: timePatternHistory });
		}

		function renderTimePatternHistoryDropdown() {
			if (!timePatternHistoryDropdown) return;

			timePatternHistoryDropdown.innerHTML = '';
			selectedTimePatternHistoryIndex = -1;
			timePatternDropdownItems = [];

			// Recent (user) patterns
			if (timePatternHistory.length === 0) {
				const emptyItem = document.createElement('div');
				emptyItem.className = 'history-item empty';
				emptyItem.textContent = 'No recent time patterns';
				timePatternHistoryDropdown.appendChild(emptyItem);
			} else {
				timePatternHistory.forEach((p) => {
					const item = document.createElement('div');
					item.className = 'history-item selectable';
					item.textContent = p;
					item.title = p;
					const index = timePatternDropdownItems.length;
					timePatternDropdownItems.push({ pattern: p });
					item.addEventListener('click', () => selectTimePatternHistoryItem(index));
					item.addEventListener('mouseenter', () => {
						selectedTimePatternHistoryIndex = index;
						updateTimePatternHistorySelection();
					});
					timePatternHistoryDropdown.appendChild(item);
				});
			}

			// Separator + pinned patterns (always present)
			const sep = document.createElement('div');
			sep.className = 'history-separator';
			sep.textContent = 'Pinned';
			timePatternHistoryDropdown.appendChild(sep);

			PINNED_TIME_PATTERNS.forEach((pinned) => {
				const item = document.createElement('div');
				item.className = 'history-item pinned selectable';
				item.textContent = pinned.label;
				item.title = pinned.pattern + '\\n' + pinned.hint;
				const index = timePatternDropdownItems.length;
				timePatternDropdownItems.push({ pattern: pinned.pattern });
				item.addEventListener('click', () => selectTimePatternHistoryItem(index));
				item.addEventListener('mouseenter', () => {
					selectedTimePatternHistoryIndex = index;
					updateTimePatternHistorySelection();
				});
				timePatternHistoryDropdown.appendChild(item);
			});
		}

		function updateTimePatternHistorySelection() {
			if (!timePatternHistoryDropdown) return;
			const items = timePatternHistoryDropdown.querySelectorAll('.history-item.selectable');
			items.forEach((item, idx) => {
				if (idx === selectedTimePatternHistoryIndex) {
					item.classList.add('selected');
					item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
				} else {
					item.classList.remove('selected');
				}
			});
		}

		function selectTimePatternHistoryItem(index) {
			if (!timePatternInput || !timePatternHistoryDropdown) return;
			if (index < 0 || index >= timePatternDropdownItems.length) return;
			const chosen = timePatternDropdownItems[index]?.pattern;
			if (!chosen) return;

			// Normalize the pattern, but pinned patterns should already be correct
			// Check if it's a pinned pattern first
			const isPinned = PINNED_TIME_PATTERNS.some(p => p.pattern === chosen);
			const normalized = normalizeTimePatternInputValue(chosen);
			timePatternInput.value = normalized;
			timePatternHistoryDropdown.style.display = 'none';
			selectedTimePatternHistoryIndex = -1;

			// Persist + update
			vscode.postMessage({ command: 'updateTimePatternValue', value: timePatternInput.value });
			addToTimePatternHistory(timePatternInput.value);
			updateTimePatternHintAndAxis();
			updateExtractionPreview();
			timePatternInput.focus();
		}

		function navigateTimePatternHistory(direction) {
			if (!timePatternHistoryDropdown || timePatternHistoryDropdown.style.display === 'none' || !timePatternHistoryDropdown.style.display) {
				renderTimePatternHistoryDropdown();
				timePatternHistoryDropdown.style.display = 'block';
				selectedTimePatternHistoryIndex = 0;
			} else {
				if (direction === 'up') {
					selectedTimePatternHistoryIndex = Math.max(0, selectedTimePatternHistoryIndex - 1);
				} else if (direction === 'down') {
					selectedTimePatternHistoryIndex = Math.min(timePatternDropdownItems.length - 1, selectedTimePatternHistoryIndex + 1);
				}
			}
			updateTimePatternHistorySelection();
		}

		function toggleTimePatternHistoryDropdown() {
			if (!timePatternHistoryDropdown || !timePatternHistoryBtn) return;
			if (timePatternHistoryDropdown.style.display === 'none' || !timePatternHistoryDropdown.style.display) {
				renderTimePatternHistoryDropdown();
				timePatternHistoryDropdown.style.display = 'block';
			} else {
				timePatternHistoryDropdown.style.display = 'none';
			}
		}
		
		// Filter history management functions
		function addToIncludeFilterHistory(filter) {
			if (!filter || filter.trim() === '') {
				return; // Don't add empty filters
			}
			const trimmedFilter = filter.trim();
			
			// Remove if already exists (to move to top and avoid duplicates)
			const index = includeFilterHistory.indexOf(trimmedFilter);
			if (index > -1) {
				includeFilterHistory.splice(index, 1);
			}
			// Add to beginning
			includeFilterHistory.unshift(trimmedFilter);
			// Limit to MAX_FILTER_HISTORY items
			if (includeFilterHistory.length > MAX_FILTER_HISTORY) {
				includeFilterHistory = includeFilterHistory.slice(0, MAX_FILTER_HISTORY);
			}
			// Save to extension
			vscode.postMessage({ command: 'updateIncludeFilterHistory', history: includeFilterHistory });
		}
		
		function addToExcludeFilterHistory(filter) {
			if (!filter || filter.trim() === '') {
				return; // Don't add empty filters
			}
			const trimmedFilter = filter.trim();
			
			// Remove if already exists (to move to top and avoid duplicates)
			const index = excludeFilterHistory.indexOf(trimmedFilter);
			if (index > -1) {
				excludeFilterHistory.splice(index, 1);
			}
			// Add to beginning
			excludeFilterHistory.unshift(trimmedFilter);
			// Limit to MAX_FILTER_HISTORY items
			if (excludeFilterHistory.length > MAX_FILTER_HISTORY) {
				excludeFilterHistory = excludeFilterHistory.slice(0, MAX_FILTER_HISTORY);
			}
			// Save to extension
			vscode.postMessage({ command: 'updateExcludeFilterHistory', history: excludeFilterHistory });
		}
		
		function renderIncludeFilterHistoryDropdown() {
			if (!includeHistoryDropdown) return;
			
			includeHistoryDropdown.innerHTML = '';
			selectedIncludeHistoryIndex = -1;
			
			if (includeFilterHistory.length === 0) {
				const emptyItem = document.createElement('div');
				emptyItem.className = 'history-item empty';
				emptyItem.textContent = 'No history';
				includeHistoryDropdown.appendChild(emptyItem);
			} else {
				includeFilterHistory.forEach((filter, index) => {
					const item = document.createElement('div');
					item.className = 'history-item';
					item.setAttribute('data-index', index.toString());
					item.textContent = filter;
					item.title = filter;
					item.addEventListener('click', () => {
						selectIncludeFilterHistoryItem(index);
					});
					item.addEventListener('mouseenter', () => {
						selectedIncludeHistoryIndex = index;
						updateIncludeFilterHistorySelection();
					});
					includeHistoryDropdown.appendChild(item);
				});
			}
		}
		
		function renderExcludeFilterHistoryDropdown() {
			if (!excludeHistoryDropdown) return;
			
			excludeHistoryDropdown.innerHTML = '';
			selectedExcludeHistoryIndex = -1;
			
			if (excludeFilterHistory.length === 0) {
				const emptyItem = document.createElement('div');
				emptyItem.className = 'history-item empty';
				emptyItem.textContent = 'No history';
				excludeHistoryDropdown.appendChild(emptyItem);
			} else {
				excludeFilterHistory.forEach((filter, index) => {
					const item = document.createElement('div');
					item.className = 'history-item';
					item.setAttribute('data-index', index.toString());
					item.textContent = filter;
					item.title = filter;
					item.addEventListener('click', () => {
						selectExcludeFilterHistoryItem(index);
					});
					item.addEventListener('mouseenter', () => {
						selectedExcludeHistoryIndex = index;
						updateExcludeFilterHistorySelection();
					});
					excludeHistoryDropdown.appendChild(item);
				});
			}
		}
		
		function updateIncludeFilterHistorySelection() {
			if (!includeHistoryDropdown) return;
			const items = includeHistoryDropdown.querySelectorAll('.history-item:not(.empty)');
			items.forEach((item, index) => {
				if (index === selectedIncludeHistoryIndex) {
					item.classList.add('selected');
					item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
				} else {
					item.classList.remove('selected');
				}
			});
		}
		
		function updateExcludeFilterHistorySelection() {
			if (!excludeHistoryDropdown) return;
			const items = excludeHistoryDropdown.querySelectorAll('.history-item:not(.empty)');
			items.forEach((item, index) => {
				if (index === selectedExcludeHistoryIndex) {
					item.classList.add('selected');
					item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
				} else {
					item.classList.remove('selected');
				}
			});
		}
		
		function selectIncludeFilterHistoryItem(index) {
			if (index >= 0 && index < includeFilterHistory.length) {
				filterInput.value = includeFilterHistory[index];
				filterPattern = includeFilterHistory[index];
				includeHistoryDropdown.style.display = 'none';
				selectedIncludeHistoryIndex = -1;
				filterInput.focus();
				// Trigger filter update
				needsFullRender = true;
				lastRenderedLineIndex = -1;
				renderLinesWithBuffer();
			}
		}
		
		function selectExcludeFilterHistoryItem(index) {
			if (index >= 0 && index < excludeFilterHistory.length) {
				excludeFilterInput.value = excludeFilterHistory[index];
				excludeFilterPattern = excludeFilterHistory[index];
				excludeHistoryDropdown.style.display = 'none';
				selectedExcludeHistoryIndex = -1;
				excludeFilterInput.focus();
				// Trigger filter update
				needsFullRender = true;
				lastRenderedLineIndex = -1;
				renderLinesWithBuffer();
			}
		}
		
		function navigateIncludeFilterHistory(direction) {
			if (!includeHistoryDropdown || includeHistoryDropdown.style.display === 'none' || !includeHistoryDropdown.style.display) {
				renderIncludeFilterHistoryDropdown();
				includeHistoryDropdown.style.display = 'block';
				selectedIncludeHistoryIndex = 0;
			} else {
				if (direction === 'up') {
					selectedIncludeHistoryIndex = Math.max(0, selectedIncludeHistoryIndex - 1);
				} else if (direction === 'down') {
					selectedIncludeHistoryIndex = Math.min(includeFilterHistory.length - 1, selectedIncludeHistoryIndex + 1);
				}
			}
			updateIncludeFilterHistorySelection();
		}
		
		function navigateExcludeFilterHistory(direction) {
			if (!excludeHistoryDropdown || excludeHistoryDropdown.style.display === 'none' || !excludeHistoryDropdown.style.display) {
				renderExcludeFilterHistoryDropdown();
				excludeHistoryDropdown.style.display = 'block';
				selectedExcludeHistoryIndex = 0;
			} else {
				if (direction === 'up') {
					selectedExcludeHistoryIndex = Math.max(0, selectedExcludeHistoryIndex - 1);
				} else if (direction === 'down') {
					selectedExcludeHistoryIndex = Math.min(excludeFilterHistory.length - 1, selectedExcludeHistoryIndex + 1);
				}
			}
			updateExcludeFilterHistorySelection();
		}
		
		function toggleIncludeFilterHistoryDropdown() {
			if (!includeHistoryDropdown || !includeHistoryBtn) return;
			
			if (includeHistoryDropdown.style.display === 'none' || !includeHistoryDropdown.style.display) {
				renderIncludeFilterHistoryDropdown();
				includeHistoryDropdown.style.display = 'block';
			} else {
				includeHistoryDropdown.style.display = 'none';
			}
		}
		
		function toggleExcludeFilterHistoryDropdown() {
			if (!excludeHistoryDropdown || !excludeHistoryBtn) return;
			
			if (excludeHistoryDropdown.style.display === 'none' || !excludeHistoryDropdown.style.display) {
				renderExcludeFilterHistoryDropdown();
				excludeHistoryDropdown.style.display = 'block';
			} else {
				excludeHistoryDropdown.style.display = 'none';
			}
		}

		sendBtn.addEventListener('click', () => {
			const data = sendInput.value.trim();
			if (data) {
				// Remove trailing newline if user added it, we'll add it ourselves
				const cleanData = data.replace(new RegExp('\\n$'), '').replace(new RegExp('\\\\n$'), '');
				console.log('FancyMon: Sending message, cleanData:', cleanData, 'current history length:', messageHistory.length);
				vscode.postMessage({ command: 'send', data: cleanData + '\\n' });
				addToHistory(cleanData);
				sendInput.value = '';
				historyDropdown.style.display = 'none';
			}
		});

		if (historyBtn) {
			historyBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				toggleHistoryDropdown();
			});
		}

		sendInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter' && selectedHistoryIndex < 0) {
				sendBtn.click();
			}
		});

		sendInput.addEventListener('keydown', (e) => {
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				navigateHistory('up');
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				navigateHistory('down');
			} else if (e.key === 'Escape') {
				if (historyDropdown && historyDropdown.style.display === 'block') {
					historyDropdown.style.display = 'none';
					selectedHistoryIndex = -1;
				}
			} else if (e.key === 'Enter' && selectedHistoryIndex >= 0 && historyDropdown && historyDropdown.style.display === 'block') {
				e.preventDefault();
				selectHistoryItem(selectedHistoryIndex);
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
					// Log ALL messages except 'data' (too verbose) and 'debug' (we handle it)
					if (message?.command !== 'data' && message?.command !== 'debug') {
						console.log('FancyMon: Received message:', message ? message.command : 'null', message);
					}
					
					if (!message || !message.command) {
						console.warn('FancyMon: Received invalid message:', message);
						return;
					}
					
					switch (message.command) {
				case 'debug':
					// Forward debug logs to console
					if (message.message) {
						console.log('FancyMon [EXT]: ' + message.message);
					}
					break;
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
								console.log('FancyMon: Auto-connect config:', JSON.stringify(config));
								console.log('FancyMon: connectToggleBtn exists:', !!connectToggleBtn);
								setTimeout(() => {
									console.log('FancyMon: Auto-connect timeout fired, clicking connect button...');
									if (connectToggleBtn) {
										console.log('FancyMon: About to click connectToggleBtn...');
										connectToggleBtn.click();
										console.log('FancyMon: connectToggleBtn.click() called!');
									} else {
										console.error('FancyMon: connectToggleBtn is null in timeout!');
									}
								}, 100); // Small delay to ensure UI is updated
							} else {
								console.log('FancyMon: Not auto-connecting. shouldAutoConnect:', shouldAutoConnect, 'port:', config.port, 'baudRate:', config.baudRate);
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

				case 'setElfFile':
					if (selectElfBtn) {
						if (!message.path || !message.name) {
							// Reset state
							selectElfBtn.textContent = 'Load ELF File';
							selectElfBtn.title = 'Load ELF File (Right-click to clear)';
						} else {
							const name = message.name || 'Unknown';
							const path = message.path || '';
							const date = message.date ? new Date(message.date).toLocaleString() : 'Unknown';
							selectElfBtn.textContent = 'ELF: ' + name;
							selectElfBtn.title = path + '\\nLast Modified: ' + date + '\\n(Right-click to clear)';
						}
					}
					break;
					
				case 'messageHistoryLoaded':
					if (message.history && Array.isArray(message.history)) {
						messageHistory = [...message.history]; // Create a copy to avoid reference issues
						console.log('FancyMon: Loaded message history:', messageHistory.length, 'items:', messageHistory);
					}
					break;
					
				case 'includeFilterHistoryLoaded':
					if (message.history && Array.isArray(message.history)) {
						includeFilterHistory = [...message.history];
						console.log('FancyMon: Loaded include filter history:', includeFilterHistory.length, 'items:', includeFilterHistory);
					}
					break;
					
				case 'excludeFilterHistoryLoaded':
					if (message.history && Array.isArray(message.history)) {
						excludeFilterHistory = [...message.history];
						console.log('FancyMon: Loaded exclude filter history:', excludeFilterHistory.length, 'items:', excludeFilterHistory);
					}
					break;

				case 'timePatternHistoryLoaded':
					if (message.history && Array.isArray(message.history)) {
						timePatternHistory = [...message.history];
					}
					break;

				case 'timePatternValueLoaded':
					if (timePatternInput && typeof message.value === 'string' && message.value.trim() !== '') {
						timePatternInput.value = normalizeTimePatternInputValue(message.value);
					}
					updateTimePatternHintAndAxis();
					updateExtractionPreview();
					// If chart is already initialized, ensure axis title is correct
					if (plotInitialized && plotDiv) {
						const mode = computeTimeAxisModeFromPattern(timePatternInput ? timePatternInput.value : DEFAULT_UPTIME_TIME_PATTERN);
						const xTitle = mode === 'rtc' ? 'RTC DateTime' : 'CPU Uptime (ms)';
						Plotly.relayout(plotDiv, {
							'xaxis.title.text': xTitle
						});
					}
					break;
					
				case 'plotSessionsLoaded':
					console.log('FancyMon: Received plotSessionsLoaded, sessions:', message.sessions);
					if (message.sessions && Array.isArray(message.sessions)) {
						plotSessions = [...message.sessions];
						console.log('FancyMon: Loaded', plotSessions.length, 'sessions');
						updateSessionDropdown();
					}
					break;
				case 'connected':
					console.log('FancyMon: Received connected message!');
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
					console.log('FancyMon: Received error message:', message.message);
					console.log('FancyMon: Error message details:', JSON.stringify(message));
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

