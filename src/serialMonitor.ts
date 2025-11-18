import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface SerialMonitorConfig {
	port: string;
	baudRate: number;
	dataBits: 7 | 8;
	stopBits: 1 | 2;
	parity: 'none' | 'even' | 'odd';
	maxLines?: number;
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
					],
					enableCommandUris: true
				}
			);
			console.log('FancyMon: Webview panel created');

			const htmlContent = this.getWebviewContent();
			console.log('FancyMon: HTML content generated, length:', htmlContent.length);
			console.log('FancyMon: HTML contains script tag:', htmlContent.includes('<script>'));
			console.log('FancyMon: HTML contains status element:', htmlContent.includes('id="status"'));
			
			// Debug: Log the script section to find syntax errors
			const scriptStart = htmlContent.indexOf('<script>');
			const scriptEnd = htmlContent.indexOf('</script>', scriptStart);
			if (scriptStart !== -1 && scriptEnd !== -1) {
				const scriptContent = htmlContent.substring(scriptStart + 8, scriptEnd);
				const scriptLines = scriptContent.split('\n');
				console.log('FancyMon: Script has', scriptLines.length, 'lines');
				if (scriptLines.length >= 1060) {
					console.log('FancyMon: Line 1060:', scriptLines[1059]);
					console.log('FancyMon: Line 1059:', scriptLines[1058]);
					console.log('FancyMon: Line 1061:', scriptLines[1060]);
				}
			}
			
			this.panel.webview.html = htmlContent;
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
					case 'updateConfig':
						// Update and save configuration (e.g., when maxLines changes)
						const currentConfig = this.getLastConfig();
						const updatedConfig: SerialMonitorConfig = {
							...(currentConfig || {}),
							...message.config
						};
						this.saveConfig(updatedConfig);
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
		// Use VS Code's CSP source for script nonce (VS Code handles CSP automatically)
		const cspSource = this.panel?.webview.cspSource || '';
		// Extract nonce from cspSource (it's usually in format like "vscode-webview://...")
		// VS Code expects the nonce to match what it generates
		const nonce = cspSource || '';
		
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

		.line {
			display: block;
			white-space: pre-wrap;
			word-break: break-word;
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

	<div class="monitor" id="monitor">
		<div class="scrollbar-indicator" id="scrollbarIndicator"></div>
	</div>

	<div class="send-area">
		<input type="text" id="sendInput" placeholder="Type message to send..." disabled>
		<button id="sendBtn" disabled>Send</button>
	</div>

	<div class="status" id="status">Disconnected</div>

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
		const connectBtn = document.getElementById('connectBtn');
		const disconnectBtn = document.getElementById('disconnectBtn');
		const clearBtn = document.getElementById('clearBtn');
		const sendInput = document.getElementById('sendInput');
		const sendBtn = document.getElementById('sendBtn');
		const refreshPorts = document.getElementById('refreshPorts');
		// status already declared above
		const maxLinesInput = document.getElementById('maxLines');
		const lineUsage = document.getElementById('lineUsage');
		const saveBtn = document.getElementById('saveBtn');
		const scrollbarIndicator = document.getElementById('scrollbarIndicator');
		
		let maxLines = 10000;
		let lineCount = 0;
		let totalTrimmedLines = 0;
		let isFrozenView = false;
		let frozenAnchorLine = null;
		let frozenAnchorOffset = 0;
		let anchorLostScrollTop = null; // Track scroll position when anchor was lost
		
		// Raw text storage - stores lines as strings with ANSI codes preserved
		let rawLines = [];
		let filterPattern = ''; // For future filtering feature
		const newlineChar = String.fromCharCode(10);

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
			if (rawLines.length > maxLines) {
				const linesToRemove = rawLines.length - maxLines;
				
				// Remove old lines from the start
				rawLines.splice(0, linesToRemove);
				lineCount = rawLines.length;
				totalTrimmedLines += linesToRemove;
				
				// Don't render here - let appendData() handle rendering based on frozen state
			}
		}

		function updateLineUsage() {
			const percent = maxLines > 0 ? Math.round((lineCount / maxLines) * 100) : 0;
			const color = percent > 90 ? 'var(--vscode-errorForeground)' : percent > 70 ? 'var(--vscode-warningForeground)' : 'var(--vscode-descriptionForeground)';
			lineUsage.textContent = percent + '% (' + lineCount.toLocaleString() + ' / ' + maxLines.toLocaleString() + ')';
			lineUsage.style.color = color;
		}

		// Buffer for incomplete lines (data that doesn't end with newline)
		let lineBuffer = '';
		
		function appendData(data) {
			// CRITICAL: Exit immediately if disconnecting - don't process any data
			if (isDisconnecting) {
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
				rawLines.push(line + newlineChar);
				lineCount++;
			}
			
			// Trim old lines if we exceed max
			if (lineCount > maxLines) {
				trimOldLines();
			}
			
			// Update usage whenever new complete lines arrive (or when near limit)
			if (linesAdded > 0 || lineCount > maxLines * 0.9) {
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
			
			// Re-render all lines (including buffer if it exists)
			renderLinesWithBuffer();
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
			
			// Filter lines if filter pattern is set (for future filtering feature)
			let lineEntries = rawLines.map((line, idx) => ({
				text: line,
				lineNumber: totalTrimmedLines + idx + 1,
				isBuffer: false
			}));
			
			// Add incomplete buffer line if it exists (for live display)
			if (lineBuffer) {
				lineEntries = [...lineEntries, { text: lineBuffer, lineNumber: null, isBuffer: true }];
			}
			
			if (filterPattern) {
				// Remove ANSI codes for filtering (simple approach - just check if pattern exists in plain text)
				// Use character code escape sequence in regex pattern string
				const pattern = '\\\\x1b\\\\[[0-9;]*[a-zA-Z]';
				const ansiRegex = new RegExp(pattern, 'g');
				lineEntries = lineEntries.filter(entry => {
					const plainText = entry.text.replace(ansiRegex, '');
					return plainText.includes(filterPattern);
				});
			}
			
			// Convert raw text lines to HTML, maintaining ANSI state across lines
			let html = '';
			let state = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
			
			for (const entry of lineEntries) {
				const textForDisplay = entry.text.endsWith(newlineChar) ? entry.text.slice(0, -1) : entry.text;
				const result = parseAnsi(textForDisplay, state);
				if (entry.lineNumber !== null && entry.lineNumber !== undefined) {
					html += '<div class="line" data-line="' + entry.lineNumber + '">' + result.html + '</div>';
				} else {
					html += '<div class="line line-buffer">' + result.html + '</div>';
				}
				state = result.finalState; // Maintain state across lines
			}
			
			// Update the monitor with rendered HTML
			monitor.innerHTML = html;
			
			// Restore scroll position based on follow state
			if (shouldStickToBottom) {
				monitor.scrollTop = monitor.scrollHeight;
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
							renderLinesWithBuffer();
						}
					}
					
					lastScrollTop = currentScrollTop;
				}
				monitor.addEventListener('scroll', handleScroll);
			} catch (e) {
				console.error('FancyMon: Error setting up scroll listener:', e);
			}
		}

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
					parity: parity.value,
					maxLines: maxLines
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
			rawLines = [];
			lineBuffer = '';
			lineCount = 0;
			totalTrimmedLines = 0;
			currentAnsiState = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
			monitor.innerHTML = '';
			lastScrollTop = 0;
			isFollowing = true; // Reset to following mode after clear
			unfreezeView();
			updateLineUsage();
			vscode.postMessage({ command: 'clear' });
		});

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
					} else {
						console.log('FancyMon: Ignoring data - disconnecting');
					}
					break;
					
				case 'error':
					setStatus(message.message, 'error');
					break;
					
				case 'clear':
					rawLines = [];
					lineBuffer = '';
					lineCount = 0;
					currentAnsiState = { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false };
					monitor.innerHTML = '';
					lastScrollTop = 0;
					isFollowing = true; // Reset to following mode after clear
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
					monitor.scrollTop = monitor.scrollHeight;
					lastScrollTop = monitor.scrollTop;
				}
			});
			resizeObserver.observe(document.body);

			// Also listen to window resize events
			window.addEventListener('resize', () => {
				// If following, scroll to bottom after resize
				if (isFollowing && monitor) {
					monitor.scrollTop = monitor.scrollHeight;
					lastScrollTop = monitor.scrollTop;
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
}

