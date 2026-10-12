// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { ReactiveWindshearDetection, ReactiveWindshearInputs } from './ReactiveWindshearDetection';

const KNOT = 0.514444;
const FT_MIN = 0.00508;
const DT = 0.1;

/**
 * A flight in a wind field: the aircraft keeps its pitch, angle of attack and air path angle; the wind changes the
 * ground speed and the inertial vertical speed. Builds the inputs the ADIRS would give.
 */
class Flight {
  onGround = false;

  computerAvailable = true;

  flapsLeverOutOfZero = true;

  radioAltitudeFt = 1000;

  trueAirspeedKt = 140;

  /** Tailwind component, knots (negative: headwind) */
  tailwindKt = -10;

  /** Vertical wind, m/s, positive up */
  verticalWind = 0;

  /** Air path angle, degrees */
  airPathAngleDeg = -3;

  angleOfAttackDeg = 6;

  rollDeg = 0;

  valid = true;

  inputs(): ReactiveWindshearInputs {
    const tas = this.trueAirspeedKt * KNOT;
    const rad = Math.PI / 180;
    const airClimb = tas * Math.sin(this.airPathAngleDeg * rad);
    // Pitch from sin(gamma) = cos(a) sin(theta) - sin(a) cos(phi) cos(theta) = R sin(theta - d)
    const sinAoaCosRoll = Math.sin(this.angleOfAttackDeg * rad) * Math.cos(this.rollDeg * rad);
    const cosAoa = Math.cos(this.angleOfAttackDeg * rad);
    const pitchDeg =
      (Math.atan2(sinAoaCosRoll, cosAoa) +
        Math.asin(Math.sin(this.airPathAngleDeg * rad) / Math.hypot(cosAoa, sinAoaCosRoll))) /
      rad;
    return {
      deltaTime: DT,
      onGround: this.onGround,
      computerAvailable: this.computerAvailable,
      flapsLeverOutOfZero: this.flapsLeverOutOfZero,
      radioAltitudeFt: this.radioAltitudeFt,
      trueAirspeedKt: this.valid ? this.trueAirspeedKt : null,
      groundSpeedKt: this.trueAirspeedKt + this.tailwindKt,
      inertialVerticalSpeedFtMin: (airClimb + this.verticalWind) / FT_MIN,
      pitchDeg,
      rollDeg: this.rollDeg,
      angleOfAttackDeg: this.angleOfAttackDeg,
    };
  }
}

/** Runs the detection for the given time, calling change before each step; returns whether the warning came. */
function fly(
  detection: ReactiveWindshearDetection,
  flight: Flight,
  seconds: number,
  change: (f: Flight) => void = () => {},
): boolean {
  let warned = false;
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    change(flight);
    detection.update(flight.inputs());
    warned = warned || detection.warning;
  }
  return warned;
}

/** A loss of headwind of 3 kt/s: the airspeed decays at 3 kt/s, F = 1.54 / 9.81 = 0.157 */
const headwindLoss = (f: Flight) => {
  f.tailwindKt += 3 * DT;
  f.trueAirspeedKt -= 3 * DT;
};

/** An airborne aircraft on approach (the takeoff window closed above 1 300 ft) */
function approach(): { detection: ReactiveWindshearDetection; flight: Flight } {
  const detection = new ReactiveWindshearDetection(15);
  const flight = new Flight();
  flight.onGround = false;
  flight.radioAltitudeFt = 2000;
  fly(detection, flight, 2);
  flight.radioAltitudeFt = 1000;
  return { detection, flight };
}

