// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { SdPages } from '@shared/EcamSystemPages';
import { describe, expect, it } from 'vitest';
import {
  ENG_OVER_LIMIT_ITEMS_SHOWN,
  ENG_STALL_ITEMS_SHOWN,
  EngineOverLimitInputs,
  isEgtOverLimit,
  isEgtOverLimitAlertTriggered,
  isN1N2OverLimit,
  isStallAlertShown,
} from './EngineParameterAlerts';
import { EcamAbnormalProcedures } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import { createFws, runFwsCycle } from './FwsSpecFixture';

const climb: EngineOverLimitInputs = {
  displayedEgtDegrees: 800,
  n1Percent: 85,
  n3Percent: 95,
  thrustLimitType: 1,
  alphaFloor: false,
  secondsAtOrAboveRedLine: 0,
};

describe('ENG STALL', () => {
  it('shows the stall of one engine outside the takeoff from V1 to 400 ft', () => {
    expect(isStallAlertShown(true, 1, 8)).toBe(true);
    expect(isStallAlertShown(true, 1, 2)).toBe(true);
    expect(isStallAlertShown(false, 0, 8)).toBe(false);
  });

  it('inhibits the stall of one engine from V1 to 400 ft, unless two or more engines stall', () => {
    expect(isStallAlertShown(true, 1, 5)).toBe(false);
    expect(isStallAlertShown(true, 1, 6)).toBe(false);
    expect(isStallAlertShown(true, 2, 5)).toBe(true);
    expect(isStallAlertShown(true, 3, 6)).toBe(true);
  });
});

/*
 * ENG EGT OVER LIMIT: above the red line (1 002 °C) during takeoff and go-around, with the thrust reversers selected
 * or in alpha floor, above the EGT limit (970 °C) at or below MCT. During takeoff the red indication it goes with is
 * at or above 1 022 °C, or at or above 1 002 °C for more than 20 s.
 */
describe('ENG EGT OVER LIMIT', () => {
  it('triggers above the 970 °C EGT limit at or below MCT', () => {
    expect(isEgtOverLimit({ ...climb, displayedEgtDegrees: 970 })).toBe(false);
    expect(isEgtOverLimit({ ...climb, displayedEgtDegrees: 971 })).toBe(true);
    expect(isEgtOverLimit({ ...climb, thrustLimitType: 2, displayedEgtDegrees: 971 })).toBe(true);
  });

  it('at TOGA and FLEX triggers from 1 022 °C, or from 1 002 °C held for more than 20 s', () => {
    const toga = { ...climb, thrustLimitType: 4 };
    expect(isEgtOverLimit({ ...toga, displayedEgtDegrees: 990 })).toBe(false);
    expect(isEgtOverLimit({ ...toga, displayedEgtDegrees: 1021 })).toBe(false);
    expect(isEgtOverLimit({ ...toga, displayedEgtDegrees: 1022 })).toBe(true);
    expect(isEgtOverLimit({ ...toga, displayedEgtDegrees: 1010, secondsAtOrAboveRedLine: 15 })).toBe(false);
    expect(isEgtOverLimit({ ...toga, displayedEgtDegrees: 1010, secondsAtOrAboveRedLine: 21 })).toBe(true);
    expect(
      isEgtOverLimit({ ...climb, thrustLimitType: 3, displayedEgtDegrees: 1010, secondsAtOrAboveRedLine: 21 }),
    ).toBe(true);
  });

  it('with the reversers selected or in alpha floor triggers at the red line, without the takeoff tolerance', () => {
    expect(isEgtOverLimit({ ...climb, thrustLimitType: 5, displayedEgtDegrees: 990 })).toBe(false);
    expect(isEgtOverLimit({ ...climb, thrustLimitType: 5, displayedEgtDegrees: 1002 })).toBe(true);
    expect(isEgtOverLimit({ ...climb, alphaFloor: true, displayedEgtDegrees: 990 })).toBe(false);
    expect(isEgtOverLimit({ ...climb, alphaFloor: true, displayedEgtDegrees: 1002 })).toBe(true);
    expect(isEgtOverLimit({ ...climb, thrustLimitType: 4, alphaFloor: true, displayedEgtDegrees: 1002 })).toBe(true);
  });
});

/* With ENG FADEC FAULT, ENG EGT OVER LIMIT does not trigger on an EGT exceedance */
describe('ENG EGT OVER LIMIT with ENG FADEC FAULT', () => {
  it('does not trigger with the FADEC FAULT of the engine', () => {
    expect(isEgtOverLimitAlertTriggered(true, false)).toBe(true);
    expect(isEgtOverLimitAlertTriggered(true, true)).toBe(false);
    expect(isEgtOverLimitAlertTriggered(false, false)).toBe(false);
  });
});

describe('ENG N1/N2 OVER LIMIT', () => {
  it('triggers above the N1 red limit of 111 % or the N2 (FBW N3) red limit of 118.7 %', () => {
    expect(isN1N2OverLimit(climb)).toBe(false);
    expect(isN1N2OverLimit({ ...climb, n1Percent: 112 })).toBe(true);
    expect(isN1N2OverLimit({ ...climb, n3Percent: 119 })).toBe(true);
  });
});

