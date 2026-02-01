/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { createWebviewHtml } from './webviewHtml';

export interface WebSphereJvmProperty {
    name: string;
    value: string;
    required?: boolean;
}

export interface WebSphereJvmPropertiesWebviewData {
    entries: WebSphereJvmProperty[];
    subtitle?: string;
}

export class WebSphereJvmPropertiesWebview {
    public static readonly viewType = 'rsp.websphereJvmProperties';

    public static show(
        context: vscode.ExtensionContext,
        data: WebSphereJvmPropertiesWebviewData,
        onMessage?: (message: any, panel: vscode.WebviewPanel) => void | Promise<void>,
    ): vscode.WebviewPanel {
        const panel = vscode.window.createWebviewPanel(
            WebSphereJvmPropertiesWebview.viewType,
            'WebSphere JVM Properties',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media'),
                    vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'react', 'umd'),
                    vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'react-dom', 'umd'),
                ],
            },
        );

        panel.webview.html = WebSphereJvmPropertiesWebview.getHtml(panel.webview, context.extensionUri);
        panel.webview.onDidReceiveMessage(message => {
            if (!message || message.type !== 'ready') {
                if (onMessage) {
                    void onMessage(message, panel);
                }
                return;
            }
            panel.webview.postMessage({
                type: 'jvmProperties',
                payload: data,
            });
        });
        return panel;
    }

    private static getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
        const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media', 'websphere-jvm-properties');
        const scriptUri = vscode.Uri.joinPath(mediaRoot, 'main.js');
        const styleUri = vscode.Uri.joinPath(mediaRoot, 'styles.css');
        const reactUri = vscode.Uri.joinPath(extensionUri, 'node_modules', 'react', 'umd', 'react.development.js');
        const reactDomUri = vscode.Uri.joinPath(extensionUri, 'node_modules', 'react-dom', 'umd', 'react-dom.development.js');

        return createWebviewHtml({
            title: 'WebSphere JVM Properties',
            webview,
            styleUri,
            scriptUri,
            extraScriptUris: [reactUri, reactDomUri],
        });
    }
}
