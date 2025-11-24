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

		// Store port reference for cleanup in case of failure
		let portForCleanup: SerialPortType | null = null;

		try {
			const serialport = await this.getSerialPort();
			
			// Create port object - even with autoOpen: false, this might create a handle
			// So we MUST ensure it's destroyed if connection fails
			this.port = new serialport.SerialPort({
				path: config.port,
				baudRate: config.baudRate,
				dataBits: config.dataBits,
				stopBits: config.stopBits,
				parity: config.parity,
				autoOpen: false
			});
			
			// Store reference for cleanup in case of failure
			portForCleanup = this.port;

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
				
				// Check for port access conflicts (another process trying to use the port)
				// This often happens when ESP-IDF flash tries to access the port
				const errorMsg = err?.message?.toLowerCase() || '';
				if (this.isConnected && (
					errorMsg.includes('access denied') || 
					errorMsg.includes('cannot open') ||
					errorMsg.includes('being used by another process') ||
					errorMsg.includes('permission denied') ||
					errorMsg.includes('ebusy') ||
					errorMsg.includes('eacces')
				)) {
					console.log('FancyMon: Port access conflict detected (likely ESP-IDF flash), auto-disconnecting...');
					// Auto-disconnect to allow other process (like ESP-IDF flash) to use the port
					this.disconnect().catch(e => console.error('FancyMon: Auto-disconnect error:', e));
					return;
				}
				
				console.error('FancyMon: Serial port error:', err);
				if (this.isConnected) { // Only process errors if still connected
					this.callbacks.onError(`Serial port error: ${err?.message || err}`);
				}
			};

			this.closeHandler = () => {
				console.log('FancyMon: Port closed event received');
				this.isConnected = false;
				// Don't call onDisconnected here - let disconnect() handle it
				// This prevents duplicate disconnect messages
			};

			this.port.on('data', this.dataHandler);
			this.port.on('error', this.errorHandler);
			this.port.on('close', this.closeHandler);

			// Open the port with timeout to prevent hanging if port is already in use
			// Wrap port.open() in a race with a timeout
			const openTimeout = 3000; // 3 second timeout
			const openPromise = this.port.open();
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => {
					reject(new Error(`Port open timed out after ${openTimeout}ms. The port may be in use by another application.`));
				}, openTimeout);
			});
			
			try {
				await Promise.race([openPromise, timeoutPromise]);
				console.log('FancyMon: Port opened successfully');
			} catch (openError: any) {
				// Clean up the port object if open failed
				if (this.port) {
					try {
						// Try to close if it partially opened
						if (this.port.isOpen) {
							await this.port.close();
						}
					} catch (closeError) {
						// Ignore close errors
					}
					this.port = null;
				}
				
				// Check for common "port in use" error messages
				const errorMsg = openError?.message || String(openError);
				if (errorMsg.includes('Access denied') || 
				    errorMsg.includes('cannot open') || 
				    errorMsg.includes('already in use') ||
				    errorMsg.includes('being used by another process') ||
				    errorMsg.includes('Permission denied') ||
				    errorMsg.includes('EBUSY') ||
				    errorMsg.includes('EACCES') ||
				    errorMsg.includes('failed to open')) {
					throw new Error(`Port ${config.port} is already in use by another application. Please close the other application and try again.`);
				}
				throw openError; // Re-throw if it's a different error
			}
			
			// Wait a moment for the port to fully initialize before setting RTS/DTR
			// Some drivers need time to stabilize after opening
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// CRITICAL: Verify port is actually open and accessible
			// If port.open() resolved but port is actually in use, operations will fail
			if (!this.port) {
				throw new Error(`Port ${config.port} object is null after opening.`);
			}
			
			// Set up a flag to detect if an error occurs during initialization
			let initializationFailed = false;
			const originalErrorHandler = this.errorHandler;
			const errorCheckTimeout = setTimeout(() => {
				// After 200ms, if no error occurred, assume port is OK
				if (originalErrorHandler) {
					this.errorHandler = originalErrorHandler;
				}
			}, 200);
			
			// Temporarily replace error handler to catch port-in-use errors
			this.errorHandler = (err: any) => {
				const errorMsg = err?.message?.toLowerCase() || '';
				if (errorMsg.includes('access denied') || 
				    errorMsg.includes('cannot open') || 
				    errorMsg.includes('already in use') ||
				    errorMsg.includes('being used by another process') ||
				    errorMsg.includes('permission denied') ||
				    errorMsg.includes('ebusy') ||
				    errorMsg.includes('eacces')) {
					clearTimeout(errorCheckTimeout);
					initializationFailed = true;
					this.errorHandler = originalErrorHandler;
					return; // Don't call original handler - we'll throw our own error
				}
				// Call original error handler for other errors
				if (originalErrorHandler) {
					originalErrorHandler(err);
				}
			};
			
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
				// If error is about port not being open or access denied, treat as connection failure
				const errorMsg = error?.message?.toLowerCase() || '';
				if (errorMsg.includes('not open') || 
				    errorMsg.includes('access denied') || 
				    errorMsg.includes('cannot open') ||
				    errorMsg.includes('ebusy') ||
				    errorMsg.includes('eacces') ||
				    errorMsg.includes('in use')) {
					// Clean up port before throwing - CRITICAL: destroy even if never opened
					const portToDestroy = this.port || portForCleanup;
					if (portToDestroy) {
						try {
							portToDestroy.removeAllListeners();
						} catch {}
						try {
							if (portToDestroy.isOpen) {
								await portToDestroy.close().catch(() => {});
							}
						} catch {}
						try {
							if (portToDestroy.destroy) {
								portToDestroy.destroy();
							}
						} catch {}
						await new Promise(resolve => setTimeout(resolve, 100)); // Wait for OS to release
					}
					this.port = null;
					throw new Error(`Port ${config.port} failed to initialize. It may be in use by another application.`);
				}
				console.warn('FancyMon: Warning - could not set RTS/DTR:', error?.message || error);
				// Continue anyway - connection is still valid, but pins might be driven
			}
			
			// Restore original error handler
			clearTimeout(errorCheckTimeout);
			this.errorHandler = originalErrorHandler;
			
			// Check if initialization failed due to port being in use
			if (initializationFailed) {
				// Clean up port before throwing - CRITICAL: destroy even if never opened
				const portToDestroy = this.port || portForCleanup;
				if (portToDestroy) {
					try {
						portToDestroy.removeAllListeners();
					} catch {}
					try {
						if (portToDestroy.isOpen) {
							await portToDestroy.close().catch(() => {});
						}
					} catch {}
					try {
						if (portToDestroy.destroy) {
							portToDestroy.destroy();
						}
					} catch {}
					await new Promise(resolve => setTimeout(resolve, 100)); // Wait for OS to release
				}
				this.port = null;
				throw new Error(`Port ${config.port} is already in use by another application. Please close the other application and try again.`);
			}
			
			// Wait a bit more to see if any errors occur (port might close if in use)
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Final check - if port closed or error occurred, fail connection
			if (!this.port || (this.port.isOpen === false)) {
				const portToDestroy = this.port || portForCleanup;
				if (portToDestroy) {
					try {
						portToDestroy.removeAllListeners();
					} catch {}
					try {
						if (portToDestroy.destroy) {
							portToDestroy.destroy();
						}
					} catch {}
					await new Promise(resolve => setTimeout(resolve, 100)); // Wait for OS to release
				}
				this.port = null;
				throw new Error(`Port ${config.port} closed during initialization. It may be in use by another application.`);
			}
			
			// Only mark as connected AFTER RTS/DTR are properly set and port verified open
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
			
			// CRITICAL: Ensure port is properly cleaned up on connection failure
			// Even if port was never opened, the SerialPort object might hold a handle
			const portToCleanup = this.port || portForCleanup;
			
			if (portToCleanup) {
				try {
					// Remove all listeners first
					try {
						portToCleanup.removeAllListeners();
					} catch {}
					
					// Try to close if it's open
					if (portToCleanup.isOpen) {
						try {
							await portToCleanup.close().catch(() => {});
						} catch {}
					}
					
					// ALWAYS destroy to release resources - even if never opened
					// This is critical on Windows where handles can remain locked
					if (portToCleanup.destroy) {
						try {
							portToCleanup.destroy();
						} catch {}
					}
					
					// Wait a moment for OS to release the handle
					await new Promise(resolve => setTimeout(resolve, 100));
				} catch (cleanupErr) {
					// Ignore cleanup errors but log them
					console.error('FancyMon: Error during port cleanup:', cleanupErr);
				}
			}
			
			// Clear all references
			this.port = null;
			this.dataHandler = null;
			this.errorHandler = null;
			this.closeHandler = null;
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
			
			// STEP 2: Clear handler references (but keep port reference until after close)
			// We need to keep portToClose reference until port is fully closed
			this.dataHandler = null;
			this.errorHandler = null;
			this.closeHandler = null;
			// Don't clear this.port yet - we need it for the close operations
			// It will be cleared after port is fully closed
			console.log('FancyMon: Handler references cleared');
			
			// STEP 3: Reset control lines and flush before closing (helps release port on Windows)
			try {
				if (portToClose.isOpen) {
					// Reset RTS/DTR to default state before closing
					try {
						await Promise.race([
							portToClose.set({ rts: false, dtr: false }),
							new Promise((_, reject) => setTimeout(() => reject(new Error('Set timeout')), 50))
						]);
						console.log('FancyMon: Control lines reset');
					} catch (setErr: any) {
						console.log('FancyMon: Could not reset control lines (port may be closing):', setErr?.message);
					}
					
					// Flush/drain any pending operations
					try {
						if (portToClose.flush) {
							await Promise.race([
								portToClose.flush(),
								new Promise((_, reject) => setTimeout(() => reject(new Error('Flush timeout')), 50))
							]);
							console.log('FancyMon: Port flushed');
						}
					} catch (flushErr: any) {
						console.log('FancyMon: Could not flush port:', flushErr?.message);
					}
					
					// Pause to stop reading
					try {
						if (portToClose.pause) {
							portToClose.pause();
							console.log('FancyMon: Port paused');
						}
					} catch (pauseErr: any) {
						console.log('FancyMon: Error pausing port:', pauseErr?.message);
					}
				}
			} catch (prepErr: any) {
				console.log('FancyMon: Error preparing port for close:', prepErr?.message);
			}
			
			// STEP 4: Close and destroy the port - ensure it's fully released
			try {
				if (portToClose.isOpen) {
					console.log('FancyMon: Step 4 - Closing and destroying port to ensure release...');
					
					// Try to access and close underlying stream if available
					// This helps ensure the file handle is released on Windows
					try {
						// serialport v11+ may expose the underlying stream
						const stream = (portToClose as any).stream || (portToClose as any)._stream;
						if (stream) {
							try {
								if (stream.destroy) {
									stream.destroy();
									console.log('FancyMon: Underlying stream destroyed');
								}
								if (stream.close) {
									stream.close();
									console.log('FancyMon: Underlying stream closed');
								}
							} catch (streamErr: any) {
								console.log('FancyMon: Could not close underlying stream:', streamErr?.message);
							}
						}
					} catch (streamAccessErr: any) {
						console.log('FancyMon: Could not access underlying stream:', streamAccessErr?.message);
					}
					
					// Try to close gracefully first (but with short timeout)
					let closedGracefully = false;
					try {
						await Promise.race([
							portToClose.close(),
							new Promise((_, reject) => setTimeout(() => reject(new Error('Close timeout')), 150))
						]);
						console.log('FancyMon: Port closed gracefully');
						closedGracefully = true;
					} catch (closeErr: any) {
						console.log('FancyMon: Graceful close failed or timed out:', closeErr?.message);
					}
					
					// ALWAYS call destroy to ensure port handle is released
					// This is critical on Windows where ports can remain locked
					try {
						if (portToClose.destroy) {
							// Call destroy with error to force immediate cleanup
							portToClose.destroy(new Error('Forced disconnect'));
							console.log('FancyMon: Port destroyed (ensures handle release)');
						}
					} catch (destroyErr: any) {
						console.log('FancyMon: Error destroying port:', destroyErr?.message);
					}
					
					// Wait a moment and verify port is actually closed
					await new Promise(resolve => setTimeout(resolve, 100));
					
					// Check if port is still open and try destroy again if needed
					try {
						if (portToClose.isOpen) {
							console.log('FancyMon: Port still open after close, forcing destroy...');
							if (portToClose.destroy) {
								portToClose.destroy();
							}
						} else {
							console.log('FancyMon: Port confirmed closed');
						}
					} catch (checkErr: any) {
						console.log('FancyMon: Error checking port state:', checkErr?.message);
					}
					
					// Longer delay on Windows to ensure OS has fully released the port handle
					// Windows serial port drivers can be slow to release file handles
					// Increased delay to give Windows more time to release the handle
					await new Promise(resolve => setTimeout(resolve, 500));
					console.log('FancyMon: Port release delay completed (500ms for OS cleanup)');
				} else {
					console.log('FancyMon: Port was already closed');
				}
			} catch (err: any) {
				console.error('FancyMon: Error during port cleanup:', err);
			}
			
			// NOW clear the port reference after all close operations are complete
			// This ensures we don't hold any references that might prevent GC
			this.port = null;
			console.log('FancyMon: Port reference cleared after close operations');
			
			// Finalize disconnect
			console.log('FancyMon: Disconnect complete');
			
			// Clear serialport module reference to help with garbage collection
			// This might help release any lingering references on Windows
			// Note: We'll reload it on next connect, so this is safe
			// However, don't clear it if we might reconnect soon, as it helps with performance
			// Only clear if we're sure we're done (this is a trade-off)
			// For now, keep it cached for performance, but ensure port is null
			console.log('FancyMon: Port cleanup complete, port reference is null');
			
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


