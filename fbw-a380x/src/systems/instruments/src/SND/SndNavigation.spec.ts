// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { formatWaypoint, sndBearing, sndDistance, sndLegGuidance } from './SndGeo';
import { SndNavigator } from './SndNavigator';
import { SndMenu } from './SndMenu';

describe('SND geodesy', () => {
  it('measures distances and bearings on the great circle', () => {
    // 1° of latitude = 60 NM
    expect(sndDistance({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(60.04, 1);
    expect(sndBearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 5);
    expect(sndBearing({ lat: 0, lon: 0 }, { lat: -1, lon: 0 })).toBeCloseTo(180, 5);
  });

  it('gives the cross-track distance, positive right of the leg', () => {
    const leg = sndLegGuidance({ lat: 0, lon: 0 }, { lat: 2, lon: 0 }, { lat: 1, lon: 0.1 });
    // Flying north, east of the leg = right
    expect(leg.crossTrack).toBeCloseTo(6, 0);
    expect(leg.alongTrack).toBeCloseTo(60, 0);
    expect(leg.desiredTrack).toBeCloseTo(0, 1);
  });

  it('truncates the waypoints of the list to the minutes', () => {
    expect(formatWaypoint({ lat: 48.2583, lon: 5.6 })).toBe('N4815/E00536');
    expect(formatWaypoint({ lat: -33.9461, lon: -151.1772 })).toBe('S3356/W15110');
  });
});

describe('SND waypoint list', () => {
  it('flies a DIR TO then sequences the TO waypoint abeam', () => {
    const navigator = new SndNavigator();
    navigator.insert({ lat: 1, lon: 0 });
    navigator.insert({ lat: 2, lon: 0 });
    expect(navigator.update({ lat: 0, lon: 0 })).toBeNull();

    navigator.directTo(0, { lat: 0, lon: 0 });
    let guidance = navigator.update({ lat: 0.5, lon: 0 });
    expect(guidance?.to).toEqual({ lat: 1, lon: 0 });
    expect(guidance?.distanceToTo).toBeCloseTo(30, 0);
    expect(guidance?.nextBearing).toBeCloseTo(0, 3);
    expect(guidance?.nextDistance).toBeCloseTo(60, 0);

    guidance = navigator.update({ lat: 1.01, lon: 0.05 });
    expect(guidance?.to).toEqual({ lat: 2, lon: 0 });
    expect(guidance?.from).toEqual({ lat: 1, lon: 0 });
    expect(guidance?.next).toBeNull();
  });

  it('keeps the navigation on the TO waypoint when a previous one is cleared, and stops it when the TO one is gone', () => {
    const navigator = new SndNavigator();
    navigator.insert({ lat: 1, lon: 0 });
    navigator.insert({ lat: 2, lon: 0 });
    navigator.directTo(1, { lat: 0, lon: 0 });
    navigator.clear(0);
    expect(navigator.toIndex).toBe(0);
    navigator.clear(0);
    expect(navigator.isActive).toBe(false);
  });
});

describe('SND menu', () => {
  const aircraft = { lat: 48.2583, lon: 3.5383 };

  it('inserts a waypoint entered with the SET/SEL knob', () => {
    const navigator = new SndNavigator();
    const menu = new SndMenu(navigator);
    menu.pressMenu();
    expect(menu.view).toEqual({ title: 'INSERT WPT', kind: 'item' });
    menu.press(aircraft);
    // From the aircraft position: N 48 15.5 / E 003 32.3
    expect(menu.view?.kind).toBe('coordinates');
    menu.press(aircraft); // N
    menu.turn(2); // 50
    menu.press(aircraft);
    for (let i = 0; i < 6; i++) {
      menu.press(aircraft);
    }
    expect(menu.isOpen).toBe(false);
    expect(formatWaypoint(navigator.waypoints[0])).toBe('N5015/E00332');
  });

  it('scrolls the menu items, and MENU exits', () => {
    const menu = new SndMenu(new SndNavigator());
    menu.pressMenu();
    menu.turn(-1);
    expect(menu.view?.title).toBe('CLEAR WPT / FIX');
    menu.pressMenu();
    expect(menu.isOpen).toBe(false);
  });

  it('DIR TO: new coordinates without a list, a waypoint of the list with one', () => {
    const navigator = new SndNavigator();
    const menu = new SndMenu(navigator);
    menu.pressDirTo(aircraft);
    expect(menu.view?.title).toBe('DIR TO');
    for (let i = 0; i < 8; i++) {
      menu.press(aircraft);
    }
    expect(navigator.isActive).toBe(true);
    expect(navigator.waypoints).toHaveLength(1);

    navigator.insert({ lat: 50, lon: 10 });
    menu.pressDirTo(aircraft);
    menu.turn(1);
    expect(menu.view).toEqual({ title: 'DIR TO', kind: 'waypoint', text: '2/2 N5000/E01000' });
    menu.press(aircraft);
    expect(navigator.toIndex).toBe(1);
  });

  it('clears a waypoint of the list', () => {
    const navigator = new SndNavigator();
    navigator.insert({ lat: 50, lon: 10 });
    const menu = new SndMenu(navigator);
    menu.pressMenu();
    menu.turn(3);
    menu.press(aircraft);
    menu.press(aircraft);
    expect(navigator.waypoints).toHaveLength(0);
  });

  it('inserts, edits and clears the FIX, after the waypoints', () => {
    const navigator = new SndNavigator();
    navigator.insert({ lat: 50, lon: 10 });
    const menu = new SndMenu(navigator);
    // INSERT FIX from the aircraft position
    menu.pressMenu();
    menu.turn(1);
    expect(menu.view?.title).toBe('INSERT FIX');
    menu.press(aircraft);
    for (let i = 0; i < 8; i++) {
      menu.press(aircraft);
    }
    expect(formatWaypoint(navigator.fix!)).toBe('N4815/E00332');

    // EDIT WPT / FIX: the waypoint, then the FIX
    menu.pressMenu();
    menu.turn(2);
    menu.press(aircraft);
    menu.turn(1);
    expect(menu.view).toEqual({ title: 'EDIT WPT / FIX', kind: 'waypoint', text: 'FIX N4815/E00332' });
    menu.press(aircraft);
    menu.press(aircraft);
    menu.turn(1); // N 49
    for (let i = 0; i < 7; i++) {
      menu.press(aircraft);
    }
    expect(formatWaypoint(navigator.fix!)).toBe('N4915/E00332');
    expect(navigator.waypoints).toHaveLength(1);

    // CLEAR WPT / FIX: the FIX
    menu.pressMenu();
    menu.turn(3);
    menu.press(aircraft);
    menu.turn(-1);
    menu.press(aircraft);
    expect(navigator.fix).toBeNull();
    expect(navigator.waypoints).toHaveLength(1);
  });
});
