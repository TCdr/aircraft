// @ts-strict-ignore
// Copyright (c) 2022-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  Arinc429Register,
  IlsNavaid,
  NdbNavaid,
  VhfNavaid,
  VhfNavaidType,
  Icao,
  NearbyFacilityMonitor,
  NearbyFacilityType,
  NearbyFacility,
} from '@flybywiresim/fbw-sdk';

import { LandingSystemSelectionManager } from '@fmgc/navigation/LandingSystemSelectionManager';
import { NavaidSelectionManager, VorSelectionReason } from '@fmgc/navigation/NavaidSelectionManager';
import { NavaidTuner } from '@fmgc/navigation/NavaidTuner';
import { NavigationProvider } from '@fmgc/navigation/NavigationProvider';
import { RequiredPerformance } from '@fmgc/navigation/RequiredPerformance';
import { GpirsData, gpsNavigationState } from '@fmgc/navigation/GpsNavigation';
import { FmNavigationMode, PositionUncertaintyEstimator } from '@fmgc/navigation/PositionUncertainty';
import {
  A320_FM_POSITION_CONFIG,
  FmPositionComputer,
  FmPositionConfig,
  irsUsedCount,
  selectGpirs,
} from '@fmgc/navigation/FmPosition';
import { FlightPhaseManagerEvents } from '@fmgc/flightphase';
import { FmgcFlightPhase } from '@shared/flightphase';
import { ConsumerSubject, EventBus, SimVarValueType, Subject, Subscribable } from '@microsoft/msfs-sdk';
import { Coordinates, distanceTo } from 'msfs-geo';
import { FlightPlanService } from '../flightplanning/FlightPlanService';
import { NavigationDatabaseService } from '../flightplanning/NavigationDatabaseService';

export enum SelectedNavaidType {
  None,
  Dme,
  Vor,
  VorDme,
  VorTac,
  Tacan,
  Ils,
  Gls,
  Mls,
}

export enum SelectedNavaidMode {
  Auto,
  Manual,
  Rmp,
}

export interface SelectedNavaid {
  type: SelectedNavaidType;
  mode: SelectedNavaidMode;
  ident: string | null;
  frequency: number | null;
  facility: VhfNavaid | NdbNavaid | IlsNavaid | null;
}

export interface NavigationEvents {
  /** The selected pressure altitude in feet, or null if invalid/NCD. */
  fms_nav_pressure_altitude: number | null;
  /** The selected baro corrected altitude in feet, or null if invalid/NCD. */
  fms_nav_baro_corrected_altitude: number | null;

  /** The selected computed airspeed in knots, or null if invalid/NCD. */
  fms_nav_computed_airspeed: number | null;

  /** Whether GPS primary is in use. */
  fms_nav_gps_primary: boolean;

  /** The selected wind direction in [0, 359.9], or null if invaliid/NCD */
  fms_nav_wind_direction: number | null;
  /** The selected wind speed in knots, or null if invalid/NCD */
  fms_nav_wind_speed: number | null;
}

export class Navigation implements NavigationProvider {
  private readonly publisher = this.bus.getPublisher<NavigationEvents>();

  private static readonly adiruOrder = [1, 3, 2];

  private static readonly arincWordCache = Arinc429Register.empty();

  requiredPerformance: RequiredPerformance;

  currentPerformance: number | undefined;

  private readonly _accuracyHigh = Subject.create(false);
  public readonly accuracyHigh: Subscribable<boolean> = this._accuracyHigh;

  ppos: Coordinates = { lat: 0, long: 0 };

  groundSpeed: Knots = 0;

  private radioHeight: number | null = null;

  private static readonly radioAltimeterVars = Array.from(
    { length: 2 },
    (_, i) => `L:A32NX_RA_${i + 1}_RADIO_ALTITUDE`,
  );

  private readonly baroAltitude = Subject.create<number | null>(null);

  private static readonly baroAltitudeVars = Array.from(
    { length: 3 },
    (_, i) => `L:A32NX_ADIRS_ADR_${i + 1}_BARO_CORRECTED_ALTITUDE_1`,
  );

