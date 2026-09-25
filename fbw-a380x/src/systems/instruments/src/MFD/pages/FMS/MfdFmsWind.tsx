// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  ArraySubject,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
  Subscription,
  Vec2Math,
  VNode,
} from '@microsoft/msfs-sdk';
import { MathUtils } from '@flybywiresim/fbw-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import {
  areWindEntriesTheSame,
  FlightPlanWindEntry,
  FlightPlanWindEntryFlags,
  PropagatedWindEntry,
  PropagationType,
  WindEntry,
  WindVector,
} from '@fmgc/flightplanning/data/wind';
import { FpmConfigs } from '@fmgc/flightplanning/FpmConfig';
import { isLeg } from '@fmgc/flightplanning/legs/FlightPlanLeg';
import { SegmentClass } from '@fmgc/flightplanning/segments/SegmentClass';
import { ProfilePhase } from '@fmgc/guidance/vnav/profile/NavGeometryProfile';
import { FmgcFlightPhase } from '@shared/flightphase';

import { AbstractMfdPageProps } from '../../MFD';
import { FmsPage } from '../common/FmsPage';
import { Footer } from '../common/Footer';
import { TopTabNavigator, TopTabNavigatorPage } from '../../../MsfsAvionicsCommon/UiWidgets/TopTabNavigator';
import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DropdownMenu } from '../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { IconButton } from '../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import {
  CrzTempFormat,
  FlightLevelFormat,
  WindAltitudeFormat,
  WindDirectionFormat,
  WindSpeedFormat,
} from '../common/DataEntryFormats';
import { showReturnButtonUriExtra } from '../../shared/utils';
import { CpnyWindButton, cpnyWindRequestPage } from '../../shared/CpnyWindButtonUtils';

import './MfdFmsWind.scss';
import { fcomAt, fcomCentre, fcomRight, fcomTabBar } from '../common/FcomLayout';

interface MfdFmsWindProps extends AbstractMfdPageProps {}

/** The panels of the WIND page, in the order of the tabs of the active flight plan (A380 FCOM DSC-22-FMS-20-30). */
enum WindPanel {
  History,
  Climb,
  Cruise,
  Descent,
}

const panelTitles: Record<WindPanel, string> = {
  [WindPanel.History]: 'HISTORY',
  [WindPanel.Climb]: 'CLB',
  [WindPanel.Cruise]: 'CRZ',
  [WindPanel.Descent]: 'DES',
};

const panelForUriExtra: Record<string, WindPanel> = {
  history: WindPanel.History,
  clb: WindPanel.Climb,
  crz: WindPanel.Cruise,
  des: WindPanel.Descent,
};

/** Displayed and edited data of one row of a wind table. */
class WindRow {
  readonly altitude = Subject.create<number | null>(null);

  readonly direction = Subject.create<number | null>(null);

  readonly speed = Subject.create<number | null>(null);

  /** Pilot entries and company uplinks are shown in big font, history and propagated winds in small font (FCOM). */
  readonly enteredByPilot = Subject.create(true);

  /** Whether the row holds a wind entry of the flight plan (false: the row is free for a new entry). */
  readonly hasEntry = Subject.create(false);

  /** Whether the pilot may enter a new wind in this row (only the first free row). */
  readonly isNextFreeRow = Subject.create(false);

  /** Whether the altitude of this row may be changed (cruise: only at the waypoint the level was entered at). */
  readonly altitudeEditable = Subject.create(true);

  /** Whether the row may be cleared (cruise: propagated winds can be changed, but not cleared). */
  readonly canBeCleared = Subject.create(true);

  /** The wind entry of the flight plan shown in this row, if any. */
  entry: WindEntry | null = null;

  /** Where the cruise wind of this row was entered (leg index) and how it reached the selected waypoint. */
  propagation: PropagationType | null = null;

  setFromEntry(entry: WindEntry, enteredByPilot: boolean, propagation: PropagationType | null = null): void {
    this.entry = entry;
    this.propagation = propagation;
    this.altitude.set(entry.altitude);
    this.direction.set(windDirectionDegrees(entry.vector));
    this.speed.set(windSpeedKnots(entry.vector));
    this.enteredByPilot.set(enteredByPilot);
    this.hasEntry.set(true);
    this.altitudeEditable.set(propagation === null || propagation === PropagationType.Entry);
    this.canBeCleared.set(propagation === null || propagation === PropagationType.Entry);
  }

  /** Makes the row a free row. A row that was showing an entry loses its values, a pending entry is kept. */
  setFree(isNextFreeRow: boolean): void {
    if (this.entry !== null || !isNextFreeRow) {
      this.altitude.set(null);
      this.direction.set(null);
      this.speed.set(null);
    }
    this.entry = null;
    this.propagation = null;
    this.enteredByPilot.set(true);
    this.hasEntry.set(false);
    this.isNextFreeRow.set(isNextFreeRow);
    this.altitudeEditable.set(true);
    this.canBeCleared.set(true);
  }
}

/** The wind entry described by the values of a free row, or null while one of them is still missing. */
function pendingWindEntry(altitude: number | null, direction: number | null, speed: number | null): WindEntry | null {
  if (altitude === null || direction === null || speed === null) {
    return null;
  }
  return { altitude, vector: windVectorFromDirectionAndSpeed(direction, speed) };
}

function windDirectionDegrees(vector: WindVector): number {
  return Math.round(MathUtils.normalise360(Vec2Math.theta(vector) * MathUtils.RADIANS_TO_DEGREES)) % 360;
}

function windSpeedKnots(vector: WindVector): number {
  return Math.round(Vec2Math.abs(vector));
}

