// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { formatEwdMessages } from '../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../shared/src/StatusMessages';
import {
  entrySource,
  evaluateEntryArray,
  evaluatePseudoFwcExpression,
  expectCode,
  readSource,
  runPseudoFwcStatement,
} from './PseudoFwcSpecSource';

const fwc = readSource('PseudoFWC.ts');
const entry = (key: string) => entrySource(fwc, key);

const countTrue = (...values: boolean[]) => values.filter((value) => value).length;

describe('GND SPLR FAULT alerts', () => {
  /** The alerts as PseudoFWC computes them from the SEC ground spoiler fault bits of the FCDC */
  function groundSpoilerAlerts(sec1: boolean, sec2: boolean, sec3: boolean): Record<string, unknown> {
    const lostGroundSpoilerSecs = evaluatePseudoFwcExpression(
      fwc,
      'const lostGroundSpoilerSecs =',
      {},
      { countTrue, sec1GroundSpoilerFault: sec1, sec2GroundSpoilerFault: sec2, sec3GroundSpoilerFault: sec3 },
    );
    const values: Record<string, unknown> = {};
    for (const name of ['gndSplrFault', 'gndSplr5Fault', 'gndSplr12Fault', 'gndSplr34Fault']) {
      values[name] = runPseudoFwcStatement(
        fwc,
        `this.${name}.set(`,
        { [name]: false },
        {
          lostGroundSpoilerSecs,
          sec1GroundSpoilerFault: sec1,
          sec2GroundSpoilerFault: sec2,
          sec3GroundSpoilerFault: sec3,
        },
      )[name];
    }
    return values;
  }

  it('one lost SEC gives its own alert: SEC 2 GND SPLR 5, SEC 3 GND SPLR 1+2, SEC 1 GND SPLR 3+4', () => {
    expect(groundSpoilerAlerts(false, true, false)).toEqual({
      gndSplrFault: false,
      gndSplr5Fault: true,
      gndSplr12Fault: false,
      gndSplr34Fault: false,
    });
    expect(groundSpoilerAlerts(false, false, true)).toEqual({
      gndSplrFault: false,
      gndSplr5Fault: false,
      gndSplr12Fault: true,
      gndSplr34Fault: false,
    });
    expect(groundSpoilerAlerts(true, false, false)).toEqual({
      gndSplrFault: false,
      gndSplr5Fault: false,
      gndSplr12Fault: false,
      gndSplr34Fault: true,
    });
  });

  it('two or three lost SECs give GND SPLR FAULT alone, no loss gives nothing', () => {
    for (const [sec1, sec2, sec3] of [
      [true, true, false],
      [true, false, true],
      [false, true, true],
      [true, true, true],
    ]) {
      expect(groundSpoilerAlerts(sec1, sec2, sec3)).toEqual({
        gndSplrFault: true,
        gndSplr5Fault: false,
        gndSplr12Fault: false,
        gndSplr34Fault: false,
      });
    }
    expect(Object.values(groundSpoilerAlerts(false, false, false))).toEqual([false, false, false, false]);
  });

  it('are crew awareness alerts (level 1) with LDG DIST PROC APPLY and the lost spoilers as INOP SYS', () => {
    for (const [key, codes, inopSys] of [
      ['2701250', '270125001', '270300042'],
      ['2701260', '270126001', '270300040'],
      ['2701270', '270127001', '270300041'],
    ]) {
      const alert = entry(key);
      expect(evaluateEntryArray(alert, 'flightPhaseInhib')).toEqual([3, 4, 5]);
      expectCode(alert, `codesToReturn: ['${codes}'],`);
      expectCode(alert, 'failure: 1, sysPage: EcamSysPage.NONE,');
      expectCode(alert, `inopSys: () => ['${inopSys}'],`);
      expectCode(alert, "statusInfo: () => ['270400011'],");
    }
    expect(formatStatusPage(['270400011'], ['270300042']).left).toContain('LDG DIST PROC');
    expect(formatStatusPage([], ['270300042']).right).toContain('GND SPLR 5');
  });

  it('GND SPLR FAULT lists the INOP SYS of every lost SEC', () => {
    const alert = entry('2701280');
    const lists = (sec1: boolean, sec2: boolean, sec3: boolean) =>
      evaluateEntryArray(alert, 'inopSys', {
        sec1GroundSpoilerLost: sec1,
        sec2GroundSpoilerLost: sec2,
        sec3GroundSpoilerLost: sec3,
      });
    expect(lists(true, false, true)).toEqual(['270300040', '270300041']);
    expect(lists(true, true, true)).toEqual(['270300040', '270300041', '270300042']);
    expectCode(alert, 'simVarIsActive: this.gndSplrFault,');
  });
});

