// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { ConfirmTimer, FwcAlertItem, cautionItem } from './FwcAlertItem';

/*
 * The WING A.ICE cautions of the A320 (FCOM PRO-ABN-W_A_ICE, a320_fcom.txt l.96433-96719) from the outputs of the Rust
 * wing anti ice system (a320_systems/src/pneumatic/wing_anti_ice.rs):
 * - WING A.ICE SYS FAULT (l.96631-96686, FCOM PDF pages 5844-5847): "This alert triggers when the WING ANTI ICE pb-sw
 *   is set to ON and one wing anti ice valve remains closed." The WING ANTI ICE pb-sw FAULT light has the same trigger
 *   and also comes on with a low pressure (DSC-30-20-20 l.44297-44299), which the Rust system flags per wing. The
 *   procedure of the MSN 08557 and later variant (PDF page 5846) is used: "THRUST ... INCREASE (in case of WAI low bleed
 *   pressure, the alert may trigger although the WAI valve is opened)", "IF UNSUCCESSFUL: WING ANTI ICE ... OFF, AVOID
 *   ICING CONDITIONS". STATUS (l.96667-96686, PDF page 5847): AVOID ICING CONDITIONS, IF SEVERE ICE ACCRETION: MIN SPD
 *   VLS +10/G DOT, MANEUVER WITH CARE, LDG DIST PROC APPLY; INOP SYS WING ANTI ICE.
 * - WING A.ICE SYS FAULT after one engine shutdown or the loss of one bleed (l.96698-96719, PDF page 5848): "X BLEED
 *   ... OPEN", no STATUS. Used when the engine bleed valve of the side of the closed wing valve is closed.
 * - WING A.ICE L(R) HI PR (l.96433-96454, PDF page 5839): "the WING ANTI ICE pb-sw is set to ON and the pressure sensor
 *   (downstream of the valve) indicates a high pressure in the duct"; "THRUST LIM PENALTY"; STATUS THRUST LIM PENALTY,
 *   INOP SYS WAI REGUL.
 * Not modelled: WING A.ICE L(R) VALVE OPEN and OPEN ON GND (l.96466-96619). The Rust valves always follow their
 * controller (no valve failure), and the ground test closes them after 30 s, before the 35 s of OPEN ON GND.
 * All are amber cautions that call the BLEED page, inhibited in phases 3, 4, 5, 7 and 8 (PDF pages 5839, 5844, 5848).
 */

export const WingAntiIceAlertKeys = {
  sysFault: '3000110',
  sysFaultCrossBleed: '3000111',
  leftHighPressure: '3000112',
  rightHighPressure: '3000113',
} as const;

export const WING_ANTI_ICE_PHASE_INHIBITION = [3, 4, 5, 7, 8];

/**
 * The confirmation time of the wing anti ice cautions, in seconds. Design choice, the FCOM gives none: the FAULT light
 * "comes on briefly as the valves transit" (l.44301) and the duct pressure needs some seconds to build up after the valve
 * opens; 10 s as BLEED NOT CLSD (Logic/BleedAlerts).
 */
export const WING_ANTI_ICE_CONFIRM_SECONDS = 10;

/** What the FWC reads of one wing anti ice system */
export interface WingAntiIceSideInputs {
  /** L:A32NX_PNEU_WING_ANTI_ICE_n_VALVE_CLOSED */
  readonly valveClosed: boolean;
  /** L:A32NX_PNEU_WING_ANTI_ICE_n_LOW_PRESSURE: the valve is open with a low duct pressure */
  readonly lowPressure: boolean;
  /** L:A32NX_PNEU_WING_ANTI_ICE_n_HIGH_PRESSURE: the valve is open with a high duct pressure */
  readonly highPressure: boolean;
  /** L:A32NX_PNEU_ENG_n_PR_VALVE_OPEN: the engine bleed of that side supplies air */
  readonly engineBleedValveOpen: boolean;
}

