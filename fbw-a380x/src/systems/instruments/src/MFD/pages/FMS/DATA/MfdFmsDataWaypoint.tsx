// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ArraySubject, FSComponent, MappedSubject, Subject, Subscribable, VNode } from '@microsoft/msfs-sdk';
import { coordinateToString, Fix } from '@flybywiresim/fbw-sdk';
import { Coordinates } from 'msfs-geo';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import { PilotWaypoint, PilotWaypointType } from '@fmgc/flightplanning/DataManager';
import { WaypointEntryUtils } from '@fmgc/flightplanning/WaypointEntryUtils';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { TopTabNavigator, TopTabNavigatorPage } from '../../../../MsfsAvionicsCommon/UiWidgets/TopTabNavigator';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { ConfirmationDialog } from '../../../../MsfsAvionicsCommon/UiWidgets/ConfirmationDialog';
import {
  BearingFormat,
  DistanceFormat,
  LatitudeDmsFormat,
  LongitudeDmsFormat,
  WaypointFormat,
} from '../../common/DataEntryFormats';
import { NXSystemMessages } from '../../../shared/NXSystemMessages';
import { showReturnButtonUriExtra } from '../../../shared/utils';

import './MfdFmsDataWaypoint.scss';
import { fcomAt, fcomCentre, fcomRight, fcomTabBar } from '../../common/FcomLayout';

interface MfdFmsDataWaypointProps extends AbstractMfdPageProps {}

/** FCOM P 116: the new waypoint function shows the latitude as ----.-- and the longitude as -----.-- */
class NewWaypointLatitudeFormat extends LatitudeDmsFormat {
  public readonly placeholder = '----.--';
}

class NewWaypointLongitudeFormat extends LongitudeDmsFormat {
  public readonly placeholder = '-----.--';
}

enum WaypointPanel {
  Database,
  PilotStored,
}

/** URI extra that opens the new waypoint function with an ident: fms/data/waypoint/new/IDENT */
const newWaypointUriExtra = 'new';

/**
 * DATA / WAYPOINT page (A380 FCOM DSC-22-FMS-20-30 "DATA / WAYPOINT PAGE"): the DATABASE WPTs panel shows the
 * position of a navigation database waypoint, NAVAID, runway or airport; the PILOT STORED WPTs panel lists the
 * waypoints created by the flight crew and offers the new waypoint function (latitude/longitude, place/bearing/distance
 * or place-bearing/place-bearing).
 */
export class MfdFmsDataWaypoint extends FmsPage<MfdFmsDataWaypointProps> {
  private readonly selectedPageIndex = Subject.create<number>(WaypointPanel.Database);

  private readonly showReturnButton = Subject.create(false);

  // ---- DATABASE WPTs panel --------------------------------------------------------------------------------------------

  private readonly databaseIdent = Subject.create<string | null>(null);

  private readonly databaseLatLong = Subject.create('');

  private readonly databaseInfoVisibility = this.databaseLatLong.map((v) => (v ? 'visible' : 'hidden'));

  // ---- PILOT STORED WPTs panel ------------------------------------------------------------------------------------

  /** The stored waypoints in the order of their storage index */
  private storedWaypoints: PilotWaypoint[] = [];

  private readonly storedIdents = ArraySubject.create<string>([]);

  /** Index into storedWaypoints of the displayed waypoint */
  private readonly selectedStored = Subject.create<number | null>(null);

  private readonly storedNumberText = Subject.create('0/0');

  private readonly storedLatLong = Subject.create('');

  private readonly storedLatLongIsDefinition = Subject.create(true);

  private readonly storedPbdText = Subject.create('');

  private readonly storedPbxText = Subject.create('');

  private readonly storedPlace1 = Subject.create('');

  private readonly storedBearing1 = Subject.create('');

  private readonly storedDistance = Subject.create('');

  private readonly storedPlace2 = Subject.create('');

  private readonly storedBearing2 = Subject.create('');

  private readonly storedPbdVisible = this.storedPbdText.map((v) => v !== '');

  private readonly storedPbxVisible = this.storedPbxText.map((v) => v !== '');

  private readonly newWaypointMode = Subject.create(false);

