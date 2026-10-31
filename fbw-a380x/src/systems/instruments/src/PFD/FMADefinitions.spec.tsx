// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { FSComponent, Subject } from '@microsoft/msfs-sdk';
import { Arinc429Register, Arinc429SignStatusMatrix, ArincEventBus } from '@flybywiresim/fbw-sdk';
import { FMA } from './FMA';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlsCapability } from '@flybywiresim/pfd';
import {
  armedGlideSlopeText,
  B1Messages,
  BC3Messages,
  C1Messages,
  computeB1Message,
  computeBC3Message,
  computeC1Message,
  computeD1D2Message,
  D1D2Messages,
  getD1D2Lines,
  isCheckEoSpeedSetting,
  isSpeedAtUpperMargin,
  manualTakeoffThrustLabel,
  SpeedBrakeMessage,
  speedBrakeMessage,
  SpeedBrakeMessageInputs,
} from './FMADefinitions';

function word(bits: number[] = []): Arinc429Register {
  const w = Arinc429Register.empty();
  w.setSsm(Arinc429SignStatusMatrix.NormalOperation);
  bits.forEach((bit) => w.setBitValue(bit, true));
  return w;
}

function bc3(
  checkSpeedMode: boolean,
  checkEoSpeedSetting: boolean,
  tdReached = false,
  spdBrk = SpeedBrakeMessage.NONE,
  checkApprSel = false,
): BC3Messages {
  return computeBC3Message(
    false,
    false,
    word(),
    8,
    tdReached,
    false,
    false,
    word(),
    word(),
    checkSpeedMode,
    checkEoSpeedSetting,
    spdBrk,
    checkApprSel,
  );
}

// The ECAM message tables are not used by the FMA but are loaded by the PFD modules, and import each other in a cycle
vi.mock('../MsfsAvionicsCommon/EcamMessages', () => ({}));

afterEach(() => {
  document.body.innerHTML = '';
});

/** Draws the FMA on a bus the spec publishes the PFD data on (a topic nobody published reads as its default) */
function drawFma() {
  const bus = new ArincEventBus();
  const container = document.createElement('div');
  document.body.appendChild(container);
  FSComponent.render(<FMA bus={bus} isAttExcessive={Subject.create(false)} />, container);
  return {
    container,
    publish: (topic: string, value: number | boolean) => bus.pub(topic, value, false, false),
  };
}

describe('A380X FMA line 3 FMS messages', () => {
  it('shows CHECK SPD MODE when the FMS sets it', () => {
    expect(bc3(false, false)).toBe(BC3Messages.NONE);
    expect(bc3(true, false)).toBe(BC3Messages.CHECK_SPD_MODE);
  });

  it('shows CHECK EO SPD SETTING, before T/D REACHED', () => {
    expect(bc3(false, true)).toBe(BC3Messages.CHECK_EO_SPD_SETTING);
    expect(bc3(false, true, true)).toBe(BC3Messages.CHECK_EO_SPD_SETTING);
  });
});

describe('A380X FMA line 3 speed brake and approach selection messages', () => {
  it('shows EXTEND SPD BRK and RETRACT SPD BRK from the speed brake message, after T/D REACHED', () => {
    expect(bc3(false, false, false, SpeedBrakeMessage.EXTEND)).toBe(BC3Messages.EXTEND_SPD_BRK);
    expect(bc3(false, false, false, SpeedBrakeMessage.RETRACT)).toBe(BC3Messages.RETRACT_SPD_BRK);
    expect(bc3(false, false, true, SpeedBrakeMessage.EXTEND)).toBe(BC3Messages.TD_REACHED);
  });

  it('shows CHECK APPR SEL when the FMS sets it, after CHECK SPD MODE', () => {
    expect(bc3(false, false, false, SpeedBrakeMessage.NONE, true)).toBe(BC3Messages.CHECK_APPR_SEL);
    expect(bc3(true, false, false, SpeedBrakeMessage.NONE, true)).toBe(BC3Messages.CHECK_SPD_MODE);
  });

  it('the FMA passes CHECK APPR SEL to the line 3 message', () => {
    const fma = drawFma();
    fma.publish('checkApprSel', false);
    expect(fma.container.innerHTML).not.toContain('CHECK APPR SEL');
    fma.publish('checkApprSel', true);
    expect(fma.container.innerHTML).toContain('CHECK APPR SEL');
  });
});

