import { JobProgress } from '../jobprogress';
import { RSPWTPClient } from 'rsp-wtp-client';
import { ServerInfo } from 'rsp-wtp-server-connector-api';
import * as vscode from 'vscode';

const PROTOCOL_VERSION = '0.23.0';
const REQUEST_TIMEOUT_CONFIGURATION_KEY = 'requestTimeout';
const REQUEST_TIMEOUT_DEFAULT = 10000;

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