  private readonly pressureAltitude = Subject.create<number | null>(null);

  private static readonly pressureAltitudeVars = Array.from(
    { length: 3 },
    (_, i) => `L:A32NX_ADIRS_ADR_${i + 1}_ALTITUDE`,
  );

  private readonly computedAirspeed = Subject.create<number | null>(null);

  private static readonly computedAirspeedVars = Array.from(
    { length: 3 },
    (_, i) => `L:A32NX_ADIRS_ADR_${i + 1}_COMPUTED_AIRSPEED`,
  );

  private trueAirspeed: number | null = null;

  private static readonly trueAirspeedVars = Array.from(
    { length: 3 },
    (_, i) => `L:A32NX_ADIRS_ADR_${i + 1}_TRUE_AIRSPEED`,
  );

  private staticAirTemperature: number | null = null;

  private static readonly staticAirTemperatureVars = Array.from(
    { length: 3 },
    (_, i) => `L:A32NX_ADIRS_ADR_${i + 1}_STATIC_AIR_TEMPERATURE`,
  );

  /** The GPIRS position of each IR: the hybrid GPS/IRS position from the GPS receiver it selects */
  private static readonly gpirsLatitudeVars = Array.from(
    { length: 3 },
    (_, i) => `L:A32NX_ADIRS_IR_${i + 1}_GPIRS_LATITUDE`,
  );

  /** The 95 % accuracy of the GPIRS position, in NM */
  private static readonly gpirsFigureOfMeritVars = Array.from(
    { length: 3 },
    (_, i) => `L:A32NX_ADIRS_IR_${i + 1}_GPIRS_FIGURE_OF_MERIT`,
  );

  /** The horizontal integrity limit (HIL) of the GPIRS position, in NM */
  private static readonly gpirsIntegrityLimitVars = Array.from(
    { length: 3 },
    (_, i) => `L:A32NX_ADIRS_IR_${i + 1}_GPIRS_INTEGRITY_LIMIT`,
  );

  private static readonly gpirsLongitudeVars = Array.from(
    { length: 3 },
    (_, i) => `L:A32NX_ADIRS_IR_${i + 1}_GPIRS_LONGITUDE`,
  );

  /** The IR position of each ADIRU (the inertial position) */
  private static readonly irLatitudeVars = Array.from({ length: 3 }, (_, i) => `L:A32NX_ADIRS_IR_${i + 1}_LATITUDE`);

  private static readonly irLongitudeVars = Array.from({ length: 3 }, (_, i) => `L:A32NX_ADIRS_IR_${i + 1}_LONGITUDE`);

  /** The position of the GPS receiver of each MMR (the pure GPS position) */
  private static readonly gpsLatitudeVars = Array.from({ length: 2 }, (_, i) => `L:A32NX_GPS_${i + 1}_LATITUDE`);

  private static readonly gpsLongitudeVars = Array.from({ length: 2 }, (_, i) => `L:A32NX_GPS_${i + 1}_LONGITUDE`);

  /** The IR positions of IR 1, 2 and 3, null when not valid */
  private readonly irPositions: (Coordinates | null)[] = [null, null, null];

  /** The GPIRS positions of IR 1, 2 and 3, null when not valid */
  private readonly gpirsPositions: (Coordinates | null)[] = [null, null, null];

  /** The GPS receiver positions of GPS 1 and 2, null when not valid */
  private readonly gpsPositions: (Coordinates | null)[] = [null, null];

  /** The sim position: the IR positions have no drift, so it is also the MIX IRS position (see FmPosition.ts) */
  private readonly simPosition: Coordinates = { lat: 0, long: 0 };

  /** The FM positions of FMS 1 and FMS 2 (see FmPosition.ts) */
  private readonly fmPosition: FmPositionComputer;

  /** The NAV FM/GPS POS DISAGREE condition, sent to the FWC/FWS */
  private readonly fmGpsPositionDisagree = Subject.create(false);

  private readonly fmIrPositionDisagree = Subject.create(false);

