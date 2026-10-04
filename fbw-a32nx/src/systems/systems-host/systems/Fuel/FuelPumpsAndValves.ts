// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import {
  FailableFuelSwitch,
  FailableFuelSwitchesDriver,
  FailuresConsumer,
  FuelSwitchAccess,
  msfsFuelPumpAccess,
  msfsFuelValveAccess,
  NXLogicConfirmNode,
} from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';

/** A wing tank pump of the MSFS fuel system (flight_model.cfg [FUEL_SYSTEM]) */
export interface A320TankPump {
  /** The failure of the pump */
  failure: number;
  /** The MSFS pump number (Pump.N), the index of FUELSYSTEM PUMP SWITCH and FUELSYSTEM PUMP ACTIVE */
  pump: number;
  /** The MSFS line from the pump outlet to the engine feed junction (Line.N) */
  outletLine: number;
}

/** The wing tank pumps: L TK PUMP 1, L TK PUMP 2, R TK PUMP 1, R TK PUMP 2 */
export const A320_TANK_PUMPS: readonly A320TankPump[] = [
  // Pump.2 LeftInnerTankPump1, Line.7 PumpLeft1ToJuncLeft
  { failure: A320Failure.LeftTankPump1, pump: 2, outletLine: 7 },
  // Pump.5 LeftInnerTankPump2, Line.9 PumpLeft2ToJuncLeft
  { failure: A320Failure.LeftTankPump2, pump: 5, outletLine: 9 },
  // Pump.3 RightInnerTankPump1, Line.8 PumpRight1ToJuncRight
  { failure: A320Failure.RightTankPump1, pump: 3, outletLine: 8 },
  // Pump.6 RightInnerTankPump2, Line.10 PumpRight2ToJuncRight
  { failure: A320Failure.RightTankPump2, pump: 6, outletLine: 10 },
];

/**
 * The selection of a L (R) TK PUMPS 1(2) pb-sw, by MSFS pump number: the pb-sw toggles it and shows it (OFF light,
 * animation), this module copies it to the MSFS pump switch unless the pump is failed.
 */
export function tankPumpPbIsOnVar(pump: number): string {
  return `L:A32NX_OVHD_FUEL_PUMP_${pump}_PB_IS_ON`;
}

/** The MSFS valve of the X FEED valve (Valve.3 CrossFeedValve of flight_model.cfg, OpeningTime 3 s) */
export const A320_CROSSFEED_VALVE = 3;

/**
 * The X FEED pb-sw selection: the pb-sw toggles it and shows it (ON light, animation), this module copies it to the MSFS
 * valve unless the valve is jammed. The OPEN light shows the valve position (FUELSYSTEM VALVE OPEN:3).
 */
export const A320_CROSSFEED_PB_IS_ON_VAR = 'L:A32NX_OVHD_FUEL_XFEED_PB_IS_ON';

/** Below this pump outlet pressure, in psi, the pump delivery pressure is low (as the pb-sw FAULT light always had) */
export const TANK_PUMP_LOW_PRESSURE_PSI = 6;

/**
 * Whether a wing tank pump is ON with a low delivery pressure: the condition of its FAULT light, of the amber LO on the SD
 * FUEL page and of the FUEL L(R) TK PUMP 1(2) LO PR caution (A320 FCOM DSC-28-20 "L (R) TK PUMPS 1(2) pb-sw", l.42737:
 * "Amber light and ECAM caution come on, when the delivery pressure drops. It does not come on when OFF is selected").
 * The pump does not deliver when it is failed (its MSFS switch held off), when its tank is empty, or when its outlet
 * pressure is low.
 * @param switchOn whether the pump pb-sw is ON (its selection L:var, tankPumpPbIsOnVar)
 * @param active whether MSFS runs the pump (FUELSYSTEM PUMP ACTIVE)
 * @param outletPressurePsi the pressure of the pump outlet line
 */
export function isTankPumpLowPressure(switchOn: boolean, active: boolean, outletPressurePsi: number): boolean {
  return switchOn && (!active || outletPressurePsi < TANK_PUMP_LOW_PRESSURE_PSI);
}

