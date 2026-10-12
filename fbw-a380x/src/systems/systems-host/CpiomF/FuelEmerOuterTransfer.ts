// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import { FuelSwitchAccess, msfsFuelValveAccess } from '@flybywiresim/fbw-sdk';

/**
 * The emergency outer tank transfer valves of the MSFS fuel system (flight_model.cfg Valve.52
 * LeftOuterEmerTransferValve, Valve.53 RightOuterEmerTransferValve): each one lets the fuel of an outer tank flow by
 * gravity into the outer feed tank (Line.142-145, outer tank to FEED TK 1 or 4).
 */
export const A380_EMER_OUTER_TRANSFER_VALVES: readonly number[] = [52, 53];

/** The EMER OUTR TK XFR pb-sw (JETTISON / EMER OUTR TK XFR panel) */
export const EMER_OUTR_TK_XFR_PB_IS_ON_VAR = 'L:A380X_OVHD_FUEL_EMER_OUTR_XFR_PB_IS_ON';

/**
 * Whether the emergency outer tank transfer valves are commanded open. A380 FCOM DSC-28-20 EMER OUTR TK XFR pb-sw
 * (a380_fcom.txt l.58140-58143): ON, "The emergency outer tank transfer valves are commanded open. Fuel transfers from
 * the outer tanks into the outer feed tanks (FEED TK 1 or 4)"; OFF, "The emergency outer tank transfer valves are
 * closed". DSC-28-10 (l.57567-57577): "In normal operations, the valves remain closed. [...] In some failure cases, the
 * flight crew will open the emergency outer tank transfer valves, via the OUTR TK EMER XFR pb-sw, as requested by the
 * ECAM." Not simulated: the automatic opening for a manual outer tank transfer with an outer tank pump off
 * (l.57570-57573), as the manual transfers are not simulated.
 * @param pbOn whether the EMER OUTR TK XFR pb-sw is ON
 */
export function isEmerOuterTransferCommandedOpen(pbOn: boolean): boolean {
  return pbOn;
}

/**
 * Drives the emergency outer tank transfer valves from the EMER OUTR TK XFR pb-sw. The pb-sw used to set an L:var only
 * (the ECAM read it, the valves never opened). The MSFS valves are commanded whenever they disagree with the pb-sw,
 * also after something else moved them (a flight being loaded, the refuel logic of CpiomF/LegacyFuel that closes the
 * valves).
 */
export class FuelEmerOuterTransfer implements Instrument {
  /** How long to wait after a command before reading the valves again, in milliseconds (the MSFS switch lags) */
  public static readonly COMMAND_SETTLE_TIME_MS = 500;

  private settleTimeLeftMs = 0;

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
      SimVar.GetSimVarValue(EMER_OUTR_TK_XFR_PB_IS_ON_VAR, SimVarValueType.Bool) > 0,
    );
    for (const valve of A380_EMER_OUTER_TRANSFER_VALVES) {
      if (this.fuelValves.isSwitchOn(valve) !== commandedOpen) {
        this.fuelValves.command(valve, commandedOpen);
        this.settleTimeLeftMs = FuelEmerOuterTransfer.COMMAND_SETTLE_TIME_MS;
      }
    }
  }
}
