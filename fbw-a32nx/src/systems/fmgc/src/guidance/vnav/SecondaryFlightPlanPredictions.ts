// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { EventBus, UnitType } from '@microsoft/msfs-sdk';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { AircraftConfig } from '@fmgc/flightplanning/AircraftConfigTypes';
import { Fmgc, GuidanceController } from '@fmgc/guidance/GuidanceController';
import { ConstraintReader } from '@fmgc/guidance/vnav/ConstraintReader';
import { VerticalProfileManager } from '@fmgc/guidance/vnav/VerticalProfileManager';
import { AircraftToDescentProfileRelation } from '@fmgc/guidance/vnav/descent/AircraftToProfileRelation';
import {
  VerticalProfileComputationParameters,
  VerticalProfileComputationParametersObserver,
} from '@fmgc/guidance/vnav/VerticalProfileComputationParameters';
import { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { SpeedLimit } from '@fmgc/guidance/vnav/SpeedLimit';

/**
 * The predictions of the secondary flight plans: the FMS computes them with the same rules and assumptions as those of
 * the active flight plan. A secondary flight plan copied from the active one starts from the current aircraft situation
 * (GW, FOB, position, time, guidance modes, AFS CP altitude, wind and temperature). One created on its INIT page is
 * independent of the active flight plan: its predictions consider the aircraft on ground before engine start.
 */

/** What the predictions of a secondary flight plan take from that flight plan */
export interface SecondaryPlanData {
  copiedFromActive: boolean;
  /** Tonnes */
  zeroFuelWeight: number | null;
  /** Tonnes: the FOB once the engines run (copies of the active flight plan), else the BLOCK fuel */
  fuelOnBoard: number | null;
  /** Feet */
  cruiseAltitude: number | null;
  originElevation: number | null;
  destinationElevation: number | null;
  originLocation: { lat: number; long: number } | null;
  managedSpeeds: Pick<
    VerticalProfileComputationParameters,
    | 'managedClimbSpeed'
    | 'managedClimbSpeedMach'
    | 'managedCruiseSpeed'
    | 'managedCruiseSpeedMach'
    | 'managedDescentSpeed'
    | 'managedDescentSpeedMach'
  >;
  climbSpeedLimit: SpeedLimit | null;
  descentSpeedLimit: SpeedLimit | null;
  v2Speed: number | null;
  accelerationAltitude: number | null;
  thrustReductionAltitude: number | null;
  transitionAltitude: number | null;
  preselectedClbSpeed: number | null;
  preselectedCruiseSpeed: number | null;
  takeoffFlaps: VerticalProfileComputationParameters['takeoffFlapsSetting'] | null;
  /** The DES CABIN RATE entered for this flight plan, ft/min (negative), null without an entry */
  descentCabinRate: number | null;
}

/**
 * @param active the computation parameters of the active flight plan (current aircraft situation)
 * @param plan the data of the secondary flight plan
 * @returns the computation parameters of the secondary flight plan predictions
 */
export function secondaryPlanParameters(
  active: VerticalProfileComputationParameters,
  plan: SecondaryPlanData,
): VerticalProfileComputationParameters {
  const onGroundBeforeEngineStart = !plan.copiedFromActive;
  const departureElevation = plan.originElevation ?? active.departureElevation;
  return {
    ...active,
    ...plan.managedSpeeds,
    // null without a speed limit, as for the active flight plan
    climbSpeedLimit: plan.climbSpeedLimit as SpeedLimit,
    descentSpeedLimit: plan.descentSpeedLimit as SpeedLimit,
    presentPosition:
      onGroundBeforeEngineStart && plan.originLocation
        ? new LatLongAlt(plan.originLocation.lat, plan.originLocation.long, departureElevation)
        : active.presentPosition,
    flightPhase: onGroundBeforeEngineStart ? FmgcFlightPhase.Preflight : active.flightPhase,
    // NaN where the flight plan has no value: no predictions (canComputeSecondaryPlanProfile)
    zeroFuelWeight: plan.zeroFuelWeight !== null ? UnitType.TONNE.convertTo(plan.zeroFuelWeight, UnitType.POUND) : NaN,
    fuelOnBoard: plan.fuelOnBoard !== null ? UnitType.TONNE.convertTo(plan.fuelOnBoard, UnitType.POUND) : NaN,
    // The cruise level is cleared in descent: a copy of the active flight plan keeps the last one, as the active does
    cruiseAltitude: plan.cruiseAltitude ?? (plan.copiedFromActive ? active.cruiseAltitude : NaN),
    departureElevation,
    destinationElevation: plan.destinationElevation ?? active.destinationElevation,
    v2Speed: plan.v2Speed ?? active.v2Speed,
    accelerationAltitude: plan.accelerationAltitude ?? active.accelerationAltitude,
    thrustReductionAltitude: plan.thrustReductionAltitude ?? active.thrustReductionAltitude,
    originTransitionAltitude: plan.transitionAltitude ?? active.originTransitionAltitude,
    preselectedClbSpeed: plan.preselectedClbSpeed ?? 0,
    preselectedCruiseSpeed: plan.preselectedCruiseSpeed ?? 0,
    takeoffFlapsSetting: plan.takeoffFlaps ?? active.takeoffFlapsSetting,
    // The descent fuel estimate of the active flight plan does not apply to another route
    estimatedDestinationFuel: plan.copiedFromActive ? active.estimatedDestinationFuel : null,
    descentCabinRate: plan.descentCabinRate,
  };
}

/**
 * @param parameters the computation parameters of a secondary flight plan
 * @returns what stops its predictions from being computed (the conditions of the active flight plan predictions)
 */
export function missingSecondaryPlanInputs(parameters: VerticalProfileComputationParameters): string[] {
  const missing: string[] = [];
  const approachSpeedsValid =
    parameters.cleanSpeed > 100 &&
    parameters.slatRetractionSpeed > 100 &&
    parameters.flapRetractionSpeed > 100 &&
    parameters.approachSpeed > 100;
  const takeoffParametersValid = parameters.thrustReductionAltitude > 0 && parameters.accelerationAltitude > 0;
  if (parameters.flightPhase <= FmgcFlightPhase.Takeoff && !takeoffParametersValid) {
    missing.push('takeoff altitudes');
  }
  if (!approachSpeedsValid) {
    missing.push('approach speeds');
  }
  if (!Number.isFinite(parameters.zeroFuelWeight)) {
    missing.push('ZFW');
  }
  if (!Number.isFinite(parameters.fuelOnBoard)) {
    missing.push('fuel on board');
  }
  if (!Number.isFinite(parameters.cruiseAltitude)) {
    missing.push('cruise level');
  }
  return missing;
}

/**
 * @param parameters the computation parameters of a secondary flight plan
 * @returns whether its predictions can be computed
 */
export function canComputeSecondaryPlanProfile(parameters: VerticalProfileComputationParameters): boolean {
  return missingSecondaryPlanInputs(parameters).length === 0;
}

/** The computation parameters of one secondary flight plan, for the shared VNAV path builders */
export class SecondaryPlanParametersObserver extends VerticalProfileComputationParametersObserver {
  private secondaryParameters: VerticalProfileComputationParameters | undefined;

  constructor(
    fmgc: Fmgc,
    plans: FlightPlanService,
    private readonly planIndex: number,
    private readonly activeObserver: VerticalProfileComputationParametersObserver,
    private readonly planData: (planIndex: number) => SecondaryPlanData,
  ) {
    super(fmgc, plans);
  }

  override update(): void {
    // The base class calls update() from its constructor, before this class has its fields
    if (!this.activeObserver) {
      return;
    }
    this.secondaryParameters = secondaryPlanParameters(this.activeObserver.get(), this.planData(this.planIndex));
  }

  override get(): VerticalProfileComputationParameters {
    return this.secondaryParameters!;
  }

  override canComputeProfile(): boolean {
    return this.secondaryParameters !== undefined && canComputeSecondaryPlanProfile(this.secondaryParameters);
  }
}

/** What an aircraft adds to the rules of the secondary flight plan predictions */
export interface SecondaryPredictionRules {
  /**
   * Whether the predictions of a secondary flight plan are computed now, kept as they are (the aircraft and the flight
   * plan diverged), or removed.
   */
  gate?(planIndex: number): 'compute' | 'freeze' | 'clear';
  /** Whether a computed prediction is displayed */
  keep?(prediction: VerticalWaypointPrediction): boolean;
}

/** The predictions of one secondary flight plan, at the legs (by leg index), for one version of that flight plan */
interface ComputedPredictions {
  planVersion: number;
  legs: Map<number, VerticalWaypointPrediction>;
  ageMs: number;
}

export class SecondaryFlightPlanPredictions {
  /**
   * Design choice: one secondary flight plan is looked at every 3 s in turn, and computed again when it changed, or when
   * its predictions are 30 s old (the aircraft situation and the entries of its pages change them). A full profile
   * computation for three more flight plans at the rate of the active one would cost too much.
   */
  private static readonly CHECK_PERIOD_MS = 3_000;

  private static readonly REFRESH_PERIOD_MS = 30_000;

  private readonly predictions = new Map<number, ComputedPredictions>();

  private readonly lastMissing = new Map<number, string>();

  private sinceLastCheckMs = 0;

  /** 0 for the first secondary flight plan */
  private nextSecondary = 0;

  constructor(
    private readonly bus: EventBus,
    private readonly flightPlanService: FlightPlanService,
    private readonly guidanceController: GuidanceController,
    private readonly acConfig: AircraftConfig,
    /** The computation parameters of one secondary flight plan, from those of the active flight plan */
    private readonly createObserver: (
      planIndex: number,
      activeObserver: VerticalProfileComputationParametersObserver,
    ) => VerticalProfileComputationParametersObserver,
    private readonly rules: SecondaryPredictionRules = {},
  ) {}

  public update(deltaTimeMs: number): void {
    for (const computed of this.predictions.values()) {
      computed.ageMs += deltaTimeMs;
    }
    this.sinceLastCheckMs += deltaTimeMs;
    if (this.sinceLastCheckMs < SecondaryFlightPlanPredictions.CHECK_PERIOD_MS) {
      return;
    }
    this.sinceLastCheckMs = 0;

    const count = this.acConfig.fpmConfig.NUM_SECONDARY_FLIGHT_PLANS;
    const planIndex = FlightPlanIndex.FirstSecondary + this.nextSecondary;
    this.nextSecondary = (this.nextSecondary + 1) % count;

    if (!this.flightPlanService.has(planIndex)) {
      this.predictions.delete(planIndex);
      return;
    }
    const gate = this.rules.gate?.(planIndex) ?? 'compute';
    if (gate === 'clear') {
      this.predictions.delete(planIndex);
      return;
    }
    const computed = this.predictions.get(planIndex);
    if (gate === 'freeze') {
      if (computed) {
        // The frozen predictions stay displayed through the edits that do not change what they were computed from
        computed.planVersion = this.flightPlanService.get(planIndex).version;
        computed.ageMs = 0;
      }
      return;
    }
    if (
      computed &&
      computed.planVersion === this.flightPlanService.get(planIndex).version &&
      computed.ageMs < SecondaryFlightPlanPredictions.REFRESH_PERIOD_MS
    ) {
      return;
    }
    try {
      this.compute(planIndex);
    } catch (e) {
      this.predictions.delete(planIndex);
      console.error('[FMS] Failed to compute the predictions of a secondary flight plan', e);
    }
  }

  public reset(): void {
    this.predictions.clear();
  }

  /**
   * @param planIndex a secondary flight plan
   * @returns its predictions at the legs (by leg index), null when not computed for its present version
   */
  public waypointPredictions(planIndex: number): Map<number, VerticalWaypointPrediction> | null {
    const computed = this.predictions.get(planIndex);
    return computed &&
      this.flightPlanService.has(planIndex) &&
      computed.planVersion === this.flightPlanService.get(planIndex).version
      ? computed.legs
      : null;
  }

  /**
   * @param planIndex a secondary flight plan
   * @returns its predictions at the destination, null when not computed
   */
  public destinationPrediction(planIndex: number): VerticalWaypointPrediction | null {
    const legs = this.waypointPredictions(planIndex);
    const destinationLegIndex = legs ? this.flightPlanService.get(planIndex).destinationLegIndex : null;
    return legs && destinationLegIndex !== null && destinationLegIndex >= 0
      ? legs.get(destinationLegIndex) ?? null
      : null;
  }

  /** The inputs a secondary flight plan lacks, logged once per change so a missing entry is not silent */
  private reportMissingInputs(planIndex: number, observer: VerticalProfileComputationParametersObserver): void {
    const parameters = observer.get();
    const reason = parameters ? missingSecondaryPlanInputs(parameters).join(', ') : 'parameters';
    if (this.lastMissing.get(planIndex) !== reason) {
      this.lastMissing.set(planIndex, reason);
      console.warn(`[FMS] No predictions for secondary flight plan ${planIndex}, missing: ${reason}`);
    }
  }

  private compute(planIndex: number): void {
    const plan = this.flightPlanService.get(planIndex);
    const geometry = this.guidanceController.getGeometryForFlightPlan(planIndex);
    if (!geometry || geometry.legs.size === 0) {
      this.predictions.delete(planIndex);
      return;
    }

    const observer = this.createObserver(
      planIndex,
      this.guidanceController.verticalProfileComputationParametersObserver,
    );
    observer.update();
    if (!observer.canComputeProfile()) {
      this.predictions.delete(planIndex);
      this.reportMissingInputs(planIndex, observer);
      return;
    }

    const constraintReader = new ConstraintReader(this.flightPlanService, this.guidanceController, planIndex);
    constraintReader.updateFlightPlan();
    const profileManager = new VerticalProfileManager(
      this.bus,
      this.flightPlanService,
      observer,
      this.guidanceController.atmosphericConditions,
      constraintReader,
      new AircraftToDescentProfileRelation(observer),
      this.acConfig,
    );
    profileManager.computeTacticalMcduPath();

    const profile = profileManager.mcduProfile;
    if (profile?.isReadyToDisplay) {
      const legs = new Map<number, VerticalWaypointPrediction>();
      for (const [legIndex, prediction] of profile.waypointPredictions) {
        if (this.rules.keep?.(prediction) ?? true) {
          legs.set(legIndex, prediction);
        }
      }
      this.predictions.set(planIndex, { planVersion: plan.version, legs, ageMs: 0 });
    } else {
      this.predictions.delete(planIndex);
    }
  }
}