describe('SPD BRK FAULT alerts', () => {
  function speedBrakeAlerts(sec1Lever: boolean, sec3Lever: boolean): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const name of ['spdBrkFault', 'spdBrk2Fault', 'spdBrk34Fault']) {
      values[name] = runPseudoFwcStatement(
        fwc,
        `this.${name}.set(`,
        { [name]: false },
        { sec1SpeedbrakeLeverFault: sec1Lever, sec3SpeedbrakeLeverFault: sec3Lever },
      )[name];
    }
    return values;
  }

  it('SEC 3 lever transducers failed gives SPD BRK 2, SEC 1 gives SPD BRK 3+4, both give SPD BRK FAULT', () => {
    expect(speedBrakeAlerts(false, true)).toEqual({ spdBrkFault: false, spdBrk2Fault: true, spdBrk34Fault: false });
    expect(speedBrakeAlerts(true, false)).toEqual({ spdBrkFault: false, spdBrk2Fault: false, spdBrk34Fault: true });
    expect(speedBrakeAlerts(true, true)).toEqual({ spdBrkFault: true, spdBrk2Fault: false, spdBrk34Fault: false });
    expect(speedBrakeAlerts(false, false)).toEqual({ spdBrkFault: false, spdBrk2Fault: false, spdBrk34Fault: false });
  });

  it('the SPD BRK 3+4 and SPD BRK alerts say SPD BRK DO NOT USE, the SPD BRK 2 alert does not', () => {
    expectCode(entry('2701290'), "codesToReturn: ['270129001'],");
    expect(entry('2701290')).not.toContain('statusInfo');
    expectCode(entry('2701300'), "codesToReturn: ['270130001', '270130002'],");
    expectCode(entry('2701300'), "statusInfo: () => ['270400004'],");
    expectCode(entry('2701310'), "statusInfo: () => ['270400004'],");
    expect(formatEwdMessages(['270130001', '270130002']).join(' | ')).toBe(
      '\x1b<4m\x1b4mF/CTL\x1bm SPD BRK 3+4 FAULT | \x1b<5m -SPD BRK.......DO NOT USE',
    );
    expect(formatStatusPage(['270400004'], []).left).toContain('DO NOT USE');
  });

  it('reads the FCDC lever fault bits the C++ flight controls write', () => {
    const fcdc = readSource('../../../../wasm/fbw_a320/src/fcdc/Fcdc.cpp');
    expectCode(
      fcdc,
      'output.efcsStatus5.setBit(11, !isNo(busInputs.sec1.speed_brake_lever_command_deg) && discreteInputs.sec1Valid);',
    );
    expectCode(
      fwc,
      'const sec1SpeedbrakeLeverFault = fcdc1DiscreteWord5.bitValue(11) || fcdc2DiscreteWord5.bitValue(11);',
    );
    expectCode(
      fwc,
      'const sec1GroundSpoilerFault = fcdc1DiscreteWord5.bitValue(14) || fcdc2DiscreteWord5.bitValue(14);',
    );
  });
});

