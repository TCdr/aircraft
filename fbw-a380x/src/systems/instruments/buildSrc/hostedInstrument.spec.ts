// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const { scopeCss, hostedHtml } = createRequire(import.meta.url)('./hostedInstrument.cjs');

/** The stylesheet without line breaks and repeated spaces, for comparisons */
function flat(css: string): string {
  return css.replace(/\s+/g, ' ').trim();
}

describe('hosted instrument stylesheet (CDS reconfiguration)', () => {
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
});
