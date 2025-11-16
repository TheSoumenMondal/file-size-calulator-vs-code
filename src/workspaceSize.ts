import * as vscode from 'vscode';

export interface FolderSizeResult {
	folder: vscode.WorkspaceFolder;
	size: number;
}

export interface WorkspaceSizeCalculatorOptions {
	statConcurrency?: number;
}

interface StatRequest {
	uri: vscode.Uri;
	onResult: (stat: vscode.FileStat | undefined) => void;
}

const DEFAULT_CONCURRENCY = 32;

export class WorkspaceSizeCalculator {
	private readonly statConcurrency: number;

	constructor(private readonly options: WorkspaceSizeCalculatorOptions = {}) {
		this.statConcurrency = Math.max(1, options.statConcurrency ?? DEFAULT_CONCURRENCY);
	}

	async calculate(folders: readonly vscode.WorkspaceFolder[], token: vscode.CancellationToken): Promise<FolderSizeResult[]> {
		const tasks = folders.map(async (folder) => ({
			folder,
			size: await this.calculateFolderSize(folder, token)
		}));
		return Promise.all(tasks);
	}

	private async calculateFolderSize(folder: vscode.WorkspaceFolder, token: vscode.CancellationToken): Promise<number> {
		let totalSize = 0;
		const pendingDirectories: vscode.Uri[] = [folder.uri];
		const visitedDirectories = new Set<string>();

		while (pendingDirectories.length > 0 && !token.isCancellationRequested) {
			const currentDirectory = pendingDirectories.pop();
			if (!currentDirectory) {
				continue;
			}

			const directoryKey = currentDirectory.toString();
			if (visitedDirectories.has(directoryKey)) {
				continue;
			}
			visitedDirectories.add(directoryKey);

			let entries: [string, vscode.FileType][];
			try {
				entries = await vscode.workspace.fs.readDirectory(currentDirectory);
			} catch {
				continue;
			}

			const requests: StatRequest[] = [];

			for (const [name, type] of entries) {
				if (token.isCancellationRequested) {
					break;
				}

				const entryUri = vscode.Uri.joinPath(currentDirectory, name);

				if (type & vscode.FileType.Directory) {
					pendingDirectories.push(entryUri);
					continue;
				}

				if (type & vscode.FileType.File) {
					requests.push({
						uri: entryUri,
						onResult: (stat) => {
							if (stat && (stat.type & vscode.FileType.File)) {
								totalSize += stat.size;
							}
						}
					});
					continue;
				}

				if (type & vscode.FileType.SymbolicLink) {
					continue;
				}

				// Unknown types are resolved through an additional stat call.
				requests.push({
					uri: entryUri,
					onResult: (stat) => {
						if (!stat) {
							return;
						}
						if (stat.type & vscode.FileType.Directory) {
							pendingDirectories.push(entryUri);
						} else if (stat.type & vscode.FileType.File) {
							totalSize += stat.size;
						}
					}
				});
			}

			await this.processStatRequests(requests, token);
		}

		return totalSize;
	}

	private async processStatRequests(requests: StatRequest[], token: vscode.CancellationToken): Promise<void> {
		if (!requests.length || token.isCancellationRequested) {
			return;
		}

		for (let index = 0; index < requests.length && !token.isCancellationRequested; index += this.statConcurrency) {
			const slice = requests.slice(index, index + this.statConcurrency);
			const stats = await Promise.all(
				slice.map(async (request) => {
					if (token.isCancellationRequested) {
						return undefined;
					}
					try {
						return await vscode.workspace.fs.stat(request.uri);
					} catch {
						return undefined;
					}
				})
			);

			if (token.isCancellationRequested) {
				return;
			}

			for (let offset = 0; offset < slice.length; offset += 1) {
				slice[offset].onResult(stats[offset]);
			}
		}
	}
}

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) {
		return '0 B';
	}

	const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
	let value = bytes;
	let unitIndex = 0;

	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}

	const formatted = value >= 100 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
	return `${formatted} ${units[unitIndex]}`;
}
