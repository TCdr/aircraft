// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Instrument, SimVarValueType } from '@microsoft/msfs-sdk';
import {
  FailableFuelSwitchesDriver,
  FailuresConsumer,
  FuelSwitchAccess,
  msfsFuelValveAccess,
} from '@flybywiresim/fbw-sdk';
import { A380Failure } from '@failures';

/** flight_model.cfg Valve.50 APUIsoValve and Valve.51 APULPValve, in series on the APU feed line */
export const APU_ISOLATION_VALVE = 50;
export const APU_LP_VALVE = 51;

/** The APU feed line is closed while the APU MASTER pb-sw is ON: no fuel reaches the APU (FUEL APU FEED FAULT) */
export const APU_FEED_ABNORMALLY_CLOSED_VAR = 'L:A380X_FUEL_APU_FEED_ABNORMALLY_CLOSED';
/** An APU feed valve stays open while both should be closed (FUEL APU FEED VLV NOT CLOSED) */
export const APU_FEED_ABNORMALLY_OPEN_VAR = 'L:A380X_FUEL_APU_FEED_ABNORMALLY_OPEN';

/**
 * A valve position that disagrees with its command longer than this is abnormal, in seconds (the valves travel in 3 s,
 * flight_model.cfg OpeningTime; the same confirmation as the crossfeed valves)
 */
const APU_FEED_DISAGREE_CONFIRM_S = 5;

/** An MSFS valve at least this open is open (MSFS valves are open or closed) */
const VALVE_OPEN_RATIO = 0.5;

/**
 * Both APU feed valves open when the APU MASTER pb-sw is ON. Both close when it is OFF, or when the APU FIRE pb is
 * pushed.
 * @param masterOn the APU MASTER pb-sw is ON
 * @param firePbPushed the APU FIRE pb is pushed (released out)
 */
export function areApuFeedValvesCommandedOpen(masterOn: boolean, firePbPushed: boolean): boolean {
  return masterOn && !firePbPushed;
}

/** What the APU feed monitoring finds */
export interface ApuFeedState {
  /** A valve stays closed while both should be open */
  abnormallyClosed: boolean;
  /** A valve stays open while both should be closed */
  abnormallyOpen: boolean;
}

/** The APU feed valve monitoring of the FQMS: a valve position that disagrees with the command */
export class ApuFeedMonitor {
  private closedForS = 0;

  private openForS = 0;

  /**
   * @param commandedOpen both valves are commanded open (areApuFeedValvesCommandedOpen)
   * @param isolationValveOpenRatio how far the APU isolation valve is open, 0 to 1
   * @param lpValveOpenRatio how far the APU LP valve is open, 0 to 1
   * @param deltaTimeS the time of the update, in seconds
   */
  public update(
    commandedOpen: boolean,
    isolationValveOpenRatio: number,
    lpValveOpenRatio: number,
    deltaTimeS: number,
  ): ApuFeedState {
    const isolationOpen = isolationValveOpenRatio >= VALVE_OPEN_RATIO;
    const lpOpen = lpValveOpenRatio >= VALVE_OPEN_RATIO;
    this.closedForS = commandedOpen && !(isolationOpen && lpOpen) ? this.closedForS + deltaTimeS : 0;
    this.openForS = !commandedOpen && (isolationOpen || lpOpen) ? this.openForS + deltaTimeS : 0;
    return {
      abnormallyClosed: this.closedForS >= APU_FEED_DISAGREE_CONFIRM_S,
      abnormallyOpen: this.openForS >= APU_FEED_DISAGREE_CONFIRM_S,
    };
  }
}

/**
 * The APU feed valves (APU LP valve and APU isolation valve) and their jams. The flight files leave both MSFS valves
 * open; the FQMS opens and closes them with the APU MASTER pb-sw and the APU FIRE pb. A jam holds a valve where it
 * is (FailableFuelSwitchesDriver). The APU (systems a380 lib.rs) gets no fuel while the feed is abnormally closed.
 */
export class FuelApuFeed implements Instrument {
  private readonly valves: FailableFuelSwitchesDriver;

  private readonly monitor = new ApuFeedMonitor();

  constructor(
    private readonly sysHost: { deltaTime: number },
    failures: Pick<FailuresConsumer, 'isActive'>,
    fuelValves: FuelSwitchAccess = msfsFuelValveAccess,
  ) {
    this.valves = new FailableFuelSwitchesDriver(
      [
        { failure: A380Failure.FuelApuIsolationValveJammed, index: APU_ISOLATION_VALVE, effect: 'jam' },
        { failure: A380Failure.FuelApuLpValveJammed, index: APU_LP_VALVE, effect: 'jam' },
      ],
      (failure) => failures.isActive(failure),
      fuelValves,
    );
  }

  public init(): void {
    // nothing to initialise: the valves follow the APU MASTER pb-sw from the first update
  }

  public onUpdate(): void {
    const commandedOpen = areApuFeedValvesCommandedOpen(
      SimVar.GetSimVarValue('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON', SimVarValueType.Bool) > 0,
      SimVar.GetSimVarValue('L:A32NX_FIRE_BUTTON_APU', SimVarValueType.Bool) > 0,
    );
    this.valves.setAutomaticSelection(0, commandedOpen);
    this.valves.setAutomaticSelection(1, commandedOpen);
    this.valves.update(this.sysHost.deltaTime);

    const state = this.monitor.update(
      commandedOpen,
      SimVar.GetSimVarValue(`A:FUELSYSTEM VALVE OPEN:${APU_ISOLATION_VALVE}`, SimVarValueType.PercentOver100),
      SimVar.GetSimVarValue(`A:FUELSYSTEM VALVE OPEN:${APU_LP_VALVE}`, SimVarValueType.PercentOver100),
      this.sysHost.deltaTime / 1000,
    );
    SimVar.SetSimVarValue(APU_FEED_ABNORMALLY_CLOSED_VAR, SimVarValueType.Bool, state.abnormallyClosed);
    SimVar.SetSimVarValue(APU_FEED_ABNORMALLY_OPEN_VAR, SimVarValueType.Bool, state.abnormallyOpen);
  }
}
