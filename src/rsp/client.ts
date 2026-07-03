import { JobProgress } from '../jobprogress';
import { Protocol, RSPWTPClient, StatusSeverity } from 'rsp-wtp-client';
import * as vscode from 'vscode';
import { ServerInfo } from 'rsp-wtp-server-connector-api';

const PROTOCOL_VERSION = '0.23.0';
const REQUEST_TIMEOUT_CONFIGURATION_KEY = 'requestTimeout';
const REQUEST_TIMEOUT_DEFAULT = 10000;

export interface WorkspaceInitialization {
    dispose(): void;
}

type TraceCallback = (message: string) => void;

function getConfiguredRequestTimeout(): number {
    const configured = vscode.workspace.getConfiguration('wtp-rsp-ui')
        .get<number>(REQUEST_TIMEOUT_CONFIGURATION_KEY, REQUEST_TIMEOUT_DEFAULT);
    return typeof configured === 'number' && Number.isFinite(configured) && configured > 0
        ? configured
        : REQUEST_TIMEOUT_DEFAULT;
}

function applyGlobalRequestTimeout(handler: any): void {
    if (!handler) {
        return;
    }
    const proto = Object.getPrototypeOf(handler);
    if (!proto) {
        return;
    }
    for (const key of Object.getOwnPropertyNames(proto)) {
        if (key === 'constructor') {
            continue;
        }
        const original = handler[key];
        if (typeof original !== 'function') {
            continue;
        }
        handler[key] = (...args: any[]) => {
            const lastArg = args.length > 0 ? args[args.length - 1] : undefined;
            if (typeof lastArg === 'number') {
                return original.apply(handler, args);
            }
            return original.apply(handler, [...args, getConfiguredRequestTimeout()]);
        };
    }
}

export async function initClient(serverInfo: ServerInfo, traceCallback?: TraceCallback): Promise<RSPWTPClient> {
    const client = new RSPWTPClient('localhost', serverInfo.port);
    await client.connectWithTrace(getConfiguredRequestTimeout(), traceCallback);
    applyGlobalRequestTimeout(client.getOutgoingHandler());
    applyGlobalRequestTimeout(client.getOutgoingWTPHandler());
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

    type WatchRegistration = {
        refs: number;
        disposables: vscode.Disposable[];
    };
    const watchRegistrations = new Map<string, WatchRegistration>();
    const normalizePattern = (pattern: string): string => pattern.trim();
    const addWatchPattern = (pattern: string): void => {
        if (!pattern || !pattern.trim().length) {
            return;
        }
        const normalized = normalizePattern(pattern);
        const existing = watchRegistrations.get(normalized);
        if (existing) {
            existing.refs += 1;
            return;
        }
        const watcher = vscode.workspace.createFileSystemWatcher(normalized);
        const disposables: vscode.Disposable[] = [
            watcher,
            watcher.onDidCreate(uri => sendWatchedFileEvent(uri, 1)),
            watcher.onDidChange(uri => sendWatchedFileEvent(uri, 2)),
            watcher.onDidDelete(uri => sendWatchedFileEvent(uri, 3)),
        ];
        watchRegistrations.set(normalized, { refs: 1, disposables });
    };
    const removeWatchPattern = (pattern: string): void => {
        if (!pattern || !pattern.trim().length) {
            return;
        }
        const normalized = normalizePattern(pattern);
        const existing = watchRegistrations.get(normalized);
        if (!existing) {
            return;
        }
        existing.refs -= 1;
        if (existing.refs > 0) {
            return;
        }
        for (const disposable of existing.disposables) {
            disposable.dispose();
        }
        watchRegistrations.delete(normalized);
    };
    const watchPatterns = init?.watchPatterns || [];
    for (const pattern of watchPatterns) {
        addWatchPattern(pattern);
    }

    const watchPatternsChangedListener = (params: Protocol.WatchPatternsChangedParams) => {
        const added = params?.added || [];
        const removed = params?.removed || [];
        for (const pattern of added) {
            addWatchPattern(pattern);
        }
        for (const pattern of removed) {
            removeWatchPattern(pattern);
        }
    };
    client.getIncomingHandler().onWatchPatternsChanged(watchPatternsChangedListener);

    const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(event => {
        sendWorkspaceFolders(event.added, event.removed);
    });

    return {
        dispose() {
            workspaceListener.dispose();
            client.getIncomingHandler().removeOnWatchPatternsChanged(watchPatternsChangedListener);
            for (const registration of watchRegistrations.values()) {
                for (const disposable of registration.disposables) {
                    disposable.dispose();
                }
            }
            watchRegistrations.clear();
        }
    };
}
