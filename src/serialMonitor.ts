import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { applyFilter, type LineEntry } from './filter';
import { getWebviewContentHtml } from './webviewContent';

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
		return getWebviewContentHtml(this.panel?.webview.cspSource || '');
	}
}