describe('EXTEND SPD BRK / RETRACT SPD BRK conditions', () => {
  /** In DES at idle, flaps up, speed brakes retracted, 1 000 ft above the path at the upper speed margin */
  const extendCase: SpeedBrakeMessageInputs = {
    desActive: true,
    altOrAltStarActive: false,
    descentOrApproachPhase: true,
    thrustIdle: true,
    flapsConf3OrFull: false,
    speedBrakesExtended: false,
    linearDeviationFt: 1000,
    speedAtUpperMargin: true,
  };

  it('EXTEND SPD BRK above the path in DES at idle with the speed at the upper margin', () => {
    expect(speedBrakeMessage(extendCase)).toBe(SpeedBrakeMessage.EXTEND);
  });

  it('no EXTEND SPD BRK while the speed can still increase, on the path, below it, or without the path', () => {
    expect(speedBrakeMessage({ ...extendCase, speedAtUpperMargin: false })).toBe(SpeedBrakeMessage.NONE);
    // on the vertical profile while the vertical deviation is less than 50 ft
    expect(speedBrakeMessage({ ...extendCase, linearDeviationFt: 50 })).toBe(SpeedBrakeMessage.NONE);
    expect(speedBrakeMessage({ ...extendCase, linearDeviationFt: 51 })).toBe(SpeedBrakeMessage.EXTEND);
    expect(speedBrakeMessage({ ...extendCase, linearDeviationFt: -800 })).toBe(SpeedBrakeMessage.NONE);
    expect(speedBrakeMessage({ ...extendCase, linearDeviationFt: null })).toBe(SpeedBrakeMessage.NONE);
  });

  it('no EXTEND SPD BRK out of DES, without idle thrust, or at flaps 3 / FULL', () => {
    expect(speedBrakeMessage({ ...extendCase, desActive: false })).toBe(SpeedBrakeMessage.NONE);
    expect(speedBrakeMessage({ ...extendCase, thrustIdle: false })).toBe(SpeedBrakeMessage.NONE);
    expect(speedBrakeMessage({ ...extendCase, flapsConf3OrFull: true })).toBe(SpeedBrakeMessage.NONE);
  });

  it('no message with the speed brakes extended above the path', () => {
    expect(speedBrakeMessage({ ...extendCase, speedBrakesExtended: true })).toBe(SpeedBrakeMessage.NONE);
  });

  it('RETRACT SPD BRK below the path in DES with the speed brakes extended', () => {
    const below = { ...extendCase, speedBrakesExtended: true, linearDeviationFt: -300, speedAtUpperMargin: false };
    expect(speedBrakeMessage(below)).toBe(SpeedBrakeMessage.RETRACT);
    expect(speedBrakeMessage({ ...below, linearDeviationFt: -50 })).toBe(SpeedBrakeMessage.NONE);
    expect(speedBrakeMessage({ ...below, speedBrakesExtended: false })).toBe(SpeedBrakeMessage.NONE);
  });

  it('RETRACT SPD BRK at the ALT* / ALT level off in descent, or at flaps 3 / FULL in DES', () => {
    const extended = { ...extendCase, speedBrakesExtended: true, linearDeviationFt: 0 };
    expect(speedBrakeMessage({ ...extended, desActive: false, altOrAltStarActive: true })).toBe(
      SpeedBrakeMessage.RETRACT,
    );
    // ALT in cruise is not a level off after DES
    expect(
      speedBrakeMessage({ ...extended, desActive: false, altOrAltStarActive: true, descentOrApproachPhase: false }),
    ).toBe(SpeedBrakeMessage.NONE);
    expect(speedBrakeMessage({ ...extended, flapsConf3OrFull: true })).toBe(SpeedBrakeMessage.RETRACT);
    expect(speedBrakeMessage(extended)).toBe(SpeedBrakeMessage.NONE);
  });

  it('the speed is at the upper margin within 2 kt, only with the margins shown', () => {
    expect(isSpeedAtUpperMargin(true, 300, 298)).toBe(true);
    expect(isSpeedAtUpperMargin(true, 300, 297)).toBe(false);
    expect(isSpeedAtUpperMargin(false, 300, 305)).toBe(false);
    expect(isSpeedAtUpperMargin(true, 300, null)).toBe(false);
  });
});

describe('CHECK EO SPD SETTING condition', () => {
  const GD = 220;

  it('applies in CLIMB and CRUISE with the selected speed 10 kt or more away from green dot', () => {
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Climb, false, true, 230, GD)).toBe(true);
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Cruise, false, true, 210, GD)).toBe(true);
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Cruise, false, true, 229, GD)).toBe(false);
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Cruise, false, true, 211, GD)).toBe(false);
  });

  it('does not apply in ALT* / ALT, in other phases, in managed speed or with all engines', () => {
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Cruise, true, true, 250, GD)).toBe(false);
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Descent, false, true, 250, GD)).toBe(false);
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Cruise, false, false, 250, GD)).toBe(false);
    expect(isCheckEoSpeedSetting(false, FmgcFlightPhase.Cruise, false, true, 250, GD)).toBe(false);
    expect(isCheckEoSpeedSetting(true, FmgcFlightPhase.Cruise, false, true, null, GD)).toBe(false);
  });
});

