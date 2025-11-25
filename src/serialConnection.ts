import type { SerialMonitorConfig } from './serialMonitor';

type SerialPortType = any; // Will be the SerialPort type from serialport module

export interface SerialConnectionCallbacks {
	onData: (data: string) => void;
	onError: (error: string) => void;
	onClose: () => void;
	onConnected: () => void;
	onDisconnected: () => void;
	onDisconnecting: (info: { pendingBytes: number; pendingChunks: number; elapsedMs: number }) => void;
	onDebug?: (message: string) => void;
}

export class SerialConnection {
	private port: SerialPortType | null = null;
	private isConnected = false;
	private isDisconnecting = false;
	private serialportModule: any = null;
	private hasSentConnectedMessage = false; // Prevent duplicate connected messages
	
	private isConnecting = false; // Flag to prevent concurrent connection attempts

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

	private logDebug(message: string, ...args: any[]): void {
		const formattedMsg = args.length > 0 ? `${message} ${args.map(a => JSON.stringify(a)).join(' ')}` : message;
		console.log(`FancyMon: DEBUG - ${formattedMsg}`); // Keep local log
		if (this.callbacks.onDebug) {
			this.callbacks.onDebug(formattedMsg);
		}
	}

	private formatTimestamp(): string {
		const now = new Date();
		const hours = String(now.getHours()).padStart(2, '0');
		const minutes = String(now.getMinutes()).padStart(2, '0');
		const seconds = String(now.getSeconds()).padStart(2, '0');
		const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
		return `${hours}:${minutes}:${seconds}.${milliseconds}`;
	}

