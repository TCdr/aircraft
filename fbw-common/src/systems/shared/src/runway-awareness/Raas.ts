// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AwarenessRunway, AwarenessRunwayEnd, AwarenessRunwayGeometry, RunwayFramePosition } from './AwarenessRunway';

/**
 * The words a RAAS callout is made of. `pause` is a short silence between two repeats ("On taxiway, on taxiway").
 */
export type RaasWord =
  | 'approaching'
  | 'runways'
  | 'onRunway'
  | 'zero'
  | 'one'
  | 'two'
  | 'three'
  | 'four'
  | 'five'
  | 'six'
  | 'seven'
  | 'eight'
  | 'nine'
  | 'left'
  | 'right'
  | 'center'
  | 'onTaxiway'
  | 'caution'
  | 'shortRunway'
  | 'taxiway'
  | 'thousand'
  | 'hundred'
  | 'thirty'
  | 'remaining'
  | 'available'
  | 'pause';

/**
 * The RAAS advisories and cautions, in the order they are issued when several come at the same time (Honeywell
 * RAAS product description 060-4564-001, 3.1). The distance remaining callouts come first: they are only valid at
 * the moment they are issued.
 */
export enum RaasAdvisory {
  DistanceRemaining,
  RunwayEnd,
  ApproachingRunwayInAir,
  ApproachingShortRunwayInAir,
  CautionShortRunwayInAir,
  OnRunway,
  CautionShortRunwayOnGround,
  OnShortRunway,
  TaxiwayLanding,
  ApproachingRunwayOnGround,
  OnTaxiway,
  ExtendedHolding,
}

export interface RaasCallout {
  readonly advisory: RaasAdvisory;
  readonly words: readonly RaasWord[];
  /** The time the callout was generated, in ms */
  readonly time: number;
}

export interface RaasConfig {
  /** The unit of the distances in the callouts */
  readonly distanceUnit: 'feet' | 'meters';
  /** The distance from the aircraft position forward to the flight deck, in metres (the pilot's point of view) */
  readonly flightDeckOffset: number;
  /** The nominal takeoff runway length, in metres, or null for no insufficient runway length advisory */
  readonly takeoffNominalLength: number | null;
  /** The nominal landing runway length, in metres, or null for no approaching short runway advisory */
  readonly landingNominalLength: number | null;
  /** The approaching runway in air advisory suppress window, upper and lower bounds, in ft above the runway */
  readonly suppressWindow: readonly [number, number];
  /** The extended holding on runway advisory initial time, in s, or null for none */
  readonly extendedHoldingInitial: number | null;
  /** The extended holding on runway advisory repeat time, in s, or null for no repeat */
  readonly extendedHoldingRepeat: number | null;
}

export interface RaasInputs {
  /** degrees */
  readonly latitude: number;
  /** degrees */
  readonly longitude: number;
  /** degrees true */
  readonly trueHeading: number;
  /** degrees true */
  readonly trueTrack: number;
  /** knots */
  readonly groundSpeed: number;
  readonly onGround: boolean;
  /** feet above mean sea level */
  readonly altitude: number;
  /** feet */
  readonly radioAltitude: number;
  /** feet per minute */
  readonly verticalSpeed: number;
}

/** The state of the runway the flight deck is on, from the moment it enters the runway to the moment it leaves it */
interface RunwayOccupancy {
  readonly key: string;
  readonly runway: AwarenessRunway;
  /** Entered on the ground (taxi), not in the air (landing): only then is On Runway issued */
  readonly enteredOnGround: boolean;
  lastOnTime: number;
  onRunwayGiven: boolean;
  rollMode: 'takeoff' | 'landing' | null;
  maxGroundSpeed: number;
  rejectedTakeoff: boolean;
  /** The last distance remaining mark issued, in the callout unit */
  lastMark: number;
  runwayEndGiven: boolean;
  holdAlong: number;
  holdSince: number;
  holdNextCallout: number;
}

const FT_PER_M = 3.28084;
const KT_TO_MPS = 1_852 / 3_600;
const NM_M = 1_852;
const ALIGNMENT_TOLERANCE = 20;
/** Lateral limit of an aligned approach: 200 ft plus the runway width from the centreline (4.2.1.1) */
const LATERAL_MARGIN_M = 200 / FT_PER_M;

