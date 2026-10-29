// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The mode 2 alert, in the order of the LegacyGpws mode types: 1 TERRAIN, 2 PULL UP */
export enum GpwsMode2Alert {
  None = 0,
  Terrain = 1,
  PullUp = 2,
}

export interface GpwsMode2Inputs {
  /** Time since the previous update, in seconds */
  deltaTimeS: number;
  radioAltitudeFt: number;
  computedAirspeedKt: number;
  verticalSpeedFtMin: number;
  /** Barometric altitude, for the altitude gain after the envelope */
  altitudeFt: number;
  landingFlaps: boolean;
  gearDown: boolean;
  /** On an ILS (GLS) approach with the glide slope and LOC deviations both below 2 dots */
  ilsDeviationsBelowTwoDots: boolean;
}

/**
 * GPWS mode 2, excessive terrain closure rate: TERRAIN TERRAIN, then PULL UP repeated as long as the terrain closure
 * rate is excessive. Mode 2A (not in landing configuration): the upper cutoff of the envelope rises with the airspeed,
 * and the alerts stop when the aircraft has been out of the envelope for 45 s or has climbed 300 ft above the
 * altitude at which it left it. Mode 2B (flaps extended for landing, ILS deviations below 2 dots, or the first 60 s
 * after takeoff): with the landing gear and the flaps in landing configuration, TERRAIN TERRAIN repeats until the
 * aircraft leaves the envelope, without PULL UP.
 *
 * Design choice: the aircraft envelopes are only published as pictures, so this uses the Honeywell EGPWS envelopes of
 * the shared EGPWS runtime (fbw-common surveillance/egpws/runtime.rs, update_mode_2_logic), with its closure rate
 * computation: the radio altitude rate limited, differentiated, rate limited and low-pass filtered (the sim radio
 * altitude is noisy over rough terrain, the reason why the previous mode 2 was switched off). Not simulated: the 2B
 * condition within 5 nm and 3 500 ft height of the destination (terrain clearance floor function).
 */
export class GpwsMode2 {
  /** Closure rate (ft/min) to alert radio altitude (ft), ascending breakpoints */
  private static readonly ALERT_AREA_CLOSURE_RATE = [2038, 3545, 9800];

  private static readonly ALERT_AREA_RADIO_ALTITUDE = [30, 1220, 2450];

  /** Mode 2B lower limit with landing flaps: vertical speed (ft/min) to radio altitude (ft) */
  private static readonly MODE_2B_CUTOFF_VERTICAL_SPEED = [-1000, -400];

  private static readonly MODE_2B_CUTOFF_RADIO_ALTITUDE = [600, 200];

  private static readonly MODE_2B_UPPER_LIMIT_FT = 789;

  /** Rate limit of the radio altitude, ft/s (about 10 000 ft/min, the top of the envelope) */
  private static readonly RADIO_ALTITUDE_RATE_LIMIT = 170;

  /** Rate limit of the closure rate, ft/min per s (about 1.5 g) */
  private static readonly CLOSURE_RATE_RATE_LIMIT = 2900;

  private static readonly CLOSURE_RATE_FILTER_TIME_CONSTANT_S = 1;

  static readonly MODE_2B_AFTER_TAKEOFF_S = 60;

  /** "TERRAIN, TERRAIN" before "PULL UP": two TERRAIN calls of 0.7 s */
  static readonly TERRAIN_PREFACE_S = 1.4;

  static readonly ALTITUDE_GAIN_FT = 300;

  static readonly ALTITUDE_GAIN_MAX_DURATION_S = 45;

  private limitedRadioAltitudeFt: number | null = null;

  private previousLimitedRadioAltitudeFt: number | null = null;

  private limitedClosureRate = 0;

  private filteredClosureRate = 0;

  private timeSinceTakeoffS = Number.POSITIVE_INFINITY;

  private onGround = false;

  private timeInEnvelopeS = 0;

  private altitudeGainActive = false;

  private altitudeGainReferenceFt = 0;

  private altitudeGainElapsedS = 0;

  private previousAlert = GpwsMode2Alert.None;

  /** The filtered terrain closure rate, ft/min (positive closing) */
  get closureRateFtMin(): number {
    return this.filteredClosureRate;
  }

  /**
   * Follows the air/ground state for the 2B condition "first 60 s after takeoff".
   * Called on every GPWS update, also on the ground and out of the GPWS range, where update() is not called.
   * @param onGround the aircraft is on the ground
   * @param deltaTimeS time since the previous call, in seconds
   */
  updateAirGroundState(onGround: boolean, deltaTimeS: number): void {
    if (onGround) {
      this.timeSinceTakeoffS = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
      if (this.timeSinceTakeoffS < GpwsMode2.MODE_2B_AFTER_TAKEOFF_S) {
        this.timeSinceTakeoffS += deltaTimeS;
      }
    }
  }

  /** Restarts the closure rate computation (radio altitude invalid or out of the GPWS range). */
  reset(): void {
    this.limitedRadioAltitudeFt = null;
    this.previousLimitedRadioAltitudeFt = null;
    this.limitedClosureRate = 0;
    this.filteredClosureRate = 0;
    this.timeInEnvelopeS = 0;
    this.altitudeGainActive = false;
    this.previousAlert = GpwsMode2Alert.None;
  }