describe('A380X FMA approach capability wording', () => {
  it('CAT1, CAT2, CAT3 SINGLE and CAT3 DUAL instead of APPR1, LAND2 and LAND3', () => {
    expect(getD1D2Lines(D1D2Messages.APPR_1)).toEqual(['CAT1', '']);
    expect(getD1D2Lines(D1D2Messages.LAND_2)).toEqual(['CAT2', '']);
    expect(getD1D2Lines(D1D2Messages.LAND_3_SINGLE)).toEqual(['CAT3', 'SINGLE']);
    expect(getD1D2Lines(D1D2Messages.LAND_3_DUAL)).toEqual(['CAT3', 'DUAL']);
  });

  it('F-APP, F-APP +RAW and RAW ONLY unchanged, nothing without a capability', () => {
    expect(getD1D2Lines(D1D2Messages.F_APP)).toEqual(['F-APP', '']);
    expect(getD1D2Lines(D1D2Messages.F_APP_RAW)).toEqual(['F-APP', '+RAW']);
    expect(getD1D2Lines(D1D2Messages.RAW_ONLY)).toEqual(['RAW', 'ONLY']);
    expect(getD1D2Lines(D1D2Messages.NONE)).toEqual(['', '']);
  });
});

describe('A380X FMA manual takeoff thrust label', () => {
  it('MAN DTO with a derated takeoff selected, MAN FLX without', () => {
    expect(manualTakeoffThrustLabel(12)).toBe('DTO');
    expect(manualTakeoffThrustLabel(4)).toBe('DTO');
    expect(manualTakeoffThrustLabel(0)).toBe('FLX');
  });

  it('the FMA reads the selected derate for the MAN FLX message', () => {
    const manualThrustMessage = (derate: number) => {
      const fma = drawFma();
      fma.publish('prim_fg_ats_fma_discrete_word', word([13]).rawWord);
      fma.publish('takeoffDerate', derate);
      return ['DTO', 'FLX'].filter((label) => fma.container.innerHTML.includes(`>${label}</text>`));
    };
    expect(manualThrustMessage(0)).toEqual(['FLX']);
    expect(manualThrustMessage(4)).toEqual(['DTO']);
  });
});

describe('A380X FMA modes on an FLS approach', () => {
  const GS_CAPTURE = 21;
  const GS_TRACK = 22;
  const LOC_CAPTURE = 13;
  const LOC_TRACK = 14;
  const BACK_BEAM = 29;

  it('keeps LOC* / LOC / G/S* / G/S on an ILS approach', () => {
    expect(computeB1Message(word([GS_CAPTURE]), false)).toBe(B1Messages.GS_STAR);
    expect(computeB1Message(word([GS_TRACK]), false)).toBe(B1Messages.GS);
    expect(computeC1Message(word([LOC_CAPTURE]), false)).toBe(C1Messages.LOC_STAR);
    expect(computeC1Message(word([LOC_TRACK]), false)).toBe(C1Messages.LOC);
    expect(armedGlideSlopeText(false)).toBe('G/S');
  });

  it('shows F-LOC* / F-LOC / F-G/S* / F-G/S when both axes fly the FLS beam', () => {
    expect(computeB1Message(word([GS_CAPTURE]), true)).toBe(B1Messages.F_GS_STAR);
    expect(computeB1Message(word([GS_TRACK]), true)).toBe(B1Messages.F_GS);
    expect(computeC1Message(word([LOC_CAPTURE]), true)).toBe(C1Messages.F_LOC_STAR);
    expect(computeC1Message(word([LOC_TRACK]), true)).toBe(C1Messages.F_LOC);
    expect(armedGlideSlopeText(true)).toBe('F-G/S');
  });

  it('LOC approach: LOC with F-G/S', () => {
    expect(computeC1Message(word([LOC_TRACK]), false)).toBe(C1Messages.LOC);
    expect(computeB1Message(word([GS_TRACK]), true)).toBe(B1Messages.F_GS);
  });

  it('keeps LOC B/C on a back course', () => {
    expect(computeC1Message(word([LOC_TRACK, BACK_BEAM]), true)).toBe(C1Messages.LOC_BC);
  });

  it('shows the FLS capability instead of CAT1/2/3', () => {
    const LAND_ARMED = 28;
    const LAND2_CAPACITY = 24;
    const d1d2 = (capability: FlsCapability) =>
      computeD1D2Message(word(), word([LAND_ARMED]), word([LAND2_CAPACITY]), true, capability);
    expect(d1d2(FlsCapability.None)).toBe(D1D2Messages.LAND_2);
    expect(d1d2(FlsCapability.FApp)).toBe(D1D2Messages.F_APP);
    expect(d1d2(FlsCapability.FAppRaw)).toBe(D1D2Messages.F_APP_RAW);
    expect(d1d2(FlsCapability.RawOnly)).toBe(D1D2Messages.RAW_ONLY);
    expect(computeD1D2Message(word(), word(), word(), true, FlsCapability.None)).toBe(D1D2Messages.APPR_1);
  });
});