const DIGITS: readonly RaasWord[] = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/**
 * The Honeywell Runway Awareness and Advisory System (RAAS), an EGPWS software option: aural advisories of the runway
 * the aircraft is approaching, lined up with or rolling on, from its position and the airport runways.
 *
 * Implemented from the Honeywell product description 060-4564-001 (section 4): all the routine advisories (approaching
 * runway in air and on ground, on runway, distance remaining at landing, runway end) and the non-routine ones
 * (approaching short runway and its caution, insufficient runway length on ground and its caution, extended holding
 * on runway, taxiway takeoff, distance remaining at a rejected takeoff, taxiway landing). No visual messages.
 */
export class Raas {
  private occupancy: RunwayOccupancy | null = null;

  /** The runways the approaching runway on ground advisory was issued for, and the last time each qualified */
  private readonly approachLatches = new Map<string, number>();

  private onTaxiwayGiven = false;

  private taxiwayLandingGiven = false;

  private readonly airApproachGiven = new Set<string>();

  private airApproachRunwaysGiven = false;

  private readonly airShortCautionGiven = new Set<string>();

  private lastAirborneTime = -Infinity;

  private readonly pos: RunwayFramePosition = { along: 0, cross: 0 };

  private readonly deckPos: RunwayFramePosition = { along: 0, cross: 0 };

  constructor(private readonly config: RaasConfig) {}

  /** Forgets every advisory given, e.g. when RAAS is switched off */
  public reset(): void {
    this.occupancy = null;
    this.approachLatches.clear();
    this.onTaxiwayGiven = false;
    this.taxiwayLandingGiven = false;
    this.airApproachGiven.clear();
    this.airApproachRunwaysGiven = false;
    this.airShortCautionGiven.clear();
    this.lastAirborneTime = -Infinity;
  }

  /**
   * @param inputs the aircraft state
   * @param runways the runways around the aircraft
   * @param now the time, in ms
   * @returns the callouts to issue, in their order of priority
   */
  public update(inputs: RaasInputs, runways: readonly AwarenessRunway[], now: number): RaasCallout[] {
    const callouts: RaasCallout[] = [];
    const add = (advisory: RaasAdvisory, words: RaasWord[]) => callouts.push({ advisory, words, time: now });

    if (inputs.onGround) {
      this.updateOccupancy(inputs, runways, now);
      this.updateOnGround(inputs, runways, now, add);
      this.airApproachGiven.clear();
      this.airApproachRunwaysGiven = false;
      this.airShortCautionGiven.clear();
      this.taxiwayLandingGiven = false;
    } else {
      this.lastAirborneTime = now;
      this.approachLatches.clear();
      this.onTaxiwayGiven = false;
      this.updateLandingOccupancy(inputs, runways, now);
      this.updateInAir(inputs, runways, add);
    }
    this.updateDistanceRemaining(inputs, add);

    return callouts.sort((a, b) => a.advisory - b.advisory);
  }

  /** The runway the flight deck is on, on the ground */
  private updateOccupancy(inputs: RaasInputs, runways: readonly AwarenessRunway[], now: number): void {
    let onRunway: AwarenessRunway | null = null;
    for (const runway of runways) {
      this.toDeckFrame(runway, inputs);
      if (AwarenessRunwayGeometry.isOnRunway(runway, this.deckPos)) {
        // Where two runways cross, the one the aircraft is aligned with
        if (!onRunway || AwarenessRunwayGeometry.alignedEnd(runway, inputs.trueHeading, ALIGNMENT_TOLERANCE) !== null) {
          onRunway = runway;
        }
      }
    }

    if (onRunway) {
      const key = AwarenessRunwayGeometry.key(onRunway);
      if (this.occupancy?.key !== key) {
        // Just after a landing, the runway was entered in the air
        const landing = now - this.lastAirborneTime < 20_000;
        this.occupancy = this.newOccupancy(onRunway, !landing, now);
        if (landing) {
          this.startRoll('landing', inputs);
        }
      }
      this.occupancy.lastOnTime = now;
    } else if (this.occupancy && now - this.occupancy.lastOnTime > 2_000) {
      this.occupancy = null;
    }
  }