  /** The GPIRS data of IR 1, 2 and 3, read at each update */
  private readonly gpirs: [GpirsData, GpirsData, GpirsData] = [1, 2, 3].map(() => ({
    positionValid: false,
    figureOfMerit: null,
    integrityLimit: null,
  })) as [GpirsData, GpirsData, GpirsData];
  private readonly gpsPrimary = Subject.create(false);

  /** Whether the flight crew has deselected the GPS: the GPIRS positions are then not used */
  private readonly gpsDeselected = Subject.create(false);

  /** The FM navigation mode and the estimated position uncertainty */
  private readonly positionUncertainty = new PositionUncertaintyEstimator();

  private navigationMode = FmNavigationMode.IrsOnly;

  private readonly flightPhase = ConsumerSubject.create(
    this.bus.getSubscriber<FlightPhaseManagerEvents>().on('fmgc_flight_phase'),
    FmgcFlightPhase.Preflight,
  );

  private windDirection = Subject.create<number | null>(null);

  private static readonly windDirectionVars = Array.from(
    { length: 3 },
    (_, i) => `L:A32NX_ADIRS_IR_${i + 1}_WIND_DIRECTION`,
  );

  private windSpeed = Subject.create<number | null>(null);

  private static readonly windSpeedVars = Array.from({ length: 3 }, (_, i) => `L:A32NX_ADIRS_IR_${i + 1}_WIND_SPEED`);

  private readonly navaidSelectionManager: NavaidSelectionManager;

  private readonly landingSystemSelectionManager: LandingSystemSelectionManager;

  private readonly navaidTuner: NavaidTuner;

  private readonly selectedNavaids: SelectedNavaid[] = Array.from({ length: 4 }, () => ({
    type: SelectedNavaidType.None,
    mode: SelectedNavaidMode.Auto,
    ident: '',
    frequency: 0,
    facility: null,
  }));

  private nearbyAirportMonitor: NearbyFacilityMonitor;

  /**
   * @param bus the event bus
   * @param flightPlanService the flight plan service
   * @param positionConfig what differs between the A320 and the A380 FMS position functions
   */
  constructor(
    private readonly bus: EventBus,
    private flightPlanService: FlightPlanService,
    positionConfig: Readonly<FmPositionConfig> = A320_FM_POSITION_CONFIG,
  ) {
    this.requiredPerformance = new RequiredPerformance(this.bus, this.flightPlanService);
    this.fmPosition = new FmPositionComputer(positionConfig);
    this.navaidSelectionManager = new NavaidSelectionManager(this.flightPlanService, this);
    this.landingSystemSelectionManager = new LandingSystemSelectionManager(this.bus, this.flightPlanService, this);
    this.navaidTuner = new NavaidTuner(this.bus, this, this.navaidSelectionManager, this.landingSystemSelectionManager);
  }