describe('BRAKES RELEASED alerts', () => {
  const lvars = (values: Record<string, boolean>) => ({
    isSet: (name: string) => values[name.replace('L:A32NX_', '')] ?? false,
  });

  function brakeReleaseAlerts(
    gearDownlocked: boolean,
    engineRunning: boolean,
    released: Record<string, boolean>,
  ): Record<string, unknown> {
    const brakeReleaseDetectable = evaluatePseudoFwcExpression(fwc, 'const brakeReleaseDetectable =', {
      lgDownlocked: gearDownlocked,
      engine1CoreAtOrAboveMinIdle: engineRunning,
      engine2CoreAtOrAboveMinIdle: false,
    });
    const values: Record<string, unknown> = {};
    for (const [name, lvar] of [
      ['brakesReleased', 'BRAKES_WHEEL_RELEASED'],
      ['brakesAltnLeftReleased', 'BRAKES_ALTN_L_RELEASED'],
      ['brakesAltnRightReleased', 'BRAKES_ALTN_R_RELEASED'],
    ]) {
      values[name] = runPseudoFwcStatement(
        fwc,
        `this.${name}.set(`,
        { [name]: false },
        { brakeReleaseDetectable, ...lvars({ [lvar]: released[lvar] ?? false }) },
      )[name];
    }
    return values;
  }

  it('need the gear downlocked and an engine running', () => {
    expect(brakeReleaseAlerts(true, true, { BRAKES_WHEEL_RELEASED: true })).toEqual({
      brakesReleased: true,
      brakesAltnLeftReleased: false,
      brakesAltnRightReleased: false,
    });
    expect(brakeReleaseAlerts(false, true, { BRAKES_WHEEL_RELEASED: true }).brakesReleased).toBe(false);
    expect(brakeReleaseAlerts(true, false, { BRAKES_WHEEL_RELEASED: true }).brakesReleased).toBe(false);
  });

  it('ALTN L and ALTN R are told apart', () => {
    expect(brakeReleaseAlerts(true, true, { BRAKES_ALTN_L_RELEASED: true })).toEqual({
      brakesReleased: false,
      brakesAltnLeftReleased: true,
      brakesAltnRightReleased: false,
    });
    expect(brakeReleaseAlerts(true, true, { BRAKES_ALTN_R_RELEASED: true }).brakesAltnRightReleased).toBe(true);
  });

  it('BRAKES RELEASED: level 1, LDG DIST PROC APPLY, CAT 2 ONLY, INOP SYS CAT 3 and AUTO BRK', () => {
    const alert = entry('3200540');
    expectCode(alert, "codesToReturn: ['320054001'],");
    expectCode(alert, 'failure: 1, sysPage: EcamSysPage.NONE,');
    expectCode(alert, "inopSys: () => ['240300128', '290300033'],");
    expectCode(alert, "statusInfo: () => ['290400017', '240200102'],");
    expect(formatStatusPage(['290400017', '240200102'], ['240300128', '290300033']).left).toContain('CAT 2 ONLY');
    expect(formatEwdMessages(['320054001']).join('')).toBe('\x1b<4m\x1b4mBRAKES\x1bm RELEASED');
  });

  it('ALTN L(R) RELEASED: level 2 on the WHEEL page, ASYM BRK PROC, LDG DIST PROC, INOP SYS ALTN L(R) BRK', () => {
    for (const [key, side, titleCode, inopSys] of [
      ['3200550', 'L', '320055001', '320300002'],
      ['3200560', 'R', '320056001', '320300003'],
    ]) {
      const alert = entry(key);
      expectCode(alert, `codesToReturn: ['${titleCode}', '${titleCode.slice(0, -1)}2'],`);
      expectCode(alert, 'failure: 2, sysPage: EcamSysPage.WHEEL,');
      expectCode(alert, `inopSys: () => ['${inopSys}'],`);
      expect(formatEwdMessages([titleCode, `${titleCode.slice(0, -1)}2`]).join(' | ')).toBe(
        `\x1b<4m\x1b4mBRAKES\x1bm ALTN ${side} RELEASED | \x1b<5m -ASYM BRK PROC.....APPLY`,
      );
      expect(formatStatusPage([], [inopSys]).right).toContain(`ALTN ${side} BRK`);
    }
  });
});

