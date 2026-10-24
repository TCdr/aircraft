// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { TabBarPosition, contentSectionHeightRem, isTabOpen, tabBarLayout, tabBarPositionClass } from './tabBarLayout';

describe('tabBarLayout', () => {
  it('takes the bar height off the page height when the bar is at the bottom', () => {
    const layout = tabBarLayout('bottom');
    expect(layout.contentHeightReducedRem).toBe(49.5);
    expect(layout.contentHeightFullRem).toBe(52.75);
  });

  it('takes only the bar height minus the status bar off the page height when the bar is at the top', () => {
    const layout = tabBarLayout('top');
    expect(layout.contentHeightReducedRem).toBe(52);
    expect(layout.contentHeightFullRem).toBe(55.25);
  });

  it('keeps a gap under the status bar (bottom bar) or under the tab bar (top bar)', () => {
    expect(tabBarLayout('bottom').contentTopRem).toBe(3.5);
    expect(tabBarLayout('bottom').contentBottomRem).toBe(4.5);
    expect(tabBarLayout('top').contentTopRem).toBe(5.5);
    expect(tabBarLayout('top').contentBottomRem).toBe(0);
  });
});

describe('contentSectionHeightRem', () => {
  it('takes the reserved part off the page body height of the bar position', () => {
    expect(contentSectionHeightRem('bottom', 14)).toBe(35.5);
    expect(contentSectionHeightRem('top', 14)).toBe(38);
    expect(contentSectionHeightRem('bottom')).toBe(49.5);
    expect(contentSectionHeightRem('top')).toBe(52);
  });
});

describe('tab bar position classes in Theme.css', () => {
  const css = readFileSync(join(__dirname, '../Assets/Theme.css'), 'utf-8');

  function remValue(position: TabBarPosition, variable: string): number {
    const rule = new RegExp(`\\.${tabBarPositionClass(position)}\\s*\\{([^}]*)\\}`).exec(css);
    expect(rule).not.toBeNull();
    const value = new RegExp(`${variable}:\\s*([0-9.]+)rem`).exec(rule[1]);
    expect(value).not.toBeNull();
    return parseFloat(value[1]);
  }

  it.each<TabBarPosition>(['bottom', 'top'])(
    'gives the page heights of tabBarLayout for a bar at the %s',
    (position) => {
      const layout = tabBarLayout(position);
      expect(remValue(position, '--efb-content-reduced')).toBe(layout.contentHeightReducedRem);
      expect(remValue(position, '--efb-content-full')).toBe(layout.contentHeightFullRem);
    },
  );
});

describe('isTabOpen', () => {
  it('opens the tab of the route and of the pages under it', () => {
    expect(isTabOpen('/ground', '/ground')).toBe(true);
    expect(isTabOpen('/ground/fuel', '/ground')).toBe(true);
  });

  it('does not open a tab whose path is only a prefix of another section', () => {
    expect(isTabOpen('/dashboard', '/dispatch')).toBe(false);
    expect(isTabOpen('/settingsx', '/settings')).toBe(false);
  });
});