describe('Reactive windshear detection', () => {
  it('gives no warning in a steady wind on approach, also in a turn', () => {
    const { detection, flight } = approach();
    expect(fly(detection, flight, 30)).toBe(false);
    flight.rollDeg = 25;
    expect(fly(detection, flight, 30)).toBe(false);
    expect(Math.abs(detection.fFactor)).toBeLessThan(0.01);
  });

  it('warns on a loss of headwind on approach (decreasing performance shear)', () => {
    const { detection, flight } = approach();
    expect(fly(detection, flight, 8, headwindLoss)).toBe(true);
    expect(detection.fFactor).toBeGreaterThan(ReactiveWindshearDetection.F_FACTOR_WARNING_THRESHOLD);
  });

  it('warns in a downdraft of 12 m/s on approach (F = 12 / 72 = 0.17)', () => {
    const { detection, flight } = approach();
    flight.verticalWind = -12;
    expect(fly(detection, flight, 8)).toBe(true);
  });

  it('gives no warning in an increasing headwind or an updraft (increasing performance)', () => {
    const { detection, flight } = approach();
    expect(
      fly(detection, flight, 8, (f) => {
        f.tailwindKt -= 3 * DT;
        f.trueAirspeedKt += 3 * DT;
      }),
    ).toBe(false);
    flight.verticalWind = 12;
    expect(fly(detection, flight, 8)).toBe(false);
  });

  it('gives no warning below the F-factor threshold (loss of headwind of 1.5 kt/s, F = 0.08)', () => {
    const { detection, flight } = approach();
    expect(
      fly(detection, flight, 10, (f) => {
        f.tailwindKt += 1.5 * DT;
        f.trueAirspeedKt -= 1.5 * DT;
      }),
    ).toBe(false);
  });

  describe('availability (A320 FCOM DSC-22_40-40, A380 FCOM DSC-22-27-20)', () => {
    it('is not available above 1 300 ft RA on approach', () => {
      const { detection, flight } = approach();
      flight.radioAltitudeFt = 1400;
      expect(fly(detection, flight, 8, headwindLoss)).toBe(false);
    });

    it('is not available below 50 ft RA at landing', () => {
      const { detection, flight } = approach();
      flight.radioAltitudeFt = 40;
      expect(fly(detection, flight, 8, headwindLoss)).toBe(false);
    });

    it('is not available in CONF 0', () => {
      const { detection, flight } = approach();
      flight.flapsLeverOutOfZero = false;
      expect(fly(detection, flight, 8, headwindLoss)).toBe(false);
    });

    it('is not available without a healthy computer', () => {
      const { detection, flight } = approach();
      flight.computerAvailable = false;
      expect(fly(detection, flight, 8, headwindLoss)).toBe(false);
    });

    it('is not available with invalid air data', () => {
      const { detection, flight } = approach();
      flight.valid = false;
      expect(fly(detection, flight, 8, headwindLoss)).toBe(false);
    });

    it('at takeoff: from 3 s after liftoff, down to 0 ft, up to 1 300 ft RA', () => {
      const detection = new ReactiveWindshearDetection(0);
      const flight = new Flight();
      flight.onGround = true;
      flight.radioAltitudeFt = 0;
      flight.airPathAngleDeg = 8;
      fly(detection, flight, 2);

      // Liftoff, shear during the first 2.5 s: no detection yet
      flight.onGround = false;
      flight.radioAltitudeFt = 30;
      expect(fly(detection, flight, 2.5, headwindLoss)).toBe(false);
      expect(detection.inDetectionEnvelope).toBe(false);

      // 3 s after liftoff, still below 50 ft: the takeoff window is open
      fly(detection, flight, 0.6);
      expect(detection.inDetectionEnvelope).toBe(true);
      expect(fly(detection, flight, 6, headwindLoss)).toBe(true);

      // Above 1 300 ft: closed
      flight.radioAltitudeFt = 1350;
      fly(detection, flight, 1);
      expect(detection.inDetectionEnvelope).toBe(false);
    });
  });

  describe('warning duration', () => {
    it('A320: stays at least 15 s (a320_fcom.txt:34228)', () => {
      const { detection, flight } = approach();
      expect(fly(detection, flight, 8, headwindLoss)).toBe(true);
      // The shear ends
      fly(detection, flight, 12);
      expect(detection.warning).toBe(true);
      fly(detection, flight, 10);
      expect(detection.warning).toBe(false);
    });

    it('A380: as long as the windshear is detected (a380_fcom.txt:9274)', () => {
      const detection = new ReactiveWindshearDetection(0);
      const flight = new Flight();
      flight.radioAltitudeFt = 2000;
      fly(detection, flight, 2);
      flight.radioAltitudeFt = 1000;
      expect(fly(detection, flight, 8, headwindLoss)).toBe(true);
      fly(detection, flight, 8);
      expect(detection.warning).toBe(false);
    });
  });
});
