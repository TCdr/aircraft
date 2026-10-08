// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** FWS flight phases in which the aircraft is airborne: 6 (lift off) to 9 (800 ft to touchdown) */
const AIRBORNE_FLIGHT_PHASES = [6, 7, 8, 9];

/**
 * The G LOAD line of the SD permanent data. A380 FCOM DSC-31-40-10 G LOAD DATA (a380_fcom.txt l.73112-73131): "The
 * aircraft becomes airborne, and the G LOAD is less than 0.7 g, or greater than 1.4 g, for longer than 2 seconds.
 * After the G load returns to normal, G LOAD data remains visible for 5 seconds." It showed whenever the value was
 * outside 0.7-1.4 g, also on the ground, with no timers.
 */
export class GLoadIndication {
  static readonly LOW_G = 0.7;

  static readonly HIGH_G = 1.4;

  /** Time the G load must stay abnormal before the line shows */
  static readonly CONFIRM_TIME_MS = 2_000;

  /** Time the line stays after the G load returns to normal */
  static readonly HOLD_TIME_MS = 5_000;

  private abnormalForMs = 0;

  private normalForMs = 0;

  private shown = false;

  /**
   * Updates the indication.
   * @param deltaMs the time since the last update, in ms
   * @param fwsFlightPhase the FWS flight phase (1 to 12)
   * @param gLoad the normal acceleration in g, or null when it is not valid
   * @returns true when the G LOAD line is shown
   */
  public update(deltaMs: number, fwsFlightPhase: number, gLoad: number | null): boolean {
    const airborne = AIRBORNE_FLIGHT_PHASES.includes(fwsFlightPhase);
    const abnormal = airborne && gLoad !== null && (gLoad < GLoadIndication.LOW_G || gLoad > GLoadIndication.HIGH_G);

    if (abnormal) {
      this.abnormalForMs += deltaMs;
      this.normalForMs = 0;
      if (this.abnormalForMs > GLoadIndication.CONFIRM_TIME_MS) {
        this.shown = true;
      }
    } else {
      this.abnormalForMs = 0;
      this.normalForMs += deltaMs;
      // Design choice: an invalid value keeps the line (the FCOM shows amber XX then), it does not count as normal
      if (gLoad === null && this.shown && airborne) {
        this.normalForMs = 0;
      }
      if (this.normalForMs >= GLoadIndication.HOLD_TIME_MS) {
        this.shown = false;
      }
    }

    return this.shown;
  }
}
