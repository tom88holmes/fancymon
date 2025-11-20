import type { SerialMonitorConfig } from './serialMonitor';

type SerialPortType = any; // Will be the SerialPort type from serialport module

export interface SerialConnectionCallbacks {
	onData: (data: string) => void;
	onError: (error: string) => void;
	onClose: () => void;
	onConnected: () => void;
	onDisconnected: () => void;
	onDisconnecting: (info: { pendingBytes: number; pendingChunks: number; elapsedMs: number }) => void;
}

export class SerialConnection {
	private port: SerialPortType | null = null;
	private isConnected = false;
	private isDisconnecting = false;
	private serialportModule: any = null;
	
	// Event handlers stored for cleanup
	private dataHandler: ((data: Buffer) => void) | null = null;
	private errorHandler: ((err: any) => void) | null = null;
	private closeHandler: (() => void) | null = null;
	
	// State flags
	private shouldProcessData = true;
	private pendingDataBytes = 0;
	private pendingDataChunks = 0;
	private disconnectStartTime = 0;
	private lastDataReceivedTime = 0;

	constructor(private callbacks: SerialConnectionCallbacks) {}

	private formatTimestamp(): string {
		const now = new Date();
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		const seconds = String(now.getSeconds()).padStart(2, '0');
		const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
		return `${hours}:${minutes}:${seconds}.${milliseconds}`;
	}

	private sendStatusMessage(message: string): void {
		const timestamp = this.formatTimestamp();
		this.callbacks.onData(`[${timestamp}] ${message}\n`);
	}

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

	get connected(): boolean {
		return this.isConnected;
	}

	async connect(config: SerialMonitorConfig): Promise<void> {
		if (this.isConnected) {
			await this.disconnect();
		}

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
				
				// Process the data (removed verbose logging for performance)
				this.callbacks.onData(data.toString());
			};

			this.errorHandler = (err: any) => {
				console.error('FancyMon: Serial port error:', err);
				if (this.isConnected) { // Only process errors if still connected
					this.callbacks.onError(`Serial port error: ${err?.message || err}`);
				}
			};

			this.closeHandler = () => {
				console.log('FancyMon: Port closed');
				this.isConnected = false;
				this.callbacks.onDisconnected();
			};

			this.port.on('data', this.dataHandler);
			this.port.on('error', this.errorHandler);
			this.port.on('close', this.closeHandler);

			// Open the port (promise-based in v11)
			await this.port.open();
			console.log('FancyMon: Port opened successfully');
			
			// Explicitly set RTS and DTR to false to avoid driving BOOT0/SDA pins
			// Some devices share BOOT0 with I2C SDA, so we must not drive these pins
			try {
				await this.port.set({ rts: false, dtr: false });
				console.log('FancyMon: RTS and DTR set to false (not driven)');
			} catch (error: any) {
				console.warn('FancyMon: Warning - could not set RTS/DTR:', error?.message || error);
				// Continue anyway - connection is still valid
			}
			
			this.isConnected = true;
			this.sendStatusMessage('[[ CONNECTED ]]');
			this.callbacks.onConnected();
		} catch (error: any) {
			this.callbacks.onError(`Connection error: ${error?.message || error}`);
			this.isConnected = false;
			if (this.port) {
				this.port = null;
			}
		}
	}

	async disconnect(): Promise<void> {
		// Prevent multiple simultaneous disconnect calls
		if (this.isDisconnecting) {
			console.log('FancyMon: Disconnect already in progress, ignoring');
			return;
		}
		
		if (this.port) {
			// Send disconnect message FIRST, before any flags are set that would block it
			// This must happen before onDisconnecting() which sets isDisconnecting in the webview
			this.sendStatusMessage('[[ DISCONNECTED ]]');
			
			this.isDisconnecting = true;
			this.disconnectStartTime = Date.now();
			this.pendingDataBytes = 0;
			this.pendingDataChunks = 0;
			const portToClose = this.port; // Store reference before clearing
			
			// CRITICAL: Stop processing data IMMEDIATELY - this must be first!
			this.shouldProcessData = false;
			this.isConnected = false;
			
			console.log('FancyMon: Disconnect started - data processing stopped immediately');
			this.callbacks.onDisconnecting({ 
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
			this.callbacks.onDisconnected();
			this.isDisconnecting = false;
		} else {
			this.shouldProcessData = false;
			this.isConnected = false;
			this.sendStatusMessage('[[ DISCONNECTED ]]');
			this.callbacks.onDisconnected();
		}
	}

	async sendData(data: string): Promise<void> {
		if (!this.port || !this.isConnected) {
			this.callbacks.onError('Not connected to serial port');
			return;
		}

		try {
			await this.port.write(data);
			// Echo sent data to monitor
			this.callbacks.onData(`[SENT] ${data}`);
		} catch (error: any) {
			this.callbacks.onError(`Send error: ${error?.message || error}`);
		}
	}

	async toggleDTRReset(): Promise<void> {
		if (!this.port || !this.isConnected) {
			this.callbacks.onError('Not connected to serial port');
			return;
		}

		try {
			// Your circuit has RTS connected to RESET (via NPN transistor with inverted logic)
			// RTS HIGH → Transistor ON → RESET LOW (device in reset)
			// RTS LOW → Transistor OFF → RESET HIGH (device running)
			
			console.log('FancyMon: Sending reset pulse');
			
			// Ensure RTS starts LOW (device running)
			await this.port.set({ rts: false, dtr: false });
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Pull RTS HIGH to trigger reset
			await this.port.set({ rts: true, dtr: false });
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Release RTS LOW to exit reset
			await this.port.set({ rts: false, dtr: false });
			
			console.log('FancyMon: Reset pulse sent');
			this.sendStatusMessage('[[ RESET SENT TO DEVICE ]]');
		} catch (error: any) {
			console.error('FancyMon: Reset error:', error);
			this.callbacks.onError(`Reset error: ${error?.message || error}`);
		}
	}

	async listPorts(): Promise<Array<{ path: string; manufacturer: string; vendorId?: string; productId?: string }>> {
		const serialport = await this.getSerialPort();
		console.log('FancyMon: SerialPort module loaded, calling list()...');
		const ports = await serialport.SerialPort.list();
		console.log(`FancyMon: Found ${ports.length} ports`);

		if (ports.length === 0) {
			return [];
		}

		return ports.map((p: any) => ({
			path: p.path,
			manufacturer: p.manufacturer || 'Unknown',
			vendorId: p.vendorId,
			productId: p.productId
		}));
	}
}

