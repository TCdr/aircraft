// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { CrossBleedSelector } from './EngineFailAlerts';
import {
  OPEN_ON_GROUND_SECONDS,
  WingAntiIceValveOpenAlerts,
  WingAntiIceValveOpenInputs,
  WingAntiIceValveOpenKeys,
  WingAntiIceValveSideInputs,
} from './WingAntiIceValveOpenAlerts';
import { WING_ANTI_ICE_CONFIRM_SECONDS } from './WingAntiIceAlerts';
import { ewdLines, pseudoFwcSource, statusLines } from './FwcAlertSpecHelpers';

const closed: WingAntiIceValveSideInputs = { valveClosed: true, engineBleedPbAuto: true };
const open: WingAntiIceValveSideInputs = { valveClosed: false, engineBleedPbAuto: true };

const cruisePbOff: WingAntiIceValveOpenInputs = {
  pbOn: false,
  sides: [closed, closed],
  crossBleedSelector: CrossBleedSelector.Auto,
  apuBleedPbOn: false,
  onGround: false,
  flightPhase: 6,
};

const leftOpen = (inputs: WingAntiIceValveOpenInputs): WingAntiIceValveOpenInputs => ({
  ...inputs,
  sides: [{ ...open, engineBleedPbAuto: inputs.sides[0].engineBleedPbAuto }, inputs.sides[1]],
});

function run(inputs: WingAntiIceValveOpenInputs, seconds: number, alerts = new WingAntiIceValveOpenAlerts()) {
  for (let i = 0; i < seconds; i++) {
    alerts.update(inputs, 1);
  }
  return alerts;
}

const K = WingAntiIceValveOpenKeys;

describe('WING A.ICE L(R) VALVE OPEN', () => {
  it('triggers when the pb-sw is OFF and a wing valve stays open, after the confirmation time', () => {
    const inputs = leftOpen(cruisePbOff);
    expect(run(inputs, WING_ANTI_ICE_CONFIRM_SECONDS - 1).ewdFailures[K.valveOpen[0]].simVarIsActive.get()).toBe(false);
    const alerts = run(inputs, WING_ANTI_ICE_CONFIRM_SECONDS);
    expect(alerts.ewdFailures[K.valveOpen[0]].simVarIsActive.get()).toBe(true);
    expect(alerts.ewdFailures[K.valveOpen[1]].simVarIsActive.get()).toBe(false);
  });

  it('does not trigger with the pb-sw ON, and goes when the valve closes', () => {
    expect(run({ ...leftOpen(cruisePbOff), pbOn: true }, 20).ewdFailures[K.valveOpen[0]].simVarIsActive.get()).toBe(
      false,
    );
    const alerts = run(leftOpen(cruisePbOff), 20);
    alerts.update(cruisePbOff, 1);
    expect(alerts.ewdFailures[K.valveOpen[0]].simVarIsActive.get()).toBe(false);
  });

  it('in flight: WAI AVAIL IN FLT, -WING ANTI ICE AS RQRD, THRUST LIM PENALTY; STATUS', () => {
    const item = run(leftOpen(cruisePbOff), 20).ewdFailures[K.valveOpen[0]];
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual([4, 5, 7, 8]);
    expect(ewdLines(item)).toEqual([
      'WING A.ICE L VALVE OPEN',
      ' WAI AVAIL IN FLT',
      ' -WING ANTI ICE..AS RQRD',
      ' THRUST LIM PENALTY',
    ]);
    expect(statusLines({ left: item.statusInfo(), inopSys: item.inopSys() })).toEqual({
      left: ['THRUST LIM PENALTY', 'WAI AVAIL IN FLT'],
      right: [],
    });
  });

  it('in flight after a ground detection: -ENG 1 BLEED ON while it is OFF', () => {
    const bleedOff = leftOpen({ ...cruisePbOff, sides: [{ ...closed, engineBleedPbAuto: false }, closed] });
    expect(ewdLines(run(bleedOff, 20).ewdFailures[K.valveOpen[0]])).toEqual([
      'WING A.ICE L VALVE OPEN',
      ' WAI AVAIL IN FLT',
      ' -ENG 1 BLEED.........ON',
      ' -WING ANTI ICE..AS RQRD',
      ' THRUST LIM PENALTY',
    ]);
  });

  it('before takeoff: -ENG BLEED OFF, -X BLEED SHUT, -APU BLEED OFF (left wing), WAI AVAIL IN FLT; INOP SYS', () => {
    const beforeTakeoff = leftOpen({ ...cruisePbOff, onGround: true, flightPhase: 2, apuBleedPbOn: true });
    const alerts = run(beforeTakeoff, 20);
    const item = alerts.ewdFailures[K.valveOpen[0]];
    expect(ewdLines(item)).toEqual([
      'WING A.ICE L VALVE OPEN',
      ' -ENG 1 BLEED........OFF',
      ' -X BLEED...........SHUT',
      ' -APU BLEED..........OFF',
      ' WAI AVAIL IN FLT',
    ]);
    expect(statusLines({ left: item.statusInfo(), inopSys: item.inopSys() })).toEqual({
      left: ['WAI AVAIL IN FLT'],
      right: ['INOP SYS', 'ENG 1 BLEED', 'PACK 1'],
    });

    const done = {
      ...beforeTakeoff,
      sides: [{ ...open, engineBleedPbAuto: false }, closed] as const,
      crossBleedSelector: CrossBleedSelector.Shut,
      apuBleedPbOn: false,
    };
    alerts.update(done, 1);
    expect(ewdLines(item)).toEqual(['WING A.ICE L VALVE OPEN', ' WAI AVAIL IN FLT']);
  });

  it('after landing: -ENG BLEED OFF, -X BLEED SHUT; no APU BLEED line for the right wing', () => {
    const rightOpen: WingAntiIceValveOpenInputs = {
      ...cruisePbOff,
      sides: [closed, open],
      onGround: true,
      flightPhase: 9,
      apuBleedPbOn: true,
    };
    expect(ewdLines(run(rightOpen, 20).ewdFailures[K.valveOpen[1]])).toEqual([
      'WING A.ICE R VALVE OPEN',
      ' -ENG 2 BLEED........OFF',
      ' -X BLEED...........SHUT',
    ]);
  });
});

