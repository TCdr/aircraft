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
 * Whether the AC supply of an ANSU is present: AC 2 (NSS AVNCS ANSU 1), AC 1 or AC EMER (NSS AVNCS ANSU 2), AC ESS
 * (FLT OPS ANSU). The battery alone does not keep an ANSU running: the NSS shuts down at aircraft power down.
 * @param type the NSS side of the unit
 * @param index the unit index
 * @param supplies the state of the busbars
 * @returns whether the AC busbar that feeds the unit is supplied
 */
export function isAnsuAcSupplied(type: AnsuType, index: AnsuIndex, supplies: AnsuSupplies): boolean {
  if (type === 'flt-ops') {
    return supplies.acEss;
  }
  return index === 1 ? supplies.ac2 : supplies.ac1 || supplies.acEmer;
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

/** The longest time step that counts, ms: a longer gap between two frames is a load hitch or a pause, not play time */
export const MAX_FRAME_STEP_MS = 1_000;

/**
 * The time since the previous frame of an instrument, for timers that add up frame steps.
 *
 * A clock subject reads 0 until its first event and then the sim clock (millions of ms): that first step is no time
 * played. A step is counted up to MAX_FRAME_STEP_MS, so a load hitch cannot end the first seconds of a flight load.
 * @param previousMs the clock at the previous frame, null at the first frame
 * @param nowMs the clock at this frame
 * @returns the step to add to a timer, ms
 */
export function sampleFrameStepMs(previousMs: number | null, nowMs: number): number {
  if (previousMs === null || previousMs <= 0 || nowMs <= previousMs) {
    return 0;
  }
  return Math.min(nowMs - previousMs, MAX_FRAME_STEP_MS);
}

/** The ARU takes 2 minutes to start at aircraft power-up; the laptops should not be started before the ARU operates. */
export const ARU_START_DURATION_MS = 120_000;

/** The flyPad realism value of CONFIG_SELF_TEST_TIME for the real self-test time (INSTANT is 0, FAST 5) */
export const REAL_SELF_TEST_TIME = 12;

/**
 * The ARU start time for the self-test time setting of the flyPad realism page.
 *
 * Design choice: the ARU start scales with the same setting as the OIT boot and the display self-tests, in proportion to
 * the real value: REAL keeps the 2 minutes of the FCOM, INSTANT starts at once (a laptop that boots at once would
 * otherwise always start before the ARU and stay a stand-alone), FAST takes 5/12 of it. A value above REAL or one that
 * is not a number counts as REAL.
 * @param selfTimeSetting the CONFIG_SELF_TEST_TIME value (a number of seconds of the display self-test)
 * @returns the ARU start time, ms
 */
export function aruStartDurationMs(selfTimeSetting: number): number {
  if (!Number.isFinite(selfTimeSetting) || selfTimeSetting > REAL_SELF_TEST_TIME) {
    return ARU_START_DURATION_MS;
  }
  return (ARU_START_DURATION_MS * Math.max(selfTimeSetting, 0)) / REAL_SELF_TEST_TIME;
}

/**
 * The start of the ARU, through which the laptops connect to the FLT OPS network.
 *
 * Design choices (the ARU supply and failures are not known):
 * - The ARU goes with the FLT OPS ANSU: it starts when the FLT OPS ANSU is healthy (powered, not failed, not reset, NSS
 *   master on), and stops with it.
 * - An ANSU healthy within the first seconds of the flight (FLIGHT_LOAD_WINDOW_MS, counted in played time from the first valid
 *   clock sample: a flight loaded with the aircraft
 *   powered) means an ARU that was already operating: the laptops of such a flight are connected at once. The window
 *   covers the first frames, where the ANSU and the laptops do not know their state yet.
 */
export class AruStartup {
  /** The first seconds of the flight, ms, see the class description */
  public static readonly FLIGHT_LOAD_WINDOW_MS = 10_000;

  private ageMs = 0;

  private healthyTimeMs = 0;

  private ansuHealthy = false;

  /** @param startDurationMs how long the ARU takes to start after the FLT OPS ANSU is healthy, ms */
  constructor(private startDurationMs = ARU_START_DURATION_MS) {}

  /** @param startDurationMs the new ARU start time, ms (the self-test time setting may change in the session) */
  public setStartDurationMs(startDurationMs: number): void {
    this.startDurationMs = startDurationMs;
  }

  /**
   * @param fltOpsAnsuHealthy whether the FLT OPS ANSU is healthy
   * @param deltaTimeMs the time since the previous update, ms
   * @returns whether the ARU is operating
   */
  public update(fltOpsAnsuHealthy: boolean, deltaTimeMs: number): boolean {
    const deltaMs = Math.max(deltaTimeMs, 0);
    this.ageMs += deltaMs;
    this.ansuHealthy = fltOpsAnsuHealthy;
    if (!fltOpsAnsuHealthy) {
      this.healthyTimeMs = 0;
    } else if (this.isFlightLoading()) {
      this.healthyTimeMs = this.startDurationMs;
    } else {
      this.healthyTimeMs = Math.min(this.healthyTimeMs + deltaMs, this.startDurationMs);
    }
    return this.isOperating();
  }

  /** @returns whether the ARU is operating (started for 2 minutes) */
  public isOperating(): boolean {
    return this.ansuHealthy && this.healthyTimeMs >= this.startDurationMs;
  }

  /** @returns whether the flight is in its first seconds, see the class description */
  public isFlightLoading(): boolean {
    return this.ageMs <= AruStartup.FLIGHT_LOAD_WINDOW_MS;
  }
}

/**
 * Whether a laptop operates as a stand-alone ("STANDALONE" on its Login page): a laptop started before the ARU stays a
 * stand-alone until the crew restarts it once the ARU operates; a laptop not connected to the network is a stand-alone.
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

  public isStandalone(): boolean {
    return this.standalone;
  }
}

/**
 * Whether the gatelink to the ground works: the aircraft is on the ground, the laptop is connected to the network and
 * the NSS GATELINK pb-sw has the Terminal Area Wireless LAN Unit (TWLU) on.
 * @param connectedToNetwork whether the laptop is running and connected to the FLT OPS network
 * @param onGround whether the aircraft is on the ground
 * @param gatelinkPbOff whether the NSS GATELINK pb-sw is pressed in (OFF)
 * @returns whether data can go over the gatelink
 */
export function isGatelinkAvailable(connectedToNetwork: boolean, onGround: boolean, gatelinkPbOff: boolean): boolean {
  return connectedToNetwork && onGround && !gatelinkPbOff;
}

/**
 * Whether data from the ground (the LOAD BOX) can reach the laptop over wireless: on the ground through the gatelink,
 * in flight over the satellite link, which the GATELINK pb-sw does not control.
 * @param connectedToNetwork whether the laptop is running and connected to the FLT OPS network
 * @param onGround whether the aircraft is on the ground
 * @param gatelinkPbOff whether the NSS GATELINK pb-sw is pressed in (OFF)
 * @returns whether wireless data from the ground can reach the laptop
 */
export function isGroundWirelessAvailable(
  connectedToNetwork: boolean,
  onGround: boolean,
  gatelinkPbOff: boolean,
): boolean {
  return connectedToNetwork && (!onGround || !gatelinkPbOff);
}

/**
 * A device that hangs after a failure and starts again clean once it has been switched off long enough and on again
 * (the OIT, the laptop). The failure stays in the failure list; this only tells whether the device is still affected.
 *
 * Design choice: any injected OIT or laptop failure behaves as a software hang that the restart clears, as the crew
 * procedure for these devices expects. A failure that goes away and comes back (a new injection) affects the device
 * again, and a restart is only counted while the failure is present.
 */
export class PowerCycleRecovery {
  private offSinceMs: number | null = null;

  private recovered = false;

  /** @param requiredOffMs how long the device must stay off for the restart to clear the failure */
  constructor(private readonly requiredOffMs: number) {}

  /**
   * @param failureActive whether the failure is injected
   * @param switchedOn whether the device is switched on (and supplied)
   * @param nowMs a time in ms that keeps running while the device is off
   * @returns whether the device is still affected by the failure
   */
  public update(failureActive: boolean, switchedOn: boolean, nowMs: number): boolean {
    if (!failureActive) {
      this.recovered = false;
      this.offSinceMs = null;
      return false;
    }
    if (!switchedOn) {
      if (this.offSinceMs === null) {
        this.offSinceMs = nowMs;
      }
    } else {
      if (this.offSinceMs !== null && nowMs - this.offSinceMs >= this.requiredOffMs) {
        this.recovered = true;
      }
      this.offSinceMs = null;
    }
    return !this.recovered;
  }
}

/** The OIT must stay off for 5 s for its restart to clear a failure */
export const OIT_RESTART_OFF_MS = 5_000;

/** The laptop must stay off for 30 s for its restart to clear a failure */
export const LAPTOP_RESTART_OFF_MS = 30_000;

/**
 * An ANSU shuts down by itself when the aircraft is powered down: power that was on and is lost. Once the AC busbar that
 * feeds it has been supplied and is lost (the batteries only) it stops, and it starts again with the AC supply.
 *
 * Design choices:
 * - The AC supply must be missing for AC_LOSS_DEBOUNCE_MS before the unit stops, so that a source change of the AC
 *   network does not restart the servers.
 * - An aircraft that never had AC since the flight load (loaded powered on the batteries, external power connected
 *   later) was not powered down: nothing shuts down until the busbar has been supplied once.
 */
export class NssAutoShutdown {
  public static readonly AC_LOSS_DEBOUNCE_MS = 10_000;

  private acLostSinceMs: number | null = null;

  private acSeen = false;

  /**
   * @param acSupplied whether the AC busbar that feeds the unit is supplied
   * @param nowMs the current time, ms; 0 is the clock subject before its first event, not a time
   * @returns whether the unit is shut down
   */
  public update(acSupplied: boolean, nowMs: number): boolean {
    if (acSupplied) {
      this.acSeen = true;
      this.acLostSinceMs = null;
      return false;
    }
    // Starting the AC-loss timer from the placeholder 0 would count the whole sim clock as time without AC at the next
    // frame, and shut the unit down at once in a flight loaded with the AC busbars not yet reporting.
    if (nowMs <= 0 || !this.acSeen) {
      return false;
    }
    if (this.acLostSinceMs === null) {
      this.acLostSinceMs = nowMs;
    }
    return nowMs - this.acLostSinceMs >= NssAutoShutdown.AC_LOSS_DEBOUNCE_MS;
  }
}