function windVectorFromDirectionAndSpeed(directionDegrees: number, speedKnots: number): WindVector {
  return Vec2Math.setFromPolar(speedKnots, directionDegrees * MathUtils.DEGREES_TO_RADIANS, Vec2Math.create());
}

function pilotWindEntry(altitude: number, vector: WindVector, flightLevel = false): FlightPlanWindEntry {
  return { altitude, vector, flags: flightLevel ? FlightPlanWindEntryFlags.EnteredAsFlightLevel : 0 };
}

function isFlightLevelEntry(entry: FlightPlanWindEntry): boolean {
  return (entry.flags & FlightPlanWindEntryFlags.EnteredAsFlightLevel) !== 0;
}

/**
 * FMS WIND page (A380 FCOM DSC-22-FMS-20-30 "WIND PAGE", p. 385-401): climb, cruise and descent winds, the cruise
 * temperature, the alternate trip wind and the history winds of the previous flight, for the active and the secondary
 * flight plans.
 *
 * Not modelled: the draft winds (INSERT WIND / CANCEL WIND); entries are inserted into the flight plan at once, as the
 * FMS has no draft state. The company wind request (ACARS) is not available.
 */
export class MfdFmsWind extends FmsPage<MfdFmsWindProps> {
  private static readonly numClimbLevels = FpmConfigs.A380.NUM_CLIMB_WIND_LEVELS;

  private static readonly numCruiseLevels = FpmConfigs.A380.NUM_CRUISE_WIND_LEVELS;

  private static readonly numDescentLevels = FpmConfigs.A380.NUM_DESCENT_WIND_LEVELS;

  private readonly isActivePlanPage = this.props.mfd.uiService.activeUri.get().category === 'active';

  /** The history winds are only available for the active flight plan (FCOM), so the SEC pages have no HISTORY tab. */
  private readonly panels: WindPanel[] = this.isActivePlanPage
    ? [WindPanel.History, WindPanel.Climb, WindPanel.Cruise, WindPanel.Descent]
    : [WindPanel.Climb, WindPanel.Cruise, WindPanel.Descent];

  private readonly selectedTabIndex = Subject.create(0);

  private readonly cpnyWindButton = new CpnyWindButton(this.props.fmcService.master, this.loadedFlightPlanIndex);

  private readonly showReturnButton = this.props.mfd.uiService.activeUri
    .get()
    .extra?.split('/')
    .includes(showReturnButtonUriExtra);

  private readonly isActiveOrCopiedFromActive = Subject.create(true);

  private readonly windEntryNotAllowedVisibility = this.tmpyActive.map((tmpy) => (tmpy ? 'visible' : 'hidden'));

  // ---- CLB panel ----------------------------------------------------------------------------------------------------

  private readonly climbRows = Array.from({ length: MfdFmsWind.numClimbLevels }, () => new WindRow());

  private readonly climbTransitionAltitude = Subject.create<number | null>(null);

  private readonly originElevation = Subject.create<number | null>(null);

  private readonly climbAltitudeFormat = new WindAltitudeFormat(this.climbTransitionAltitude, this.originElevation);

  /** Climb winds can only be entered or changed in preflight and without a temporary flight plan (FCOM). */
  private readonly climbEntryDisabled = MappedSubject.create(
    ([phase, tmpy, isActive]) => tmpy || (isActive && phase !== FmgcFlightPhase.Preflight),
    this.activeFlightPhase,
    this.tmpyActive,
    this.isActiveOrCopiedFromActive,
  );

  // ---- CRZ panel ----------------------------------------------------------------------------------------------------

  private readonly cruiseRows = Array.from({ length: MfdFmsWind.numCruiseLevels }, () => new WindRow());

  private readonly cruiseAltitudeFormat = new FlightLevelFormat();

  /** Leg indices of the cruise waypoints (between T/C and T/D) of the loaded flight plan. */
  private cruiseLegIndices: number[] = [];

  private readonly cruiseWaypointIdents = ArraySubject.create<string>([]);

  /** Index into cruiseLegIndices of the waypoint whose winds are shown, null when the plan has no cruise waypoint. */
  private readonly selectedCruiseWaypoint = Subject.create<number | null>(null);

  private readonly propagatedWindsCache: PropagatedWindEntry[] = [];

  /** Cruise winds can only be entered if no temporary flight plan is pending (FCOM). */
  private readonly cruiseEntryDisabled = MappedSubject.create(
    ([tmpy, selected]) => tmpy || selected === null,
    this.tmpyActive,
    this.selectedCruiseWaypoint,
  );

  private readonly previousCruiseWaypointDisabled = this.selectedCruiseWaypoint.map((i) => i === null || i <= 0);

  private readonly nextCruiseWaypointDisabled = this.selectedCruiseWaypoint.map(
    (i) => i === null || i >= this.cruiseLegIndices.length - 1,
  );

  private readonly cruiseFlightLevel = Subject.create<number | null>(null);

  private readonly cruiseTemperature = Subject.create<number | null>(null);

  private readonly cruiseTemperatureIsPilotEntered = Subject.create(false);

  private readonly cruiseTemperatureDisabled = MappedSubject.create(
    ([tmpy, crzFl]) => tmpy || crzFl === null,
    this.tmpyActive,
    this.cruiseFlightLevel,
  );

  // ---- DES panel ----------------------------------------------------------------------------------------------------

  private readonly descentRows = Array.from({ length: MfdFmsWind.numDescentLevels }, () => new WindRow());

  private readonly descentTransitionAltitude = Subject.create<number | null>(null);

  private readonly destinationElevation = Subject.create<number | null>(null);