/** The L:var that tells that a wing tank pump is ON with a low delivery pressure */
export function tankPumpLowPressureVar(pump: number): string {
  return `L:A32NX_FUEL_PUMP_${pump}_LO_PR`;
}

/**
 * A centre tank transfer valve, CTR TK L(R) XFR valve (A320 FCOM DSC-28-10 CENTER TANK FUEL TRANSFER, a320_fcom.txt
 * l.42101-42115: "When the transfer valve is open, fuel from the inner tank pumps flows through the jet pump [...] This
 * suction moves the fuel from the center tank to the related inner tank"). The FBW A32NX is the jet pump variant of the
 * FCOM (CTR TK L(R) XFR pb-sw and MODE SEL pb-sw, l.42779-42838). As MSFS triggers can only open and close valves, the
 * valve is made of two MSFS valves in series (flight_model.cfg [FUEL_SYSTEM]):
 * - the inhibit valve (CenterTransferDisableValveL/R), open while the CTR TK XFR pb-sw is ON;
 * - the auto valve (AutoCenterTransferValveL/R), opened and closed by MSFS triggers as the FLSCU does: Trigger.1-4 when
 *   the inner tank is not full / full, Trigger.9 5 min after the centre tank low level;
 * - with the MODE SEL pb-sw at MAN, the transfer junction (option 2) bypasses the auto valve.
 * The MSFS jet pump runs while this path is open (behaviour XML FBW_JET_PUMP).
 */
export interface A320CentreTankTransferValve {
  side: 'L' | 'R';
  /** The failure that jams the valve */
  failure: number;
  /** The MSFS inhibit valve (Valve.N), driven by the CTR TK XFR pb-sw */
  inhibitValve: number;
  /** The MSFS auto valve (Valve.N), driven by the FLSCU triggers */
  autoValve: number;
  /** The MSFS transfer junction (Junction.N): option 2 (MODE SEL MAN) bypasses the auto valve */
  junction: number;
}

/** The CTR TK L and R XFR valves */
export const A320_CTR_TK_XFR_VALVES: readonly A320CentreTankTransferValve[] = [
  // Valve.9 CenterTransferDisableValveL, Valve.11 AutoCenterTransferValveL, Junction.4 CenterTransferJunctionL
  { side: 'L', failure: A320Failure.CentreTankLeftTransferValveJammed, inhibitValve: 9, autoValve: 11, junction: 4 },
  // Valve.10 CenterTransferDisableValveR, Valve.12 AutoCenterTransferValveR, Junction.5 CenterTransferJunctionR
  { side: 'R', failure: A320Failure.CentreTankRightTransferValveJammed, inhibitValve: 10, autoValve: 12, junction: 5 },
];

/**
 * The selection of a CTR TK L(R) XFR pb-sw: the pb-sw toggles it and shows it (OFF light, animation), this module copies
 * it to the MSFS inhibit valve unless the transfer valve is jammed.
 */
export function ctrTkXfrPbIsOnVar(side: 'L' | 'R'): string {
  return `L:A32NX_OVHD_FUEL_CTR_TK_${side}_XFR_PB_IS_ON`;
}

/** The MODE SEL pb-sw at MAN (A320_NEO_INTERIOR.xml FUEL MODE SEL) */
export const A320_FUEL_MODE_SEL_MAN_VAR = 'L:A32NX_OVHD_FUEL_MODESEL_MANUAL';

/** Whether a transfer junction is on its MAN option (the MODE SEL pb-sw sets option 2 at MAN, 1 at AUTO) */
export function isTransferJunctionManual(junctionSetting: number): boolean {
  return junctionSetting > 1.5;
}

/**
 * How far a centre tank transfer valve is open, 0 (closed) to 1 (open): its two MSFS valves are in series, and the MAN
 * junction bypasses the auto valve.
 * @param inhibitOpenRatio the position of the inhibit valve, 0 to 1
 * @param autoOpenRatio the position of the auto valve, 0 to 1
 * @param manual whether the transfer junction is on its MAN option
 */
export function centreTransferValveOpenRatio(inhibitOpenRatio: number, autoOpenRatio: number, manual: boolean): number {
  return manual ? inhibitOpenRatio : Math.min(inhibitOpenRatio, autoOpenRatio);
}

