// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument } from '@microsoft/msfs-sdk';
import { FuelSwitchAccess, msfsFuelValveAccess, RegisteredSimVar } from '@flybywiresim/fbw-sdk';
import {
  isOuterTransferByGravity,
  L_OUTR_TK_PUMP,
  OUTR_TK_XFR_PB_IS_AUTO_VAR,
  R_OUTR_TK_PUMP,
} from './FuelManualTransfer';

/**
 * The emergency outer tank transfer valves of the MSFS fuel system (flight_model.cfg Valve.52
 * LeftOuterEmerTransferValve, Valve.53 RightOuterEmerTransferValve): each one lets the fuel of an outer tank flow by
 * gravity into the outer feed tank (Line.142-145, outer tank to FEED TK 1 or 4).
 */
export const A380_EMER_OUTER_TRANSFER_VALVES: readonly number[] = [52, 53];

/** The EMER OUTR TK XFR pb-sw (JETTISON / EMER OUTR TK XFR panel) */
export const EMER_OUTR_TK_XFR_PB_IS_ON_VAR = 'L:A380X_OVHD_FUEL_EMER_OUTR_XFR_PB_IS_ON';

/**
 * Whether the emergency outer tank transfer valves are commanded open. EMER OUTR TK XFR pb-sw ON: the valves are
 * commanded open and the outer tanks transfer into the outer feed tanks (FEED TK 1 or 4); OFF: the valves are closed.
 * The valves stay closed in normal operation; the flight crew opens them in some failure cases, as the ECAM asks. They
 * also open automatically for a manual outer tank transfer with an outer tank pump off: see
 * CpiomF/FuelManualTransfer isOuterTransferByGravity.
 * @param pbOn whether the EMER OUTR TK XFR pb-sw is ON
 * @param outerTransferByGravity whether a manual outer tank transfer is selected with an outer tank pump pb-sw OFF
 */
export function isEmerOuterTransferCommandedOpen(pbOn: boolean, outerTransferByGravity: boolean): boolean {
  return pbOn || outerTransferByGravity;
}

/**
 * Drives the emergency outer tank transfer valves from the EMER OUTR TK XFR pb-sw. The MSFS valves are commanded
 * whenever they disagree with the pb-sw, also after something else moved them (a flight being loaded, the refuel logic
 * of CpiomF/LegacyFuel that closes the valves).
 */
export class FuelEmerOuterTransfer implements Instrument {
  /** How long to wait after a command before reading the valves again, in milliseconds (the MSFS switch lags) */
  public static readonly COMMAND_SETTLE_TIME_MS = 500;

  private settleTimeLeftMs = 0;

  private readonly emerOuterTransferPbOn = RegisteredSimVar.createBoolean(EMER_OUTR_TK_XFR_PB_IS_ON_VAR);

  private readonly outerTransferPbAuto = RegisteredSimVar.createBoolean(OUTR_TK_XFR_PB_IS_AUTO_VAR);

  private readonly leftOuterPumpCircuitConnected = RegisteredSimVar.createBoolean(
    `A:CIRCUIT CONNECTION ON:${L_OUTR_TK_PUMP.circuit}`,
  );

  private readonly rightOuterPumpCircuitConnected = RegisteredSimVar.createBoolean(
    `A:CIRCUIT CONNECTION ON:${R_OUTR_TK_PUMP.circuit}`,
  );

  constructor(
    private readonly sysHost: { deltaTime: number },
    private readonly fuelValves: FuelSwitchAccess = msfsFuelValveAccess,
  ) {}

  public init(): void {
    // nothing to initialise: the valves follow the pb-sw from the first update
  }

  public onUpdate(): void {
    this.update(this.sysHost.deltaTime);
  }

  /** @param deltaTimeMs the time since the last update, in milliseconds */
  public update(deltaTimeMs: number): void {
    this.settleTimeLeftMs -= deltaTimeMs;
    if (this.settleTimeLeftMs > 0) {
      return;
    }

    const commandedOpen = isEmerOuterTransferCommandedOpen(
      this.emerOuterTransferPbOn.get(),
      isOuterTransferByGravity(
        !this.outerTransferPbAuto.get(),
        this.leftOuterPumpCircuitConnected.get(),
        this.rightOuterPumpCircuitConnected.get(),
      ),
    );
    for (const valve of A380_EMER_OUTER_TRANSFER_VALVES) {
      if (this.fuelValves.isSwitchOn(valve) !== commandedOpen) {
        this.fuelValves.command(valve, commandedOpen);
        this.settleTimeLeftMs = FuelEmerOuterTransfer.COMMAND_SETTLE_TIME_MS;
      }
    }
  }
}
