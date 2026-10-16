// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The ATSU failures of the flyPad (ATA 46, failures a320.ts) and what they stop in the systems-host ATSU (atsu.ts):
 * - "ATSU" (46000): the ATSU does not run, as when it is not supplied: the router, ATC and AOC functions are powered
 *   down (no datalink at all). The FWC shows DATALINK ATSU FAULT, STATUS INOP SYS ATSU and DATA COMPANY (A320 FCOM
 *   PRO-ABN-DATALINK, a320_fcom.txt l.74467-74495).
 * - "ATSU AOC function (company datalink)" (46001): only the AOC function stops ("a failure in the AOC datalink
 *   communications", l.74517); the router and ATC (CPDLC) keep working. The FWC shows DATALINK COMPANY FAULT, STATUS
 *   INOP SYS DATA COMPANY (l.74507-74531).
 */

/** What the ATSU runs on */
export interface AtsuFailureInputs {
  /** AC BUS 1, the ATSU supply */
  acBus1Powered: boolean;
  /** The flyPad failure of the ATSU */
  atsuFailed: boolean;
  /** The flyPad failure of the AOC function */
  aocFailed: boolean;
}

/** The parts of the ATSU that run */
export interface AtsuRunStates {
  /** The router and the ATC function */
  atsuRunning: boolean;
  /** The AOC function (company datalink) */
  aocRunning: boolean;
}

/**
 * @param inputs the supply and the failures of the ATSU
 * @returns the parts of the ATSU that run
 */
export function atsuRunStates(inputs: AtsuFailureInputs): AtsuRunStates {
  const atsuRunning = inputs.acBus1Powered && !inputs.atsuFailed;
  return { atsuRunning, aocRunning: atsuRunning && !inputs.aocFailed };
}

/** The power transitions of the ATSU parts, called in this order on a power up and in the reverse order on a power down */
export interface AtsuParts {
  powerUpAtsu(): void;
  powerDownAtsu(): void;
  powerUpAoc(): void;
  powerDownAoc(): void;
}

/** Powers the ATSU parts up and down when their run states change (the first update applies both states) */
export class AtsuPowerSwitch {
  private atsuRunning: boolean | undefined = undefined;

  private aocRunning: boolean | undefined = undefined;

  constructor(private readonly parts: AtsuParts) {}

  update(states: AtsuRunStates): void {
    // Power down: the AOC before the router, as the former AC BUS 1 handler did
    if (states.aocRunning !== this.aocRunning && !states.aocRunning) {
      this.parts.powerDownAoc();
      this.aocRunning = false;
    }
    if (states.atsuRunning !== this.atsuRunning) {
      if (states.atsuRunning) {
        this.parts.powerUpAtsu();
      } else {
        this.parts.powerDownAtsu();
      }
      this.atsuRunning = states.atsuRunning;
    }
    // Power up: the AOC after the router
    if (states.aocRunning !== this.aocRunning && states.aocRunning) {
      this.parts.powerUpAoc();
      this.aocRunning = true;
    }
  }
}