  /** In the air, the runway the aircraft flies over below 100 ft, for the distance remaining at landing */
  private updateLandingOccupancy(inputs: RaasInputs, runways: readonly AwarenessRunway[], now: number): void {
    if (inputs.radioAltitude < 100) {
      for (const runway of runways) {
        this.toDeckFrame(runway, inputs);
        if (
          AwarenessRunwayGeometry.isOnRunway(runway, this.deckPos) &&
          AwarenessRunwayGeometry.alignedEnd(runway, inputs.trueTrack, ALIGNMENT_TOLERANCE) !== null
        ) {
          const key = AwarenessRunwayGeometry.key(runway);
          if (this.occupancy?.key !== key) {
            this.occupancy = this.newOccupancy(runway, false, now);
            this.startRoll('landing', inputs);
          }
          this.occupancy.lastOnTime = now;
          return;
        }
      }
    }
    if (this.occupancy && now - this.occupancy.lastOnTime > 2_000) {
      this.occupancy = null;
    }
  }

  private newOccupancy(runway: AwarenessRunway, enteredOnGround: boolean, now: number): RunwayOccupancy {
    return {
      key: AwarenessRunwayGeometry.key(runway),
      runway,
      enteredOnGround,
      lastOnTime: now,
      onRunwayGiven: false,
      rollMode: null,
      maxGroundSpeed: 0,
      rejectedTakeoff: false,
      lastMark: Infinity,
      runwayEndGiven: false,
      holdAlong: NaN,
      holdSince: now,
      holdNextCallout: NaN,
    };
  }

  private updateOnGround(
    inputs: RaasInputs,
    runways: readonly AwarenessRunway[],
    now: number,
    add: (advisory: RaasAdvisory, words: RaasWord[]) => void,
  ): void {
    const occupancy = this.occupancy;
    const alignedEnd = occupancy
      ? AwarenessRunwayGeometry.alignedEnd(occupancy.runway, inputs.trueHeading, ALIGNMENT_TOLERANCE)
      : null;

    if (occupancy && alignedEnd !== null) {
      this.toDeckFrame(occupancy.runway, inputs);
      const end = occupancy.runway.ends[alignedEnd];
      const remaining = AwarenessRunwayGeometry.distanceToEnd(occupancy.runway, alignedEnd, this.deckPos);
      const short = this.config.takeoffNominalLength !== null && remaining < this.config.takeoffNominalLength;

      // On Runway (4.2.3), with the length remaining when shorter than the nominal takeoff length (4.3.3)
      if (occupancy.enteredOnGround && !occupancy.onRunwayGiven) {
        occupancy.onRunwayGiven = true;
        if (short) {
          add(RaasAdvisory.OnShortRunway, [
            'onRunway',
            ...Raas.runwayWords(end),
            ...this.distanceWords(remaining),
            'remaining',
          ]);
        } else {
          add(RaasAdvisory.OnRunway, ['onRunway', ...Raas.runwayWords(end)]);
        }
      }

      // The takeoff roll starts above 40 kt; Caution Short Runway when the length is still short (4.3.4)
      if (occupancy.rollMode === null && inputs.groundSpeed > 40) {
        this.startRoll('takeoff', inputs);
        if (short) {
          add(RaasAdvisory.CautionShortRunwayOnGround, ['caution', 'shortRunway', 'pause', 'shortRunway']);
        }
      }

      // Rejected takeoff: the ground speed decreases by 7 kt from its maximum above 40 kt (4.3.7)
      if (occupancy.rollMode === 'takeoff') {
        occupancy.maxGroundSpeed = Math.max(occupancy.maxGroundSpeed, inputs.groundSpeed);
        if (
          !occupancy.rejectedTakeoff &&
          inputs.groundSpeed > 40 &&
          occupancy.maxGroundSpeed - inputs.groundSpeed >= 7
        ) {
          occupancy.rejectedTakeoff = true;
          occupancy.lastMark = this.nextMarkAbove(remaining);
        }
      }

      // Runway End: within 100 ft of the end, below 40 kt (4.2.5)
      if (!occupancy.runwayEndGiven && inputs.groundSpeed < 40 && remaining <= 100 / FT_PER_M && remaining > 0) {
        occupancy.runwayEndGiven = true;
        add(
          RaasAdvisory.RunwayEnd,
          this.config.distanceUnit === 'feet' ? ['one', 'hundred', 'remaining'] : ['thirty', 'remaining'],
        );
      }

      this.updateExtendedHolding(occupancy, end, now, add);
    }

    // Taxiway takeoff: above 40 kt and not aligned with a runway (4.3.6)
    if (inputs.groundSpeed > 40) {
      if (!this.onTaxiwayGiven && alignedEnd === null && this.anyRunwayWithin(runways, inputs, 3 * NM_M)) {
        this.onTaxiwayGiven = true;
        add(RaasAdvisory.OnTaxiway, ['onTaxiway', 'pause', 'onTaxiway']);
      }
    } else if (inputs.groundSpeed < 30) {
      this.onTaxiwayGiven = false;
    }

    // Approaching Runway on ground (4.2.2)
    if (inputs.groundSpeed < 40) {
      this.updateApproachingOnGround(inputs, runways, now, add);
    }
  }