describe('BRAKES-N/WS MINOR FAULT', () => {
  it('shows with the BSCU minor fault, not with the WHEEL N/W STRG FAULT that already tells the steering loss', () => {
    const minorFault = (lvar: boolean, nwStrgFault: boolean) =>
      runPseudoFwcStatement(
        fwc,
        'this.brakesNwsMinorFault.set(',
        { brakesNwsMinorFault: false, brakeSystemAlerts: { nwStrgFault: { get: () => nwStrgFault } } },
        { isSet: (name: string) => name === 'L:A32NX_BRAKES_NW_STRG_MINOR_FAULT' && lvar },
      ).brakesNwsMinorFault;
    expect(minorFault(true, false)).toBe(true);
    expect(minorFault(true, true)).toBe(false);
    expect(minorFault(false, false)).toBe(false);
  });

  it('is a level 1 alert without STATUS', () => {
    const alert = entry('3200570');
    expect(evaluateEntryArray(alert, 'flightPhaseInhib')).toEqual([3, 4, 5, 7, 8]);
    expectCode(alert, "codesToReturn: ['320057001'],");
    expectCode(alert, 'failure: 1, sysPage: EcamSysPage.NONE,');
    expect(alert).not.toContain('statusInfo');
    expect(formatEwdMessages(['320057001']).join('')).toBe('\x1b<4m\x1b4mBRAKES\x1bm N/WS MINOR FAULT');
  });
});

