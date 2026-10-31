// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { resolve } from 'path';
import { compile } from 'sass';
import { EventBus, FSComponent } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { Chrono } from '../../../../../../fbw-common/src/systems/instruments/src/ND/Chrono';

// The ND chronometer component is shared by both aircraft; its box and digit colours come from each aircraft's
// ND style.scss ($nd-chrono-* variables). These checks render the component and compile the stylesheets.
const A32NX_ND_STYLE = 'fbw-a32nx/src/systems/instruments/src/ND/style.scss';
const A380X_ND_STYLE = 'fbw-a380x/src/systems/instruments/src/ND/style.scss';

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

function renderChrono() {
  const bus = new EventBus();
  const container = document.createElement('div');
  FSComponent.render(
    <svg>
      <Chrono bus={bus} />
    </svg>,
    container,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const publisher = bus.getPublisher<any>();
  publisher.pub('chrono_pushed', true, false, false);
  return { container, publisher };
}

describe('ND chronometer colours', () => {
  it('renders the chrono box and the digits the aircraft stylesheets colour', () => {
    const { container } = renderChrono();

    expect(container.querySelector('.chrono .ChronoBox')).not.toBeNull();
    expect(container.querySelector('.chrono text.ChronoText')).not.toBeNull();
    expect(container.querySelector('.chrono text.ChronoText')?.textContent).toBe('00\'00"');
  });

  it('re-calculates the layout of the chrono on every time change, as the font rendering needs', () => {
    const { container, publisher } = renderChrono();
    const group = container.querySelector('.chrono') as SVGElement;
    publisher.pub('absoluteTime', 100, false, false);
    const marginsSeen = new Set<string>();
    for (let seconds = 1; seconds <= 4; seconds++) {
      publisher.pub('absoluteTime', 100 + seconds * 2, false, false);
      marginsSeen.add(group.style.marginRight);
    }
    expect(group.querySelector('text')?.textContent).toBe('00\'08"');
    expect(marginsSeen.has('0.01px')).toBe(true);
    expect(marginsSeen.has('0px')).toBe(true);
  });

  it('A32NX: white digits on a display-background box', () => {
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
