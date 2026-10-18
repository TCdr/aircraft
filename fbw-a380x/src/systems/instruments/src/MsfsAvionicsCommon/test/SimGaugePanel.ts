// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Test harness (vitest, jsdom): the gauges of a panel.cfg block created the way the sim creates them, for the specs of
 * the instruments that extend BaseInstrument directly (EWD, PFD).
 *
 * In the sim a gauge is a custom element (registerInstrument). The panel element of a panel.cfg block (vcockpit-panel)
 * creates it with document.createElement, so the gauge's constructor runs first, without any attribute and outside the
 * document (DOM standard: a custom element made by createElement never has attributes or a parent in its constructor).
 * Only then does the gauge element get its url attribute (the full coui:// path of its panel.cfg htmlgauge line, seen
 * in the sim) and go into the panel, after the gauges listed before it: that calls connectedCallback, where
 * BaseInstrument puts the gauge's template (its mount element) into the gauge element.
 */

/** The start of the url attribute of an A380X gauge element in the sim */
export const A380X_GAUGE_URL_PREFIX = 'coui://html_ui/Pages/VCockpit/Instruments/A380X/';

/**
 * The part of the sim's BaseInstrument the gauges use here: connectedCallback puts the gauge's template (the
 * `<script type="text/html" id="<templateID>">` of its HTML file) into the gauge element
 */
class SimBaseInstrument extends HTMLElement {
  get templateID(): string {
    return '';
  }

  public connectedCallback(): void {
    const template = document.getElementById(this.templateID);
    this.innerHTML = template?.textContent ?? '';
  }

  public Update(): void {
    // nothing in the harness
  }
}

// The sim globals a gauge module uses when it is loaded (BaseInstrument, registerInstrument), put here when this module
// is imported: import it before the gauge module
const simGlobals = global as unknown as Record<string, unknown>;
simGlobals.BaseInstrument = SimBaseInstrument;
simGlobals.registerInstrument = (name: string, gaugeClass: CustomElementConstructor) => {
  if (!customElements.get(name)) {
    customElements.define(name, gaugeClass);
  }
};
// The fast registered SimVar reads of the publishers a started gauge runs (not in the common SimVar mock): 0
const simVar = SimVar as unknown as Record<string, unknown>;
for (const read of ['GetSimVarValueFastReg', 'GetSimVarValueFast']) {
  if (typeof simVar[read] !== 'function') {
    simVar[read] = () => 0;
  }
}

/**
 * Puts a fresh SimVar store behind SimVar.GetSimVarValue and SimVar.SetSimVarValue: call it in beforeEach, after the
 * gauge module is loaded. Loading a gauge module replaces the common mock's GetSimVarValue with the sim's registered
 * read (SimVar.GetRegisteredId + simvar.getValueReg, always 0 in the tests), so a value set by the test would not be read.
 */
export function useSimVarStore(): void {
  const store = new Map<string, unknown>();
  const simVar = SimVar as unknown as Record<string, unknown>;
  simVar.GetSimVarValue = (name: string) => (store.has(name) ? store.get(name) : 0);
  simVar.SetSimVarValue = (name: string, _unit: string, value: unknown) => {
    store.set(name, value);
    return Promise.resolve();
  };
}

/**
 * Adds the template of a gauge's HTML file to the document, as `<file>.html` and `<file>-hosted.html` do
 * @param templateId the template id (e.g. A380X_EWD)
 * @param mountElementId the id of the gauge's mount element (e.g. EWD_CONTENT)
 */
export function addGaugeTemplate(templateId: string, mountElementId: string): void {
  const template = document.createElement('script');
  template.type = 'text/html';
  template.id = templateId;
  template.textContent = `<div id="${mountElementId}"><h1>If you're seeing this, instrument didn't load.</h1></div>`;
  document.head.appendChild(template);
}

/**
 * The panel element of a panel.cfg block in the document, with the gauge elements listed before the one under test
 * @param gauges the tag and url of each gauge element already in the panel
 * @returns the panel element
 */
export function createPanel(gauges: [string, string][]): HTMLElement {
  const panel = document.createElement('vcockpit-panel');
  for (const [tag, url] of gauges) {
    const gauge = document.createElement(tag);
    gauge.setAttribute('url', url);
    panel.appendChild(gauge);
  }
  document.body.appendChild(panel);
  return panel;
}

/**
 * Adds a gauge to a panel as the sim does: created (its constructor runs), given its url, then put into the panel
 * (its connectedCallback runs)
 * @param panel the panel element
 * @param tag the gauge's tag (e.g. a380x-ewd)
 * @param url the gauge's url attribute
 * @returns the gauge element
 */
export function addGauge<T extends HTMLElement>(panel: HTMLElement, tag: string, url: string): T {
  const gauge = document.createElement(tag) as T;
  gauge.setAttribute('url', url);
  panel.appendChild(gauge);
  return gauge;
}
