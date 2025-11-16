# Size Calculator for VS Code

Size Calculator adds a live status bar indicator that reports the total size of the open workspace and optional per-folder breakdowns.

## Features
- Calculates the combined size of every folder in the current workspace using the VS Code file system APIs.
- Displays the total size in the status bar with one-click access to a manual refresh.
- Shows a detailed breakdown per workspace folder through the command palette or the status bar command.
- Debounces file events to avoid running multiple calculations while you are actively editing files.

## Getting Started
1. Install the extension from the VS Code Marketplace or side-load the packaged `.vsix`.
2. Open a folder or multi-root workspace. The indicator appears in the status bar once initialization completes.
3. Wait for the first calculation to finish; the indicator automatically refreshes whenever files change.

## Commands
- `Size Calculator: Show Workspace Size Details` shows the per-folder breakdown in a quick pick message.
- `Size Calculator: Recalculate Workspace Size` forces a fresh scan and updates the status bar immediately.

Both commands are available from the command palette whenever a workspace folder is open.

## Requirements
The extension targets VS Code `^1.105.0` or newer and relies solely on built-in APIs. No additional dependencies are required.

## Status Bar Behavior
- When a workspace is open the indicator displays either the calculated total size or a progress spinner while scanning.
- If a calculation fails the indicator shows an error state and offers a retry command.
- When no workspace is open the indicator hides itself to reduce noise.

## Development
### Install
```
npm install
```

### Common scripts
- `npm run watch` runs the TypeScript type checker and esbuild in watch mode.
- `npm run compile` performs type checking, linting, and creates a production-ready bundle.
- `npm test` builds and launches the VS Code integration tests.

### Debugging
Use the `Extension` launch configuration in VS Code to run and debug the extension inside the Extension Development Host.

## Limitations
- Large workspaces can take time to scan because the extension must stat every file through the VS Code API.
- Network or remote file systems might report sizes slowly or inconsistently depending on the provider.

## Support
Please open an issue in the repository if you encounter a bug or have a feature request.
