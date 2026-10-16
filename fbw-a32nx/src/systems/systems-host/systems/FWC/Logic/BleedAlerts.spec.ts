// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { formatEwdMessages } from '@shared/EwdMessages';
import { formatStatusPage } from '@shared/StatusMessages';
import {
  BleedAlertKeys,
  BleedAlertLineCounts,
  BleedAlerts,
  BleedInputs,
  BleedPhaseInhibition,
  BleedStatusCodes as S,
  EngineBleedInputs,
  NO_BLEED_INPUTS,
  bleedAlertCodes,
  crossBleedFaultLines,
  crossBleedFaultStatus,
  engine1And2BleedFaultLeakLines,
  engine1And2BleedFaultLines,
  engine1And2BleedFaultStatus,
  engineBleedFaultLines,
  engineBleedFaultNotClosedLines,
  engineBleedFaultNotClosedStatus,
  engineBleedFaultStatus,
  hasEngineBleedAlert,
  isEngineBleedFaultValveNotClosed,
  engineBleedHiTempLines,
  engineBleedLoTempLines,
  engineBleedLoTempStatus,
  engineBleedNotClosedLines,
  isApuBleedValveDisagree,
  isCrossBleedValveDisagree,
  isEngineBleedFault,
  isEngineBleedHiTemp,
  isEngineBleedValveNotClosed,
} from './BleedAlerts';
import { CrossBleedSelector } from './EngineFailAlerts';

/** Engine running, bleed ON and supplying air, pack ON: the normal in-flight state */
const running: EngineBleedInputs = {
  engineRunning: true,
  engineStopped: false,
  bleedPbAuto: true,
  overheat: false,
  overpressure: false,
  lowTemperature: false,
  bleedTemperatureCelsius: 200,
  bleedValveOpen: true,
  starterValveOpen: false,
  firePbPushed: false,
  packOn: true,
  wingOrPylonLeak: false,
};

/** Both engines running in flight, APU off, X BLEED AUTO and closed */
const cruise: BleedInputs = {
  ...NO_BLEED_INPUTS,
  engines: [running, running],
  crossBleedSelector: CrossBleedSelector.Auto,
  crossBleedFullyOpen: false,
  crossBleedFullyClosed: true,
  autoThrustEngaged: true,
};

const withEngine = (inputs: BleedInputs, engine: 0 | 1, change: Partial<EngineBleedInputs>): BleedInputs => {
  const engines: [EngineBleedInputs, EngineBleedInputs] = [inputs.engines[0], inputs.engines[1]];
  engines[engine] = { ...engines[engine], ...change };
  return { ...inputs, engines };
};

/** Runs the FWC bleed alerts for a time with fixed inputs, 0.1 s per update */
const run = (alerts: BleedAlerts, inputs: BleedInputs, seconds: number) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.1) {
    alerts.update(inputs, 0.1);
  }
  return alerts.states;
};

const activeKeys = (alerts: BleedAlerts) =>
  Object.keys(alerts.ewdFailures).filter((key) => alerts.ewdFailures[key].simVarIsActive.get());

