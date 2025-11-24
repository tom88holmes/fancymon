import * as vscode from 'vscode';

// Lazy load SerialMonitor to avoid blocking activation
let SerialMonitorClass: any = null;
let serialMonitor: any = undefined;

// Log immediately when module loads (before activate)
console.log('FancyMon: Module file is being loaded!');

export function activate(context: vscode.ExtensionContext) {
	console.log('=== FancyMon extension ACTIVATING ===');
	console.log('Extension context:', context.extensionPath);
	console.log('Extension URI:', context.extensionUri.toString());
	
	// Register command immediately - don't wait for SerialMonitor
	const disposable = vscode.commands.registerCommand('fancymon.start', async () => {
		console.log('=== fancymon.start command INVOKED ===');
		
		try {
			// Lazy load SerialMonitor only when command is called
			if (!SerialMonitorClass) {
				try {
					console.log('FancyMon: Loading SerialMonitor module...');
					const module = await import('./serialMonitor.js');
					SerialMonitorClass = module.SerialMonitor;
					console.log('FancyMon: SerialMonitor module loaded successfully');
				} catch (error: any) {
					console.error('FancyMon: Failed to load SerialMonitor module:', error);
					console.error('FancyMon: Error stack:', error?.stack);
					vscode.window.showErrorMessage(`FancyMon: Failed to load serial monitor module: ${error?.message || error}`);
					return;
				}
			}
			
			// Create instance if needed
			if (!serialMonitor) {
				try {
					console.log('FancyMon: Creating SerialMonitor instance...');
					serialMonitor = new SerialMonitorClass(context);
					console.log('FancyMon: SerialMonitor instance created successfully');
				} catch (error: any) {
					console.error('FancyMon: Failed to create SerialMonitor instance:', error);
					console.error('FancyMon: Error stack:', error?.stack);
					vscode.window.showErrorMessage(`FancyMon: Failed to initialize: ${error?.message || error}`);
					return;
				}
			}
			
			try {
				console.log('FancyMon: Creating panel...');
				await serialMonitor.createPanel();
				console.log('FancyMon: Panel created successfully');
			} catch (error: any) {
				console.error('FancyMon: Error creating panel:', error);
				console.error('FancyMon: Error stack:', error?.stack);
				vscode.window.showErrorMessage(`Failed to start serial monitor: ${error?.message || error}`);
			}
		} catch (error: any) {
			console.error('FancyMon: Unexpected error in command handler:', error);
			console.error('FancyMon: Error stack:', error?.stack);
			vscode.window.showErrorMessage(`FancyMon: Unexpected error: ${error?.message || error}`);
		}
	});

	const testDisposable = vscode.commands.registerCommand('fancymon.test', () => {
		vscode.window.showInformationMessage('FancyMon test command works!');
		console.log('FancyMon test command was called!');
	});

	// Register disconnect command (can be called by ESP-IDF or other extensions)
	const disconnectDisposable = vscode.commands.registerCommand('fancymon.disconnect', async () => {
		console.log('FancyMon: Disconnect command called (likely by ESP-IDF or task)');
		if (serialMonitor && serialMonitor.connection && serialMonitor.connection.connected) {
			await serialMonitor.disconnect();
			console.log('FancyMon: Disconnected successfully');
		} else {
			console.log('FancyMon: Not connected, nothing to disconnect');
		}
	});

	// Track if we disconnected due to ESP-IDF task and need to reconnect
	let disconnectedForIdfTask = false;
	let lastConfigBeforeDisconnect: any = null;

	// Auto-detect ESP-IDF flash/build tasks and disconnect
	const taskStartDisposable = vscode.tasks.onDidStartTask(async (event) => {
		const taskName = event.execution.task.name?.toLowerCase() || '';
		const taskType = event.execution.task.definition?.type || '';
		const taskCommand = event.execution.task.definition?.command || '';
		
		// Check if it's an ESP-IDF flash/build task
		const isIdfTask = taskType === 'idf' || 
		                  taskName.includes('flash') || 
		                  taskName.includes('build and flash') ||
		                  taskName.includes('idf') ||
		                  (taskCommand.includes('idf.py') && (taskCommand.includes('flash') || taskCommand.includes('build')));
		
		// Also check for ESP-IDF monitor task starting
		const isIdfMonitorTask = taskType === 'idf' && taskName.includes('monitor') ||
		                         taskCommand.includes('idf.py') && taskCommand.includes('monitor');
		
		if (isIdfTask) {
			console.log('FancyMon: ESP-IDF flash/build task detected, auto-disconnecting...');
			if (serialMonitor && serialMonitor.connection && serialMonitor.connection.connected) {
				// Save the current config before disconnecting
				if (serialMonitor.getLastConfig) {
					lastConfigBeforeDisconnect = serialMonitor.getLastConfig();
				}
				await serialMonitor.disconnect();
				disconnectedForIdfTask = true;
				console.log('FancyMon: Auto-disconnected for ESP-IDF task, will reconnect when task completes');
			}
		} else if (isIdfMonitorTask && disconnectedForIdfTask) {
			// ESP-IDF monitor is trying to start - reconnect first to block it
			console.log('FancyMon: ESP-IDF monitor task detected, reconnecting to block it...');
			if (serialMonitor && lastConfigBeforeDisconnect) {
				try {
					await serialMonitor.connect(lastConfigBeforeDisconnect);
					disconnectedForIdfTask = false;
					lastConfigBeforeDisconnect = null;
					console.log('FancyMon: Reconnected before ESP-IDF monitor could start');
				} catch (error: any) {
					console.error('FancyMon: Failed to reconnect before ESP-IDF monitor:', error);
				}
			}
		}
	});

	// Auto-reconnect when ESP-IDF tasks finish
	const taskEndDisposable = vscode.tasks.onDidEndTask(async (event) => {
		const taskName = event.execution.task.name?.toLowerCase() || '';
		const taskType = event.execution.task.definition?.type || '';
		const taskCommand = event.execution.task.definition?.command || '';
		
		// Check if it was an ESP-IDF flash/build task
		const wasIdfTask = taskType === 'idf' || 
		                   taskName.includes('flash') || 
		                   taskName.includes('build and flash') ||
		                   taskName.includes('idf') ||
		                   (taskCommand.includes('idf.py') && (taskCommand.includes('flash') || taskCommand.includes('build')));
		
		if (wasIdfTask && disconnectedForIdfTask && lastConfigBeforeDisconnect) {
			console.log('FancyMon: ESP-IDF task completed, auto-reconnecting...');
			// Wait a moment for the port to be fully released
			await new Promise(resolve => setTimeout(resolve, 500));
			
			if (serialMonitor && !serialMonitor.connection.connected) {
				try {
					await serialMonitor.connect(lastConfigBeforeDisconnect);
					disconnectedForIdfTask = false;
					lastConfigBeforeDisconnect = null;
					console.log('FancyMon: Auto-reconnected after ESP-IDF task completion');
				} catch (error: any) {
					console.error('FancyMon: Failed to auto-reconnect after ESP-IDF task:', error);
					// Keep the flag set so we can try again if another task completes
				}
			}
		}
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(testDisposable);
	context.subscriptions.push(disconnectDisposable);
	context.subscriptions.push(taskStartDisposable);
	context.subscriptions.push(taskEndDisposable);
	
	console.log('=== FancyMon commands registered successfully ===');
	console.log('Registered commands:', vscode.commands.getCommands().then(cmds => {
		const fancymonCmds = cmds.filter(c => c.includes('fancymon'));
		console.log('FancyMon commands found:', fancymonCmds);
	}));
}

export async function deactivate() {
	console.log('=== FancyMon extension DEACTIVATING ===');
	if (serialMonitor) {
		try {
			// Ensure we disconnect from serial port
			if (serialMonitor.disconnect) {
				await serialMonitor.disconnect();
			}
			// Dispose of the panel if it exists
			if (serialMonitor.panel) {
				serialMonitor.panel.dispose();
			}
		} catch (error) {
			console.error('Error during deactivate:', error);
		}
	}
	console.log('=== FancyMon extension DEACTIVATED ===');
}
