// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as path from 'path';
import * as vscode from 'vscode';
import {
    encodeMessageForChannel,
    WebSocketEvent,
} from './common/webviewEvents';
import { JsDebugProxyPanelSocket } from './JsDebugProxyPanelSocket';
import { PanelSocket } from './panelSocket';
import {
    SETTINGS_STORE_NAME,
} from './utils';
import { AccessibilityInsightsView } from './accessibilityInsights/view';

export class AccessibilityInsightsPanel {
    private readonly context: vscode.ExtensionContext;
    private readonly extensionPath: string;
    private readonly panel: vscode.WebviewPanel;
    private targetUrl: string
    private panelSocket: PanelSocket;
    static instance: AccessibilityInsightsPanel | undefined;
    private readonly diagnosticsCollection: vscode.DiagnosticCollection;

    private constructor(
        panel: vscode.WebviewPanel,
        context: vscode.ExtensionContext,
        targetUrl: string,
        isJsDebugProxiedCDPConnection: boolean) {
        this.panel = panel;
        this.context = context;
        this.targetUrl = targetUrl;
        this.extensionPath = this.context.extensionPath;

        if (isJsDebugProxiedCDPConnection) {
            this.panelSocket = new JsDebugProxyPanelSocket(this.targetUrl, (e, msg) => this.postToWebview(e, msg));
        } else {
            this.panelSocket = new PanelSocket(this.targetUrl, (e, msg) => this.postToWebview(e, msg));
        }
        this.panelSocket.on('close', () => this.onSocketClose());
        this.panelSocket.on('websocket', msg => this.onSocketMessage(msg));

        // Handle closing
        this.panel.onDidDispose(() => {
            this.dispose();
            this.panelSocket.dispose();
        }, this);

        // Handle view change
        this.panel.onDidChangeViewState(_e => {
            if (this.panel.visible) {
                this.update();
            }
        }, this);

        this.panelSocket.on('runAutomatedChecks', () => this.runAutomatedChecks());

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(message => {
            this.panelSocket.onMessageFromWebview(message);
        }, this);

        this.diagnosticsCollection = vscode.languages.createDiagnosticCollection('Accessibility Insights');
    }

    dispose(): void {
        AccessibilityInsightsPanel.instance = undefined;

        this.panel.dispose();
        this.panelSocket.dispose();
    }

    private onSocketClose() {
        this.dispose();
    }

    private convertImpactToDiagSeverity(impact: string) : vscode.DiagnosticSeverity {
        if (impact === 'serious' || impact === 'critical'){
            return vscode.DiagnosticSeverity.Error
        }
        return vscode.DiagnosticSeverity.Warning
    }

    private getPosition(documentContent: string, index: number): vscode.Position {
        // TODO seems like there should be an easier way to do this, but can't find it from the API docs
        const priorDocumentContent = documentContent.substring(0, index);
        const lineCount = priorDocumentContent.split('\n').length;
        const priorLineCharCount = priorDocumentContent.lastIndexOf('\n');
        const characterCount = index - priorLineCharCount;
        return new vscode.Position(lineCount - 1, characterCount - 1);
    }

    // Determine where in the source file the violation is
    private async getViolationRange(uri: vscode.Uri, html: string): Promise<vscode.Range> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            let documentContent = document.getText();
            const startIndex = documentContent.indexOf(html);
            if (startIndex < 0) {
                throw new Error('Violating HTML does not appear in document.');
            }
            const endIndex = startIndex + html.length;
            return new vscode.Range(this.getPosition(documentContent, startIndex), this.getPosition(documentContent, endIndex));
        } catch {
            return new vscode.Range(0, 0, 0, 0);
        }
    }

    private onSocketMessage(message: string) {
        // If inspect mode is toggled on the DevTools, we need to let the standalone screencast
        // know in order to enable hover events to be sent through.
        if (message && message.includes('AutomatedChecks')) {
            try {
                const cdpMsg = JSON.parse((JSON.parse(message) as {message: string}).message) as 
                    {method: string, params: {result: {violations: {id: string, impact: string, help: string, nodes: {html: string}[]}[], url: string}}};
                if (cdpMsg.method === 'Page.runAutomatedChecks') {
                   this.runAutomatedChecks()
                }
                if(cdpMsg.method === 'AccessibilityInsights.showAutomatedChecksResults') {
                    if (cdpMsg.params.result.violations.length === 0) {
                        vscode.window.showInformationMessage(`No accessibility violations detected in ${cdpMsg.params.result.url}`);
                        this.diagnosticsCollection.clear();
                        return;
                    }

                    const uri = vscode.Uri.parse(cdpMsg.params.result.url);
                    const diagnosticsPromises : Promise<vscode.Diagnostic>[] = [];
                    for (const violation of cdpMsg.params.result.violations) {
                        for (const node of violation.nodes) {
                            diagnosticsPromises.push(this.getViolationRange(uri, node.html).then(range => {
                                return {code: violation.id,
                                    message: violation.help,
                                    severity: this.convertImpactToDiagSeverity(violation.impact),
                                    range: range
                                }
                            }));
                        }
                    }
                    Promise.all(diagnosticsPromises).then(diagnosticsResults => {
                        // Update problems pane
                        this.diagnosticsCollection.clear();
                        this.diagnosticsCollection.set(uri, diagnosticsResults);
                    });
                }
            } catch (e) {
                // Ignore
            }
        }
        // TODO: Handle message
    }

    private update() {
        this.panel.webview.html = this.getHtmlForWebview();
    }

    private postToWebview(e: WebSocketEvent, message?: string) {
        encodeMessageForChannel(msg => this.panel.webview.postMessage(msg) as unknown as void, 'websocket', { event: e, message });
    }

    private runAutomatedChecks(){
        console.log('PANEL MESSAGE?')

    }

    private getHtmlForWebview() {
        const inspectorPath = vscode.Uri.file(path.join(this.extensionPath, 'out/accessibilityInsights', 'accessibilityInsights.bundle.js'));
        const inspectorUri = this.panel.webview.asWebviewUri(inspectorPath);
		const codiconsUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
        const cssPath = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'out/accessibilityInsights', 'view.css'));
        const view = new AccessibilityInsightsView(this.panel.webview.cspSource, cssPath, codiconsUri, inspectorUri);
        return view.render();
    }

    static createOrShow(context: vscode.ExtensionContext, targetUrl: string, isJsDebugProxiedCDPConnection = false): void {
        const column = vscode.ViewColumn.Beside;
        if (AccessibilityInsightsPanel.instance) {
            AccessibilityInsightsPanel.instance.dispose();
        } else {
            const panel = vscode.window.createWebviewPanel(SETTINGS_STORE_NAME, 'Accessibility Insights', column, {
                enableCommandUris: true,
                enableScripts: true,
                retainContextWhenHidden: true,
            });
            AccessibilityInsightsPanel.instance = new AccessibilityInsightsPanel(panel, context, targetUrl, isJsDebugProxiedCDPConnection);
        }
    }
}