/* A320 FCOM PRO-ABN-AIR AIR ENG 1(2) BLEED FAULT, a320_fcom.txt l.69805-69811 */
describe('AIR ENG 1(2) BLEED FAULT', () => {
  it('triggers on a running engine with a bleed overheat or overpressure (BMC flags)', () => {
    expect(isEngineBleedFault({ ...running, overheat: true })).toBe(true);
    expect(isEngineBleedFault({ ...running, overpressure: true })).toBe(true);
    expect(isEngineBleedFault(running)).toBe(false);
    expect(isEngineBleedFault({ ...running, overheat: true, engineRunning: false })).toBe(false);
  });

  it('becomes ENG 1+2 BLEED FAULT when both bleeds fail (l.70025)', () => {
    const alerts = new BleedAlerts();
    const one = run(alerts, withEngine(cruise, 0, { overheat: true }), 0.2);
    expect(one.engineBleedFault).toEqual([true, false]);
    expect(one.engine1And2BleedFault).toBe(false);
    const both = run(alerts, withEngine(withEngine(cruise, 0, { overheat: true }), 1, { overpressure: true }), 0.2);
    expect(both.engineBleedFault).toEqual([false, false]);
    expect(both.engine1And2BleedFault).toBe(true);
  });

  it('shows ENG BLEED OFF while the valve is open, PACK FLOW LO with WAI off, X BLEED OPEN (l.69830-69845)', () => {
    const fault = withEngine(cruise, 0, { overheat: true });
    expect(engineBleedFaultLines(fault, 0)).toEqual([0, 1, 2, 4]);
    // valve closed by the BMC, PACK FLOW at LO, X BLEED at OPEN: the actions done go
    const done = { ...withEngine(fault, 0, { bleedValveOpen: false }), packFlowLo: true };
    expect(engineBleedFaultLines({ ...done, crossBleedSelector: CrossBleedSelector.Open }, 0)).toEqual([0]);
    // wing anti-ice on with both packs on: PACK 1 OFF instead of PACK FLOW LO
    expect(engineBleedFaultLines({ ...fault, wingAntiIceOn: true }, 0)).toEqual([0, 1, 3, 4]);
  });

  it('STATUS: ONE PACK ONLY IF WAI ON; INOP SYS ENG 1 BLEED, PACK 1 if closed (l.69850-69855)', () => {
    expect(engineBleedFaultStatus(cruise, 0)).toEqual({ left: [S.onePackOnlyIfWaiOn], inopSys: [S.eng1Bleed] });
    expect(engineBleedFaultStatus(withEngine(cruise, 1, { packOn: false }), 1).inopSys).toEqual([S.eng2Bleed, S.pack2]);
  });

  it('ENG 1+2 BLEED FAULT lines: X BLEED AUTO, WING ANTI ICE OFF, APU BLEED OFF only for a failed APU bleed', () => {
    const shut = { ...cruise, crossBleedSelector: CrossBleedSelector.Shut, wingAntiIceOn: true, apuBleedPbOn: true };
    expect(engine1And2BleedFaultLines(shut, true)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(engine1And2BleedFaultLines(cruise, false)).toEqual([0, 3, 5, 6, 7, 8, 9, 10, 11]);
  });
});

/* l.69942-70003: AIR ENG 1(2) BLEED FAULT with the BLEED NOT CLOSED subtitle */
describe('AIR ENG 1(2) BLEED FAULT / BLEED NOT CLOSED', () => {
  /** Engine 1 bleed overpressure with its valve stuck open (the BMC cannot close it) */
  const stuckOpenFault = withEngine(cruise, 0, { overpressure: true, bleedValveOpen: true });

  it('a BLEED FAULT whose bleed valve stays open (l.69953-69959)', () => {
    expect(isEngineBleedFaultValveNotClosed(stuckOpenFault.engines[0])).toBe(true);
    // the BMC closed the valve: the plain BLEED FAULT
    expect(isEngineBleedFaultValveNotClosed({ ...stuckOpenFault.engines[0], bleedValveOpen: false })).toBe(false);
    // no fault: no alert, whatever the valve
    expect(isEngineBleedFaultValveNotClosed(running)).toBe(false);
  });

  it('replaces ENG 1 BLEED FAULT once confirmed for 10 s, the time the valve has to close', () => {
    const alerts = new BleedAlerts();
    const first = run(alerts, stuckOpenFault, 9.5);
    expect(first.engineBleedFault).toEqual([true, false]);
    expect(first.engineBleedFaultNotClosed).toEqual([false, false]);
    const confirmed = run(alerts, stuckOpenFault, 0.6);
    expect(confirmed.engineBleedFault).toEqual([false, false]);
    expect(confirmed.engineBleedFaultNotClosed).toEqual([true, false]);
    expect(activeKeys(alerts)).toEqual([BleedAlertKeys.eng1BleedFaultNotClosed]);
  });

  it('replaces the NOT CLSD alert of the same valve (its procedure sets the ENG BLEED OFF)', () => {
    const alerts = new BleedAlerts();
    // APU bleed ON: the engine 1 valve must close, NOT CLSD conditions too
    const withApuBleed = { ...stuckOpenFault, apuBleedPbOn: true, apuBleedValveOpen: true };
    const states = run(alerts, withApuBleed, 10.5);
    expect(states.engineBleedFaultNotClosed).toEqual([true, false]);
    expect(states.engineBleedNotClosed).toEqual([false, false]);
  });

  it('lines (l.69980-69991): ENG BLEED OFF, PACK FLOW LO if WAI off, PACK OFF, X BLEED SHUT, WAI OFF, AVOID ICING, APU BLEED OFF for engine 1', () => {
    const apuBleedOn = { ...stuckOpenFault, apuBleedPbOn: true };
    expect(engineBleedFaultNotClosedLines(apuBleedOn, 0)).toEqual([0, 1, 2, 3, 4, 5, 7, 8]);
    // engine 2: no APU BLEED line
    expect(engineBleedFaultNotClosedLines(apuBleedOn, 1)).toEqual([0, 1, 2, 3, 4, 5, 7]);
    // wing anti-ice on: no PACK FLOW LO, WING ANTI ICE OFF
    expect(engineBleedFaultNotClosedLines({ ...stuckOpenFault, wingAntiIceOn: true }, 0)).toEqual([
      0, 1, 2, 4, 5, 6, 7,
    ]);
    // actions done: pb OFF, PACK FLOW LO, pack OFF, X BLEED SHUT
    const done = {
      ...withEngine(stuckOpenFault, 0, { bleedPbAuto: false, packOn: false }),
      packFlowLo: true,
      crossBleedSelector: CrossBleedSelector.Shut,
    };
    expect(engineBleedFaultNotClosedLines(done, 0)).toEqual([0, 1, 7]);
  });

  it('STATUS (l.69995-70003): the icing limitations; INOP SYS ENG 1 BLEED, PACK 1, WING A. ICE', () => {
    expect(engineBleedFaultNotClosedStatus(0)).toEqual({
      left: [S.avoidIcing, S.ifSevereIceAccretion, S.minSpeed, S.maneuverWithCare, S.ldgDistProc],
      inopSys: [S.eng1Bleed, S.pack1, S.wingAntiIce],
    });
    expect(engineBleedFaultNotClosedStatus(1).inopSys).toEqual([S.eng2Bleed, S.pack2, S.wingAntiIce]);
  });

  it('E/WD: ENG 1 BLEED FAULT title with the amber BLEED NOT CLOSED subtitle', () => {
    const texts = formatEwdMessages(bleedAlertCodes(BleedAlertKeys.eng1BleedFaultNotClosed, 2));
    expect(texts[0]).toContain('ENG 1 BLEED FAULT');
    expect(texts[1]).toContain('\x1b<4m BLEED NOT CLOSED');
  });
});

/* l.70087-70277: AIR ENG 1+2 BLEED FAULT with the LEFT LEAK, RIGHT LEAK, LEFT LEAK AND RIGHT LEAK subtitles */
describe('AIR ENG 1+2 BLEED FAULT / LEFT LEAK, RIGHT LEAK', () => {
  const leftLeak = (inputs: BleedInputs) => withEngine(inputs, 0, { wingOrPylonLeak: true });
  const rightLeak = (inputs: BleedInputs) => withEngine(inputs, 1, { wingOrPylonLeak: true });
  const eng1Fault = withEngine(cruise, 0, { overheat: true });
  const eng2Fault = withEngine(cruise, 1, { overpressure: true });

  it('LEFT LEAK: both bleed supplies lost with a leak on side 1 (l.70098-70099)', () => {
    const states = run(new BleedAlerts(), leftLeak(eng2Fault), 0.2);
    expect(states.engine1And2BleedFaultLeftLeak).toBe(true);
    expect(states.engine1And2BleedFault).toBe(false);
    // the dual alert replaces ENG 2 BLEED FAULT
    expect(states.engineBleedFault).toEqual([false, false]);
  });

  it('RIGHT LEAK: a leak on side 2 (l.70159-70160); LEFT LEAK AND RIGHT LEAK: on both sides (l.70232-70233)', () => {
    expect(run(new BleedAlerts(), rightLeak(eng1Fault), 0.2).engine1And2BleedFaultRightLeak).toBe(true);
    const both = run(new BleedAlerts(), leftLeak(rightLeak(cruise)), 0.2);
    expect(both.engine1And2BleedFaultLeftAndRightLeak).toBe(true);
    expect(both.engine1And2BleedFaultLeftLeak).toBe(false);
    expect(both.engine1And2BleedFaultRightLeak).toBe(false);
  });

  it('no LEAK subtitle without a leak (l.70025-70026), no dual alert with one supply left', () => {
    const plain = run(new BleedAlerts(), withEngine(eng1Fault, 1, { overpressure: true }), 0.2);
    expect(plain.engine1And2BleedFault).toBe(true);
    expect(plain.engine1And2BleedFaultLeftLeak).toBe(false);
    // a left leak alone: the L WING LEAK alert only (BleedLeakMonitoringAlerts)
    const oneSide = run(new BleedAlerts(), leftLeak(cruise), 0.2);
    expect(oneSide.engine1And2BleedFaultLeftLeak).toBe(false);
    expect(oneSide.engineBleedFault).toEqual([false, false]);
    // a leak on the side of a stopped engine: no bleed supply to lose
    const stopped = withEngine(rightLeak(eng1Fault), 1, { engineRunning: false, engineStopped: true });
    expect(run(new BleedAlerts(), stopped, 0.2).engine1And2BleedFaultRightLeak).toBe(false);
  });

  it('LEFT LEAK lines (l.70105-70118): X BLEED SHUT, WAI OFF, AVOID ICING, APU BLEED OFF if ON, ENG 2 OFF THEN ON', () => {
    const inputs = { ...leftLeak(eng2Fault), wingAntiIceOn: true, apuBleedPbOn: true };
    expect(engine1And2BleedFaultLeakLines(inputs, 'left', false)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const done = {
      ...withEngine(withEngine(leftLeak(eng2Fault), 0, { bleedPbAuto: false }), 1, { bleedPbAuto: false }),
      crossBleedSelector: CrossBleedSelector.Shut,
    };
    expect(engine1And2BleedFaultLeakLines(done, 'left', false)).toEqual([0, 1, 4, 6, 7, 10, 11]);
  });

  it('RIGHT LEAK asks APU BLEED OFF only for a failed APU bleed (l.70185-70188)', () => {
    const inputs = { ...rightLeak(eng1Fault), apuBleedPbOn: true };
    expect(engine1And2BleedFaultLeakLines(inputs, 'right', false)).toEqual([0, 1, 2, 4, 6, 7, 8, 9, 10, 11]);
    expect(engine1And2BleedFaultLeakLines(inputs, 'right', true)).toEqual([0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('LEFT LEAK AND RIGHT LEAK lines (l.70239-70250): no OFF THEN ON, ENG 1 and ENG 2 BLEED OFF', () => {
    const inputs = { ...leftLeak(rightLeak(cruise)), apuBleedPbOn: true };
    expect(engine1And2BleedFaultLeakLines(inputs, 'leftAndRight', false)).toEqual([0, 1, 2, 4, 5, 6, 7, 8, 9]);
  });

  it('the STATUS of ENG 1+2 BLEED FAULT (l.70140-70146, l.70203-70209, l.70271-70277)', () => {
    const alerts = new BleedAlerts();
    for (const key of [
      BleedAlertKeys.eng1And2BleedFaultLeftLeak,
      BleedAlertKeys.eng1And2BleedFaultRightLeak,
      BleedAlertKeys.eng1And2BleedFaultLeftAndRightLeak,
    ]) {
      expect(alerts.ewdFailures[key].inopSys()).toEqual(engine1And2BleedFaultStatus().inopSys);
      expect(alerts.ewdFailures[key].statusInfo()).toEqual(engine1And2BleedFaultStatus().left);
    }
  });

  it('E/WD subtitles LEFT LEAK, RIGHT LEAK, LEFT LEAK AND RIGHT LEAK in amber', () => {
    const subtitle = (key: string) => formatEwdMessages(bleedAlertCodes(key, 2))[1];
    expect(subtitle(BleedAlertKeys.eng1And2BleedFaultLeftLeak)).toContain('\x1b<4m LEFT LEAK');
    expect(subtitle(BleedAlertKeys.eng1And2BleedFaultRightLeak)).toContain('\x1b<4m RIGHT LEAK');
    expect(subtitle(BleedAlertKeys.eng1And2BleedFaultLeftAndRightLeak)).toContain('\x1b<4m LEFT LEAK AND RIGHT LEAK');
  });

  it('a leak on its side inhibits BLEED 1(2) OFF, as the LEAK procedures ask for ENG BLEED OFF', () => {
    expect(hasEngineBleedAlert(leftLeak(cruise), 0, false)).toBe(true);
    expect(hasEngineBleedAlert(cruise, 0, false)).toBe(false);
  });
});

/* l.70279-70452 */
describe('AIR ENG 1(2) BLEED LO TEMP', () => {
  it('follows the Rust LOW_TEMPERATURE flag; both engines give ENG 1+2 BLEED LO TEMP', () => {
    const alerts = new BleedAlerts();
    expect(run(alerts, withEngine(cruise, 1, { lowTemperature: true }), 0.2).engineBleedLoTemp).toEqual([false, true]);
    const both = run(
      alerts,
      withEngine(withEngine(cruise, 0, { lowTemperature: true }), 1, { lowTemperature: true }),
      0.2,
    );
    expect(both.engineBleedLoTemp).toEqual([false, false]);
    expect(both.engine1And2BleedLoTemp).toBe(true);
  });

  it('opposite bleed available (l.70312-70322): A/THR OFF, THR LEVER ADVANCE, IF UNSUCCESSFUL X BLEED, BLEED, PACK', () => {
    const loTemp = { ...withEngine(cruise, 0, { lowTemperature: true }), wingAntiIceOn: true };
    expect(engineBleedLoTempLines(loTemp, 0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(engineBleedLoTempStatus(loTemp, 0)).toEqual({ left: [], inopSys: [S.eng1Bleed] });
  });

  it('opposite bleed not available (l.70364-70372): IF UNSUCCESSFUL WING ANTI ICE OFF, AVOID ICING CONDITIONS', () => {
    const loTemp = {
      ...withEngine(withEngine(cruise, 0, { lowTemperature: true }), 1, { bleedPbAuto: false }),
      wingAntiIceOn: true,
      autoThrustEngaged: false,
    };
    expect(engineBleedLoTempLines(loTemp, 0)).toEqual([0, 2, 3, 7, 8]);
    expect(engineBleedLoTempStatus(loTemp, 0)).toEqual({
      left: [S.avoidIcing, S.ifSevereIceAccretion, S.minSpeed, S.maneuverWithCare, S.ldgDistProc],
      inopSys: [S.wingAntiIce],
    });
  });
});

/* l.70474-70490 */
describe('AIR ENG 1(2) BLEED HI TEMP', () => {
  it('triggers above 240 °C at the precooler outlet, not with the BLEED FAULT of the same engine', () => {
    expect(isEngineBleedHiTemp({ ...running, bleedTemperatureCelsius: 241 })).toBe(true);
    expect(isEngineBleedHiTemp({ ...running, bleedTemperatureCelsius: 240 })).toBe(false);
    expect(isEngineBleedHiTemp({ ...running, bleedTemperatureCelsius: 300, overheat: true })).toBe(false);
    // the sensor without output reads -100
    expect(isEngineBleedHiTemp({ ...running, bleedTemperatureCelsius: -100 })).toBe(false);
  });

  it('WAI off: PACK 2 (1) OFF; WAI on: the pack still on OR WAI OFF (l.70480-70490)', () => {
    expect(engineBleedHiTempLines(cruise, 0)).toEqual([0, 1]);
    expect(engineBleedHiTempLines(withEngine(cruise, 0, { packOn: false }), 0)).toEqual([0, 1]);
    expect(engineBleedHiTempLines({ ...withEngine(cruise, 1, { packOn: false }), wingAntiIceOn: true }, 0)).toEqual([
      0, 2,
    ]);
    expect(engineBleedHiTempLines({ ...withEngine(cruise, 0, { packOn: false }), wingAntiIceOn: true }, 0)).toEqual([
      0, 3,
    ]);
  });
});

/* l.70542-70544 */
describe('AIR ENG 1(2) BLEED NOT CLSD', () => {
  it('a bleed valve open during a start, with the APU bleed on, or with the engine stopped', () => {
    expect(isEngineBleedValveNotClosed(withEngine(cruise, 0, { starterValveOpen: true }), 0)).toBe(true);
    expect(isEngineBleedValveNotClosed(withEngine(cruise, 1, { engineRunning: false, engineStopped: true }), 1)).toBe(
      true,
    );
    const apuBleed = { ...cruise, apuBleedPbOn: true, apuBleedValveOpen: true };
    expect(isEngineBleedValveNotClosed(apuBleed, 0)).toBe(true);
    // engine 2 gets APU air only through the crossbleed valve (pneumatic.rs BMC)
    expect(isEngineBleedValveNotClosed(apuBleed, 1)).toBe(false);
    expect(isEngineBleedValveNotClosed({ ...apuBleed, crossBleedFullyClosed: false }, 1)).toBe(true);
    expect(isEngineBleedValveNotClosed(cruise, 0)).toBe(false);
  });

  it('needs 10 s, so a valve closing at engine shutdown or APU BLEED ON does not trigger it', () => {
    const alerts = new BleedAlerts();
    const stuck = withEngine(cruise, 0, { starterValveOpen: true });
    expect(run(alerts, stuck, 9.5).engineBleedNotClosed).toEqual([false, false]);
    expect(run(alerts, stuck, 0.6).engineBleedNotClosed).toEqual([true, false]);
    expect(run(alerts, cruise, 0.1).engineBleedNotClosed).toEqual([false, false]);
  });

  it('shows ENG BLEED OFF until the pb is OFF (l.70550)', () => {
    expect(engineBleedNotClosedLines(cruise, 1)).toEqual([0, 1]);
    expect(engineBleedNotClosedLines(withEngine(cruise, 1, { bleedPbAuto: false }), 1)).toEqual([0]);
  });
});

/* l.69686 */
describe('AIR BLEED 1(2) OFF', () => {
  it('triggers when the ENG BLEED pb of a running engine is set OFF without a reason', () => {
    const alerts = new BleedAlerts();
    expect(run(alerts, withEngine(cruise, 0, { bleedPbAuto: false }), 0.2).bleedOff).toEqual([true, false]);
    // fire pb pushed, engine not running: normal
    expect(run(alerts, withEngine(cruise, 0, { bleedPbAuto: false, firePbPushed: true }), 0.2).bleedOff[0]).toBe(false);
    expect(run(alerts, withEngine(cruise, 0, { bleedPbAuto: false, engineRunning: false }), 0.2).bleedOff[0]).toBe(
      false,
    );
  });

  it('is not shown once a bleed alert of that engine asked for the pb OFF, until the pb is AUTO again (design choice)', () => {
    const alerts = new BleedAlerts();
    // LO TEMP, the crew sets ENG 1 BLEED OFF: the LO TEMP flag goes (valve closed), BLEED 1 OFF must not follow
    run(alerts, withEngine(cruise, 0, { lowTemperature: true }), 0.2);
    run(alerts, withEngine(cruise, 0, { lowTemperature: true, bleedPbAuto: false }), 0.2);
    expect(run(alerts, withEngine(cruise, 0, { bleedPbAuto: false, bleedValveOpen: false }), 5).bleedOff[0]).toBe(
      false,
    );
    // back to AUTO then OFF again: abnormal
    run(alerts, cruise, 0.2);
    expect(run(alerts, withEngine(cruise, 0, { bleedPbAuto: false }), 0.2).bleedOff[0]).toBe(true);
  });
});

/* l.69519-69520 */
describe('AIR APU BLEED FAULT', () => {
  const apuRunning = { ...cruise, apuAvailable: true, apuMasterSwitchOn: true, apuSpeedPercent: 100 };

  it('APU running and the APU bleed valve disagrees with the pb', () => {
    expect(isApuBleedValveDisagree({ ...apuRunning, apuBleedPbOn: true, apuBleedValveOpen: false })).toBe(true);
    expect(isApuBleedValveDisagree({ ...apuRunning, apuBleedPbOn: false, apuBleedValveOpen: true })).toBe(true);
    expect(isApuBleedValveDisagree({ ...apuRunning, apuBleedPbOn: true, apuBleedValveOpen: true })).toBe(false);
  });

  it('not while the valve is normally closed: APU start, MASTER SW OFF, shutdown with AVAIL still on (design choice)', () => {
    const pbOnValveClosed = { apuBleedPbOn: true, apuBleedValveOpen: false };
    expect(isApuBleedValveDisagree({ ...apuRunning, ...pbOnValveClosed, apuAvailable: false })).toBe(false);
    expect(isApuBleedValveDisagree({ ...apuRunning, ...pbOnValveClosed, apuMasterSwitchOn: false })).toBe(false);
    expect(isApuBleedValveDisagree({ ...apuRunning, ...pbOnValveClosed, apuSpeedPercent: 90 })).toBe(false);
  });

  it('is confirmed after 10 s (the amber APU valve delay of the BLEED page, l.57807-57808)', () => {
    const alerts = new BleedAlerts();
    const disagree = { ...apuRunning, apuBleedPbOn: true, apuBleedValveOpen: false };
    expect(run(alerts, disagree, 9.5).apuBleedFault).toBe(false);
    expect(run(alerts, disagree, 0.6).apuBleedFault).toBe(true);
  });
});

/* l.71023-71038 */
describe('AIR X BLEED FAULT', () => {
  it('the crossbleed valve disagrees with the selector (AUTO: open with the APU bleed valve open)', () => {
    expect(isCrossBleedValveDisagree(cruise)).toBe(false);
    expect(isCrossBleedValveDisagree({ ...cruise, apuBleedValveOpen: true })).toBe(true);
    expect(
      isCrossBleedValveDisagree({
        ...cruise,
        crossBleedSelector: CrossBleedSelector.Open,
        crossBleedFullyOpen: true,
        crossBleedFullyClosed: false,
      }),
    ).toBe(false);
    expect(isCrossBleedValveDisagree({ ...cruise, crossBleedSelector: CrossBleedSelector.Open })).toBe(true);
  });

  it('is confirmed after 5 s (twice the valve travel time)', () => {
    const alerts = new BleedAlerts();
    const travelling = { ...cruise, crossBleedSelector: CrossBleedSelector.Open };
    expect(run(alerts, travelling, 4.5).crossBleedFault).toBe(false);
    expect(run(alerts, travelling, 0.6).crossBleedFault).toBe(true);
  });

  it('X BLEED MAN CTL; WING ANTI ICE OFF and the icing STATUS with the manual opening lost and one bleed', () => {
    expect(crossBleedFaultLines(cruise)).toEqual([0, 1]);
    const oneBleedManualLost = {
      ...withEngine(cruise, 1, { bleedPbAuto: false }),
      crossBleedSelector: CrossBleedSelector.Open,
      wingAntiIceOn: true,
    };
    expect(crossBleedFaultLines(oneBleedManualLost)).toEqual([0, 2, 3]);
    expect(crossBleedFaultStatus(oneBleedManualLost)).toEqual({
      left: [S.avoidIcing, S.ifSevereIceAccretion, S.minSpeed, S.maneuverWithCare, S.ldgDistProc, S.crossBleedManCtl],
      inopSys: [S.wingAntiIce, S.crossBleed],
    });
    expect(crossBleedFaultStatus(cruise)).toEqual({ left: [S.crossBleedManCtl], inopSys: [S.crossBleed] });
  });
});

describe('FWC alert items', () => {
  it('are amber cautions (level 2) that call the BLEED page, with the FCOM PDF phase inhibitions', () => {
    const alerts = new BleedAlerts();
    for (const item of Object.values(alerts.ewdFailures)) {
      expect(item.failure).toBe(2);
      expect(item.sysPage).toBe(1); // SdPages.BLEED
      expect(item.side).toBe('LEFT');
    }
    expect(alerts.ewdFailures[BleedAlertKeys.eng1BleedFault].flightPhaseInhib).toEqual([1, 3, 4, 5, 7, 8, 10]);
    expect(alerts.ewdFailures[BleedAlertKeys.eng2BleedLoTemp].flightPhaseInhib).toEqual([3, 4, 5, 8]);
    expect(alerts.ewdFailures[BleedAlertKeys.bleed1Off].flightPhaseInhib).toEqual([1, 3, 4, 5, 7, 8, 9, 10]);
    expect(BleedPhaseInhibition.apuBleedFault).toEqual([3, 4, 5, 7, 8]);
    expect(BleedPhaseInhibition.crossBleedFault).toEqual([3, 4, 5, 7, 8]);
    expect(BleedPhaseInhibition.bleedNotClosed).toEqual([3, 4, 5, 7, 8]);
  });

  it('are active only while their alert is triggered', () => {
    const alerts = new BleedAlerts();
    run(alerts, cruise, 1);
    expect(activeKeys(alerts)).toEqual([]);
    run(alerts, withEngine(cruise, 1, { overpressure: true }), 0.2);
    expect(activeKeys(alerts)).toEqual([BleedAlertKeys.eng2BleedFault]);
  });

  it('every E/WD code has a text, the titles under AIR (EwdMessages)', () => {
    for (const key of Object.values(BleedAlertKeys)) {
      const codes = bleedAlertCodes(key, BleedAlertLineCounts[key]);
      const texts = formatEwdMessages(codes);
      texts.forEach((text, i) => expect(text, codes[i]).not.toBe(''));
      expect(texts[0]).toContain('AIR');
    }
    expect(formatEwdMessages(['361100101'])[0]).toContain('ENG 1 BLEED FAULT');
  });

  it('every STATUS code has a text (StatusMessages)', () => {
    const page = formatStatusPage(Object.values(S), Object.values(S));
    for (const text of ['X BLEED MAN CTL', 'AVOID ICING CONDITIONS', 'ONE PACK ONLY IF WAI ON']) {
      expect(page.left).toContain(text);
    }
    for (const text of ['WING A. ICE', 'ENG 1 BLEED', 'ENG 2 BLEED', 'APU BLEED', 'X BLEED', 'PACK 1+2']) {
      expect(page.right).toContain(text);
    }
  });

  it('the PseudoFWC updates them and adds them to its alerts', () => {
    const fwc = readFileSync(resolve(__dirname, '../PseudoFWC.ts'), 'utf-8');
    expect(fwc).toContain('this.bleedAlerts.update(readBleedInputs(), deltaTime / 1000);');
    expect(fwc).toContain('...this.bleedAlerts.ewdFailures,');
  });
});
