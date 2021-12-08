// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { AccessibilityInsightsCDPConnection } from './cdp';

export class AccessibilityInsights {
    private cdpConnection = new AccessibilityInsightsCDPConnection();
    private automatedChecksButton: HTMLButtonElement;
    private resultsArea: HTMLElement;
    // private screencastWrapper: HTMLElement;
    // private inactiveOverlay: HTMLElement;
    // private inspectMode = false;

    constructor() {
        this.automatedChecksButton = document.getElementById('automated-checks') as HTMLButtonElement;
        this.resultsArea = document.getElementById('results') as HTMLButtonElement;
        this.automatedChecksButton.addEventListener('click', () => this.onAutomatedChecks());

        //register for events:
        //Page.automatedChecksCompleted
        //Page.visualizationsVisibilityChanged
        //Page.axeIsDefined

        //trigger events
       // this.cdpConnection.registerForEvent('Page.runAutomatedChecks', result => this.onRunAutomatedChecks(result))
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
        this.cdpConnection.sendMessageToBackend('Runtime.enable', {});

    }


    private showResults(results: any): void {
        this.resultsArea.append( `${JSON.stringify(results)}`)
    }

    public onAutomatedChecks(): void {
        this.cdpConnection.sendMessageToBackend("Runtime.evaluate", { expression: 'window.axe.run(document, {runOnly: { type: "tag", values: ["wcag2a", "wcag21a", "wcag2aa", "wcag21aa"]}})' }, (results) => {
            this.cdpConnection.sendMessageToBackend('AccessibilityInsights.showResults', {results})
            try {
                this.cdpConnection.sendMessageToBackend("Runtime.awaitPromise", { promiseObjectId: results.result.objectId, returnByValue: true, generatePreview: true}, (result) => {
                    this.cdpConnection.sendMessageToBackend('AccessibilityInsights.showAutomatedChecksResults', {result: result.result.value})
                    this.showResults(result.result.value)
                })
            }catch(e) {
                this.cdpConnection.sendMessageToBackend('AccessibilityInsights.showResults', {e})
            }
        })

    }
}
