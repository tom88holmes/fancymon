import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface SerialMonitorConfig {
	port: string;
	baudRate: number;
	dataBits: 7 | 8;
	stopBits: 1 | 2;
	parity: 'none' | 'even' | 'odd';
}

type SerialPortType = any; // Will be the SerialPort type from serialport module

export class SerialMonitor {
	private port: SerialPortType | null = null;
	public panel: vscode.WebviewPanel | null = null; // Made public for cleanup
	private isConnected = false;
	private isDisconnecting = false; // Prevent multiple simultaneous disconnect calls
	private messageQueue: string[] = [];
	private serialportModule: any = null;
	private readonly configKey = 'fancymon.lastConfig';

	constructor(private context: vscode.ExtensionContext) {}

	private async getSerialPort(): Promise<typeof import('serialport')> {
		if (!this.serialportModule) {
			try {
				console.log('FancyMon: Loading serialport module...');
				this.serialportModule = await import('serialport');
				console.log('FancyMon: Serialport module loaded successfully');
			} catch (error: any) {
				console.error('FancyMon: Failed to load serialport module:', error);
				throw new Error(`Failed to load serialport module: ${error?.message || error}. Make sure serialport is installed with 'npm install'.`);
			}
		}
		return this.serialportModule;
	}

	private getBuildNumber(): number {
		try {
			const buildInfoPath = path.join(this.context.extensionPath, 'build-info.json');
			if (fs.existsSync(buildInfoPath)) {
				const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
				return buildInfo.buildNumber || 0;
			}
		} catch (err) {
			// If we can't read it, return 0
		}
		return 0;
	}

