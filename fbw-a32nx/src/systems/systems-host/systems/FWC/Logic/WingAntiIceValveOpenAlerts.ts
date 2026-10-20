// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { CondStatusCodes, StatusLines } from './CondStatus';
import { ConfirmTimer } from './BleedAlerts';
import { CrossBleedSelector } from './EngineFailAlerts';
import { FwcAlertItem, cautionItem, readBool } from './FwcAlertItem';
import { WING_ANTI_ICE_CONFIRM_SECONDS } from './WingAntiIceAlerts';

/*
 * WING A.ICE L(R) VALVE OPEN and WING A.ICE OPEN ON GND of the A320 FWC, from the Rust wing anti ice system
 * (a320_systems pneumatic/wing_anti_ice.rs, flyPad wing anti-ice valve stuck open failures):
 * - L(R) VALVE OPEN: the WING ANTI ICE pb-sw is OFF and the wing anti ice valve of that side remains open. The
 *   FAILURE DETECTED IN FLIGHT and ON GROUND procedures are one alert whose lines follow where the aircraft is:
 *   - before takeoff: -ENG BLEED (AFFECTED SIDE) OFF, -X BLEED SHUT (if not closed), -APU BLEED OFF (left wing),
 *     WAI AVAIL IN FLT;
 *   - in flight (automatic recall above 1 500 ft): WAI AVAIL IN FLT, -ENG BLEED (AFFECTED SIDE) ON (if it was set OFF on
 *     ground), -WING ANTI ICE AS RQRD, THRUST LIM PENALTY;
 *   - after landing (automatic recall): -ENG BLEED (AFFECTED SIDE) OFF, -X BLEED SHUT, -APU BLEED OFF (left wing).
 *   The -WING ANTI ICE OFF line of the ground procedures is not shown: the alert needs the pb-sw OFF.
 *   STATUS: WAI AVAIL IN FLT, in flight also THRUST LIM PENALTY; on ground INOP SYS ENG 1(2) BLEED and PACK 1(2).
 *   Inhibited in phases 4, 5, 7, 8.
 * - OPEN ON GND: on ground, a wing anti ice valve is still open 35 s after the WING ANTI ICE pb-sw is set ON (the
 *   ground test ends after 30 s). -WING ANTI ICE OFF, STATUS WAI AVAIL IN FLT. Inhibited in phases 3 to 8.
 * Amber cautions that call the BLEED page.
 */

export const WingAntiIceValveOpenKeys = {
  valveOpen: ['3000114', '3000115'],
  openOnGround: '3000116',
} as const;

const VALVE_OPEN_PHASE_INHIBITION = [4, 5, 7, 8];

const OPEN_ON_GROUND_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8];

/** The time the valves may stay open on ground after the pb-sw is set ON, in seconds */
export const OPEN_ON_GROUND_SECONDS = 35;

/** The FWC flight phase from which the aircraft is on ground after landing (80 kt in the landing roll) */
const AFTER_LANDING_PHASE = 9;

export interface WingAntiIceValveSideInputs {
  /** L:A32NX_PNEU_WING_ANTI_ICE_n_VALVE_CLOSED */
  readonly valveClosed: boolean;
  /** L:A32NX_OVHD_PNEU_ENG_n_BLEED_PB_IS_AUTO */
  readonly engineBleedPbAuto: boolean;
}

export interface WingAntiIceValveOpenInputs {
  /** L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_SELECTED: the WING ANTI ICE pb-sw is ON */
  readonly pbOn: boolean;
  readonly sides: readonly [WingAntiIceValveSideInputs, WingAntiIceValveSideInputs];
  readonly crossBleedSelector: CrossBleedSelector;
  /** L:A32NX_OVHD_PNEU_APU_BLEED_PB_IS_ON */
  readonly apuBleedPbOn: boolean;
  readonly onGround: boolean;
  readonly flightPhase: number;
}

/**
 * The lines of L(R) VALVE OPEN: 0 title, 1 WAI AVAIL IN FLT, 2 -ENG BLEED ON, 3 -WING ANTI ICE AS RQRD, 4 THRUST LIM
 * PENALTY, 5 -ENG BLEED OFF, 6 -X BLEED SHUT, 7 -APU BLEED OFF (left side only)
 */