  private readonly descentAltitudeFormat = new WindAltitudeFormat(
    this.descentTransitionAltitude,
    this.destinationElevation,
  );

  /** Descent winds can only be entered or changed before the DESCENT phase and without a temporary plan (FCOM). */
  private readonly descentEntryDisabled = MappedSubject.create(
    ([phase, tmpy, isActive]) => tmpy || (isActive && phase >= FmgcFlightPhase.Descent),
    this.activeFlightPhase,
    this.tmpyActive,
    this.isActiveOrCopiedFromActive,
  );

  private readonly alternateCruiseFlightLevel = Subject.create<string>('---');

  private readonly alternateWindDirection = Subject.create<number | null>(null);

  private readonly alternateWindSpeed = Subject.create<number | null>(null);

  private readonly hasAlternate = Subject.create(false);

  private readonly alternateWindDisabled = MappedSubject.create(
    ([tmpy, hasAlternate]) => tmpy || !hasAlternate,
    this.tmpyActive,
    this.hasAlternate,
  );

  // ---- HISTORY panel ------------------------------------------------------------------------------------------------

  /** CRZ FL, FL 250, FL 150 and FL 050 (FCOM), highest first. */
  private readonly historyRows = Array.from({ length: 4 }, () => ({
    flightLevel: Subject.create('---'),
    direction: Subject.create('---'),
    speed: Subject.create('---'),
  }));

  private historyWinds: Readonly<WindEntry>[] = [];

  private readonly insertHistoryWindDisabled = Subject.create(true);

  private readonly panelSubscriptions: Subscription[] = [];

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.selectInitialPanel();

