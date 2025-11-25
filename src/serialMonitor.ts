import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { applyFilter, type LineEntry } from './filter';
import { getWebviewContentHtml } from './webviewContent';
import { SerialConnection, type SerialConnectionCallbacks } from './serialConnection';

export interface SerialMonitorConfig {
	port: string;
	baudRate: number;
	dataBits: 7 | 8;
	stopBits: 1 | 2;
	parity: 'none' | 'even' | 'odd';
	maxLines?: number;
	lineWrapEnabled?: boolean;
}


export class SerialMonitor {
	public panel: vscode.WebviewPanel | null = null; // Made public for cleanup
	private messageQueue: string[] = [];
	private readonly configKey = 'fancymon.lastConfig';
	private readonly wrapStateKey = 'fancymon.lineWrapEnabled';
	private readonly messageHistoryKey = 'fancymon.messageHistory';
	public connection: SerialConnection; // Made public for external access

	constructor(private context: vscode.ExtensionContext) {
		// Set up connection with callbacks
		const callbacks: SerialConnectionCallbacks = {
			onData: (data: string) => {
				this.sendMessage({ command: 'data', data });
			},
			onError: (error: string) => {
				this.sendMessage({ command: 'error', message: error });
			},
			onClose: () => {
				this.sendMessage({ command: 'disconnected' });
			},
			onConnected: () => {
				this.sendMessage({ command: 'connected' });
			},
			onDisconnected: () => {
				this.sendMessage({ command: 'disconnected' });
			},
			onDisconnecting: (info) => {
				this.sendMessage({
					command: 'disconnecting',
					pendingBytes: info.pendingBytes,
					pendingChunks: info.pendingChunks,
					elapsedMs: info.elapsedMs
				});
			},
			onDebug: (message: string) => {
				this.sendMessage({ command: 'debug', message });
			}
		};
		this.connection = new SerialConnection(callbacks);
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
			this.connection.disconnect();
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
						console.log('FancyMon: Received connect command from webview!');
						console.log('FancyMon: Connect config:', JSON.stringify(message.config));
						await this.connect(message.config);
						break;
					case 'disconnect':
						await this.disconnect();
						break;
					case 'send':
						await this.connection.sendData(message.data);
						break;
					case 'sendReset':
						await this.connection.toggleDTRReset();
						break;
					case 'clear':
						this.sendMessage({ command: 'clear' });
						break;
					case 'save':
						await this.saveToFile(message.content);
						break;
					case 'updateConfig':
						// Update and save configuration (e.g., when maxLines or wrap state changes)
						const currentConfig = this.getLastConfig();
						const updatedConfig: SerialMonitorConfig = {
							...(currentConfig || {}),
							...message.config
						};
						this.saveConfig(updatedConfig);
						break;
					case 'updateWrapState':
						// Update wrap state in separate storage
						this.context.workspaceState.update(this.wrapStateKey, message.lineWrapEnabled);
						break;
					case 'updateMessageHistory':
						// Save message history
						if (message.history && Array.isArray(message.history)) {
							console.log('FancyMon: Saving message history:', message.history.length, 'items:', message.history);
							this.context.workspaceState.update(this.messageHistoryKey, [...message.history]); // Create a copy
						}
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

	public getLastConfig(): SerialMonitorConfig | null {
		const saved = this.context.workspaceState.get<SerialMonitorConfig>(this.configKey);
		return saved || null;
	}

	private saveConfig(config: SerialMonitorConfig): void {
		this.context.workspaceState.update(this.configKey, config);
	}

	private async listPorts(): Promise<void> {
		try {
			console.log('FancyMon: Listing serial ports...');
			const ports = await this.connection.listPorts();
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

			console.log('FancyMon: Ports:', ports);
			console.log('FancyMon: Last config:', lastConfig);
			
			// Get wrap state from separate storage (default to true if not set)
			const wrapState = this.context.workspaceState.get<boolean>(this.wrapStateKey) ?? true;
			
			// Get message history
			const messageHistory = this.context.workspaceState.get<string[]>(this.messageHistoryKey) || [];
			console.log('FancyMon: Loading message history from storage:', messageHistory.length, 'items:', messageHistory);
			
			this.sendMessage({
				command: 'portsListed',
				ports: ports,
				lastConfig: lastConfig,
				lineWrapEnabled: wrapState
			});
			
			// Send message history separately
			this.sendMessage({
				command: 'messageHistoryLoaded',
				history: [...messageHistory] // Create a copy
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

	public async connect(config: SerialMonitorConfig): Promise<void> {
		console.log('FancyMon: SerialMonitor.connect() called with config:', JSON.stringify(config));
		// Save the configuration for next time
		this.saveConfig(config);
		console.log('FancyMon: SerialMonitor calling connection.connect()...');
		try {
			await this.connection.connect(config);
			console.log('FancyMon: SerialMonitor connection.connect() completed');
		} catch (error: any) {
			console.error('FancyMon: SerialMonitor connection.connect() FAILED:', error);
			vscode.window.showErrorMessage(`FancyMon: Connection failed: ${error?.message || error}`).then(() => {});
			throw error;
		}
	}

	public async disconnect(reason?: string): Promise<void> {
		await this.connection.disconnect(reason);
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
			// Only log non-data messages to reduce console noise
			if (message.command !== 'data') {
				console.log('FancyMon: Sending message to webview:', message.command);
			}
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