describe('WING A.ICE OPEN ON GND', () => {
  const groundPbOn: WingAntiIceValveOpenInputs = { ...cruisePbOff, pbOn: true, onGround: true, flightPhase: 1 };

  it('a valve still open 35 s after the pb-sw is set ON on ground', () => {
    const stuck = { ...groundPbOn, sides: [closed, open] as const };
    expect(run(stuck, OPEN_ON_GROUND_SECONDS).ewdFailures[K.openOnGround].simVarIsActive.get()).toBe(false);
    const item = run(stuck, OPEN_ON_GROUND_SECONDS + 1).ewdFailures[K.openOnGround];
    expect(item.simVarIsActive.get()).toBe(true);
    expect(item.failure).toBe(2);
    expect(item.flightPhaseInhib).toEqual([3, 4, 5, 6, 7, 8]);
    expect(ewdLines(item)).toEqual(['WING A.ICE OPEN ON GND', ' -WING ANTI ICE......OFF']);
    expect(statusLines({ left: item.statusInfo(), inopSys: item.inopSys() }).left).toEqual(['WAI AVAIL IN FLT']);
  });

  it('not with the valves closed after the 30 s ground test, nor in flight', () => {
    expect(run(groundPbOn, 60).ewdFailures[K.openOnGround].simVarIsActive.get()).toBe(false);
    const inFlight = { ...groundPbOn, onGround: false, sides: [open, open] as const };
    expect(run(inFlight, 60).ewdFailures[K.openOnGround].simVarIsActive.get()).toBe(false);
  });

  it('the PseudoFWC updates and shows the alerts', () => {
    const fwc = pseudoFwcSource();
    expect(fwc).toContain('this.wingAntiIceValveOpenAlerts.update(');
    expect(fwc).toContain('...this.wingAntiIceValveOpenAlerts.ewdFailures,');
  });
});
