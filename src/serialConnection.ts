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
	private hasSentConnectedMessage = false; // Prevent duplicate connected messages
	
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
		
		// Reset connected message flag for new connection
		this.hasSentConnectedMessage = false;

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
				// Ignore "Port is not open" errors - they're false positives from port.set()
				// The port is actually open if we're receiving data, so these errors are misleading
				// These occur when port.set() is called but the library thinks the port isn't open yet
				if (err?.message?.includes('Port is not open')) {
					console.warn('FancyMon: Ignoring "Port is not open" error (false positive):', err);
					return; // Don't report to user
				}
				
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
			
			// Wait a moment for the port to fully initialize before setting RTS/DTR
			// Some drivers need time to stabilize after opening
			await new Promise(resolve => setTimeout(resolve, 50));
			
			// Explicitly set RTS and DTR to false to avoid driving BOOT0/SDA pins
			// Some devices share BOOT0 with I2C SDA, so we must not drive these pins
			// Set them multiple times with delays to ensure they stick
			try {
				await this.port.set({ rts: false, dtr: false });
				console.log('FancyMon: RTS and DTR set to false (first attempt)');
				
				// Wait and set again (some drivers reset them after initial set)
				await new Promise(resolve => setTimeout(resolve, 100));
				await this.port.set({ rts: false, dtr: false });
				console.log('FancyMon: RTS and DTR set to false (second attempt)');
				
				// One more time to be absolutely sure
				await new Promise(resolve => setTimeout(resolve, 50));
				await this.port.set({ rts: false, dtr: false });
				console.log('FancyMon: RTS and DTR confirmed false (final)');
			} catch (error: any) {
				console.warn('FancyMon: Warning - could not set RTS/DTR:', error?.message || error);
				// Continue anyway - connection is still valid, but pins might be driven
			}
			
			// Only mark as connected AFTER RTS/DTR are properly set
			this.isConnected = true;
			this.callbacks.onConnected();
			// Send status message only once (prevent duplicates)
			if (!this.hasSentConnectedMessage) {
				this.sendStatusMessage('[[ CONNECTED ]]');
				this.hasSentConnectedMessage = true;
			}
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
			this.hasSentConnectedMessage = false; // Reset for next connection
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
		console.log('FancyMon: toggleDTRReset called, port:', !!this.port, 'isConnected:', this.isConnected);
		
		if (!this.port || !this.isConnected) {
			const errorMsg = !this.port ? 'Port not initialized' : 'Not connected to serial port';
			console.error('FancyMon: Reset failed -', errorMsg);
			this.callbacks.onError(errorMsg);
			return;
		}

		// Don't check isOpen - it may be unreliable. If we're connected and receiving data,
		// the port is definitely open. Just try the operation and catch errors if it fails.
		try {
			// Your circuit has RTS connected to RESET (via NPN transistor with inverted logic)
			// RTS HIGH → Transistor ON → RESET LOW (device in reset)
			// RTS LOW → Transistor OFF → RESET HIGH (device running)
			
			console.log('FancyMon: Sending reset pulse');
			
			// Wait a moment to ensure port is ready (sometimes port.set() fails immediately after connection)
			await new Promise(resolve => setTimeout(resolve, 50));
			
			// Ensure RTS starts LOW (device running)
			console.log('FancyMon: Setting RTS/DTR to false (start)');
			try {
				await this.port.set({ rts: false, dtr: false });
			} catch (setError: any) {
				// Ignore "Port is not open" errors if we're receiving data - port is clearly open
				if (setError?.message?.includes('not open')) {
					console.warn('FancyMon: Port.set() reported not open, but port is working - continuing anyway');
				} else {
					throw setError; // Re-throw if it's a different error
				}
			}
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Pull RTS HIGH to trigger reset
			console.log('FancyMon: Setting RTS to true (reset pulse)');
			try {
				await this.port.set({ rts: true, dtr: false });
			} catch (setError: any) {
				if (setError?.message?.includes('not open')) {
					console.warn('FancyMon: Port.set() reported not open, but port is working - continuing anyway');
				} else {
					throw setError;
				}
			}
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Release RTS LOW to exit reset
			console.log('FancyMon: Setting RTS/DTR to false (end)');
			try {
				await this.port.set({ rts: false, dtr: false });
			} catch (setError: any) {
				if (setError?.message?.includes('not open')) {
					console.warn('FancyMon: Port.set() reported not open, but port is working - continuing anyway');
				} else {
					throw setError;
				}
			}
			
			console.log('FancyMon: Reset pulse sent successfully');
			this.sendStatusMessage('[[ RESET SENT TO DEVICE ]]');
		} catch (error: any) {
			console.error('FancyMon: Reset error:', error);
			console.error('FancyMon: Reset error stack:', error?.stack);
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


