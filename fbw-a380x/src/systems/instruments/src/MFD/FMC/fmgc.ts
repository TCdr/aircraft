// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { Fmgc, GuidanceController } from '@fmgc/guidance/GuidanceController';

import { FlapConf } from '@fmgc/guidance/vnav/common';
import { SpeedLimit } from '@fmgc/guidance/vnav/SpeedLimit';
import { FmgcFlightPhase } from '@shared/flightphase';
import {
  EventBus,
  MappedSubject,
  MutableSubscribable,
  Subject,
  Subscribable,
  SubscribableUtils,
  Subscription,
} from '@microsoft/msfs-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { Arinc429LocalVarConsumerSubject, Arinc429Word, Fix, Runway, Units } from '@flybywiresim/fbw-sdk';
import { Feet } from 'msfs-geo';
import { minGw } from '@shared/PerformanceConstants';
import { A380AircraftConfig, A380EconParameters } from '@fmgc/flightplanning/A380AircraftConfig';
import { EconSpeeds, isaDeviationAt } from '@fmgc/guidance/vnav/EconSpeeds';
import { applyRtaSpeedBias, RtaSpeedEnvelope, rtaSpeedEnvelope } from '@fmgc/guidance/vnav/rta/RtaSpeedBias';
import type { EconSpeedSet } from '@fmgc/guidance/vnav/EconSpeeds';
import { FqmsBusEvents } from '@shared/publishers/FqmsBusPublisher';
import { qnhToMillibar } from '../shared/QnhUtils';
import { grossWeightCgFromFqmsOrWbbc } from './GrossWeightCgSource';
import { A380EconSpeedCache, DescentEconSpeedFreeze } from './A380EconSpeeds';
import { a380GreenDotSpeed } from './CruiseSpeeds';
import type { InsertedAlternateRoute } from './AlternateCompanyRoute';
import type { SecondaryFlightPlanPredictions } from '@fmgc/guidance/vnav/SecondaryFlightPlanPredictions';
import type { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';

export enum TakeoffPowerSetting {
  TOGA = 0,
  FLEX = 1,
  DERATED = 2,
}

/** The derated takeoff levels (FCOM DSC-70-20-40 l.111564-111565), as the index of the MFD list */
export enum TakeoffDerated {
  D04 = 0,
  D08 = 1,
  D12 = 2,
  D16 = 3,
  D20 = 4,
  D24 = 5,
}

export enum TakeoffPacks {
  OFF_APU = 0,
  ON = 1,
}

export enum TakeoffAntiIce {
  OFF = 0,
  ENG_ONLY = 1,
  ENG_WINGS = 2,
}

export enum CostIndexMode {
  LRC = 0,
  ECON = 1,
}

export enum ClimbDerated {
  NONE = 0,
  D01 = 1,
  D02 = 2,
  D03 = 3,
  D04 = 4,
  D05 = 5,
}

export const LOWEST_FUEL_ESTIMATE_KGS = Units.poundToKilogram(A380AircraftConfig.vnavConfig.LOWEST_FUEL_ESTIMATE);

/**
 * Temporary place for data which is found nowhere else. Not associated to flight plans right now, which should be the case for some of these values
 */
export class FmgcData {
  static fmcFormatValue(sub: Subscribable<number | null>, numberDashes = 3) {
    return sub.map((it) => (it !== null ? it.toFixed(0) : '-'.repeat(numberDashes)));
  }

  private readonly companyRouteIdents = new Map<FlightPlanIndex, Subject<string | null>>();

  /** The ident of the company route inserted into a flight plan, null when none (INIT page CPNY RTE field). */
  public companyRouteIdent(planIndex: FlightPlanIndex): Subject<string | null> {
    let ident = this.companyRouteIdents.get(planIndex);
    if (!ident) {
      ident = Subject.create<string | null>(null);
      this.companyRouteIdents.set(planIndex, ident);
    }
    return ident;
  }

  private readonly alternateCompanyRoutes = new Map<FlightPlanIndex, Subject<InsertedAlternateRoute | null>>();

  /** The alternate company route inserted into a flight plan, null when none (INIT page ALTN RTE field). */
  public alternateCompanyRoute(planIndex: FlightPlanIndex): Subject<InsertedAlternateRoute | null> {
    let route = this.alternateCompanyRoutes.get(planIndex);
    if (!route) {
      route = Subject.create<InsertedAlternateRoute | null>(null);
      this.alternateCompanyRoutes.set(planIndex, route);
    }
    return route;
  }

  /**
   * FUEL PLANNING: the trial BLOCK fuel (tonnes) that the predictions of the active flight plan use as fuel on board
   * while no BLOCK is entered (FlightManagementComputer.updateFuelPlanning).
   */
  public readonly fuelPlanningTrialBlockFuel = Subject.create<number | null>(null);

  /**
   * JTSN GW (kg): the gross weight the FQMS stops the fuel jettison at (A380 FCOM DSC-22-FMS-20-30 FUEL&LOAD page,
   * DSC-28-40 Fuel Jettison), sent to the FQMS as L:A380X_FMS_JETTISON_GW.
   */
  public readonly jettisonGrossWeight = Subject.create<number | null>(null);

  public readonly flightPhase = Subject.create(FmgcFlightPhase.Preflight);

  public readonly atcCallsign = Subject.create<string | null>(null);

  public readonly tripFuelAtPreflight = Subject.create<number | null>(null); // in tonnes

  public readonly destEfobBelowMinInActive = Subject.create(false);

  /**
   * For which departure runway the v speeds have been inserted
   */
  public readonly vSpeedsForRunway = Subject.create<string | null>(null);

  /**
   * V1 speed, to be confirmed after rwy change
   */
  readonly v1ToBeConfirmed = Subject.create<Knots | null>(null);

  /**
   * VR speed, to be confirmed after rwy change
   */
  readonly vrToBeConfirmed = Subject.create<Knots | null>(null);

  /**
   * V2 speed, to be confirmed after rwy change
   */
  readonly v2ToBeConfirmed = Subject.create<Knots | null>(null);

  public readonly flapRetractionSpeed = Subject.create<Knots | null>(null);

  public readonly slatRetractionSpeed = Subject.create<Knots | null>(null);

  public readonly greenDotSpeed = Subject.create<Knots | null>(null);

  public readonly approachGreenDotSpeed = Subject.create<Knots | null>(null);

  public readonly approachSlatRetractionSpeed = Subject.create<Knots | null>(null);

  public readonly approachFlapRetractionSpeed = Subject.create<Knots | null>(null);

  /** in feet. null if not set. */
  public readonly climbPredictionsReferencePilotEntry = Subject.create<number | null>(null);

  /** in feet. null if not set. */
  public readonly climbPredictionsReferenceAutomatic = Subject.create<number | null>(null);

  public readonly climbPredictionsReference = MappedSubject.create(
    ([calc, pe]) => (pe !== null ? pe : calc),
    this.climbPredictionsReferenceAutomatic,
    this.climbPredictionsReferencePilotEntry,
  );

  public readonly climbPredictionsReferenceIsPilotEntered = this.climbPredictionsReferencePilotEntry.map(
    (it) => it !== null,
  );

  public readonly approachVapp = Subject.create<Knots | null>(null);

  public readonly approachVref = Subject.create<Knots | null>(null);

  public readonly approachVls = Subject.create<Knots | null>(null);

  public readonly positionMonitorFix = Subject.create<Fix | null>(null);

  /**
   * Estimated take-off time, in seconds. Displays as HH:mm:ss. Null if not set
   */
  public readonly estimatedTakeoffTime = Subject.create<number | null>(null);

  /** Indicates OEI situation */
  public readonly engineOut = Subject.create(false);

  /** Fuel Penalty Factor in percentage between none and 999. Reset at done phase
   */
  public readonly fuelPenaltyPercentage = Subject.create<number | null>(null);

  public readonly fuelPenaltyActive = this.fuelPenaltyPercentage.map((v) => v !== null && v > 0);

  private static readonly DEFAULT_SETTINGS = new FmgcData();

  /**
   *
   * @param dueToDonePhase indicates wheter to reset all fmgs data or only data which is wiped at DONE phase
   */
  public reset(dueToDonePhase?: boolean): void {
    for (const key in FmgcData.DEFAULT_SETTINGS) {
      const prop = key as keyof FmgcData;
      if (SubscribableUtils.isMutableSubscribable(this[prop])) {
        (this[prop] as MutableSubscribable<any>).set((FmgcData.DEFAULT_SETTINGS[prop] as Subscribable<any>).get());
      }
    }
    if (dueToDonePhase) {
      this.fuelPenaltyPercentage.set(null);
    }
  }
}

/**
 * Implementation of Fmgc interface.
 */
export class FmgcDataService implements Fmgc {
  public data = new FmgcData();
  private subs: Subscription[] = [];

  public guidanceController: GuidanceController | undefined = undefined;

  public secondaryPredictions: SecondaryFlightPlanPredictions | undefined = undefined;

  private readonly sub = this.bus.getSubscriber<FqmsBusEvents>();

  /**
   * @param forPlan a flight plan
   * @returns the predictions at its legs (by leg index): the active VNAV profile for the active flight plan, the
   * secondary flight plan predictions for SEC 1-3; null for the others or when not computed
   */
  getWaypointPredictions(forPlan = FlightPlanIndex.Active): ReadonlyMap<number, VerticalWaypointPrediction> | null {
    if (forPlan === FlightPlanIndex.Active) {
      return this.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions ?? null;
    }
    return forPlan >= FlightPlanIndex.FirstSecondary
      ? this.secondaryPredictions?.waypointPredictions(forPlan) ?? null
      : null;
  }

  /**
   * @param forPlan a flight plan
   * @returns the predictions at its destination (see getWaypointPredictions), null when not computed
   */
  getDestinationPrediction(forPlan = FlightPlanIndex.Active): VerticalWaypointPrediction | null {
    if (forPlan === FlightPlanIndex.Active) {
      return this.guidanceController?.vnavDriver?.getDestinationPrediction() ?? null;
    }
    return forPlan >= FlightPlanIndex.FirstSecondary
      ? this.secondaryPredictions?.destinationPrediction(forPlan) ?? null
      : null;
  }

  /**
   * A secondary flight plan created on its INIT page (not copied from the active one) has its predictions computed with
   * the aircraft on ground before engine start.
   * @param forPlan a flight plan
   * @returns whether its predictions start on ground before engine start, whatever the aircraft does
   */
  isPlanIndependentOfAircraft(forPlan = FlightPlanIndex.Active): boolean {
    return (
      forPlan >= FlightPlanIndex.FirstSecondary &&
      this.flightPlanService.has(forPlan) &&
      !this.flightPlanService.get(forPlan).isActiveOrCopiedFromActive()
    );
  }

  /**
   * @param forPlan a flight plan
   * @returns the fuel on board the predictions of that flight plan start with, in tonnes
   */
  getPredictionStartFob(forPlan = FlightPlanIndex.Active): number | null {
    return this.isPlanIndependentOfAircraft(forPlan)
      ? this.flightPlanService.get(forPlan).performanceData.blockFuel.get()
      : this.getFOB(forPlan);
  }

  private readonly fqmsFob = Arinc429LocalVarConsumerSubject.create(this.sub.on('fqms_total_fuel_on_board'));
  private readonly fqmsGw = Arinc429LocalVarConsumerSubject.create(this.sub.on('fqms_gross_weight'));
  private readonly fqmsGwCg = Arinc429LocalVarConsumerSubject.create(this.sub.on('fqms_center_of_gravity_mac'));
  private readonly wbbcGwCg = Arinc429LocalVarConsumerSubject.create(this.sub.on('wbbc_center_of_gravity_mac'));

  private readonly econSpeedCaches = new Map<FlightPlanIndex, A380EconSpeedCache>();

  private readonly activePlanDescentFreeze = new DescentEconSpeedFreeze();

  /** Speed bias of the RTA speed control on the managed speeds of the active flight plan (0: ECON speeds) */
  public rtaSpeedBias = 0;

  constructor(
    private readonly bus: EventBus,
    private flightPlanService: FlightPlanService,
  ) {
    this.subs.push(this.fqmsFob, this.fqmsGw, this.fqmsGwCg, this.wbbcGwCg);
  }

  public destroy() {
    this.subs.forEach((s) => s.destroy());
  }

  /** in tons */
  getZeroFuelWeight(forPlan = FlightPlanIndex.Active): number {
    const zfw = this.flightPlanService.get(forPlan).performanceData.zeroFuelWeight.get() ?? minGw / 1_000;
    return zfw;
  }

  /** in tons */
  public getGrossWeight(forPlan = FlightPlanIndex.Active): number | null {
    // Value received from FQMS, or falls back to entered ZFW + entered FOB.
    // TODO how does this work for secondary plans?
    const fqmsGw = this.fqmsGw.get();
    if (fqmsGw.isNormalOperation()) {
      return fqmsGw.value / 1_000;
    }
    const zfw = this.flightPlanService.get(forPlan).performanceData.zeroFuelWeight.get();
    const fob = this.getFOB(forPlan);

    if (zfw == null || fob === null) {
      return null;
    }

    return zfw + fob;
  }

  /** in kilograms */
  public getGrossWeightKg(forPlan = FlightPlanIndex.Active): number | null {
    const gw = this.getGrossWeight(forPlan);
    return gw ? gw * 1_000 : null;
  }

  /**
   * The center of gravity is calculated by the FQMS.
   * If it is not available then the value computed by the WBBC is returned.
   * If neither the FQMS nor the WBBC provide any value then `null` is returned.
   *
   * @returns the gross weight center of gravity in %
   */
  public getGrossWeightCg(): number | null {
    // Value received from FQMS, or falls back to value from WBBC (CpiomF/WeightBalanceBackup)
    return grossWeightCgFromFqmsOrWbbc(this.fqmsGwCg.get(), this.wbbcGwCg.get());
  }

  /**
   *
   * @returns fuel on board in tonnes (i.e. 1000 x kg)
   */
  getFOB(forPlan = FlightPlanIndex.Active): number | null {
    const usefqms = this.isAnEngineOn();
    let fob: number | null = null;
    if (usefqms) {
      const fqmsFob = this.fqmsFob.get().valueOr(null);
      fob = fqmsFob !== null ? fqmsFob / 1000 : null;
    } else {
      fob =
        this.flightPlanService.get(forPlan).performanceData.blockFuel.get() ??
        (forPlan === FlightPlanIndex.Active ? this.data.fuelPlanningTrialBlockFuel.get() : null);
    }
    return fob;
  }

  /** in knots */
  getV2Speed(): number {
    return this.flightPlanService.has(FlightPlanIndex.Active)
      ? this.flightPlanService.active.performanceData.v2.get() ?? 150
      : 150;
  }

  /** in feet */
  getTropoPause(): number | null {
    return this.flightPlanService.active.performanceData.tropopause.get();
  }

  /**
   * ECON speeds of a flight plan, from its cost index, cruise level, weights, CRZ TEMP and, in cruise, the measured
   * temperature and wind.
   * @returns the speeds, or null without cost index, cruise level or gross weight
   */
  private getEconSpeeds(forPlan: FlightPlanIndex): EconSpeedSet | null {
    if (!this.flightPlanService.has(forPlan)) {
      return null;
    }
    const isActivePlan = forPlan === FlightPlanIndex.Active;
    if (isActivePlan) {
      return this.activePlanDescentFreeze.get(this.getFlightPhase() >= FmgcFlightPhase.Descent, () =>
        this.withRtaSpeedBias(this.computeEconSpeeds(forPlan)),
      );
    }
    return this.computeEconSpeeds(forPlan);
  }

  /** The managed speeds of the active flight plan: the ECON speeds moved by the RTA speed bias */
  private withRtaSpeedBias(econ: EconSpeedSet | null): EconSpeedSet | null {
    const hasRta = this.flightPlanService.active.performanceData.timeConstraint.get() !== null;
    const envelope = econ && hasRta ? this.activeRtaSpeedEnvelope() : null;
    return econ && envelope ? applyRtaSpeedBias(econ, this.rtaSpeedBias, envelope) : econ;
  }

  /** The ECON speeds and the RTA speed range of the active flight plan, for the RTA speed control */
  public activeRtaSpeedRange(): { econ: EconSpeedSet; envelope: RtaSpeedEnvelope } | null {
    if (!this.flightPlanService.has(FlightPlanIndex.Active)) {
      return null;
    }
    const econ = this.computeEconSpeeds(FlightPlanIndex.Active);
    const envelope = econ ? this.activeRtaSpeedEnvelope() : null;
    return econ && envelope ? { econ, envelope } : null;
  }

  /** The RTA speed range of the active flight plan: green dot to the VMO/MMO margins of the ECON speeds */
  private activeRtaSpeedEnvelope(): RtaSpeedEnvelope | null {
    const pd = this.flightPlanService.active.performanceData;
    const cruiseFlightLevel = pd.cruiseFlightLevel.get();
    const grossWeight = this.getGrossWeight();
    if (cruiseFlightLevel === null || grossWeight === null) {
      return null;
    }
    const cruiseAltitude = cruiseFlightLevel * 100;
    const zeroFuelWeight = pd.zeroFuelWeight.get();
    const destinationFuel = this.getDestEFOB(true);
    const descentWeight =
      zeroFuelWeight !== null && destinationFuel !== null ? zeroFuelWeight + destinationFuel : grossWeight;
    const segmentAltitude = EconSpeeds.speedSegmentAltitude(cruiseAltitude);
    return rtaSpeedEnvelope(A380EconParameters, cruiseAltitude, pd.tropopause.get(), {
      climb: a380GreenDotSpeed(segmentAltitude, grossWeight),
      cruise: a380GreenDotSpeed(cruiseAltitude, grossWeight),
      descent: a380GreenDotSpeed(segmentAltitude, descentWeight),
    });
  }

  private computeEconSpeeds(forPlan: FlightPlanIndex): EconSpeedSet | null {
    const isActivePlan = forPlan === FlightPlanIndex.Active;
    const phase = this.getFlightPhase();
    const pd = this.flightPlanService.get(forPlan).performanceData;
    const cruiseFlightLevel = pd.cruiseFlightLevel.get();
    const tropopause = pd.tropopause.get();
    const inCruise = isActivePlan && phase === FmgcFlightPhase.Cruise;
    const cruiseTemperature = pd.cruiseTemperature.get();
    let isaDeviation = 0;
    if (inCruise) {
      isaDeviation = isaDeviationAt(
        this.getPressureAlt() ?? SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet'),
        SimVar.GetSimVarValue('AMBIENT TEMPERATURE', 'celsius'),
        tropopause,
      );
    } else if (cruiseFlightLevel !== null && cruiseTemperature !== null) {
      isaDeviation = isaDeviationAt(cruiseFlightLevel * 100, cruiseTemperature, tropopause);
    }
    const zeroFuelWeight = pd.zeroFuelWeight.get();
    const destinationFuel = isActivePlan ? this.getDestEFOB(true, forPlan) : null;

    let cache = this.econSpeedCaches.get(forPlan);
    if (!cache) {
      cache = new A380EconSpeedCache();
      this.econSpeedCaches.set(forPlan, cache);
    }
    return cache.get({
      costIndex: pd.costIndex.get(),
      costIndexMode: pd.costIndexMode?.get() ?? null,
      cruiseFlightLevel,
      grossWeight: this.getGrossWeight(forPlan),
      descentWeight: zeroFuelWeight !== null && destinationFuel !== null ? zeroFuelWeight + destinationFuel : null,
      isaDeviation,
      cruiseHeadwind: inCruise ? -SimVar.GetSimVarValue('AIRCRAFT WIND Z', 'knots') : 0,
      tropopause,
    });
  }

  /** in knots */
  getManagedClimbSpeed(forPlan = FlightPlanIndex.Active): number {
    const econ = this.getEconSpeeds(forPlan);
    if (econ !== null) {
      return econ.climbSpeed;
    }
    const ci = this.flightPlanService.get(forPlan).performanceData.costIndex.get();
    if (ci !== null) {
      const dCI = (ci / 999) ** 2;
      return 290 * (1 - dCI) + 330 * dCI;
    }
    return 250;
  }

  /** in mach */
  getManagedClimbSpeedMach(forPlan = FlightPlanIndex.Active): number {
    return this.getEconSpeeds(forPlan)?.climbMach ?? 0.84;
  }

  /** in feet */
  getAccelerationAltitude(): number {
    return this.flightPlanService.has(FlightPlanIndex.Active)
      ? (this.flightPlanService?.active.performanceData.accelerationAltitude.get() as Feet)
      : 1_500;
  }

  /** in feet */
  getThrustReductionAltitude(): number {
    return this.flightPlanService.has(FlightPlanIndex.Active)
      ? (this.flightPlanService?.active.performanceData.thrustReductionAltitude.get() as Feet)
      : 1_500;
  }

  /** in feet. undefined if not set. */
  getOriginTransitionAltitude(): number | undefined {
    return this.flightPlanService.has(FlightPlanIndex.Active)
      ? (this.flightPlanService?.active.performanceData.transitionAltitude.get() as Feet)
      : undefined;
  }

  /** in feet. undefined if not set. */
  getDestinationTransitionLevel(): number | undefined {
    return this.flightPlanService.has(FlightPlanIndex.Active)
      ? (this.flightPlanService?.active.performanceData.transitionLevel.get() as Feet)
      : undefined;
  }

  getFlightPhase(): FmgcFlightPhase {
    return this.data.flightPhase.get();
  }

  /** in knots */
  getManagedCruiseSpeed(forPlan = FlightPlanIndex.Active): number {
    return this.getEconSpeeds(forPlan)?.cruiseSpeed ?? 310;
  }

  /** in mach */
  getManagedCruiseSpeedMach(forPlan = FlightPlanIndex.Active): number {
    return this.getEconSpeeds(forPlan)?.cruiseMach ?? 0.85;
  }

  getClimbSpeedLimit(fpIndex = FlightPlanIndex.Active): SpeedLimit | null {
    if (!this.flightPlanService.has(fpIndex)) {
      return null;
    }
    const performanceData = this.flightPlanService.get(fpIndex).performanceData;
    const speedLimitSpeed = performanceData.climbSpeedLimitSpeed.get();
    const speedLimitAltitude = performanceData.climbSpeedLimitAltitude.get();
    if (speedLimitSpeed && speedLimitAltitude) {
      return {
        speed: speedLimitSpeed,
        underAltitude: speedLimitAltitude,
      };
    }
    return null;
  }

  getDescentSpeedLimit(fpIndex = FlightPlanIndex.Active): SpeedLimit | null {
    if (!this.flightPlanService.has(fpIndex)) {
      return null;
    }
    const performanceData = this.flightPlanService.get(fpIndex).performanceData;
    const speedLimitSpeed = performanceData.descentSpeedLimitSpeed.get();
    const speedLimitAltitude = performanceData.descentSpeedLimitAltitude.get();
    if (speedLimitSpeed && speedLimitAltitude) {
      return {
        speed: speedLimitSpeed,
        underAltitude: speedLimitAltitude,
      };
    }
    return null;
  }

  /** in knots */
  getPreSelectedClbSpeed(): number {
    // FIXME fmgc interface should also accept null
    return this.flightPlanService?.active.performanceData.preselectedClimbSpeed.get() ?? 0;
  }

  /** in knots */
  getPreSelectedCruiseSpeed(): number {
    // FIXME fmgc interface should also accept null
    return this.flightPlanService?.active.performanceData.preselectedCruiseSpeed.get() ?? 0;
  }

  getTakeoffFlapsSetting(): FlapConf | undefined {
    return this.flightPlanService.active.performanceData.takeoffFlaps.get() ?? undefined;
  }

  /** in knots */
  getManagedDescentSpeed(forPlan = FlightPlanIndex.Active): number {
    const pd = this.flightPlanService.get(forPlan).performanceData;
    const preselectedDescentSpeed = pd.pilotManagedDescentSpeed.get();
    if (preselectedDescentSpeed !== null) {
      return preselectedDescentSpeed;
    }
    const econ = this.getEconSpeeds(forPlan);
    if (econ !== null) {
      return econ.descentSpeed;
    }
    if (this.flightPlanService.has(forPlan)) {
      const ci = pd.costIndex.get();
      if (ci !== null) {
        const dCI = ci / 999;
        return Math.round(288 * (1 - dCI) + 300 * dCI);
      }
    }
    return 300;
  }

  /** in mach */
  getManagedDescentSpeedMach(forPlan = FlightPlanIndex.Active): number {
    return (
      this.flightPlanService.get(forPlan).performanceData.pilotManagedDescentMach.get() ??
      this.getEconSpeeds(forPlan)?.descentMach ??
      0.84
    );
  }

  /** in knots */
  getApproachSpeed(): number {
    return this.data.approachVapp.get() ?? 0;
  }

  /** F speed in knots based on estimated landing weight, or 0 if it cannot be computed */
  getFlapRetractionSpeed(): number {
    return this.data.approachFlapRetractionSpeed.get() ?? 0;
  }

  /** S speed in knots based on estimated landing weight, or 0 if it cannot be computed */
  getSlatRetractionSpeed(): number {
    return this.data.approachSlatRetractionSpeed.get() ?? 0;
  }

  /** Green dot speed in knots based on estimated landing weight, or 0 if it cannot be computed */
  getCleanSpeed(): number {
    return this.data.approachGreenDotSpeed.get() ?? 0;
  }

  /** in knots */
  getTripWind(): number {
    return this.flightPlanService.active.performanceData.pilotTripWind.get() ?? 0;
  }

  /** in hPa */
  getApproachQnh(): number {
    return qnhToMillibar(this.flightPlanService.active.performanceData.approachQnh.get() ?? 1013.25);
  }

  /** in degrees celsius */
  getApproachTemperature(): number {
    return this.flightPlanService.active.performanceData.approachTemperature.get() ?? 0;
  }

  /** in tons */
  getDestEFOB(useFob: boolean, forPlan = FlightPlanIndex.Active): number | null {
    // Metric tons
    const efob = this.getDestinationPrediction(forPlan)?.estimatedFuelOnBoard; // in Pounds
    if (useFob && efob !== undefined) {
      // Before takeoff the predictions start from the FOB (BLOCK), which still holds the TAXI fuel: the fuel after
      // landing is BLOCK - TAXI - TRIP (A380 FCOM DSC-22-FMS-20-30 FUEL&LOAD page: EXTRA and LW deduct the TAXI)
      const taxiFuel =
        this.getFlightPhase() < FmgcFlightPhase.Takeoff || this.isPlanIndependentOfAircraft(forPlan)
          ? this.flightPlanService.get(forPlan).performanceData.taxiFuel.get() ?? 0
          : 0;
      return Units.poundToKilogram(efob) / 1000.0 - taxiFuel;
    }
    return null;
  }

  /** in tons */
  getAltEFOB(forPlan = FlightPlanIndex.Active): number | null {
    // TODO estimate alternate fuel

    const destEfob = this.getDestEFOB(true, forPlan);
    const alternateFuel = this.flightPlanService.get(forPlan).performanceData.alternateFuel.get();

    if (destEfob === null || alternateFuel === null) {
      return null;
    }
    return Math.max(destEfob - alternateFuel, LOWEST_FUEL_ESTIMATE_KGS / 1000);
  }

  /** in feet. null if not set */
  getDepartureElevation(): number | null {
    return this.flightPlanService.has(FlightPlanIndex.Active)
      ? this.flightPlanService?.active?.originRunway?.thresholdLocation?.alt ?? null
      : null;
  }

  /** in feet */
  getDestinationElevation(): number {
    return (
      this.flightPlanService?.active?.destinationRunway?.thresholdLocation?.alt ??
      this.flightPlanService?.active?.destinationAirport?.location?.alt ??
      0
    );
  }

  getDestinationRunway(): Runway | null {
    return this.flightPlanService.has(FlightPlanIndex.Active)
      ? this.flightPlanService?.active?.destinationRunway ?? null
      : null;
  }

  /** in nautical miles. null if not set */
  getDistanceToDestination(forPlan = FlightPlanIndex.Active): number | null {
    return this.guidanceController?.getAlongTrackDistanceToDestination(forPlan) ?? null;
  }

  /** In percentage. Null if not set */
  getPerformanceFactorPercent(): number | null {
    return this.data.fuelPenaltyPercentage.get(); // TODO add performance factor when implemented
  }

  /**
   * Generic function which returns true if engine(index) is ON (N2 > 20)
   * @returns {boolean}
   */
  public isEngineOn(index: number): boolean {
    return SimVar.GetSimVarValue(`L:A32NX_ENGINE_N2:${index}`, 'number') > 20;
  }

  /**
   * Returns true if any one engine is running (N2 > 20)
   */
  public isAnEngineOn(): boolean {
    return this.isEngineOn(1) || this.isEngineOn(2) || this.isEngineOn(3) || this.isEngineOn(4);
  }

  /**
   * Returns true only if all engines are running (N2 > 20 for all engines)
   */
  isAllEngineOn(): boolean {
    return this.isEngineOn(1) && this.isEngineOn(2) && this.isEngineOn(3) && this.isEngineOn(4);
  }

  isOnGround() {
    return (
      SimVar.GetSimVarValue('L:A32NX_LGCIU_1_NOSE_GEAR_COMPRESSED', 'Number') === 1 ||
      SimVar.GetSimVarValue('L:A32NX_LGCIU_2_NOSE_GEAR_COMPRESSED', 'Number') === 1
    );
  }

  isFlying() {
    return this.getFlightPhase() >= FmgcFlightPhase.Takeoff && this.getFlightPhase() < FmgcFlightPhase.Done;
  }

  getPressureAltAtElevation(elev: number, qnh = 1013.2) {
    const p0 = qnh < 500 ? 29.92 : 1013.2;
    return elev + 145442.15 * (1 - (qnh / p0) ** 0.190263);
  }

  getPressureAlt() {
    for (let n = 1; n <= 3; n++) {
      const zp = Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_ADR_${n}_ALTITUDE`);
      if (zp.isNormalOperation()) {
        return zp.value;
      }
    }
    return null;
  }

  getBaroCorrection1(): number {
    // FIXME hook up to ADIRU or FCU
    return Simplane.getPressureValue('millibar') ?? 1013.25;
  }
}
