// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { compile } from 'sass';
import { describe, expect, it } from 'vitest';

// The ND chronometer component is shared by both aircraft; its box and digit colours come from each aircraft's
// ND style.scss ($nd-chrono-* variables). These checks read the component source and the compiled stylesheets.
const CHRONO_SOURCE = 'fbw-common/src/systems/instruments/src/ND/Chrono.tsx';
const A32NX_ND_STYLE = 'fbw-a32nx/src/systems/instruments/src/ND/style.scss';
const A380X_ND_STYLE = 'fbw-a380x/src/systems/instruments/src/ND/style.scss';

/** Compiles an aircraft ND stylesheet to plain CSS. */
const compileStyle = (repoPath: string): string => compile(resolve(process.cwd(), repoPath), { style: 'expanded' }).css;

/** Returns the value of one property inside the CSS rule with exactly this selector, or undefined. */
const ruleProperty = (css: string, selector: string, property: string): string | undefined => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`(?:^|\\})\\s*${escapedSelector}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!rule) {
    return undefined;
  }
  const declaration = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'm').exec(rule[1]);
  return declaration?.[1].trim();
};

describe('ND chronometer colours', () => {
  it('the chrono box and digits use the aircraft-styled chrono classes', () => {
    const source = readFileSync(resolve(process.cwd(), CHRONO_SOURCE), 'utf8');

    expect(source).toMatch(/<rect[^>]*class="ChronoBox"/);
    expect(source).toMatch(/<text[^>]*class="ChronoText"/);
    // The font-rendering hack (layout re-calculation on every time change) must stay.
    expect(source).toContain("'margin-right'");
  });

  it('A32NX: white digits (A320 FCOM DSC-31-45 item 9) on a display-background box', () => {
    const css = compileStyle(A32NX_ND_STYLE);

    expect(ruleProperty(css, '.chrono text.ChronoText', 'fill')).toBe('#ffffff');
    // $display-background of the A32NX, not the light grey #787878 that made the digits hard to read.
    expect(ruleProperty(css, '.chrono .ChronoBox', 'fill')).toBe('#040404');
  });

  it('A380X: look unchanged (green digits on the grey box)', () => {
    const css = compileStyle(A380X_ND_STYLE);

    expect(ruleProperty(css, '.chrono text.ChronoText', 'fill')).toBe('#00ff00');
    expect(ruleProperty(css, '.chrono .ChronoBox', 'fill')).toBe('#4f5467');
  });
});