/**
 * Whether a centre tank transfer valve is commanded open: "On: The transfer valve opens, if MAN mode is selected on the
 * MODE SEL pb-sw, The transfer valve is automatically controlled when AUTO mode is selected. OFF: The transfer valve is
 * closed." (A320 FCOM DSC-28-20 CTR TK L(R) XFR pb-sw, a320_fcom.txt l.42817-42823).
 * @param pbOn whether the CTR TK XFR pb-sw is ON
 * @param modeSelMan whether the MODE SEL pb-sw is at MAN
 * @param flscuOpen whether the FLSCU commands the valve open (the selection of the MSFS auto valve)
 */
export function isCentreTransferValveCommandedOpen(pbOn: boolean, modeSelMan: boolean, flscuOpen: boolean): boolean {
  return pbOn && (modeSelMan || flscuOpen);
}

/** A centre tank transfer valve position that disagrees with its command */
export interface CentreTransferValveDisagreement {
  /** The valve is not fully closed while commanded closed: "failed in open position" */
  notFullyClosed: boolean;
  /** The valve is not fully open while commanded open: "failed in closed position" */
  notFullyOpen: boolean;
}

/**
 * The disagreement of a centre tank transfer valve with its command, the condition of FUEL CTR L(R) XFR FAULT (VALVE NOT
 * FULLY CLOSED) "when either center transfer valve is failed in open position" and (VALVE NOT FULLY OPEN) "... in closed
 * position" (A320 FCOM PRO-ABN-FUEL, a320_fcom.txt l.85400-85480), before its confirmation time.
 * @param commandedOpen whether the valve is commanded open (isCentreTransferValveCommandedOpen)
 * @param openRatio how far the valve is open, 0 to 1 (centreTransferValveOpenRatio)
 */
export function centreTransferValveDisagreement(
  commandedOpen: boolean,
  openRatio: number,
): CentreTransferValveDisagreement {
  return {
    notFullyClosed: !commandedOpen && openRatio > 0,
    notFullyOpen: commandedOpen && openRatio < 1,
  };
}

/** The L:var that tells that a centre tank transfer valve stays not fully closed while commanded closed (confirmed) */
export function ctrTkXfrValveNotFullyClosedVar(side: 'L' | 'R'): string {
  return `L:A32NX_FUEL_CTR_TK_${side}_XFR_VALVE_NOT_FULLY_CLOSED`;
}

/** The L:var that tells that a centre tank transfer valve stays not fully open while commanded open (confirmed) */
export function ctrTkXfrValveNotFullyOpenVar(side: 'L' | 'R'): string {
  return `L:A32NX_FUEL_CTR_TK_${side}_XFR_VALVE_NOT_FULLY_OPEN`;
}

/** The failures this module reads */
export type FailureStates = Pick<FailuresConsumer, 'update' | 'isActive'>;

/**
 * The A320 fuel pump and valve failures (ATA 28), on the MSFS fuel system. An MSFS pump or valve keeps running or moving
 * with its electrical circuit off, so the pb-sw of a wing tank pump and the X FEED pb-sw only set a selection L:var, and
 * this module drives the MSFS pump and valve switches from them (FailableFuelSwitchesDriver):
 * - A failed wing tank pump stops: its MSFS pump switch is held off while the pb-sw stays where the flight crew put it.
 *   The pump pressure drops, so the FAULT light, the amber LO on the SD FUEL page and the FUEL L(R) TK PUMP 1(2) LO PR
 *   caution come on while the pb-sw is ON (see isTankPumpLowPressure).
 * - A jammed X FEED valve keeps its position whatever the X FEED pb-sw is: its MSFS valve switch is held where the valve
 *   was. The FWC gives FUEL X FEED VALVE FAULT once the valve position disagrees with the pb-sw.
 * - A jammed CTR TK L(R) XFR valve stays open or closed whatever its pb-sw, the MODE SEL pb-sw and the FLSCU command:
 *   jammed open, both its MSFS valves are held open; jammed closed, its inhibit valve is held closed. A valve that
 *   disagrees with its command longer than CTR_TK_XFR_DISAGREE_CONFIRM_S gives the FWC its FUEL CTR L(R) XFR FAULT.
 */
