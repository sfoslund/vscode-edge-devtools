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
    SETTINGS_STORE_NAME, SETTINGS_VIEW_NAME,
} from './utils/utils';
import { AccessibilityInsightsView } from './accessibilityInsights/view';
import fs from 'fs';

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
    private async getViolationRange(uri: vscode.Uri, html: string): Promise<vscode.Range | undefined> {
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
            return undefined;
        }
    }

    // Determine which source files might correspond to the given url
    private async getDocumentUris(url: string): Promise<vscode.Uri[]> {
        try {
            if (fs.existsSync(url)) {
                return [vscode.Uri.parse((url))];
            } else {
                let fileName = url.split('/').filter(urlElement => urlElement).pop();
                fileName = fileName?.includes('localhost') ? 'index' : fileName;
                const htmlFiles = await vscode.workspace.findFiles(`**/${fileName}.html`);
                return htmlFiles;
            }
        } catch (e) {
            // Don't show the violation in the problems pane at all if we can't find the source code
            return [];
        }
    }

    private onSocketMessage(message: string) {
        // If inspect mode is toggled on the DevTools, we need to let the standalone screencast
        // know in order to enable hover events to be sent through.
        if (message && (message.includes('AutomatedChecks') || message.includes('AccessibilityInsights'))) {
            try {
                const cdpMsg = JSON.parse((JSON.parse(message) as {message: string}).message) as 
                    {method: string, params: {result: {violations: {id: string, impact: string, help: string, nodes: {html: string}[]}[], url: string}}};
                const { method, params } = JSON.parse((JSON.parse(message) as {message: string}).message) as {method: string, params: any };
                if (method === 'Page.runAutomatedChecks') {
                    this.runAutomatedChecks()
                }
                if(method === 'AccessibilityInsights.injectScripts') {
                    void vscode.commands.executeCommand(`${SETTINGS_VIEW_NAME}.injectScripts`, true);
                }
                if(method === 'AccessibilityInsights.showAutomatedChecksResults') {
                    if (cdpMsg.params.result.violations.length === 0) {
                        vscode.window.showInformationMessage(`No accessibility violations detected in ${cdpMsg.params.result.url}`);
                        this.diagnosticsCollection.clear();
                        return;
                    }

                    this.getDocumentUris(cdpMsg.params.result.url).then(uris => {
                        const diagnosticsPromises : Promise<[vscode.Uri, vscode.Diagnostic | undefined]>[] = [];
                        for (const uri of uris) {
                            for (const violation of cdpMsg.params.result.violations) {
                                for (const node of violation.nodes) {
                                    const newPromise : Promise<[vscode.Uri, vscode.Diagnostic | undefined]> = this.getViolationRange(uri, node.html).then(range => {
                                        if (range) {
                                            // Construct violation pointing to correct location in the source file
                                            return [uri, {code: `Accessibility Insights (${violation.id})`,
                                                message: violation.help,
                                                severity: this.convertImpactToDiagSeverity(violation.impact),
                                                range: range
                                            }];
                                        } else {
                                            // Couldn't find the violating code snippet in this file, don't highlight anything
                                            return [uri, undefined];
                                        }
                                    });

                                    diagnosticsPromises.push(newPromise);
                                }
                            }
                        }
                        Promise.all(diagnosticsPromises).then(diagnosticsResults => {
                            // Update problems pane
                            this.diagnosticsCollection.clear();
                            const uris = diagnosticsResults.map(result => result[0])
                                .filter((value, index, self) => self.indexOf(value) === index);
                            for (const uri of uris) {
                                const diagResults = diagnosticsResults.filter(res => res[0] === uri)
                                    .map(res => res[1])
                                    .filter(diagnostic => diagnostic) as vscode.Diagnostic[];
                                this.diagnosticsCollection.set(uri, diagResults);
                            }
                        });
                    });
                }
                if(method === 'AccessibilityInsights.logAutomatedChecks'){
                    console.log({params, message})
                }
            } catch (e) {
                console.log("AN ERROR", e)
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

    public runAutomatedChecks(){
        encodeMessageForChannel(msg => this.panel.webview.postMessage(msg) as unknown as void, 'runAutomatedChecks', {});
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