  init(): void {
    this.navaidTuner.init();

    this.pressureAltitude.sub((v) => this.publisher.pub('fms_nav_pressure_altitude', v, false, true), true);
    this.baroAltitude.sub((v) => this.publisher.pub('fms_nav_baro_corrected_altitude', v, false, true), true);

    this.computedAirspeed.sub((v) => this.publisher.pub('fms_nav_computed_airspeed', v, false, true), true);

    this._accuracyHigh.sub((v) => {
      SimVar.SetSimVarValue('L:A32NX_FMGC_L_NAV_ACCURACY_HIGH', 'bool', v);
      SimVar.SetSimVarValue('L:A32NX_FMGC_R_NAV_ACCURACY_HIGH', 'bool', v);
    }, true);
    this.gpsPrimary.sub((v) => {
      this.publisher.pub('fms_nav_gps_primary', v, false, true);
      // The PFDs need it for the FLS capability, and they cannot read the FMS bus
      SimVar.SetSimVarValue('L:A32NX_FMGC_L_GPS_PRIMARY', 'bool', v);
      SimVar.SetSimVarValue('L:A32NX_FMGC_R_GPS_PRIMARY', 'bool', v);
    }, true);
    // The GPS is selected again on the transition to the DONE phase (A380 rule; design choice: the A320 does the same,
    // its documents say nothing)
    this.flightPhase.sub((phase) => phase === FmgcFlightPhase.Done && this.gpsDeselected.set(false));
    this.flightPhase.sub((phase) => phase === FmgcFlightPhase.Takeoff && this.updatePositionAtTakeoff());
    this.fmGpsPositionDisagree.sub(
      (v) => SimVar.SetSimVarValue('L:A32NX_FM_GPS_POS_DISAGREE', SimVarValueType.Bool, v),
      true,
    );
    this.fmIrPositionDisagree.sub(
      (v) => SimVar.SetSimVarValue('L:A32NX_FM_IR_POS_DISAGREE', SimVarValueType.Bool, v),
      true,
    );
    this.windDirection.sub((v) => this.publisher.pub('fms_nav_wind_direction', v, false, true), true);
    this.windSpeed.sub((v) => this.publisher.pub('fms_nav_wind_speed', v, false, true), true);

    this.nearbyAirportMonitor = NavigationDatabaseService.activeDatabase.createNearbyFacilityMonitor(
      NearbyFacilityType.Airport,
    );
    this.nearbyAirportMonitor.setMaxResults(25);
    this.nearbyAirportMonitor.setRadius(250);
  }

  update(deltaTime: number): void {
    this.requiredPerformance.update(deltaTime);

    this.updateAttHdgPosData();
    this.updatePosition();
    this.updateCurrentPerformance(deltaTime);
    this.updateFmPosition(deltaTime);
    this.updateRadioHeight();
    this.updateAirData();
    this.updateInertialReference();

    this.navaidSelectionManager.update(deltaTime);
    this.landingSystemSelectionManager.update(deltaTime);

    this.navaidTuner.update(deltaTime);
  }

  /** Reset all state e.g. when the nav database is switched */
  resetState(): void {
    this.navaidSelectionManager.resetState();
    this.landingSystemSelectionManager.resetState();
    this.navaidTuner.resetState();

    // FIXME reset FMS position
  }

  private getAdiruValue(simVars: string[]): number | null {
    for (const adiru of Navigation.adiruOrder) {
      const simVar = simVars[adiru - 1];
      Navigation.arincWordCache.setFromSimVar(simVar);
      if (!Navigation.arincWordCache.isInvalid()) {
        return Navigation.arincWordCache.value;
      }
    }
    return null;
  }

  /**
   * GPS mode: the estimated position uncertainty is the accuracy (figure of merit) of the GPIRS position. GPS PRIMARY
   * also needs the integrity limit (HIL) within the required performance, since the FMS rejects the GPS mode when the
   * GPIRS data fails the HIL integrity criterion. Without the GPS (lost or deselected), the uncertainty is the one of
   * the IRS/DME/DME, IRS/VOR/DME or IRS only mode. The accuracy is HIGH when the uncertainty is within the required
   * navigation performance.
   */
  private updateCurrentPerformance(deltaTime: number): void {
    const rnp = this.requiredPerformance.activeRnp;
    const state = gpsNavigationState(this.gpirs, rnp, this.gpsDeselected.get());

    const distanceToNavaid = (navaid: VhfNavaid) => distanceTo(this.ppos, navaid.dmeLocation ?? navaid.location);
    const dmePair = this.navaidTuner.isFmTuningActive() ? this.navaidSelectionManager.dmePair : null;
    const vorDme =
      this.navaidTuner.isFmTuningActive() &&
      this.navaidSelectionManager.displayVorReason === VorSelectionReason.Navigation
        ? this.navaidSelectionManager.displayVor
        : null;
    const gpirsInUse = state.source !== null ? this.gpirsPositions[state.source - 1] : null;
    const { mode, uncertainty } = this.positionUncertainty.update(
      deltaTime,
      state.estimatedPositionUncertainty,
      dmePair !== null ? [distanceToNavaid(dmePair[0]), distanceToNavaid(dmePair[1])] : null,
      vorDme !== null ? distanceToNavaid(vorDme) : null,
      this.fmPosition.isValid && gpirsInUse !== null ? distanceTo(this.ppos, gpirsInUse) : 0,
      this.fmPosition.isValid ? distanceTo(this.ppos, this.simPosition) : 0,
    );
    this.navigationMode = mode;
    this.currentPerformance = uncertainty;
    this._accuracyHigh.set(uncertainty <= rnp);
    this.gpsPrimary.set(state.gpsPrimary);
  }

