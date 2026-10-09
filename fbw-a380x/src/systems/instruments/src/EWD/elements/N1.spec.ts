// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { ExceedanceMemory, N1_RED_LIMIT_PERCENT, n1Colour } from './EgtLimits';

/* A380 FCOM DSC-70-90 N1 INDICATIONS, a380_fcom.txt l.113073-113082, figure "113.8 +" on the FCOM PDF page 4103 */
describe('A380X EWD N1 red limit and red cross', () => {
  it('shows the N1 value in red above the 111 % red limit', () => {
    expect(n1Colour(111)).toBe('Green');
    expect(n1Colour(111.1)).toBe('Red');
  });

  it('keeps the red cross after the exceedance until the next engine start on the ground', () => {
    const cross = new ExceedanceMemory(N1_RED_LIMIT_PERCENT);
    cross.update(113.8, false);
    cross.update(90, false);
    expect(cross.exceeded).toBe(true);
    cross.update(15, true);
    expect(cross.exceeded).toBe(false);
  });

  const n1 = readFileSync(resolve(__dirname, 'N1.tsx'), 'utf-8').replace(/\r\n/g, '\n');

  it('latches the N1 exceedance with the engine start on ground', () => {
    expect(n1).toContain('new ExceedanceMemory(N1_RED_LIMIT_PERCENT)');
    expect(n1).toContain(
      'this.n1Exceedance.update(this.n1.get(), this.onGround.get() && (state === 2 || state === 3));',
    );
  });

  it('draws a red cross after the N1 value of the normal and the degraded N1 display', () => {
    const crosses = n1.match(
      /<text\s+class="F26 Red"[^>]*visibility=\{this\.n1RedCrossVisible\.map\(\(shown\) => \(shown \? 'inherit' : 'hidden'\)\)\}\s*>\s*\+\s*<\/text>/g,
    );
    expect(crosses).toHaveLength(2);
  });

  it('colours every N1 value with the red limit', () => {
    expect(n1).not.toContain('class="F26 End Green"');
    expect(n1).not.toContain('class="F20 End Green"');
    expect(n1.split('class={this.n1ClassLarge}').length - 1).toBe(4);
    expect(n1.split('class={this.n1ClassSmall}').length - 1).toBe(2);
  });
});
