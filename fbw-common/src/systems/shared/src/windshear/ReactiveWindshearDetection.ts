// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The data of one update of the reactive windshear detection. A null value is an invalid (failed or NCD) input. */
export interface ReactiveWindshearInputs {
  /** Time since the previous update, in seconds */
  deltaTime: number;
  /** The main landing gears are compressed */
  onGround: boolean;
  /** At least one computer that runs the detection (A320 FACs, A380 PRIMs) is healthy */
  computerAvailable: boolean;
  /** The flaps lever is out of position 0 (CONF 1 or more) */
  flapsLeverOutOfZero: boolean;
  radioAltitudeFt: number | null;
  trueAirspeedKt: number | null;
  groundSpeedKt: number | null;
  /** Inertial vertical speed, positive up */
  inertialVerticalSpeedFtMin: number | null;
  /** Pitch attitude, positive nose up */
  pitchDeg: number | null;
  rollDeg: number | null;
  angleOfAttackDeg: number | null;
}

/**
 * Reactive windshear detection (A320 FACs, A380 PRIMs): a red WINDSHEAR on both PFDs when the aircraft meets a
 * decreasing performance windshear during takeoff or landing.
 *
 * Availability, both aircraft: at takeoff from 3 s after liftoff up to 1 300 ft RA, at landing from 1 300 ft RA down to
 * 50 ft RA, and only with CONF 1 or more.
 *
 * Detection principle: the computers warn when the predicted energy level of the aircraft falls below a threshold,
 * from the ADIRS vertical speed, air and ground speeds, slope, longitudinal wind gradient and vertical wind. The manual
 * gives neither the formula nor the threshold. Design choice: the windshear hazard index (F-factor) built from exactly
 * these data, F = (rate of tailwind increase) / g - (vertical wind) / TAS, which is the loss of specific energy rate
 * caused by the wind; the warning comes when F, filtered, reaches F_FACTOR_WARNING_THRESHOLD.
 *
 * Warning duration: the A320 shows it for at least 15 s, the A380 as long as the windshear is detected: the minimum
 * duration is a constructor parameter.
 */
export class ReactiveWindshearDetection {
  /** No detection before this time after liftoff, in seconds */
  static readonly LIFTOFF_DELAY_S = 3;

  /** Upper limit of the takeoff and landing detection, radio altitude in feet */
  static readonly UPPER_LIMIT_FT = 1300;

  /** Lower limit of the landing detection, radio altitude in feet */
  static readonly LANDING_LOWER_LIMIT_FT = 50;

  /**
   * F-factor of the warning. Design choice: 0.13, the hazard level of a decreasing performance windshear used by the
   * windshear alerting standards (a sustained F of 0.13 removes the climb capability of a typical airliner).
   */
  static readonly F_FACTOR_WARNING_THRESHOLD = 0.13;

  /** Lag of the rate of tailwind increase, against the noise of the speed derivatives, in seconds */
  static readonly SHEAR_RATE_FILTER_TIME_CONSTANT_S = 1;

  /** Lag of the F-factor: a gust of a second or two is not a windshear, in seconds */
  static readonly F_FACTOR_FILTER_TIME_CONSTANT_S = 2;

  /** No detection below this true airspeed (vertical wind / TAS), in knots */
  static readonly MINIMUM_TRUE_AIRSPEED_KT = 60;

  private static readonly KNOT_TO_METRE_PER_SECOND = 0.514444;

  private static readonly FOOT_PER_MINUTE_TO_METRE_PER_SECOND = 0.00508;

  private static readonly GRAVITY_METRE_PER_SECOND_SQUARED = 9.80665;

  private static readonly DEGREE_TO_RADIAN = Math.PI / 180;

  /** Takeoff detection window (from liftoff until 1 300 ft RA), as opposed to the landing window */
  private takeoffPhase = false;

  private wasOnGround = true;

  private timeSinceLiftoffS = 0;

  private previousGroundSpeedKt: number | null = null;

  private previousTrueAirspeedKt: number | null = null;

  /** Rate of tailwind increase, filtered, in m/s^2 */
  private filteredShearRate = 0;

  private filteredFFactor = 0;

  private detected = false;

  private warningRemainingS = 0;

  private envelopeActive = false;

  /**
   * @param minimumWarningDurationS how long the warning stays at least once triggered, in seconds
   */
  constructor(private readonly minimumWarningDurationS: number) {}

  /** The red WINDSHEAR warning (PFD message and aural) */
  get warning(): boolean {
    return this.warningRemainingS > 0 || this.detected;
  }

  /** The aircraft is in the detection envelope (takeoff or landing window, CONF 1 or more, a computer healthy) */
  get inDetectionEnvelope(): boolean {
    return this.envelopeActive;
  }

  /** The filtered F-factor, positive for a decreasing performance windshear */
  get fFactor(): number {
    return this.filteredFFactor;
  }