	public async createPanel(): Promise<void> {
		console.log('FancyMon: createPanel() called');
		if (this.panel) {
			console.log('FancyMon: Panel already exists, revealing...');
			this.panel.reveal();
			return;
		}

		console.log('FancyMon: Creating new panel...');
		const buildNumber = this.getBuildNumber();
		const title = buildNumber > 0 ? `Serial Monitor (Build #${buildNumber})` : 'Serial Monitor';
		console.log('FancyMon: Panel title:', title);

		try {
			this.panel = vscode.window.createWebviewPanel(
				'serialMonitor',
				title,
				vscode.ViewColumn.Two,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
					localResourceRoots: [
						vscode.Uri.joinPath(this.context.extensionUri, 'media')
					]
				}
			);
			console.log('FancyMon: Webview panel created');

			this.panel.webview.html = this.getWebviewContent();
			console.log('FancyMon: Webview HTML set');

			this.panel.onDidDispose(() => {
				this.disconnect();
				this.panel = null;
			});

			this.panel.webview.onDidReceiveMessage(async (message) => {
				console.log('FancyMon: Received message from webview:', message.command, JSON.stringify(message));
				try {
					switch (message.command) {
						case 'listPorts':
							console.log('FancyMon: Handling listPorts command');
							await this.listPorts();
							break;
						case 'connect':
							await this.connect(message.config);
							break;
						case 'disconnect':
							await this.disconnect();
							break;
						case 'send':
							await this.sendData(message.data);
							break;
					case 'clear':
						this.sendMessage({ command: 'clear' });
						break;
					case 'save':
						await this.saveToFile(message.content);
						break;
					default:
						console.warn('FancyMon: Unknown command:', message.command);
					}
				} catch (error: any) {
					console.error('FancyMon: Error handling message:', error);
					this.sendMessage({
						command: 'error',
						message: `Error: ${error?.message || error}`
					});
				}
			});

			// Send any queued messages
			if (this.messageQueue.length > 0) {
				this.messageQueue.forEach(msg => this.sendMessage(msg));
				this.messageQueue = [];
			}

			// Manually trigger port list after a short delay to ensure webview is ready
			setTimeout(() => {
				console.log('FancyMon: Manually triggering port list after panel creation');
				this.listPorts().catch(err => {
					console.error('FancyMon: Error in manual port list:', err);
				});
			}, 500); // Increased delay to ensure webview message handler is ready
		} catch (error: any) {
			console.error('FancyMon: Error creating panel:', error);
			console.error('FancyMon: Error stack:', error?.stack);
			vscode.window.showErrorMessage(`Failed to create serial monitor panel: ${error?.message || error}`);
			throw error;
		}
	}

	private getLastConfig(): SerialMonitorConfig | null {
		const saved = this.context.workspaceState.get<SerialMonitorConfig>(this.configKey);
		return saved || null;
	}

	private saveConfig(config: SerialMonitorConfig): void {
		this.context.workspaceState.update(this.configKey, config);
	}

	private async listPorts(): Promise<void> {
		try {
			console.log('FancyMon: Listing serial ports...');
			const serialport = await this.getSerialPort();
			console.log('FancyMon: SerialPort module loaded, calling list()...');
			const ports = await serialport.SerialPort.list();
			console.log(`FancyMon: Found ${ports.length} ports`);
			
			const lastConfig = this.getLastConfig();
			
			if (ports.length === 0) {
				console.log('FancyMon: No ports found');
				this.sendMessage({
					command: 'portsListed',
					ports: [],
					lastConfig: lastConfig
				});
				return;
			}

			const portList = ports.map((p: any) => ({
				path: p.path,
				manufacturer: p.manufacturer || 'Unknown',
				vendorId: p.vendorId,
				productId: p.productId
			}));

			console.log('FancyMon: Ports:', portList);
			console.log('FancyMon: Last config:', lastConfig);
			this.sendMessage({
				command: 'portsListed',
				ports: portList,
				lastConfig: lastConfig
			});
		} catch (error: any) {
			console.error('FancyMon: Error listing ports:', error);
			const errorMessage = `Failed to list ports: ${error?.message || error}`;
			console.error('FancyMon: Error details:', errorMessage);
			this.sendMessage({
				command: 'error',
				message: errorMessage
			});
		}
	}

	private dataHandler: ((data: Buffer) => void) | null = null;
	private errorHandler: ((err: any) => void) | null = null;
	private closeHandler: (() => void) | null = null;
	private shouldProcessData = true; // Flag to immediately stop processing data
	private pendingDataBytes = 0; // Track bytes still being processed after disconnect
	private pendingDataChunks = 0; // Track number of data chunks still being processed
	private disconnectStartTime = 0; // Track when disconnect started
	private lastDataReceivedTime = 0; // Track when data was last received (for disconnect wait loop)

	private async connect(config: SerialMonitorConfig): Promise<void> {
		if (this.isConnected) {
			await this.disconnect();
		}

		// Save the configuration for next time
		this.saveConfig(config);

		try {
			const serialport = await this.getSerialPort();
			this.port = new serialport.SerialPort({
				path: config.port,
				baudRate: config.baudRate,
				dataBits: config.dataBits,
				stopBits: config.stopBits,
				parity: config.parity,
				autoOpen: false
			});

			// Set up event handlers before opening (store references for cleanup)
			this.shouldProcessData = true; // Reset flag when connecting
			this.pendingDataBytes = 0;
			this.pendingDataChunks = 0;
			this.dataHandler = (data: Buffer) => {
				// ULTRA-CRITICAL: Check ALL flags FIRST before doing ANYTHING
				// If ANY of these are false/null, exit immediately without any processing
				if (!this.shouldProcessData || !this.isConnected || !this.port || this.isDisconnecting) {
					// Exit silently - don't even log to avoid overhead
					return;
				}
				
				const dataSize = data.length;
				const timestamp = Date.now();
				
				console.log(`FancyMon: Data handler called - size: ${dataSize} bytes`);
				
				// Process the data
				console.log(`FancyMon: Sending data to UI - ${dataSize} bytes`);
				this.sendMessage({
					command: 'data',
					data: data.toString()
				});
			};

			this.errorHandler = (err: any) => {
				if (this.isConnected) { // Only process errors if still connected
					this.sendMessage({
						command: 'error',
						message: `Serial port error: ${err?.message || err}`
					});
				}
			};

			this.closeHandler = () => {
				this.isConnected = false;
				this.sendMessage({ command: 'disconnected' });
			};

			this.port.on('data', this.dataHandler);
			this.port.on('error', this.errorHandler);
			this.port.on('close', this.closeHandler);

			// Open the port (promise-based in v11)
			await this.port.open();
			
			this.isConnected = true;
			this.sendMessage({ command: 'connected' });
		} catch (error: any) {
			this.sendMessage({
				command: 'error',
				message: `Connection error: ${error?.message || error}`
			});
			this.isConnected = false;
			if (this.port) {
				this.port = null;
			}
		}
	}

	public async disconnect(): Promise<void> {
		// Prevent multiple simultaneous disconnect calls
		if (this.isDisconnecting) {
			console.log('FancyMon: Disconnect already in progress, ignoring');
			return;
		}
		
		if (this.port) {
			this.isDisconnecting = true;
			this.disconnectStartTime = Date.now();
			this.pendingDataBytes = 0;
			this.pendingDataChunks = 0;
			const portToClose = this.port; // Store reference before clearing
			
			// CRITICAL: Stop processing data IMMEDIATELY - this must be first!
			this.shouldProcessData = false;
			this.isConnected = false;
			
			console.log('FancyMon: Disconnect started - data processing stopped immediately');
			this.sendMessage({ 
				command: 'disconnecting',
				pendingBytes: 0,
				pendingChunks: 0,
				elapsedMs: 0
			});
			
			// STEP 1: Remove listeners FIRST (before anything else) to stop callbacks
			console.log('FancyMon: Step 1 - Removing ALL event listeners immediately...');
			try {
				// Remove listeners using both methods to be absolutely sure
				portToClose.removeAllListeners('data');
				portToClose.removeAllListeners('error');
				portToClose.removeAllListeners('close');
				
				// Also try individual removal as backup
				if (this.dataHandler) {
					portToClose.off('data', this.dataHandler);
				}
				if (this.errorHandler) {
					portToClose.off('error', this.errorHandler);
				}
				if (this.closeHandler) {
					portToClose.off('close', this.closeHandler);
				}
				console.log('FancyMon: All event listeners removed');
			} catch (removeErr: any) {
				console.log('FancyMon: Error removing listeners:', removeErr?.message);
			}
			
			// STEP 2: Clear references IMMEDIATELY so data handler checks fail
			this.dataHandler = null;
			this.errorHandler = null;
			this.closeHandler = null;
			this.port = null; // Clear this BEFORE pausing so data handler checks fail
			console.log('FancyMon: All references cleared');
			
			// STEP 3: Try to pause/stop the port (but listeners are already gone)
			try {
				if (portToClose.isOpen) {
					if (portToClose.pause) {
						portToClose.pause();
						console.log('FancyMon: Port paused');
					}
				}
			} catch (pauseErr: any) {
				console.log('FancyMon: Error pausing port:', pauseErr?.message);
			}
			
			// STEP 4: Destroy/close the port immediately - don't wait for graceful close
			try {
				if (portToClose.isOpen) {
					console.log('FancyMon: Step 4 - Destroying port immediately...');
					// Try destroy first (more aggressive, stops everything immediately)
					try {
						if (portToClose.destroy) {
							portToClose.destroy();
							console.log('FancyMon: Port destroyed immediately');
						}
					} catch (destroyErr: any) {
						console.log('FancyMon: Error destroying port:', destroyErr?.message);
					}
					
					// Also try close with very short timeout (100ms max)
					try {
						await Promise.race([
							portToClose.close(),
							new Promise((_, reject) => setTimeout(() => reject(new Error('Close timeout')), 100))
						]);
						console.log('FancyMon: Port closed');
					} catch (closeErr: any) {
						// Ignore close errors - we already tried destroy
						console.log('FancyMon: Port close skipped (destroy was attempted):', closeErr?.message);
					}
				} else {
					console.log('FancyMon: Port was already closed');
				}
			} catch (err: any) {
				console.error('FancyMon: Error during port cleanup:', err);
			}
			
			// Port reference already cleared above, just finalize disconnect
			console.log('FancyMon: Disconnect complete');
			this.sendMessage({ command: 'disconnected' });
			this.isDisconnecting = false;
		} else {
			this.shouldProcessData = false;
			this.isConnected = false;
			this.sendMessage({ command: 'disconnected' });
		}
	}

	private async sendData(data: string): Promise<void> {
		if (!this.port || !this.isConnected) {
			this.sendMessage({
				command: 'error',
				message: 'Not connected to serial port'
			});
			return;
		}

		try {
			await this.port.write(data);
			// Echo sent data to monitor
			this.sendMessage({
				command: 'data',
				data: `[SENT] ${data}`
			});
		} catch (error: any) {
			this.sendMessage({
				command: 'error',
				message: `Send error: ${error?.message || error}`
			});
		}
	}

	private async saveToFile(content: string): Promise<void> {
		try {
			const uri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file('serial-monitor-output.txt'),
				filters: {
					'Text files': ['txt'],
					'All files': ['*']
				},
				saveLabel: 'Save'
			});

			if (uri) {
				const encoder = new TextEncoder();
				const data = encoder.encode(content);
				await vscode.workspace.fs.writeFile(uri, data);
				vscode.window.showInformationMessage(`Serial monitor output saved to ${uri.fsPath}`);
				this.sendMessage({
					command: 'info',
					message: `Saved to ${uri.fsPath}`
				});
			}
		} catch (error: any) {
			const errorMessage = `Failed to save file: ${error?.message || error}`;
			console.error('FancyMon: Save error:', errorMessage);
			vscode.window.showErrorMessage(errorMessage);
			this.sendMessage({
				command: 'error',
				message: errorMessage
			});
		}
	}

	private sendMessage(message: any): void {
		if (this.panel) {
			console.log('FancyMon: Sending message to webview:', message.command, JSON.stringify(message).substring(0, 100));
			this.panel.webview.postMessage(message);
		} else {
			console.log('FancyMon: Panel not ready, queuing message:', message.command);
			this.messageQueue.push(JSON.stringify(message));
		}
	}

	private getWebviewContent(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Serial Monitor</title>
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
	</style>
</head>
<body>
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

		<button id="connectBtn" class="success">Connect</button>
		<button id="disconnectBtn" class="danger" disabled>Disconnect</button>
		<button id="clearBtn">Clear</button>
	</div>

	<div class="controls-row">
		<div class="control-group">
			<label>Max Lines:</label>
			<input type="number" id="maxLines" value="10000" min="100" max="1000000" style="width: 100px;">
		</div>
		<div class="control-group">
			<label>Usage:</label>
			<span id="lineUsage" style="color: var(--vscode-descriptionForeground); font-size: 12px;">0% (0 / 10000)</span>
		</div>
		<button id="saveBtn">Save to File</button>
	</div>

	<div class="monitor" id="monitor"></div>

	<div class="send-area">
		<input type="text" id="sendInput" placeholder="Type message to send..." disabled>
		<button id="sendBtn" disabled>Send</button>
	</div>

	<div class="status" id="status">Disconnected</div>

	<script>
		const vscode = acquireVsCodeApi();
		
		let isConnected = false;
		let isDisconnecting = false;
		let isFollowing = true; // Auto-scroll to bottom by default
		let lastScrollTop = 0; // Track previous scroll position to detect scroll direction
		const monitor = document.getElementById('monitor');
		const portSelect = document.getElementById('portSelect');
		const baudRate = document.getElementById('baudRate');
		const customBaudRate = document.getElementById('customBaudRate');
		const dataBits = document.getElementById('dataBits');
		const stopBits = document.getElementById('stopBits');
		const parity = document.getElementById('parity');
		const connectBtn = document.getElementById('connectBtn');
		const disconnectBtn = document.getElementById('disconnectBtn');
		const clearBtn = document.getElementById('clearBtn');
		const sendInput = document.getElementById('sendInput');
		const sendBtn = document.getElementById('sendBtn');
		const refreshPorts = document.getElementById('refreshPorts');
		const status = document.getElementById('status');
		const maxLinesInput = document.getElementById('maxLines');
		const lineUsage = document.getElementById('lineUsage');
		const saveBtn = document.getElementById('saveBtn');
		
		let maxLines = 10000;
		let lineCount = 0;

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
			connectBtn.disabled = isConnected || isDisconnecting || !portSelect.value;
			disconnectBtn.disabled = !isConnected || isDisconnecting;
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

		function parseAnsi(text) {
			// ANSI escape sequence: ESC[ (0x1B)
			// Use String.fromCharCode to avoid escape sequence issues in template string
			const escChar = String.fromCharCode(0x1b);
			// Escape the bracket for regex, then build the pattern
			const ansiRegex = new RegExp(escChar + '\\\\[([0-9;]*)([a-zA-Z])', 'g');
			let lastIndex = 0;
			let result = '';
			let state = { ...currentAnsiState };
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

			// Update global state
			currentAnsiState = state;

			return result;
		}

		function isAtBottom() {
			// Check if scrolled to within 10 lines of the bottom
			// Calculate approximate line height from computed styles
			const computedStyle = window.getComputedStyle(monitor);
			const lineHeight = parseFloat(computedStyle.lineHeight) || parseFloat(computedStyle.fontSize) * 1.4;
			const linesThreshold = 10;
			const pixelThreshold = lineHeight * linesThreshold;
			
			const distanceFromBottom = monitor.scrollHeight - monitor.scrollTop - monitor.clientHeight;
			return distanceFromBottom <= pixelThreshold;
		}

		function countLines(text) {
			// Count newlines in text (approximate line count)
			return (text.match(/\\n/g) || []).length + (text.endsWith('\\n') ? 0 : 1);
		}

		function extractAnsiStateFromLastSpan() {
			// Extract ANSI state from the last span element in the monitor
			// This represents the state at the end of kept content (where new data continues)
			const allSpans = monitor.querySelectorAll('span');
			if (allSpans.length > 0) {
				const lastSpan = allSpans[allSpans.length - 1];
				const classes = lastSpan.className.split(' ');
				const state = {
					fg: null,
					bg: null,
					bold: false,
					dim: false,
					italic: false,
					underline: false
				};
				
				classes.forEach(cls => {
					if (cls.startsWith('ansi-')) {
						const colorName = cls.substring(5);
						if (colorName.startsWith('bright-')) {
							state.fg = 'ansi-bright-' + colorName.substring(7);
						} else if (['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'].includes(colorName)) {
							state.fg = 'ansi-' + colorName;
						} else if (colorName === 'bold') state.bold = true;
						else if (colorName === 'dim') state.dim = true;
						else if (colorName === 'italic') state.italic = true;
						else if (colorName === 'underline') state.underline = true;
					}
				});
				
				return state;
			}
			// Default: no ANSI state (reset)
			return { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
		}

		function trimOldLines() {
			// Count lines by counting newlines in text content
			const text = monitor.textContent || '';
			lineCount = (text.match(/\\n/g) || []).length + (text.endsWith('\\n') ? 0 : 1);
			
			if (lineCount > maxLines) {
				const linesToRemove = lineCount - maxLines;
				console.log('FancyMon: Trimming', linesToRemove, 'old lines (preserving ANSI state)');
				
				// Remove nodes from the start until we've removed enough lines
				const childNodes = Array.from(monitor.childNodes);
				let removedNewlines = 0;
				const nodesToRemove = [];
				
				for (const node of childNodes) {
					const nodeText = node.textContent || '';
					const nodeNewlines = (nodeText.match(/\\n/g) || []).length;
					
					if (removedNewlines + nodeNewlines <= linesToRemove) {
						nodesToRemove.push(node);
						removedNewlines += nodeNewlines;
						
						if (removedNewlines >= linesToRemove) {
							break;
						}
					} else {
						// This node contains the cut point - remove it too to be safe
						nodesToRemove.push(node);
						break;
					}
				}
				
				// Remove the nodes (this preserves ANSI state in remaining nodes)
				nodesToRemove.forEach(node => node.remove());
				
				// CRITICAL: Reset currentAnsiState to match the state at the end of kept content
				// This ensures new data continues with the correct ANSI state
				currentAnsiState = extractAnsiStateFromLastSpan();
				console.log('FancyMon: Reset ANSI state after trim:', currentAnsiState);
				
				// Recalculate line count
				const remainingText = monitor.textContent || '';
				lineCount = (remainingText.match(/\\n/g) || []).length + (remainingText.endsWith('\\n') ? 0 : 1);
				console.log('FancyMon: Trimmed to', lineCount, 'lines (ANSI state preserved)');
			}
		}

		function updateLineUsage() {
			const percent = maxLines > 0 ? Math.round((lineCount / maxLines) * 100) : 0;
			const color = percent > 90 ? 'var(--vscode-errorForeground)' : percent > 70 ? 'var(--vscode-warningForeground)' : 'var(--vscode-descriptionForeground)';
			lineUsage.textContent = percent + '% (' + lineCount.toLocaleString() + ' / ' + maxLines.toLocaleString() + ')';
			lineUsage.style.color = color;
		}

		function appendData(data) {
			// CRITICAL: Exit immediately if disconnecting - don't process any data
			if (isDisconnecting) {
				return; // Exit silently, don't process data during disconnect
			}
			
			// Parse ANSI codes and convert to HTML
			const html = parseAnsi(data);
			
			// Use more efficient DOM manipulation - append to a temporary element first
			// This avoids forcing a full HTML reparse of the entire monitor content
			const tempDiv = document.createElement('div');
			tempDiv.innerHTML = html;
			
			// Append the new content
			while (tempDiv.firstChild) {
				monitor.appendChild(tempDiv.firstChild);
			}
			
			// Count lines more efficiently - increment instead of recounting everything
			// Count newlines in new data (each newline = one new line)
			const newlineCount = (data.match(/\\n/g) || []).length;
			if (newlineCount > 0) {
				lineCount += newlineCount;
			}
			// If no newlines, it's continuing the current line, so don't increment
			
			// Trim old lines if we exceed max (only check periodically for performance)
			if (lineCount > maxLines) {
				trimOldLines();
			}
			
			// Update line usage less frequently for performance
			if (lineCount % 100 === 0 || lineCount > maxLines * 0.9) {
				updateLineUsage();
			}
			
			// Only auto-scroll if we're following (user hasn't scrolled up)
			if (isFollowing) {
				monitor.scrollTop = monitor.scrollHeight;
				lastScrollTop = monitor.scrollTop; // Update tracked position when auto-scrolling
			}
		}

		// Monitor scroll events to detect when user scrolls up/down
		monitor.addEventListener('scroll', () => {
			const currentScrollTop = monitor.scrollTop;
			const scrolledUp = currentScrollTop < lastScrollTop;
			const wasFollowing = isFollowing;
			
			// Only disable following if user scrolled UP and is not near bottom
			if (scrolledUp && !isAtBottom()) {
				isFollowing = false;
				if (wasFollowing) {
					console.log('FancyMon: Paused auto-scroll (user scrolled up)');
				}
			} else if (isAtBottom()) {
				// Enable following if within 10 lines of bottom
				isFollowing = true;
				if (!wasFollowing) {
					console.log('FancyMon: Resumed auto-scroll (scrolled to within 10 lines of bottom)');
				}
			}
			
			lastScrollTop = currentScrollTop;
		});

		function setStatus(message, type = '') {
			status.textContent = message;
			status.className = 'status ' + type;
		}

		refreshPorts.addEventListener('click', () => {
			vscode.postMessage({ command: 'listPorts' });
		});

		connectBtn.addEventListener('click', () => {
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
					parity: parity.value
				}
			});
		});

		disconnectBtn.addEventListener('click', () => {
			if (isDisconnecting) {
				return; // Prevent multiple clicks
			}
			isDisconnecting = true;
			disconnectBtn.disabled = true;
			vscode.postMessage({ command: 'disconnect' });
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
			monitor.innerHTML = '';
			lineCount = 0;
			currentAnsiState = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
			lastScrollTop = 0;
			isFollowing = true; // Reset to following mode after clear
			updateLineUsage();
			vscode.postMessage({ command: 'clear' });
		});

		maxLinesInput.addEventListener('change', () => {
			const newMax = parseInt(maxLinesInput.value) || 10000;
			if (newMax >= 100 && newMax <= 1000000) {
				maxLines = newMax;
				console.log('FancyMon: Max lines set to', maxLines);
				// Trim if current count exceeds new max
				if (lineCount > maxLines) {
					trimOldLines();
				}
				updateLineUsage();
			} else {
				maxLinesInput.value = maxLines.toString();
			}
		});

		saveBtn.addEventListener('click', () => {
			const content = monitor.textContent || '';
			if (content.trim().length === 0) {
				vscode.postMessage({ command: 'error', message: 'No data to save' });
				return;
			}
			vscode.postMessage({ command: 'save', content: content });
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
		window.addEventListener('message', event => {
			const message = event.data;
			
			switch (message.command) {
				case 'portsListed':
					console.log('FancyMon: Received ports list:', message.ports);
					console.log('FancyMon: Last config:', message.lastConfig);
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
							
							// Auto-connect if we have a valid configuration
							if (shouldAutoConnect && config.port && config.baudRate) {
								console.log('FancyMon: Auto-connecting with restored configuration...');
								setTimeout(() => {
									connectBtn.click();
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
					// Double-check we're not disconnecting before processing
					if (!isDisconnecting) {
						appendData(message.data);
					}
					break;
					
				case 'error':
					setStatus(message.message, 'error');
					break;
					
				case 'clear':
					monitor.innerHTML = '';
					lineCount = 0;
					currentAnsiState = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
					lastScrollTop = 0;
					isFollowing = true; // Reset to following mode after clear
					updateLineUsage();
					break;
			}
		});

		// Initialize maxLines from input field
		if (maxLinesInput) {
			maxLines = parseInt(maxLinesInput.value) || 10000;
		}
		updateLineUsage();
		
		// Initialize scroll tracking
		lastScrollTop = monitor.scrollTop;

		// Handle window resize to ensure monitor fills available space
		const resizeObserver = new ResizeObserver(() => {
			// If following, scroll to bottom after resize
			if (isFollowing) {
				monitor.scrollTop = monitor.scrollHeight;
				lastScrollTop = monitor.scrollTop;
			}
		});
		resizeObserver.observe(document.body);

		// Also listen to window resize events
		window.addEventListener('resize', () => {
			// If following, scroll to bottom after resize
			if (isFollowing) {
				monitor.scrollTop = monitor.scrollHeight;
				lastScrollTop = monitor.scrollTop;
			}
		});

		// Initial port list - wait a bit for the message handler to be ready
		setTimeout(() => {
			console.log('FancyMon: Webview loaded, requesting port list...');
			vscode.postMessage({ command: 'listPorts' });
			updateUI();
		}, 100);
	</script>
</body>
</html>`;
	}
}