    this.subs.push(
      this.windEntryNotAllowedVisibility,
      this.climbEntryDisabled,
      this.cruiseEntryDisabled,
      this.previousCruiseWaypointDisabled,
      this.nextCruiseWaypointDisabled,
      this.cruiseTemperatureDisabled,
      this.descentEntryDisabled,
      this.alternateWindDisabled,
      this.activeFlightPhase.sub(() => this.updateHistoryInsertAvailability()),
      this.tmpyActive.sub(() => this.updateHistoryInsertAvailability()),
    );
  }

  /** The panel named in the URI, otherwise the panel of the current flight phase (climb before cruise etc.). */
  private selectInitialPanel(): void {
    const extras = this.props.mfd.uiService.activeUri.get().extra?.split('/') ?? [];
    let panel = extras.map((e) => panelForUriExtra[e]).find((p) => p !== undefined);

    if (panel === undefined) {
      const phase = this.activeFlightPhase.get();
      if (!this.isActivePlanPage || phase < FmgcFlightPhase.Cruise) {
        panel = WindPanel.Climb;
      } else if (phase === FmgcFlightPhase.Cruise) {
        panel = WindPanel.Cruise;
      } else {
        panel = WindPanel.Descent;
      }
    }

    const tabIndex = this.panels.indexOf(panel);
    this.selectedTabIndex.set(tabIndex >= 0 ? tabIndex : this.panels.indexOf(WindPanel.Climb));
  }

  protected onNewData(): void {
    const plan = this.loadedFlightPlan;
    if (!this.props.fmcService.master || !plan) {
      return;
    }

    const planIndex = this.loadedFlightPlanIndex.get();
    this.isActiveOrCopiedFromActive.set(this.props.flightPlanInterface.get(planIndex).isActiveOrCopiedFromActive());

    const pd = plan.performanceData;

    // CLB
    this.originElevation.set(plan.originAirport?.location.alt ?? null);
    this.climbTransitionAltitude.set(pd.transitionAltitude.get());
    this.loadClimbOrDescentRows(
      this.climbRows,
      [...pd.climbWindEntries.get()].sort((a, b) => a.altitude - b.altitude),
      this.climbAltitudeFormat,
    );

    // CRZ
    this.loadCruiseWaypoints();
    this.loadCruiseRows();
    this.cruiseFlightLevel.set(pd.cruiseFlightLevel.get());
    this.cruiseTemperature.set(pd.cruiseTemperature.get());
    this.cruiseTemperatureIsPilotEntered.set(pd.isCruiseTemperaturePilotEntered.get());

    // DES
    this.destinationElevation.set(plan.destinationAirport?.location.alt ?? null);
    const transitionLevel = pd.transitionLevel.get();
    this.descentTransitionAltitude.set(transitionLevel !== null ? transitionLevel * 100 : null);
    this.loadClimbOrDescentRows(
      this.descentRows,
      [...pd.descentWindEntries.get()].sort((a, b) => b.altitude - a.altitude),
      this.descentAltitudeFormat,
    );

    const hasAlternate = this.loadedAlternateFlightPlan?.destinationAirport !== undefined;
    this.hasAlternate.set(hasAlternate);
    const alternateCruiseLevel = hasAlternate
      ? this.props.fmcService.master.computeAlternateCruiseLevel(planIndex)
      : undefined;
    this.alternateCruiseFlightLevel.set(
      alternateCruiseLevel !== undefined ? alternateCruiseLevel.toFixed(0).padStart(3, '0') : '---',
    );
    const alternateWind = pd.alternateWind.get();
    this.alternateWindDirection.set(alternateWind ? windDirectionDegrees(alternateWind) : null);
    this.alternateWindSpeed.set(alternateWind ? windSpeedKnots(alternateWind) : null);

    // HISTORY
    this.loadHistoryWinds();
  }

  private loadClimbOrDescentRows(
    rows: WindRow[],
    entries: FlightPlanWindEntry[],
    altitudeFormat: WindAltitudeFormat,
  ): void {
    altitudeFormat.setFlightLevelAltitudes(entries.filter(isFlightLevelEntry).map((e) => e.altitude));
    rows.forEach((row, i) => {
      const entry = entries[i];
      if (entry !== undefined) {
        row.setFromEntry(entry, (entry.flags & FlightPlanWindEntryFlags.InsertedFromHistory) === 0);
      } else {
        row.setFree(i === entries.length);
      }
    });
  }

  // ---- CLB / DES handlers -------------------------------------------------------------------------------------------

  private altitudeFormat(panel: WindPanel.Climb | WindPanel.Descent): WindAltitudeFormat {
    return panel === WindPanel.Climb ? this.climbAltitudeFormat : this.descentAltitudeFormat;
  }

  private async setClimbOrDescentWind(
    panel: WindPanel.Climb | WindPanel.Descent,
    altitude: number,
    entry: FlightPlanWindEntry | null,
  ): Promise<void> {
    const planIndex = this.loadedFlightPlanIndex.get();
    if (panel === WindPanel.Climb) {
      await this.props.flightPlanInterface.setClimbWindEntry(altitude, entry, planIndex);
    } else {
      await this.props.flightPlanInterface.setDescentWindEntry(altitude, entry, planIndex, true);
    }
  }

  private async onClimbOrDescentAltitudeModified(
    panel: WindPanel.Climb | WindPanel.Descent,
    row: WindRow,
    newAltitude: number | null,
  ): Promise<void> {
    const entry = row.entry;
    if (entry !== null) {
      // Clearing the altitude deletes the wind, a new altitude moves it
      await this.setClimbOrDescentWind(panel, entry.altitude, null);
      if (newAltitude !== null) {
        await this.setClimbOrDescentWind(
          panel,
          newAltitude,
          pilotWindEntry(newAltitude, entry.vector, this.altitudeFormat(panel).isFlightLevelEntry(newAltitude)),
        );
      }
      return;
    }

    const pending = pendingWindEntry(newAltitude, row.direction.get(), row.speed.get());
    if (pending !== null) {
      await this.setClimbOrDescentWind(
        panel,
        pending.altitude,
        pilotWindEntry(
          pending.altitude,
          pending.vector,
          this.altitudeFormat(panel).isFlightLevelEntry(pending.altitude),
        ),
      );
    }
  }

  private async onClimbOrDescentWindModified(
    panel: WindPanel.Climb | WindPanel.Descent,
    row: WindRow,
    newDirection: number | null,
    newSpeed: number | null,
  ): Promise<void> {
    const entry = row.entry;
    if (entry !== null) {
      // Clearing the direction or the velocity deletes the wind
      const newEntry =
        newDirection !== null && newSpeed !== null
          ? pilotWindEntry(
              entry.altitude,
              windVectorFromDirectionAndSpeed(newDirection, newSpeed),
              this.altitudeFormat(panel).isFlightLevelEntry(entry.altitude),
            )
          : null;
      await this.setClimbOrDescentWind(panel, entry.altitude, newEntry);
      return;
    }

    const pending = pendingWindEntry(row.altitude.get(), newDirection, newSpeed);
    if (pending !== null) {
      await this.setClimbOrDescentWind(
        panel,
        pending.altitude,
        pilotWindEntry(
          pending.altitude,
          pending.vector,
          this.altitudeFormat(panel).isFlightLevelEntry(pending.altitude),
        ),
      );
    }
  }

  // ---- CRZ ------------------------------------------------------------------------------------------------------------

  /**
   * Collects the cruise waypoints of the loaded plan: the legs between T/C and T/D (FCOM), i.e. the legs predicted in
   * the cruise phase, or the en-route legs while no prediction exists. Legs already sequenced are not shown.
   */
  private loadCruiseWaypoints(): void {
    const plan = this.loadedFlightPlan;
    if (!plan) {
      return;
    }

    const predictions =
      plan.index === FlightPlanIndex.Active
        ? this.props.fmcService.master.guidanceController?.vnavDriver?.mcduProfile?.waypointPredictions
        : undefined;

    const previouslySelectedLegIndex = this.selectedCruiseLegIndex();
    const legIndices: number[] = [];
    const idents: string[] = [];
    for (let i = Math.max(0, plan.activeLegIndex); i < plan.firstMissedApproachLegIndex; i++) {
      const leg = plan.maybeElementAt(i);
      if (!isLeg(leg) || !leg.isXF()) {
        continue;
      }

      const prediction = predictions?.get(i);
      const isCruiseLeg =
        prediction !== undefined
          ? prediction.profilePhase === ProfilePhase.Cruise
          : leg.segment.class === SegmentClass.Enroute;
      if (isCruiseLeg) {
        legIndices.push(i);
        idents.push(leg.ident);
      }
    }

    const listChanged =
      legIndices.length !== this.cruiseLegIndices.length || legIndices.some((v, i) => v !== this.cruiseLegIndices[i]);
    this.cruiseLegIndices = legIndices;
    if (listChanged) {
      this.cruiseWaypointIdents.set(idents);
    }

    if (legIndices.length === 0) {
      this.selectedCruiseWaypoint.set(null);
    } else {
      // Keep the waypoint that was selected, otherwise show the first cruise waypoint
      const keptIndex = previouslySelectedLegIndex !== null ? legIndices.indexOf(previouslySelectedLegIndex) : -1;
      this.selectedCruiseWaypoint.set(keptIndex >= 0 ? keptIndex : 0);
    }
  }

  private selectedCruiseLegIndex(): number | null {
    const selected = this.selectedCruiseWaypoint.get();
    return selected !== null && selected < this.cruiseLegIndices.length ? this.cruiseLegIndices[selected] : null;
  }

  private loadCruiseRows(): void {
    const legIndex = this.selectedCruiseLegIndex();
    const winds: PropagatedWindEntry[] =
      legIndex !== null
        ? this.props.flightPlanInterface.propagateWindsAt(
            legIndex,
            this.propagatedWindsCache,
            this.loadedFlightPlanIndex.get(),
          )
        : [];

    this.cruiseRows.forEach((row, i) => {
      const wind = winds[i];
      if (wind !== undefined) {
        // Pilot-entered winds in big font, propagated winds in small font (FCOM)
        row.setFromEntry(
          { altitude: wind.altitude, vector: Vec2Math.copy(wind.vector, Vec2Math.create()) },
          wind.type === PropagationType.Entry,
          wind.type,
        );
      } else {
        row.setFree(i === winds.length);
      }
    });
  }

  private selectCruiseWaypoint(index: number | null): void {
    if (index === null || index < 0 || index >= this.cruiseLegIndices.length) {
      return;
    }
    this.selectedCruiseWaypoint.set(index);
    this.loadCruiseRows();
  }

  private async onCruiseAltitudeModified(row: WindRow, newAltitudeFl: number | null): Promise<void> {
    const legIndex = this.selectedCruiseLegIndex();
    if (legIndex === null) {
      return;
    }
    const planIndex = this.loadedFlightPlanIndex.get();
    const newAltitude = newAltitudeFl !== null ? newAltitudeFl * 100 : null;

    const entry = row.entry;
    if (entry !== null) {
      if (newAltitude === null) {
        await this.props.flightPlanInterface.deleteCruiseWindEntry(legIndex, entry.altitude, planIndex);
      } else {
        await this.props.flightPlanInterface.editCruiseWindEntry(
          legIndex,
          entry.altitude,
          { altitude: newAltitude, vector: entry.vector },
          planIndex,
        );
      }
      return;
    }

    const pending = pendingWindEntry(newAltitude, row.direction.get(), row.speed.get());
    if (pending !== null) {
      await this.props.flightPlanInterface.addCruiseWindEntry(legIndex, pending, planIndex);
    }
  }

  private async onCruiseWindModified(
    row: WindRow,
    newDirection: number | null,
    newSpeed: number | null,
  ): Promise<void> {
    const legIndex = this.selectedCruiseLegIndex();
    if (legIndex === null) {
      return;
    }
    const planIndex = this.loadedFlightPlanIndex.get();

    const entry = row.entry;
    if (entry !== null) {
      if (newDirection === null || newSpeed === null) {
        // Only a wind entered at this waypoint can be cleared
        if (row.propagation === PropagationType.Entry) {
          await this.props.flightPlanInterface.deleteCruiseWindEntry(legIndex, entry.altitude, planIndex);
        }
        return;
      }

      const newEntry: WindEntry = {
        altitude: entry.altitude,
        vector: windVectorFromDirectionAndSpeed(newDirection, newSpeed),
      };
      if (row.propagation === PropagationType.Entry) {
        await this.props.flightPlanInterface.editCruiseWindEntry(legIndex, entry.altitude, newEntry, planIndex);
      } else {
        // Changing a propagated wind enters it at this waypoint, from where it propagates down-path (FCOM)
        await this.props.flightPlanInterface.addCruiseWindEntry(legIndex, newEntry, planIndex);
      }
      return;
    }

    const pending = pendingWindEntry(row.altitude.get(), newDirection, newSpeed);
    if (pending !== null) {
      await this.props.flightPlanInterface.addCruiseWindEntry(legIndex, pending, planIndex);
    }
  }

  // ---- HISTORY --------------------------------------------------------------------------------------------------------

  private loadHistoryWinds(): void {
    const cruiseLevel = this.loadedFlightPlan?.performanceData.cruiseFlightLevel.get() ?? null;
    this.historyWinds = this.isActivePlanPage
      ? [...this.props.fmcService.master.getHistoryWinds(cruiseLevel)].sort((a, b) => b.altitude - a.altitude)
      : [];

    this.historyRows.forEach((row, i) => {
      const wind = this.historyWinds[i];
      if (wind !== undefined) {
        row.flightLevel.set(
          Math.round(wind.altitude / 100)
            .toFixed(0)
            .padStart(3, '0'),
        );
        row.direction.set(windDirectionDegrees(wind.vector).toFixed(0).padStart(3, '0'));
        row.speed.set(windSpeedKnots(wind.vector).toFixed(0).padStart(3, '0'));
      } else {
        row.flightLevel.set('---');
        row.direction.set('---');
        row.speed.set('---');
      }
    });

    this.updateHistoryInsertAvailability();
  }

  /**
   * The history winds can be inserted in preflight only, into the active flight plan, when no temporary flight plan is
   * pending (FCOM), and only while they are not the climb winds already.
   */
  private updateHistoryInsertAvailability(): void {
    const climbWinds = this.loadedFlightPlan?.performanceData.climbWindEntries.get() ?? [];
    const alreadyInserted =
      this.historyWinds.length > 0 &&
      climbWinds.length === this.historyWinds.length &&
      [...climbWinds]
        .sort((a, b) => b.altitude - a.altitude)
        .every((wind, i) => areWindEntriesTheSame(wind, this.historyWinds[i]));

    this.insertHistoryWindDisabled.set(
      !this.isActivePlanPage ||
        this.historyWinds.length === 0 ||
        this.activeFlightPhase.get() !== FmgcFlightPhase.Preflight ||
        this.tmpyActive.get() ||
        alreadyInserted,
    );
  }

  private async insertHistoryWinds(): Promise<void> {
    if (this.insertHistoryWindDisabled.get()) {
      return;
    }

    await this.props.flightPlanInterface.deleteClimbWindEntries(FlightPlanIndex.Active);
    for (const wind of this.historyWinds) {
      const entry: FlightPlanWindEntry = {
        altitude: wind.altitude,
        vector: Vec2Math.copy(wind.vector, Vec2Math.create()),
        // History winds are measured at flight levels (FCOM: CRZ FL, FL 250, FL 150 and FL 050)
        flags: FlightPlanWindEntryFlags.InsertedFromHistory | FlightPlanWindEntryFlags.EnteredAsFlightLevel,
      };
      await this.props.flightPlanInterface.setClimbWindEntry(wind.altitude, entry, FlightPlanIndex.Active);
    }

    // Displays the CLB panel of the WIND page (FCOM)
    this.selectedTabIndex.set(this.panels.indexOf(WindPanel.Climb));
  }

  public destroy(): void {
    this.cpnyWindButton.destroy();
    this.climbAltitudeFormat.destroy();
    this.cruiseAltitudeFormat.destroy();
    this.descentAltitudeFormat.destroy();
    for (const s of this.panelSubscriptions) {
      s.destroy();
    }
    super.destroy();
  }

  // ---- render ---------------------------------------------------------------------------------------------------------
  // Positions from the FCOM figures (DSC-22-FMS-20-30 P 385 HISTORY, P 392 CLB, P 397-400 CRZ), in page container
  // coordinates (display y - 143). The panels are drawn over the tab panel (x = 9 to 757, y = 45 to 739).

  /** Vertical centres of the wind rows of the CLB and DES tables (P 392: rows of 80 px from y = 358). */
  private static readonly climbRowY = [264, 344, 424, 504, 584];

  /** Vertical centres of the wind rows of the CRZ table (below the ALT / T.WIND header row, P 397-400). */
  private static readonly cruiseRowY = [316, 396, 476, 556];

  /** A wind table: frame and row separators (P 385, P 392) */
  private static renderTable(left: number, top: number, width: number, rowLines: number[], bottom: number): VNode {
    return (
      <>
        <div
          class="mfd-fms-wind-table"
          style={`left: ${left}px; top: ${top}px; width: ${width}px; height: ${bottom - top}px;`}
        />
        {rowLines.map((y) => (
          <div class="mfd-fms-wind-table-line" style={`left: ${left}px; top: ${y}px; width: ${width}px;`} />
        ))}
      </>
    );
  }

  /** The WIND ENTRY NOT ALLOWED message of the CLB, CRZ and DES panels (P 392) */
  private renderNotAllowed(): VNode {
    return (
      <div style={{ visibility: this.windEntryNotAllowedVisibility }}>
        {fcomCentre(
          179,
          382,
          <span class="mfd-fms-wind-not-allowed">WIND ENTRY NOT ALLOWED : TMPY F-PLN EXISTING</span>,
        )}
      </div>
    );
  }

  /** One wind row: ALT field, and the direction / velocity fields in a frame (P 392) */
  private renderWindRow(
    y: number,
    row: WindRow,
    altitudeFormat: WindAltitudeFormat | FlightLevelFormat,
    disabled: Subscribable<boolean>,
    onAltitudeModified: (newValue: number | null) => Promise<void>,
    onWindModified: (direction: number | null, speed: number | null) => Promise<void>,
  ): VNode {
    const rowDisabled = MappedSubject.create(
      ([panelDisabled, hasEntry, isNextFreeRow]) => panelDisabled || (!hasEntry && !isNextFreeRow),
      disabled,
      row.hasEntry,
      row.isNextFreeRow,
    );
    const altitudeDisabled = MappedSubject.create(
      ([rowDis, altitudeEditable]) => rowDis || !altitudeEditable,
      rowDisabled,
      row.altitudeEditable,
    );
    this.panelSubscriptions.push(rowDisabled, altitudeDisabled);

    return (
      <>
        {fcomAt(
          y,
          168,
          <InputField<number>
            dataEntryFormat={altitudeFormat}
            value={row.altitude}
            dataHandlerDuringValidation={onAltitudeModified}
            disabled={altitudeDisabled}
            canBeCleared={row.canBeCleared}
            enteredByPilot={row.enteredByPilot}
            containerStyle="width: 139px;"
            alignText="flex-end"
            tmpyActive={this.tmpyActive}
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {this.renderWindFields(
          y,
          row.direction,
          row.speed,
          rowDisabled,
          row.canBeCleared,
          row.enteredByPilot,
          (v) => onWindModified(v, row.speed.get()),
          (v) => onWindModified(row.direction.get(), v),
        )}
      </>
    );
  }

  /** Wind direction and velocity fields in their frame, x = 369 to 590 (P 392) */
  private renderWindFields(
    y: number,
    direction: Subject<number | null>,
    speed: Subject<number | null>,
    disabled: Subscribable<boolean>,
    canBeCleared: Subscribable<boolean>,
    enteredByPilot: Subscribable<boolean>,
    onDirectionModified: (v: number | null) => Promise<void>,
    onSpeedModified: (v: number | null) => Promise<void>,
  ): VNode {
    return (
      <>
        <div class="mfd-fms-wind-group" style={`top: ${y - 27}px;`} />
        {fcomAt(
          y,
          377,
          <InputField<number>
            dataEntryFormat={new WindDirectionFormat()}
            value={direction}
            dataHandlerDuringValidation={onDirectionModified}
            disabled={disabled}
            canBeCleared={canBeCleared}
            enteredByPilot={enteredByPilot}
            containerStyle="width: 83px;"
            alignText="flex-end"
            tmpyActive={this.tmpyActive}
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomAt(
          y,
          477,
          <InputField<number>
            dataEntryFormat={new WindSpeedFormat()}
            value={speed}
            dataHandlerDuringValidation={onSpeedModified}
            disabled={disabled}
            canBeCleared={canBeCleared}
            enteredByPilot={enteredByPilot}
            containerStyle="width: 98px;"
            alignText="flex-end"
            tmpyActive={this.tmpyActive}
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
      </>
    );
  }

  /** HISTORY panel (P 385): CRZ FL, FL 250, FL 150 and FL 050 winds of the previous flight */
  private renderHistoryPanel(): VNode {
    const rowY = [270, 350, 430, 509];
    return (
      <>
        {MfdFmsWind.renderTable(115, 153, 495, [214, 304, 384, 464, 544], 621)}
        {fcomCentre(184, 224, <span class="mfd-label">ALT</span>)}
        {fcomCentre(184, 495, <span class="mfd-label">T.WIND</span>)}
        {this.historyRows.map((row, i) => (
          <>
            {i === 0 && fcomRight(rowY[i], 170, <span class="mfd-label">CRZ</span>)}
            {fcomRight(
              rowY[i],
              272,
              <>
                <span class="mfd-label-unit mfd-unit-leading">FL</span>
                <span class="mfd-value bigger">{row.flightLevel}</span>
              </>,
            )}
            {fcomRight(
              rowY[i],
              453,
              <>
                <span class="mfd-value bigger">{row.direction}</span>
                <span class="mfd-label-unit mfd-unit-trailing">°</span>
              </>,
            )}
            {fcomRight(
              rowY[i],
              597,
              <>
                <span class="mfd-value bigger">/{row.speed}</span>
                <span class="mfd-label-unit mfd-unit-trailing">KT</span>
              </>,
            )}
          </>
        ))}
        {fcomAt(
          705,
          529,
          <Button
            label={
              <span class="fr aic">
                <span style="white-space: pre; text-align: center;">{'INSERT\nHISTORY WIND'}</span>
                <span style="margin-left: 20px;">*</span>
              </span>
            }
            disabled={this.insertHistoryWindDisabled}
            onClick={() => this.insertHistoryWinds()}
            buttonStyle="width: 194px; height: 42px;"
          />,
        )}
      </>
    );
  }

  /** CLB panel (P 392) */
  private renderClimbPanel(): VNode {
    return (
      <>
        {fcomAt(105, 154, <span class="mfd-label">CLB WIND</span>)}
        {this.renderNotAllowed()}
        {MfdFmsWind.renderTable(154, 215, 453, [306, 385, 465, 545], 624)}
        {this.climbRows.map((row, i) =>
          this.renderWindRow(
            MfdFmsWind.climbRowY[i],
            row,
            this.climbAltitudeFormat,
            this.climbEntryDisabled,
            (v) => this.onClimbOrDescentAltitudeModified(WindPanel.Climb, row, v),
            (d, s) => this.onClimbOrDescentWindModified(WindPanel.Climb, row, d, s),
          ),
        )}
      </>
    );
  }

  /** CRZ panel (P 395-400): cruise waypoint list and scroll buttons, 4 cruise wind levels, SAT */
  private renderCruisePanel(): VNode {
    return (
      <>
        {fcomAt(105, 154, <span class="mfd-label">CRZ WIND AT</span>)}
        {fcomAt(
          105,
          328,
          <DropdownMenu
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_windCrzWaypointDropdown`}
            selectedIndex={this.selectedCruiseWaypoint}
            values={this.cruiseWaypointIdents}
            freeTextAllowed={false}
            containerStyle="width: 170px;"
            alignLabels="flex-start"
            numberOfDigitsForInputField={7}
            onModified={(i) => this.selectCruiseWaypoint(i)}
            tmpyActive={this.tmpyActive}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomAt(
          105,
          530,
          <div class="fr">
            <IconButton
              icon="double-up"
              disabled={this.previousCruiseWaypointDisabled}
              onClick={() => this.selectCruiseWaypoint((this.selectedCruiseWaypoint.get() ?? 0) - 1)}
              containerStyle="width: 36px; height: 36px; margin-right: 4px;"
            />
            <IconButton
              icon="double-down"
              disabled={this.nextCruiseWaypointDisabled}
              onClick={() => this.selectCruiseWaypoint((this.selectedCruiseWaypoint.get() ?? 0) + 1)}
              containerStyle="width: 36px; height: 36px;"
            />
          </div>,
        )}
        {this.renderNotAllowed()}
        {MfdFmsWind.renderTable(154, 215, 453, [276, 356, 436, 516], 596)}
        {fcomCentre(245, 241, <span class="mfd-label">ALT</span>)}
        {fcomCentre(245, 479, <span class="mfd-label">T.WIND</span>)}
        {this.cruiseRows.map((row, i) =>
          this.renderWindRow(
            MfdFmsWind.cruiseRowY[i],
            row,
            this.cruiseAltitudeFormat,
            this.cruiseEntryDisabled,
            (v) => this.onCruiseAltitudeModified(row, v),
            (d, s) => this.onCruiseWindModified(row, d, s),
          ),
        )}
        {fcomRight(660, 160, <span class="mfd-label">SAT</span>)}
        {fcomAt(
          660,
          168,
          <InputField<number, number, false>
            dataEntryFormat={new CrzTempFormat()}
            readonlyValue={this.cruiseTemperature}
            dataHandlerDuringValidation={async (v) =>
              this.props.flightPlanInterface.setPerformanceData(
                'cruiseTemperaturePilotEntry',
                v,
                this.loadedFlightPlanIndex.get(),
              )
            }
            enteredByPilot={this.cruiseTemperatureIsPilotEntered}
            disabled={this.cruiseTemperatureDisabled}
            containerStyle="width: 139px;"
            alignText="center"
            tmpyActive={this.tmpyActive}
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomCentre(660, 341, <span class="mfd-label">AT</span>)}
        {fcomAt(
          660,
          377,
          <InputField<number>
            dataEntryFormat={new FlightLevelFormat()}
            value={this.cruiseFlightLevel}
            disabled={Subject.create(true)}
            containerStyle="width: 98px;"
            alignText="center"
            tmpyActive={this.tmpyActive}
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
      </>
    );
  }

  /** DES panel (P 400-401): 5 descent wind levels, alternate cruise FL and alternate trip wind */
  private renderDescentPanel(): VNode {
    return (
      <>
        {fcomAt(105, 154, <span class="mfd-label">DES WIND</span>)}
        {this.renderNotAllowed()}
        {MfdFmsWind.renderTable(154, 215, 453, [306, 385, 465, 545], 624)}
        {this.descentRows.map((row, i) =>
          this.renderWindRow(
            MfdFmsWind.climbRowY[i],
            row,
            this.descentAltitudeFormat,
            this.descentEntryDisabled,
            (v) => this.onClimbOrDescentAltitudeModified(WindPanel.Descent, row, v),
            (d, s) => this.onClimbOrDescentWindModified(WindPanel.Descent, row, d, s),
          ),
        )}
        {fcomRight(680, 160, <span class="mfd-label">ALTN</span>)}
        {fcomRight(
          680,
          272,
          <>
            <span class="mfd-label-unit mfd-unit-leading">FL</span>
            <span class="mfd-value bigger">{this.alternateCruiseFlightLevel}</span>
          </>,
        )}
        {this.renderWindFields(
          680,
          this.alternateWindDirection,
          this.alternateWindSpeed,
          this.alternateWindDisabled,
          Subject.create(true),
          Subject.create(true),
          (v) => this.onAlternateWindModified(v, this.alternateWindSpeed.get()),
          (v) => this.onAlternateWindModified(this.alternateWindDirection.get(), v),
        )}
      </>
    );
  }

  /** The alternate trip wind is one average wind (FCOM); it is set once direction and velocity are known. */
  private async onAlternateWindModified(direction: number | null, speed: number | null): Promise<void> {
    const planIndex = this.loadedFlightPlanIndex.get();
    if (direction === null || speed === null) {
      if (this.loadedFlightPlan?.performanceData.alternateWind.get()) {
        await this.props.flightPlanInterface.setAlternateWind(null, planIndex);
      }
      return;
    }
    await this.props.flightPlanInterface.setAlternateWind(windVectorFromDirectionAndSpeed(direction, speed), planIndex);
  }

  render(): VNode {
    const renderers: Record<WindPanel, () => VNode> = {
      [WindPanel.History]: () => this.renderHistoryPanel(),
      [WindPanel.Climb]: () => this.renderClimbPanel(),
      [WindPanel.Cruise]: () => this.renderCruisePanel(),
      [WindPanel.Descent]: () => this.renderDescentPanel(),
    };

    return (
      this.props.fmcService.master && (
        <>
          {super.render()}
          {/* begin page content */}
          <div class="mfd-page-container" style="position: relative;">
            {/* The history winds are only available for the active flight plan (FCOM): no HISTORY tab for a SEC plan.
                The tab panels end at y = 882 (P 392); their content is drawn in the overlays below. */}
            <TopTabNavigator
              pageTitles={this.panels.map((p) => panelTitles[p])}
              selectedPageIndex={this.selectedTabIndex}
              pageChangeCallback={(val: number) => this.selectedTabIndex.set(val)}
              selectedTabTextColor="white"
              {...fcomTabBar}
            >
              {this.panels.map(() => (
                <TopTabNavigatorPage containerStyle="flex: 0 0 auto; box-sizing: border-box; height: 696px;" />
              ))}
            </TopTabNavigator>
            {this.panels.map((panel, i) => (
              <div
                class="mfd-fcom-overlay"
                style={{ display: this.selectedTabIndex.map((sel) => (sel === i ? 'block' : 'none')) }}
              >
                {renderers[panel]()}
              </div>
            ))}
            {/* P 385 / P 392: RETURN at the lower left (not displayed when the page was called from the menu bar),
                CPNY WIND REQUEST right of it */}
            <div class="mfd-fcom-overlay">
              {this.showReturnButton &&
                fcomAt(
                  793,
                  5,
                  <Button
                    label="RETURN"
                    onClick={() => this.props.mfd.uiService.navigateTo('back')}
                    buttonStyle="width: 101px;"
                  />,
                )}
              {fcomAt(
                785,
                195,
                <Button
                  label={this.cpnyWindButton.label}
                  onClick={() =>
                    // FCOM DSC-22-FMS-20-30 P 393: opens the COMPANY WIND DATA REQUEST page (also while pending)
                    this.cpnyWindButton.received.get()
                      ? {}
                      : this.props.mfd.uiService.navigateTo(
                          `fms/${this.props.mfd.uiService.activeUri.get().category}/${cpnyWindRequestPage}`,
                        )
                  }
                  idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_windCpnyWind`}
                  menuItems={this.cpnyWindButton.menuItems}
                  showArrow={false}
                  buttonStyle="width: 156px; height: 42px;"
                />,
              )}
            </div>
            {/* end page content */}
          </div>
          <Footer
            bus={this.props.bus}
            mfd={this.props.mfd}
            fmcService={this.props.fmcService}
            flightPlanInterface={this.props.fmcService.master.flightPlanInterface}
          />
        </>
      )
    );
  }
}
