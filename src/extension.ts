import * as vscode from 'vscode';
import { WorkspaceSizeCalculator, FolderSizeResult, formatBytes } from './workspaceSize';

class WorkspaceSizeIndicator implements vscode.Disposable {
	private readonly statusBarItem: vscode.StatusBarItem;
	private readonly disposables: vscode.Disposable[] = [];
	private readonly calculator = new WorkspaceSizeCalculator();
	private debounceTimer: NodeJS.Timeout | undefined;
	private currentCalculation?: vscode.CancellationTokenSource;
	private lastBreakdown: FolderSizeResult[] = [];
	private isCalculating = false;

	constructor(private readonly context: vscode.ExtensionContext) {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
		this.statusBarItem.name = 'Workspace Size';
		this.statusBarItem.command = 'sizecalculator.recalculateWorkspaceSize';
		this.statusBarItem.text = '$(database) Ready';
		this.statusBarItem.tooltip = 'Workspace size will appear here once calculated. Click to trigger a manual refresh.';

		this.disposables.push(this.statusBarItem);
		this.registerEventListeners();
		this.registerCommands();
		this.updateVisibility();
		this.scheduleRefresh(0);
	}

	dispose(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = undefined;
		}
		if (this.currentCalculation) {
			this.currentCalculation.cancel();
			this.currentCalculation.dispose();
			this.currentCalculation = undefined;
		}
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}

	private registerEventListeners(): void {
		const trigger = () => this.scheduleRefresh();
		const triggerSlow = () => this.scheduleRefresh(1500);
		this.disposables.push(
			vscode.workspace.onDidCreateFiles(trigger),
			vscode.workspace.onDidDeleteFiles(trigger),
			vscode.workspace.onDidRenameFiles(trigger),
			vscode.workspace.onDidSaveTextDocument(() => triggerSlow()),
			vscode.workspace.onDidChangeWorkspaceFolders(() => {
				this.updateVisibility();
				trigger();
			})
		);
	}

	private registerCommands(): void {
		this.context.subscriptions.push(
			vscode.commands.registerCommand('sizecalculator.showWorkspaceSizeDetails', () => this.showDetails()),
			vscode.commands.registerCommand('sizecalculator.recalculateWorkspaceSize', () => this.refresh(true))
		);
	}

	private updateVisibility(): void {
		if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
			this.statusBarItem.show();
		} else {
			this.statusBarItem.hide();
			this.statusBarItem.text = '$(database) No workspace';
			this.statusBarItem.tooltip = 'Open a folder to calculate its size.';
		}
	}

	private scheduleRefresh(delay = 750): void {
		if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
			return;
		}
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}
		this.debounceTimer = setTimeout(() => {
			this.debounceTimer = undefined;
			void this.refresh();
		}, delay);
	}

	private async refresh(force = false): Promise<void> {
		if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
			this.updateVisibility();
			return;
		}
		if (this.isCalculating && !force) {
			return;
		}
		if (this.currentCalculation) {
			this.currentCalculation.cancel();
			this.currentCalculation.dispose();
		}

		this.isCalculating = true;
		this.statusBarItem.text = '$(sync~spin) Calculating…';
		this.statusBarItem.tooltip = 'Calculating workspace size…';

		const cancellation = new vscode.CancellationTokenSource();
		this.currentCalculation = cancellation;

		try {
			const folders = vscode.workspace.workspaceFolders ?? [];
			const results = await this.calculator.calculate(folders, cancellation.token);
			if (cancellation.token.isCancellationRequested) {
				return;
			}

			this.lastBreakdown = results;
			this.applyResults(results);
		} catch (error) {
			if (!(error instanceof Error && error.message === 'Cancelled')) {
				console.error('[sizecalculator] Failed to calculate workspace size', error);
			}
			this.statusBarItem.text = '$(error) Size unavailable';
			this.statusBarItem.tooltip = 'Failed to calculate workspace size. Click to try again.';
		} finally {
			if (this.currentCalculation === cancellation) {
				cancellation.dispose();
				this.currentCalculation = undefined;
			}
			this.isCalculating = false;
		}
	}

	private applyResults(results: FolderSizeResult[]): void {
		const total = results.reduce((accumulator, item) => accumulator + item.size, 0);
		const totalFormatted = formatBytes(total);
		const breakdownTooltip = results
			.filter((result) => result.size > 0)
			.map((result) => `${result.folder.name}: ${formatBytes(result.size)}`)
			.join('\n');
		this.statusBarItem.text = `$(database) ${totalFormatted}`;
		const tooltipLines = [`Total workspace size: ${totalFormatted}`];
		if (breakdownTooltip) {
			tooltipLines.push('', breakdownTooltip);
		}
		tooltipLines.push('', 'Click to recalculate now or press ⇧⌘P and search for "Workspace Size" for more actions.');
		this.statusBarItem.tooltip = tooltipLines.join('\n');
	}

	private showDetails(): void {
		if (!this.lastBreakdown.length) {
			vscode.window.showInformationMessage('Workspace size has not been calculated yet.');
			return;
		}
		const detailLines = this.lastBreakdown
			.map((result) => `${result.folder.name}: ${formatBytes(result.size)}`)
			.join('\n');
		vscode.window.showInformationMessage('Workspace size', { detail: detailLines, modal: false });
	}
}

export function activate(context: vscode.ExtensionContext): void {
	const indicator = new WorkspaceSizeIndicator(context);
	context.subscriptions.push(indicator);
}

export function deactivate(): void {}