  public isGpsDeselected(): boolean {
    return this.gpsDeselected.get();
  }

  public setGpsDeselected(deselected: boolean): void {
    this.gpsDeselected.set(deselected);
  }

  public getNavigationMode(): FmNavigationMode {
    return this.navigationMode;
  }

  private updateRadioHeight(): void {
    for (const simVar of Navigation.radioAltimeterVars) {
      Navigation.arincWordCache.setFromSimVar(simVar);
      if (!Navigation.arincWordCache.isInvalid()) {
        this.radioHeight = Navigation.arincWordCache.value;
        return;
      }
    }
    this.radioHeight = null;
  }

  private updateAirData(): void {
    this.baroAltitude.set(this.getAdiruValue(Navigation.baroAltitudeVars));
    this.pressureAltitude.set(this.getAdiruValue(Navigation.pressureAltitudeVars));

    this.computedAirspeed.set(this.getAdiruValue(Navigation.computedAirspeedVars));
    this.trueAirspeed = this.getAdiruValue(Navigation.trueAirspeedVars);
    this.staticAirTemperature = this.getAdiruValue(Navigation.staticAirTemperatureVars);
  }

  /**
   * The GPIRS data of the three IRs (the hybrid GPS/IRS positions: valid when the IR is in NAV and has a GPS receiver
   * in NAV); the FMS selects one of them in updateCurrentPerformance.
   */
  private updateAttHdgPosData(): void {
    const normalValue = (simVar: string): number | null => {
      Navigation.arincWordCache.setFromSimVar(simVar);
      return Navigation.arincWordCache.isNormalOperation() ? Navigation.arincWordCache.value : null;
    };
    for (let i = 0; i < 3; i++) {
      Navigation.arincWordCache.setFromSimVar(Navigation.gpirsLatitudeVars[i]);
      this.gpirs[i].positionValid = Navigation.arincWordCache.isNormalOperation();
      this.gpirs[i].figureOfMerit = normalValue(Navigation.gpirsFigureOfMeritVars[i]);
      this.gpirs[i].integrityLimit = normalValue(Navigation.gpirsIntegrityLimitVars[i]);
      this.gpirsPositions[i] = Navigation.readPosition(
        Navigation.gpirsLatitudeVars[i],
        Navigation.gpirsLongitudeVars[i],
        this.gpirsPositions[i],
      );
      this.irPositions[i] = Navigation.readPosition(
        Navigation.irLatitudeVars[i],
        Navigation.irLongitudeVars[i],
        this.irPositions[i],
      );
    }
    for (let i = 0; i < 2; i++) {
      this.gpsPositions[i] = Navigation.readPosition(
        Navigation.gpsLatitudeVars[i],
        Navigation.gpsLongitudeVars[i],
        this.gpsPositions[i],
      );
    }
  }

  /**
   * Reads a position from its latitude and longitude ARINC 429 words.
   * @param latitudeVar the latitude word
   * @param longitudeVar the longitude word
   * @param out the object to reuse, if any
   * @returns the position, null unless both words are in normal operation
   */
  private static readPosition(latitudeVar: string, longitudeVar: string, out: Coordinates | null): Coordinates | null {
    Navigation.arincWordCache.setFromSimVar(latitudeVar);
    if (!Navigation.arincWordCache.isNormalOperation()) {
      return null;
    }
    const lat = Navigation.arincWordCache.value;
    Navigation.arincWordCache.setFromSimVar(longitudeVar);
    if (!Navigation.arincWordCache.isNormalOperation()) {
      return null;
    }
    const position = out ?? { lat: 0, long: 0 };
    position.lat = lat;
    position.long = Navigation.arincWordCache.value;
    return position;
  }