describe('the ENG STALL, EGT OVER LIMIT and N1/N2 OVER LIMIT alerts of the four engines', () => {
  const { core } = createFws();
  const sensed = (id: number) => core.abnormalSensed.ewdAbnormalSensed[id];
  const itemCount = (id: number) => EcamAbnormalProcedures[id].items.length;

  it.each([0, 1, 2, 3])('engine %i: inhibition, level and number of items', (index) => {
    const stall = sensed(701800113 + index);
    expect(stall.simVarIsActive).toBe(core.engStall[index]);
    expect(stall.flightPhaseInhib).toEqual([]);
    expect(stall.failure).toBe(2);
    const egt = sensed(701800009 + index);
    expect(egt.simVarIsActive).toBe(core.engEgtOverLimit[index]);
    expect(egt.flightPhaseInhib).toEqual([4, 5, 6]);
    expect(egt.failure).toBe(2);
    const n1n2 = sensed(701800073 + index);
    expect(n1n2.simVarIsActive).toBe(core.engN1N2OverLimit[index]);
    expect(n1n2.flightPhaseInhib).toEqual([5, 6]);
    expect(n1n2.failure).toBe(3);
    // Audio and Master Light only, no SD page; STALL has the ENGINE page
    expect(egt.sysPage).toBe(SdPages.None);
    expect(n1n2.sysPage).toBe(SdPages.None);
    expect(stall.sysPage).toBe(SdPages.Eng);

    expect(itemCount(701800113 + index)).toBe(ENG_STALL_ITEMS_SHOWN.length);
    expect(itemCount(701800009 + index)).toBe(ENG_OVER_LIMIT_ITEMS_SHOWN.length);
    expect(itemCount(701800073 + index)).toBe(ENG_OVER_LIMIT_ITEMS_SHOWN.length);
    expect(stall.whichItemsToShow()).toEqual(ENG_STALL_ITEMS_SHOWN);
    expect(egt.whichItemsToShow()).toEqual(ENG_OVER_LIMIT_ITEMS_SHOWN);
    expect(n1n2.whichItemsToShow()).toEqual(ENG_OVER_LIMIT_ITEMS_SHOWN);
    // N1/N2 OVER LIMIT is a red warning
    expect(EcamAbnormalProcedures[701800073 + index].title.startsWith('\x1b<2m')).toBe(true);
  });
});

describe('the engine parameter alerts driven through the FWS', () => {
  const runningEngine1 = () => {
    const fixture = createFws();
    fixture.core.bus.getPublisher<any>().pub('engine_master_1', true, true);
    fixture.simVars.set('L:A32NX_ENGINE_STATE:1', 1);
    // CLB thrust limit
    fixture.simVars.set('L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE', 1);
    return fixture;
  };

  it('raises ENG STALL from the stall simvar of the engine', () => {
    const { core, simVars } = runningEngine1();
    simVars.set('L:A32NX_ENGINE_1_STALL', 1);
    runFwsCycle(core);
    expect(core.engStall.map((alert) => alert.get())).toEqual([true, false, false, false]);
  });

  it('raises ENG EGT OVER LIMIT from the EGT the EWD shows', () => {
    const { core, simVars } = runningEngine1();
    simVars.set('L:A32NX_ENGINE_EGT:1', 971);
    runFwsCycle(core);
    expect(core.engEgtOverLimit.map((alert) => alert.get())).toEqual([true, false, false, false]);
  });

  it('counts the time at or above the red line of each engine on the EGT the EWD shows', () => {
    const { core, simVars } = runningEngine1();
    // TOGA: 1 002 °C only counts once held for more than 20 s
    simVars.set('L:A32NX_AUTOTHRUST_THRUST_LIMIT_TYPE', 4);
    simVars.set('L:A32NX_ENGINE_EGT:1', 1010);
    runFwsCycle(core, 10_000);
    expect(core.engEgtOverLimit[0].get()).toBe(false);
    runFwsCycle(core, 11_000);
    expect(core.engEgtOverLimit[0].get()).toBe(true);
  });

  it('does not raise ENG EGT OVER LIMIT with the FADEC FAULT of the engine, the EWD attention box keeps the exceedance', () => {
    const { core, simVars } = runningEngine1();
    simVars.set('L:A32NX_ENGINE_EGT:1', 971);
    simVars.set('L:A32NX_ENGINE_1_FADEC_FAULT', 1);
    runFwsCycle(core);
    expect(core.fadecFault[0].get()).toBe(true);
    expect(core.engEgtOverLimit[0].get()).toBe(false);
    expect(core.eng1PrimaryAbnormalParams.get()).toBe(true);
  });

  it('raises ENG N1/N2 OVER LIMIT above the red limit', () => {
    const { core, simVars } = runningEngine1();
    simVars.set('L:A32NX_ENGINE_N3:1', 119);
    runFwsCycle(core);
    expect(core.engN1N2OverLimit.map((alert) => alert.get())).toEqual([true, false, false, false]);
  });
});
