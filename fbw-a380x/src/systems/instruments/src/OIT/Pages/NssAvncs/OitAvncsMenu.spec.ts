// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const menu = readFileSync(resolve(__dirname, 'OitAvncsMenu.tsx'), 'utf-8');
const directory = readFileSync(resolve(__dirname, '../../OitPageDirectory.tsx'), 'utf-8');

describe('NSS AVNCS menu tree', () => {
  it('has a page for every file it opens (REFUEL has none yet)', () => {
    const targets = (menu.match(/navigationTarget="[^"]+"/g) ?? []).map((match) =>
      match.substring('navigationTarget="'.length, match.length - 1),
    );
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(directory).toContain(`case '${target}':`);
    }
  });
});