  /** Extended holding on runway: along-track movement under 100 ft during the holding time (4.3.5) */
  private updateExtendedHolding(
    occupancy: RunwayOccupancy,
    end: AwarenessRunwayEnd,
    now: number,
    add: (advisory: RaasAdvisory, words: RaasWord[]) => void,
  ): void {
    if (this.config.extendedHoldingInitial === null || occupancy.rejectedTakeoff || occupancy.rollMode !== null) {
      return;
    }
    if (!(Math.abs(this.deckPos.along - occupancy.holdAlong) <= 100 / FT_PER_M)) {
      occupancy.holdAlong = this.deckPos.along;
      occupancy.holdSince = now;
      occupancy.holdNextCallout = now + this.config.extendedHoldingInitial * 1_000;
      return;
    }
    if (now >= occupancy.holdNextCallout) {
      const ident = Raas.runwayWords(end);
      add(RaasAdvisory.ExtendedHolding, ['onRunway', ...ident, 'pause', 'onRunway', ...ident]);
      occupancy.holdNextCallout =
        this.config.extendedHoldingRepeat === null ? Infinity : now + this.config.extendedHoldingRepeat * 1_000;
    }
  }

  private updateApproachingOnGround(
    inputs: RaasInputs,
    runways: readonly AwarenessRunway[],
    now: number,
    add: (advisory: RaasAdvisory, words: RaasWord[]) => void,
  ): void {
    // The advisory distance: 1.5 runway widths from the edge at very low speed, farther as the ground speed increases
    const leadDistance = inputs.groundSpeed * KT_TO_MPS * 5;
    const newRunways: { runway: AwarenessRunway; endIndex: 0 | 1 }[] = [];

    for (const runway of runways) {
      const key = AwarenessRunwayGeometry.key(runway);
      this.toDeckFrame(runway, inputs);
      if (key === this.occupancy?.key) {
        this.approachLatches.set(key, now);
        continue;
      }
      const advisoryDistance = 1.5 * runway.width + leadDistance;
      const distance = AwarenessRunwayGeometry.distanceToEnter(runway, this.deckPos, inputs.trueHeading);
      if (distance !== null && distance > 0 && distance <= advisoryDistance + 50) {
        if (!this.approachLatches.has(key) && distance <= advisoryDistance) {
          // The runway end nearest to where the aircraft enters the runway
          const relative = ((inputs.trueHeading - runway.ends[0].course) * Math.PI) / 180;
          const entryAlong = this.deckPos.along + distance * Math.cos(relative);
          newRunways.push({ runway, endIndex: entryAlong <= 0 ? 0 : 1 });
          this.approachLatches.set(key, now);
        } else if (this.approachLatches.has(key)) {
          this.approachLatches.set(key, now);
        }
      }
    }

    for (const [key, lastQualified] of this.approachLatches) {
      if (now - lastQualified > 5_000) {
        this.approachLatches.delete(key);
      }
    }

    if (newRunways.length > 1) {
      add(RaasAdvisory.ApproachingRunwayOnGround, ['approaching', 'runways']);
    } else if (newRunways.length === 1) {
      const { runway, endIndex } = newRunways[0];
      add(RaasAdvisory.ApproachingRunwayOnGround, ['approaching', ...Raas.runwayWords(runway.ends[endIndex])]);
    }
  }

