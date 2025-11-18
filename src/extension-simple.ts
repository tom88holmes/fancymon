import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	console.log('=== SIMPLE TEST: FancyMon extension ACTIVATING ===');
	
	// Register a simple test command
	const disposable = vscode.commands.registerCommand('fancymon.test', () => {
		vscode.window.showInformationMessage('FancyMon test command works!');
		console.log('FancyMon test command was called!');
	});

	context.subscriptions.push(disposable);
	
	console.log('=== SIMPLE TEST: Command registered ===');
	vscode.window.showInformationMessage('FancyMon SIMPLE extension loaded!');
}

export function deactivate() {}


