/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface WebviewHtmlOptions {
    title: string;
    webview: vscode.Webview;
    styleUri?: vscode.Uri;
    scriptUri?: vscode.Uri;
    extraScriptUris?: vscode.Uri[];
}

export function createWebviewHtml(options: WebviewHtmlOptions): string {
    const nonce = getNonce();
    const scriptTags = buildScriptTags(options.webview, nonce, options.extraScriptUris, options.scriptUri);
    const styleTag = options.styleUri
        ? `<link rel="stylesheet" href="${options.webview.asWebviewUri(options.styleUri)}">`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${options.webview.cspSource}; img-src ${options.webview.cspSource}; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${styleTag}
    <title>${options.title}</title>
</head>
<body>
    <div id="root"></div>
    ${scriptTags}
</body>
</html>`;
}

function buildScriptTags(
    webview: vscode.Webview,
    nonce: string,
    extraScriptUris?: vscode.Uri[],
    scriptUri?: vscode.Uri,
): string {
    const tags: string[] = [];
    if (extraScriptUris) {
        for (const uri of extraScriptUris) {
            tags.push(`<script nonce="${nonce}" src="${webview.asWebviewUri(uri)}"></script>`);
        }
    }
    if (scriptUri) {
        tags.push(`<script nonce="${nonce}" src="${webview.asWebviewUri(scriptUri)}"></script>`);
    }
    return tags.join('\n    ');
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
