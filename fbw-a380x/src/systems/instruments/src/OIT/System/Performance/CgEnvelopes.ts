// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The CG envelopes of the LOADSHEET: the zero fuel (ZF), landing (LDG) and takeoff (T.O) limits the weights and CGs are
 * checked against and the CG diagram draws. Weights in kg, CGs in % MAC.
 */

export type CgEnvelopeName = 'ZF' | 'LDG' | 'T.O';

/** A vertex of an envelope outline: the CG (% MAC) and the weight (kg) */
export type CgEnvelopeVertex = readonly [cg: number, weight: number];

export interface CgEnvelope {
  readonly name: CgEnvelopeName;
  /** The outline, in the order of its edges */
  readonly vertices: readonly CgEnvelopeVertex[];
}

/** Whether a CG (% MAC) is within a limit at a weight (kg) */
export type CgWithinLimits = (cg: number, weight: number) => boolean;

/** The CG limit checks of the three weights of a loadsheet */
export interface LoadsheetCgLimits {
  readonly zeroFuel: CgWithinLimits;
  readonly takeoff: CgWithinLimits;
  readonly landing: CgWithinLimits;
}

/*
 * The envelopes of the FBW A380X airframe configuration (the mzfw, mtow and mlw performance envelopes): the outlines the
 * flyPad payload chart draws. The takeoff one is also the CG table of the takeoff calculator; a spec keeps all three
 * equal to the configuration.
 */

export const ZERO_FUEL_ENVELOPE: CgEnvelope = {
  name: 'ZF',
  vertices: [
    [29, 270_000],
    [29, 360_000],
    [31.5, 365_000],
    [43, 365_000],
    [43, 270_000],
  ],
};

export const LANDING_ENVELOPE: CgEnvelope = {
  name: 'LDG',
  vertices: [
    [29, 270_000],
    [29, 375_000],
    [29.75, 385_000],
    [31.5, 395_000],
    [43, 395_000],
    [43, 270_000],
  ],
};

export const TAKEOFF_ENVELOPE: CgEnvelope = {
  name: 'T.O',
  vertices: [
    [29, 270_000],
    [29, 375_000],
    [35.75, 510_000],
    [43, 510_000],
    [43, 270_000],
  ],
};

/** The envelopes in the order they are drawn: the largest first, so the smaller ones stay visible inside it */
export const CG_ENVELOPES: readonly CgEnvelope[] = [TAKEOFF_ENVELOPE, LANDING_ENVELOPE, ZERO_FUEL_ENVELOPE];

/**
 * The forward and aft CG limits of an envelope at a weight. A weight outside the envelope's weight range gets the
 * limits of its nearest edge: the weight is checked against its own maximum separately, so only the CG is judged here.
 * Design choice: that maximum is the MZFW, MTOW or MLW of the loadsheet, which can lie above the top edge of the
 * envelope (the ZF envelope ends at a lower weight than the MZFW).
 * @param envelope the envelope
 * @param weight the weight, kg
 * @returns the forward and aft limits, % MAC
 */
export function envelopeCgLimits(envelope: CgEnvelope, weight: number): { forward: number; aft: number } {
  const weights = envelope.vertices.map((vertex) => vertex[1]);
  const clamped = Math.min(Math.max(weight, Math.min(...weights)), Math.max(...weights));
  let forward = Infinity;
  let aft = -Infinity;
  const include = (cg: number) => {
    forward = Math.min(forward, cg);
    aft = Math.max(aft, cg);
  };
  envelope.vertices.forEach((from, i) => {
    const to = envelope.vertices[(i + 1) % envelope.vertices.length];
    const [fromCg, fromWeight] = from;
    const [toCg, toWeight] = to;
    if (clamped < Math.min(fromWeight, toWeight) || clamped > Math.max(fromWeight, toWeight)) {
      return;
    }
    if (fromWeight === toWeight) {
      include(fromCg);
      include(toCg);
    } else {
      include(fromCg + ((toCg - fromCg) * (clamped - fromWeight)) / (toWeight - fromWeight));
    }
  });
  return { forward, aft };
}

/**
 * @param envelope the envelope
 * @returns whether a CG is within the envelope at a weight
 */
function cgLimitCheckOf(envelope: CgEnvelope): CgWithinLimits {
  return (cg, weight) => {
    const limits = envelopeCgLimits(envelope, weight);
    return cg >= limits.forward && cg <= limits.aft;
  };
}

/** The CG limit checks of the A380 loadsheet: each weight against its own envelope */
export const A380_CG_LIMITS: LoadsheetCgLimits = {
  zeroFuel: cgLimitCheckOf(ZERO_FUEL_ENVELOPE),
  takeoff: cgLimitCheckOf(TAKEOFF_ENVELOPE),
  landing: cgLimitCheckOf(LANDING_ENVELOPE),
};
