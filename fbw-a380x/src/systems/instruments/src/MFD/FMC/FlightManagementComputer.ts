// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FlightPlanService } from '@fmgc/flightplanning/FlightPlanService';
import { descentTargetWaypoints } from '@fmgc/performance/DescentTargetWaypoints';
import { GuidanceController } from '@fmgc/guidance/GuidanceController';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import {
  ArraySubject,
  ClockEvents,
  ConsumerSubject,
  EventBus,
  MappedSubject,
  SimVarValueType,
  Subject,
  Subscribable,
  SubscribableMapFunctions,
  Subscription,
} from '@microsoft/msfs-sdk';
import { A380AltitudeUtils } from '@shared/OperatingAltitudes';
import { maxCertifiedAlt, maxCertifiedFlightLevel } from '@shared/PerformanceConstants';
import { FmgcFlightPhase } from '@shared/flightphase';
import { FmcAircraftInterface } from './FmcAircraftInterface';
import { CostIndexMode, FmgcDataService, LOWEST_FUEL_ESTIMATE_KGS } from './fmgc';
import { FmcInterface, FmcOperatingModes } from './FmcInterface';
import {
  a380EfisRangeSettings,
  Airport,
  Arinc429SignStatusMatrix,
  DatabaseItem,
  EfisSide,
  Fix,
  FMMessage,
  ISimbriefData,
  logTroubleshootingError,
  NXDataStore,
  NXLogicPulseNode,
  RegisteredSimVar,
  Units,
  UpdateThrottler,
  VerticalPathCheckpoint,
  Waypoint,
  NearbyFacility,
  CompanyTakeoffDataLinkMessage,
  CompanyTakeoffDataRequestContent,
  CompanyTakeoffDataUplink,
  CompanyDatalinkDelay,
  answerFmsDescentDataRequests,
  answerFmsLandingDataRequests,
  FmsDescentDataContent,
  FmsLandingDataContent,
  fmsQnhToHectopascal,
  LandingConf,
  MathUtils,
} from '@flybywiresim/fbw-sdk';
import {
  isTypeIIMessage,
  McduMessage,
  NXFictionalMessages,
  NXSystemMessages,
  TypeIIMessage,
  TypeIMessage,
} from '../shared/NXSystemMessages';
import { HXLeg } from '@fmgc/guidance/lnav/legs/HX';
import {
  selectUnfoldedHolds,
  shiftDistanceForHolds,
  unfoldHoldsInProfile,
  unfoldHoldsInSymbols,
  VdHold,
  VdHoldCandidate,
} from './VdHoldUnfold';
import { DataManager, LatLonFormatType, PilotWaypoint } from '@fmgc/flightplanning/DataManager';
import { bearingTo, Coordinates } from 'msfs-geo';
import { isAlignReferenceLost } from './IrsAlignReference';
import { FmsDisplayInterface } from '@fmgc/flightplanning/interface/FmsDisplayInterface';
import { MfdDisplayInterface } from '../MFD';
import { FmcIndex } from './FmcServiceInterface';
import { uplinkedAlternateWindLevelDiffers } from '@fmgc/flightplanning/plans/AlternateCruiseLevel';
import { CompanyReplyHold } from './CompanyReplyHold';
import { CompanyRequestTimeout } from './CompanyRequestTimeout';
import { FmsErrorType } from '@fmgc/FmsError';
import { FpmConfigs } from '@fmgc/flightplanning/FpmConfig';
import { FlightPhaseManager, FlightPhaseManagerEvents } from '@fmgc/flightphase';
import { MfdUIData } from '../shared/MfdUIData';
import { ActiveUriInformation } from '../pages/common/MfdUiService';
import { A380FlightPlanPerformanceData } from '@fmgc/flightplanning/plans/performance/A380FlightPlanPerformanceData';
import { EfisInterface } from '@fmgc/efis/EfisInterface';
import { Navigation } from '@fmgc/navigation/Navigation';
import { A380_FM_POSITION_CONFIG } from '@fmgc/navigation/FmPosition';
import { EfisSymbols } from '@fmgc/efis/EfisSymbols';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { NavigationDatabase, NavigationDatabaseBackend } from '@fmgc/NavigationDatabase';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import { FlightPlanRpcServer } from '@fmgc/flightplanning/rpc/FlightPlanRpcServer';
import { ReadonlyFlightPlan } from '@fmgc/flightplanning/plans/ReadonlyFlightPlan';
import { VdAltitudeConstraint } from '../../MsfsAvionicsCommon/providers/MfdSurvPublisher';
import { MsfsFlightPlanSync } from '@fmgc/flightplanning/MsfsFlightPlanSync';
import { SimBriefUplinkAdapter } from '@fmgc/flightplanning/uplink/SimBriefUplinkAdapter';
import { FlightPlanChangeNotifier } from '@fmgc/flightplanning/sync/FlightPlanChangeNotifier';
import { FlightPlanUtils } from '@fmgc/flightplanning/FlightPlanUtils';
import { A380SpeedsUtils } from '@shared/OperatingSpeeds';
import { distanceToTopOfDescent } from '@fmgc/components/fms-messages/TopOfDescentDistance';
import { A380OptimumLevelCache } from './A380EconSpeeds';
import { isaDeviationAt } from '@fmgc/guidance/vnav/EconSpeeds';
import {
  createLevelAtmosphere,
  cruiseLevelAtmosphereInputsFromPlan,
  recMaxAtRouteTemperature,
} from '@fmgc/guidance/vnav/CruiseLevelAtmosphere';
import { CostIndexDefault } from './CostIndexDefault';
import { FmsTimeKeeper } from './FmsTimeKeeper';
import { clampFmcUpdateStep } from './FmcUpdateStep';
import { CompanyTakeoffData } from './CompanyTakeoffData';
import { TakeoffPowerSetting } from '@fmgc/flightplanning/plans/performance/FlightPlanPerformanceData';
import { FmsPrinter } from './FmsPrinter';
import { FmsAdvisoryMessages } from './FmsAdvisoryMessages';
import { CheckSpeedModeMessage } from './CheckSpeedModeMessage';
import { A380OptimumStepSearch } from './A380OptimumStep';
import { computeFlsBeam, flsBeamInputs, FlsBeamPublisher } from './FlsBeam';
import { VerticalWaypointPrediction } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { FmsVdSafetyAltitudes } from './FmsVdSafetyAltitudes';
import { SecondaryFlightPlanPredictions } from './SecondaryFlightPlanPredictions';
import { isVdCutAlongTrack } from '@shared/VdVerticalCut';
import { isValidA380FlightNumber } from '@fmgc/components/fms-messages/FmsMessageConditions';
import { deleteConstraintsAboveCruiseLevel } from '@fmgc/flightplanning/plans/CruiseLevelConstraints';
import { AtcRouteClearanceLoader } from './AtcRouteClearanceLoader';
import { NdInteractiveRevisions } from './NdInteractiveRevisions';
import { RejectedAtcElement } from './AtcRouteClearance';
import { allFmcInop, allFmcResetsPulled } from './FmcResetPanel';
import { FmsDatalinkConnection } from './FmsDatalinkConnection';
import { SequencedWaypointRecorder } from './SequencedWaypointRecorder';
import { TimeConstraint } from './TimeConstraint';
import { A380xRtaFunction } from './A380xRtaFunction';
import { A380xTimeMarkers } from './A380xTimeMarkers';
import { PilotStoredElements, StoredRoute } from './PilotStoredElements';
import { toCoRoute } from './StoredRouteUtils';
import { alternateRouteFixes } from './AlternateCompanyRoute';
import { CoRouteUplinkAdapter } from '@fmgc/flightplanning/uplink/CoRouteUplinkAdapter';
import { AtsuStatusCodes } from '@datalink/common';
import { AtsuToFmsEvents, FmsToAtsuEvents, WindUplinkResponse } from '@providers/FmsAtsuBusPublisher';
import { PendingWindUplinkParser } from '@fmgc/flightplanning/plans/PendingWindUplinkParser';
import { formatWindRequest } from '@fmgc/flightplanning/uplink/WindUplinkUtilts';
import { FmsToDatalinkSubsystemEvents } from '../../../../shared/src/publishers/A380XFmsAtcBusPublisher';
import { FlightPlanOperationEvents } from '@fmgc/events/FlightPlanOperationEvents';
import { ConstantMachSegmentAutoDeletion } from '@fmgc/flightplanning/ConstantMachSegmentAutoDeletion';
import { A380AnnouncedConstantMachDeletions } from '@fmgc/flightplanning/ConstantMachSegment';
import { FlightPlanEvents } from '@fmgc/flightplanning/sync/FlightPlanEvents';
import { engineFailureCreatesEngineOutSid } from './EngineOutSid';
import { writeTakeoffDerate } from '../shared/TakeoffDerate';

export interface FmsErrorMessage {
  message: McduMessage;
  messageText: string;
  backgroundColor: 'white' | 'amber' | 'cyan'; // Whether the message should be colored.
  cleared: boolean; // If message has been cleared from footer
  isResolvedOverride: () => boolean;
  onClearOverride: () => void;
}

export const FMS_CYCLE_TIME = 250; // ms
export const A380X_NUM_LEGS_ON_FPLN_PAGE = 9;

/*
 * Handles navigation (and potentially other aspects) for MFD pages
 */
export class FlightManagementComputer implements FmcInterface {
  protected readonly subs = [] as Subscription[];

  // TODO change after tracers PR
  private readonly healythSimvar = RegisteredSimVar.createBoolean(
    `L:A32NX_FMC_${this.instance === FmcIndex.FmcA ? 'A' : this.instance === FmcIndex.FmcB ? 'B' : 'C'}_IS_HEALTHY`,
  );

  private readonly ndMessageFlags: Record<'L' | 'R', number> = {
    L: 0,
    R: 0,
  };

  #mfdReference: (FmsDisplayInterface & MfdDisplayInterface) | null;

  get mfdReference() {
    return this.#mfdReference;
  }

  set mfdReference(value: (FmsDisplayInterface & MfdDisplayInterface) | null) {
    this.#mfdReference = value;

    if (value) {
      this.dataManager = new DataManager(this.bus, value, {
        latLonFormat: LatLonFormatType.ExtendedFormat,
        // A380 FCOM DSC-22-FMS-10-40-10 and DSC-22-FMS-20-30 P 117: 50 pilot-stored waypoints
        storedWaypointLimit: { max: 50, inUse: (waypoint) => this.isWaypointInFlightPlans(waypoint) },
      });
    }
  }

  get operatingMode(): FmcOperatingModes {
    // TODO amend once
    return this._operatingMode;
  }

  set operatingMode(mode: FmcOperatingModes) {
    this._operatingMode = mode;
  }

