// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { AccessibilityInsightsCDPConnection } from './cdp';

export class AccessibilityInsights {
    private cdpConnection = new AccessibilityInsightsCDPConnection();
    private automatedChecksButton: HTMLButtonElement;
    // private screencastWrapper: HTMLElement;
    // private inactiveOverlay: HTMLElement;
    // private inspectMode = false;

    constructor() {
        console.log('CREATING WEBVIEW')
        this.automatedChecksButton = document.getElementById('automated-checks') as HTMLButtonElement;

        this.automatedChecksButton.addEventListener('click', () => this.onAutomatedChecks());


        //register for events:
        //Page.automatedChecksCompleted
        //Page.visualizationsVisibilityChanged
        //Page.axeIsDefined

        //trigger events
        this.cdpConnection.registerForEvent('AccessibilityInsights.runAutomatedChecks', result => this.onRunAutomatedChecks(result))
        //runAutomatedChecks
        //toggleVisualizations
        //showResults
        //injectScripts


        // this.cdpConnection.registerForEvent('Page.automatedChecksCompleted', result => this.onAutomatedChecksCompleted(result));
        // this.cdpConnection.registerForEvent('Page.screencastFrame', result => this.onScreencastFrame(result));
        // this.cdpConnection.registerForEvent('Page.screencastVisibilityChanged', result => this.onScreencastVisibilityChanged(result));

        // // This message comes from the DevToolsPanel instance.
        // this.cdpConnection.registerForEvent('DevTools.toggleInspect', result => this.onToggleInspect(result));

        this.cdpConnection.sendMessageToBackend('Page.enable', {});

    }

    private onAutomatedChecks(): void {
        console.log('CLICKED')
        this.cdpConnection.sendMessageToBackend('Page.runAutomatedChecks', {})
    }

    private onRunAutomatedChecks(result: any): void {
        console.log(result)
    }


    // private updateHistory(): void {
    //     this.cdpConnection.sendMessageToBackend('Page.getNavigationHistory', {}, result => {
    //         const {currentIndex, entries} = result;
    //         this.history = entries;
    //         this.historyIndex = currentIndex;
    //         this.backButton.disabled = this.historyIndex < 1;
    //         this.forwardButton.disabled = this.historyIndex >= this.history.length - 1;
    //         this.urlInput.value = this.history[this.historyIndex].url;
    //     });
    // }

    // private updateEmulation(): void {
    //     const isTouch = this.isDeviceTouch();
    //     const deviceMetricsParams = {
    //         width: this.width,
    //         height: this.height,
    //         deviceScaleFactor: 0,
    //         mobile: isTouch,
    //     };
    //     const touchEmulationParams = {
    //         enabled: isTouch,
    //         maxTouchPoints: 1,
    //     };

    //     this.cdpConnection.sendMessageToBackend('Emulation.setUserAgentOverride', {
    //         userAgent: this.deviceUserAgent(),
    //     });
    //     this.cdpConnection.sendMessageToBackend('Emulation.setDeviceMetricsOverride', deviceMetricsParams);
    //     this.cdpConnection.sendMessageToBackend('Emulation.setTouchEmulationEnabled', touchEmulationParams);
    //     this.toggleTouchMode();
    //     this.updateScreencast();
    // }

    // private reportError(type: ErrorCodes.Error, message: string, stack: string) {

    //     // Package up the error info to send to the extension
    //     const data = { type, message, stack };

    //     // Inform the extension of the DevTools telemetry event
    //     this.sendTelemetry({
    //         data,
    //         event: 'error',
    //         name: 'screencast error',
    //     });
    // }

    // private sendTelemetry(telemetry: TelemetryData) {
    //     // Forward the data to the extension
    //     encodeMessageForChannel(msg => vscode.postMessage(msg, '*'), 'telemetry', telemetry);
    // }

    // private isDeviceTouch(){
    //     const selectedOption = this.deviceSelect[this.deviceSelect.selectedIndex];
    //     return selectedOption.getAttribute('touch') === 'true' || selectedOption.getAttribute('mobile') === 'true';
    // }

    // private deviceUserAgent() {
    //     if (this.deviceSelect.value.toLowerCase() === 'desktop') {
    //         return '';
    //     }
    //     const selectedOption = this.deviceSelect[this.deviceSelect.selectedIndex];
    //     return unescape(selectedOption.getAttribute('userAgent') || '');
    // }

    // private updateScreencast(): void {
    //     const screencastParams = {
    //         format: 'png',
    //         quality: 100,
    //         maxWidth: Math.floor(this.width * window.devicePixelRatio),
    //         maxHeight: Math.floor(this.height * window.devicePixelRatio)
    //     };
    //     this.cdpConnection.sendMessageToBackend('Page.startScreencast', screencastParams);
    // }

    // private onBackClick(): void {
    //     if (this.historyIndex > 0) {
    //         const entryId = this.history[this.historyIndex - 1].id;
    //         this.cdpConnection.sendMessageToBackend('Page.navigateToHistoryEntry', {entryId})
    //     }
    // }

    // private onForwardClick(): void {
    //     if (this.historyIndex < this.history.length - 1) {
    //         const entryId = this.history[this.historyIndex + 1].id;
    //         this.cdpConnection.sendMessageToBackend('Page.navigateToHistoryEntry', {entryId})
    //     }
    // }

    // private onFrameNavigated({frame}: any): void {
    //     if (!frame.parentId) {
    //         this.updateHistory();
    //     }
    // }

    // private onReloadClick(): void {
    //     this.cdpConnection.sendMessageToBackend('Page.reload', {});
    // }

    // private onRotateClick(): void {
    //     const width = this.fixedHeight;
    //     const height = this.fixedWidth;
    //     this.fixedWidth = width;
    //     this.fixedHeight = height;
    //     this.updateEmulation();
    // }

    // private onUrlKeyDown(event: KeyboardEvent): void {
    //     let url = this.urlInput.value;
    //     if (event.key === 'Enter' && url) {
    //         if (!url.startsWith('http') && !url.startsWith('file')) {
    //             url = 'http://' + url;
    //         }

    //         this.cdpConnection.sendMessageToBackend('Page.navigate', {url});
    //     }
    // }

    // private onScreencastFrame({data, sessionId}: any): void {
    //     const expectedWidth = Math.floor(this.width * window.devicePixelRatio);
    //     const expectedHeight = Math.floor(this.height * window.devicePixelRatio);
    //     this.screencastImage.src = `data:image/png;base64,${data}`;
    //     this.screencastImage.style.width = `${this.width}px`;
    //     if (this.screencastImage.naturalWidth !== expectedWidth || this.screencastImage.naturalHeight !== expectedHeight) {
    //         this.updateEmulation();
    //     }
    //     this.cdpConnection.sendMessageToBackend('Page.screencastFrameAck', {sessionId});
    // }

    // private onScreencastVisibilityChanged({visible}: {visible: boolean}): void {
    //     this.inactiveOverlay.hidden = visible;
    // }

    // private onToggleInspect({ enabled }: any): void {
    //     this.inspectMode = enabled as boolean;
    //     this.toggleTouchMode();
    // }

    // private toggleTouchMode(): void {
    //     const touchEnabled = this.isDeviceTouch() && !this.inspectMode;
    //     const touchEventsParams = {
    //         enabled: touchEnabled,
    //         configuration: touchEnabled ? 'mobile' : 'desktop',
    //     };
    //     this.screencastImage.classList.toggle('touch', touchEnabled);
    //     this.cdpConnection.sendMessageToBackend('Emulation.setEmitTouchEventsForMouse', touchEventsParams);
    // }
}
