// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The two sides of the A380 network server system (NSS): NSS AVNCS and FLT OPS. */
export type AnsuType = 'nss-avncs' | 'flt-ops';

export type AnsuIndex = 1 | 2;

/** The busbars that can supply an aircraft network server unit (ANSU). */
export interface AnsuSupplies {
  ac1: boolean;
  ac2: boolean;
  /** The A380 AC ESS busbar (400XP), the AC_ESS_SHED variable. */
  acEss: boolean;
  /** The A380 AC EMER busbar (491XP), the AC_ESS variable. */
  acEmer: boolean;
  dcHot1: boolean;
  dcHot2: boolean;
}

/**
 * Whether an ANSU is powered:
 * - NSS AVNCS ANSU 1: AC 2 and BAT 2,
 * - NSS AVNCS ANSU 2: AC 1 or AC EMER and BAT 1,
 * - FLT OPS ANSU: AC ESS and BAT 1.
 * The battery is the backup supply of each unit: any of its supplies powers it.
 * @param type the NSS side of the unit
 * @param index the unit index (the FLT OPS side has one ANSU)
 * @param supplies the state of the busbars
 * @returns whether the unit is powered
 */
export function isAnsuPowered(type: AnsuType, index: AnsuIndex, supplies: AnsuSupplies): boolean {
  if (type === 'flt-ops') {
    return supplies.acEss || supplies.dcHot1;
  }
  return index === 1 ? supplies.ac2 || supplies.dcHot2 : supplies.ac1 || supplies.acEmer || supplies.dcHot1;
}

/**
 * Whether the NSS AVNCS applications (AOC, eLogbook, maintenance) are available: both ANSU 1 and ANSU 2 host them,
 * ANSU 2 takes over when ANSU 1 fails, and they are lost with both ANSUs.
 * @param ansu1Healthy whether NSS AVNCS ANSU 1 is healthy (powered, not failed, not reset, NSS master on)
 * @param ansu2Healthy whether NSS AVNCS ANSU 2 is healthy
 * @returns whether at least one NSS AVNCS ANSU hosts the applications
 */
export function isNssAvncsAvailable(ansu1Healthy: boolean, ansu2Healthy: boolean): boolean {
  return ansu1Healthy || ansu2Healthy;
}

/**
 * A380 FCOM DSC-46-20-10-20 (a380_fcom.txt l.102249-102252): "It takes 2 minutes to start the ARU at aircraft
 * power-up. The flight crew should not start the three connected laptops until the ARU is operating."
 */
export const ARU_START_DURATION_MS = 120_000;

/**
 * The start of the ARU, through which the laptops connect to the FLT OPS network.
 *
 * Design choices (the FCOM gives no ARU supply or failure):
 * - The ARU goes with the FLT OPS ANSU: it starts when the FLT OPS ANSU is healthy (powered, not failed, not reset, NSS
 *   master on), and stops with it.
 * - An ANSU healthy within the first seconds of the flight (FLIGHT_LOAD_WINDOW_MS: a flight loaded with the aircraft
 *   powered) means an ARU that was already operating: the laptops of such a flight are connected at once. The window
 *   covers the first frames, where the ANSU and the laptops do not know their state yet.
 */
export class AruStartup {
  /** The first seconds of the flight, ms, see the class description */
  public static readonly FLIGHT_LOAD_WINDOW_MS = 5_000;

  private ageMs = 0;

  private healthyTimeMs = 0;

  /**
   * @param fltOpsAnsuHealthy whether the FLT OPS ANSU is healthy
   * @param deltaTimeMs the time since the previous update, ms
   * @returns whether the ARU is operating
   */
  public update(fltOpsAnsuHealthy: boolean, deltaTimeMs: number): boolean {
    const deltaMs = Math.max(deltaTimeMs, 0);
    this.ageMs += deltaMs;
    if (!fltOpsAnsuHealthy) {
      this.healthyTimeMs = 0;
    } else if (this.isFlightLoading()) {
      this.healthyTimeMs = ARU_START_DURATION_MS;
    } else {
      this.healthyTimeMs = Math.min(this.healthyTimeMs + deltaMs, ARU_START_DURATION_MS);
    }
    return this.isOperating();
  }

  /** @returns whether the ARU is operating (started for 2 minutes) */
  public isOperating(): boolean {
    return this.healthyTimeMs >= ARU_START_DURATION_MS;
  }

  /** @returns whether the flight is in its first seconds, see the class description */
  public isFlightLoading(): boolean {
    return this.ageMs <= AruStartup.FLIGHT_LOAD_WINDOW_MS;
  }
}

/**
 * Whether a laptop operates as a stand-alone, A380 FCOM DSC-46-20-40 LAPTOP START (a380_fcom.txt l.104922-104928):
 * '"STANDALONE" appears on the Login page of the laptop when: The Captain's, First Officer's, or backup laptop is
 * started before the ARU. In this case, when the ARU is started, the flight crew must restart the affected laptop, in
 * order for the laptop to be connected to the aircraft network. The Captain's, First Officer's or backup laptop is not
 * connected to the network. In this case, the laptop operates as a stand-alone.'
 *
 * Design choice: a laptop connected at its start that loses the ARU is a stand-alone while the ARU is lost, and
 * connects again when the ARU operates again (only a laptop started before the ARU needs a restart).
 */
export class LaptopNetworkConnection {
  private running = false;

  /** The laptop found the operating ARU when it started */
  private connectedAtStart = false;

  private standalone = false;

  /**
   * @param laptopRunning whether the laptop is switched on and healthy
   * @param aruOperating whether the ARU is operating
   * @param flightLoading the first seconds of the flight (AruStartup.isFlightLoading): a laptop running then counts as
   * started with the ARU in the state of the flight load
   * @returns whether the laptop operates as a stand-alone
   */
  public update(laptopRunning: boolean, aruOperating: boolean, flightLoading = false): boolean {
    if (laptopRunning && (!this.running || flightLoading)) {
      this.connectedAtStart = aruOperating;
    }
    this.running = laptopRunning;
    this.standalone = laptopRunning && !(this.connectedAtStart && aruOperating);
    return this.standalone;
  }

  /** @returns whether the laptop operates as a stand-alone (not connected to the aircraft network) */
  public isStandalone(): boolean {
    return this.standalone;
  }
}
