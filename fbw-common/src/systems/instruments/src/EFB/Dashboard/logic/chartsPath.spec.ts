// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { chartsPath } from './chartsPath';

describe('chartsPath', () => {
  it('reopens the chart tab seen last, even after the weather tab', () => {
    expect(chartsPath(['/dashboard', '/navigation/navigraph', '/navigation/weather', '/dashboard'])).toBe(
      '/navigation/navigraph',
    );
  });

  it('opens the first chart tab when only the weather tab or no navigation page was seen', () => {
    expect(chartsPath(['/dashboard', '/navigation/weather'])).toBe('/navigation/lido');
    expect(chartsPath([])).toBe('/navigation/lido');
  });
});