  private updateInertialReference(): void {
    this.windDirection.set(this.getAdiruValue(Navigation.windDirectionVars));
    this.windSpeed.set(this.getAdiruValue(Navigation.windSpeedVars));
  }

  private updatePosition(): void {
    this.simPosition.lat = SimVar.GetSimVarValue('PLANE LATITUDE', 'degree latitude');
    this.simPosition.long = SimVar.GetSimVarValue('PLANE LONGITUDE', 'degree longitude');
    this.groundSpeed = SimVar.GetSimVarValue('GPS GROUND SPEED', 'knots');
  }

  /**
   * Updates the FM positions of FMS 1 and 2 (see FmPositionComputer). FMS 1 gives the FMS position used by the guidance
   * and the displays. Without any IR position there is no FM position; the sim position is then
   * kept for the functions that need one.
   * @param deltaTime the time since the last update, in milliseconds
   */
  private updateFmPosition(deltaTime: number): void {
    this.fmPosition.update({
      deltaTime: deltaTime / 1000,
      simPosition: this.simPosition,
      irPositions: this.irPositions,
      gpirsPositions: this.gpirsPositions,
      gpsPositions: this.gpsPositions,
      gpsDeselected: this.gpsDeselected.get(),
      navigationMode: this.navigationMode,
      gpsPrimary: this.gpsPrimary.get(),
      onGround: SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool) > 0,
      altitude: this.pressureAltitude.get() ?? 0,
    });
    const position = this.fmPosition.isValid ? this.fmPosition.fmPositions[0] : this.simPosition;
    this.ppos.lat = position.lat;
    this.ppos.long = position.long;
    this.fmGpsPositionDisagree.set(this.fmPosition.isFmGpsDisagree);
    this.fmIrPositionDisagree.set(this.fmPosition.isFmIrDisagree);

