import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as util from 'util';
import * as os from 'os';
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
	private readonly includeFilterHistoryKey = 'fancymon.includeFilterHistory';
	private readonly excludeFilterHistoryKey = 'fancymon.excludeFilterHistory';
	private readonly timePatternHistoryKey = 'fancymon.timePatternHistory';
	private readonly timePatternValueKey = 'fancymon.timePatternValue';
	private readonly plotSessionsKey = 'fancymon.plotSessions';
	private readonly elfFileKey = 'fancymon.elfFile';
	public connection: SerialConnection; // Made public for external access

	constructor(private context: vscode.ExtensionContext) {
		// Set up connection with callbacks
		const callbacks: SerialConnectionCallbacks = {
			onData: (data: string) => {
				this.sendMessage({ command: 'data', data });
				this.resolveAddresses(data);
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
					case 'updateIncludeFilterHistory':
						// Save include filter history
						if (message.history && Array.isArray(message.history)) {
							console.log('FancyMon: Saving include filter history:', message.history.length, 'items:', message.history);
							this.context.workspaceState.update(this.includeFilterHistoryKey, [...message.history]); // Create a copy
						}
						break;
					case 'updateExcludeFilterHistory':
						// Save exclude filter history
						if (message.history && Array.isArray(message.history)) {
							console.log('FancyMon: Saving exclude filter history:', message.history.length, 'items:', message.history);
							this.context.workspaceState.update(this.excludeFilterHistoryKey, [...message.history]); // Create a copy
						}
						break;

					case 'updateTimePatternHistory':
						// Save time pattern history
						if (message.history && Array.isArray(message.history)) {
							this.context.workspaceState.update(this.timePatternHistoryKey, [...message.history]);
						}
						break;

					case 'updateTimePatternValue':
						// Save current time pattern value
						if (typeof message.value === 'string') {
							this.context.workspaceState.update(this.timePatternValueKey, message.value);
						}
						break;

					case 'savePlotSession':
						// Save a plot session
						if (message.session) {
							const sessions = this.context.workspaceState.get<any[]>(this.plotSessionsKey) || [];
							// Remove existing session with same variable list (if any)
							const variableListKey = message.session.variableList || '';
							const filtered = sessions.filter((s: any) => (s.variableList || '') !== variableListKey);
							// Add new session at the beginning
							filtered.unshift(message.session);
							// Keep only last 10 unique sessions
							const unique = [];
							const seen = new Set<string>();
							for (const session of filtered) {
								const key = session.variableList || '';
								if (key && !seen.has(key)) {
									seen.add(key);
									unique.push(session);
									if (unique.length >= 10) {
										break;
									}
								}
							}
							this.context.workspaceState.update(this.plotSessionsKey, unique);
						}
						break;

					case 'loadPlotSessions':
						// Load all plot sessions
						const sessions = this.context.workspaceState.get<any[]>(this.plotSessionsKey) || [];
						this.sendMessage({
							command: 'plotSessionsLoaded',
							sessions: sessions
						});
						break;

					case 'selectElfFile':
						const uris = await vscode.window.showOpenDialog({
							canSelectFiles: true,
							canSelectFolders: false,
							canSelectMany: false,
							filters: {
								'ELF Files': ['elf'],
								'All Files': ['*']
							}
						});
						
						if (uris && uris.length > 0) {
							const uri = uris[0];
							const fsPath = uri.fsPath;
							const name = path.basename(fsPath);
							
							try {
								const stats = fs.statSync(fsPath);
								const elfInfo = {
									path: fsPath,
									name: name,
									date: stats.mtime.toISOString()
								};
								
								// Save to workspace state
								await this.context.workspaceState.update(this.elfFileKey, elfInfo);
								
								// Send to webview
								this.sendMessage({ 
									command: 'setElfFile', 
									path: elfInfo.path, 
									name: elfInfo.name, 
									date: elfInfo.date 
								});
							} catch (e) {
								console.error('Error getting file stats:', e);
							}
						}
						break;

					case 'clearElfFile':
						// Clear workspace state
						await this.context.workspaceState.update(this.elfFileKey, undefined);
						
						// Send empty info to webview
						this.sendMessage({ 
							command: 'setElfFile', 
							path: null, 
							name: null, 
							date: null 
						});
						break;

					case 'testBacktrace':
						const testData = `I [2025-11-26 00:01:47.769](61403) SYSTEM:               [1:          sleep] ending put_playback_manager_to_sleep
I [2025-11-26 00:01:47.770](61404) BATT:                 [1:          sleep] Starting battery read sleep
DEBUG: Panic handler called, is_stack_overflow = 0
DEBUG: Overwriting with panic info
assert failed: xTaskPriorityDisinherit tasks.c:5107 (pxTCB == pxCurrentTCBs[ xPortGetCoreID() ])
Backtrace: 0x4037602e:0x3fcb64b0 0x40387ee9:0x3fcb64d0 0x4038cbe1:0x3fcb64f0 0x421daa35:0x3fcb6610 0x403884c3:0x3fcb6630 0x421d8d39:0x3fcb6650 0x4037765b:0x3fcb6690 0x42132eab:0x3fcb66c0 0x4213be8a:0x3fcb66f0 0x42038866:0x3fcb6720 0x4200e3d3:0x3fcb6860 0x42057ca7:0x3fcb6880 0x420585fb:0x3fcb68d0
ELF file SHA256: aee993fcf7b22503
Rebooting...
GPIO10 level: 1, OUT_EN: 0, IN_EN: 1, PU: 1, PD: 0, global_hold: 0, slp_sel: -1
I (696) cpu_start: Multicore app
I (697) octal_psram: vendor id    : 0x0d (AP)
I (697) octal_psram: dev id       : 0x02 (generation 3)
I (697) octal_psram: density      : 0x03 (64 Mbit)
I (697) octal_psram: good-die     : 0x01 (Pass)
`;
						console.log('FancyMon: Simulating test backtrace data...');
						this.simulateData(testData);
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
			
			// Get filter histories
			const includeFilterHistory = this.context.workspaceState.get<string[]>(this.includeFilterHistoryKey) || [];
			const excludeFilterHistory = this.context.workspaceState.get<string[]>(this.excludeFilterHistoryKey) || [];
			console.log('FancyMon: Loading include filter history:', includeFilterHistory.length, 'items:', includeFilterHistory);
			console.log('FancyMon: Loading exclude filter history:', excludeFilterHistory.length, 'items:', excludeFilterHistory);
			
			// Get time pattern state
			const timePatternHistory = this.context.workspaceState.get<string[]>(this.timePatternHistoryKey) || [];
			const timePatternValue = this.context.workspaceState.get<string>(this.timePatternValueKey);
			
			// Get plot sessions
			const plotSessions = this.context.workspaceState.get<any[]>(this.plotSessionsKey) || [];
			
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
			
			// Send filter histories separately
			this.sendMessage({
				command: 'includeFilterHistoryLoaded',
				history: [...includeFilterHistory] // Create a copy
			});
			
			this.sendMessage({
				command: 'excludeFilterHistoryLoaded',
				history: [...excludeFilterHistory] // Create a copy
			});

			// Send time pattern state
			this.sendMessage({
				command: 'timePatternHistoryLoaded',
				history: [...timePatternHistory]
			});

			this.sendMessage({
				command: 'timePatternValueLoaded',
				value: timePatternValue ?? ''
			});

			// Send plot sessions
			this.sendMessage({
				command: 'plotSessionsLoaded',
				sessions: [...plotSessions]
			});

			// Restore ELF file
			const savedElf = this.context.workspaceState.get<any>(this.elfFileKey);
			if (savedElf) {
				// Check if file still exists/update stats
				try {
					if (fs.existsSync(savedElf.path)) {
						const stats = fs.statSync(savedElf.path);
						savedElf.date = stats.mtime.toISOString(); // Update date
						// Update state in background
						this.context.workspaceState.update(this.elfFileKey, savedElf);
					}
				} catch (e) {
					// Ignore error, use saved date
				}
				
				this.sendMessage({ 
					command: 'setElfFile', 
					path: savedElf.path, 
					name: savedElf.name, 
					date: savedElf.date 
				});
			}
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

	public simulateData(data: string): void {
		this.sendMessage({ command: 'data', data });
		this.resolveAddresses(data);
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

	/**
	 * Tries to find the ESP-IDF toolchain bin directory.
	 * Search order:
	 * 1. fancymon.toolchainPath configuration setting
	 * 2. Common default locations in ~/.espressif
	 */
	private findToolchainBinPath(): string | null {
		// 1. Check configuration
		const config = vscode.workspace.getConfiguration('fancymon');
		const configPath = config.get<string>('toolchainPath');
		if (configPath && fs.existsSync(configPath)) {
			return configPath;
		}

		// 2. Auto-discovery in ~/.espressif
		try {
			const homeDir = os.homedir();
			const espressifDir = path.join(homeDir, '.espressif', 'tools');
			
			if (!fs.existsSync(espressifDir)) {
				return null;
			}

			// Recursive search helper for bin directories containing addr2line
			const findBinWithTool = (dir: string, toolName: string, depth: number = 0): string | null => {
				if (depth > 5) { return null; } // Limit depth
				
				try {
					const items = fs.readdirSync(dir);
					
					// Check if current dir has bin/toolName
					if (items.includes('bin')) {
						const binPath = path.join(dir, 'bin');
						if (fs.existsSync(path.join(binPath, toolName))) {
							return binPath;
						}
					}
					
					// Check subdirectories
					for (const item of items) {
						const fullPath = path.join(dir, item);
						if (fs.statSync(fullPath).isDirectory() && !item.startsWith('.')) {
							const found = findBinWithTool(fullPath, toolName, depth + 1);
							if (found) { return found; }
						}
					}
				} catch (e) {
					// Ignore access errors
				}
				return null;
			};

			// Try to find specific tools
			const toolNames = [
				'xtensa-esp32s3-elf-addr2line.exe', // Windows
				'xtensa-esp32s3-elf-addr2line',     // Linux/Mac
				'xtensa-esp32-elf-addr2line.exe',
				'xtensa-esp32-elf-addr2line'
			];

			for (const toolName of toolNames) {
				const found = findBinWithTool(espressifDir, toolName);
				if (found) {
					return found;
				}
			}

		} catch (e) {
			console.error('Error during toolchain discovery:', e);
		}

		return null;
	}

	private async resolveAddresses(data: string): Promise<void> {
		const elfFile = this.context.workspaceState.get<any>(this.elfFileKey);
		if (!elfFile || !fs.existsSync(elfFile.path)) {
			return;
		}

		// Regex for 8-digit hex addresses (0x40xxxxxx or 0x42xxxxxx or 0x3fxxxxxx)
		const hexRegex = /0x[0-9a-fA-F]{8}/g;
		const matches = data.match(hexRegex);
		
		if (!matches || matches.length === 0) {
			return;
		}

		// Filter unique addresses to avoid duplicate lookups in the same chunk
		const addresses = [...new Set(matches)];
		
		// Try common toolchain names
		const tools = [
			'xtensa-esp32s3-elf-addr2line',
			'xtensa-esp32-elf-addr2line',
			'riscv32-esp-elf-addr2line',
			'addr2line'
		];

		// Find toolchain path
		const toolchainPath = this.findToolchainBinPath();

		const tryRunAddr2Line = async (toolIndex: number): Promise<string> => {
			if (toolIndex >= tools.length) {
				return '';
			}
			
			let tool = tools[toolIndex];
			// If we found a toolchain path, prepend it (unless on Windows where we might need .exe)
			if (toolchainPath) {
				const toolWithExt = process.platform === 'win32' && !tool.endsWith('.exe') ? tool + '.exe' : tool;
				const fullPath = path.join(toolchainPath, toolWithExt);
				if (fs.existsSync(fullPath)) {
					tool = fullPath;
				}
			}
			
			const args = ['-e', elfFile.path, '-f', '-C', '-a', ...addresses];
			
			return new Promise<string>((resolve) => {
				const child = cp.spawn(tool, args);
				let output = '';

				child.stdout.on('data', (d) => { output += d.toString(); });

				child.on('error', (err) => {
					resolve(tryRunAddr2Line(toolIndex + 1));
				});

				child.on('close', (code) => {
					if (code === 0 && output.trim().length > 0) {
						resolve(output);
					} else {
						resolve(tryRunAddr2Line(toolIndex + 1));
					}
				});
			});
		};

		try {
			const output = await tryRunAddr2Line(0);
			if (output) {
				this.processAddr2LineOutput(output);
			}
		} catch (e) {
			console.error('FancyMon: Error resolving addresses:', e);
		}
	}

	private processAddr2LineOutput(output: string): void {
		// Output format with -a:
		// 0xaddress
		// function_name
		// file_path:line
		const lines = output.trim().split(/\r?\n/);
		let i = 0;
		while (i < lines.length) {
			const addrLine = lines[i++].trim();
			if (!addrLine.startsWith('0x')) {
				continue; // Should verify address format
			}
			
			if (i >= lines.length) {
				break;
			}
			const funcName = lines[i++].trim();
			
			if (i >= lines.length) {
				break;
			}
			const fileLine = lines[i++].trim();

			// Filter out useless results
			if (funcName === '??' || fileLine.startsWith('??')) {
				continue;
			}

			// Format the output line
			// --- 0x4037602e: panic_abort at C:/.../panic.c:466
			const formattedLine = `--- ${addrLine}: ${funcName} at ${fileLine}`;
			
			// Send to webview
			this.sendMessage({ command: 'data', data: formattedLine + '\n' });
		}
	}

	private getWebviewContent(): string {
		return getWebviewContentHtml(this.panel?.webview.cspSource || '');
	}
}