export class FuelPumpsAndValves implements Instrument {
  /** How often the pump states are computed, in milliseconds */
  private static readonly UPDATE_PERIOD_MS = 100;

  private readonly pumps: FailableFuelSwitchesDriver;

  private readonly valves: FailableFuelSwitchesDriver;

  /**
   * The centre tank transfer valves: the inhibit valves L and R (switches 0 and 1, from the CTR TK XFR pb-sw), then the
   * auto valves L and R (switches 2 and 3, from the FLSCU triggers)
   */
  private readonly centreTransferValves: FailableFuelSwitchesDriver;

  /**
   * The MSFS valves of a centre tank transfer valve have no travel time (no OpeningTime): a disagreement longer than this
   * is a fault (design choice: as the X FEED VALVE FAULT confirmation)
   */
  public static readonly CTR_TK_XFR_DISAGREE_CONFIRM_S = 5;

  /** Per side L, R: whether the transfer valve was failed at the last update, and whether it jammed open */
  private readonly centreTransferJams = A320_CTR_TK_XFR_VALVES.map(() => ({ failed: false, jammedOpen: false }));

  private readonly centreTransferConfirms = A320_CTR_TK_XFR_VALVES.map(() => ({
    notFullyClosed: new NXLogicConfirmNode(FuelPumpsAndValves.CTR_TK_XFR_DISAGREE_CONFIRM_S, true),
    notFullyOpen: new NXLogicConfirmNode(FuelPumpsAndValves.CTR_TK_XFR_DISAGREE_CONFIRM_S, true),
  }));

  private lastUpdateTime: number | null = null;

  private timeSinceUpdate = 0;

  private hasUpdated = false;

  constructor(
    private readonly failures: FailureStates = new FailuresConsumer(),
    fuelPumps: FuelSwitchAccess = msfsFuelPumpAccess,
    private readonly fuelValves: FuelSwitchAccess = msfsFuelValveAccess,
  ) {
    const isFailureActive = (failure: number) => this.failures.isActive(failure);
    this.pumps = new FailableFuelSwitchesDriver(
      A320_TANK_PUMPS.map(
        ({ failure, pump }): FailableFuelSwitch => ({
          failure,
          index: pump,
          effect: 'off',
          selectionVar: tankPumpPbIsOnVar(pump),
        }),
      ),
      isFailureActive,
      fuelPumps,
    );
    this.valves = new FailableFuelSwitchesDriver(
      [
        {
          failure: A320Failure.CrossFeedValveJammed,
          index: A320_CROSSFEED_VALVE,
          effect: 'jam',
          selectionVar: A320_CROSSFEED_PB_IS_ON_VAR,
        },
      ],
      isFailureActive,
      fuelValves,
    );
    // A transfer valve jammed open holds both its MSFS valves open (the FLSCU and the pb-sw cannot close it), jammed
    // closed it holds its inhibit valve closed (MAN mode cannot open it); see updateCentreTransferJams
    const jammedOpen = (side: number) => this.centreTransferJams[side].jammedOpen;
    this.centreTransferValves = new FailableFuelSwitchesDriver(
      [
        ...A320_CTR_TK_XFR_VALVES.map(
          ({ side, failure, inhibitValve }, index): FailableFuelSwitch => ({
            failure,
            index: inhibitValve,
            effect: 'jam',
            selectionVar: ctrTkXfrPbIsOnVar(side),
            jammedOn: () => jammedOpen(index),
          }),
        ),
        ...A320_CTR_TK_XFR_VALVES.map(
          ({ failure, autoValve }, index): FailableFuelSwitch => ({
            failure,
            index: autoValve,
            effect: 'jam',
            jammedOn: () => (jammedOpen(index) ? true : null),
          }),
        ),
      ],
      isFailureActive,
      fuelValves,
    );
  }

  public init(): void {
    // nothing to initialise: the pb-sw selections are taken from the MSFS switches on the first update
  }

  public onUpdate(): void {
    const now = Date.now();
    const deltaTime = this.lastUpdateTime === null ? 0 : now - this.lastUpdateTime;
    this.lastUpdateTime = now;
    this.update(deltaTime);
  }

