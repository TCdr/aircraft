// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, describe, expect, it, vi } from 'vitest';
import { FSComponent, Subject } from '@microsoft/msfs-sdk';
import { Arinc429Register, Arinc429SignStatusMatrix, ArincEventBus } from '@flybywiresim/fbw-sdk';
import { FMA } from './FMA';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlsCapability, GlsCapability, glsCapability } from '@flybywiresim/pfd';
import {
  approachModeStates,
  armedGlideSlopeText,
  B1Messages,
  BC3Messages,
  C1Messages,
  computeB1Message,
  computeBC3Message,
  computeC1Message,
  computeD1D2Message,
  D1D2Messages,
  DisconnectApForLdgInputs,
  getD1D2Lines,
  isCheckEoSpeedSetting,
  isDisconnectApForLdg,
  isNonPrecisionVerticalMode,
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

describe('A380X GLS capability in FMA column 4', () => {
  const LAND_ARMED = 28;
  const LAND2_CAPACITY = 24;
  const LAND3_PASSIVE_CAPACITY = 25;
  const LAND3_OPERATIONAL_CAPACITY = 26;
  const d1d2 = (capability: GlsCapability, fcdcBits: number[]) =>
    computeD1D2Message(word(), word([LAND_ARMED]), word(fcdcBits), true, FlsCapability.None, capability);

  it('shows AUTO LAND on two lines', () => {
    expect(d1d2(GlsCapability.AutoLand, [])).toBe(D1D2Messages.AUTO_LAND);
    expect(getD1D2Lines(D1D2Messages.AUTO_LAND)).toEqual(['AUTO', 'LAND']);
  });

  it('shows nothing on a selected GLS before the approach modes arm, whatever the guidance reports', () => {
    const notArmed = (fcdcBits: number[]) =>
      computeD1D2Message(word(), word(), word(fcdcBits), true, FlsCapability.None, GlsCapability.NotArmed);
    expect(notArmed([LAND2_CAPACITY])).toBe(D1D2Messages.NONE);
    expect(notArmed([LAND3_PASSIVE_CAPACITY])).toBe(D1D2Messages.NONE);
    expect(notArmed([LAND3_OPERATIONAL_CAPACITY])).toBe(D1D2Messages.NONE);
  });

  it('shows CAT1 for the CAT 1 capability', () => {
    expect(d1d2(GlsCapability.Cat1, [])).toBe(D1D2Messages.APPR_1);
    expect(getD1D2Lines(D1D2Messages.APPR_1)).toEqual(['CAT1', '']);
  });

  it('never shows CAT2 or CAT3 on a GLS, whatever the flight guidance reports', () => {
    for (const capability of [GlsCapability.Cat1, GlsCapability.AutoLand]) {
      for (const bit of [LAND2_CAPACITY, LAND3_PASSIVE_CAPACITY, LAND3_OPERATIONAL_CAPACITY]) {
        expect([D1D2Messages.LAND_2, D1D2Messages.LAND_3_SINGLE, D1D2Messages.LAND_3_DUAL]).not.toContain(
          d1d2(capability, [bit]),
        );
      }
    }
  });

  it('keeps the CAT words without a GLS capability', () => {
    expect(d1d2(GlsCapability.None, [LAND2_CAPACITY])).toBe(D1D2Messages.LAND_2);
  });
});

describe('A380X approach mode states for the GLS capability', () => {
  const LAND_ACTIVE_WORD1 = 23;
  const FLARE_WORD3 = 24;
  const ROLL_OUT_WORD4 = 26;
  const LOC_TRACK_WORD4 = 14;
  const LOC_ARMED_WORD2 = 23;
  const GS_ARMED_WORD2 = 13;
  const LAND_ARMED_WORD2 = 28;
  const modes = (bits: { w1?: number[]; w2?: number[]; w3?: number[]; w4?: number[] }) =>
    approachModeStates(word(bits.w1), word(bits.w2), word(bits.w3), word(bits.w4));
  const capability = (
    states: ReturnType<typeof modes>,
    glsBits: Partial<Parameters<typeof glsCapability>[0]> = {},
    landArmed = false,
  ) =>
    glsCapability({
      glsSelected: true,
      catWordsCondition: word(landArmed ? [LAND_ARMED_WORD2] : []).bitValueOr(28, false),
      landModesEngaged: states.landModesEngaged,
      flightGuidanceCat2OrBetter: true,
      gls1LocValid: true,
      gls2LocValid: true,
      gls1GsValid: true,
      gls2GsValid: true,
      ...glsBits,
    });

  it('reports LOC tracking as armed or engaged and not as a landing mode', () => {
    expect(modes({ w4: [LOC_TRACK_WORD4] })).toEqual({ armedOrEngaged: true, landModesEngaged: false });
  });

  it('reports LAND, FLARE and ROLL OUT as landing modes', () => {
    expect(modes({ w1: [LAND_ACTIVE_WORD1] }).landModesEngaged).toBe(true);
    expect(modes({ w3: [FLARE_WORD3] }).landModesEngaged).toBe(true);
    expect(modes({ w4: [ROLL_OUT_WORD4] }).landModesEngaged).toBe(true);
  });

  it('keeps the GLS capability through LAND, FLARE and ROLL OUT even with the G/S invalid', () => {
    for (const bits of [{ w1: [LAND_ACTIVE_WORD1] }, { w3: [FLARE_WORD3] }, { w4: [ROLL_OUT_WORD4] }]) {
      const states = modes(bits);
      expect(capability(states, { gls1GsValid: false, gls2GsValid: false })).toBe(GlsCapability.AutoLand);
      expect(capability(states, { flightGuidanceCat2OrBetter: false })).toBe(GlsCapability.Cat1);
      expect(computeD1D2Message(word(bits.w1), word(), word(), false, FlsCapability.None, capability(states))).toBe(
        D1D2Messages.AUTO_LAND,
      );
    }
  });

  it('shows nothing when no approach mode is armed or engaged', () => {
    expect(capability(modes({}))).toBe(GlsCapability.NotArmed);
  });

  it('shows nothing with LOC or G/S armed alone, where an ILS shows no CAT word either', () => {
    expect(capability(modes({ w2: [LOC_ARMED_WORD2, GS_ARMED_WORD2] }))).toBe(GlsCapability.NotArmed);
    expect(capability(modes({ w4: [LOC_TRACK_WORD4] }))).toBe(GlsCapability.NotArmed);
  });

  it('shows the capability once LAND is armed, as the ILS CAT words do', () => {
    const locAndGsArmed = modes({ w2: [LOC_ARMED_WORD2, GS_ARMED_WORD2] });
    expect(capability(locAndGsArmed, {}, true)).toBe(GlsCapability.AutoLand);
    expect(capability(locAndGsArmed, { flightGuidanceCat2OrBetter: false }, true)).toBe(GlsCapability.Cat1);
  });
});

describe('A380X DISCONNECT AP FOR LDG', () => {
  const landing = (over: Partial<DisconnectApForLdgInputs> = {}): DisconnectApForLdgInputs => ({
    apEngaged: true,
    approachPhase: true,
    nonPrecisionVerticalMode: true,
    noDhSelected: false,
    baroAltitudeFt: 2_000,
    mdaFt: 1_100,
    dhFt: null,
    radioAltitudeFt: 1_500,
    landingElevationFt: 500,
    ...over,
  });

  it('shows at the MDA minus 50 ft with a BARO minimum', () => {
    expect(isDisconnectApForLdg(landing({ baroAltitudeFt: 1_051 }))).toBe(false);
    expect(isDisconnectApForLdg(landing({ baroAltitudeFt: 1_050 }))).toBe(true);
  });

  it('shows at the DH minus 50 ft with a RADIO minimum', () => {
    const radio = (radioAltitudeFt: number) => landing({ mdaFt: null, dhFt: 250, radioAltitudeFt });
    expect(isDisconnectApForLdg(radio(201))).toBe(false);
    expect(isDisconnectApForLdg(radio(200))).toBe(true);
  });

  it('shows at 350 ft above the landing elevation without a minimum', () => {
    const noMinimum = (baroAltitudeFt: number) => landing({ mdaFt: null, dhFt: null, baroAltitudeFt });
    expect(isDisconnectApForLdg(noMinimum(851))).toBe(false);
    expect(isDisconnectApForLdg(noMinimum(850))).toBe(true);
  });

  it('does not use the old 150 ft radio height without a minimum', () => {
    expect(isDisconnectApForLdg(landing({ mdaFt: null, baroAltitudeFt: 850, radioAltitudeFt: 400 }))).toBe(true);
    expect(isDisconnectApForLdg(landing({ mdaFt: null, baroAltitudeFt: 900, radioAltitudeFt: 100 }))).toBe(false);
  });

  it('gives false when the data of the minimum that applies is invalid', () => {
    expect(isDisconnectApForLdg(landing({ baroAltitudeFt: null }))).toBe(false);
    expect(isDisconnectApForLdg(landing({ mdaFt: null, dhFt: 250, radioAltitudeFt: null }))).toBe(false);
    expect(isDisconnectApForLdg(landing({ mdaFt: null, baroAltitudeFt: null }))).toBe(false);
    expect(isDisconnectApForLdg(landing({ mdaFt: null, landingElevationFt: null }))).toBe(false);
  });

  it('treats NO DH as no minimum, even with an MDA or DH', () => {
    const noDh = (over: Partial<DisconnectApForLdgInputs>) => landing({ noDhSelected: true, mdaFt: 1_100, ...over });
    expect(isDisconnectApForLdg(noDh({ baroAltitudeFt: 850 }))).toBe(true);
    expect(isDisconnectApForLdg(noDh({ baroAltitudeFt: 1_000, landingElevationFt: 500 }))).toBe(false);
    expect(isDisconnectApForLdg(noDh({ baroAltitudeFt: 851 }))).toBe(false);
    expect(isDisconnectApForLdg(noDh({ mdaFt: null, dhFt: 250, baroAltitudeFt: 1_000, radioAltitudeFt: 150 }))).toBe(
      false,
    );
  });

  it('uses the no-minimum rule when the minimum data is not valid', () => {
    expect(isDisconnectApForLdg(landing({ mdaFt: null, baroAltitudeFt: 1_000 }))).toBe(false);
    expect(isDisconnectApForLdg(landing({ mdaFt: null, baroAltitudeFt: 850 }))).toBe(true);
  });

  it('gives false when the altitude is not valid', () => {
    expect(isDisconnectApForLdg(landing({ baroAltitudeFt: null }))).toBe(false);
    expect(isDisconnectApForLdg(landing({ noDhSelected: true, baroAltitudeFt: null }))).toBe(false);
  });

  it('uses 350 ft radio height without a minimum and without a valid landing elevation', () => {
    const noElevation = (radioAltitudeFt: number | null) =>
      landing({ mdaFt: null, landingElevationFt: null, radioAltitudeFt });
    expect(isDisconnectApForLdg(noElevation(400))).toBe(false);
    expect(isDisconnectApForLdg(noElevation(340))).toBe(true);
    expect(isDisconnectApForLdg(noElevation(null))).toBe(false);
  });

  it('needs the AP, the approach phase and a non precision vertical mode', () => {
    expect(isDisconnectApForLdg(landing({ baroAltitudeFt: 1_000, apEngaged: false }))).toBe(false);
    expect(isDisconnectApForLdg(landing({ baroAltitudeFt: 1_000, approachPhase: false }))).toBe(false);
    expect(isDisconnectApForLdg(landing({ baroAltitudeFt: 1_000, nonPrecisionVerticalMode: false }))).toBe(false);
  });

  it('counts the vertical modes of a non precision approach, F-G/S included', () => {
    for (const mode of [
      B1Messages.DES,
      B1Messages.OP_DES,
      B1Messages.FPA,
      B1Messages.VS,
      B1Messages.APP_DES,
      B1Messages.F_GS,
      B1Messages.F_GS_STAR,
    ]) {
      expect(isNonPrecisionVerticalMode(mode)).toBe(true);
    }
    for (const mode of [B1Messages.GS, B1Messages.GS_STAR, B1Messages.NONE, B1Messages.ALT, B1Messages.SRS]) {
      expect(isNonPrecisionVerticalMode(mode)).toBe(false);
    }
  });
});
