import { JobProgress } from '../jobprogress';
import { Protocol, RSPWTPClient, StatusSeverity } from 'rsp-wtp-client';
import * as vscode from 'vscode';
import { ServerInfo } from 'rsp-wtp-server-connector-api';

const PROTOCOL_VERSION = '0.23.0';

export interface WorkspaceInitialization {
    dispose(): void;
}

export async function initClient(serverInfo: ServerInfo): Promise<RSPWTPClient> {
    const client = new RSPWTPClient('localhost', serverInfo.port);
    await client.connect();
    client.getIncomingHandler().onPromptString(event => {
        return new Promise<string>((resolve, reject) => {
            vscode.window.showInputBox({ prompt: event.prompt, password: true })
                .then(value => {
                    if (value && value.trim().length) {
                        resolve(value);
                    } else {
                        reject(new Error('Cancelled by user'));
                    }
                });
        });
    });
    client.getIncomingHandler().onMessageBox(event => {
        return new Promise<string>((resolve, reject) => {
            if(event.severity === 1) {
                // info
                vscode.window.showInformationMessage(event.message);
            } else if(event.severity === 2) {
                // warning
                vscode.window.showWarningMessage(event.message);
            } else if(event.severity === 4) {
                // error
                vscode.window.showErrorMessage(event.message);
            }
        });
    });

    client.getOutgoingHandler().registerClientCapabilities({ 
        map: { 
            'protocol.version': PROTOCOL_VERSION, 
            'prompt.string': 'true',
            'messagebox': 'true',
        } 
    });
    JobProgress.create(client);

    return client;
}

export async function initializeWorkspace(client: RSPWTPClient): Promise<WorkspaceInitialization> {
    const toWorkspaceFolder = (folder: vscode.WorkspaceFolder): Protocol.WorkspaceFolder => ({
        uri: folder.uri.toString(),
        name: folder.name,
    });

    const sendWorkspaceFolders = (added: ReadonlyArray<vscode.WorkspaceFolder>, removed: ReadonlyArray<vscode.WorkspaceFolder>) => {
        const params: Protocol.DidChangeWorkspaceFoldersParams = {
            event: {
                added: added.map(toWorkspaceFolder),
                removed: removed.map(toWorkspaceFolder),
            },
        };
        client.getOutgoingWTPHandler().didChangeWorkspaceFolders(params);
    };
    const outgoingWTP: any = client.getOutgoingWTPHandler() as any;

    const sendWatchedFileEvent = (uri: vscode.Uri, type: number) => {
        const params: any = {
            changes: [{ uri: uri.toString(), type }],
        };
        if (typeof outgoingWTP.didChangeWatchedFiles === 'function') {
            outgoingWTP.didChangeWatchedFiles(params);
        }
    };

    const initialFolders = vscode.workspace.workspaceFolders || [];
    let init: any = undefined;
    if (typeof outgoingWTP.initialize === 'function') {
        init = await outgoingWTP.initialize({
            workspaceFolders: initialFolders.map(toWorkspaceFolder),
        });
        if (init?.status && !StatusSeverity.isOk(init.status)) {
            throw new Error(init.status.message || 'Workspace initialization failed');
        }
    } else {
        sendWorkspaceFolders(initialFolders, []);
    }

    const watchDisposables: vscode.Disposable[] = [];
    const watchPatterns = init?.watchPatterns || [];
    for (const pattern of watchPatterns) {
        if (!pattern || !pattern.trim().length) {
            continue;
        }
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        watchDisposables.push(watcher);
        watchDisposables.push(watcher.onDidCreate(uri => sendWatchedFileEvent(uri, 1)));
        watchDisposables.push(watcher.onDidChange(uri => sendWatchedFileEvent(uri, 2)));
        watchDisposables.push(watcher.onDidDelete(uri => sendWatchedFileEvent(uri, 3)));
    }

    const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(event => {
        sendWorkspaceFolders(event.added, event.removed);
    });

    return {
        dispose() {
            workspaceListener.dispose();
            for (const disposable of watchDisposables) {
                disposable.dispose();
            }
        }
    };
}