    this.nearbyAirportMonitor.setLocation(this.ppos.lat, this.ppos.long);
  }

  /**
   * After a position update, the estimated position uncertainty and the FMS position.
   * @param previousPosition the FMS position before the update
   * @param position the updated FMS position
   */
  private onPositionUpdated(previousPosition: Coordinates, position: Coordinates): void {
    const onGround = SimVar.GetSimVarValue('SIM ON GROUND', SimVarValueType.Bool) > 0;
    this.positionUncertainty.positionUpdate(onGround, distanceTo(previousPosition, position));
    this.ppos.lat = position.lat;
    this.ppos.long = position.long;
  }

  /** The FM position update at takeoff (see FmPositionComputer.takeoffUpdate) */
  private updatePositionAtTakeoff(): void {
    const plan = this.flightPlanService.hasActive ? this.flightPlanService.active : null;
    const runway = plan?.originRunway;
    if (!runway) {
      return;
    }
    const previous = { lat: this.ppos.lat, long: this.ppos.long };
    const position = this.fmPosition.takeoffUpdate(
      runway.startLocation,
      runway.bearing,
      plan.performanceData.takeoffShift.get(),
    );
    if (position !== null) {
      this.onPositionUpdated(previous, position);
    }
  }

  /**
   * The manual FM position update (see FmPositionComputer.manualUpdate).
   * @param position the position the aircraft overflies
   * @returns false when the update is not allowed (IRS/GPS mode, or no FM position)
   */
  public updatePositionAt(position: Coordinates): boolean {
    const previous = { lat: this.ppos.lat, long: this.ppos.long };
    if (!this.fmPosition.manualUpdate(position)) {
      return false;
    }
    this.onPositionUpdated(previous, position);
    return true;
  }

  /**
   * The FM position of an FMS.
   * @param side the FMS, 1 or 2
   * @returns the position, null without an inertial position
   */
  public getFmPosition(side: 1 | 2): Coordinates | null {
    return this.fmPosition.isValid ? this.fmPosition.fmPositions[side - 1] : null;
  }

  /**
   * The GPIRS position an FMS selects (onside, GPIRS 3, offside).
   * @param side the FMS, 1 or 2
   * @returns the position, null when no GPIRS position is valid or the GPS is deselected
   */
  public getGpirsPosition(side: 1 | 2): Coordinates | null {
    const source = FmPositionComputer.gpirsSource(side, this.gpirsPositions, this.gpsDeselected.get());
    return source !== null ? this.gpirsPositions[source - 1] : null;
  }

  /**
   * The radio position: the sim position (no DME/VOR error is simulated) in the IRS/DME/DME and IRS/VOR/DME modes.
   * @returns the position, null in the other modes
   */
  public getRadioPosition(): Coordinates | null {
    return this.navigationMode === FmNavigationMode.IrsDmeDme || this.navigationMode === FmNavigationMode.IrsVorDme
      ? this.simPosition
      : null;
  }

  /**
   * The position of a GPS receiver.
   * @param receiver the receiver, 1 or 2
   * @returns the position, null when not valid
   */
  public getGpsPosition(receiver: 1 | 2): Coordinates | null {
    return this.gpsPositions[receiver - 1];
  }

  /**
   * The MIX IRS position of an FMS: the mean of the three IR positions, else the onside one, IR 3, the offside one.
   * @param side the FMS, 1 or 2
   * @returns the position, null without an IR position
   */
  public getMixIrsPosition(side: 1 | 2): Coordinates | null {
    const [a, b, c] = this.irPositions;
    if (a !== null && b !== null && c !== null) {
      // The IR positions are within metres of each other: a plain mean of the longitudes is fine
      return { lat: (a.lat + b.lat + c.lat) / 3, long: (a.long + b.long + c.long) / 3 };
    }
    const ir = selectGpirs(
      side,
      this.irPositions.map((p) => p !== null),
    );
    return ir !== null ? this.irPositions[ir - 1] : null;
  }

  public getIrsUsedCount(): 0 | 1 | 3 {
    return irsUsedCount(this.irPositions.filter((p) => p !== null).length);
  }

  /** Whether the FMS has an FM position (an inertial position is available) */
  public isFmPositionValid(): boolean {
    return this.fmPosition.isValid;
  }

  public setPilotRnp(rnp: number | null) {
    if (rnp) {
      this.requiredPerformance.setPilotRnp(rnp);
    } else {
      this.requiredPerformance.clearPilotRnp();
    }
  }

  public isPilotRnp(): boolean {
    return this.requiredPerformance.manualRnp;
  }

  public isAccuracyHigh(): boolean {
    return this._accuracyHigh.get();
  }

  public getBaroCorrectedAltitude(): number | null {
    return this.baroAltitude.get();
  }

  public getEpe(): number {
    return this.currentPerformance ?? Infinity;
  }

  public getActiveRnp(): number {
    return this.requiredPerformance.activeRnp;
  }

  public getPpos(): Coordinates | null {
    // TODO return null when fms pos invalid
    return this.ppos;
  }

  public getGpsPrimary(): boolean {
    return this.gpsPrimary.get();
  }

  public getPressureAltitude(): number | null {
    return this.pressureAltitude.get();
  }

  public getComputedAirspeed(): number | null {
    return this.computedAirspeed.get();
  }

  public getTrueAirspeed(): number | null {
    return this.trueAirspeed;
  }

  public getStaticAirTemperature(): number | null {
    return this.staticAirTemperature;
  }

  public getRadioHeight(): number | null {
    return this.radioHeight;
  }

  public getNavaidTuner(): NavaidTuner {
    return this.navaidTuner;
  }

  public getRequiredPerformance(): RequiredPerformance {
    return this.requiredPerformance;
  }

  public getWindDirection(): number | null {
    return this.windDirection.get();
  }

  public getWindSpeed(): number | null {
    return this.windSpeed.get();
  }

  private resetSelectedNavaid(i: number): void {
    const selected = this.selectedNavaids[i];
    selected.type = SelectedNavaidType.None;
    selected.mode = SelectedNavaidMode.Auto;
    selected.ident = '';
    selected.frequency = 0;
    selected.facility = null;
  }

  public getSelectedNavaids(cdu: 1 | 2 = 1): SelectedNavaid[] {
    if (this.navaidTuner.isFmTuningActive()) {
      const vorStatus = this.navaidTuner.getVorRadioTuningStatus(cdu);
      if (vorStatus.frequency !== null) {
        const selected = this.selectedNavaids[0];
        selected.type = this.getSelectedNavaidType(vorStatus.facility);
        selected.mode = vorStatus.manual ? SelectedNavaidMode.Manual : SelectedNavaidMode.Auto;
        selected.ident = vorStatus.ident;
        selected.frequency = vorStatus.frequency;
        selected.facility = vorStatus.facility ?? null;
      } else {
        this.resetSelectedNavaid(0);
      }
      const dmePair = this.navaidSelectionManager.dmePair;
      if (dmePair !== null) {
        for (const [i, dme] of dmePair.entries()) {
          const selected = this.selectedNavaids[i + 1];
          selected.type = this.getSelectedNavaidType(dme);
          selected.mode = SelectedNavaidMode.Auto;
          selected.ident = dme.ident;
          selected.frequency = dme.frequency;
          selected.facility = dme;
        }
      } else if (this.navaidSelectionManager.displayVorReason === VorSelectionReason.Navigation) {
        const navaid = this.navaidSelectionManager.displayVor;
        const selected = this.selectedNavaids[1];
        selected.type = this.getSelectedNavaidType(navaid);
        selected.mode = SelectedNavaidMode.Auto;
        selected.ident = Icao.getIdent(navaid.databaseId);
        selected.frequency = navaid.frequency;
        selected.facility = navaid;
        this.resetSelectedNavaid(2);
      } else {
        this.resetSelectedNavaid(1);
        this.resetSelectedNavaid(2);
      }
      const mmrStatus = this.navaidTuner.getMmrRadioTuningStatus(1);
      if (mmrStatus.frequency !== null) {
        const selected = this.selectedNavaids[3];
        selected.type = SelectedNavaidType.Ils; // FIXME support other types
        selected.mode = mmrStatus.manual ? SelectedNavaidMode.Manual : SelectedNavaidMode.Auto;
        selected.ident = mmrStatus.ident;
        selected.frequency = mmrStatus.frequency;
        selected.facility = mmrStatus.facility ?? null;
      } else {
        this.resetSelectedNavaid(3);
      }
    } else {
      // RMP
      for (let i = 0; i < 4; i++) {
        this.resetSelectedNavaid(i);
        // No DME pair with RMP active
        if (i === 1 || i === 2) {
          continue;
        }
        const selected = this.selectedNavaids[i];
        selected.type = i === 3 ? SelectedNavaidType.Ils : SelectedNavaidType.None;
        selected.mode = SelectedNavaidMode.Rmp;
        selected.frequency = SimVar.GetSimVarValue(`NAV ACTIVE FREQUENCY:${i === 0 ? cdu : cdu + 2}`, 'mhz');
      }
    }

    return this.selectedNavaids;
  }

  private getSelectedNavaidType(facility?: VhfNavaid): SelectedNavaidType {
    if (!facility) {
      return SelectedNavaidType.None;
    }
    switch (facility.type) {
      case VhfNavaidType.Dme:
        return SelectedNavaidType.Dme;
      case VhfNavaidType.Vor:
        return SelectedNavaidType.Vor;
      case VhfNavaidType.VorDme:
        return SelectedNavaidType.VorDme;
      case VhfNavaidType.Vortac:
        return SelectedNavaidType.VorTac;
      case VhfNavaidType.Tacan:
        return SelectedNavaidType.Tacan;
      case VhfNavaidType.IlsTacan:
      case VhfNavaidType.IlsDme:
        return SelectedNavaidType.Ils;
      default:
        return SelectedNavaidType.None;
    }
  }

  public getNearbyAirports(): Readonly<Readonly<NearbyFacility>[]> {
    return this.nearbyAirportMonitor.getCurrentFacilities();
  }
}