function valveOpenLines(inputs: WingAntiIceValveOpenInputs, side: 0 | 1): (number | null)[] {
  const engineBleedOn = inputs.sides[side].engineBleedPbAuto;
  if (!inputs.onGround) {
    return [0, 1, engineBleedOn ? null : 2, 3, 4];
  }
  const groundActions = [
    engineBleedOn ? 5 : null,
    inputs.crossBleedSelector !== CrossBleedSelector.Shut ? 6 : null,
    side === 0 && inputs.apuBleedPbOn ? 7 : null,
  ];
  const afterLanding = inputs.flightPhase >= AFTER_LANDING_PHASE;
  return afterLanding ? [0, ...groundActions] : [0, ...groundActions, 1];
}

const STATUS = {
  waiAvailableInFlight: '300200001',
  thrustLimPenalty: '300400001',
  engineBleed: ['360300001', '360300002'],
  pack: [CondStatusCodes.pack1, CondStatusCodes.pack2],
} as const;

function valveOpenStatus(onGround: boolean, side: 0 | 1): StatusLines {
  return onGround
    ? { left: [STATUS.waiAvailableInFlight], inopSys: [STATUS.engineBleed[side], STATUS.pack[side]] }
    : { left: [STATUS.thrustLimPenalty, STATUS.waiAvailableInFlight], inopSys: [] };
}

export class WingAntiIceValveOpenAlerts {
  private inputs: WingAntiIceValveOpenInputs | null = null;

  private readonly valveOpenTimers = [
    new ConfirmTimer(WING_ANTI_ICE_CONFIRM_SECONDS),
    new ConfirmTimer(WING_ANTI_ICE_CONFIRM_SECONDS),
  ];

  private secondsSincePbOnOnGround = 0;

  private readonly valveOpen = [Subject.create(false), Subject.create(false)];

  private readonly openOnGround = Subject.create(false);

  update(inputs: WingAntiIceValveOpenInputs, deltaSeconds: number): void {
    this.inputs = inputs;
    inputs.sides.forEach((side, index) =>
      this.valveOpen[index].set(this.valveOpenTimers[index].update(!inputs.pbOn && !side.valveClosed, deltaSeconds)),
    );

    this.secondsSincePbOnOnGround = inputs.onGround && inputs.pbOn ? this.secondsSincePbOnOnGround + deltaSeconds : 0;
    const anyValveOpen = inputs.sides.some((side) => !side.valveClosed);
    this.openOnGround.set(this.secondsSincePbOnOnGround > OPEN_ON_GROUND_SECONDS && anyValveOpen);
  }

  private valveOpenItem(side: 0 | 1): FwcAlertItem {
    return cautionItem(
      WingAntiIceValveOpenKeys.valveOpen[side],
      side === 0 ? 8 : 7,
      this.valveOpen[side],
      VALVE_OPEN_PHASE_INHIBITION,
      () => (this.inputs ? valveOpenLines(this.inputs, side) : [0]),
      EcamSysPage.BLEED,
      () => valveOpenStatus(this.inputs?.onGround ?? true, side),
    );
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [WingAntiIceValveOpenKeys.valveOpen[0]]: this.valveOpenItem(0),
    [WingAntiIceValveOpenKeys.valveOpen[1]]: this.valveOpenItem(1),
    // 0 title, 1 -WING ANTI ICE OFF
    [WingAntiIceValveOpenKeys.openOnGround]: cautionItem(
      WingAntiIceValveOpenKeys.openOnGround,
      2,
      this.openOnGround,
      OPEN_ON_GROUND_PHASE_INHIBITION,
      () => [0, 1],
      EcamSysPage.BLEED,
      () => ({ left: [STATUS.waiAvailableInFlight], inopSys: [] }),
    ),
  };
}

/** Reads the wing anti ice valves, the bleed pb-sws and the X BLEED selector (system 1 is the left wing) */
export function readWingAntiIceValveOpenInputs(onGround: boolean, flightPhase: number): WingAntiIceValveOpenInputs {
  const side = (number: 1 | 2): WingAntiIceValveSideInputs => ({
    valveClosed: readBool(`L:A32NX_PNEU_WING_ANTI_ICE_${number}_VALVE_CLOSED`),
    engineBleedPbAuto: readBool(`L:A32NX_OVHD_PNEU_ENG_${number}_BLEED_PB_IS_AUTO`),
  });
  return {
    pbOn: readBool('L:A32NX_PNEU_WING_ANTI_ICE_SYSTEM_SELECTED'),
    sides: [side(1), side(2)],
    crossBleedSelector: SimVar.GetSimVarValue('L:A32NX_KNOB_OVHD_AIRCOND_XBLEED_Position', 'number'),
    apuBleedPbOn: readBool('L:A32NX_OVHD_PNEU_APU_BLEED_PB_IS_ON'),
    onGround,
    flightPhase,
  };
}
