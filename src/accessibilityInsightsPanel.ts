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

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(message => {
            this.panelSocket.onMessageFromWebview(message);
        }, this);

    }

    dispose(): void {
        AccessibilityInsightsPanel.instance = undefined;

        this.panel.dispose();
        this.panelSocket.dispose();
    }

    private onSocketClose() {
        this.dispose();
    }

    private update() {
        this.panel.webview.html = this.getHtmlForWebview();
    }

    private postToWebview(e: WebSocketEvent, message?: string) {
        encodeMessageForChannel(msg => this.panel.webview.postMessage(msg) as unknown as void, 'websocket', { event: e, message });
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
