// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const { scopeCss, hostedHtml, packageIds, mouseTransparentRule, mouseOnlyWhenShownRule } = createRequire(
  import.meta.url,
)('./hostedInstrument.cjs');

/** The stylesheet without line breaks and repeated spaces, for comparisons */
function flat(css: string): string {
  return css.replace(/\s+/g, ' ').trim();
}

describe('hosted instrument stylesheet (CDS reconfiguration)', () => {
  it('makes a hosted gauge element and its content transparent to the mouse, matched by its URL', () => {
    document.body.innerHTML =
      '<vcockpit-panel><a380x-sdv2 url="coui://html_ui/Pages/VCockpit/Instruments/A380X/SDv2/sdv2.html?duID=7"></a380x-sdv2>' +
      '<a380x-ewd url="coui://html_ui/Pages/VCockpit/Instruments/A380X/EWD/ewd-hosted.html?hostDu=7&duID=6"><div id="EWD_CONTENT"></div></a380x-ewd></vcockpit-panel>';
    const rule = mouseTransparentRule('ewd');
    const selectors = rule.substring(0, rule.indexOf('{')).trim();
    expect(rule).toContain('pointer-events: none !important');
    const matched = Array.from(document.querySelectorAll(selectors)).map((element) => element.tagName.toLowerCase());
    // the hidden EWD over the SD and its mount element, not the SD's own gauge with the mailbox
    expect(matched).toEqual(['a380x-ewd', 'div']);
    document.body.innerHTML = '';
  });

  it('lets a hosted SD take the mouse with its content only: shown, its mailbox; hidden, nothing over the ND', () => {
    const rules = mouseOnlyWhenShownRule('sdv2', 'SDv2_CONTENT');
    const [gaugeRule, contentRule] = rules.trim().split('\n');
    const selectorsOf = (rule: string) => rule.substring(0, rule.indexOf('{')).trim();
    document.body.innerHTML =
      '<vcockpit-panel><a380x-nd url="coui://html_ui/Pages/VCockpit/Instruments/A380X/ND/nd.html?Index=2&duID=4"></a380x-nd>' +
      '<a380x-sdv2 url="coui://html_ui/Pages/VCockpit/Instruments/A380X/SDv2/sdv2-hosted.html?hostDu=4&duID=7">' +
      '<div id="SDv2_CONTENT"><div class="mailbox"></div></div></a380x-sdv2></vcockpit-panel>';
    // the gauge element (over the whole F/O ND DU) passes the mouse on
    expect(gaugeRule).toContain('pointer-events: none !important');
    expect(Array.from(document.querySelectorAll(selectorsOf(gaugeRule))).map((e) => e.tagName.toLowerCase())).toEqual([
      'a380x-sdv2',
    ]);
    // its content takes it again (and the mailbox in it by inheritance); the mouse transparent rule did not
    expect(contentRule).toContain('pointer-events: auto');
    expect(Array.from(document.querySelectorAll(selectorsOf(contentRule))).map((e) => e.id)).toEqual(['SDv2_CONTENT']);
    const allTransparent = selectorsOf(mouseTransparentRule('sdv2'));
    expect(Array.from(document.querySelectorAll(allTransparent)).some((e) => e.className === 'mailbox')).toBe(true);
    document.body.innerHTML = '';
  });

  it('scopes every rule to the mount element', () => {
    expect(flat(scopeCss('.FontLarge { font-size: 6.5px; } text, tspan { fill: red; }', '#PFD_CONTENT'))).toBe(
      '#PFD_CONTENT .FontLarge { font-size: 6.5px; } #PFD_CONTENT text, #PFD_CONTENT tspan { fill: red; }',
    );
  });

  it('maps document-level selectors to the mount element', () => {
    expect(flat(scopeCss(':root { --x: 1; } html body .a { color: red; } body { margin: 0; }', '#ND_CONTENT'))).toBe(
      '#ND_CONTENT { --x: 1; } #ND_CONTENT .a { color: red; } #ND_CONTENT { margin: 0; }',
    );
  });

  it('maps the panel element of the gauges to the mount element', () => {
    expect(
      flat(scopeCss('vcockpit-panel { font-family: Ecam; } vcockpit-panel-x { color: red; }', '#MSFS_REACT_MOUNT')),
    ).toBe('#MSFS_REACT_MOUNT { font-family: Ecam; } #MSFS_REACT_MOUNT vcockpit-panel-x { color: red; }');
  });

  it('scopes rules inside media queries and leaves font faces alone', () => {
    const css = scopeCss(
      "@font-face { font-family: Ecam; src: url('x.ttf'); } @media (min-width: 1px) { .a { color: red; } }",
      '#EWD_CONTENT',
    );
    expect(flat(css)).toBe(
      "@font-face { font-family: Ecam; src: url('x.ttf'); } @media (min-width: 1px) { #EWD_CONTENT .a { color: red; } }",
    );
  });

  it('renames the keyframes and their uses, so the host keeps its own animations', () => {
    const css = scopeCss(
      '@keyframes blinking { 0% { opacity: 1; } 100% { opacity: 0; } } .b { animation: blinking 1s infinite; } .c { animation-name: blinking; }',
      '#PFD_CONTENT',
    );
    expect(flat(css)).toBe(
      '@keyframes hosted-blinking { 0% { opacity: 1; } 100% { opacity: 0; } } #PFD_CONTENT .b { animation: hosted-blinking 1s infinite; } #PFD_CONTENT .c { animation-name: hosted-blinking; }',
    );
  });

  it('writes an HTML file with the scoped stylesheet and the normal script', () => {
    const html = hostedHtml({
      templateId: 'A380X_PFD',
      mountElementId: 'PFD_CONTENT',
      imports: ['/JS/dataStorage.js'],
      cssPath: '/Pages/VCockpit/Instruments/A380X/PFD/pfd-hosted.css',
      jsPath: '/Pages/VCockpit/Instruments/A380X/PFD/pfd.js',
    });
    expect(html).toContain('<script type="text/html" id="A380X_PFD">');
    expect(html).toContain('<div id="PFD_CONTENT">');
    expect(html).toContain('import-script="/JS/dataStorage.js"');
    expect(html).toContain('<link rel="stylesheet" href="/Pages/VCockpit/Instruments/A380X/PFD/pfd-hosted.css" />');
    expect(html).toContain('import-script="/Pages/VCockpit/Instruments/A380X/PFD/pfd.js"');
  });

  it('keeps a selector that already starts with the mount element', () => {
    expect(
      flat(scopeCss('#MSFS_REACT_MOUNT { width: 100%; } #MSFS_REACT_MOUNTED .a { color: red; }', '#MSFS_REACT_MOUNT')),
    ).toBe('#MSFS_REACT_MOUNT { width: 100%; } #MSFS_REACT_MOUNT #MSFS_REACT_MOUNTED .a { color: red; }');
  });

  it("uses Mach's ids of the package: the React mount element for the legacy SD", () => {
    expect(packageIds('SD', { type: 'react', fileName: 'sd' })).toEqual({
      templateId: 'SD',
      mountElementId: 'MSFS_REACT_MOUNT',
    });
    expect(
      packageIds('SDv2', {
        type: 'baseInstrument',
        templateId: 'A380X_SDv2',
        mountElementId: 'SDv2_CONTENT',
        fileName: 'sdv2',
      }),
    ).toEqual({ templateId: 'A380X_SDv2', mountElementId: 'SDv2_CONTENT' });
  });

  it('writes the hosted SD HTML around the React harness script', () => {
    const html = hostedHtml({
      ...packageIds('SD', { type: 'react', fileName: 'sd' }),
      imports: ['/JS/dataStorage.js', '/JS/fbw-a380x/A380X_Simvars.js'],
      cssPath: '/Pages/VCockpit/Instruments/A380X/SD/sd-hosted.css',
      jsPath: '/Pages/VCockpit/Instruments/A380X/SD/sd.js',
    });
    expect(html).toContain('<script type="text/html" id="SD">');
    expect(html).toContain('<div id="MSFS_REACT_MOUNT">');
    expect(html).toContain('import-script="/JS/fbw-a380x/A380X_Simvars.js"');
    expect(html).toContain('import-script="/Pages/VCockpit/Instruments/A380X/SD/sd.js"');
  });
});