	private sendStatusMessage(message: string, reason?: string): void {
		const timestamp = this.formatTimestamp();
		const fullMessage = reason ? `${message} due to ${reason}` : message;
		this.callbacks.onData(`[${timestamp}] ${fullMessage}\n`);
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
		// Prevent concurrent connection attempts
		if (this.isConnecting) {
			this.logDebug('Connection attempt already in progress, ignoring new request.');
			return;
		}

		this.isConnecting = true;
		this.logDebug('connect() called with config:', config);
		this.logDebug('Currently connected:', this.isConnected);
		
		if (this.isConnected) {
			this.logDebug('Already connected, disconnecting first...');
			await this.disconnect();
		}

		const maxRetries = 10; // Try 10 times (initial + 9 retries) to handle slow Windows port release
		let lastError: any = null;

		try {
			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					if (attempt > 1) {
						this.logDebug(`Retry attempt ${attempt}/${maxRetries} starting in 1000ms...`);
						await new Promise(resolve => setTimeout(resolve, 1000));
					}
					
					await this.connectAttempt(config);
					this.logDebug(`Connection successful on attempt ${attempt}`);
					this.isConnecting = false;
					return;
				} catch (error: any) {
					lastError = error;
					const errorMsg = error?.message?.toLowerCase() || '';
					this.logDebug(`Attempt ${attempt} failed:`, errorMsg);
					
					// Retry on "port in use" and "initialization failed" type errors
					const isPortInUse = errorMsg.includes('access denied') || 
									  errorMsg.includes('in use') || 
									  errorMsg.includes('cannot open') ||
									  errorMsg.includes('busy') ||
									  errorMsg.includes('null after initialization') ||
									  errorMsg.includes('closed during initialization');
					
					if (!isPortInUse || attempt >= maxRetries) {
						throw error;
					}
					
					this.logDebug('Port appears to be in use or unstable, will retry...');
				}
			}
		} catch (finalError) {
			this.isConnecting = false;
			throw finalError;
		}
	}

	private async connectAttempt(config: SerialMonitorConfig): Promise<void> {
		// Reset connected message flag for new connection
		this.hasSentConnectedMessage = false;

		// Store port reference for cleanup in case of failure
		let portForCleanup: SerialPortType | null = null;

		try {
			this.logDebug('Getting serialport module...');
			const serialport = await this.getSerialPort();
			this.logDebug('Got serialport module, creating port object...');
			
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
				const isAccessError = errorMsg.includes('access denied') || 
				                     errorMsg.includes('cannot open') ||
				                     (errorMsg.includes('opening') && errorMsg.includes('access denied')) ||
				                     errorMsg.includes('being used by another process') ||
				                     errorMsg.includes('permission denied') ||
				                     errorMsg.includes('ebusy') ||
				                     errorMsg.includes('eacces');
				
				if (isAccessError) {
					if (this.isConnected) {
						console.log('FancyMon: Port access conflict detected (likely ESP-IDF flash), auto-disconnecting...');
						// Auto-disconnect to allow other process (like ESP-IDF flash) to use the port
						this.disconnect().catch(e => console.error('FancyMon: Auto-disconnect error:', e));
					}
					// During connection, don't abort here - let the promise rejection handle it
					// The error handler should only handle errors AFTER connection is established
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
			
			// Track if open actually succeeded
			let openSucceeded = false;
			let openErrorOccurred: any = null;
			let openCompleted = false; // Track when open() promise completes
			
			// Set up error handler to catch errors during open
			// But only track them - don't abort yet, let the promise handle it
			const openErrorHandler = (err: any) => {
				const errorMsg = err?.message?.toLowerCase() || '';
				if (errorMsg.includes('access denied') || 
				    errorMsg.includes('cannot open') ||
				    (errorMsg.includes('opening') && errorMsg.includes('access denied'))) {
					openErrorOccurred = err;
					console.error('FancyMon: Port open error detected:', err?.message);
					// Don't set connectionAborted here - let the promise rejection handle it
					// Only abort if this happens AFTER open() succeeds
				}
			};
			
			// Temporarily add error handler to catch open errors
			this.port.once('error', openErrorHandler);
			
			try {
				this.logDebug('Calling port.open()...');
				await Promise.race([openPromise, timeoutPromise]);
				this.logDebug('port.open() promise resolved');
				this.logDebug('port.isOpen =', this.port?.isOpen);
				this.logDebug('openErrorOccurred =', openErrorOccurred);
				console.log('FancyMon: Port opened successfully');
				openSucceeded = true;
				openCompleted = true; // Mark that open() completed successfully
			} catch (openError: any) {
				this.logDebug('port.open() promise REJECTED:', openError?.message);
				openCompleted = true; // Mark that open() completed (even if failed)
				openErrorOccurred = openError;
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
					this.logDebug('Setting this.port = null at line 217 (open failed)');
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
				    errorMsg.includes('failed to open') ||
				    (errorMsg.includes('opening') && errorMsg.includes('access denied'))) {
					throw new Error(`Port ${config.port} is already in use by another application. Please close the other application and try again.`);
				}
				throw openError; // Re-throw if it's a different error
			} finally {
				// Remove the temporary error handler
				this.port?.removeListener('error', openErrorHandler);
			}
			
			// CRITICAL: Check if an error occurred during open (even if promise resolved)
			if (openErrorOccurred) {
				const errorMsg = openErrorOccurred?.message?.toLowerCase() || '';
				if (errorMsg.includes('access denied') || 
				    (errorMsg.includes('opening') && errorMsg.includes('access denied'))) {
					// Clean up port
					if (this.port) {
						try {
							if (this.port.isOpen) {
								await this.port.close().catch(() => {});
							}
						} catch {}
						try {
							if (this.port.destroy) {
								this.port.destroy();
							}
						} catch {}
						await new Promise(resolve => setTimeout(resolve, 100));
						this.logDebug('Setting this.port = null at line 257 (access denied during open check)');
						this.port = null;
					}
					throw new Error(`Port ${config.port} is already in use by another application. Please close the other application and try again.`);
				}
			}
			
			// CRITICAL: Verify port is actually open IMMEDIATELY after open() resolves
			// Don't wait - check right away to catch failures immediately
			if (!this.port) {
				throw new Error(`Port ${config.port} object is null after opening.`);
			}
			
			// CRITICAL: Check if port is actually open right after open() resolves
			// On Windows, isOpen might not be immediately true even after open() resolves
			// Poll for isOpen to become true, with a reasonable timeout
			this.logDebug('Waiting for port.isOpen to become true...');
			this.logDebug('Initial isOpen state:', this.port?.isOpen);
			
			// Also check for any error events that might have fired
			let errorEventOccurred = false;
			let pollingError: Error | null = null;
			const checkErrorHandler = (err: Error) => {
				this.logDebug('ERROR EVENT FIRED after open():', err.message);
				errorEventOccurred = true;
				pollingError = err;
			};
			this.port.once('error', checkErrorHandler);
			
			// Poll for isOpen to become true, up to 2 seconds (Windows may need more time)
			let portIsOpen = false;
			const maxWaitTime = 2000; // 2 seconds max wait
			const pollInterval = 50; // Check every 50ms
			const startTime = Date.now();
			
			this.logDebug('Starting polling loop, maxWaitTime:', maxWaitTime, 'ms');
			
			while (!portIsOpen && !errorEventOccurred && (Date.now() - startTime) < maxWaitTime) {
				if (!this.port) {
					this.logDebug('this.port became null during polling!');
					break;
				}
				portIsOpen = this.port.isOpen || false;
				const elapsed = Date.now() - startTime;
				if (!portIsOpen) {
					this.logDebug('Port not open yet, waiting...', elapsed, 'ms, isOpen:', this.port.isOpen, 'port exists:', !!this.port);
					await new Promise(resolve => setTimeout(resolve, pollInterval));
				} else {
					this.logDebug('Port is now open! Elapsed:', elapsed, 'ms');
				}
			}
			
			const totalElapsed = Date.now() - startTime;
			this.logDebug('Polling loop ended. Total elapsed:', totalElapsed, 'ms, portIsOpen:', portIsOpen, 'errorEventOccurred:', errorEventOccurred);
			
			if (this.port) {
				this.port.removeListener('error', checkErrorHandler);
			}
			
			this.logDebug('After polling, isOpen:', this.port?.isOpen);
			this.logDebug('portIsOpen:', portIsOpen);
			this.logDebug('errorEventOccurred:', errorEventOccurred);
			this.logDebug('openErrorOccurred:', openErrorOccurred);
			
			if (!portIsOpen || errorEventOccurred) {
				this.logDebug('Port is NOT open after open() resolved!');
				
				// Check if we got an error during polling
				if (errorEventOccurred && pollingError) {
					this.logDebug('Error event occurred during polling:', (pollingError as any).message);
					const errorMsg = (pollingError as any).message.toLowerCase();
					if (errorMsg.includes('access denied') || errorMsg.includes('cannot open')) {
						this.logDebug('Throwing access denied error from polling event');
						// Clean up and throw
						try {
							if (this.port.destroy) {
								this.port.destroy();
							}
						} catch {}
						await new Promise(resolve => setTimeout(resolve, 100));
						this.logDebug('Setting this.port = null (access denied from polling event)');
						this.port = null;
						throw new Error(`Port ${config.port} is already in use by another application. Please close the other application and try again.`);
					}
				}

				// Port is not open - this means open() failed
				// Check if we got an error from the open() promise rejection (unlikely if we are here)
				if (openErrorOccurred) {
					this.logDebug('openErrorOccurred is set:', openErrorOccurred?.message);
					const errorMsg = openErrorOccurred?.message?.toLowerCase() || '';
					if (errorMsg.includes('access denied') || errorMsg.includes('cannot open')) {
						this.logDebug('Throwing access denied error');
						// Clean up and throw
						try {
							if (this.port.destroy) {
								this.port.destroy();
							}
						} catch {}
						await new Promise(resolve => setTimeout(resolve, 100));
						this.logDebug('Setting this.port = null at line 320 (access denied after polling)');
						this.port = null;
						throw new Error(`Port ${config.port} is already in use by another application. Please close the other application and try again.`);
					}
				}
				// Port isn't open and no error recorded - this is a problem
				this.logDebug('Port not open and no error recorded - throwing generic error');
				this.logDebug('Stack trace:', new Error().stack);
				try {
					if (this.port.destroy) {
						this.port.destroy();
					}
				} catch {}
				await new Promise(resolve => setTimeout(resolve, 100));
				this.logDebug('Setting this.port = null at line 333 (port not open after polling)');
				this.port = null;
				const err = new Error(`Port ${config.port} failed to open. It may be in use by another application.`);
				this.logDebug('Throwing error at line ~305:', err.message);
				throw err;
			}
			this.logDebug('Port is open, continuing...');
			
			// Wait a moment for the port to fully initialize before setting RTS/DTR
			// Some drivers need time to stabilize after opening
			// Monitor for errors/closes during this wait
			this.logDebug('Setting up error/close listeners for stabilization wait...');
			let waitErrorOccurred: Error | null = null as Error | null;
			let waitCloseOccurred = false;
			
			const waitErrorHandler = (err: Error) => {
				this.logDebug('ERROR during wait:', err.message);
				this.logDebug('Error stack:', err.stack);
				waitErrorOccurred = err;
			};
			const waitCloseHandler = () => {
				this.logDebug('CLOSE event during wait!');
				this.logDebug('Port closed event fired during stabilization wait');
				waitCloseOccurred = true;
			};
			
			if (!this.port) {
				console.error('FancyMon: DEBUG - CRITICAL: this.port is null before setting up wait listeners!');
				throw new Error(`Port ${config.port} object is null before stabilization wait.`);
			}
			
			this.port.once('error', waitErrorHandler);
			this.port.once('close', waitCloseHandler);
			
			this.logDebug('Waiting 100ms for port to stabilize...');
			this.logDebug('Port state before wait: isOpen=', this.port.isOpen);
			await new Promise(resolve => setTimeout(resolve, 100));
			
			if (this.port) {
				this.port.removeListener('error', waitErrorHandler);
				this.port.removeListener('close', waitCloseHandler);
			}
			
			// CRITICAL: Verify port is still open after wait (might have closed due to error)
			this.logDebug('After wait, checking port state...');
			this.logDebug('this.port exists:', !!this.port);
			this.logDebug('this.port.isOpen:', this.port?.isOpen);
			this.logDebug('waitErrorOccurred:', waitErrorOccurred?.message);
			this.logDebug('waitCloseOccurred:', waitCloseOccurred);
			
			if (!this.port || !this.port.isOpen || waitCloseOccurred || waitErrorOccurred) {
				this.logDebug('Port closed during wait!');
				this.logDebug('Reason: isOpen=', this.port?.isOpen, 'closeEvent=', waitCloseOccurred, 'error=', waitErrorOccurred?.message);
				console.error('FancyMon: ERROR - Port closed during stabilization wait! Details:', {
					portExists: !!this.port,
					isOpen: this.port?.isOpen,
					closeEvent: waitCloseOccurred,
					error: waitErrorOccurred?.message || 'none',
					errorStack: waitErrorOccurred?.stack
				});
				// Port closed during wait - this means there was an error
				const portToDestroy = this.port || portForCleanup;
				if (portToDestroy) {
					try {
						if (portToDestroy.destroy) {
							portToDestroy.destroy();
						}
					} catch {}
					await new Promise(resolve => setTimeout(resolve, 100));
				}
				this.logDebug('Setting this.port = null at line 384 (port closed during wait)');
				this.port = null;
				
				// If we got a specific error, use that message
				if (waitErrorOccurred) {
					const errorMsg = waitErrorOccurred.message.toLowerCase();
					if (errorMsg.includes('access denied') || errorMsg.includes('cannot open') || errorMsg.includes('ebusy')) {
						throw new Error(`Port ${config.port} is already in use by another application. Please close the other application and try again.`);
					}
				}
				
				throw new Error(`Port ${config.port} closed during initialization. It may be in use by another application.`);
			}
			this.logDebug('Port still open after wait, continuing...');
			
			// Port is verified open - continue with RTS/DTR setup
			
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
			// NOTE: Ignore "not open" errors - they're false positives from port.set()
			this.errorHandler = (err: any) => {
				const errorMsg = err?.message?.toLowerCase() || '';
				// Ignore "not open" errors - they're false positives during initialization
				if (errorMsg.includes('not open')) {
					console.warn('FancyMon: Ignoring "Port is not open" error during initialization (false positive):', err?.message);
					// Still call original handler for logging, but don't treat as failure
					if (originalErrorHandler) {
						originalErrorHandler(err);
					}
					return;
				}
				// Only treat real port access errors as failures
				if (errorMsg.includes('access denied') || 
				    errorMsg.includes('cannot open') ||
				    (errorMsg.includes('already in use') && !errorMsg.includes('not open')) ||
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
			try {
				if (this.port && this.port.isOpen) {
					await this.port.set({ rts: false, dtr: false });
					this.logDebug('RTS and DTR set to false (first attempt)');
					
					// Wait and set again (some drivers reset them after initial set)
					await new Promise(resolve => setTimeout(resolve, 100));
					if (this.port && this.port.isOpen) {
						await this.port.set({ rts: false, dtr: false });
						this.logDebug('RTS and DTR set to false (second attempt)');
					}
				}
			} catch (error: any) {
				// If error is about access denied (real port conflict), treat as connection failure
				// NOTE: "not open" errors are FALSE POSITIVES from port.set() and should be ignored
				const errorMsg = error?.message?.toLowerCase() || '';
				if (errorMsg.includes('access denied') || 
				    errorMsg.includes('cannot open') ||
				    errorMsg.includes('ebusy') ||
				    errorMsg.includes('eacces') ||
				    (errorMsg.includes('in use') && !errorMsg.includes('not open'))) {
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
					this.logDebug('Setting this.port = null at line 486 (RTS/DTR access denied)');
					this.port = null;
					throw new Error(`Port ${config.port} failed to initialize. It may be in use by another application.`);
				}
				// "not open" errors are false positives - ignore them and continue
				if (errorMsg.includes('not open')) {
					this.logDebug('Ignoring "Port is not open" error during RTS/DTR setup (false positive):', error?.message);
				} else {
					this.logDebug('Warning - could not set RTS/DTR:', error?.message || error);
				}
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
				this.logDebug('Setting this.port = null at line 522 (initializationFailed=true)');
				this.port = null;
				throw new Error(`Port ${config.port} is already in use by another application. Please close the other application and try again.`);
			}
			
			// Wait a bit more to see if any errors occur (port might close if in use)
			this.logDebug('Before final wait, this.port exists:', !!this.port);
			this.logDebug('Before final wait, initializationFailed:', initializationFailed);
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Final check - verify port is still valid
			// Check if port is null first (definite failure)
			this.logDebug('After final wait, this.port exists:', !!this.port);
			this.logDebug('After final wait, initializationFailed:', initializationFailed);
			if (!this.port) {
				this.logDebug('this.port is null at final check!');
				this.logDebug('Stack trace:', new Error().stack);
				const portToDestroy = portForCleanup;
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
				throw new Error(`Port ${config.port} object is null after initialization.`);
			}
			
			// CRITICAL: If initializationFailed flag was set, we detected a real port conflict
			// Don't mark as connected - the port cleanup was already done above
			if (initializationFailed) {
				// This should have been handled above, but double-check
				if (!this.port) {
					throw new Error(`Port ${config.port} is already in use by another application. Please close the other application and try again.`);
				}
			}
			
			// CRITICAL: Final verification - ensure port is actually open before marking as connected
			// This is the last check before we mark as connected
			this.logDebug('Final check before marking as connected...');
			this.logDebug('this.port exists:', !!this.port);
			this.logDebug('this.port.isOpen:', this.port?.isOpen);
			if (!this.port || !this.port.isOpen) {
				this.logDebug('Port not open in final check - throwing error');
				this.logDebug('Stack trace:', new Error().stack);
				// Port is not open - this is a problem
				const portToDestroy = this.port || portForCleanup;
				if (portToDestroy) {
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
					await new Promise(resolve => setTimeout(resolve, 100));
				}
				this.port = null;
				const err = new Error(`Port ${config.port} failed to open. It may be in use by another application.`);
				this.logDebug('Throwing error at final check (line ~516):', err.message);
				throw err;
			}
			this.logDebug('Final check passed, marking as connected');
			
			// Only mark as connected AFTER RTS/DTR are properly set and port verified
			// If we got here, port.open() succeeded and port.set() either succeeded or gave false positive "not open" errors
			// The port is actually open and ready
			this.isConnected = true;
			this.callbacks.onConnected();
			// Send status message only once (prevent duplicates)
			if (!this.hasSentConnectedMessage) {
				this.sendStatusMessage('[[ CONNECTED ]]');
				this.hasSentConnectedMessage = true;
			}
		} catch (error: any) {
			// Don't report error here - let the caller (connect) handle retries and reporting
			// this.callbacks.onError(`Connection error: ${error?.message || error}`);
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
			
			// Re-throw error so caller knows connection failed
			throw error;
		}
	}

	async disconnect(reason?: string): Promise<void> {
		// Prevent multiple simultaneous disconnect calls
		if (this.isDisconnecting) {
			this.logDebug('Disconnect already in progress, ignoring');
			return;
		}
		
		if (this.port) {
			// Send disconnect message FIRST
			this.sendStatusMessage('[[ DISCONNECTED ]]', reason);
			
			this.isDisconnecting = true;
			this.disconnectStartTime = Date.now();
			this.shouldProcessData = false;
			this.isConnected = false;
			
			this.logDebug('Disconnect started');
			this.callbacks.onDisconnecting({ 
				pendingBytes: 0,
				pendingChunks: 0,
				elapsedMs: 0
			});
			
			const portToClose = this.port;
			
			// Step 1: Remove listeners
			try {
				portToClose.removeAllListeners();
				if (this.dataHandler) {
					portToClose.off('data', this.dataHandler);
				}
				if (this.errorHandler) {
					portToClose.off('error', this.errorHandler);
				}
				if (this.closeHandler) {
					portToClose.off('close', this.closeHandler);
				}
				this.logDebug('Listeners removed');
			} catch (e) {
				this.logDebug('Error removing listeners:', e);
			}
			
			this.dataHandler = null;
			this.errorHandler = null;
			this.closeHandler = null;
			
			// Step 2: Close the port
			try {
				if (portToClose.isOpen) {
					this.logDebug('Closing port...');
					await Promise.race([
						portToClose.close(),
						new Promise((_, reject) => setTimeout(() => reject(new Error('Close timeout')), 500))
					]);
					this.logDebug('Port closed successfully');
				} else {
					this.logDebug('Port was already closed');
				}
			} catch (err: any) {
				this.logDebug('Error closing port (will destroy):', err?.message);
				// If close fails/times out, we MUST destroy
				try {
					if (portToClose.isOpen && portToClose.destroy) {
						portToClose.destroy();
						this.logDebug('Port destroyed');
					}
				} catch (destroyErr) {
					this.logDebug('Error destroying port:', destroyErr);
				}
			}
			
			// Step 3: Wait for OS cleanup
			await new Promise(resolve => setTimeout(resolve, 200));
			
			this.port = null;
			this.logDebug('Disconnect complete, port reference cleared');
			
			this.callbacks.onDisconnected();
			this.isDisconnecting = false;
			this.hasSentConnectedMessage = false;
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


