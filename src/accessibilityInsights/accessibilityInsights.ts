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
        this.automatedChecksButton = document.getElementById('automated-checks') as HTMLButtonElement;
        this.automatedChecksButton.addEventListener('click', () => this.onAutomatedChecks());

        //register for events:
        //Page.automatedChecksCompleted
        //Page.visualizationsVisibilityChanged
        //Page.axeIsDefined

        //trigger events
        this.cdpConnection.registerForEvent('runAutomatedChecks', () => this.onRunAutomatedChecks())
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

    private highlightIssuesForSelector(selector: string){
        this.cdpConnection.sendMessageToBackend("Runtime.evaluate", { expression: `document.querySelector('${selector}').classList.add('insights-pseudo-selector-style-container')`}, (result) => {
            this.cdpConnection.sendMessageToBackend('AccessibilityInsights.logAutomatedChecks', {method: 'evaluate', result})
        });
    }

    //look at issue element
    //get issue element coordinates and size
    //create shadow version box at coordinates with size
    private onRunAutomatedChecks(): void {
        this.cdpConnection.sendMessageToBackend("Runtime.evaluate", { expression: 'window.axe.run(document, {runOnly: { type: "tag", values: ["wcag2a", "wcag21a", "wcag2aa", "wcag21aa"]}})' }, (results) => {
            this.cdpConnection.sendMessageToBackend("Runtime.awaitPromise", { promiseObjectId: results.result.objectId, returnByValue: true, generatePreview: true}, (result) => {
                    this.cdpConnection.sendMessageToBackend('AccessibilityInsights.showAutomatedChecksResults', {result: result.result.value})
                    this.cdpConnection.sendMessageToBackend('AccessibilityInsights.logAutomatedChecks', {result})
                    const issues = result.result.value.violations;
                    issues.forEach((issue: { nodes: { target: any[]; }[]; }) => {
                        issue.nodes.forEach(node => {
                            const targets = node.target;
                            targets.forEach(selector => {
                                this.highlightIssuesForSelector(selector);
                            })
                        })
                    })
                })
        })
    }
    public onAutomatedChecks(): void {
        this.cdpConnection.sendMessageToBackend("AccessibilityInsights.injectScripts", {})
    }
}