  private readonly hasStoredWaypoints = Subject.create(false);

  private readonly listVisible = MappedSubject.create(
    ([hasStored, newMode]) => hasStored && !newMode,
    this.hasStoredWaypoints,
    this.newWaypointMode,
  );

  private readonly noStoredWaypointsVisible = MappedSubject.create(
    ([hasStored, newMode]) => !hasStored && !newMode,
    this.hasStoredWaypoints,
    this.newWaypointMode,
  );

  private readonly previousStoredDisabled = this.selectedStored.map((i) => i === null || i <= 0);

  private readonly nextStoredDisabled = this.selectedStored.map(
    (i) => i === null || i >= this.storedWaypoints.length - 1,
  );

  private readonly deleteOneDialogVisible = Subject.create(false);

  private readonly deleteAllDialogVisible = Subject.create(false);

  // ---- new waypoint function ----------------------------------------------------------------------------------------

  private readonly newIdent = Subject.create<string | null>(null);

  private readonly newLatitude = Subject.create<number | null>(null);

  private readonly newLongitude = Subject.create<number | null>(null);

  private readonly newPbdPlace = Subject.create<string | null>(null);

  private readonly newPbdBearing = Subject.create<number | null>(null);

  private readonly newPbdDistance = Subject.create<number | null>(null);

  private readonly newPbxPlace1 = Subject.create<string | null>(null);

  private readonly newPbxBearing1 = Subject.create<number | null>(null);

  private readonly newPbxPlace2 = Subject.create<string | null>(null);

  private readonly newPbxBearing2 = Subject.create<number | null>(null);

  /** The complete definition of the new waypoint, once one of the three entry ways is complete */
  private newDefinition:
    | { type: PilotWaypointType.LatLon; coordinates: Coordinates }
    | { type: PilotWaypointType.Pbd; place: Fix; bearing: number; distance: number }
    | { type: PilotWaypointType.Pbx; place1: Fix; bearing1: number; place2: Fix; bearing2: number }
    | null = null;

  private readonly storeDisabled = Subject.create(true);

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    // The new waypoint is worked out once an entered value is stored (a validation handler would still see the old value)
    for (const field of [
      this.newLatitude,
      this.newLongitude,
      this.newPbdPlace,
      this.newPbdBearing,
      this.newPbdDistance,
      this.newPbxPlace1,
      this.newPbxBearing1,
      this.newPbxPlace2,
      this.newPbxBearing2,
    ] as Subject<unknown>[]) {
      this.subs.push(field.sub(() => void this.onNewWaypointFieldModified()));
    }

    this.subs.push(
      this.databaseInfoVisibility,
      this.storedPbdVisible,
      this.storedPbxVisible,
      this.listVisible,
      this.noStoredWaypointsVisible,
      this.previousStoredDisabled,
      this.nextStoredDisabled,
      this.selectedStored.sub((i) => this.showStoredWaypoint(i)),
      this.props.mfd.uiService.activeUri.sub((uri) => this.handleUriExtra(uri.extra ?? ''), true),
    );

