// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The ATSU failures of the flyPad (ATA 46, failures a320.ts) and what they stop in the systems-host ATSU (atsu.ts):
 * - "ATSU" (46000): the ATSU does not run, as when it is not supplied: the router, ATC and AOC functions are powered
 *   down (no datalink at all). The FWC shows DATALINK ATSU FAULT, STATUS INOP SYS ATSU and DATA COMPANY.
 * - "ATSU AOC function (company datalink)" (46001): only the AOC function stops; the router and ATC (CPDLC) keep
 *   working. The FWC shows DATALINK COMPANY FAULT, STATUS INOP SYS DATA COMPANY.
 *
 * ATSU reset: pull C/Bs L16 then L15 on 121VU, wait 5 s, push L15 then L16. A reset drops the CPDLC and ADS-C
 * connections: the ATSU does not run while one of its two C/Bs is pulled, and its power down drops the CPDLC connection
 * (ATC powerDown clears the current ATC).
 * The C/Bs are the L:1:A32NX_CB_121VU_L_TRIPPED_0 bits of the C/B model (CircuitMonitor, CircuitBreakerMonitors). The
 * 121VU panel is not clickable in the cockpit yet: the bits can be set through that variable.
 *
 * Datalink cockpit interface: a DCDU on each side, and datalink messages shown on the DCDU can be printed. The flyPad
 * failures DCDU 1 (46002), DCDU 2 (46003) and printer (46004): a failed DCDU is blank and its keys do nothing (design
 * choice: the loss of the unit, the aircraft has no DCDU alert); a failed printer prints nothing and the MCDU shows
 * PRINTER NOT AVAILABLE, as on a printer communication error.
 */

/** The ATSU C/Bs of the reset procedure, columns of row L of panel 121VU */
const ATSU_CIRCUIT_BREAKER_COLUMNS = [15, 16];

/** The C/B variable of row L of 121VU that holds the columns 1 to 32, one bit per column (bit = column - 1) */
export const ATSU_CIRCUIT_BREAKER_VAR = 'L:1:A32NX_CB_121VU_L_TRIPPED_0';

/**
 * @param rowLTrippedBits the value of ATSU_CIRCUIT_BREAKER_VAR
 * @returns one of the ATSU C/Bs (L15, L16 on 121VU) is pulled
 */
export function atsuCircuitBreakerPulled(rowLTrippedBits: number): boolean {
  return ATSU_CIRCUIT_BREAKER_COLUMNS.some((column) => ((rowLTrippedBits >>> (column - 1)) & 1) === 1);
}

/** What the ATSU runs on */
export interface AtsuFailureInputs {
  /** AC BUS 1, the ATSU supply */
  acBus1Powered: boolean;
  /** One of the ATSU C/Bs is pulled (atsuCircuitBreakerPulled) */
  circuitBreakerPulled: boolean;
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
  const atsuRunning = inputs.acBus1Powered && !inputs.circuitBreakerPulled && !inputs.atsuFailed;
  return { atsuRunning, aocRunning: atsuRunning && !inputs.aocFailed };
}

/** The datalink cockpit interface states the systems-host ATSU writes for the DCDU, its screens and the MCDU */
export interface DatalinkInterfaceStates {
  /** L:A32NX_ATSU_OFF: the ATSU does not run, a supplied DCDU shows INVALID DATA */
  atsuOff: boolean;
  /** L:A32NX_DCDU_1_FAILED, L:A32NX_DCDU_2_FAILED: the DCDU screen is blank and its keys do nothing */
  dcduFailed: [boolean, boolean];
  /** L:A32NX_PRINTER_FAILED: the MCDU print gives PRINTER NOT AVAILABLE */
  printerFailed: boolean;
}

/**
 * @param runStates the ATSU run states
 * @param failures the DCDU 1, DCDU 2 and printer flyPad failures
 * @returns the states the DCDU, its screens and the MCDU read
 */
export function datalinkInterfaceStates(
  runStates: AtsuRunStates,
  failures: { dcdu1Failed: boolean; dcdu2Failed: boolean; printerFailed: boolean },
): DatalinkInterfaceStates {
  return {
    atsuOff: !runStates.atsuRunning,
    dcduFailed: [failures.dcdu1Failed, failures.dcdu2Failed],
    printerFailed: failures.printerFailed,
  };
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
