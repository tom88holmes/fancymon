import * as vscode from 'vscode';

// Lazy load SerialMonitor to avoid blocking activation
let SerialMonitorClass: any = null;
let serialMonitor: any = undefined;

// Log immediately when module loads (before activate)
console.error('FancyMon: Module file is being loaded!');
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
		                  taskCommand.includes('idf.py') && (taskCommand.includes('flash') || taskCommand.includes('build'));
		
		if (isIdfTask) {
			console.log('FancyMon: ESP-IDF flash/build task detected, auto-disconnecting...');
			if (serialMonitor && serialMonitor.connection && serialMonitor.connection.connected) {
				await serialMonitor.disconnect();
				console.log('FancyMon: Auto-disconnected for ESP-IDF task');
			}
		}
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(testDisposable);
	context.subscriptions.push(disconnectDisposable);
	context.subscriptions.push(taskStartDisposable);
	
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