  private updateInAir(
    inputs: RaasInputs,
    runways: readonly AwarenessRunway[],
    add: (advisory: RaasAdvisory, words: RaasWord[]) => void,
  ): void {
    if (inputs.radioAltitude > 1_000) {
      // A new approach
      this.airApproachGiven.clear();
      this.airApproachRunwaysGiven = false;
      this.airShortCautionGiven.clear();
    }

    // Approaching Runway in air (4.2.1), approaching short runway (4.3.1) and its caution (4.3.2)
    const candidates: { runway: AwarenessRunway; end: AwarenessRunwayEnd; heightAbove: number }[] = [];
    let linedUp = false;
    for (const runway of runways) {
      AwarenessRunwayGeometry.toRunwayFrame(runway, inputs.latitude, inputs.longitude, 0, 0, this.pos);
      const endIndex = AwarenessRunwayGeometry.alignedEnd(runway, inputs.trueTrack, ALIGNMENT_TOLERANCE);
      if (endIndex === null || Math.abs(this.pos.cross) > runway.width + LATERAL_MARGIN_M) {
        continue;
      }
      const end = runway.ends[endIndex];
      const fromThreshold =
        AwarenessRunwayGeometry.distanceFromStart(runway, endIndex, this.pos) - end.displacedThreshold;
      if (fromThreshold < -3 * NM_M || fromThreshold > runway.length) {
        continue;
      }
      linedUp = true;
      const heightAbove = inputs.altitude - end.elevation * FT_PER_M;
      if (fromThreshold <= 0 && heightAbove >= 300 && heightAbove <= 750) {
        candidates.push({ runway, end, heightAbove });
      }
    }

    const [windowUpper, windowLower] = this.config.suppressWindow;
    const inWindow = (heightAbove: number) => heightAbove <= windowUpper && heightAbove > windowLower;
    if (candidates.length > 1) {
      if (!this.airApproachRunwaysGiven && !candidates.some((c) => inWindow(c.heightAbove))) {
        this.airApproachRunwaysGiven = true;
        add(RaasAdvisory.ApproachingRunwayInAir, ['approaching', 'runways']);
      }
    } else if (candidates.length === 1) {
      const { runway, end, heightAbove } = candidates[0];
      const key = `${AwarenessRunwayGeometry.key(runway)}${end.ident}`;
      const available = runway.length - end.displacedThreshold;
      const short = this.config.landingNominalLength !== null && available < this.config.landingNominalLength;
      if (!this.airApproachGiven.has(key) && !inWindow(heightAbove)) {
        this.airApproachGiven.add(key);
        if (short) {
          add(RaasAdvisory.ApproachingShortRunwayInAir, [
            'approaching',
            ...Raas.runwayWords(end),
            ...this.distanceWords(available),
            'available',
          ]);
        } else {
          add(RaasAdvisory.ApproachingRunwayInAir, ['approaching', ...Raas.runwayWords(end)]);
        }
      } else if (
        short &&
        this.airApproachGiven.has(key) &&
        !this.airShortCautionGiven.has(key) &&
        heightAbove <= windowLower
      ) {
        this.airShortCautionGiven.add(key);
        add(RaasAdvisory.CautionShortRunwayInAir, ['caution', 'shortRunway', 'pause', 'shortRunway']);
      }
    }

    // Taxiway landing: 150 to 250 ft, not climbing, within 5 NM of a runway but not lined up with one (4.3.8)
    if (inputs.radioAltitude > 500) {
      this.taxiwayLandingGiven = false;
    } else if (
      !this.taxiwayLandingGiven &&
      !linedUp &&
      inputs.radioAltitude >= 150 &&
      inputs.radioAltitude <= 250 &&
      inputs.verticalSpeed < 450 &&
      this.anyRunwayWithin(runways, inputs, 5 * NM_M)
    ) {
      this.taxiwayLandingGiven = true;
      add(RaasAdvisory.TaxiwayLanding, ['caution', 'taxiway', 'pause', 'caution', 'taxiway']);
    }
  }

  /**
   * Distance remaining at landing (4.2.4) and at a rejected takeoff (4.3.7): on the last half of the runway, at each
   * whole 1000 ft (last one 500 ft), or each 300 m (last one 100 m).
   */
  private updateDistanceRemaining(inputs: RaasInputs, add: (advisory: RaasAdvisory, words: RaasWord[]) => void): void {
    const occupancy = this.occupancy;
    if (!occupancy || occupancy.rollMode === null) {
      return;
    }
    const active =
      occupancy.rollMode === 'landing'
        ? inputs.onGround
          ? inputs.groundSpeed > 40
          : inputs.radioAltitude < 100 && inputs.verticalSpeed < 450
        : occupancy.rejectedTakeoff && inputs.groundSpeed > 40;
    const endIndex = AwarenessRunwayGeometry.alignedEnd(
      occupancy.runway,
      inputs.onGround ? inputs.trueHeading : inputs.trueTrack,
      ALIGNMENT_TOLERANCE,
    );
    if (!active || endIndex === null) {
      return;
    }

    this.toDeckFrame(occupancy.runway, inputs);
    const remaining = this.toUnit(AwarenessRunwayGeometry.distanceToEnd(occupancy.runway, endIndex, this.deckPos));
    const lastHalf = this.toUnit(occupancy.runway.length) / 2;
    let mark: number | null = null;
    for (const m of this.marks()) {
      if (m <= lastHalf && remaining <= m && m < occupancy.lastMark && (mark === null || m < mark)) {
        mark = m;
      }
    }
    if (mark !== null) {
      occupancy.lastMark = mark;
      add(RaasAdvisory.DistanceRemaining, [...Raas.numberWords(mark), 'remaining']);
    }
  }

