import * as vscode from 'vscode';

// Lazy load SerialMonitor to avoid blocking activation
let SerialMonitorClass: any = null;
let serialMonitor: any = undefined;

// Log immediately when module loads (before activate)
console.error('FancyMon: Module file is being loaded!');
console.log('FancyMon: Module file is being loaded!');

export function activate(context: vscode.ExtensionContext) {
	// Force immediate notification to verify activation
	vscode.window.showInformationMessage('FancyMon: Extension is ACTIVATING!', 'OK').then(() => {
		console.log('User acknowledged activation message');
	});
	
	console.log('=== FancyMon extension ACTIVATING ===');
	console.log('Extension context:', context.extensionPath);
	console.log('Extension URI:', context.extensionUri.toString());
	
	// Register command immediately - don't wait for SerialMonitor
	const disposable = vscode.commands.registerCommand('fancymon.start', async () => {
		console.log('=== fancymon.start command INVOKED ===');
		vscode.window.showInformationMessage('FancyMon: Command was called!');
		
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

	context.subscriptions.push(disposable);
	context.subscriptions.push(testDisposable);
	
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