export interface WingAntiIceInputs {
  /** L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_SELECTED: the WING ANTI ICE pb-sw is ON */
  readonly pbOn: boolean;
  /**
   * L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_ON: the controller commands the valves open (in flight with the pb-sw ON, on the
   * ground for the 30 s test only)
   */
  readonly valvesCommandedOpen: boolean;
  readonly sides: readonly [WingAntiIceSideInputs, WingAntiIceSideInputs];
  /** L:A32NX_PNEU_XBLEED_VALVE_FULLY_OPEN */
  readonly crossBleedFullyOpen: boolean;
}

/** A wing valve that does not do what the WING ANTI ICE pb-sw asks: closed or with a low pressure while commanded open */
export function isWingValveFault(inputs: WingAntiIceInputs, side: 0 | 1): boolean {
  const wing = inputs.sides[side];
  return inputs.pbOn && inputs.valvesCommandedOpen && (wing.valveClosed || wing.lowPressure);
}

/** WING A.ICE L(R) HI PR, before its confirmation time */
export function isWingHighPressure(inputs: WingAntiIceInputs, side: 0 | 1): boolean {
  return inputs.pbOn && inputs.sides[side].highPressure;
}

/** The WING A.ICE SYS FAULT variant: X BLEED OPEN when a faulty wing has no bleed of its own (l.96698-96701) */
export function isWingFaultFromLostBleed(inputs: WingAntiIceInputs, faults: readonly [boolean, boolean]): boolean {
  return [0, 1].some((side) => faults[side] && !inputs.sides[side].engineBleedValveOpen);
}

/**
 * The lines of WING A.ICE SYS FAULT (PDF page 5846): 0 title, 1 -THRUST INCREASE, 2 .IF UNSUCCESSFUL:, 3 -WING ANTI ICE
 * OFF, 4 AVOID ICING CONDITIONS.
 */
export function wingAntiIceSysFaultLines(): number[] {
  return [0, 1, 2, 3, 4];
}

/** The lines of the X BLEED variant (l.96718): 0 title, 1 -X BLEED OPEN, hidden once the crossbleed valve is open */
export function wingAntiIceCrossBleedLines(inputs: WingAntiIceInputs): (number | null)[] {
  return [0, inputs.crossBleedFullyOpen ? null : 1];
}

/** The STATUS codes of the wing anti ice cautions (StatusMessages) */
export const WingAntiIceStatusCodes = {
  avoidIcing: '700400001',
  ifSevereIceAccretion: '700500001',
  minSpeedVls10: '700400002',
  maneuverWithCare: '700400003',
  ldgDistProc: '700400004',
  wingAntiIce: '300300001',
  thrustLimPenalty: '300400001',
  waiRegul: '300300004',
} as const;

const W = WingAntiIceStatusCodes;

/** WING A.ICE SYS FAULT STATUS (l.96667-96686) */
export function wingAntiIceSysFaultStatus(): StatusLines {
  return {
    left: [W.avoidIcing, W.ifSevereIceAccretion, W.minSpeedVls10, W.maneuverWithCare, W.ldgDistProc],
    inopSys: [W.wingAntiIce],
  };
}

/** WING A.ICE L(R) HI PR STATUS (l.96448-96454) */
export function wingHighPressureStatus(): StatusLines {
  return { left: [W.thrustLimPenalty], inopSys: [W.waiRegul] };
}

export class WingAntiIceAlerts {
  private inputs: WingAntiIceInputs = {
    pbOn: false,
    valvesCommandedOpen: false,
    sides: [
      { valveClosed: true, lowPressure: false, highPressure: false, engineBleedValveOpen: false },
      { valveClosed: true, lowPressure: false, highPressure: false, engineBleedValveOpen: false },
    ],
    crossBleedFullyOpen: false,
  };

  private readonly faultTimers = [
    new ConfirmTimer(WING_ANTI_ICE_CONFIRM_SECONDS),
    new ConfirmTimer(WING_ANTI_ICE_CONFIRM_SECONDS),
  ];