  /** @param deltaTime the time since the last update, in milliseconds */
  public update(deltaTime: number): void {
    this.timeSinceUpdate += deltaTime;
    if (this.hasUpdated && this.timeSinceUpdate < FuelPumpsAndValves.UPDATE_PERIOD_MS) {
      return;
    }
    const elapsed = this.timeSinceUpdate;
    this.timeSinceUpdate = 0;
    this.hasUpdated = true;

    this.failures.update();
    this.pumps.update(elapsed);
    this.valves.update(elapsed);
    this.updateCentreTransferJams();
    this.centreTransferValves.update(elapsed);
    this.updateCentreTransferFaults(elapsed);

    for (const { pump, outletLine } of A320_TANK_PUMPS) {
      const lowPressure = isTankPumpLowPressure(
        SimVar.GetSimVarValue(tankPumpPbIsOnVar(pump), SimVarValueType.Bool) > 0,
        SimVar.GetSimVarValue(`A:FUELSYSTEM PUMP ACTIVE:${pump}`, SimVarValueType.Bool) > 0,
        SimVar.GetSimVarValue(`A:FUELSYSTEM LINE FUEL PRESSURE:${outletLine}`, SimVarValueType.PSI),
      );
      SimVar.SetSimVarValue(tankPumpLowPressureVar(pump), SimVarValueType.Bool, lowPressure);
    }
  }
  /** How far a centre tank transfer valve is open now, 0 to 1 */
  private centreTransferValveOpenRatio({ inhibitValve, autoValve, junction }: A320CentreTankTransferValve): number {
    return centreTransferValveOpenRatio(
      this.fuelValves.position(inhibitValve),
      this.fuelValves.position(autoValve),
      isTransferJunctionManual(
        SimVar.GetSimVarValue(`A:FUELSYSTEM JUNCTION SETTING:${junction}`, SimVarValueType.Number),
      ),
    );
  }

  /** A transfer valve jams where it is when its failure becomes active: open if it is at least half open */
  private updateCentreTransferJams(): void {
    A320_CTR_TK_XFR_VALVES.forEach((valve, index) => {
      const jam = this.centreTransferJams[index];
      const failed = this.failures.isActive(valve.failure);
      if (failed && !jam.failed) {
        jam.jammedOpen = this.centreTransferValveOpenRatio(valve) >= FailableFuelSwitchesDriver.JAMMED_OPEN_RATIO;
      }
      jam.failed = failed;
    });
  }

  /**
   * Compares each centre tank transfer valve with its command (the pb-sw, the MODE SEL pb-sw and the FLSCU) and tells
   * the FWC the confirmed disagreements.
   * @param deltaTime the time since the last update, in milliseconds
   */
  private updateCentreTransferFaults(deltaTime: number): void {
    const modeSelMan = SimVar.GetSimVarValue(A320_FUEL_MODE_SEL_MAN_VAR, SimVarValueType.Bool) > 0;
    A320_CTR_TK_XFR_VALVES.forEach((valve, index) => {
      const commandedOpen = isCentreTransferValveCommandedOpen(
        SimVar.GetSimVarValue(ctrTkXfrPbIsOnVar(valve.side), SimVarValueType.Bool) > 0,
        modeSelMan,
        // the auto valves are the switches after the inhibit valves in the driver
        this.centreTransferValves.getSelection(A320_CTR_TK_XFR_VALVES.length + index),
      );
      const disagreement = centreTransferValveDisagreement(commandedOpen, this.centreTransferValveOpenRatio(valve));
      const confirms = this.centreTransferConfirms[index];
      SimVar.SetSimVarValue(
        ctrTkXfrValveNotFullyClosedVar(valve.side),
        SimVarValueType.Bool,
        confirms.notFullyClosed.write(disagreement.notFullyClosed, deltaTime),
      );
      SimVar.SetSimVarValue(
        ctrTkXfrValveNotFullyOpenVar(valve.side),
        SimVarValueType.Bool,
        confirms.notFullyOpen.write(disagreement.notFullyOpen, deltaTime),
      );
    });
  }
}
