// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The paper of the pedestal printer (A380X), drawn as a cockpit display: Index=1 is the sheet coming out of the
 * printer (PRINT texture), Index=2 the torn-off sheet being read (PRINT_STATIC texture). The FMS sends each sheet with
 * the A380X_PRINT view listener event; the cockpit behaviours (A32NX_Interior_Printer.xml) collect, page through and
 * discard the sheets with the L:A32NX_PAGE_ID, L:A32NX_PAGES_PRINTED, L:A32NX_PRINT_PAGE_OFFSET and
 * L:A32NX_DISCARD_PAGE variables.
 */
class A380XPrinter extends BaseInstrument {
    constructor() {
        super();
        this.pages = [];
        this.previousPage = null;
    }

    get templateID() {
        return "A380X_PRINTER";
    }

    get isInteractive() {
        return false;
    }

    connectedCallback() {
        super.connectedCallback();
        this.feeding = this.instrumentIndex !== 2;
        this.lines = this.querySelector("#lines");
        setInterval(() => this.updatePaper(), 100);
        Coherent.on('A380X_PRINT', (lines) => {
            const currentPageID = SimVar.GetSimVarValue("L:A32NX_PAGE_ID", "number") - 1;
            if (currentPageID >= 0 && this.pages[currentPageID] == null) {
                this.pages[currentPageID] = lines;
            } else if (this.feeding) {
                this.pages = [];
                this.pages[currentPageID] = lines;
            }
        });
    }

    updatePaper() {
        let displayedPage = 0;
        if (this.feeding) {
            displayedPage = this.pages.length - 1;
        } else {
            let pagesPrinted = SimVar.GetSimVarValue("L:A32NX_PAGES_PRINTED", "number");
            const offset = SimVar.GetSimVarValue("L:A32NX_PRINT_PAGE_OFFSET", "number");
            displayedPage = pagesPrinted - 1 + offset;

            if (displayedPage < 0) {
                displayedPage = 0;
                SimVar.SetSimVarValue("L:A32NX_PRINT_PAGE_OFFSET", "number", (pagesPrinted - 1) * -1);
            }
            if (displayedPage > pagesPrinted - 1) {
                displayedPage = pagesPrinted - 1;
                SimVar.SetSimVarValue("L:A32NX_PRINT_PAGE_OFFSET", "number", 0);
            }

            if (SimVar.GetSimVarValue("L:A32NX_DISCARD_PAGE", "bool")) {
                this.pages.splice(displayedPage, 1);
                pagesPrinted--;
                SimVar.SetSimVarValue("L:A32NX_PAGES_PRINTED", "number", pagesPrinted);
                SimVar.SetSimVarValue("L:A32NX_PAGE_ID", "number", SimVar.GetSimVarValue("L:A32NX_PAGE_ID", "number") - 1);
                SimVar.SetSimVarValue("L:A32NX_DISCARD_PAGE", "bool", 0);
            }
        }

        const page = this.pages[displayedPage] || [];
        if (page === this.previousPage) {
            return;
        }
        this.previousPage = page;
        this.lines.textContent = page.join("\n");
        this.fitFont(page);
    }

    /** The largest font (up to 37 px) that fits the whole sheet on the 1024 x 1024 px paper */
    fitFont(page) {
        const usable = 1024 - 2 * 30;
        const columns = Math.max(1, ...page.map((l) => l.length));
        // The printer font is monospaced, a character is about 0.6 em wide; a line is 1.15 em high
        let size = Math.min(37, usable / (columns * 0.6), usable / (Math.max(1, page.length) * 1.15));
        this.lines.style.fontSize = `${Math.floor(size)}px`;
        while (size > 8 && (this.lines.scrollWidth > 1024 || this.lines.scrollHeight > 1024)) {
            size -= 1;
            this.lines.style.fontSize = `${Math.floor(size)}px`;
        }
    }
}
registerInstrument("a380x-printer", A380XPrinter);