  private readonly highPressureTimers = [
    new ConfirmTimer(WING_ANTI_ICE_CONFIRM_SECONDS),
    new ConfirmTimer(WING_ANTI_ICE_CONFIRM_SECONDS),
  ];

  private readonly sysFault = Subject.create(false);

  private readonly sysFaultCrossBleed = Subject.create(false);

  private readonly highPressure = [Subject.create(false), Subject.create(false)];

  /**
   * @param inputs the wing anti ice inputs of this update
   * @param deltaSeconds the time since the last update, in seconds
   */
  update(inputs: WingAntiIceInputs, deltaSeconds: number): void {
    this.inputs = inputs;
    const faults: [boolean, boolean] = [
      this.faultTimers[0].update(isWingValveFault(inputs, 0), deltaSeconds),
      this.faultTimers[1].update(isWingValveFault(inputs, 1), deltaSeconds),
    ];
    const anyFault = faults[0] || faults[1];
    const lostBleed = isWingFaultFromLostBleed(inputs, faults);
    this.sysFault.set(anyFault && !lostBleed);
    this.sysFaultCrossBleed.set(anyFault && lostBleed);
    for (const side of [0, 1] as const) {
      this.highPressure[side].set(this.highPressureTimers[side].update(isWingHighPressure(inputs, side), deltaSeconds));
    }
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [WingAntiIceAlertKeys.sysFault]: cautionItem(
      WingAntiIceAlertKeys.sysFault,
      5,
      this.sysFault,
      WING_ANTI_ICE_PHASE_INHIBITION,
      wingAntiIceSysFaultLines,
      EcamSysPage.BLEED,
      wingAntiIceSysFaultStatus,
    ),
    [WingAntiIceAlertKeys.sysFaultCrossBleed]: cautionItem(
      WingAntiIceAlertKeys.sysFaultCrossBleed,
      2,
      this.sysFaultCrossBleed,
      WING_ANTI_ICE_PHASE_INHIBITION,
      () => wingAntiIceCrossBleedLines(this.inputs),
      EcamSysPage.BLEED,
    ),
    [WingAntiIceAlertKeys.leftHighPressure]: cautionItem(
      WingAntiIceAlertKeys.leftHighPressure,
      2,
      this.highPressure[0],
      WING_ANTI_ICE_PHASE_INHIBITION,
      () => [0, 1],
      EcamSysPage.BLEED,
      wingHighPressureStatus,
    ),
    [WingAntiIceAlertKeys.rightHighPressure]: cautionItem(
      WingAntiIceAlertKeys.rightHighPressure,
      2,
      this.highPressure[1],
      WING_ANTI_ICE_PHASE_INHIBITION,
      () => [0, 1],
      EcamSysPage.BLEED,
      wingHighPressureStatus,
    ),
  };
}

/* Acquisition (not unit tested: SimVar reads only) */

const readBool = (name: string): boolean => SimVar.GetSimVarValue(name, 'bool') > 0;

function readSide(wai: 1 | 2): WingAntiIceSideInputs {
  return {
    valveClosed: readBool(`L:A32NX_PNEU_WING_ANTI_ICE_${wai}_VALVE_CLOSED`),
    lowPressure: readBool(`L:A32NX_PNEU_WING_ANTI_ICE_${wai}_LOW_PRESSURE`),
    highPressure: readBool(`L:A32NX_PNEU_WING_ANTI_ICE_${wai}_HIGH_PRESSURE`),
    engineBleedValveOpen: readBool(`L:A32NX_PNEU_ENG_${wai}_PR_VALVE_OPEN`),
  };
}

/** Reads the wing anti ice inputs from the simvars (system 1 is the left wing, on the engine 1 bleed) */
export function readWingAntiIceInputs(): WingAntiIceInputs {
  return {
    pbOn: readBool('L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_SELECTED'),
    valvesCommandedOpen: readBool('L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_ON'),
    sides: [readSide(1), readSide(2)],
    crossBleedFullyOpen: readBool('L:A32NX_PNEU_XBLEED_VALVE_FULLY_OPEN'),
  };
}
