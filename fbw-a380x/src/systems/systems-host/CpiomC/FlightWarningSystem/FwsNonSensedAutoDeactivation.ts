// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Automatic deactivation of the not-sensed ABN PROCs (A380 FCOM DSC-31-40-10, a380_fcom.txt l.71853-71861):
 * "An ACTIVE not-sensed ABN PROC is automatically deactivated at engine shutdown or at aircraft electrical power-up."
 * (l.71855-71856) "A not-sensed ABN PROC is automatically deactivated 15 minutes after the last engine shutdown, or 10
 * minutes after aircraft electrical power-up." (l.71859-71860)
 * Design choices:
 * - The power-up is the FWS power-up (its startup completed); the 10 minutes run from there.
 * - The last engine shutdown is the moment no engine runs any more after one ran; an engine started again before the
 *   15 minutes stops that countdown.
 * - Both deactivations are done on ground and with no engine running only: an FWS power-up or a loss of all engines in
 *   flight must not take away the procedures the crew activated.
 */

/** 15 minutes after the last engine shutdown (l.71859), in ms */
export const DEACTIVATION_AFTER_LAST_ENGINE_SHUTDOWN_MS = 15 * 60 * 1000;

/** 10 minutes after aircraft electrical power-up (l.71860), in ms */
export const DEACTIVATION_AFTER_POWER_UP_MS = 10 * 60 * 1000;

/** The two deactivation countdowns of the not-sensed ABN PROCs */
export class NonSensedProcAutoDeactivation {
  /** Time since the FWS power-up, null once its 10 minutes are over */
  private timeSincePowerUp: number | null = 0;

  /** Time since the last engine shutdown, null when no countdown runs */
  private timeSinceLastEngineShutdown: number | null = null;

  private anyEngineWasRunning = false;

  /** Starts the power-up countdown again: to be called at the FWS power-up */
  public reset(): void {
    this.timeSincePowerUp = 0;
    this.timeSinceLastEngineShutdown = null;
    this.anyEngineWasRunning = false;
  }

  /**
   * @param deltaTime the time since the last update, in ms
   * @param anyEngineRunning an engine is running
   * @param onGround the aircraft is on ground
   * @returns true in the update the active not-sensed ABN PROCs are to be deactivated
   */
  public update(deltaTime: number, anyEngineRunning: boolean, onGround: boolean): boolean {
    let deactivate = false;
    const deactivationAllowed = onGround && !anyEngineRunning;

    if (this.timeSincePowerUp !== null) {
      this.timeSincePowerUp += deltaTime;
      if (this.timeSincePowerUp >= DEACTIVATION_AFTER_POWER_UP_MS) {
        this.timeSincePowerUp = null;
        deactivate = deactivate || deactivationAllowed;
      }
    }

    if (anyEngineRunning) {
      this.anyEngineWasRunning = true;
      this.timeSinceLastEngineShutdown = null;
    } else if (this.anyEngineWasRunning) {
      this.anyEngineWasRunning = false;
      this.timeSinceLastEngineShutdown = 0;
    } else if (this.timeSinceLastEngineShutdown !== null) {
      this.timeSinceLastEngineShutdown += deltaTime;
      if (this.timeSinceLastEngineShutdown >= DEACTIVATION_AFTER_LAST_ENGINE_SHUTDOWN_MS) {
        this.timeSinceLastEngineShutdown = null;
        deactivate = deactivate || deactivationAllowed;
      }
    }

    return deactivate;
  }
}