  private startRoll(mode: 'takeoff' | 'landing', inputs: RaasInputs): void {
    const occupancy = this.occupancy!;
    occupancy.rollMode = mode;
    occupancy.maxGroundSpeed = inputs.groundSpeed;
    occupancy.lastMark = Infinity;
    if (mode === 'landing') {
      const endIndex = AwarenessRunwayGeometry.alignedEnd(occupancy.runway, inputs.trueTrack, ALIGNMENT_TOLERANCE);
      if (endIndex !== null) {
        this.toDeckFrame(occupancy.runway, inputs);
        occupancy.lastMark = this.nextMarkAbove(
          AwarenessRunwayGeometry.distanceToEnd(occupancy.runway, endIndex, this.deckPos),
        );
      }
    }
  }

  /** The smallest distance remaining mark above a distance, so that the marks already passed are not issued late */
  private nextMarkAbove(remainingMetres: number): number {
    const remaining = this.toUnit(remainingMetres);
    let next = Infinity;
    for (const m of this.marks()) {
      if (m > remaining && m < next) {
        next = m;
      }
    }
    return next;
  }

  /** The distance remaining marks, in the callout unit (the last half of the longest runways is under 9000 ft) */
  private marks(): readonly number[] {
    return this.config.distanceUnit === 'feet' ? Raas.MARKS_FT : Raas.MARKS_M;
  }

  private static readonly MARKS_FT = [500, 1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000];

  private static readonly MARKS_M = [100, 300, 600, 900, 1_200, 1_500, 1_800, 2_100, 2_400, 2_700, 3_000];

  private toUnit(metres: number): number {
    return this.config.distanceUnit === 'feet' ? metres * FT_PER_M : metres;
  }

  /** A runway length, to the nearest 100 ft or 100 m */
  private distanceWords(metres: number): RaasWord[] {
    return Raas.numberWords(Math.round(this.toUnit(metres) / 100) * 100);
  }

  private anyRunwayWithin(runways: readonly AwarenessRunway[], inputs: RaasInputs, distance: number): boolean {
    return runways.some((runway) => {
      AwarenessRunwayGeometry.toRunwayFrame(runway, inputs.latitude, inputs.longitude, 0, 0, this.pos);
      return AwarenessRunwayGeometry.distanceToRunway(runway, this.pos) <= distance;
    });
  }

  private toDeckFrame(runway: AwarenessRunway, inputs: RaasInputs): void {
    AwarenessRunwayGeometry.toRunwayFrame(
      runway,
      inputs.latitude,
      inputs.longitude,
      this.config.flightDeckOffset,
      inputs.trueHeading,
      this.deckPos,
    );
  }

  /** A runway ident, digit by digit: "Two-Five-Right", "Zero-Four" */
  public static runwayWords(end: AwarenessRunwayEnd): RaasWord[] {
    const words: RaasWord[] = [DIGITS[Math.floor(end.number / 10)], DIGITS[end.number % 10]];
    if (end.designator === 'L') {
      words.push('left');
    } else if (end.designator === 'R') {
      words.push('right');
    } else if (end.designator === 'C') {
      words.push('center');
    }
    return words;
  }

  /** A multiple of 100 from 100 to 9900: "Three-Thousand-Eight-Hundred", "Five-Hundred" */
  public static numberWords(value: number): RaasWord[] {
    const hundreds = Math.min(99, Math.max(1, Math.round(value / 100)));
    const words: RaasWord[] = [];
    if (hundreds >= 10) {
      words.push(DIGITS[Math.floor(hundreds / 10)], 'thousand');
    }
    if (hundreds % 10 !== 0) {
      words.push(DIGITS[hundreds % 10], 'hundred');
    }
    return words;
  }
}