    this.refreshStoredWaypoints();
  }

  protected onNewData(): void {
    // The stored waypoints may have changed from another page (e.g. DATA / STATUS delete all)
    this.refreshStoredWaypoints();
  }

  private handleUriExtra(extra: string): void {
    const parts = extra.split('/');
    this.showReturnButton.set(parts.includes(showReturnButtonUriExtra));

    const newIndex = parts.indexOf(newWaypointUriExtra);
    if (newIndex >= 0) {
      this.openNewWaypointFunction(parts[newIndex + 1] ?? null);
    } else if (parts.includes('pilot-stored')) {
      this.selectedPageIndex.set(WaypointPanel.PilotStored);
    } else if (parts.includes('database')) {
      this.selectedPageIndex.set(WaypointPanel.Database);
    }
  }

  // ---- DATABASE WPTs ------------------------------------------------------------------------------------------------

  /**
   * FCOM: a pilot created waypoint opens the PILOT STORED WPTs panel with its data; an ident that is neither in the
   * navigation database nor pilot created opens the new waypoint function.
   */
  private async onDatabaseIdentEntered(ident: string | null): Promise<boolean> {
    this.databaseLatLong.set('');
    if (ident === null) {
      return true;
    }

    const fmc = this.props.fmcService.master;
    const stored = fmc.getStoredWaypointsByIdent(ident);
    if (stored.length > 0) {
      this.selectStoredWaypoint(stored[0]);
      this.selectedPageIndex.set(WaypointPanel.PilotStored);
      return true;
    }

    try {
      const fix = await WaypointEntryUtils.parsePlace(fmc, ident);
      this.databaseLatLong.set(coordinateToString(fix.location, false));
      return true;
    } catch (e) {
      if (e instanceof FmsError && e.type === FmsErrorType.NotInDatabase) {
        this.openNewWaypointFunction(ident);
        return true;
      }
      throw e;
    }
  }

  // ---- PILOT STORED WPTs ------------------------------------------------------------------------------------------

  private refreshStoredWaypoints(): void {
    const dataManager = this.props.fmcService.master.getDataManager();
    const previouslySelected =
      this.selectedStored.get() !== null ? this.storedWaypoints[this.selectedStored.get()!] : undefined;

    const waypoints: PilotWaypoint[] = [];
    if (dataManager) {
      for (let i = 0; i < 99; i++) {
        const wp = dataManager.getStoredWaypoint(i);
        if (wp) {
          waypoints.push(wp);
        }
      }
    }
    this.storedWaypoints = waypoints;
    this.storedIdents.set(waypoints.map((wp) => wp.waypoint.ident));
    this.hasStoredWaypoints.set(waypoints.length > 0);

    if (waypoints.length === 0) {
      this.selectedStored.set(null);
      this.showStoredWaypoint(null);
      return;
    }
    const keptIndex = previouslySelected
      ? waypoints.findIndex((wp) => wp.waypoint.databaseId === previouslySelected.waypoint.databaseId)
      : -1;
    const newIndex = keptIndex >= 0 ? keptIndex : 0;
    if (this.selectedStored.get() === newIndex) {
      this.showStoredWaypoint(newIndex);
    } else {
      this.selectedStored.set(newIndex);
    }
  }

  private selectStoredWaypoint(waypoint: PilotWaypoint): void {
    const index = this.storedWaypoints.findIndex((wp) => wp.waypoint.databaseId === waypoint.waypoint.databaseId);
    if (index >= 0) {
      this.newWaypointMode.set(false);
      this.selectedStored.set(index);
    }
  }

  private showStoredWaypoint(index: number | null): void {
    const wp = index !== null ? this.storedWaypoints[index] : undefined;
    if (!wp) {
      this.storedNumberText.set('0/0');
      this.storedLatLong.set('');
      this.storedPbdText.set('');
      this.storedPbxText.set('');
      return;
    }

    this.storedNumberText.set(`${(index! + 1).toFixed(0)}/${this.storedWaypoints.length.toFixed(0)}`);
    this.storedLatLong.set(coordinateToString(wp.waypoint.location, false));
    this.storedLatLongIsDefinition.set(wp.type === PilotWaypointType.LatLon);
    this.storedPbdText.set(
      wp.type === PilotWaypointType.Pbd
        ? `${wp.pbdPlace.ident}/${formatBearing(wp.pbdBearing)}/${wp.pbdDistance.toFixed(1)}NM`
        : '',
    );
    this.storedPbxText.set(
      wp.type === PilotWaypointType.Pbx
        ? `${wp.pbxPlace1.ident}-${formatBearing(wp.pbxBearing1)}/${wp.pbxPlace2.ident}-${formatBearing(wp.pbxBearing2)}`
        : '',
    );
    if (wp.type === PilotWaypointType.Pbd) {
      this.storedPlace1.set(wp.pbdPlace.ident);
      this.storedBearing1.set(formatBearingValue(wp.pbdBearing));
      this.storedDistance.set(wp.pbdDistance.toFixed(Number.isInteger(wp.pbdDistance) ? 0 : 1));
    } else if (wp.type === PilotWaypointType.Pbx) {
      this.storedPlace1.set(wp.pbxPlace1.ident);
      this.storedBearing1.set(formatBearingValue(wp.pbxBearing1));
      this.storedPlace2.set(wp.pbxPlace2.ident);
      this.storedBearing2.set(formatBearingValue(wp.pbxBearing2));
    }
  }

  private scrollStoredWaypoint(delta: number): void {
    const current = this.selectedStored.get();
    if (current === null) {
      return;
    }
    const next = current + delta;
    if (next >= 0 && next < this.storedWaypoints.length) {
      this.selectedStored.set(next);
    }
  }

  /** FCOM: a pilot stored waypoint still used by the FMS is not deleted, F-PLN ELEMENT RETAINED is displayed. */
  private async deleteSelectedStoredWaypoint(): Promise<void> {
    this.deleteOneDialogVisible.set(false);
    const index = this.selectedStored.get();
    const wp = index !== null ? this.storedWaypoints[index] : undefined;
    const dataManager = this.props.fmcService.master.getDataManager();
    if (!wp || !dataManager) {
      return;
    }

    const deleted = await dataManager.deleteStoredWaypoint(wp.storedIndex);
    if (!deleted) {
      this.props.fmcService.master.addMessageToQueue(NXSystemMessages.fplnElementRetained, undefined, undefined);
    }
    this.refreshStoredWaypoints();
  }

  private async deleteAllStoredWaypoints(): Promise<void> {
    this.deleteAllDialogVisible.set(false);
    const dataManager = this.props.fmcService.master.getDataManager();
    if (!dataManager) {
      return;
    }

    const allDeleted = await dataManager.deleteAllStoredWaypoints();
    if (!allDeleted) {
      this.props.fmcService.master.addMessageToQueue(NXSystemMessages.fplnElementRetained, undefined, undefined);
    }
    this.refreshStoredWaypoints();
  }

  // ---- new waypoint function ----------------------------------------------------------------------------------------

  private openNewWaypointFunction(ident: string | null): void {
    this.clearNewWaypoint();
    this.newIdent.set(ident);
    this.newWaypointMode.set(true);
    this.selectedPageIndex.set(WaypointPanel.PilotStored);
  }

  private clearNewWaypoint(): void {
    this.newIdent.set(null);
    this.newLatitude.set(null);
    this.newLongitude.set(null);
    this.newPbdPlace.set(null);
    this.newPbdBearing.set(null);
    this.newPbdDistance.set(null);
    this.newPbxPlace1.set(null);
    this.newPbxBearing1.set(null);
    this.newPbxPlace2.set(null);
    this.newPbxBearing2.set(null);
    this.newDefinition = null;
    this.storeDisabled.set(true);
  }

  private cancelNewWaypoint(): void {
    this.clearNewWaypoint();
    this.newWaypointMode.set(false);
  }

  /**
   * Works out the waypoint from whichever of the three entry ways is complete (FCOM: latitude/longitude,
   * place/bearing/distance or place-bearing/place-bearing) and shows its position.
   */
  private async updateNewWaypointDefinition(): Promise<void> {
    const fmc = this.props.fmcService.master;
    const dataManager = fmc.getDataManager();
    this.newDefinition = null;
    this.storeDisabled.set(true);
    if (!dataManager) {
      return;
    }

    const lat = this.newLatitude.get();
    const long = this.newLongitude.get();
    const pbdPlace = this.newPbdPlace.get();
    const pbdBearing = this.newPbdBearing.get();
    const pbdDistance = this.newPbdDistance.get();
    const pbxPlace1 = this.newPbxPlace1.get();
    const pbxBearing1 = this.newPbxBearing1.get();
    const pbxPlace2 = this.newPbxPlace2.get();
    const pbxBearing2 = this.newPbxBearing2.get();

    if (lat !== null && long !== null) {
      this.newDefinition = { type: PilotWaypointType.LatLon, coordinates: { lat, long } };
    } else if (pbdPlace !== null && pbdBearing !== null && pbdDistance !== null) {
      const place = await WaypointEntryUtils.parsePlace(fmc, pbdPlace);
      this.newDefinition = { type: PilotWaypointType.Pbd, place, bearing: pbdBearing, distance: pbdDistance };
    } else if (pbxPlace1 !== null && pbxBearing1 !== null && pbxPlace2 !== null && pbxBearing2 !== null) {
      const place1 = await WaypointEntryUtils.parsePlace(fmc, pbxPlace1);
      const place2 = await WaypointEntryUtils.parsePlace(fmc, pbxPlace2);
      this.newDefinition = {
        type: PilotWaypointType.Pbx,
        place1,
        bearing1: pbxBearing1,
        place2,
        bearing2: pbxBearing2,
      };
    }

    if (this.newDefinition === null) {
      return;
    }

    // A non-stored waypoint gives the position of the definition without touching the database
    const preview = this.createWaypoint(false);
    if (preview) {
      this.storeDisabled.set(false);
    }
  }

  private createWaypoint(stored: boolean): PilotWaypoint | null {
    const fmc = this.props.fmcService.master;
    const ident = this.newIdent.get() ?? undefined;
    const definition = this.newDefinition;
    switch (definition?.type) {
      case PilotWaypointType.LatLon:
        return fmc.createLatLonWaypoint(definition.coordinates, stored, ident);
      case PilotWaypointType.Pbd:
        return fmc.createPlaceBearingDistWaypoint(
          definition.place,
          definition.bearing,
          definition.distance,
          stored,
          ident,
        );
      case PilotWaypointType.Pbx:
        return fmc.createPlaceBearingPlaceBearingWaypoint(
          definition.place1,
          definition.bearing1,
          definition.place2,
          definition.bearing2,
          stored,
          ident,
        );
      default:
        return null;
    }
  }

  /** FCOM STORE WPT: stores the new waypoint in the pilot stored elements database. */
  private storeNewWaypoint(): void {
    if (this.storeDisabled.get()) {
      return;
    }
    try {
      const stored = this.createWaypoint(true);
      this.newWaypointMode.set(false);
      this.clearNewWaypoint();
      this.refreshStoredWaypoints();
      if (stored) {
        this.selectStoredWaypoint(stored);
      }
    } catch (e) {
      if (e instanceof FmsError) {
        this.props.fmcService.master.showFmsErrorMessage(e.type);
      } else {
        throw e;
      }
    }
  }

  private async onNewWaypointFieldModified(): Promise<boolean> {
    try {
      await this.updateNewWaypointDefinition();
      return true;
    } catch (e) {
      if (e instanceof FmsError) {
        this.props.fmcService.master.showFmsErrorMessage(e.type);
        return false;
      }
      throw e;
    }
  }

  // ---- render ---------------------------------------------------------------------------------------------------------
  // Positions from the FCOM figures (DSC-22-FMS-20-30 P 107, P 109-116), in page container coordinates (display y - 143)

  private renderPlaceField(y: number, x: number, value: Subject<string | null>, width: number): VNode {
    return fcomAt(
      y,
      x,
      <InputField<string>
        dataEntryFormat={new WaypointFormat()}
        value={value}
        containerStyle={`width: ${width}px;`}
        alignText="flex-start"
        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
        hEventConsumer={this.props.mfd.hEventConsumer}
        interactionMode={this.props.mfd.interactionMode}
      />,
    );
  }

  private renderBearingField(y: number, x: number, value: Subject<number | null>): VNode {
    return fcomAt(
      y,
      x,
      <InputField<number>
        dataEntryFormat={new BearingFormat()}
        value={value}
        containerStyle="width: 99px;"
        alignText="flex-start"
        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
        hEventConsumer={this.props.mfd.hEventConsumer}
        interactionMode={this.props.mfd.interactionMode}
      />,
    );
  }

  private static label(y: number, x: number, text: string): VNode {
    return fcomCentre(y, x, <span class="mfd-label">{text}</span>);
  }

  private static value(y: number, x: number, text: string | Subscribable<string>): VNode {
    return fcomCentre(y, x, <span class="mfd-value bigger">{text}</span>);
  }

  /** A value followed by its unit, whose right edge is at x */
  private static valueWithUnit(y: number, x: number, text: Subscribable<string>, unit: string): VNode {
    return fcomRight(
      y,
      x,
      <>
        <span class="mfd-value bigger">{text}</span>
        <span class="mfd-label-unit mfd-unit-trailing">{unit}</span>
      </>,
    );
  }

  /** DATABASE WPTs panel (P 107) */
  private renderDatabasePanel(): VNode {
    return (
      <>
        {fcomRight(113, 299, <span class="mfd-label">WPT IDENT</span>)}
        {fcomAt(
          113,
          307,
          <InputField<string>
            dataEntryFormat={new WaypointFormat()}
            value={this.databaseIdent}
            dataHandlerDuringValidation={(v) => this.onDatabaseIdentEntered(v)}
            mandatory={Subject.create(true)}
            canBeCleared={Subject.create(false)}
            containerStyle="width: 148px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        <div style={{ visibility: this.databaseInfoVisibility }}>
          {MfdFmsDataWaypoint.label(231, 280, 'LAT')}
          {MfdFmsDataWaypoint.label(231, 469, 'LONG')}
          {MfdFmsDataWaypoint.value(272, 377, this.databaseLatLong)}
        </div>
      </>
    );
  }

  /** PILOT STORED WPTs panel with stored waypoints (P 109, P 112-114) */
  private renderStoredWaypointList(): VNode {
    const label = MfdFmsDataWaypoint.label;
    const value = MfdFmsDataWaypoint.value;
    const whenPbd = { display: this.storedPbdVisible.map((v) => (v ? 'block' : 'none')) };
    const whenPbx = { display: this.storedPbxVisible.map((v) => (v ? 'block' : 'none')) };
    return (
      <>
        {fcomRight(122, 299, <span class="mfd-label">WPT IDENT</span>)}
        {fcomAt(
          122,
          306,
          <DropdownMenu
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataWaypointStoredDropdown`}
            selectedIndex={this.selectedStored}
            values={this.storedIdents}
            freeTextAllowed={false}
            containerStyle="width: 179px;"
            alignLabels="flex-start"
            numberOfDigitsForInputField={7}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomAt(
          121,
          504,
          <div class="fr" style="gap: 9px;">
            <IconButton
              icon="double-left"
              disabled={this.previousStoredDisabled}
              onClick={() => this.scrollStoredWaypoint(-1)}
              containerStyle="width: 61px; height: 55px;"
            />
            <IconButton
              icon="double-right"
              disabled={this.nextStoredDisabled}
              onClick={() => this.scrollStoredWaypoint(1)}
              containerStyle="width: 61px; height: 55px;"
            />
          </div>,
        )}
        {fcomCentre(178, 576, <span class="mfd-label">{this.storedNumberText}</span>)}

        {/* LAT / LONG */}
        {label(239, 280, 'LAT')}
        {label(239, 469, 'LONG')}
        {fcomCentre(
          280,
          377,
          <span class={this.storedLatLongIsDefinition.map((v) => (v ? 'mfd-value bigger' : 'mfd-value'))}>
            {this.storedLatLong}
          </span>,
        )}

        {/* PLACE / BRG / DIST (P 113) */}
        <div style={whenPbd}>
          {label(373, 219, 'PLACE')}
          {label(373, 368, 'BRG')}
          {label(373, 548, 'DIST')}
          {value(414, 219, this.storedPlace1)}
          {value(414, 308, '/')}
          {MfdFmsDataWaypoint.valueWithUnit(414, 438, this.storedBearing1, '°')}
          {value(414, 456, '/')}
          {MfdFmsDataWaypoint.valueWithUnit(414, 624, this.storedDistance, 'NM')}
        </div>

        {/* PLACE - BRG / PLACE - BRG (P 109, P 114) */}
        <div style={whenPbx}>
          {label(372, 148, 'PLACE')}
          {label(372, 304, 'BRG')}
          {label(372, 471, 'PLACE')}
          {label(372, 630, 'BRG')}
          {value(414, 143, this.storedPlace1)}
          {value(414, 236, '-')}
          {MfdFmsDataWaypoint.valueWithUnit(414, 360, this.storedBearing1, '°')}
          {value(414, 380, '/')}
          {value(414, 471, this.storedPlace2)}
          {value(414, 560, '-')}
          {MfdFmsDataWaypoint.valueWithUnit(414, 689, this.storedBearing2, '°')}
        </div>

        {fcomAt(
          726,
          18,
          <Button
            label={
              <span class="fr aic">
                <span style="white-space: pre; text-align: center;">{'DELETE\nSTORED WPT'}</span>
                <span style="margin-left: 16px;">*</span>
              </span>
            }
            onClick={() => this.deleteOneDialogVisible.set(true)}
            buttonStyle="width: 179px; height: 40px;"
          />,
        )}
        {fcomAt(
          726,
          234,
          <Button
            label={
              <span class="fr aic">
                <span style="white-space: pre; text-align: center;">{'DELETE ALL\nSTORED WPTs'}</span>
                <span style="margin-left: 16px;">*</span>
              </span>
            }
            onClick={() => this.deleteAllDialogVisible.set(true)}
            buttonStyle="width: 181px; height: 40px;"
          />,
        )}
        {fcomAt(
          726,
          578,
          <Button
            label="NEW WPT"
            onClick={() => this.openNewWaypointFunction(null)}
            buttonStyle="width: 142px; height: 40px;"
          />,
        )}
      </>
    );
  }

  /** PILOT STORED WPTs panel without stored waypoint (P 110) */
  private renderNoStoredPanel(): VNode {
    return (
      <>
        {fcomCentre(123, 380, <span class="mfd-label">NO PILOT STORED WPT</span>)}
        {fcomAt(
          727,
          578,
          <Button
            label="NEW WPT"
            onClick={() => this.openNewWaypointFunction(null)}
            buttonStyle="width: 142px; height: 40px;"
          />,
        )}
      </>
    );
  }

  /** NEW WAYPOINT FUNCTION (P 116) */
  private renderNewWaypointFunction(): VNode {
    const label = MfdFmsDataWaypoint.label;
    return (
      <>
        {fcomRight(123, 287, <span class="mfd-label">WPT IDENT</span>)}
        {fcomAt(
          123,
          307,
          <InputField<string>
            dataEntryFormat={new WaypointFormat()}
            value={this.newIdent}
            mandatory={Subject.create(true)}
            containerStyle="width: 148px;"
            alignText="flex-start"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}

        {/* LAT / LONG */}
        {label(240, 280, 'LAT')}
        {label(240, 469, 'LONG')}
        {fcomAt(
          280,
          207,
          <InputField<number>
            dataEntryFormat={new NewWaypointLatitudeFormat()}
            value={this.newLatitude}
            containerStyle="width: 141px;"
            alignText="flex-start"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {label(280, 370, '/')}
        {fcomAt(
          280,
          386,
          <InputField<number>
            dataEntryFormat={new NewWaypointLongitudeFormat()}
            value={this.newLongitude}
            containerStyle="width: 160px;"
            alignText="flex-start"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}

        {/* PLACE / BRG / DIST */}
        {label(373, 217, 'PLACE')}
        {label(373, 378, 'BRG')}
        {label(373, 546, 'DIST')}
        {this.renderPlaceField(416, 145, this.newPbdPlace, 142)}
        {label(416, 308, '/')}
        {this.renderBearingField(416, 327, this.newPbdBearing)}
        {label(416, 452, '/')}
        {fcomAt(
          416,
          472,
          <InputField<number>
            dataEntryFormat={new DistanceFormat()}
            value={this.newPbdDistance}
            containerStyle="width: 145px;"
            alignText="flex-start"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}

        {/* PLACE - BRG / PLACE - BRG */}
        {label(518, 142, 'PLACE')}
        {label(518, 304, 'BRG')}
        {label(518, 470, 'PLACE')}
        {label(518, 632, 'BRG')}
        {this.renderPlaceField(560, 70, this.newPbxPlace1, 141)}
        {label(560, 234, '-')}
        {this.renderBearingField(560, 253, this.newPbxBearing1)}
        {label(560, 376, '/')}
        {this.renderPlaceField(560, 398, this.newPbxPlace2, 141)}
        {label(560, 562, '-')}
        {this.renderBearingField(560, 581, this.newPbxBearing2)}

        {fcomAt(
          736,
          14,
          <Button label="CANCEL" onClick={() => this.cancelNewWaypoint()} buttonStyle="width: 101px;" />,
        )}
        {fcomAt(
          728,
          578,
          <Button
            label={
              <span class="fr aic">
                <span style="white-space: pre; text-align: center;">{'STORE\nWPT'}</span>
                <span style="margin-left: 28px;">*</span>
              </span>
            }
            disabled={this.storeDisabled}
            onClick={() => this.storeNewWaypoint()}
            buttonStyle="width: 142px; height: 40px;"
          />,
        )}
      </>
    );
  }

  render(): VNode {
    const visibleWhen = (visible: Subscribable<boolean>) => ({
      display: visible.map((v) => (v ? 'block' : 'none')),
    });
    const onPanel = (panel: WaypointPanel) => this.selectedPageIndex.map((i) => i === panel);
    const storedPanel = onPanel(WaypointPanel.PilotStored);
    const storedList = MappedSubject.create(([p, v]) => p && v, storedPanel, this.listVisible);
    const storedNone = MappedSubject.create(([p, v]) => p && v, storedPanel, this.noStoredWaypointsVisible);
    const storedNew = MappedSubject.create(([p, v]) => p && v, storedPanel, this.newWaypointMode);
    this.subs.push(storedPanel, storedList, storedNone, storedNew);

    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="mfd-page-container" style="position: relative;">
          {/* Tab panels from y = 150 to 910 (P 110); their content is drawn in the overlays below */}
          <TopTabNavigator
            pageTitles={Subject.create(['DATABASE WPTs', 'PILOT STORED WPTs'])}
            selectedPageIndex={this.selectedPageIndex}
            pageChangeCallback={(val) => this.selectedPageIndex.set(val)}
            selectedTabTextColor="white"
            {...fcomTabBar}
          >
            <TopTabNavigatorPage containerStyle="flex: 0 0 auto; box-sizing: border-box; height: 722px;" />
            <TopTabNavigatorPage containerStyle="flex: 0 0 auto; box-sizing: border-box; height: 722px;" />
          </TopTabNavigator>
          <div class="mfd-fcom-overlay" style={visibleWhen(onPanel(WaypointPanel.Database))}>
            {this.renderDatabasePanel()}
          </div>
          <div class="mfd-fcom-overlay" style={visibleWhen(storedList)}>
            {this.renderStoredWaypointList()}
          </div>
          <div class="mfd-fcom-overlay" style={visibleWhen(storedNone)}>
            {this.renderNoStoredPanel()}
          </div>
          <div class="mfd-fcom-overlay" style={visibleWhen(storedNew)}>
            {this.renderNewWaypointFunction()}
          </div>
          {/* RETURN below the panels (not displayed when the page was called from the menu bar) */}
          <div class="mfd-fcom-overlay" style={visibleWhen(this.showReturnButton)}>
            {fcomAt(
              793,
              5,
              <Button
                label="RETURN"
                onClick={() => this.props.mfd.uiService.navigateTo('back')}
                buttonStyle="width: 101px;"
              />,
            )}
          </div>
          <div class="mfd-data-waypoint-dialogs">
            <ConfirmationDialog
              visible={this.deleteOneDialogVisible}
              cancelAction={() => this.deleteOneDialogVisible.set(false)}
              confirmAction={() => this.deleteSelectedStoredWaypoint()}
              contentContainerStyle="width: 390px; height: 165px; transform: translateX(-50%);"
            >
              DELETE STORED WPT ?
            </ConfirmationDialog>
            <ConfirmationDialog
              visible={this.deleteAllDialogVisible}
              cancelAction={() => this.deleteAllDialogVisible.set(false)}
              confirmAction={() => this.deleteAllStoredWaypoints()}
              contentContainerStyle="width: 480px; height: 165px; transform: translateX(-50%);"
            >
              DELETE ALL STORED WPTs ?
            </ConfirmationDialog>
          </div>
        </div>
        <Footer
          bus={this.props.bus}
          mfd={this.props.mfd}
          fmcService={this.props.fmcService}
          flightPlanInterface={this.props.fmcService.master.flightPlanInterface}
        />
      </>
    );
  }
}

function formatBearing(bearing: number): string {
  return `${(Math.round(bearing) % 360).toFixed(0).padStart(3, '0')}°`;
}

function formatBearingValue(bearing: number): string {
  return (Math.round(bearing) % 360).toFixed(0).padStart(3, '0');
}