  update(inputs: ReactiveWindshearInputs): void {
    const dt = inputs.deltaTime;
    if (!(dt > 0)) {
      return;
    }

    this.updateFlightWindow(inputs, dt);

    const ra = inputs.radioAltitudeFt;
    const inWindow =
      ra !== null &&
      !inputs.onGround &&
      ra <= ReactiveWindshearDetection.UPPER_LIMIT_FT &&
      (this.takeoffPhase
        ? this.timeSinceLiftoffS >= ReactiveWindshearDetection.LIFTOFF_DELAY_S
        : ra >= ReactiveWindshearDetection.LANDING_LOWER_LIMIT_FT);
    this.envelopeActive = inputs.computerAvailable && inputs.flapsLeverOutOfZero && inWindow;

    const fFactorValid = this.updateFFactor(inputs, dt);

    this.detected =
      this.envelopeActive &&
      fFactorValid &&
      this.filteredFFactor >= ReactiveWindshearDetection.F_FACTOR_WARNING_THRESHOLD;

    if (this.detected) {
      this.warningRemainingS = this.minimumWarningDurationS;
    } else {
      this.warningRemainingS = Math.max(0, this.warningRemainingS - dt);
    }
    if (!inputs.computerAvailable) {
      this.warningRemainingS = 0;
    }
  }

  /** Liftoff opens the takeoff window, which ends at 1 300 ft RA; any later flight below 1 300 ft is a landing. */
  private updateFlightWindow(inputs: ReactiveWindshearInputs, dt: number): void {
    if (inputs.onGround) {
      this.wasOnGround = true;
      this.takeoffPhase = false;
      this.timeSinceLiftoffS = 0;
      return;
    }

    if (this.wasOnGround) {
      this.wasOnGround = false;
      this.takeoffPhase = true;
      this.timeSinceLiftoffS = 0;
    } else {
      this.timeSinceLiftoffS += dt;
    }

    if (inputs.radioAltitudeFt !== null && inputs.radioAltitudeFt > ReactiveWindshearDetection.UPPER_LIMIT_FT) {
      this.takeoffPhase = false;
    }
  }

  /**
   * F = Wx' / g - Wh / V, Wx' the rate of tailwind increase (ground speed rate minus airspeed rate), Wh the vertical
   * wind (inertial vertical speed minus the air mass climb rate V sin(gamma air)), V the true airspeed. The air path
   * angle comes from the attitude and the angle of attack (no sideslip): sin(gamma) = cos(a) sin(theta) - sin(a)
   * cos(phi) cos(theta).
   * @returns whether the F-factor is valid (all data valid, enough airspeed); the filters restart otherwise
   */
  private updateFFactor(inputs: ReactiveWindshearInputs, dt: number): boolean {
    const tas = inputs.trueAirspeedKt;
    const gs = inputs.groundSpeedKt;
    const vs = inputs.inertialVerticalSpeedFtMin;
    const pitch = inputs.pitchDeg;
    const roll = inputs.rollDeg;
    const aoa = inputs.angleOfAttackDeg;

    if (
      tas === null ||
      gs === null ||
      vs === null ||
      pitch === null ||
      roll === null ||
      aoa === null ||
      tas < ReactiveWindshearDetection.MINIMUM_TRUE_AIRSPEED_KT
    ) {
      this.previousGroundSpeedKt = null;
      this.previousTrueAirspeedKt = null;
      this.filteredShearRate = 0;
      this.filteredFFactor = 0;
      return false;
    }

    if (this.previousGroundSpeedKt === null || this.previousTrueAirspeedKt === null) {
      this.previousGroundSpeedKt = gs;
      this.previousTrueAirspeedKt = tas;
      return false;
    }

    const shearRate =
      ((gs - this.previousGroundSpeedKt - (tas - this.previousTrueAirspeedKt)) / dt) *
      ReactiveWindshearDetection.KNOT_TO_METRE_PER_SECOND;
    this.previousGroundSpeedKt = gs;
    this.previousTrueAirspeedKt = tas;
    this.filteredShearRate = ReactiveWindshearDetection.lag(
      this.filteredShearRate,
      shearRate,
      dt,
      ReactiveWindshearDetection.SHEAR_RATE_FILTER_TIME_CONSTANT_S,
    );

    const toRad = ReactiveWindshearDetection.DEGREE_TO_RADIAN;
    const sinAirPathAngle =
      Math.cos(aoa * toRad) * Math.sin(pitch * toRad) -
      Math.sin(aoa * toRad) * Math.cos(roll * toRad) * Math.cos(pitch * toRad);
    const tasMetrePerSecond = tas * ReactiveWindshearDetection.KNOT_TO_METRE_PER_SECOND;
    const verticalWind =
      vs * ReactiveWindshearDetection.FOOT_PER_MINUTE_TO_METRE_PER_SECOND - tasMetrePerSecond * sinAirPathAngle;

    const fFactor =
      this.filteredShearRate / ReactiveWindshearDetection.GRAVITY_METRE_PER_SECOND_SQUARED -
      verticalWind / tasMetrePerSecond;
    this.filteredFFactor = ReactiveWindshearDetection.lag(
      this.filteredFFactor,
      fFactor,
      dt,
      ReactiveWindshearDetection.F_FACTOR_FILTER_TIME_CONSTANT_S,
    );

    return true;
  }

  private static lag(previous: number, input: number, dt: number, timeConstantS: number): number {
    return previous + (input - previous) * (1 - Math.exp(-dt / timeConstantS));
  }
}
