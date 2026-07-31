import { JobProgress } from '../jobprogress';
import { Protocol, RSPWTPClient } from 'rsp-wtp-client';
import { ServerInfo } from 'rsp-wtp-server-connector-api';
import * as path from 'path';
import * as vscode from 'vscode';

const PROTOCOL_VERSION = '0.23.0';
const REQUEST_TIMEOUT_CONFIGURATION_KEY = 'requestTimeout';
const REQUEST_TIMEOUT_DEFAULT = 10000;
const FILE_CHANGE_CREATED = 1;
const FILE_CHANGE_CHANGED = 2;
const FILE_CHANGE_DELETED = 3;

type TraceCallback = (message: string) => void;

interface WatcherRegistration {
    watcher: vscode.FileSystemWatcher;
    listeners: vscode.Disposable[];
}

interface RSPWatcherState {
    client: RSPWTPClient;
    watchPatternsListener: (params: Protocol.WatchPatternsChangedParams) => void;
    watchers: Map<string, WatcherRegistration>;
}

const rspWatcherStates: Map<string, RSPWatcherState> = new Map<string, RSPWatcherState>();

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

export function initializeWorkspaceWatchers(
    rspId: string,
    client: RSPWTPClient,
    initialPatterns: string[] | undefined,
    traceCallback?: TraceCallback
): void {
    disposeWorkspaceWatchers(rspId);
    const watchPatternsListener = (params: Protocol.WatchPatternsChangedParams) => {
        applyWatchPatternChanges(rspId, client, params?.added || [], params?.removed || [], traceCallback);
    };
    rspWatcherStates.set(rspId, {
        client,
        watchPatternsListener,
        watchers: new Map<string, WatcherRegistration>(),
    });
    client.getIncomingHandler().onWatchPatternsChanged(watchPatternsListener);
    applyWatchPatternChanges(rspId, client, initialPatterns || [], [], traceCallback);
}

export function disposeWorkspaceWatchers(rspId: string): void {
    const state = rspWatcherStates.get(rspId);
    if (!state) {
        return;
    }
    state.client.getIncomingHandler().removeOnWatchPatternsChanged(state.watchPatternsListener);
    for (const registration of state.watchers.values()) {
        disposeWatcher(registration);
    }
    rspWatcherStates.delete(rspId);
}

function applyWatchPatternChanges(
    rspId: string,
    client: RSPWTPClient,
    added: string[],
    removed: string[],
    traceCallback?: TraceCallback
): void {
    const state = rspWatcherStates.get(rspId);
    if (!state || state.client !== client) {
        return;
    }
    for (const pattern of removed) {
        unregisterWatchPattern(state, pattern, traceCallback);
    }
    for (const pattern of added) {
        registerWatchPattern(state, rspId, pattern, traceCallback);
    }
}

function registerWatchPattern(
    state: RSPWatcherState,
    rspId: string,
    pattern: string,
    traceCallback?: TraceCallback
): void {
    if (!pattern || state.watchers.has(pattern)) {
        return;
    }
    const globPattern = toGlobPattern(pattern);
    if (!globPattern) {
        traceCallback?.(`[watcher] Ignoring invalid watch pattern for ${rspId}: ${pattern}`);
        return;
    }
    const watcher = vscode.workspace.createFileSystemWatcher(globPattern);
    const listeners = [
        watcher.onDidCreate(uri => forwardWatchedFileChange(state, rspId, uri, FILE_CHANGE_CREATED, traceCallback)),
        watcher.onDidChange(uri => forwardWatchedFileChange(state, rspId, uri, FILE_CHANGE_CHANGED, traceCallback)),
        watcher.onDidDelete(uri => forwardWatchedFileChange(state, rspId, uri, FILE_CHANGE_DELETED, traceCallback)),
    ];
    state.watchers.set(pattern, { watcher, listeners });
    traceCallback?.(`[watcher] Registered ${pattern}`);
}

function unregisterWatchPattern(state: RSPWatcherState, pattern: string, traceCallback?: TraceCallback): void {
    const registration = state.watchers.get(pattern);
    if (!registration) {
        return;
    }
    disposeWatcher(registration);
    state.watchers.delete(pattern);
    traceCallback?.(`[watcher] Removed ${pattern}`);
}

function disposeWatcher(registration: WatcherRegistration): void {
    for (const listener of registration.listeners) {
        listener.dispose();
    }
    registration.watcher.dispose();
}

function forwardWatchedFileChange(
    state: RSPWatcherState,
    rspId: string,
    uri: vscode.Uri,
    type: number,
    traceCallback?: TraceCallback
): void {
    const activeState = rspWatcherStates.get(rspId);
    if (!activeState || activeState !== state) {
        return;
    }
    state.client.getOutgoingWTPHandler().didChangeWatchedFiles({
        changes: [{ uri: uri.toString(), type }],
    });
    traceCallback?.(`[watcher] ${changeTypeLabel(type)} ${uri.fsPath}`);
}

function changeTypeLabel(type: number): string {
    switch (type) {
        case FILE_CHANGE_CREATED:
            return 'create';
        case FILE_CHANGE_DELETED:
            return 'delete';
        default:
            return 'change';
    }
}

function toGlobPattern(pattern: string): vscode.GlobPattern | undefined {
    const normalized = pattern.trim().replace(/\\/g, '/');
    if (!normalized) {
        return undefined;
    }
    if (normalized.endsWith('/**')) {
        const basePath = normalized.slice(0, -3);
        return new vscode.RelativePattern(vscode.Uri.file(basePath), '**');
    }
    const directory = path.posix.dirname(normalized);
    const filePattern = path.posix.basename(normalized);
    if (!directory || directory === '.' || directory === normalized) {
        return normalized;
    }
    return new vscode.RelativePattern(vscode.Uri.file(directory), filePattern);
}