  #flightPlanService = new FlightPlanService<A380FlightPlanPerformanceData>(
    this.bus,
    new A380FlightPlanPerformanceData(),
    FpmConfigs.A380,
    this._operatingMode === FmcOperatingModes.Master, // TODO Dynamically change this within `FlightPlanService` (proxy things through to an RPC client?)
  );

  private readonly flightPhaseManager = new FlightPhaseManager(this.bus);

  #msfsFlightPlanSync: MsfsFlightPlanSync | undefined;

  #rpcServer: FlightPlanRpcServer | undefined;

  get flightPlanInterface() {
    return this.#flightPlanService;
  }

  private lastFlightPlanVersion: number | null = null;

  private readonly flightPlanChangeNotifier = new FlightPlanChangeNotifier(this.bus);
  #fmgc = new FmgcDataService(this.bus, this.flightPlanInterface);

  get fmgc() {
    return this.#fmgc;
  }

  private fmsUpdateThrottler = new UpdateThrottler(FMS_CYCLE_TIME);

  private efisInterfaces = {
    L: new EfisInterface(
      this.bus,
      'L',
      this.flightPlanInterface,
      A380X_NUM_LEGS_ON_FPLN_PAGE,
      A380AircraftConfig.fpmConfig.NUM_SECONDARY_FLIGHT_PLANS,
    ),
    R: new EfisInterface(
      this.bus,
      'R',
      this.flightPlanInterface,
      A380X_NUM_LEGS_ON_FPLN_PAGE,
      A380AircraftConfig.fpmConfig.NUM_SECONDARY_FLIGHT_PLANS,
    ),
  };

  #guidanceController!: GuidanceController;

  get guidanceController() {
    return this.#guidanceController;
  }

  #navigation: Navigation;

  get navigation() {
    if (this.instance !== FmcIndex.FmcA) {
      throw new Error('Multiple navigation instances not supported!');
    }
    return this.#navigation;
  }

  public getNearbyAirports(): readonly Readonly<NearbyFacility>[] {
    return this.#navigation?.getNearbyAirports() ?? [];
  }

  public getStaticAirTemperature(): number | null {
    return this.#navigation?.getStaticAirTemperature() ?? null;
  }

  /** The aircraft position, null before the first navigation update (0/0) */
  private knownPresentPosition(): Coordinates | null {
    const ppos = this.#navigation.getPpos();
    return ppos && (ppos.lat !== 0 || ppos.long !== 0) ? ppos : null;
  }

  get navaidTuner() {
    if (this.instance !== FmcIndex.FmcA) {
      throw new Error('Multiple navaid tuners not supported!');
    }
    return this.#navigation.getNavaidTuner();
  }

  readonly #timeKeeper = new FmsTimeKeeper();

  get timeKeeper(): FmsTimeKeeper {
    return this.#timeKeeper;
  }

  #sequencedWaypointRecorder: SequencedWaypointRecorder | null = null;

  /** The FMS print functions (FMC-A, created with the first update, once the FMC is initialized) */
  #printer: FmsPrinter | null = null;

  /** The type II FMS messages raised from the FMS data each cycle (FMC-A only, it has the navigation) */
  #advisoryMessages: FmsAdvisoryMessages | null = null;

  readonly #checkSpeedModeMessage = new CheckSpeedModeMessage({
    isSpeedSelected: () => this.acInterface?.isAirspeedSelected() === true,
    isSpeedManaged: () => this.acInterface?.isAirspeedManaged() ?? true,
    queuedMessage: () => this.fmsErrors.getArray().find((it) => it.message === NXSystemMessages.checkSpeedMode),
    addMessageToQueue: (message, onClear) => this.addMessageToQueue(message, undefined, onClear),
    removeMessageFromQueue: (text) => this.removeMessageFromQueue(text),
  });

  #secondaryPredictions: SecondaryFlightPlanPredictions | null = null;

  get printer(): FmsPrinter | null {
    return this.#printer;
  }

  /** Connects the datalink networks with the flight number of the active flight plan (FMC-A) */
  readonly #datalinkConnection =
    this.instance === FmcIndex.FmcA
      ? new FmsDatalinkConnection(this.bus, () =>
          this.addMessageToQueue(
            NXSystemMessages.fmsDatalinkNotAvail,
            () => this.#datalinkConnection?.isAvailable ?? true,
            undefined,
          ),
        )
      : null;

  /** The last flight number of the active flight plan sent to the aircraft systems */
  #activeFlightNumber: string | null = null;

  /** Loads the route clearances of the ATC mailbox in SEC 3 (FMC-A) */
  #atcRouteClearance: AtcRouteClearanceLoader<A380FlightPlanPerformanceData> | null = null;

  /** The revisions of the interactive NDs (FMC-A) */
  #ndInteractive: NdInteractiveRevisions<A380FlightPlanPerformanceData> | null = null;

  private static readonly noRejectedAtcElements = Subject.create<readonly RejectedAtcElement[]>([]);

  get atcRejectedElements(): Subscribable<readonly RejectedAtcElement[]> {
    return this.#atcRouteClearance?.rejectedElements ?? FlightManagementComputer.noRejectedAtcElements;
  }

  get lastSequencedWaypoint() {
    return this.#sequencedWaypointRecorder?.lastSequencedWaypoint ?? null;
  }

  readonly #pilotStoredElements = new PilotStoredElements();

  get pilotStoredElements(): PilotStoredElements {
    return this.#pilotStoredElements;
  }

  async insertCompanyRoute(route: StoredRoute, intoPlan: FlightPlanIndex): Promise<void> {
    try {
      await CoRouteUplinkAdapter.uplinkFlightPlanFromCoRoute(this, intoPlan, this.#flightPlanService, toCoRoute(route));
      await this.#flightPlanService.uplinkInsert(intoPlan);
    } finally {
      // The route is inserted at once, there is no received flight plan waiting for insertion
      this.cpnyFplnAvailable.set(false);
      this.cpnyFplnUplinkInProgress.set(false);
    }

    // The uplink adapter only inserts the en-route part; the procedures of the route are selected afterwards
    const p = route.procedures;
    const fps = this.flightPlanInterface;
    const trySet = async (action: () => Promise<unknown>, what: string) => {
      try {
        await action();
      } catch (e) {
        console.warn(`[FMS] Company route ${route.ident}: could not select ${what}:`, e);
      }
    };
    if (p.originRunwayIdent) {
      await trySet(() => fps.setOriginRunway(p.originRunwayIdent!, intoPlan), 'the origin runway');
    }
    if (p.departureDatabaseId) {
      await trySet(() => fps.setDepartureProcedure(p.departureDatabaseId, intoPlan), 'the departure');
    }
    if (p.departureTransitionDatabaseId) {
      await trySet(
        () => fps.setDepartureEnrouteTransition(p.departureTransitionDatabaseId, intoPlan),
        'the departure transition',
      );
    }
    if (p.destinationRunwayIdent) {
      await trySet(() => fps.setDestinationRunway(p.destinationRunwayIdent!, intoPlan), 'the destination runway');
    }
    if (p.arrivalDatabaseId) {
      await trySet(() => fps.setArrival(p.arrivalDatabaseId, intoPlan), 'the arrival');
    }
    if (p.arrivalTransitionDatabaseId) {
      await trySet(
        () => fps.setArrivalEnrouteTransition(p.arrivalTransitionDatabaseId, intoPlan),
        'the arrival transition',
      );
    }
    if (p.approachDatabaseId) {
      await trySet(() => fps.setApproach(p.approachDatabaseId, intoPlan), 'the approach');
    }
    if (p.approachViaDatabaseId) {
      await trySet(() => fps.setApproachVia(p.approachViaDatabaseId, intoPlan), 'the approach via');
    }

    this.fmgc.data.companyRouteIdent(intoPlan).set(route.ident);
    if (intoPlan === FlightPlanIndex.Active) {
      this.acInterface.updateFmsData();
    }
  }

  /**
   * Inserts an alternate company route (from the primary destination to its alternate destination): re-initializes the
   * alternate flight plan with the en-route fixes of the route, without a temporary flight plan (INIT page ALTN RTE and
   * ROUTE SELECTION page, AlternateCompanyRoute.ts).
   */
  async insertAlternateCompanyRoute(route: StoredRoute, intoPlan: FlightPlanIndex): Promise<void> {
    const fixes = await alternateRouteFixes(route.navlog, (ident) =>
      NavigationDatabaseService.activeDatabase.searchAllFix(ident),
    );
    await this.flightPlanInterface.insertAlternateCompanyRoute(route.destinationIcao, fixes, intoPlan);
    this.fmgc.data.alternateCompanyRoute(intoPlan).set({ ident: route.ident, alternateIcao: route.destinationIcao });
    if (intoPlan === FlightPlanIndex.Active) {
      this.acInterface.updateFmsData();
    }
  }

  private efisSymbolsLeft!: EfisSymbols<number>;
  private efisSymbolsRight!: EfisSymbols<number>;

  // TODO remove this cyclic dependency, isWaypointInUse should be moved to DataInterface
  private dataManager: DataManager | null = null;

  private readonly sub = this.bus.getSubscriber<FlightPhaseManagerEvents & MfdUIData>();

  private readonly flightPhase = ConsumerSubject.create<FmgcFlightPhase>(
    this.sub.on('fmgc_flight_phase'),
    this.flightPhaseManager.phase,
  );
  private readonly activePage = ConsumerSubject.create<ActiveUriInformation | null>(
    this.sub.on('mfd_active_uri'),
    null,
  );

  private readonly isReset = Subject.create(true);

  private readonly shouldBePreflightPhase = MappedSubject.create(
    ([phase, page, isReset]) => {
      const isPreflight =
        phase === FmgcFlightPhase.Done &&
        isReset &&
        (page?.uri === 'fms/active/init' || page?.uri === 'fms/active/fuel-load' || page?.uri === 'fms/active/perf');
      return isPreflight;
    },
    this.flightPhase,
    this.activePage,
    this.isReset,
  );

  public getDataManager() {
    return this.dataManager;
  }

  #fmsErrors = ArraySubject.create<FmsErrorMessage>();

  get fmsErrors() {
    return this.#fmsErrors;
  }

  // TODO make private, and access methods through FmcInterface
  public acInterface!: FmcAircraftInterface;

  public revisedLegIndex = Subject.create<number | null>(null);

  public revisedLegPlanIndex = Subject.create<FlightPlanIndex | null>(null);

  public revisedLegIsAltn = Subject.create<boolean | null>(null);

  public enginesWereStarted = Subject.create<boolean>(false);

  public hasActiveFlightPlanWithCityPair = Subject.create<boolean>(false);

  /**
   * FUEL PLANNING (A380 FCOM DSC-22-FMS-20-30 P 179): the minimum BLOCK fuel in tonnes, BLOCK = TAXI + TRIP + RTE RSV +
   * MIN FUEL AT DEST, until the flight crew confirms it or enters a BLOCK.
   */
  public readonly fuelPlanningBlockFuel = Subject.create<number | null>(null);

  /** The fuel planning computation is running. */
  public readonly fuelPlanningInProgress = Subject.create(false);

  private fuelPlanningIterations = 0;

  /** The last predictions read by the fuel planning, to use each computation once */
  private fuelPlanningLastProfile: object | null = null;

  /** The destination EFOB of the last predictions with the current trial fuel, in kg */
  private fuelPlanningLastDestFuelKg: number | null = null;

  /**
   * The destination fuel the VNAV starts from when it has no estimate (CruiseToDescentCoordinator), in pounds: a
   * prediction still at this value is not a prediction yet.
   */
  private static readonly VNAV_DEFAULT_DESTINATION_FUEL_LB = 4000;

  private readonly legacyFmsIsHealthy = Subject.create(false);

  private wasReset = false;

  public readonly zeroFuelWeight = Subject.create<number | null>(null);
  public readonly zeroFuelWeightCenterOfGravity = Subject.create<number | null>(null);

  private readonly ZfwOrZfwCgUndefined = MappedSubject.create(
    ([zfw, zfwCg]) => zfw == null || zfwCg == null,
    this.zeroFuelWeight,
    this.zeroFuelWeightCenterOfGravity,
  );

  private readonly approachQnh = Subject.create<number | null>(null);
  private readonly approachTemperature = Subject.create<number | null>(null);
  private readonly approachWindDirection = Subject.create<number | null>(null);
  private readonly approachWindMagnitude = Subject.create<number | null>(null);
  private readonly destDataIsPilotEntered = Subject.create(false);
  /** For the active flight plan */
  private readonly destinationRunwayBearing = Subject.create<number | null>(null);

  /** For the active flight plan */
  private readonly approachHeadWindComponent = Subject.create<number | null>(null);

  private readonly destDataEntered = MappedSubject.create(
    ([qnh, temperature, windDirection, windMagnitude]) =>
      qnh !== null && temperature !== null && windDirection !== null && windMagnitude !== null,
    this.approachQnh,
    this.approachTemperature,
    this.approachWindDirection,
    this.approachWindMagnitude,
  );

  private readonly minimumDestinationFuel = Subject.create<number | null>(null);
  private readonly alternateFuel = Subject.create<number | null>(null);
  private readonly finalFuelWeight = Subject.create<number | null>(null);
  public readonly pilotEntryMinFuelBelowAltnPlusFinal = MappedSubject.create(
    ([minFuel, altnFuel, finalFuel]) =>
      minFuel != null && altnFuel != null && finalFuel != null && minFuel < altnFuel + finalFuel,
    this.minimumDestinationFuel,
    this.alternateFuel,
    this.finalFuelWeight,
  );

  private readonly checkDestDataMessage = Subject.create(false);

  public readonly approachFlapsThreeSelected = Subject.create(false);

  /**
   * The IRS alignment reference position defined on the POSITION / IRS Align On Other Reference panel (IrsAlignReference.ts),
   * null while the IRS align on the GPS position. Kept until all the IRS are switched off, or the FMS resets.
   */
  public readonly irsAlignReferencePosition = Subject.create<Coordinates | null>(null);

  private destDataCheckedInCruise = false;

  private readonly cruiseMessageCheckThrotter = new UpdateThrottler(15000);

  private readonly optimumFlightLevelThrottler = new UpdateThrottler(5000);

  /** The OPT FL of the PERF page, null for dashes */
  private optimumFlightLevel: number | null = null;

  private readonly optimumLevelCache = new A380OptimumLevelCache();

  private readonly costIndexDefault = new CostIndexDefault();

  private simBriefOfp: ISimbriefData | null = null;

  /** FCOM DSC-22-FMS company F-PLN request: NO COMPANY REPLY when no response is received within 4 min */
  private static readonly CPNY_FPLN_REPLY_TIMEOUT_MS = 4 * 60_000;

  /** Company wind replies wait for the datalink reply time of their request (flyPad realism setting) */
  private readonly cpnyWindReplyHold = new CompanyReplyHold();

  /** Company takeoff data (A380 FCOM DSC-22-FMS): the request and the received data, from the flypad calculator */
  public readonly companyTakeoffData: CompanyTakeoffData;
  private lastUpdateTime: number | null = 0;

  private readonly cpnyFplnAvailable = Subject.create(false);
  private readonly cpnyFplnRequestedForPlan = Subject.create<FlightPlanIndex | null>(null);
  private readonly cpnyFplnUplinkInProgress = Subject.create(false);
  private readonly cpnyWindUplinkInProgress = Subject.create(false);

  /** The flight plan of the pending company wind request, null without one */
  private readonly cpnyWindRequestedForPlan = Subject.create<FlightPlanIndex | null>(null);

  /** NO COMPANY REPLY 4 min after a company wind request without an answer */
  private readonly cpnyWindRequestTimeout = new CompanyRequestTimeout();
  private readonly uplinkRequestInProgress = MappedSubject.create(
    SubscribableMapFunctions.or(),
    this.cpnyFplnUplinkInProgress,
    this.cpnyWindUplinkInProgress,
  );

  private readonly windUplinkRecievedActive = Subject.create(false);
  private readonly windUplinkRecievedSec = Array.from({ length: FpmConfigs.A380.NUM_SECONDARY_FLIGHT_PLANS }, () =>
    Subject.create(false),
  );
  private readonly isAnyWindUplinkRecieved = MappedSubject.create(
    SubscribableMapFunctions.or(),
    this.windUplinkRecievedActive,
    ...this.windUplinkRecievedSec,
  );
  private readonly windUplinkPulse = new NXLogicPulseNode();
  private readonly companyWindUplinkPending = Subject.create(false);

  private readonly uplinkWaitingInsertionActive = MappedSubject.create(
    ([uplinkPendingDuetoTmpy, hasUplink]) => !uplinkPendingDuetoTmpy && hasUplink,
    this.companyWindUplinkPending,
    this.windUplinkRecievedActive,
  );

  private readonly uplinkWaitingInsertionSec = Array.from(
    { length: FpmConfigs.A380.NUM_SECONDARY_FLIGHT_PLANS },
    (_, i) =>
      MappedSubject.create(
        ([uplinkPendingDuetoTmpy, hasUplink]) => !uplinkPendingDuetoTmpy && hasUplink,
        this.companyWindUplinkPending,
        this.windUplinkRecievedSec[i],
      ),
  );

  private readonly vdSafetyAltitudes = new FmsVdSafetyAltitudes(this.bus);

  private readonly atsuBusPublisher = this.bus.getPublisher<FmsToAtsuEvents>();
  private readonly datalinkBusPublisher = this.bus.getPublisher<FmsToDatalinkSubsystemEvents>();
  private readonly atsuBusSubscriber = this.bus.getSubscriber<AtsuToFmsEvents>();

  constructor(
    private instance: FmcIndex,
    private _operatingMode: FmcOperatingModes,
    private readonly bus: EventBus,
    private readonly fmcInop: Subscribable<boolean>,
    mfdReference: (FmsDisplayInterface & MfdDisplayInterface) | null,
  ) {
    // JTSN GW for the FQMS (FuelJettison), 0 without JTSN GW: entered on the FUEL&LOAD page of the master FMC
    this.fmgc.data.jettisonGrossWeight.sub((gw) =>
      SimVar.SetSimVarValue('L:A380X_FMS_JETTISON_GW', SimVarValueType.Number, gw ?? 0),
    );
    this.#mfdReference = mfdReference;

    const db = new NavigationDatabase(this.bus, NavigationDatabaseBackend.Msfs);
    NavigationDatabaseService.activeDatabase = db;

    // A380 FM/GPS POS DISAGREE thresholds and takeoff position update rule (see FmPosition.ts)
    this.#navigation = new Navigation(this.bus, this.flightPlanInterface, A380_FM_POSITION_CONFIG);
    if (this.instance === FmcIndex.FmcA) {
      this.#sequencedWaypointRecorder = new SequencedWaypointRecorder(
        this.flightPlanInterface,
        this.#navigation,
        () => this.#navigation.getStaticAirTemperature(),
        () => ({ direction: this.#navigation.getWindDirection(), speed: this.#navigation.getWindSpeed() }),
        () => this.fmgc.getFOB(),
      );
      this.#atcRouteClearance = new AtcRouteClearanceLoader(this.bus, this, {
        presentPosition: () => {
          const ppos = this.#navigation.getPpos();
          // No position before the first navigation update
          return ppos && (ppos.lat !== 0 || ppos.long !== 0) ? ppos : null;
        },
        // FCOM DSC-22-FMS-20-30 P 344: RTA NOT ALLOWED IN EO / IN GA
        rtaAllowed: () => !this.fmgc.data.engineOut.get() && this.flightPhase.get() !== FmgcFlightPhase.GoAround,
        beforeCruise: () => this.flightPhase.get() < FmgcFlightPhase.Cruise,
      });
      this.#ndInteractive = new NdInteractiveRevisions(this.bus, {
        flightPlanInterface: this.flightPlanInterface,
        entry: this,
        presentPosition: () => {
          const ppos = this.#navigation.getPpos();
          return ppos && (ppos.lat !== 0 || ppos.long !== 0) ? ppos : null;
        },
        trueTrack: () => SimVar.GetSimVarValue('GPS GROUND TRUE TRACK', 'degree'),
        groundSpeed: () => this.#navigation.groundSpeed,
        setRevisedWaypoint: (index, planIndex, isAltn) => this.setRevisedWaypoint(index, planIndex, isAltn),
        resetRevisedWaypoint: () => this.resetRevisedWaypoint(),
        showFmsErrorMessage: (type) => this.showFmsErrorMessage(type),
      });
    }

    // FIXME implement sync between FMCs and also let FMC-B and FMC-C compute
    this.flightPlanInterface.createFlightPlans();
    this.acInterface = new FmcAircraftInterface(this.bus, this, this.fmgc, this.flightPlanInterface);

    this.#guidanceController = new GuidanceController(
      this.bus,
      this.fmgc,
      this.flightPlanInterface,
      this.efisInterfaces,
      a380EfisRangeSettings,
      A380AircraftConfig,
    );
    this.#guidanceController.timeMarkers = this.#timeMarkers;
    this.efisSymbolsLeft = new EfisSymbols(
      this.bus,
      'L',
      this.#guidanceController,
      this.flightPlanInterface,
      this.navaidTuner,
      this.efisInterfaces.L,
      a380EfisRangeSettings,
      true,
    );
    this.efisSymbolsRight = new EfisSymbols(
      this.bus,
      'R',
      this.#guidanceController,
      this.flightPlanInterface,
      this.navaidTuner,
      this.efisInterfaces.R,
      a380EfisRangeSettings,
      true,
    );

    // FIXME this needs to be changed when operating mode can vary. Need some other way of only instantiating this on only
    // one FMC.
    if (this.operatingMode === FmcOperatingModes.Master) {
      this.#msfsFlightPlanSync = new MsfsFlightPlanSync(this.bus, this.flightPlanInterface);
    }

    this.companyTakeoffData = new CompanyTakeoffData(
      this.bus,
      this.instance === FmcIndex.FmcA,
      () => this.companyTakeoffDataRequestContent(),
      (message) => {
        switch (message) {
          case CompanyTakeoffDataLinkMessage.Received:
            this.addMessageToQueue(
              NXSystemMessages.cpnyToDataReceivedPendingInsertion,
              () => this.companyTakeoffData.uplinks.get().length === 0,
              undefined,
            );
            break;
          case CompanyTakeoffDataLinkMessage.Invalid:
            this.addMessageToQueue(NXSystemMessages.receivedCpnyToDataNotValid, undefined, undefined);
            break;
          case CompanyTakeoffDataLinkMessage.NoReply:
            this.addMessageToQueue(NXSystemMessages.noCompanyReply, undefined, undefined);
            break;
        }
      },
    );

    // The landing data for the flypad landing calculator, from one FMC
    if (this.instance === FmcIndex.FmcA) {
      this.subs.push(
        answerFmsLandingDataRequests(this.bus, () => this.fmsLandingDataContent()),
        answerFmsDescentDataRequests(this.bus, () => this.fmsDescentDataContent()),
      );
    }

    this.#navigation.init();
    this.efisSymbolsLeft.init();
    this.efisSymbolsRight.init();
    this.flightPhaseManager.init();
    this.#guidanceController.init();
    this.fmgc.guidanceController = this.#guidanceController;
    this.#secondaryPredictions = new SecondaryFlightPlanPredictions(
      this.bus,
      this.fmgc,
      this.flightPlanInterface,
      this.#guidanceController,
      A380AircraftConfig,
    );
    this.fmgc.secondaryPredictions = this.#secondaryPredictions;

    this.initSimVars();

    this.flightPhaseManager.addOnPhaseChanged((prev, next) => this.onFlightPhaseChanged(prev, next));

    const constantMachSegmentAutoDeletion = new ConstantMachSegmentAutoDeletion(
      this.bus,
      this.#flightPlanService,
      A380AnnouncedConstantMachDeletions,
      () => this.addMessageToQueue(NXSystemMessages.machSegmentDeleted, undefined, undefined),
    );
    this.flightPhaseManager.addOnPhaseChanged((prev, next) =>
      constantMachSegmentAutoDeletion.onFlightPhaseChanged(prev, next),
    );
    this.subs.push(this.fmgc.data.engineOut.sub((eo) => constantMachSegmentAutoDeletion.onEngineOutChanged(eo)));

    // When the active flight plan changes, re-pipe all related subjects
    this.subs.push(
      this.flightPlanChangeNotifier.flightPlanChanged.sub(() => this.onActiveFlightPlanChanged(), true),
      this.pilotEntryMinFuelBelowAltnPlusFinal,
    );

    this.subs.push(
      this.shouldBePreflightPhase.sub((shouldBePreflight) => {
        if (shouldBePreflight) {
          this.flightPhaseManager.changePhase(FmgcFlightPhase.Preflight);
        }
      }, true),
      this.enginesWereStarted.sub((val) => {
        if (val) {
          this.setDefaultCostIndexIfNoneEntered();
        }
      }),
      this.legacyFmsIsHealthy.sub((v) => {
        // FIXME some of the systems require the A320 FMS health bits, need to refactor/split FMS stuff
        SimVar.SetSimVarValue('L:A32NX_FM1_HEALTHY_DISCRETE', 'boolean', v);
        SimVar.SetSimVarValue('L:A32NX_FM2_HEALTHY_DISCRETE', 'boolean', v);
      }, true),

      this.ZfwOrZfwCgUndefined,
      this.ZfwOrZfwCgUndefined.sub((v) => {
        if (!v) {
          this.removeMessageFromQueue(NXSystemMessages.initializeZfwOrZfwCg.text);
        }
      }),

      this.cpnyFplnAvailable.sub((v) => {
        if (v) {
          this.removeMessageFromQueue(NXSystemMessages.receivedCpnyFplnNotValid.text);
          this.addMessageToQueue(NXSystemMessages.comFplnReceivedPendingInsertion);
        } else {
          this.removeMessageFromQueue(NXSystemMessages.comFplnReceivedPendingInsertion.text);
        }
      }),
      this.destDataEntered,
      this.destDataEntered.sub((v) => {
        if (v) {
          this.removeMessageFromQueue(NXSystemMessages.enterDestData.text);
        }
      }),
      this.checkDestDataMessage.sub((v) => {
        if (v) {
          this.addMessageToQueue(NXSystemMessages.checkDestData);
        } else {
          this.removeMessageFromQueue(NXSystemMessages.checkDestData.text);
        }
      }),
      this.fmcInop.sub((value) => this.healythSimvar.set(!value), true),
      this.zeroFuelWeight.sub((zfw) => {
        if (zfw !== null) {
          this.setDefaultCostIndexIfNoneEntered();
        }
      }),
    );

    this.subs.push(this.shouldBePreflightPhase, this.flightPhase, this.activePage);

    this.subs.push(
      this.fmgc.data.engineOut.sub((eo) => {
        if (eo) {
          this.enterEngineOut();
        } else {
          this.exitEngineOut();
        }
      }),
      this.approachWindDirection.sub((v) => {
        this.approachHeadWindComponent.set(
          v !== null ? this.calculateApproachWindComponent(FlightPlanIndex.Active, true) : null,
        );
      }),
      this.approachWindMagnitude.sub((v) => {
        this.approachHeadWindComponent.set(
          v !== null ? this.calculateApproachWindComponent(FlightPlanIndex.Active, true) : null,
        );
      }),
      this.destinationRunwayBearing.sub((v) => {
        this.approachHeadWindComponent.set(
          v !== null ? this.calculateApproachWindComponent(FlightPlanIndex.Active, true) : null,
        );
      }),
      this.approachHeadWindComponent.sub((v) => {
        this.acInterface.updateApproachHeadWindComponent(v);
      }),
      this.companyWindUplinkPending.sub((v) => {
        if (v) {
          this.addMessageToQueue(NXSystemMessages.comWindUplinkPending);
        } else {
          this.removeMessageFromQueue(NXSystemMessages.comWindUplinkPending.text);
        }
      }),
      this.uplinkWaitingInsertionActive.sub((v) => {
        if (v) {
          this.addMessageToQueue(NXSystemMessages.comWindRecievedPendingInsertionActive);
        } else {
          this.removeMessageFromQueue(NXSystemMessages.comWindRecievedPendingInsertionActive.text);
        }
      }),
      this.atsuBusSubscriber
        .on('wind_uplink_response')
        .handle((response) => this.deliverCompanyWindUplinkResponse(response)),

      this.bus
        .getSubscriber<FlightPlanOperationEvents>()
        .on('fms_draft_winds_inserted')
        .handle(() => {
          this.addMessageToQueue(NXSystemMessages.draftWindsInserted, undefined, undefined);
        }),
    );

    for (let i = 0; i < this.uplinkWaitingInsertionSec.length; i++) {
      this.subs.push(
        this.uplinkWaitingInsertionSec[i].sub((v) => {
          if (v) {
            this.addMessageToQueue(
              NXSystemMessages.comWindRecievedPendingInsertionInSecondary.getModifiedMessage(`${i + 1}`),
            );
          } else {
            this.removeMessageFromQueue(
              NXSystemMessages.comWindRecievedPendingInsertionInSecondary.getModifiedMessage(`${i + 1}`).text,
            );
          }
        }),
      );
    }

    this.subs.push(
      this.bus
        .getSubscriber<ClockEvents>()
        .on('simTimeHiFreq')
        .atFrequency(5)
        .handle((time) => {
          // The first step and the steps after a pause or a sim-rate jump are limited for the dt-based code
          this.onUpdate(clampFmcUpdateStep(this.lastUpdateTime ?? 0, time));
          this.lastUpdateTime = time;
        }),
    );

    const flightPlanSyncSub = this.bus.getSubscriber<FlightPlanEvents>();

    this.subs.push(
      flightPlanSyncSub.on('flightPlanManager.deleteAll').handle(() => {
        for (let i = 0; i < this.uplinkWaitingInsertionSec.length; i++) {
          this.windUplinkRecievedSec[i].set(false);
        }
        this.windUplinkRecievedActive.set(false);
      }),
      flightPlanSyncSub.on('flightPlanManager.delete').handle((data) => {
        if (data.planIndex >= FlightPlanIndex.FirstSecondary) {
          this.windUplinkRecievedSec[data.planIndex - FlightPlanIndex.FirstSecondary].set(false);
        } else if (data.planIndex === FlightPlanIndex.Active) {
          this.windUplinkRecievedActive.set(false);
        }
      }),
    );

    console.log(`${FmcIndex[this.instance]} initialized.`);
  }
  getApproachCrossWindComponent(forPlan = FlightPlanIndex.Active): number | null {
    return this.calculateApproachWindComponent(forPlan, false);
  }

  getApproachHeadWindComponent(forPlan = FlightPlanIndex.Active): number | null {
    return forPlan === FlightPlanIndex.Active
      ? this.approachHeadWindComponent.get()
      : this.calculateApproachWindComponent(forPlan, true);
  }

  private calculateApproachWindComponent(forPlan = FlightPlanIndex.Active, headWind: boolean): number | null {
    const plan = this.#flightPlanService.has(forPlan) ? this.#flightPlanService.get(forPlan) : undefined;
    if (!plan || !plan.destinationRunway) {
      return null;
    }
    const approachWindDirection = plan.performanceData.approachWindDirection.get();
    const approachWindSpeed = plan.performanceData.approachWindMagnitude.get();
    if (approachWindDirection === null || approachWindSpeed === null) {
      return null;
    }
    return A380SpeedsUtils.getHeadwind(
      approachWindSpeed,
      approachWindDirection,
      plan.destinationRunway.magneticBearing + (headWind ? 0 : 90),
    );
  }

  destroy() {
    this.flightPlanChangeNotifier.destroy();
    this.#rtaFunction.destroy();
    this.#fmgc.destroy();
    for (const s of this.subs) {
      s.destroy();
    }
  }

  public revisedWaypoint(): Fix | undefined {
    const revWptIdx = this.revisedLegIndex.get();
    const revPlanIdx = this.revisedLegPlanIndex.get();
    if (revWptIdx !== null && revPlanIdx !== null && this.flightPlanInterface.has(revPlanIdx)) {
      const flightPlan = this.revisedLegIsAltn.get()
        ? this.flightPlanInterface.get(revPlanIdx).alternateFlightPlan
        : this.flightPlanInterface.get(revPlanIdx);
      if (flightPlan.hasElement(revWptIdx) && flightPlan.elementAt(revWptIdx)?.isDiscontinuity === false) {
        return flightPlan.legElementAt(revWptIdx)?.definition?.waypoint;
      }
    }
    return undefined;
  }

  public setRevisedWaypoint(index: number, planIndex: number, isAltn: boolean) {
    this.revisedLegPlanIndex.set(planIndex);
    this.revisedLegIsAltn.set(isAltn);
    this.revisedLegIndex.set(index);
  }

  public resetRevisedWaypoint(): void {
    this.revisedLegIndex.set(null);
    this.revisedLegIsAltn.set(null);
    this.revisedLegPlanIndex.set(null);
  }

  public latLongStoredWaypoints: Waypoint[] = [];

  public pbdStoredWaypoints: Waypoint[] = [];

  public pbxStoredWaypoints: Waypoint[] = [];

  public deleteAllStoredWaypoints() {
    this.latLongStoredWaypoints = [];
    this.pbdStoredWaypoints = [];
    this.pbxStoredWaypoints = [];
  }

  /**
   * Checks whether a waypoint is currently in use
   * @param waypoint the waypoint to look for
   */
  /**
   * Whether a waypoint is part of the active, temporary or secondary flight plans (a pilot-stored waypoint that cannot
   * be deleted to make room in the pilot-stored elements database)
   * @param waypoint the waypoint
   * @returns true when a flight plan uses it
   */
  private isWaypointInFlightPlans(waypoint: Waypoint): boolean {
    const fps = this.flightPlanInterface;
    const plans = [
      fps.hasActive ? fps.active : undefined,
      fps.hasTemporary ? fps.temporary : undefined,
      ...[1, 2, 3].map((sec) => (fps.hasSecondary(sec) ? fps.secondary(sec) : undefined)),
    ];
    return plans.some(
      (plan) =>
        plan !== undefined &&
        plan.allLegs.some((leg) => leg.isDiscontinuity === false && leg.terminatesWithWaypoint(waypoint)),
    );
  }

  async isWaypointInUse(waypoint: Waypoint): Promise<boolean> {
    // Check in all flight plans
    if (this.flightPlanInterface.hasActive) {
      return this.flightPlanInterface.isWaypointInUse(waypoint);
    }

    return false;
  }

  /** in kg */
  public getLandingWeight(forPlan = FlightPlanIndex.Active): number | null {
    const tow = this.getTakeoffWeight(forPlan);
    const gw = this.fmgc.getGrossWeightKg();
    const tf = this.getTripFuel(forPlan);

    if (!this.enginesWereStarted.get()) {
      // On ground, engines off
      // LW = TOW - TRIP
      return tow && tf ? tow - tf : null;
    }
    if (gw && tf && this.fmgc.getFlightPhase() >= FmgcFlightPhase.Takeoff) {
      // In flight
      // LW = GW - TRIP
      return gw - tf;
    }
    if (gw) {
      // Preflight, engines on
      // LW = GW - TRIP - TAXI
      return gw - (tf ?? 0) - (this.flightPlanInterface.get(forPlan).performanceData.taxiFuel.get() ?? 0) * 1000;
    }
    return null;
  }

  public getTakeoffWeight(forPlan = FlightPlanIndex.Active): number | null {
    return this.flightPlanInterface.get(forPlan).performanceData.takeoffWeight?.get() ?? null;
  }

  public calculateTakeoffWeight(forPlan = FlightPlanIndex.Active): void {
    if (!this.flightPlanInterface.has(forPlan)) {
      return;
    }
    const plan = this.flightPlanInterface.get(forPlan);
    const pd = plan.performanceData;
    const isActiveOrCopyOfActive = plan.isActiveOrCopiedFromActive();

    if (isActiveOrCopyOfActive && this.fmgc.getFlightPhase() >= FmgcFlightPhase.Takeoff) {
      return; // frozen at liftoff, don't overwrite
    }

    let tow: number | null;
    if (!isActiveOrCopyOfActive || !this.enginesWereStarted.get()) {
      // Engines off or secondary not copied from active: ZFW + BLOCK - TAXI
      const zfw = pd.zeroFuelWeight.get();
      const blockFuel = pd.blockFuel.get();
      const taxiFuel = pd.taxiFuel.get();
      tow = zfw != null && blockFuel !== null && taxiFuel !== null ? (zfw + blockFuel - taxiFuel) * 1000 : null;
    } else {
      // Engines on, preflight: GW - TAXI
      const gw = this.fmgc.getGrossWeightKg();
      tow = gw ? gw - (pd.taxiFuel.get() ?? 0) * 1000 : null;
    }

    pd.takeoffWeight?.set(tow);
  }

  public getTripFuel(forPlan = FlightPlanIndex.Active): number | null {
    const destPred = this.fmgc.getDestinationPrediction(forPlan);
    const startFob = this.fmgc.getPredictionStartFob(forPlan);
    if (destPred && startFob !== null) {
      return startFob * 1_000 - Units.poundToKilogram(destPred.estimatedFuelOnBoard);
    }
    return null;
  }

  public getExtraFuel(forPlan = FlightPlanIndex.Active): number | null {
    const destPred = this.fmgc.getDestinationPrediction(forPlan);
    if (destPred) {
      const pd = this.flightPlanInterface.get(forPlan).performanceData;
      const independentOfAircraft = this.fmgc.isPlanIndependentOfAircraft(forPlan);
      if (this.flightPhase.get() === FmgcFlightPhase.Preflight || independentOfAircraft) {
        const trip = this.getTripFuel(forPlan);
        // EXTRA = BLOCK - TAXI - TRIP - MIN FUEL DEST - RTE RSV
        return Math.max(
          (this.enginesWereStarted.get() && !independentOfAircraft ? this.fmgc.getFOB()! : pd.blockFuel.get() ?? 0) *
            1000 -
            (pd.taxiFuel.get() ?? 0) * 1000 -
            trip! -
            (pd.minimumDestinationFuelOnBoard.get() ?? 0) * 1000 -
            (this.getRouteReserveFuel(forPlan, trip!) ?? 0),
          LOWEST_FUEL_ESTIMATE_KGS,
        );
      } else {
        return Math.max(
          Units.poundToKilogram(destPred.estimatedFuelOnBoard) - (pd.minimumDestinationFuelOnBoard.get() ?? 0) * 1000,
          LOWEST_FUEL_ESTIMATE_KGS,
        );
      }
    }

    return null;
  }

  /**
   * Starts the fuel planning computation. The TRIP fuel comes from the predictions of the flight plan, which need a
   * fuel on board: they run with a trial BLOCK fuel, replaced by the resulting minimum BLOCK until both agree.
   */
  public startFuelPlanning(): void {
    const plan = this.flightPlanInterface.active;
    if (!plan.originAirport || !plan.destinationAirport) {
      return;
    }
    const pd = plan.performanceData;
    if (pd.timeConstraint.get() !== null) {
      this.addMessageToQueue(NXSystemMessages.rtaNotConsideredForFuelPlanning);
    }
    const distance = Avionics.Utils.computeGreatCircleDistance(
      plan.originAirport.location,
      plan.destinationAirport.location,
    );
    // First trial: about 20 kg per NM for the trip
    const trial = (pd.taxiFuel.get() ?? 0) + (pd.minimumDestinationFuelOnBoard.get() ?? 0) + (distance * 21) / 1000;
    this.fuelPlanningIterations = 0;
    this.fuelPlanningBlockFuel.set(null);
    this.setFuelPlanningTrial(trial);
    this.fuelPlanningInProgress.set(true);
  }

  /** The flight crew confirms the computed minimum BLOCK fuel: it appears in the BLOCK entry field. */
  public confirmFuelPlanning(): void {
    const block = this.fuelPlanningBlockFuel.get();
    this.stopFuelPlanning();
    if (block !== null) {
      this.flightPlanInterface.setPerformanceData('blockFuel', block, FlightPlanIndex.Active);
    }
  }

  /** The next predictions are computed with this BLOCK fuel, in tonnes */
  private setFuelPlanningTrial(trial: number): void {
    this.fuelPlanningLastDestFuelKg = null;
    this.fmgc.data.fuelPlanningTrialBlockFuel.set(trial);
  }

  private stopFuelPlanning(): void {
    this.fuelPlanningInProgress.set(false);
    this.fuelPlanningBlockFuel.set(null);
    this.fmgc.data.fuelPlanningTrialBlockFuel.set(null);
  }

  private updateFuelPlanning(): void {
    if (!this.fuelPlanningInProgress.get() && this.fuelPlanningBlockFuel.get() === null) {
      return;
    }
    const pd = this.flightPlanInterface.active.performanceData;
    // Only before engine start and without a BLOCK entry; the computed BLOCK disappears when the crew enters one
    if (this.enginesWereStarted.get() || pd.blockFuel.get() !== null || !this.hasActiveFlightPlanWithCityPair.get()) {
      this.stopFuelPlanning();
      return;
    }
    if (!this.fuelPlanningInProgress.get()) {
      return;
    }

    const trial = this.fmgc.data.fuelPlanningTrialBlockFuel.get();
    const profile = this.guidanceController.vnavDriver.mcduProfile;
    const startFuel = profile?.checkpoints[0]?.remainingFuelOnBoard;
    const destPred = this.guidanceController.vnavDriver.getDestinationPrediction();
    // Each computation of the predictions once, and only those computed with the current trial fuel
    if (
      trial === null ||
      !profile ||
      profile === this.fuelPlanningLastProfile ||
      !destPred ||
      startFuel === undefined ||
      Math.abs(Units.poundToKilogram(startFuel) - trial * 1000) > 50
    ) {
      return;
    }
    this.fuelPlanningLastProfile = profile;

    // The destination EFOB of the first computations with a new fuel on board can still be the VNAV starting estimate:
    // use it once two computations in a row agree (else the TRIP is the trial fuel itself, and the BLOCK runs away)
    const destFuelKg = Units.poundToKilogram(destPred.estimatedFuelOnBoard);
    const previousDestFuelKg = this.fuelPlanningLastDestFuelKg;
    this.fuelPlanningLastDestFuelKg = destFuelKg;
    if (
      Math.abs(destPred.estimatedFuelOnBoard - FlightManagementComputer.VNAV_DEFAULT_DESTINATION_FUEL_LB) < 1 ||
      previousDestFuelKg === null ||
      Math.abs(destFuelKg - previousDestFuelKg) > 50
    ) {
      return;
    }

    const trip = trial * 1000 - destFuelKg;
    const block =
      ((pd.taxiFuel.get() ?? 0) * 1000 +
        trip +
        (this.getRouteReserveFuel(FlightPlanIndex.Active, trip) ?? 0) +
        (pd.minimumDestinationFuelOnBoard.get() ?? 0) * 1000) /
      1000;
    this.fuelPlanningIterations++;
    if (Math.abs(block - trial) < 0.1) {
      // The minimum BLOCK, rounded up to the 0.1 t of the entry field
      this.fuelPlanningBlockFuel.set(Math.ceil(block * 10) / 10);
      this.fuelPlanningInProgress.set(false);
    } else if (this.fuelPlanningIterations >= 8) {
      console.warn('[FMS] FUEL PLANNING: the minimum BLOCK does not converge, no result');
      this.stopFuelPlanning();
    } else {
      this.setFuelPlanningTrial(block);
    }
  }

  /**
   * Returns the estimated route reserve fuel. If a pilot entry for route reserve fuel exists, it will be used.
   * Otherwise it is calculated based upon the route reserve fuel percentage and the trip fuel, if any.
   * @returns the route reserve fuel in kg, or null if it cannot be calculated due to missing data.
   */
  public getRouteReserveFuel(forPlan = FlightPlanIndex.Active, tripFuel?: number | null): number | null {
    const pd = this.flightPlanInterface.get(forPlan).performanceData;
    const pilotEntry = pd.pilotRouteReserveFuel.get();
    if (pilotEntry !== null) {
      return pilotEntry * 1000;
    } else {
      const trip = tripFuel ?? this.getTripFuel(forPlan);
      if (trip !== null) {
        const rteReservePercentage = pd.routeReserveFuelPercentage.get();
        return rteReservePercentage !== null ? trip * (rteReservePercentage / 100) : null;
      }
    }
    return null;
  }

  /** @inheritdoc */
  public getRecMaxAltitude(forplan = FlightPlanIndex.Active, grossWeight?: number): number | null {
    if (forplan !== FlightPlanIndex.Active && forplan !== FlightPlanIndex.Temporary) {
      return null;
    }
    const gw = grossWeight ?? this.fmgc.getGrossWeightKg();
    if (!gw) {
      return null;
    }

    const isaTempDeviation = A380AltitudeUtils.getIsaTempDeviation();
    return Math.min(A380AltitudeUtils.calculateRecommendedMaxAltitude(gw, isaTempDeviation), maxCertifiedAlt);
  }

  /** @inheritdoc */
  public getRecMaxFlightLevel(forplan = FlightPlanIndex.Active, grossWeight?: number): number | null {
    const recMax = this.getRecMaxAltitude(forplan, grossWeight);
    return recMax !== null ? recMax / 100 : null;
  }

  /** @inheritdoc */
  public getCompanyAlternates(destinationIcao: string): string[] {
    const ofp = this.simBriefOfp;
    if (!ofp || ofp.destination?.icao !== destinationIcao) {
      return [];
    }
    return (ofp.alternates ?? (ofp.alternate?.icao ? [ofp.alternate.icao] : [])).slice(0, 6);
  }

  /** @inheritdoc */
  public getOptFlightLevel(): number | null {
    return this.optimumFlightLevel;
  }

  /**
   * The wind and temperature of the route per level for the OPT FL: the entered and propagated winds and SATs, on the
   * ground too, and in flight the measurement fading into them.
   */
  private computeLevelAtmosphere(inFlight: boolean, tropopause: number | null, altitude: number) {
    const plan = this.flightPlanInterface.active;
    const cruiseLevel = plan.performanceData.cruiseFlightLevel.get();
    const cruiseTemperature = plan.performanceData.cruiseTemperature.get();
    const planIsaDeviation =
      cruiseLevel !== null && cruiseTemperature !== null
        ? isaDeviationAt(cruiseLevel * 100, cruiseTemperature, tropopause)
        : null;
    const measured = inFlight
      ? {
          altitude,
          wind: {
            direction: SimVar.GetSimVarValue('AMBIENT WIND DIRECTION', 'Degrees') * MathUtils.DEGREES_TO_RADIANS,
            magnitude: SimVar.GetSimVarValue('AMBIENT WIND VELOCITY', 'Knots'),
          },
          isaDeviation: isaDeviationAt(altitude, SimVar.GetSimVarValue('AMBIENT TEMPERATURE', 'celsius'), tropopause),
        }
      : null;
    return createLevelAtmosphere(
      cruiseLevelAtmosphereInputsFromPlan(plan, plan.activeLegIndex, tropopause, planIsaDeviation, measured),
    );
  }

  private updateOptimumFlightLevel(): void {
    if (!this.flightPlanInterface.hasActive || this.flightPhaseManager.phase > FmgcFlightPhase.Cruise) {
      this.optimumFlightLevel = null;
      return;
    }
    const pd = this.flightPlanInterface.active.performanceData;
    const inFlight = !this.fmgc.isOnGround();
    const tropopause = pd.tropopause.get();
    const altitude = this.fmgc.getPressureAlt() ?? SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet');
    // Design choice: without wind and SAT entries the measured ones in flight, ISA and no wind on the ground
    const isaDeviation = inFlight
      ? isaDeviationAt(altitude, SimVar.GetSimVarValue('AMBIENT TEMPERATURE', 'celsius'), tropopause)
      : 0;
    const atmosphere = this.computeLevelAtmosphere(inFlight, tropopause, altitude);
    this.optimumFlightLevel = this.optimumLevelCache.get({
      costIndex: pd.costIndex.get(),
      grossWeight: this.fmgc.getGrossWeight(),
      recMaxFlightLevel: recMaxAtRouteTemperature(this.getRecMaxFlightLevel(), atmosphere, (routeIsaDeviation) => {
        const grossWeightKg = this.fmgc.getGrossWeightKg();
        return grossWeightKg
          ? Math.min(
              A380AltitudeUtils.calculateRecommendedMaxAltitude(grossWeightKg, routeIsaDeviation),
              maxCertifiedAlt,
            ) / 100
          : null;
      }),
      engineOut: this.fmgc.data.engineOut.get(),
      isaDeviation,
      headwind: inFlight ? -SimVar.GetSimVarValue('AIRCRAFT WIND Z', 'knots') : 0,
      atmosphere,
      tropopause,
      distanceToDestination: this.fmgc.getDistanceToDestination(),
      distanceToTopOfDescent: distanceToTopOfDescent(this.guidanceController),
      currentAltitude: altitude,
      destinationElevation: this.fmgc.getDestinationElevation(),
    });
  }

  /** @inheritdoc */
  public getEoMaxFlightLevel(): number | null {
    const recMax = this.getRecMaxFlightLevel();
    return recMax !== null ? Math.floor((0.8 * recMax) / 5) * 5 : null; // FIXME remove magic
  }

  /** @inheritdoc */
  getFlapRetractionSpeed(forPlan: FlightPlanIndex): number | null {
    if (forPlan === FlightPlanIndex.Active || forPlan === FlightPlanIndex.Temporary) {
      return this.fmgc.data.flapRetractionSpeed.get();
    }
    return null; // TODO secondary flight plans
  }

  /** @inheritdoc */
  getSlatRetractionSpeed(forPlan: FlightPlanIndex): number | null {
    if (forPlan === FlightPlanIndex.Active || forPlan === FlightPlanIndex.Temporary) {
      return this.fmgc.data.slatRetractionSpeed.get();
    }
    return null; // TODO secondary flight plans
  }

  /** @inheritdoc */
  getGreenDotSpeed(forPlan: FlightPlanIndex): number | null {
    if (forPlan === FlightPlanIndex.Active || forPlan === FlightPlanIndex.Temporary) {
      return this.fmgc.data.greenDotSpeed.get();
    }
    return null; // TODO secondary flight plans
  }

  /** @inheritdoc */
  getApproachFlapRetractionSpeed(forPlan: FlightPlanIndex): number | null {
    if (forPlan === FlightPlanIndex.Active || forPlan === FlightPlanIndex.Temporary) {
      return this.fmgc.data.approachFlapRetractionSpeed.get();
    }
    return null; // TODO secondary flight plans
  }

  /** @inheritdoc */
  getApproachSlatRetractionSpeed(forPlan: FlightPlanIndex): number | null {
    if (forPlan === FlightPlanIndex.Active || forPlan === FlightPlanIndex.Temporary) {
      return this.fmgc.data.approachSlatRetractionSpeed.get();
    }
    return null; // TODO secondary flight plans
  }

  getApproachGreenDotSpeed(forPlan: FlightPlanIndex): number | null {
    if (forPlan === FlightPlanIndex.Active || forPlan === FlightPlanIndex.Temporary) {
      return this.fmgc.data.approachGreenDotSpeed.get();
    }
    return null; // TODO secondary flight plans
  }

  /** @inheritdoc */
  getApproachVls(forPlan: FlightPlanIndex): number | null {
    if (forPlan === FlightPlanIndex.Active || forPlan === FlightPlanIndex.Temporary) {
      return this.fmgc.data.approachVls.get();
    }
    return null; // TODO secondary flight plans
  }

  /** @inheritdoc */
  getApproachVapp(forPlan: FlightPlanIndex): number | null {
    if (forPlan === FlightPlanIndex.Active || forPlan === FlightPlanIndex.Temporary) {
      return this.#fmgc.data.approachVapp.get();
    }
    return null; // TODO secondary flight plans
  }

  getApproachVref(forPlan: FlightPlanIndex): number | null {
    if (forPlan === FlightPlanIndex.Active || forPlan === FlightPlanIndex.Temporary) {
      return this.#fmgc.data.approachVref.get();
    }
    return null; // TODO secondary flight plans
  }

  /** @inheritdoc */
  inchesSelectedOnFcu(side: EfisSide): boolean {
    return this.acInterface.isInchesSelectedOnFcu(side);
  }

  private initSimVars() {
    // Reset SimVars
    SimVar.SetSimVarValue('L:A32NX_SPEEDS_MANAGED_PFD', 'knots', -1);

    SimVar.SetSimVarValue('L:A32NX_MachPreselVal', 'mach', -1);
    SimVar.SetSimVarValue('L:A32NX_SpeedPreselVal', 'knots', -1);

    SimVar.SetSimVarValue('L:AIRLINER_DECISION_HEIGHT', 'feet', -1);
    SimVar.SetSimVarValue('L:AIRLINER_MINIMUM_DESCENT_ALTITUDE', 'feet', 0);

    SimVar.SetSimVarValue('L:A32NX_FG_ALTITUDE_CONSTRAINT', 'feet', 0);
    SimVar.SetSimVarValue('L:A32NX_CABIN_READY', 'Bool', 0);
    SimVar.SetSimVarValue('L:A32NX_FM_GROSS_WEIGHT', 'Number', 0);

    if (SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_DISABLED', 'number') === 1) {
      SimVar.SetSimVarValue('K:A32NX.ATHR_RESET_DISABLE', 'number', 1);
    }

    SimVar.SetSimVarValue('L:A32NX_PFD_MSG_SET_HOLD_SPEED', 'bool', false);

    // Reset SimVars
    SimVar.SetSimVarValue('L:A32NX_AIRLINER_CRUISE_ALTITUDE', 'knots', -1);
  }

  public clearLatestFmsErrorMessage() {
    const arr = this.fmsErrors.getArray();
    const index = arr.findIndex((val) => !val.cleared);

    if (index > -1) {
      if (arr[index].message.isTypeTwo) {
        const old = arr[index];
        old.cleared = true;

        this.fmsErrors.set(arr);
        if (old.onClearOverride) {
          old.onClearOverride();
        }
      } else {
        this.fmsErrors.removeAt(index);
      }
    }
  }

  async cpnyFplnRequest(intoPlan: FlightPlanIndex) {
    if (this.uplinkRequestInProgress.get() || this.cpnyFplnRequestedForPlan.get() !== null) {
      return;
    }
    const navigraphUsername = NXDataStore.getLegacy('NAVIGRAPH_USERNAME');
    const overrideSimBriefUserID = NXDataStore.getLegacy('CONFIG_OVERRIDE_SIMBRIEF_USERID', '');

    if (!navigraphUsername && !overrideSimBriefUserID) {
      this.addMessageToQueue(NXFictionalMessages.noNavigraphUser, undefined, undefined);
      throw new Error('No Navigraph username provided');
    }

    // FCOM: only one request at a time (guard above); the button shows REQUEST PENDING... until the flight plan is received
    this.cpnyFplnRequestedForPlan.set(intoPlan);
    this.cpnyFplnUplinkInProgress.set(true);

    const ofp = await this.receiveCompanyFlightPlan(navigraphUsername, overrideSimBriefUserID);
    if (ofp === null) {
      this.cpnyFplnRequestedForPlan.set(null);
      this.cpnyFplnUplinkInProgress.set(false);
      this.addMessageToQueue(NXSystemMessages.noCompanyReply, undefined, undefined);
      return;
    }
    this.simBriefOfp = ofp;

    try {
      await SimBriefUplinkAdapter.uplinkFlightPlanFromSimbrief(
        this,
        this.#flightPlanService,
        intoPlan,
        this.simBriefOfp,
        {
          doUplinkProcedures: false,
        },
      );
      this.checkReceivedFlightNumber(intoPlan);
    } catch (e) {
      this.cpnyFplnRequestedForPlan.set(null);
      console.error(e);
      logTroubleshootingError(this.bus, e);
      this.addMessageToQueue(NXSystemMessages.receivedCpnyFplnNotValid, undefined, undefined);
      this.onUplinkDone(false);
    }
  }

  /**
   * RECEIVED FLT NUMBER NOT VALID (A380 FCOM l.45976-45982): "The received flight number, that is part of the up linked
   * flight plan data, is not valid." (FLT NBR entry format l.43411-43417: maximum 10 alphanumeric characters). The flight
   * number of the flight plan is kept. Design choice: without one, the received flight number stays (the flight crew
   * sees the message and can overwrite it on the INIT page).
   * @param intoPlan the flight plan the uplink is for
   */
  private checkReceivedFlightNumber(intoPlan: FlightPlanIndex): void {
    if (!this.#flightPlanService.hasUplink) {
      return;
    }
    const received = this.#flightPlanService.uplink.flightNumber.get();
    if (isValidA380FlightNumber(received)) {
      return;
    }
    this.addMessageToQueue(NXSystemMessages.receivedFltNumberNotValid, undefined, undefined);
    const current = this.#flightPlanService.has(intoPlan)
      ? this.#flightPlanService.get(intoPlan).flightNumber.get()
      : null;
    if (current !== null) {
      this.#flightPlanService.uplink.setFlightNumber(current);
    }
  }

  /**
   * The answer of the company ground station (SimBrief) to a flight plan request: the OFP, delivered after the datalink
   * reply time of the flypad setting, or null without an answer within the FCOM 4 min (download failed or too slow).
   */
  private receiveCompanyFlightPlan(
    navigraphUsername: string | undefined,
    overrideSimBriefUserID: string,
  ): Promise<ISimbriefData | null> {
    const notBefore = Date.now() + CompanyDatalinkDelay.replyDelayMs();
    const download = SimBriefUplinkAdapter.downloadOfpForUserID(navigraphUsername, overrideSimBriefUserID).catch(
      (e) => {
        // The ground station does not answer: NO COMPANY REPLY at the timeout
        console.error('[FMS] Company F-PLN request: no SimBrief OFP', e);
        return new Promise<never>(() => {});
      },
    );

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), FlightManagementComputer.CPNY_FPLN_REPLY_TIMEOUT_MS);
      download.then(async (ofp) => {
        await CompanyDatalinkDelay.waitForDelivery(notBefore);
        clearTimeout(timeout);
        resolve(ofp);
      });
    });
  }

  getCpnyFplnUplinkInProgress(): Subscribable<boolean> {
    return this.cpnyFplnUplinkInProgress;
  }

  requestCpnyWind(flightPlanIndex: FlightPlanIndex) {
    if (!this.uplinkRequestInProgress.get()) {
      const hasfp = this.flightPlanInterface.has(flightPlanIndex);
      if (!hasfp) {
        return;
      }
      const fp = this.flightPlanInterface.get(
        flightPlanIndex === FlightPlanIndex.Temporary ? FlightPlanIndex.Active : flightPlanIndex,
      );

      fp.pendingWindUplink.onUplinkRequested();
      const windReq = formatWindRequest(
        flightPlanIndex,
        fp,
        this.fmgc.data.flightPhase.get(),
        this.guidanceController,
        this.dataManager,
      );
      this.atsuBusPublisher.pub(
        'wind_uplink_request',
        {
          flightPlan: flightPlanIndex,
          message: windReq,
        },
        true,
        false,
      );
      this.cpnyWindReplyHold.requested(flightPlanIndex);
      this.cpnyWindRequestTimeout.start(flightPlanIndex, () => this.onCompanyWindRequestTimedOut(flightPlanIndex));
      this.cpnyWindRequestedForPlan.set(flightPlanIndex);
      this.cpnyWindUplinkInProgress.set(true);
    }
  }

  /** Delivers a company wind uplink once the datalink reply time of its request has passed (flyPad realism setting) */
  private async deliverCompanyWindUplinkResponse(response: WindUplinkResponse): Promise<void> {
    await this.cpnyWindReplyHold.whenDeliverable(response.flightPlan);
    if (!this.cpnyWindRequestTimeout.settle(response.flightPlan)) {
      // Too late: NO COMPANY REPLY was already given, the request is over
      return;
    }
    this.onCompanyWindUplinkResponseReceived(response);
  }

  /** No answer within the FCOM 4 min (DSC-22-FMS-10-40-90): NO COMPANY REPLY, the request is over */
  private onCompanyWindRequestTimedOut(planIndex: FlightPlanIndex): void {
    if (this.flightPlanInterface.has(planIndex)) {
      this.flightPlanInterface.get(planIndex).pendingWindUplink.onUplinkAborted();
    }
    this.addMessageToQueue(NXSystemMessages.noCompanyReply);
    this.cpnyWindUplinkInProgress.set(false);
    this.cpnyWindRequestedForPlan.set(null);
  }

  async insertCpnyWind(flightPlanIndex: number): Promise<void> {
    const hasfp = this.flightPlanInterface.has(flightPlanIndex);
    if (!hasfp || this.flightPlanInterface.hasTemporary) {
      return;
    }

    const plan = this.flightPlanInterface.get(flightPlanIndex);

    // CHECK ALTN WIND
    if (
      uplinkedAlternateWindLevelDiffers(plan.pendingWindUplink.alternateWind?.altitude, plan.getAlternateCruiseLevel())
    ) {
      this.addMessageToQueue(NXSystemMessages.checkAltnWind);
    }

    await this.flightPlanInterface.insertWindUplink(flightPlanIndex);
    if (flightPlanIndex === FlightPlanIndex.Active) {
      this.windUplinkRecievedActive.set(false);
    } else {
      this.windUplinkRecievedSec[flightPlanIndex - 3].set(false);
    }
  }

  deleteCpnyWind(flightPlanIndex: number): void {
    const hasfp = this.flightPlanInterface.has(flightPlanIndex);
    if (!hasfp || this.flightPlanInterface.hasTemporary) {
      return;
    }
    const fp = this.flightPlanInterface.get(flightPlanIndex);
    fp.pendingWindUplink.delete();
    if (flightPlanIndex === FlightPlanIndex.Active) {
      this.windUplinkRecievedActive.set(false);
    } else {
      this.windUplinkRecievedSec[flightPlanIndex - 3].set(false);
    }
  }

  async insertCpnyFpln(intoPlan: FlightPlanIndex) {
    try {
      this.flightPlanInterface.uplinkInsert(intoPlan);
    } catch (e) {
      console.error(e);
      logTroubleshootingError(this.bus, e);
    }

    const plan = this.flightPlanInterface.get(intoPlan);

    if (intoPlan === FlightPlanIndex.Active) {
      this.acInterface.updateFmsData();
      if (this.simBriefOfp?.cruiseAltitude) {
        this.trySetCruiseFl(this.simBriefOfp.cruiseAltitude / 100, intoPlan);
      }
    }

    plan.setPerformanceData(
      'paxNumber',
      this.simBriefOfp?.weights.passengerCount !== undefined ? Number(this.simBriefOfp?.weights?.passengerCount) : null,
    );

    // FCOM DSC-22-FMS-20-30 COMPANY F-PLN REQUEST: before engine start, performance data come with the flight plan
    if (!this.enginesWereStarted.get() && this.simBriefOfp) {
      this.insertCompanyFuelData(intoPlan, this.simBriefOfp);
    }

    this.cpnyFplnAvailable.set(false);
    this.cpnyFplnRequestedForPlan.set(null);
  }

  deleteCpnyFpln(): void {
    this.flightPlanInterface.uplinkDelete();
    this.cpnyFplnAvailable.set(false);
    this.cpnyFplnRequestedForPlan.set(null);
  }

  getCpnyFplnAvailable(): Subscribable<boolean> {
    return this.cpnyFplnAvailable;
  }
  getUplinkInProgress(): Subscribable<boolean> {
    return this.uplinkRequestInProgress;
  }
  getCpnyFplnRequestedForPlan(): Subscribable<FlightPlanIndex | null> {
    return this.cpnyFplnRequestedForPlan;
  }

  /**
   * The fuel figures of the company flight plan (the SimBrief OFP) into the FUEL&LOAD page, as if entered by the crew:
   * TAXI, RTE RSV (the OFP contingency), ALTN and FINAL (the OFP final reserve). Not the BLOCK: the FUEL PLANNING
   * function computes it from these and the FMS TRIP.
   */
  private insertCompanyFuelData(planIndex: FlightPlanIndex, ofp: ISimbriefData): void {
    const tonnes = (value: number | string | undefined): number | null => {
      const n = Number(value);
      if (value === undefined || value === '' || !Number.isFinite(n) || n < 0) {
        return null;
      }
      return (ofp.units === 'lbs' ? Units.poundToKilogram(n) : n) / 1000;
    };
    /** To the 0.1 t of the entry fields */
    const nearest = (t: number | null) => (t !== null ? Math.round(t * 10) / 10 : null);

    const taxi = nearest(tonnes(ofp.fuel.taxi));
    if (taxi !== null) {
      this.flightPlanInterface.setPerformanceData('pilotTaxiFuel', taxi, planIndex);
    }
    const routeReserve = nearest(tonnes(ofp.fuel.contingency));
    if (routeReserve !== null) {
      this.flightPlanInterface.setPerformanceData('pilotRouteReserveFuel', routeReserve, planIndex);
      this.flightPlanInterface.setPerformanceData('pilotRouteReserveFuelPercentage', null, planIndex);
    }
    const alternate = this.flightPlanInterface.get(planIndex).alternateDestinationAirport
      ? nearest(tonnes(ofp.alternate?.burn))
      : null;
    if (alternate !== null) {
      this.flightPlanInterface.setPerformanceData('pilotAlternateFuel', alternate, planIndex);
    }
    const final = nearest(tonnes(ofp.fuel.reserve));
    if (final !== null) {
      this.flightPlanInterface.setPerformanceData('pilotFinalHoldingFuel', final, planIndex);
      this.flightPlanInterface.setPerformanceData('pilotFinalHoldingTime', null, planIndex);
    }
  }

  /**
   * Called when a flight plan uplink is in progress
   */
  onUplinkInProgress() {
    this.cpnyFplnUplinkInProgress.set(true);
  }

  /**
   * Called when a flight plan uplink is done
   */
  onUplinkDone(fltPlnReceived: boolean) {
    this.cpnyFplnUplinkInProgress.set(false);
    this.cpnyFplnAvailable.set(fltPlnReceived);
  }

  canActivateOrSwapSecondary(secIndex: number): boolean {
    if (!this.flightPlanInterface.hasSecondary(secIndex) || this.flightPlanInterface.hasTemporary) {
      return false;
    }

    const activePlan = this.flightPlanInterface.active;

    const secPlan = this.flightPlanInterface.secondary(secIndex);
    if (!secPlan.originAirport || !secPlan.destinationAirport) {
      return false;
    }

    const activeToLeg = activePlan.activeLeg;
    const secToLeg = secPlan.activeLeg;

    return (
      this.acInterface.isHdgOrTrackModeEngaged().get() ||
      (activeToLeg === undefined && secToLeg === undefined) ||
      (activeToLeg !== undefined &&
        secToLeg !== undefined &&
        FlightPlanUtils.areFlightPlanElementsSame(activeToLeg, secToLeg) &&
        activePlan.activeLegIndex === secPlan.activeLegIndex) ||
      this.flightPhase.get() === FmgcFlightPhase.Preflight
    );
  }

  public async swapActiveAndSecondaryPlan(index: number) {
    const canActivateOrSwapSec = this.canActivateOrSwapSecondary(index);

    if (!canActivateOrSwapSec) {
      return;
    }

    const zfwDiff = this.computeZfwDiffToSecondary(index);
    const zfwCgDiff = this.computeZfwCgDiffToSecondary(index);
    const oldDestination = this.#flightPlanService.active?.destinationAirport;

    if (this.#flightPlanService.hasActive) {
      await this.#flightPlanService.activeAndSecondarySwap(index, !this.enginesWereStarted.get());
    } else {
      await this.#flightPlanService.secondaryActivate(index, !this.enginesWereStarted.get());
    }

    await this.onSecondaryActivated(zfwDiff, zfwCgDiff, oldDestination);
  }

  private async onSecondaryActivated(
    zfwDiff: number | null,
    zfwCgDiff: number | null,
    oldDestination: Airport | undefined,
  ) {
    const phase = this.#fmgc.getFlightPhase();

    if (phase === FmgcFlightPhase.Preflight || phase === FmgcFlightPhase.Done) {
      this.addMessageToQueue(NXSystemMessages.checkToData);
      const flex = this.#flightPlanService.active?.performanceData.flexTakeoffTemperature.get();
      SimVar.SetSimVarValue('L:A32NX_AIRLINER_TO_FLEX_TEMP', 'Number', flex === 0 ? 0.1 : flex ?? 0);
      const performanceData = this.#flightPlanService.active?.performanceData;
      writeTakeoffDerate(performanceData?.takeoffPowerSetting?.get(), performanceData?.takeoffDeratedSetting?.get());
    }

    if (zfwDiff !== null && zfwDiff > 5 && zfwCgDiff !== null && zfwCgDiff > 0.5) {
      this.addMessageToQueue(NXSystemMessages.checkZfw);
      const sub = this.#flightPlanService.active?.performanceData.zeroFuelWeight.sub((_) => {
        this.removeMessageFromQueue(NXSystemMessages.checkZfw.text);
        sub.destroy();
      });
    }

    if (oldDestination) {
      this.checkDestination(oldDestination.ident);
    }
  }

  /**
   * Called when the active flight plan changes, e.g. when a secondary flight plan is activated.
   */
  private async onActiveFlightPlanChanged(): Promise<void> {
    this.hasActiveFlightPlanWithCityPair.set(
      this.#flightPlanService.hasActive &&
        this.#flightPlanService.active.originAirport !== undefined &&
        this.#flightPlanService.active.destinationAirport !== undefined,
    );

    if (this.#flightPlanService.hasActive) {
      // We invalidate because we don't want to show the old active plan predictions on the newly activated secondary plan.
      this.guidanceController?.vnavDriver?.invalidateFlightPlanProfile();

      const flightNumber = this.#flightPlanService.active.flightNumber.get();
      if (flightNumber !== null) {
        await this.onActiveFlightNumberChanged(flightNumber);
      }
    }
    this.loadActiveFlightPlanFuelAndApproachData();
  }

  public async updateFlightNumber(
    flightNumber: string,
    forPlan: FlightPlanIndex,
    callback = EmptyCallback.Boolean,
  ): Promise<void> {
    await this.#flightPlanService.setFlightNumber(flightNumber, forPlan);

    if (forPlan === FlightPlanIndex.Active) {
      await this.onActiveFlightNumberChanged(flightNumber);
      // A flight number entered again connects the datalink networks again, e.g. after a failed connection
      this.#datalinkConnection?.reconnect();
    }

    return callback(true);
  }

  /**
   * This updates the Arinc429 words for the flight number and set the flight number in the sim for third party stuff.
   * To be called after the flight number of the active flight plan has changed.
   * FIXME should probably just be a subscription handler for the flight number subject once we have that
   * @param flightNumber The flight number to set
   */
  private async onActiveFlightNumberChanged(flightNumber: string) {
    this.acInterface.arincFlightNumber1.setIso5Value(
      flightNumber.substring(0, 2),
      Arinc429SignStatusMatrix.NormalOperation,
    );
    this.acInterface.arincFlightNumber2.setIso5Value(
      flightNumber.substring(2, 4),
      Arinc429SignStatusMatrix.NormalOperation,
    );
    this.acInterface.arincFlightNumber3.setIso5Value(
      flightNumber.substring(4, 6),
      Arinc429SignStatusMatrix.NormalOperation,
    );
    this.acInterface.arincFlightNumber4.setIso5Value(
      flightNumber.substring(6, 8),
      Arinc429SignStatusMatrix.NormalOperation,
    );

    this.acInterface.arincFlightNumber5.setIso5Value(
      flightNumber.substring(9, 10),
      Arinc429SignStatusMatrix.NormalOperation,
    );

    // Send to the sim for third party stuff.
    SimVar.SetSimVarValue('ATC FLIGHT NUMBER', 'string', flightNumber, 'FMC');
  }

  /**
   * Follows the flight number of the active flight plan, whatever its source (INIT page entry, company flight plan
   * uplink, SEC activation, flight number already there when the aircraft is loaded): sends it to the aircraft systems
   * and connects the datalink networks with it.
   */
  private updateActiveFlightNumber(): void {
    const flightNumber =
      (this.#flightPlanService.hasActive && this.#flightPlanService.active.flightNumber.get()) || null;
    if (flightNumber !== this.#activeFlightNumber) {
      this.#activeFlightNumber = flightNumber;
      if (flightNumber !== null) {
        void this.onActiveFlightNumberChanged(flightNumber);
      }
    }
    this.#datalinkConnection?.update(flightNumber);
  }

  private computeZfwDiffToSecondary(secIndex: number): number | null {
    const activePlan = this.#flightPlanService.active;
    const secondaryPlan = this.#flightPlanService.secondary(secIndex);

    const activeZfw = activePlan.performanceData.zeroFuelWeight.get();
    const secondaryZfw = secondaryPlan.performanceData.zeroFuelWeight.get();

    return activeZfw !== null && secondaryZfw !== null ? Math.abs(activeZfw - secondaryZfw) : null;
  }

  private computeZfwCgDiffToSecondary(secIndex: number): number | null {
    const activePlan = this.#flightPlanService.active;
    const secondaryPlan = this.#flightPlanService.secondary(secIndex);

    const activeZfwCg = activePlan.performanceData.zeroFuelWeightCenterOfGravity.get();
    const secondaryZfwCg = secondaryPlan.performanceData.zeroFuelWeightCenterOfGravity.get();

    return activeZfwCg !== null && secondaryZfwCg !== null ? Math.abs(activeZfwCg - secondaryZfwCg) : null;
  }

  /** @inheritdoc */
  public timeConstraintOf(planIndex: number): TimeConstraint | null {
    return this.#flightPlanService.timeConstraintOf(planIndex);
  }

  /** The optimum step point of the STEP ALTs panel */
  public readonly optimumStep = new A380OptimumStepSearch(this);

  #flsBeamPublisher: FlsBeamPublisher | null = null;

  private get flsBeamPublisher(): FlsBeamPublisher {
    return (this.#flsBeamPublisher ??= new FlsBeamPublisher(this.bus));
  }

  /** @inheritdoc */
  public setTimeConstraint(planIndex: number, rta: TimeConstraint | null): void {
    this.#flightPlanService.setTimeConstraint(rta, planIndex);
  }

  readonly #rtaFunction = new A380xRtaFunction({
    flightPlanService: this.#flightPlanService,
    guidanceController: () => this.#guidanceController,
    flightPhase: () => this.flightPhase.get(),
    engineOut: () => this.fmgc.data.engineOut.get(),
    inManualHoldOrItsDeceleration: () => this.acInterface?.getHoldDecelReached() ?? false,
    utcSeconds: () => this.#timeKeeper.utcSeconds.get(),
    estimatedTakeoffTime: this.fmgc.data.estimatedTakeoffTime,
    activeRtaSpeeds: () => this.fmgc.activeRtaSpeedRange(),
    setRtaSpeedBias: (bias) => (this.fmgc.rtaSpeedBias = bias),
    addMessageToQueue: (message, isResolved) => this.addMessageToQueue(message, isResolved),
    removeMessageFromQueue: (text) => this.removeMessageFromQueue(text),
  });

  /** @inheritdoc */
  get rtaFunction(): A380xRtaFunction {
    return this.#rtaFunction;
  }

  readonly #timeMarkers = new A380xTimeMarkers({
    utcSeconds: () => this.#timeKeeper.utcSeconds.get(),
    predictionReferenceUtcSeconds: () => this.#rtaFunction.etaUtcSeconds(0),
    addMessageToQueue: (message) => this.addMessageToQueue(message),
  });

  /** @inheritdoc */
  get timeMarkers(): A380xTimeMarkers {
    return this.#timeMarkers;
  }

  /**
   * The takeoff data of the FMS, as in a company takeoff data request: from the active flight plan and the load data
   * (A380 FCOM DSC-22-FMS, COMPANY T.O DATA REQUEST page)
   */
  public companyTakeoffDataRequestContent(): CompanyTakeoffDataRequestContent {
    const plan = this.flightPlanInterface.hasActive ? this.flightPlanInterface.active : null;
    const pd = plan?.performanceData;
    const power = pd?.takeoffPowerSetting?.get();
    return {
      departure: plan?.originAirport?.ident ?? null,
      tow: this.getTakeoffWeight(FlightPlanIndex.Active),
      // The T.O CG entered in THS FOR, if any (the ZFW CG is not the T.O CG)
      cg: pd?.takeoffThsFor?.get() ?? null,
      oat: this.getStaticAirTemperature(),
      runways: plan?.originRunway
        ? [
            {
              runway: plan.originRunway.ident.substring(4),
              windDirection: null,
              windSpeed: null,
              qnh: Math.round(SimVar.GetSimVarValue('KOHLSMAN SETTING MB:1', 'millibars')),
              runwayCondition: 0,
              thrust:
                power === TakeoffPowerSetting.FLEX
                  ? 'FLEX'
                  : power === TakeoffPowerSetting.DERATED
                    ? 'DERATED'
                    : power === TakeoffPowerSetting.TOGA
                      ? 'TOGA'
                      : null,
              flaps: pd?.takeoffFlaps.get() ?? null,
              shift: pd?.takeoffShift.get() ?? null,
              toLimit: null,
            },
          ]
        : [],
    };
  }

  /**
   * The landing data of the FMS for the flypad landing calculator: the destination of the active flight plan, the
   * predicted landing weight, and the destination conditions and landing configuration of the PERF APPR page
   */
  public fmsLandingDataContent(): FmsLandingDataContent {
    const plan = this.flightPlanInterface.hasActive ? this.flightPlanInterface.active : null;
    const pd = plan?.performanceData;
    return {
      destination: plan?.destinationAirport?.ident ?? null,
      runway: plan?.destinationRunway ? plan.destinationRunway.ident.substring(4) : null,
      landingWeight: plan ? this.getLandingWeight(FlightPlanIndex.Active) : null,
      qnh: fmsQnhToHectopascal(pd?.approachQnh.get() ?? null),
      oat: pd?.approachTemperature.get() ?? null,
      windDirection: pd?.approachWindDirection.get() ?? null,
      windSpeed: pd?.approachWindMagnitude.get() ?? null,
      conf: pd ? (pd.approachFlapsThreeSelected.get() ? LandingConf.Conf3 : LandingConf.Full) : null,
    };
  }

  /**
   * The descent data of the FMS for the flypad descent calculator: cruise level, destination, distance to it, gross
   * weight, and the managed descent speeds and speed limit of the active flight plan
   */
  public fmsDescentDataContent(): FmsDescentDataContent {
    const plan = this.flightPlanInterface.hasActive ? this.flightPlanInterface.active : null;
    const pd = plan?.performanceData;
    const cruiseLevel = pd?.cruiseFlightLevel.get() ?? null;
    return {
      cruiseAltitude: cruiseLevel !== null ? cruiseLevel * 100 : null,
      destination: plan?.destinationAirport?.ident ?? null,
      destinationElevation: plan?.destinationAirport?.location.alt ?? null,
      distanceToDestination: plan ? this.fmgc.getDistanceToDestination() : null,
      grossWeight: this.fmgc.getGrossWeightKg(),
      costIndex: pd?.costIndex.get() ?? null,
      managedMach: plan ? this.fmgc.getManagedDescentSpeedMach() : null,
      managedCas: plan ? this.fmgc.getManagedDescentSpeed() : null,
      speedLimitCas: pd?.descentSpeedLimitSpeed.get() ?? null,
      speedLimitAltitude: pd?.descentSpeedLimitAltitude.get() ?? null,
      waypoints: plan ? descentTargetWaypoints(plan, this.fmgc.getDistanceToDestination()) : [],
    };
  }

  /**
   * Whether received company takeoff data can be inserted (A380 FCOM DSC-22-FMS-20-30 P 316-319, RECEIVED COMPANY T.O
   * DATA page): the departure airport and runway of the active flight plan, a TOW not more than 2 t below or 7 t above
   * the FMS one, and the takeoff speeds, TOW, T.O CG, wind, runway condition, baro setting and temperature in the data.
   * @returns whether it can be inserted, whether the runway is not the active one (amber), and whether the TOW disagrees
   *   with the FMS one (amber, with UPLINK/ACTIVE TOW DISAGREE on the active runway)
   */
  public checkCompanyTakeoffData(uplink: CompanyTakeoffDataUplink): {
    insertable: boolean;
    runwayDisagree: boolean;
    towDisagree: boolean;
  } {
    const plan = this.flightPlanInterface.hasActive ? this.flightPlanInterface.active : null;
    const runwayMatches =
      plan !== null &&
      plan.originAirport?.ident === uplink.departure &&
      plan.originRunway !== undefined &&
      plan.originRunway.ident.substring(4) === uplink.runway;
    const fmsTow = this.getTakeoffWeight(FlightPlanIndex.Active);
    const towAgrees =
      fmsTow !== null && fmsTow !== undefined && uplink.tow >= fmsTow - 2_000 && uplink.tow <= fmsTow + 7_000;
    const complete = uplink.v1 !== null && uplink.vr !== null && uplink.cg !== null;
    return {
      insertable: runwayMatches && towAgrees && complete && this.flightPhase.get() < FmgcFlightPhase.Takeoff,
      runwayDisagree: !runwayMatches,
      towDisagree: !towAgrees,
    };
  }

  /**
   * INSERT: the received company takeoff data updates the T.O panel of the PERF page with the takeoff speeds, flaps
   * setting, takeoff thrust, takeoff shift, thrust reduction and acceleration altitudes and noise parameters (A380 FCOM
   * DSC-22-FMS-20-30 P 319). The T.O CG is not inserted: the flight crew enters it in THS FOR.
   */
  public insertCompanyTakeoffData(uplink: CompanyTakeoffDataUplink): boolean {
    if (!this.checkCompanyTakeoffData(uplink).insertable) {
      this.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
      return false;
    }
    const plan = FlightPlanIndex.Active;
    this.flightPlanInterface.setPerformanceData('v1', uplink.v1, plan);
    SimVar.SetSimVarValue('L:AIRLINER_V1_SPEED', 'Knots', uplink.v1);
    this.flightPlanInterface.setPerformanceData('vr', uplink.vr, plan);
    SimVar.SetSimVarValue('L:AIRLINER_VR_SPEED', 'Knots', uplink.vr);
    this.flightPlanInterface.setPerformanceData('v2', uplink.v2, plan);
    SimVar.SetSimVarValue('L:AIRLINER_V2_SPEED', 'Knots', uplink.v2);
    this.flightPlanInterface.setPerformanceData('takeoffFlaps', uplink.flaps as 1 | 2 | 3, plan);
    this.acInterface.setTakeoffFlaps(uplink.flaps);
    if (uplink.thrust === 'FLEX' && uplink.flexTemperature !== null) {
      this.flightPlanInterface.setPerformanceData('flexTakeoffTemperature', uplink.flexTemperature, plan);
      this.flightPlanInterface.setPerformanceData('takeoffPowerSetting', TakeoffPowerSetting.FLEX, plan);
      // 0 means no FLEX, 0.1 a FLEX temperature of 0
      SimVar.SetSimVarValue(
        'L:A32NX_AIRLINER_TO_FLEX_TEMP',
        'Number',
        uplink.flexTemperature === 0 ? 0.1 : uplink.flexTemperature,
      );
    } else {
      this.flightPlanInterface.setPerformanceData('takeoffPowerSetting', TakeoffPowerSetting.TOGA, plan);
      SimVar.SetSimVarValue('L:A32NX_AIRLINER_TO_FLEX_TEMP', 'Number', 0);
    }
    // the uplinked thrust is TOGA or FLEX: no DOx derate for the FADECs
    writeTakeoffDerate(TakeoffPowerSetting.TOGA, null);
    this.flightPlanInterface.setPerformanceData('takeoffShift', uplink.shift, plan);
    if (uplink.thrustReductionAltitude !== null) {
      this.flightPlanInterface.setPerformanceData('pilotThrustReductionAltitude', uplink.thrustReductionAltitude, plan);
    }
    if (uplink.accelerationAltitude !== null) {
      this.flightPlanInterface.setPerformanceData('pilotAccelerationAltitude', uplink.accelerationAltitude, plan);
    }
    if (uplink.engineOutAccelerationAltitude !== null) {
      this.flightPlanInterface.setPerformanceData(
        'pilotEngineOutAccelerationAltitude',
        uplink.engineOutAccelerationAltitude,
        plan,
      );
    }
    if (uplink.noise !== null) {
      this.flightPlanInterface.setPerformanceData('noiseEnabled', true, plan);
      this.flightPlanInterface.setPerformanceData('noiseEndAltitude', uplink.noise.endAltitude, plan);
      this.flightPlanInterface.setPerformanceData('noiseSpeed', uplink.noise.speed, plan);
      this.flightPlanInterface.setPerformanceData('noiseN1', uplink.noise.n1, plan);
    }
    this.companyTakeoffData.remove(uplink);
    return true;
  }

  computeAlternateCruiseLevel(forPlan: FlightPlanIndex): number | undefined {
    // The plan applies the A380 rule of FpmConfigs.A380 (AlternateCruiseLevel.ts, A380 FCOM l.42387)
    return this.#flightPlanService.has(forPlan)
      ? this.#flightPlanService.get(forPlan).getAlternateCruiseLevel()
      : undefined;
  }

  private checkDestination(oldDestination: string) {
    const newDestination = this.#flightPlanService.active.destinationAirport?.ident;

    // Enabling alternate or new DEST should sequence out of the GO AROUND phase
    if (newDestination && newDestination !== oldDestination) {
      this.flightPhaseManager.handleNewDestinationAirportEntered();
    }
  }

  /**
   * Calling this function with a message should display the message in the FMS' message area,
   * such as the scratchpad or a dedicated error line. The FMS error type given should be translated
   * into the appropriate message for the UI
   *
   * @param errorType the message to show
   * @param details extra text to be appended on the second line of the message area
   */
  showFmsErrorMessage(errorType: FmsErrorType, details?: string) {
    switch (errorType) {
      case FmsErrorType.EntryOutOfRange:
        this.addMessageToQueue(NXSystemMessages.entryOutOfRange, undefined, undefined, details);
        break;
      case FmsErrorType.FormatError:
        this.addMessageToQueue(NXSystemMessages.formatError, undefined, undefined, details);
        break;
      case FmsErrorType.NotInDatabase:
        this.addMessageToQueue(NXSystemMessages.notInDatabase, undefined, undefined);
        break;
      case FmsErrorType.NotYetImplemented:
        this.addMessageToQueue(NXFictionalMessages.notYetImplemented, undefined, undefined);
        break;
      case FmsErrorType.ListOf99InUse:
        // The A380 pilot-stored waypoints database holds 50 waypoints, all used by the flight plans
        this.addMessageToQueue(NXSystemMessages.wptsMaxAllInUse, undefined, undefined);
        break;
      case FmsErrorType.NotAllowed:
        this.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
        break;
      case FmsErrorType.PlaceWaypointDisagree:
        this.addMessageToQueue(NXSystemMessages.placeWptDisagree, undefined, undefined);
        break;
      default:
        break;
    }
  }

  /**
   * Duplicate implementation, because WaypointEntryUtils needs one parameter with both DataInterface and DisplayInterface
   */
  async deduplicateFacilities<T extends DatabaseItem<any>>(items: T[]): Promise<T | undefined> {
    return this.mfdReference?.deduplicateFacilities(items);
  }

  /**
   * Duplicate implementation, because WaypointEntryUtils needs one parameter with both DataInterface and DisplayInterface
   */
  async createNewWaypoint(ident: string): Promise<Waypoint | undefined> {
    // A380 FCOM DSC-22-FMS-20-30, DATA / WAYPOINT page: the PILOT STORED WPTs panel opens with the new waypoint
    // function for an ident that is neither in the navigation database nor pilot created
    this.mfdReference?.uiService.navigateTo(`fms/data/waypoint/new/${ident}/withReturn`);
    return undefined;
  }

  /**
   * Add message to fmgc message queue
   * @param _message MessageObject
   * @param _isResolvedOverride Function that determines if the error is resolved at this moment (type II only).
   * @param _onClearOverride Function that executes when the error is actively cleared by the pilot (type II only).
   * @param details text to be appended to the second line of the message if applicable
   */
  public addMessageToQueue(
    _message: TypeIMessage | TypeIIMessage,
    _isResolvedOverride: (() => boolean) | undefined = undefined,
    _onClearOverride: (() => void) | undefined = undefined,
    details?: string,
  ) {
    const message =
      _isResolvedOverride === undefined && _onClearOverride === undefined
        ? _message
        : _message.getModifiedMessage('', _isResolvedOverride, _onClearOverride);

    const msg: FmsErrorMessage = {
      message: _message,
      messageText: details ? message.text.concat('\n').concat(details) : message.text,
      backgroundColor: message.isAmber ? 'amber' : 'white',
      cleared: false,
      onClearOverride: isTypeIIMessage(message) ? message.onClear : () => {},
      isResolvedOverride: isTypeIIMessage(message) ? message.isResolved : () => false,
    };

    const exists = this.fmsErrors.getArray().findIndex((el) => el.messageText === msg.messageText && el.cleared);
    if (exists !== -1) {
      this.fmsErrors.removeAt(exists);
    }
    this.fmsErrors.insert(msg, 0);
  }

  /**
   * Removes a message from the queue
   * @param value {String}
   */
  removeMessageFromQueue(value: string) {
    const exists = this.fmsErrors.getArray().findIndex((el) => el.messageText === value);
    if (exists !== -1) {
      this.fmsErrors.removeAt(exists);
    }
  }

  private updateMessageQueue() {
    this.fmsErrors.getArray().forEach((it, idx) => {
      if (it.message.isTypeTwo && it.isResolvedOverride()) {
        console.warn(`message "${it.messageText}" is resolved.`);
        this.fmsErrors.removeAt(idx);
      }
    });
  }

  openMessageList() {
    this.mfdReference?.openMessageList();
  }

  createLatLonWaypoint(coordinates: Coordinates, stored: boolean, ident?: string): PilotWaypoint | null {
    return this.dataManager?.createLatLonWaypoint(coordinates, stored, ident) ?? null;
  }

  createPlaceBearingPlaceBearingWaypoint(
    place1: Fix,
    bearing1: DegreesTrue,
    place2: Fix,
    bearing2: DegreesTrue,
    stored?: boolean,
    ident?: string,
  ): PilotWaypoint | null {
    return (
      this.dataManager?.createPlaceBearingPlaceBearingWaypoint(place1, bearing1, place2, bearing2, stored, ident) ??
      null
    );
  }

  createPlaceBearingDistWaypoint(
    place: Fix,
    bearing: DegreesTrue,
    distance: NauticalMiles,
    stored?: boolean,
    ident?: string,
  ): PilotWaypoint | null {
    return this.dataManager?.createPlaceBearingDistWaypoint(place, bearing, distance, stored, ident) ?? null;
  }

  createPlaceDistWaypoint(
    place: Fix,
    distance: NauticalMiles,
    coordinates: Coordinates,
    stored?: boolean,
    ident?: string,
  ): PilotWaypoint | null {
    return this.dataManager?.createPlaceDistWaypoint(place, distance, coordinates, stored, ident) ?? null;
  }

  getStoredWaypointsByIdent(ident: string): PilotWaypoint[] {
    return this.dataManager?.getStoredWaypointsByIdent(ident) ?? [];
  }

  /**
   * This method is called by the FlightPhaseManager after a flight phase change
   * @param prevPhase Previous FmgcFlightPhase
   * @param nextPhase New FmgcFlightPhase
   */
  onFlightPhaseChanged(prevPhase: FmgcFlightPhase, nextPhase: FmgcFlightPhase) {
    SimVar.SetSimVarValue('L:A32NX_CABIN_READY', 'Bool', 0);
    this.isReset.set(false);
    this.fmgc.data.flightPhase.set(nextPhase);

    switch (nextPhase) {
      case FmgcFlightPhase.Takeoff: {
        this.destDataCheckedInCruise = false;

        const plan = this.flightPlanInterface.active;
        const pd = this.fmgc.data;
        let thrustOrAccelerationChanged = false;

        if (!plan.performanceData.accelerationAltitude.get()) {
          // it's important to set this immediately as we don't want to immediately sequence to the climb phase
          plan.setPerformanceData(
            'pilotAccelerationAltitude',
            SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet') +
              parseInt(NXDataStore.getLegacy('CONFIG_ACCEL_ALT', '1500')),
          );
          thrustOrAccelerationChanged = true;
        }
        if (!plan.performanceData.engineOutAccelerationAltitude.get()) {
          // it's important to set this immediately as we don't want to immediately sequence to the climb phase
          plan.setPerformanceData(
            'pilotEngineOutAccelerationAltitude',
            SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet') +
              parseInt(NXDataStore.getLegacy('CONFIG_ACCEL_ALT', '1500')),
          );
          thrustOrAccelerationChanged = true;
        }

        pd.tripFuelAtPreflight.set((this.getTripFuel() ?? 0) / 1000); // in tons
        this.flightPlanInterface.active.performanceData.takeoffWeight?.set(this.fmgc.getGrossWeightKg());

        this.#flightPlanService.active.setPerformanceData('pilotTaxiFuel', null);
        this.#flightPlanService.active.setPerformanceData('pilotRouteReserveFuel', null);
        this.#flightPlanService.active.setPerformanceData('pilotRouteReserveFuelPercentage', 0);

        this.fmgc.data.climbPredictionsReferenceAutomatic.set(
          this.guidanceController.verticalProfileComputationParametersObserver.get().fcuAltitude,
        );

        /** Arm preselected speed/mach for next flight phase */
        const climbPreSel = plan.performanceData.preselectedClimbSpeed.get();
        if (climbPreSel) {
          this.acInterface.updatePreSelSpeedMach(climbPreSel);
        }
        if (thrustOrAccelerationChanged) {
          this.acInterface.updateThrustReductionAcceleration();
        }

        break;
      }

      case FmgcFlightPhase.Climb: {
        this.destDataCheckedInCruise = false;

        const plan = this.flightPlanInterface.active;
        /** Activate pre selected speed/mach */
        if (prevPhase === FmgcFlightPhase.Takeoff) {
          const climbPreSel = plan.performanceData.preselectedClimbSpeed.get();
          if (climbPreSel) {
            this.acInterface.activatePreSelSpeedMach(climbPreSel);
          }
        }

        /** Arm preselected speed/mach for next flight phase */
        const preselectedSpeed = plan.performanceData.preselectedCruiseSpeed.get();
        this.acInterface.updatePreSelSpeedMach(preselectedSpeed);

        const fcuAltitude = this.acInterface.getFcuSelectedAltitude();

        if (fcuAltitude !== null && !plan.performanceData.cruiseFlightLevel.get()) {
          this.flightPlanInterface.active.setPerformanceData('cruiseFlightLevel', fcuAltitude / 100);
          SimVar.SetSimVarValue('L:A32NX_AIRLINER_CRUISE_ALTITUDE', 'number', fcuAltitude);
        }

        break;
      }

      case FmgcFlightPhase.Cruise: {
        this.destDataCheckedInCruise = false;
        const preselectedCruiseSpeed = this.flightPlanInterface.active.performanceData.preselectedCruiseSpeed.get();

        /** Activate pre selected speed/mach */
        if (prevPhase === FmgcFlightPhase.Climb && preselectedCruiseSpeed) {
          this.acInterface.activatePreSelSpeedMach(preselectedCruiseSpeed);
        }
        this.#checkSpeedModeMessage.onFlightPhaseChanged(prevPhase, nextPhase, !!preselectedCruiseSpeed);
        break;
      }

      case FmgcFlightPhase.Descent: {
        this.removeMessageFromQueue(NXSystemMessages.newCrzAlt.text);
        this.checkDestData();

        this.#checkSpeedModeMessage.onFlightPhaseChanged(prevPhase, nextPhase, false);

        this.deleteWindUplinkOrDraftFromAllPlans();

        /** Clear pre selected speed/mach */
        this.acInterface.updatePreSelSpeedMach(null);
        this.flightPlanInterface.active.setPerformanceData('cruiseFlightLevel', null);

        break;
      }

      case FmgcFlightPhase.Approach: {
        this.removeMessageFromQueue(NXSystemMessages.newCrzAlt.text);
        this.checkDestData();
        this.deleteWindUplinkOrDraftFromAllPlans();

        break;
      }

      case FmgcFlightPhase.GoAround: {
        this.deleteWindUplinkOrDraftFromAllPlans();
        SimVar.SetSimVarValue('L:A32NX_GOAROUND_INIT_SPEED', 'number', Simplane.getIndicatedSpeed());

        this.flightPlanInterface.stringMissedApproach(
          /** @type {FlightPlanLeg} */ (map) => {
            this.addMessageToQueue(NXSystemMessages.cstrDelUpToWpt.getModifiedMessage(map.ident));
          },
        );

        const activePlan = this.flightPlanInterface.active;
        if (!activePlan.performanceData.missedAccelerationAltitude.get()) {
          // it's important to set this immediately as we don't want to immediately sequence to the climb phase
          activePlan.setPerformanceData(
            'pilotMissedAccelerationAltitude',
            SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet') +
              parseInt(NXDataStore.getLegacy('CONFIG_ENG_OUT_ACCEL_ALT', '1500')),
          );
          this.acInterface.updateThrustReductionAcceleration();
        }
        if (!activePlan.performanceData.missedEngineOutAccelerationAltitude.get()) {
          // it's important to set this immediately as we don't want to immediately sequence to the climb phase
          activePlan.setPerformanceData(
            'pilotMissedEngineOutAccelerationAltitude',
            SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet') +
              parseInt(NXDataStore.getLegacy('CONFIG_ENG_OUT_ACCEL_ALT', '1500')),
          );
          this.acInterface.updateThrustReductionAcceleration();
        }

        break;
      }

      case FmgcFlightPhase.Done:
        this.costIndexDefault.storeAtDone(
          this.flightPlanInterface.hasActive ? this.flightPlanInterface.active.performanceData.costIndex.get() : null,
        );
        this.flightPlanInterface
          .reset()
          .then(() => {
            this.fmgc.data.reset(true);
            this.initSimVars();
            this.deleteAllStoredWaypoints();
            this.clearLatestFmsErrorMessage();
            this.acInterface.resetDestinationPredictions();
            SimVar.SetSimVarValue('L:A32NX_COLD_AND_DARK_SPAWN', 'Bool', true).then(() => {
              this.mfdReference?.uiService.navigateTo('fms/data/status');
              this.isReset.set(true);
            });
          })
          .catch(console.error);
        break;

      default:
        break;
    }
  }

  updateCheckSpeedModeMessage() {
    this.#checkSpeedModeMessage.update(this.flightPlanInterface.hasActive ? this.flightPlanInterface.active : null);
  }

  resetAtisAutoUpdate() {
    this.datalinkBusPublisher.pub('reset_auto_update', null, false, false);
  }

  getWindUplinkAvailableForPlan(flightPlanIndex?: FlightPlanIndex): Subscribable<boolean> {
    if (flightPlanIndex !== undefined) {
      if (flightPlanIndex === FlightPlanIndex.Active) {
        return this.uplinkWaitingInsertionActive;
      } else if (flightPlanIndex >= FlightPlanIndex.FirstSecondary) {
        return this.uplinkWaitingInsertionSec[flightPlanIndex - 3];
      }
    }
    return this.isAnyWindUplinkRecieved;
  }

  getCpnyWindUplinkInProgress(): Subscribable<boolean> {
    return this.cpnyWindUplinkInProgress;
  }

  getCpnyWindRequestedForPlan(): Subscribable<FlightPlanIndex | null> {
    return this.cpnyWindRequestedForPlan;
  }

  private checkDestData(): void {
    if (!this.destDataEntered.get()) {
      this.addMessageToQueue(NXSystemMessages.enterDestData);
    }
    const shoudTriggerCheckDestData = this.approachWindDirection.get() !== null && !this.destDataIsPilotEntered.get();
    this.checkDestDataMessage.set(shoudTriggerCheckDestData);
  }

  private zfwInitDisplayed = 0;

  private initMessageSettable = false;

  private checkZfwParams(): void {
    const eng2state = SimVar.GetSimVarValue('L:A32NX_ENGINE_STATE:2', 'Number');
    const eng3state = SimVar.GetSimVarValue('L:A32NX_ENGINE_STATE:3', 'Number');

    if (eng2state === 2 || eng3state === 2) {
      if (this.zfwInitDisplayed < 1 && this.flightPhaseManager.phase < FmgcFlightPhase.Takeoff) {
        this.initMessageSettable = true;
      }
    }
    // INITIALIZE ZFW/ZFW CG
    if (this.fmgc.isAnEngineOn() && this.ZfwOrZfwCgUndefined.get() && this.initMessageSettable) {
      this.addMessageToQueue(NXSystemMessages.initializeZfwOrZfwCg);
      this.zfwInitDisplayed++;
      this.initMessageSettable = false;
    }
  }

  private onUpdate(dt: number) {
    // Stop early, if not FmcA or if all FMCs failed
    const readBool = (name: string) => SimVar.GetSimVarValue(name, SimVarValueType.Bool);
    const allResetsPulled = allFmcResetsPulled(readBool);
    const allInop = allFmcInop(readBool);

    this.legacyFmsIsHealthy.set(!allInop);
    // FIXME remove this condition if proper FMC sync is implemented. For now, we only reset if all FMCs failed.
    if (allResetsPulled || allInop) {
      if (this.wasReset === false) {
        this.reset();
      }
      return;
    }

    this.wasReset = false;

    this.flightPhaseManager.shouldActivateNextPhase(dt);

    const throttledDt = this.fmsUpdateThrottler.canUpdate(dt);

    if (throttledDt !== -1) {
      this.navigation.update(throttledDt);
      this.#timeKeeper.update(throttledDt);
      this.#timeMarkers.update();
      if (
        this.irsAlignReferencePosition.get() !== null &&
        isAlignReferenceLost(
          [1, 2, 3].map((ir) => SimVar.GetSimVarValue(`L:A32NX_OVHD_ADIRS_IR_${ir}_MODE_SELECTOR_KNOB`, 'Enum')),
        )
      ) {
        this.irsAlignReferencePosition.set(null);
      }
      this.#sequencedWaypointRecorder?.update();
      if (this.instance === FmcIndex.FmcA) {
        this.#printer ??= new FmsPrinter(this, this.bus);
        this.#printer.update();
        this.updateActiveFlightNumber();
        this.#advisoryMessages ??= new FmsAdvisoryMessages(this);
        this.#advisoryMessages.update();
      }
      this.updateFuelPlanning();
      this.loadActiveFlightPlanFuelAndApproachData();
      if (this.flightPlanInterface.hasActive) {
        const flightPhase = this.flightPhase.get();
        this.enginesWereStarted.set(
          flightPhase >= FmgcFlightPhase.Takeoff ||
            (flightPhase == FmgcFlightPhase.Preflight &&
              (SimVar.GetSimVarValue('L:A32NX_ENGINE_N2:1', 'number') > 20 ||
                SimVar.GetSimVarValue('L:A32NX_ENGINE_N2:2', 'number') > 20 ||
                SimVar.GetSimVarValue('L:A32NX_ENGINE_N2:3', 'number') > 20 ||
                SimVar.GetSimVarValue('L:A32NX_ENGINE_N2:4', 'number') > 20)),
        );

        this.acInterface.sfccAquisition();
        this.acInterface.updateThrustReductionAcceleration();
        this.acInterface.updateTransitionAltitudeLevel();
        this.acInterface.updatePerformanceData();
        this.acInterface.updatePerfSpeeds();
        this.acInterface.updateWeights();
        this.acInterface.toSpeedsChecks();
        this.acInterface.checkForCruiseStep();
        this.acInterface.checkTooSteepPath();
        this.acInterface.checkDestEfobBelowMin();
        this.acInterface.checkDestEfobBelowMinScratchPadMessage(throttledDt);
        this.acInterface.checkEngineOut();
        this.acInterface.checkLateralDiscontinuityAhead();
        this.acInterface.checkGpsDeselected();
        const toFlaps = this.fmgc.getTakeoffFlapsSetting();
        this.acInterface.setTakeoffFlaps(toFlaps ?? null);

        const thsFor = this.flightPlanInterface.active.performanceData.takeoffThsFor.get();
        if (thsFor) {
          this.acInterface.setTakeoffTrim(thsFor);
        }

        const destPred = this.guidanceController.vnavDriver.getDestinationPrediction();
        this.acInterface.updateDestinationPredictions(destPred);
        this.acInterface.updateIlsCourse(this.navigation.getNavaidTuner().getMmrRadioTuningStatus(1));
        this.acInterface.updatePerfSpeeds();
        this.acInterface.checkCruiseLevelChangeDueToFcu(throttledDt);
        this.#rtaFunction.update();
        this.acInterface.updateManagedSpeed();
        this.acInterface.updateConstraints();
      } else {
        this.acInterface.resetDestinationPredictions();
      }
      this.checkZfwParams();
      this.updateMessageQueue();
      this.updateVerticalPath();
      this.vdSafetyAltitudes.update(throttledDt, {
        position: this.knownPresentPosition(),
        trueTrackDeg: SimVar.GetSimVarValue('GPS GROUND TRUE TRACK', 'degree'),
        alongTrack: isVdCutAlongTrack(
          SimVar.GetSimVarValue('L:A32NX_FMA_LATERAL_MODE', SimVarValueType.Number),
          SimVar.GetSimVarValue('L:A32NX_FMA_LATERAL_ARMED', SimVarValueType.Number),
        ),
        plan: this.flightPlanInterface.hasActive ? this.flightPlanInterface.active : null,
        distanceToDestinationNm: this.guidanceController.getAlongTrackDistanceToDestination() ?? null,
        epuNm: this.navigation.getEpe(),
        rnpNm: this.navigation.getActiveRnp() ?? 0,
      });
      this.#secondaryPredictions?.update(throttledDt);

      this.acInterface.checkSpeedLimit();
      this.acInterface.thrustReductionAccelerationChecks();
      if (this.optimumFlightLevelThrottler.canUpdate(dt) !== -1) {
        this.updateOptimumFlightLevel();
      }
      if (this.cruiseMessageCheckThrotter.canUpdate(dt) !== -1) {
        if (this.flightPhaseManager.phase === FmgcFlightPhase.Cruise && !this.destDataCheckedInCruise) {
          const destPred = this.guidanceController.vnavDriver.getDestinationPrediction();
          if (destPred && Number.isFinite(destPred.distanceFromAircraft) && destPred.distanceFromAircraft < 180) {
            this.destDataCheckedInCruise = true;
            this.checkDestData();
          }
        }
      }
      this.companyWindUplinkPending.set(
        this.windUplinkPulse.write(this.isAnyWindUplinkRecieved.get()) && this.#flightPlanService.hasTemporary,
      );
      // TODO port over from legacy code
      // this.updatePerfPageAltPredictions();

      const flightPlanChanged = this.flightPlanInterface.activeOrTemporary.version !== this.lastFlightPlanVersion;

      if (flightPlanChanged) {
        this.acInterface.updateManagedProfile();
        this.acInterface.updateDestinationData();

        // Update ND plan center, but only if not on F-PLN page. There has to be a better solution though.
        if (this.mfdReference?.uiService.activeUri.get().page !== 'f-pln') {
          this.updateEfisPlanCentre(
            this.mfdReference?.uiService.captOrFo === 'FO' ? 'R' : 'L',
            FlightPlanIndex.Active,
            this.#flightPlanService.active.activeLegIndex,
            this.#flightPlanService.active.activeLegIndex >= this.#flightPlanService.active.allLegs.length,
          );
        }

        this.lastFlightPlanVersion = this.flightPlanInterface.activeOrTemporary.version;
      }
      this.guidanceController.update(dt);

      this.efisSymbolsLeft.update();
      this.efisSymbolsRight.update();

      this.acInterface.arincBusOutputs.forEach((word) => word.writeToSimVarIfDirty());
    }
  }

  updateEfisPlanCentre(
    side: EfisSide,
    planDisplayForPlan: number,
    planDisplayLegIndex: number,
    planDisplayInAltn: boolean,
  ) {
    this.efisInterfaces[side].setNumLegsOnFplnPage(this.flightPlanInterface.hasTemporary ? 7 : 8);
    this.efisInterfaces[side].setPlanCentre(planDisplayForPlan, planDisplayLegIndex, planDisplayInAltn);
    this.efisInterfaces[side].setSecRelatedPageOpen(
      planDisplayForPlan >= FlightPlanIndex.FirstSecondary
        ? planDisplayForPlan - FlightPlanIndex.FirstSecondary + 1
        : null,
    );
  }

  handleFcuAltKnobPushPull(): void {
    this.flightPhaseManager.handleFcuAltKnobPushPull(
      this.fmgc.getDistanceToDestination() ?? -1,
      this.guidanceController.isStepDescentAhead(),
    );
  }

  handleFcuAltKnobTurn(): void {
    this.flightPhaseManager.handleFcuAltKnobTurn(
      this.fmgc.getDistanceToDestination() ?? -1,
      this.guidanceController.isStepDescentAhead(),
    );
  }

  handleFcuVSKnob(onStepClimbDescent: () => void): void {
    this.flightPhaseManager.handleFcuVSKnob(
      this.fmgc.getDistanceToDestination() ?? -1,
      this.guidanceController.isStepDescentAhead(),
      onStepClimbDescent,
    );
  }

  handleNewCruiseAltitudeEntered(newCruiseFlightLevel: number): void {
    this.flightPhaseManager.handleNewCruiseAltitudeEntered(newCruiseFlightLevel);
  }

  tryGoInApproachPhase(): void {
    const appr = this.flightPhaseManager.tryGoInApproachPhase();
    if (appr && this.#flightPlanService.hasActive) {
      this.#flightPlanService.active.setPerformanceData('cruiseFlightLevel', null);
    }
  }

  private updateVerticalPath() {
    // Transmit active vertical geometry
    const predictions = this.guidanceController.vnavDriver.mcduProfile?.waypointPredictions;
    const plan: ReadonlyFlightPlan<A380FlightPlanPerformanceData> = this.flightPlanInterface.active;

    if (!predictions || !this.flightPlanInterface.hasActive) {
      this.acInterface.transmitVerticalPath([], [], [], [], null);
      this.flsBeamPublisher.publish(null);
      return;
    }
    const unfoldedHolds = this.unfoldedHolds(plan, predictions);
    this.efisSymbolsLeft.vdSymbolTransform = this.efisSymbolsRight.vdSymbolTransform = unfoldedHolds.length
      ? (symbols) => unfoldHoldsInSymbols(symbols, unfoldedHolds)
      : null;
    this.publishFlsBeam(plan, predictions, unfoldedHolds);

    const targetProfile = this.guidanceController.vnavDriver.mcduProfile;
    const descentProfile = this.guidanceController.vnavDriver.descentProfile;
    const actualProfile = this.guidanceController.vnavDriver.ndProfile;

    const targetProfileVd: VerticalPathCheckpoint[] = [];
    const showFromLegIndex = Math.max(0, plan.activeLegIndex - 1);

    if (targetProfile) {
      targetProfile.checkpoints.forEach((c) => {
        const currentDistance = targetProfile.distanceToPresentPosition;

        targetProfileVd.push({
          distanceFromAircraft: c.distanceFromStart - currentDistance,
          altitude: c.altitude,
        });
      });
    }

    // Separately extract all altitude constraints
    const vdAltitudeConstraints: VdAltitudeConstraint[] = plan.allLegs
      .slice(showFromLegIndex)
      .filter((leg, legIndex) => leg.isDiscontinuity === false && predictions.get(legIndex + showFromLegIndex))
      .map((_, legIndex) => {
        const legPrediction = predictions.get(legIndex + showFromLegIndex);

        return {
          altitudeConstraint: legPrediction?.altitudeConstraint,
          isAltitudeConstraintMet: legPrediction?.isAltitudeConstraintMet,
        };
      });

    const descentProfileVd: VerticalPathCheckpoint[] = descentProfile
      ? descentProfile.checkpoints.map((c) => {
          return {
            distanceFromAircraft:
              c.distanceFromStart +
              this.guidanceController.vnavDriver.computeTacticalToGuidanceProfileOffset() -
              descentProfile.distanceToPresentPosition,
            altitude: c.altitude,
            altitudeConstraint: undefined,
            isAltitudeConstraintMet: undefined,
          };
        })
      : [];

    const actualProfileVd: VerticalPathCheckpoint[] = actualProfile
      ? actualProfile.checkpoints.map((c) => {
          return {
            distanceFromAircraft: c.distanceFromStart - actualProfile.distanceToPresentPosition,
            altitude: c.altitude,
            altitudeConstraint: undefined,
            isAltitudeConstraintMet: undefined,
          };
        })
      : [];

    // Start of grey area
    // FIXME improve, currently only works on a per-leg-basis
    let lastBearing: number | null = null;
    let trackChangesSignificantlyAtDistance: number | null = null;
    const previousLeg = plan.allLegs[showFromLegIndex - 1];
    let lastLegLatLong: Coordinates =
      showFromLegIndex > 0 && previousLeg.isDiscontinuity === false && previousLeg.definition.waypoint
        ? previousLeg.definition.waypoint.location
        : this.guidanceController.lnavDriver.ppos;

    plan.allLegs.slice(showFromLegIndex).forEach((leg, legIndex) => {
      const legPrediction = predictions.get(legIndex + showFromLegIndex);
      if (leg.isDiscontinuity === false && legPrediction) {
        if (leg.definition.waypoint && trackChangesSignificantlyAtDistance === null) {
          const bearing = bearingTo(lastLegLatLong, leg.definition.waypoint.location);
          if (lastBearing !== null && Math.abs(lastBearing - bearing) > 3) {
            trackChangesSignificantlyAtDistance = legPrediction.distanceFromAircraft;
          }
          lastBearing = bearing;
        }

        lastLegLatLong = leg.definition.waypoint?.location ?? lastLegLatLong;
      }
    });

    this.acInterface.transmitVerticalPath(
      unfoldHoldsInProfile(targetProfileVd, unfoldedHolds),
      vdAltitudeConstraints,
      unfoldHoldsInProfile(actualProfileVd, unfoldedHolds),
      unfoldHoldsInProfile(descentProfileVd, unfoldedHolds),
      trackChangesSignificantlyAtDistance === null
        ? null
        : shiftDistanceForHolds(trackChangesSignificantlyAtDistance, unfoldedHolds),
    );
  }

  private unfoldedHolds(
    plan: ReadonlyFlightPlan<A380FlightPlanPerformanceData>,
    predictions: ReadonlyMap<number, VerticalWaypointPrediction>,
  ) {
    const candidates: VdHoldCandidate[] = [];
    this.guidanceController.activeGeometry?.legs.forEach((leg, legIndex) => {
      const prediction = predictions.get(legIndex);
      if (leg instanceof HXLeg && prediction) {
        candidates.push({
          legIndex,
          ident: leg.ident,
          distanceFromAircraft: prediction.distanceFromAircraft,
          orbitLength: leg.unfoldedOrbitLength,
          altitude: prediction.altitude,
        });
      }
    });

    return selectUnfoldedHolds(candidates, plan.activeLegIndex, this.acInterface.isAirspeedManaged() ?? true);
  }

  private publishFlsBeam(
    plan: ReadonlyFlightPlan<A380FlightPlanPerformanceData>,
    predictions: ReadonlyMap<number, VerticalWaypointPrediction>,
    unfoldedHolds: readonly VdHold[],
  ) {
    const pd = plan.performanceData;
    const inputs = flsBeamInputs(
      plan,
      predictions,
      pd.approachTemperature.get(),
      pd.approachQnh.get() !== null ? this.fmgc.getApproachQnh() : null,
    );
    if (inputs) {
      inputs.missedApproachPoint.distanceFromAircraft = shiftDistanceForHolds(
        inputs.missedApproachPoint.distanceFromAircraft,
        unfoldedHolds,
      );
    }
    this.flsBeamPublisher.publish(inputs ? computeFlsBeam(inputs) : null);
  }

  public enterEngineOut() {
    // Managed speed targets are handled in FmcAircraftInterface.updateManagedSpeed()

    // Update drift-down altitude if in CRZ phase
    // FIXME need to add drift-down PWP to fmsv2

    // Delete pre-selected speeds
    const activePlan = this.flightPlanInterface.active;
    activePlan.performanceData.preselectedClimbSpeed.set(null);
    activePlan.performanceData.preselectedCruiseSpeed.set(null);
    let stepDeleted = false;

    // Delete planned/future altitude steps
    this.flightPlanInterface.active.allLegs
      .filter(
        (l, index) =>
          l.isDiscontinuity === false && index >= this.flightPlanInterface.active.activeLegIndex && l.cruiseStep,
      )
      .forEach((l) => {
        if (l.isDiscontinuity === false) {
          l.cruiseStep = undefined;
          stepDeleted = true;
        }
      });

    if (stepDeleted) {
      this.addMessageToQueue(NXSystemMessages.stepDeleted);
    }

    // Delete time constraints
    // no-op

    // EOSID temporary flight plan, before the diversion point, in the takeoff phase below the thrust reduction altitude
    if (
      engineFailureCreatesEngineOutSid(
        this.flightPhaseManager.phase,
        SimVar.GetSimVarValue('INDICATED ALTITUDE', 'feet'),
        activePlan.performanceData.thrustReductionAltitude.get(),
      )
    ) {
      this.flightPlanInterface.tryActivateEngineOutSid().catch((e) => console.error(e));
    }

    // Display PERF page
    this.mfdReference?.uiService.navigateTo('fms/active/perf');
  }

  public exitEngineOut() {
    // Restore long-term guidance targets
  }

  public engineOutActive(): boolean {
    return this.fmgc.data.engineOut.get();
  }

  async swapNavDatabase(): Promise<void> {
    await this.reset();
  }

  async reset(): Promise<void> {
    this.wasReset = true;
    await this.flightPlanInterface.reset();
    this.fmgc.data.reset();
    this.acInterface.invalidateManagedSpeed();
    this.initSimVars();
    this.deleteAllStoredWaypoints();
    this.clearLatestFmsErrorMessage();
    this.mfdReference?.uiService.navigateTo('fms/data/status');
    this.navigation.resetState();
    this.acInterface.resetDestinationPredictions();
    this.vdSafetyAltitudes.reset();
    this.#secondaryPredictions?.reset();
    this.resetAtisAutoUpdate();
    this.irsAlignReferencePosition.set(null);
  }

  public logTroubleshootingError(msg: any) {
    logTroubleshootingError(this.bus, msg);
  }

  // TODO refactor in order to transmit message text to the ND. E.g. LEG/AREA/MAN RNP XXX.X
  public sendNdFmMessage(message: FMMessage, side: EfisSide) {
    if (!message.ndFlag) {
      console.warn('FMMessage has no ND flag set, cannot send message', message);
      return;
    }
    const old = this.ndMessageFlags[side];
    this.ndMessageFlags[side] |= message.ndFlag;
    if (this.ndMessageFlags[side] !== old) {
      SimVar.SetSimVarValue(`L:A32NX_EFIS_${side}_ND_FM_MESSAGE_FLAGS`, 'number', this.ndMessageFlags[side]);
    }
  }

  public removeNdFmMessage(message: FMMessage, side: EfisSide) {
    if (!message.ndFlag) {
      console.warn('FMMessage has no ND flag set, cannot recall message', message);
      return;
    }
    const old = this.ndMessageFlags[side];
    this.ndMessageFlags[side] &= ~message.ndFlag;
    if (this.ndMessageFlags[side] !== old) {
      SimVar.SetSimVarValue(`L:A32NX_EFIS_${side}_ND_FM_MESSAGE_FLAGS`, 'number', this.ndMessageFlags[side]);
    }
  }

  setApproachWindDirection(value: number | null, forPlan: number): void {
    if (value === null) {
      this.#flightPlanService.deleteApproachWind(forPlan);
    } else {
      this.#flightPlanService.setApproachWind(value, null, forPlan);
    }
  }
  setApproachWindSpeed(value: number | null, forPlan: number): void {
    if (value === null) {
      this.#flightPlanService.deleteApproachWind(forPlan);
    } else {
      this.#flightPlanService.setApproachWind(null, value, forPlan);
    }
  }

  private setDefaultCostIndexIfNoneEntered(): void {
    if (this.flightPlanInterface.hasActive && this.flightPlanInterface.active.destinationAirport !== undefined) {
      const pd = this.flightPlanInterface.active.performanceData;
      const defaultCostIndex = this.costIndexDefault.defaultFor(pd.costIndex.get());
      if (defaultCostIndex !== null) {
        pd.costIndex.set(defaultCostIndex);
        pd.costIndexMode.set(CostIndexMode.ECON);
        this.addMessageToQueue(NXSystemMessages.costIndexInUse.getModifiedMessage(defaultCostIndex.toFixed(0)));
      }
    }
  }

  private loadActiveFlightPlanFuelAndApproachData(): void {
    const flightplan = this.flightPlanInterface.hasActive ? this.flightPlanInterface.active : null;
    const pd = flightplan?.performanceData;
    this.approachFlapsThreeSelected.set(pd?.approachFlapsThreeSelected.get() ?? false);
    this.zeroFuelWeight.set(pd?.zeroFuelWeight.get() ?? null);
    this.zeroFuelWeightCenterOfGravity.set(pd?.zeroFuelWeightCenterOfGravity.get() ?? null);
    this.approachQnh.set(pd?.approachQnh.get() ?? null);
    this.approachTemperature.set(pd?.approachTemperature.get() ?? null);
    this.approachWindDirection.set(pd?.approachWindDirection.get() ?? null);
    this.approachWindMagnitude.set(pd?.approachWindMagnitude.get() ?? null);
    this.destDataIsPilotEntered.set(pd?.isApproachWindPilotEntered.get() ?? false);
    this.minimumDestinationFuel.set(pd?.minimumDestinationFuelOnBoard.get() ?? null);
    this.alternateFuel.set(pd?.alternateFuel.get() ?? null);
    this.finalFuelWeight.set(pd?.finalHoldingFuel.get() ?? null);
    this.destinationRunwayBearing.set(flightplan?.destinationRunway?.magneticBearing ?? null);
  }

  public trySetCruiseFl(fl: number, intoPlan: FlightPlanIndex = FlightPlanIndex.Active): boolean {
    if (!this.flightPlanInterface.has(intoPlan)) {
      return false;
    }
    const plan = this.#flightPlanService.get(intoPlan);
    if (!Number.isFinite(fl)) {
      this.addMessageToQueue(NXSystemMessages.formatError, undefined, undefined);
      return false;
    }
    const flBelowMinOrMax = fl <= 0 || fl > maxCertifiedAlt / 100;
    if (flBelowMinOrMax) {
      this.addMessageToQueue(NXSystemMessages.entryOutOfRange, undefined, undefined);
      return false;
    }
    let flightLevelToInsert = fl;
    let newCrzAltMessage = false;
    const isActive = intoPlan === FlightPlanIndex.Active;
    if (isActive) {
      const phase = this.flightPhase.get();
      if (phase >= FmgcFlightPhase.Climb && phase < FmgcFlightPhase.Done) {
        const fcuFl = Math.floor(Math.max(0, this.acInterface.getFcuSelectedAltitude() ?? 0) / 100);
        if (fl < fcuFl) {
          flightLevelToInsert = fcuFl;
          newCrzAltMessage =
            phase === FmgcFlightPhase.Cruise || phase === FmgcFlightPhase.Descent || phase === FmgcFlightPhase.Approach;
        } else {
          flightLevelToInsert = fl;
        }
      }
    }
    plan.setPerformanceData('cruiseFlightLevel', flightLevelToInsert);
    // CONSTRAINTS ABOVE CRZ FL: DELETED (A380 FCOM l.27100-27104, l.45252, l.45260-45262): the climb and descent
    // constraints at or above the new CRZ FL are deleted (see CruiseLevelConstraints.ts)
    if (deleteConstraintsAboveCruiseLevel(plan, flightLevelToInsert) > 0) {
      this.addMessageToQueue(NXSystemMessages.constraintsAboveCrzFlDeleted, undefined, undefined);
    }
    if (flightLevelToInsert > (this.getRecMaxFlightLevel(intoPlan) ?? Infinity)) {
      this.addMessageToQueue(NXSystemMessages.crzFlAboveMaxFL, undefined, undefined);
    }
    if (isActive) {
      this.acInterface.onUpdateCruiseLevel(flightLevelToInsert);
      if (newCrzAltMessage) {
        this.addMessageToQueue(
          NXSystemMessages.newCrzAlt.getModifiedMessage((flightLevelToInsert * 100).toFixed(0)),
          undefined,
          undefined,
        );
      }
    }
    return true;
  }
  /**
   * Loads company wind uplink response into the flight plan associated with the uplink.
   * @param response the company wind uplink response
   */
  private onCompanyWindUplinkResponseReceived(response: WindUplinkResponse) {
    const planIndex = response.flightPlan;
    const hasPln = this.flightPlanInterface.has(planIndex);

    if (!hasPln) {
      console.warn('Received company wind uplink for plan index ' + planIndex + ', but no such plan exists');
      this.logTroubleshootingError(
        'Received company wind uplink for plan index ' + planIndex + ', but no such plan exists',
      );
      this.addMessageToQueue(NXSystemMessages.receivedCpnyWindNotValid);
    } else {
      const status = response.status;
      const plan = this.flightPlanInterface.get(planIndex);
      // If we have initiated a request before cruise phase and we entered another phase while it was still pending, delete it.
      if (plan.isActiveOrCopiedFromActive() && this.flightPhase.get() > FmgcFlightPhase.Cruise) {
        plan.pendingWindUplink.onUplinkAborted();
      } else {
        let deletePendingUplink = true;
        if (status === AtsuStatusCodes.Ok) {
          const message = response.message;
          if (message === null) {
            console.warn('Received OK status for company wind uplink, but message was null');
            this.logTroubleshootingError(
              'Received OK status for company wind uplink, but message was null for plan ' + planIndex,
            );
            this.addMessageToQueue(NXSystemMessages.receivedCpnyWindNotValid);
          } else {
            try {
              PendingWindUplinkParser.setFromUplink(
                message,
                plan,
                this.flightPhaseManager.phase,
                FpmConfigs.A380,
                maxCertifiedFlightLevel,
                false,
              );
              // Remove messages related to failed wind uplink.
              this.removeMessageFromQueue(NXSystemMessages.receivedCpnyWindNotValid.text);
              this.removeMessageFromQueue(NXSystemMessages.noCompanyReply.text);
              this.removeMessageFromQueue(NXSystemMessages.notTransmittedToAcr.text);
              if (planIndex === FlightPlanIndex.Active) {
                this.windUplinkRecievedActive.set(true);
              } else if (planIndex >= FlightPlanIndex.FirstSecondary) {
                this.windUplinkRecievedSec[planIndex - FlightPlanIndex.FirstSecondary].set(true);
              }
              deletePendingUplink = false;
            } catch (e) {
              console.warn('Error processing company wind uplink for plan ' + planIndex, e);
              this.logTroubleshootingError(e);
              this.addMessageToQueue(NXSystemMessages.receivedCpnyWindNotValid);
            }
          }
        } else if (status === AtsuStatusCodes.RequestTimeout) {
          this.addMessageToQueue(NXSystemMessages.noCompanyReply);
        } else if (status === AtsuStatusCodes.ComFailed) {
          this.addMessageToQueue(NXSystemMessages.notTransmittedToAcr); // TODO this should probably be sent immedieatly on uplink attempt instead of waiting for a response
        } else {
          this.addMessageToQueue(NXSystemMessages.receivedCpnyWindNotValid);
        }
        if (deletePendingUplink) {
          plan.pendingWindUplink.onUplinkAborted();
        }
      }
    }
    this.cpnyWindUplinkInProgress.set(false);
    this.cpnyWindRequestedForPlan.set(null);
  }

  // Deletes all the company wind uplinks or draft winds from flightplans which wind modification is disabled starting in descent phase (active & secs copy of active)
  private deleteWindUplinkOrDraftFromAllPlans(): void {
    for (let i = 0; i < FpmConfigs.A380.NUM_SECONDARY_FLIGHT_PLANS; i++) {
      const planIndex = i + FlightPlanIndex.FirstSecondary;
      if (this.flightPlanInterface.has(planIndex)) {
        const plan = this.flightPlanInterface.get(planIndex);
        if (plan.isActiveOrCopiedFromActive()) {
          plan.deleteDraftWindEntries();
          plan.pendingWindUplink.onUplinkAborted();
          this.windUplinkRecievedSec[i].set(false);
        }
      }
    }
    const active = this.flightPlanInterface.hasActive ? this.flightPlanInterface.active : null;
    if (active) {
      active.deleteDraftWindEntries();
      active.pendingWindUplink.onUplinkAborted();
      this.windUplinkRecievedActive.set(false);
    }
  }
}
