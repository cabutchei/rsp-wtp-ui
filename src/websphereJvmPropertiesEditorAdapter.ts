import * as fs from 'fs';
import { Protocol, StatusSeverity } from 'rsp-wtp-client';
import { ServerExplorer } from './serverExplorer';
import * as tmp from 'tmp';
import * as vscode from 'vscode';
import { WebSphereJvmPropertiesEditorProvider } from './editors/websphereJvmPropertiesEditorProvider';

export const WEBSPHERE_SERVER_ACTION_CONTEXT_KEY = '__wtpServerActionContext';

interface WebSphereJvmPropertiesEditorContext {
    actionId: string;
    dataKey: string;
    rspId: string;
    serverId: string;
}

export class WebSphereJvmPropertiesEditorAdapter {
    private static instance: WebSphereJvmPropertiesEditorAdapter;
    private readonly tmpFiles = new Map<string, WebSphereJvmPropertiesEditorContext>();
    private readonly tmpFilePrefix = 'tmpWebSphereJvmProperties';

    private constructor(private readonly explorer: ServerExplorer) {
    }

    public static getInstance(explorer: ServerExplorer): WebSphereJvmPropertiesEditorAdapter {
        if (!WebSphereJvmPropertiesEditorAdapter.instance) {
            WebSphereJvmPropertiesEditorAdapter.instance = new WebSphereJvmPropertiesEditorAdapter(explorer);
        }
        return WebSphereJvmPropertiesEditorAdapter.instance;
    }

    public async openEditor(
        workflowMap: { [index: string]: any },
        item: Protocol.WorkflowResponseItem,
    ): Promise<void> {
        const context = workflowMap[WEBSPHERE_SERVER_ACTION_CONTEXT_KEY] as WebSphereJvmPropertiesEditorContext;
        if (!context || !context.rspId || !context.serverId || !context.actionId) {
            return Promise.reject('Missing WebSphere JVM properties editor context.');
        }

        const dataKey = item.properties?.dataKey || item.id || 'websphere.jvm.properties';
        const content = this.normalizeContent(item.content);
        const path = await this.createTempFile(context.serverId, content);
        this.tmpFiles.set(path, {
            actionId: context.actionId,
            dataKey: dataKey,
            rspId: context.rspId,
            serverId: context.serverId,
        });

        const uri = vscode.Uri.file(path);
        await vscode.commands.executeCommand('vscode.openWith', uri, WebSphereJvmPropertiesEditorProvider.viewType);
    }

    public async onDidSaveTextDocument(doc: vscode.TextDocument): Promise<void> {
        if (!doc || !doc.uri || !doc.uri.fsPath) {
            return;
        }
        const context = this.tmpFiles.get(doc.uri.fsPath);
        if (!context) {
            return;
        }

        this.parseDocument(doc.getText());

        const client = this.explorer.getClientByRSP(context.rspId);
        if (!client) {
            return Promise.reject('Unable to contact the RSP server.');
        }

        const request: Protocol.ServerActionRequest = {
            actionId: context.actionId,
            data: {
                [context.dataKey]: doc.getText(),
            },
            requestId: null,
            serverId: context.serverId,
        };

        let response = await client.getOutgoingHandler().executeServerAction(request);
        if (!response) {
            return;
        }

        while (true) {
            if (StatusSeverity.isError(response.status) || StatusSeverity.isCancel(response.status)) {
                return Promise.reject(response.status?.message || 'Failed to save WebSphere JVM properties.');
            }
            if (!StatusSeverity.isInfo(response.status)) {
                return;
            }

            request.requestId = response.requestId;
            response = await client.getOutgoingHandler().executeServerAction(request);
            if (!response) {
                return;
            }
        }
    }

    public async onDidCloseTextDocument(doc: vscode.TextDocument): Promise<void> {
        if (!doc || !doc.uri || !doc.uri.fsPath) {
            return;
        }
        const context = this.tmpFiles.get(doc.uri.fsPath);
        if (!context) {
            return;
        }
        this.tmpFiles.delete(doc.uri.fsPath);
        fs.unlink(doc.uri.fsPath, () => {
            return;
        });
    }

    private normalizeContent(content?: string): string {
        const parsed = this.parseDocument(content);
        return `${JSON.stringify(parsed, null, 2)}\n`;
    }

    private parseDocument(content?: string): any[] {
        if (!content || !content.trim()) {
            return [];
        }
        try {
            const parsed = JSON.parse(content);
            if (!Array.isArray(parsed)) {
                throw new Error('WebSphere JVM properties document must contain a JSON array.');
            }
            return parsed;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Invalid WebSphere JVM properties document: ${message}`);
        }
    }

    private createTempFile(serverId: string, content: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            tmp.file(
                { prefix: `${this.tmpFilePrefix}-${serverId}-`, postfix: '.rsp-jvm-properties.json' },
                (error, path) => {
                    if (error) {
                        reject('Could not create WebSphere JVM properties temp file.');
                        return;
                    }
                    fs.writeFile(path, content, undefined, writeError => {
                        if (writeError) {
                            reject(`Unable to write WebSphere JVM properties temp file: ${writeError}`);
                            return;
                        }
                        resolve(path);
                    });
                },
            );
        });
    }
}