  update(inputs: GpwsMode2Inputs): GpwsMode2Alert {
    const dt = inputs.deltaTimeS;
    if (!(dt > 0)) {
      return this.previousAlert;
    }

    const afterTakeoff = !this.onGround && this.timeSinceTakeoffS < GpwsMode2.MODE_2B_AFTER_TAKEOFF_S;

    this.updateClosureRate(inputs.radioAltitudeFt, dt);
    const closureRate = this.filteredClosureRate;
    const ra = inputs.radioAltitudeFt;

    const mode2B = afterTakeoff || inputs.landingFlaps || inputs.ilsDeviationsBelowTwoDots;
    const upperLimitFt = mode2B
      ? GpwsMode2.MODE_2B_UPPER_LIMIT_FT
      : Math.min(2450, Math.max(1650, 1650 + 8.9 * (inputs.computedAirspeedKt - 220)));
    const lowerLimitFt =
      mode2B && inputs.landingFlaps
        ? GpwsMode2.interpolate(
            GpwsMode2.MODE_2B_CUTOFF_VERTICAL_SPEED,
            GpwsMode2.MODE_2B_CUTOFF_RADIO_ALTITUDE,
            inputs.verticalSpeedFtMin,
          )
        : 30;
    const inEnvelope =
      closureRate > GpwsMode2.ALERT_AREA_CLOSURE_RATE[0] &&
      GpwsMode2.interpolate(GpwsMode2.ALERT_AREA_CLOSURE_RATE, GpwsMode2.ALERT_AREA_RADIO_ALTITUDE, closureRate) >=
        ra &&
      ra > lowerLimitFt &&
      ra < upperLimitFt;

    // Landing gear and flaps in landing configuration: TERRAIN only, as long as in the envelope
    const terrainOnly = inputs.landingFlaps && inputs.gearDown;

    // Altitude gain after leaving the envelope: the alerts stop after 45 s or 300 ft above
    // the lowest altitude since leaving the envelope.
    if (inEnvelope || terrainOnly) {
      this.altitudeGainActive = false;
    } else if (this.timeInEnvelopeS > 0 && this.previousAlert === GpwsMode2Alert.PullUp) {
      // The aircraft has just left the envelope after the PULL UP
      this.altitudeGainActive = true;
      this.altitudeGainReferenceFt = inputs.altitudeFt;
      this.altitudeGainElapsedS = 0;
    } else if (this.altitudeGainActive) {
      this.altitudeGainElapsedS += dt;
      this.altitudeGainReferenceFt = Math.min(this.altitudeGainReferenceFt, inputs.altitudeFt);
      if (
        inputs.altitudeFt - this.altitudeGainReferenceFt >= GpwsMode2.ALTITUDE_GAIN_FT ||
        this.altitudeGainElapsedS >= GpwsMode2.ALTITUDE_GAIN_MAX_DURATION_S
      ) {
        this.altitudeGainActive = false;
      }
    }

    this.timeInEnvelopeS = inEnvelope ? this.timeInEnvelopeS + dt : 0;

    let alert: GpwsMode2Alert;
    if (inEnvelope) {
      alert =
        terrainOnly || this.timeInEnvelopeS <= GpwsMode2.TERRAIN_PREFACE_S
          ? GpwsMode2Alert.Terrain
          : GpwsMode2Alert.PullUp;
    } else if (this.altitudeGainActive) {
      alert = GpwsMode2Alert.Terrain;
    } else {
      alert = GpwsMode2Alert.None;
    }
    this.previousAlert = alert;
    return alert;
  }

  private updateClosureRate(radioAltitudeFt: number, dt: number): void {
    if (this.limitedRadioAltitudeFt === null) {
      this.limitedRadioAltitudeFt = radioAltitudeFt;
    } else {
      const maxStep = GpwsMode2.RADIO_ALTITUDE_RATE_LIMIT * dt;
      this.limitedRadioAltitudeFt += Math.max(
        -maxStep,
        Math.min(maxStep, radioAltitudeFt - this.limitedRadioAltitudeFt),
      );
    }

    const rawClosureRate =
      this.previousLimitedRadioAltitudeFt === null
        ? 0
        : (-(this.limitedRadioAltitudeFt - this.previousLimitedRadioAltitudeFt) / dt) * 60;
    this.previousLimitedRadioAltitudeFt = this.limitedRadioAltitudeFt;

    const maxRateStep = GpwsMode2.CLOSURE_RATE_RATE_LIMIT * dt;
    this.limitedClosureRate += Math.max(-maxRateStep, Math.min(maxRateStep, rawClosureRate - this.limitedClosureRate));
    this.filteredClosureRate +=
      (this.limitedClosureRate - this.filteredClosureRate) *
      (1 - Math.exp(-dt / GpwsMode2.CLOSURE_RATE_FILTER_TIME_CONSTANT_S));
  }

  /** Linear interpolation in ascending breakpoints, clamped at both ends */
  private static interpolate(breakpoints: readonly number[], values: readonly number[], x: number): number {
    if (x <= breakpoints[0]) {
      return values[0];
    }
    for (let i = 1; i < breakpoints.length; i++) {
      if (x <= breakpoints[i]) {
        const ratio = (x - breakpoints[i - 1]) / (breakpoints[i] - breakpoints[i - 1]);
        return values[i - 1] + ratio * (values[i] - values[i - 1]);
      }
    }
    return values[values.length - 1];
  }
}
