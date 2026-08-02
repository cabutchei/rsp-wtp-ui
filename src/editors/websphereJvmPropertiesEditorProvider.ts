import * as vscode from 'vscode';
import { WebSphereJvmPropertiesWebview } from '../webviews/websphereJvmPropertiesWebview';

export class WebSphereJvmPropertiesEditorProvider implements vscode.CustomTextEditorProvider {
    public static readonly viewType = 'rsp.websphereJvmPropertiesEditor';

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new WebSphereJvmPropertiesEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(WebSphereJvmPropertiesEditorProvider.viewType, provider, {
            webviewOptions: {
                retainContextWhenHidden: true,
            },
            supportsMultipleEditorsPerDocument: false,
        });
    }

    private constructor(private readonly context: vscode.ExtensionContext) {
    }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media'),
                vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'react', 'umd'),
                vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'react-dom', 'umd'),
            ],
        };
        webviewPanel.webview.html = WebSphereJvmPropertiesWebview.getHtml(webviewPanel.webview, this.context.extensionUri);

        const updateWebview = () => {
            webviewPanel.webview.postMessage({
                type: 'jvmProperties',
                payload: {
                    entries: this.parseEntries(document.getText()),
                    mode: 'document',
                },
            });
        };

        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri.toString() !== document.uri.toString()) {
                return;
            }
            updateWebview();
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
        });

        webviewPanel.webview.onDidReceiveMessage(async message => {
            if (!message) {
                return;
            }
            if (message.type === 'ready') {
                updateWebview();
                return;
            }
            if (message.type === 'update') {
                await this.replaceDocument(document, message.entries);
                return;
            }
            if (message.type === 'saveDocument') {
                await document.save();
            }
        });
    }

    private parseEntries(content: string): any[] {
        if (!content || !content.trim()) {
            return [];
        }
        try {
            const parsed = JSON.parse(content);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    private async replaceDocument(document: vscode.TextDocument, entries: any): Promise<void> {
        const next = JSON.stringify(Array.isArray(entries) ? entries : [], null, 2);
        const edit = new vscode.WorkspaceEdit();
        const start = new vscode.Position(0, 0);
        const end = document.positionAt(document.getText().length);
        edit.replace(document.uri, new vscode.Range(start, end), `${next}\n`);
        await vscode.workspace.applyEdit(edit);
    }
}