describe('L/G SHOCK ABSORBER FAULT', () => {
  /** A word of the LGCIU discrete word 2: bits 12 nose, 13 left main, 14 right main compressed */
  const lgciuWord = (valid: boolean, nose: boolean, left: boolean, right: boolean) => ({
    isNormalOperation: () => valid,
    bitValue: (bit: number) => ({ 12: nose, 13: left, 14: right })[bit] ?? false,
  });

  /** What the confirm node of each variant receives for the given phase and LGCIU words */
  function confirmedConditions(flightPhase: number, words: ReturnType<typeof lgciuWord>[]) {
    const confirms: Record<string, boolean | undefined> = {};
    const recorder = (name: string) => ({
      write: (condition: boolean) => {
        confirms[name] = condition;
      },
    });
    runPseudoFwcStatement(
      fwc,
      'this.shockAbsorberExtendedOnGroundConfirm.write(',
      { shockAbsorberExtendedOnGroundConfirm: recorder('ground') },
      {
        flightPhaseForShockAbsorbers: flightPhase,
        mainShockAbsorberExtended: evaluatePseudoFwcExpression(
          fwc,
          'const mainShockAbsorberExtended =',
          {},
          { lgciuShockAbsorberWords: words },
        ),
        noseShockAbsorberExtended: evaluatePseudoFwcExpression(
          fwc,
          'const noseShockAbsorberExtended =',
          {},
          { lgciuShockAbsorberWords: words },
        ),
        deltaTime: 50,
      },
    );
    runPseudoFwcStatement(
      fwc,
      'this.shockAbsorberCompressedInFlightConfirm.write(',
      { shockAbsorberCompressedInFlightConfirm: recorder('flight') },
      {
        flightPhaseForShockAbsorbers: flightPhase,
        anyShockAbsorberCompressed: evaluatePseudoFwcExpression(
          fwc,
          'const anyShockAbsorberCompressed =',
          {},
          { lgciuShockAbsorberWords: words },
        ),
        deltaTime: 50,
      },
    );
    return confirms;
  }

  it('after landing (phases 9 and 10) a shock absorber one valid LGCIU reads extended triggers the ground variant', () => {
    for (const phase of [9, 10]) {
      expect(confirmedConditions(phase, [lgciuWord(true, true, true, true)])).toEqual({ ground: false, flight: false });
      expect(confirmedConditions(phase, [lgciuWord(true, true, false, true)]).ground).toBe(true);
      expect(confirmedConditions(phase, [lgciuWord(true, true, true, false)]).ground).toBe(true);
      expect(confirmedConditions(phase, [lgciuWord(true, false, true, true)]).ground).toBe(true);
    }
    expect(confirmedConditions(8, [lgciuWord(true, true, false, true)]).ground).toBe(false);
    expect(confirmedConditions(2, [lgciuWord(true, true, false, true)]).ground).toBe(false);
  });

  it('the second LGCIU alone is enough, an invalid LGCIU is ignored', () => {
    expect(confirmedConditions(9, [lgciuWord(true, true, true, true), lgciuWord(true, true, true, false)]).ground).toBe(
      true,
    );
    expect(confirmedConditions(9, [lgciuWord(true, true, true, true)]).ground).toBe(false);
  });

  it('after liftoff (phases 5 to 7) a compressed shock absorber triggers the airborne variant', () => {
    for (const phase of [5, 6, 7]) {
      expect(confirmedConditions(phase, [lgciuWord(true, false, false, false)]).flight).toBe(false);
      expect(confirmedConditions(phase, [lgciuWord(true, true, false, false)]).flight).toBe(true);
      expect(confirmedConditions(phase, [lgciuWord(true, false, true, false)]).flight).toBe(true);
      expect(confirmedConditions(phase, [lgciuWord(true, false, false, true)]).flight).toBe(true);
    }
    for (const phase of [4, 8, 9]) {
      expect(confirmedConditions(phase, [lgciuWord(true, true, true, true)]).flight).toBe(false);
    }
  });

  it('the ground variant is a level 1 alert, shown after landing only', () => {
    const alert = entry('3200520');
    expect(evaluateEntryArray(alert, 'flightPhaseInhib')).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expectCode(alert, "codesToReturn: ['320052001'],");
    expectCode(alert, 'failure: 1, sysPage: EcamSysPage.NONE,');
    expect(alert).not.toContain('statusInfo');
  });

  it('the airborne variant gives the gear procedure only with the gear not uplocked', () => {
    const alert = entry('3200530');
    expect(evaluateEntryArray(alert, 'flightPhaseInhib')).toEqual([1, 2, 3, 4, 8, 9, 10]);
    const lines = (notUplocked: boolean, leverUp: boolean) =>
      evaluateEntryArray(alert, 'whichCodeToReturn', {
        shockAbsorberGearNotUplocked: notUplocked,
        shockAbsorberGearLeverUp: leverUp,
      });
    expect(lines(false, true)).toEqual([0, null, null, null, null, null]);
    expect(lines(true, false)).toEqual([0, 1, 2, null, 4, 5]);
    expect(lines(true, true)).toEqual([0, 1, null, 3, 4, 5]);
    expectCode(alert, 'failure: 2, sysPage: EcamSysPage.WHEEL,');
    expectCode(alert, "inopSys: () => (this.shockAbsorberGearNotUplocked.get() ? ['290300036'] : []),");
    expectCode(alert, "['320400001', '320400091', '290400018', '290400019']");
    expect(formatEwdMessages(['320053001', '320053002', '320053003', '320053004', '320053005', '320053006'])).toEqual([
      '\x1b<4m\x1b4mL/G\x1bm SHOCK ABSORBER FAULT',
      '\x1b<5m MAX SPEED.......280/.67',
      '\x1b<5m -L/G..........KEEP DOWN',
      '\x1b<5m -L/G..............DOWN',
      '\x1b<5m FUEL CONSUMPT INCRSD',
      '\x1b<5m FMS PRED UNRELIABLE',
    ]);
  });
});

describe('the SEC failures and their consumers', () => {
  it('the C++ flight controls pass the failures to the SECs', () => {
    const interfaceSource = readSource('../../../../wasm/fbw_a320/src/FlyByWireInterface.cpp');
    expectCode(
      interfaceSource,
      `secs[secIndex].speedBrakeLeverTransducersFailed =
        (secIndex == 0 && failuresConsumer.isActive(Failures::SpeedBrakeLeverSec1)) ||
        (secIndex == 2 && failuresConsumer.isActive(Failures::SpeedBrakeLeverSec3));`,
    );
    expectCode(interfaceSource, 'secs[secIndex].groundSpoilerFunctionFailed = failuresConsumer.isActive(');
    const sec = readSource('../../../../wasm/fbw_a320/src/sec/Sec.cpp');
    expectCode(sec, 'Arinc429Utils::setBit(output.discrete_status_word_1, 24, true);');
    expectCode(sec, 'output.speed_brake_lever_command_deg.SSM = Arinc429SignStatus::FailureWarning;');
  });
});
