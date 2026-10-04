// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The two radio management panels on the pedestal: L = RMP 1 (captain), R = RMP 2 (first officer). */
export type RmpSide = 'L' | 'R';

/**
 * The L:var that tells the RMP instrument and the RMP model behaviours (key lights, SEL) that the RMP of this side
 * has failed. Written by the systems host from the RMP 1/2 failures.
 */
export function rmpFailedVar(side: RmpSide): string {
  return `L:A32NX_RMP_${side}_FAILED`;
}

/**
 * Whether an RMP works: it is powered, its ON/OFF switch is ON (A320 FCOM DSC-23-10-20 (9), a320_fcom.txt:35125
 * "This switch controls the RMP power supply") and it has not failed. A failed RMP behaves as one that is off: "The
 * affected RMP no longer controls the selected receiver. The frequency displays disappear and the green VHF or HF
 * lights go out." (FCOM DSC-23-60 failure cases, a320_fcom.txt:36229-36231).
 */
export function isRmpOperative(powered: boolean, switchedOn: boolean, failed: boolean): boolean {
  return powered && switchedOn && !failed;
}

/**
 * Keeps an MSFS COM radio circuit (systems.cfg CIRCUIT_COM:n) in the wanted state. The circuit can only be toggled
 * (K:ELECTRICAL_CIRCUIT_TOGGLE), and the sim applies the toggle a frame or more later, so a toggle is sent only when the
 * circuit state is wrong and no toggle has been sent in the last {@link retryDelayMs} milliseconds; otherwise a second
 * toggle would switch the circuit straight back.
 *
 * A failed VHF transceiver switches its circuit off, so the MSFS radio neither receives nor transmits.
 */
export class MsfsComCircuitSwitch {
  /** The time of the last toggle that was sent, or undefined if none is pending. */
  private lastToggleTime: number | undefined = undefined;

  /** The wanted state of the last update. */
  private lastShouldBeOn: boolean | undefined = undefined;

  /**
   * @param retryDelayMs The time to wait for a toggle to take effect before sending another one.
   */
  constructor(private readonly retryDelayMs = 1000) {}

  /**
   * @param shouldBeOn Whether the circuit should be switched on.
   * @param isOn Whether the circuit is switched on now (A:CIRCUIT SWITCH ON:n).
   * @param nowMs The current time, in milliseconds.
   * @returns true when a K:ELECTRICAL_CIRCUIT_TOGGLE must be sent now.
   */
  public update(shouldBeOn: boolean, isOn: boolean, nowMs: number): boolean {
    // a new wanted state (failure set or cleared) is applied at once, whatever toggle was pending for the old one
    if (shouldBeOn !== this.lastShouldBeOn) {
      this.lastShouldBeOn = shouldBeOn;
      this.lastToggleTime = undefined;
    }

    if (shouldBeOn === isOn) {
      this.lastToggleTime = undefined;
      return false;
    }

    if (this.lastToggleTime !== undefined && nowMs - this.lastToggleTime < this.retryDelayMs) {
      return false;
    }

    this.lastToggleTime = nowMs;
    return true;
  }
}
