// Copyright (c) 2024-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0
import { ArraySubject, FSComponent, MappedSubject, Subject, Subscribable, UnitType, VNode } from '@microsoft/msfs-sdk';
import { coordinateToString } from '@flybywiresim/fbw-sdk';
import { loadAirport, loadAllRunways } from '@fmgc/flightplanning/DataLoading';
import { FmsErrorType } from '@fmgc/FmsError';

import { AbstractMfdPageProps } from '../../../MFD';
import { Footer } from '../../common/Footer';
import { FmsPage } from '../../common/FmsPage';
import { TopTabNavigator, TopTabNavigatorPage } from '../../../../MsfsAvionicsCommon/UiWidgets/TopTabNavigator';
import { Button } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { DropdownMenu } from '../../../../MsfsAvionicsCommon/UiWidgets/DropdownMenu';
import { IconButton } from '../../../../MsfsAvionicsCommon/UiWidgets/IconButton';
import { ConfirmationDialog } from '../../../../MsfsAvionicsCommon/UiWidgets/ConfirmationDialog';
import {
  AirportFormat,
  BearingFormat,
  DataEntryFormat,
  ElevationFormat,
  LatitudeDmsFormat,
  LengthFormat,
  LongitudeDmsFormat,
  NavaidIdentFormat,
  RunwayDesignatorFormat,
} from '../../common/DataEntryFormats';
import { fcomAt, fcomCentre, fcomRight, fcomTabBar } from '../../common/FcomLayout';
import { PilotStoredRunway } from '../../../FMC/PilotStoredElements';
import { showReturnButtonUriExtra } from '../../../shared/utils';

import './MfdFmsDataAirport.scss';

interface MfdFmsDataAirportProps extends AbstractMfdPageProps {}

enum AirportPanel {
  Database,
  PilotStored,
}

/** The data lines of a runway (FCOM DSC-22-FMS-20-30 P 53 and P 55) */
class RunwayDataDisplay {
  readonly ident = Subject.create('');

  readonly coordinates = Subject.create('');

  readonly elevation = Subject.create('');

  readonly length = Subject.create('');

  readonly course = Subject.create('');

  readonly courseTrue = Subject.create('');

  readonly lsIdent = Subject.create('');

  set(
    ident: string,
    lat: number,
    long: number,
    elevationFeet: number,
    lengthFeet: number,
    course: number,
    courseTrue: boolean,
    lsIdent: string | undefined,
  ): void {
    this.ident.set(ident);
    this.coordinates.set(coordinateToString(lat, long, false));
    // FCOM figures: the elevation is displayed with one decimal (490.0FT)
    this.elevation.set(elevationFeet.toFixed(1));
    this.length.set(lengthFeet.toFixed(0));
    this.course.set((Math.round(course) % 360).toFixed(0).padStart(3, '0'));
    // FCOM P 54: the letter T indicates that the course is defined in the TRUE north reference
    this.courseTrue.set(courseTrue ? 'T' : '');
    this.lsIdent.set(lsIdent ?? '');
  }
}

/** A runway of the navigation database airport, for the runway list and the runway data */
interface DatabaseRunway {
  readonly ident: string;
  readonly lat: number;
  readonly long: number;
  readonly elevationFeet: number;
  readonly lengthFeet: number;
  readonly course: number;
  readonly courseTrue: boolean;
  readonly lsIdent?: string;
}

/** FCOM P 59: the new runway function shows the latitude as ----.-- and the longitude as -----.-- */
class NewRunwayLatitudeFormat extends LatitudeDmsFormat {
  public readonly placeholder = '----.--';
}

class NewRunwayLongitudeFormat extends LongitudeDmsFormat {
  public readonly placeholder = '-----.--';
}

/**
 * DATA / AIRPORT page (A380 FCOM DSC-22-FMS-20-30 P 47-61): navigation database airports and runways, and the pilot
 * stored runways (display, deletion and new runway function). Positions from the FCOM figures (P 52, P 53, P 55,
 * P 56, P 59) in page container coordinates (display y - 143).
 */
export class MfdFmsDataAirport extends FmsPage<MfdFmsDataAirportProps> {
  /** The runway list of a database airport shows 8 runway buttons per column (P 52) */
  private static readonly runwaysPerColumn = 8;

  private readonly pilotStoredElements = this.props.fmcService.master.pilotStoredElements;

  private readonly selectedPageIndex = Subject.create<number>(AirportPanel.Database);

  private readonly showReturnButton = Subject.create(false);

  // ---- DATABASE ARPTs ---------------------------------------------------------------------------------------------

  private readonly databaseIdent = Subject.create<string | null>(null);

  private readonly airportName = Subject.create('');

  private readonly airportCoordinates = Subject.create('');

  private readonly databaseRunways = Subject.create<readonly DatabaseRunway[]>([]);

  private readonly runwayListRef = FSComponent.createRef<HTMLDivElement>();

  /** Index of the displayed database runway, null while the runway list is displayed */
  private readonly selectedDatabaseRunway = Subject.create<number | null>(null);

  private readonly databaseRunwayData = new RunwayDataDisplay();

  private readonly databaseRunwayNumber = Subject.create('');

  private readonly runwayListVisible = MappedSubject.create(
    ([runways, selected]) => runways.length > 0 && selected === null,
    this.databaseRunways,
    this.selectedDatabaseRunway,
  );

  private readonly databaseRunwayVisible = this.selectedDatabaseRunway.map((i) => i !== null);

  private readonly previousDatabaseRunwayDisabled = this.selectedDatabaseRunway.map((i) => i === null || i <= 0);

  private readonly nextDatabaseRunwayDisabled = MappedSubject.create(
    ([i, runways]) => i === null || i >= runways.length - 1,
    this.selectedDatabaseRunway,
    this.databaseRunways,
  );

  // ---- PILOT STORED RWYs ------------------------------------------------------------------------------------------

  /** The pilot stored airports (idents of the airports of the stored runways) */
  private readonly storedAirports = ArraySubject.create<string>([]);

  private readonly selectedStoredAirport = Subject.create<number | null>(null);

  /** Index of the displayed pilot stored runway, in the whole pilot stored runways database */
  private readonly selectedStoredRunway = Subject.create<number | null>(null);

  private readonly storedRunwayNumber = Subject.create('');

  private readonly storedRunwayData = new RunwayDataDisplay();

  private readonly hasStoredRunways = Subject.create(false);

  private readonly newRunwayMode = Subject.create(false);

  private readonly storedVisible = MappedSubject.create(
    ([has, isNew]) => has && !isNew,
    this.hasStoredRunways,
    this.newRunwayMode,
  );

  private readonly noStoredVisible = MappedSubject.create(
    ([has, isNew]) => !has && !isNew,
    this.hasStoredRunways,
    this.newRunwayMode,
  );

  private readonly previousStoredDisabled = this.selectedStoredRunway.map((i) => i === null || i <= 0);

  private readonly nextStoredDisabled = MappedSubject.create(
    ([i, runways]) => i === null || i >= runways.length - 1,
    this.selectedStoredRunway,
    this.pilotStoredElements.runways,
  );

  private readonly deleteOneDialogVisible = Subject.create(false);

  private readonly deleteAllDialogVisible = Subject.create(false);

  // ---- new runway function ----------------------------------------------------------------------------------------

  private readonly newAirportIdent = Subject.create<string | null>(null);

  private readonly newRunwayIdent = Subject.create<string | null>(null);

  private readonly newLatitude = Subject.create<number | null>(null);

  private readonly newLongitude = Subject.create<number | null>(null);

  private readonly newElevation = Subject.create<number | null>(null);

  /** Metres (LengthFormat) */
  private readonly newLength = Subject.create<number | null>(null);

  private readonly newCourse = Subject.create<number | null>(null);

  private readonly newLsIdent = Subject.create<string | null>(null);

  /** FCOM P 60: all data (except the landing system) is needed to define a new runway */
  private readonly storeDisabled = MappedSubject.create(
    (values) => values.some((v) => v === null),
    this.newAirportIdent,
    this.newRunwayIdent,
    this.newLatitude,
    this.newLongitude,
    this.newElevation,
    this.newLength,
    this.newCourse,
  );

  private readonly lengthFormat = new LengthFormat(
    Subject.create(0),
    Subject.create(Number.POSITIVE_INFINITY),
    Subject.create(UnitType.FOOT),
    5,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.runwayListVisible,
      this.databaseRunwayVisible,
      this.previousDatabaseRunwayDisabled,
      this.nextDatabaseRunwayDisabled,
      this.storedVisible,
      this.noStoredVisible,
      this.previousStoredDisabled,
      this.nextStoredDisabled,
      this.storeDisabled,
      this.selectedDatabaseRunway.sub((i) => this.showDatabaseRunway(i), true),
      this.databaseRunways.sub(() => this.renderRunwayList(), true),
      this.pilotStoredElements.runways.sub(() => this.refreshStoredRunways(), true),
      this.selectedStoredRunway.sub((i) => this.showStoredRunway(i), true),
      this.props.mfd.uiService.activeUri.sub((uri) => this.handleUriExtra(uri.extra ?? ''), true),
    );
  }

  public destroy(): void {
    this.lengthFormat.destroy();
    super.destroy();
  }

  protected onNewData(): void {
    // The page has no flight plan data
  }

  private handleUriExtra(extra: string): void {
    const parts = extra.split('/');
    // FCOM P 54: RETURN displays the page that was displayed before (the menu bar entry has no previous page)
    const arptIndex = parts.indexOf('arpt');
    this.showReturnButton.set(parts.includes(showReturnButtonUriExtra) || arptIndex >= 0);
    if (arptIndex >= 0 && parts[arptIndex + 1]) {
      // DATA AIRPORT from the ARPT menu of the ALTERNATE or CLOSEST AIRPORTS page (P 50)
      this.onDatabaseIdentEntered(parts[arptIndex + 1]);
    } else if (parts.includes('pilot-stored')) {
      this.selectedPageIndex.set(AirportPanel.PilotStored);
    }
  }

  // ---- DATABASE ARPTs ---------------------------------------------------------------------------------------------

  /**
   * FCOM P 52: an airport created by the flight crew opens the PILOT STORED RWYs panel with its runways; an airport that
   * is neither in the navigation database nor pilot created opens the new runway function.
   */
  private async onDatabaseIdentEntered(ident: string | null): Promise<void> {
    this.databaseIdent.set(ident);
    this.airportName.set('');
    this.airportCoordinates.set('');
    this.selectedDatabaseRunway.set(null);
    this.databaseRunways.set([]);
    if (ident === null) {
      return;
    }

    const airport = await loadAirport(ident).catch(() => null);
    if (!airport) {
      const storedIndex = this.pilotStoredElements.runways.get().findIndex((r) => r.airportIdent === ident);
      if (storedIndex >= 0) {
        this.newRunwayMode.set(false);
        this.selectedStoredRunway.set(storedIndex);
      } else {
        this.openNewRunwayFunction(ident);
      }
      this.selectedPageIndex.set(AirportPanel.PilotStored);
      return;
    }

    this.airportName.set((airport.name ?? '').toUpperCase());
    this.airportCoordinates.set(coordinateToString(airport.location.lat, airport.location.long, false));
    const runways = await loadAllRunways(airport);
    this.databaseRunways.set(
      runways.map((runway) => ({
        ident: runway.ident.substring(4),
        lat: runway.thresholdLocation.lat,
        long: runway.thresholdLocation.long,
        elevationFeet: runway.thresholdLocation.alt,
        lengthFeet: UnitType.FOOT.convertFrom(runway.length, UnitType.METER),
        course: runway.magneticBearing,
        courseTrue: runway.magVar === null,
        lsIdent: runway.lsIdent,
      })),
    );
  }

  /** The runway buttons of the runway list: ident, length and LS when a landing system exists (P 52) */
  private renderRunwayList(): void {
    const list = this.runwayListRef.getOrDefault();
    if (!list) {
      return;
    }
    list.innerHTML = '';
    this.databaseRunways.get().forEach((runway, index) => {
      const column = Math.floor(index / MfdFmsDataAirport.runwaysPerColumn);
      const row = index % MfdFmsDataAirport.runwaysPerColumn;
      const label = `${runway.ident.padEnd(3, '\xa0')} ${runway.lengthFeet.toFixed(0)}FT${runway.lsIdent ? ' LS' : ''}`;
      FSComponent.render(
        fcomAt(
          300 + row * 50,
          30 + column * 240,
          <Button
            label={label}
            onClick={() => this.selectedDatabaseRunway.set(index)}
            buttonStyle="min-width: 229px; white-space: nowrap;"
          />,
        ),
        list,
      );
    });
  }

  private showDatabaseRunway(index: number | null): void {
    const runways = this.databaseRunways.get();
    const runway = index !== null ? runways[index] : undefined;
    if (!runway) {
      return;
    }
    this.databaseRunwayNumber.set(`${(index! + 1).toFixed(0)}/${runways.length.toFixed(0)}`);
    this.databaseRunwayData.set(
      runway.ident,
      runway.lat,
      runway.long,
      runway.elevationFeet,
      runway.lengthFeet,
      runway.course,
      runway.courseTrue,
      runway.lsIdent,
    );
  }

  private scrollDatabaseRunway(delta: number): void {
    const current = this.selectedDatabaseRunway.get();
    const next = current !== null ? current + delta : null;
    if (next !== null && next >= 0 && next < this.databaseRunways.get().length) {
      this.selectedDatabaseRunway.set(next);
    }
  }

  // ---- PILOT STORED RWYs ------------------------------------------------------------------------------------------

  private refreshStoredRunways(): void {
    const runways = this.pilotStoredElements.runways.get();
    this.storedAirports.set([...new Set(runways.map((r) => r.airportIdent))]);
    this.hasStoredRunways.set(runways.length > 0);

    const current = this.selectedStoredRunway.get();
    const newIndex = runways.length === 0 ? null : Math.min(current ?? 0, runways.length - 1);
    if (current === newIndex) {
      this.showStoredRunway(newIndex);
    } else {
      this.selectedStoredRunway.set(newIndex);
    }
  }

  private showStoredRunway(index: number | null): void {
    const runways = this.pilotStoredElements.runways.get();
    const runway = index !== null ? runways[index] : undefined;
    if (!runway) {
      this.storedRunwayNumber.set('');
      this.selectedStoredAirport.set(null);
      return;
    }
    // FCOM P 56: the ranking of the displayed runway and the total number of pilot stored runways
    this.storedRunwayNumber.set(`${(index! + 1).toFixed(0)}/${runways.length.toFixed(0)}`);
    this.selectedStoredAirport.set(this.storedAirports.getArray().indexOf(runway.airportIdent));
    this.storedRunwayData.set(
      runway.ident,
      runway.location.lat,
      runway.location.long,
      runway.elevation,
      runway.length,
      runway.course,
      false,
      runway.lsIdent,
    );
  }

  /** FCOM P 55: the airport ident list displays all airports that are associated with the pilot stored runways */
  private onStoredAirportSelected(airportIndex: number | null): void {
    const ident = airportIndex !== null ? this.storedAirports.getArray()[airportIndex] : undefined;
    const runwayIndex = this.pilotStoredElements.runways.get().findIndex((r) => r.airportIdent === ident);
    if (runwayIndex >= 0) {
      this.selectedStoredRunway.set(runwayIndex);
    }
  }

  private scrollStoredRunway(delta: number): void {
    const current = this.selectedStoredRunway.get();
    const next = current !== null ? current + delta : null;
    if (next !== null && next >= 0 && next < this.pilotStoredElements.runways.get().length) {
      this.selectedStoredRunway.set(next);
    }
  }

  /** FCOM P 57-58: stored runways cannot be used by the FMS yet, so they are always deleted */
  private deleteDisplayedStoredRunway(): void {
    this.deleteOneDialogVisible.set(false);
    const index = this.selectedStoredRunway.get();
    const runway: PilotStoredRunway | undefined =
      index !== null ? this.pilotStoredElements.runways.get()[index] : undefined;
    if (runway) {
      this.pilotStoredElements.deleteRunway(runway);
    }
  }

  private deleteAllStoredRunways(): void {
    this.deleteAllDialogVisible.set(false);
    this.pilotStoredElements.deleteAllRunways();
  }

  // ---- new runway function ----------------------------------------------------------------------------------------

  private openNewRunwayFunction(airportIdent: string | null): void {
    this.clearNewRunway();
    this.newAirportIdent.set(airportIdent);
    this.newRunwayMode.set(true);
    this.selectedPageIndex.set(AirportPanel.PilotStored);
  }

  private clearNewRunway(): void {
    this.newAirportIdent.set(null);
    this.newRunwayIdent.set(null);
    this.newLatitude.set(null);
    this.newLongitude.set(null);
    this.newElevation.set(null);
    this.newLength.set(null);
    this.newCourse.set(null);
    this.newLsIdent.set(null);
  }

  private cancelNewRunway(): void {
    this.clearNewRunway();
    this.newRunwayMode.set(false);
  }

  /** FCOM P 60 STORE RWY: stores the new runway in the pilot stored runways database (maximum 10 runways) */
  private storeNewRunway(): void {
    const airportIdent = this.newAirportIdent.get();
    const ident = this.newRunwayIdent.get();
    const lat = this.newLatitude.get();
    const long = this.newLongitude.get();
    const elevation = this.newElevation.get();
    const length = this.newLength.get();
    const course = this.newCourse.get();
    if (
      airportIdent === null ||
      ident === null ||
      lat === null ||
      long === null ||
      elevation === null ||
      length === null ||
      course === null
    ) {
      this.props.fmcService.master.showFmsErrorMessage(FmsErrorType.FormatError);
      return;
    }

    this.pilotStoredElements.storeRunway({
      airportIdent,
      ident,
      location: { lat, long },
      elevation,
      length: UnitType.FOOT.convertFrom(length, UnitType.METER),
      course,
      lsIdent: this.newLsIdent.get() ?? undefined,
    });

    this.cancelNewRunway();
    this.selectedStoredRunway.set(
      this.pilotStoredElements.runways.get().findIndex((r) => r.airportIdent === airportIdent && r.ident === ident),
    );
  }

  // ---- render -------------------------------------------------------------------------------------------------------

  private numberField(
    y: number,
    x: number,
    width: number,
    format: DataEntryFormat<number>,
    value: Subject<number | null>,
    disabled?: Subscribable<boolean>,
  ): VNode {
    return fcomAt(
      y,
      x,
      <InputField<number>
        dataEntryFormat={format}
        value={value}
        disabled={disabled}
        containerStyle={`width: ${width}px;`}
        alignText="flex-start"
        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
        hEventConsumer={this.props.mfd.hEventConsumer}
        interactionMode={this.props.mfd.interactionMode}
      />,
    );
  }

  private textField(
    y: number,
    x: number,
    width: number,
    format: DataEntryFormat<string>,
    value: Subject<string | null>,
  ) {
    return fcomAt(
      y,
      x,
      <InputField<string>
        dataEntryFormat={format}
        value={value}
        containerStyle={`width: ${width}px;`}
        alignText="flex-start"
        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
        hEventConsumer={this.props.mfd.hEventConsumer}
        interactionMode={this.props.mfd.interactionMode}
      />,
    );
  }

  /** Runway data of a database runway (P 53, in the runway box) */
  private renderDatabaseRunwayData(): VNode {
    const data = this.databaseRunwayData;
    return (
      <>
        {fcomRight(305, 242, <span class="mfd-label">RWY</span>)}
        {fcomAt(305, 270, <span class="mfd-value bigger">{data.ident}</span>)}
        {fcomCentre(305, 443, <span class="mfd-label">{this.databaseRunwayNumber}</span>)}
        {fcomAt(
          354,
          378,
          <div class="fr" style="gap: 4px;">
            <IconButton
              icon="double-left"
              disabled={this.previousDatabaseRunwayDisabled}
              onClick={() => this.scrollDatabaseRunway(-1)}
              containerStyle="width: 61px; height: 55px;"
            />
            <IconButton
              icon="double-right"
              disabled={this.nextDatabaseRunwayDisabled}
              onClick={() => this.scrollDatabaseRunway(1)}
              containerStyle="width: 61px; height: 55px;"
            />
          </div>,
        )}
        {fcomRight(414, 242, <span class="mfd-label">LAT/LONG</span>)}
        {fcomAt(414, 270, <span class="mfd-value bigger">{data.coordinates}</span>)}
        {fcomRight(475, 242, <span class="mfd-label">ELEVATION</span>)}
        {fcomAt(
          475,
          280,
          <>
            <span class="mfd-value bigger">{data.elevation}</span>
            <span class="mfd-label-unit mfd-unit-trailing">FT</span>
          </>,
        )}
        {fcomRight(534, 242, <span class="mfd-label">LENGTH</span>)}
        {fcomAt(
          534,
          298,
          <>
            <span class="mfd-value bigger">{data.length}</span>
            <span class="mfd-label-unit mfd-unit-trailing">FT</span>
          </>,
        )}
        {fcomRight(534, 561, <span class="mfd-label">CRS</span>)}
        {fcomAt(
          534,
          609,
          <>
            <span class="mfd-value bigger">{data.course}</span>
            <span class="mfd-label-unit mfd-unit-trailing">°{data.courseTrue}</span>
          </>,
        )}
        {fcomRight(593, 242, <span class="mfd-label">LS IDENT</span>)}
        {fcomAt(593, 268, <span class="mfd-value bigger">{data.lsIdent}</span>)}
        {fcomAt(
          646,
          35,
          <Button
            label="RWY LIST"
            onClick={() => this.selectedDatabaseRunway.set(null)}
            buttonStyle="min-width: 170px;"
          />,
        )}
      </>
    );
  }

  /** DATABASE ARPTs panel (P 52) */
  private renderDatabasePanel(): VNode {
    return (
      <>
        {fcomRight(111, 310, <span class="mfd-label">ARPT IDENT</span>)}
        {fcomAt(
          111,
          333,
          <InputField<string>
            dataEntryFormat={new AirportFormat()}
            value={this.databaseIdent}
            dataHandlerDuringValidation={(v) => this.onDatabaseIdentEntered(v)}
            canBeCleared={Subject.create(false)}
            containerStyle="width: 90px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomCentre(173, 378, <span class="mfd-value bigger">{this.airportName}</span>)}
        {fcomAt(233, 208, <span class="mfd-value bigger">{this.airportCoordinates}</span>)}
        <div class="mfd-data-airport-box" />
        <div ref={this.runwayListRef} style={{ display: this.runwayListVisible.map((v) => (v ? 'block' : 'none')) }} />
        <div style={{ display: this.databaseRunwayVisible.map((v) => (v ? 'block' : 'none')) }}>
          {this.renderDatabaseRunwayData()}
        </div>
      </>
    );
  }

  /** Runway data of a pilot stored runway (P 55, in the runway box) */
  private renderStoredRunwayData(): VNode {
    const data = this.storedRunwayData;
    return (
      <>
        {fcomRight(309, 86, <span class="mfd-label">RWY</span>)}
        {fcomAt(309, 112, <span class="mfd-value bigger">{data.ident}</span>)}
        {fcomRight(379, 242, <span class="mfd-label">LAT/LONG</span>)}
        {fcomAt(379, 269, <span class="mfd-value bigger">{data.coordinates}</span>)}
        {fcomRight(441, 242, <span class="mfd-label">ELEVATION</span>)}
        {fcomAt(
          441,
          278,
          <>
            <span class="mfd-value bigger">{data.elevation}</span>
            <span class="mfd-label-unit mfd-unit-trailing">FT</span>
          </>,
        )}
        {fcomRight(500, 242, <span class="mfd-label">LENGTH</span>)}
        {fcomAt(
          500,
          298,
          <>
            <span class="mfd-value bigger">{data.length}</span>
            <span class="mfd-label-unit mfd-unit-trailing">FT</span>
          </>,
        )}
        {fcomRight(500, 525, <span class="mfd-label">CRS</span>)}
        {fcomAt(
          500,
          577,
          <>
            <span class="mfd-value bigger">{data.course}</span>
            <span class="mfd-label-unit mfd-unit-trailing">°</span>
          </>,
        )}
        {fcomRight(559, 242, <span class="mfd-label">LS IDENT</span>)}
        {fcomAt(559, 269, <span class="mfd-value bigger">{data.lsIdent}</span>)}
      </>
    );
  }

  /** PILOT STORED RWYs panel with stored runways (P 55) */
  private renderStoredPanel(): VNode {
    return (
      <>
        {fcomRight(111, 310, <span class="mfd-label">ARPT IDENT</span>)}
        {fcomAt(
          111,
          331,
          <DropdownMenu
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataAirportStoredDropdown`}
            selectedIndex={this.selectedStoredAirport}
            values={this.storedAirports}
            freeTextAllowed={false}
            containerStyle="width: 119px;"
            alignLabels="center"
            numberOfDigitsForInputField={4}
            onModified={(i) => this.onStoredAirportSelected(i)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {fcomCentre(111, 572, <span class="mfd-label">{this.storedRunwayNumber}</span>)}
        {fcomAt(
          171,
          504,
          <div class="fr" style="gap: 8px;">
            <IconButton
              icon="double-left"
              disabled={this.previousStoredDisabled}
              onClick={() => this.scrollStoredRunway(-1)}
              containerStyle="width: 61px; height: 55px;"
            />
            <IconButton
              icon="double-right"
              disabled={this.nextStoredDisabled}
              onClick={() => this.scrollStoredRunway(1)}
              containerStyle="width: 61px; height: 55px;"
            />
          </div>,
        )}
        <div class="mfd-data-airport-box" />
        {this.renderStoredRunwayData()}
        {fcomAt(
          729,
          18,
          <Button
            label={
              <span class="fr aic">
                <span style="white-space: pre; text-align: center;">{'DELETE\nSTORED RWY'}</span>
                <span style="margin-left: 16px;">*</span>
              </span>
            }
            onClick={() => this.deleteOneDialogVisible.set(true)}
            buttonStyle="min-width: 207px; min-height: 58px;"
          />,
        )}
        {fcomAt(
          729,
          234,
          <Button
            label={
              <span class="fr aic">
                <span style="white-space: pre; text-align: center;">{'DELETE ALL\nSTORED RWYs'}</span>
                <span style="margin-left: 16px;">*</span>
              </span>
            }
            onClick={() => this.deleteAllDialogVisible.set(true)}
            buttonStyle="min-width: 209px; min-height: 58px;"
          />,
        )}
        {fcomAt(
          729,
          578,
          <Button
            label="NEW RWY"
            onClick={() => this.openNewRunwayFunction(null)}
            buttonStyle="min-width: 170px; min-height: 58px;"
          />,
        )}
      </>
    );
  }

  /** PILOT STORED RWYs panel without stored runway (P 56) */
  private renderNoStoredPanel(): VNode {
    return (
      <>
        {fcomCentre(123, 383, <span class="mfd-label">NO PILOT STORED RWY</span>)}
        {fcomAt(
          730,
          578,
          <Button
            label="NEW RWY"
            onClick={() => this.openNewRunwayFunction(null)}
            buttonStyle="min-width: 170px; min-height: 60px;"
          />,
        )}
      </>
    );
  }

  /** New runway function (P 59-60) */
  private renderNewRunwayFunction(): VNode {
    return (
      <>
        {fcomRight(111, 310, <span class="mfd-label">ARPT IDENT</span>)}
        {this.textField(111, 333, 90, new AirportFormat(), this.newAirportIdent)}
        <div class="mfd-data-airport-box" />
        {fcomRight(311, 86, <span class="mfd-label">RWY</span>)}
        {this.textField(311, 110, 69, new RunwayDesignatorFormat(), this.newRunwayIdent)}
        {fcomRight(381, 242, <span class="mfd-label">LAT/LONG</span>)}
        {this.numberField(381, 269, 150, new NewRunwayLatitudeFormat(), this.newLatitude)}
        {fcomCentre(381, 442, <span class="mfd-label">/</span>)}
        {this.numberField(381, 458, 170, new NewRunwayLongitudeFormat(), this.newLongitude)}
        {fcomRight(442, 242, <span class="mfd-label">ELEVATION</span>)}
        {this.numberField(442, 269, 140, new ElevationFormat(), this.newElevation)}
        {fcomRight(502, 242, <span class="mfd-label">LENGTH</span>)}
        {this.numberField(502, 269, 140, this.lengthFormat, this.newLength)}
        {fcomRight(502, 524, <span class="mfd-label">CRS</span>)}
        {this.numberField(502, 551, 99, new BearingFormat(), this.newCourse)}
        {fcomRight(561, 242, <span class="mfd-label">LS IDENT</span>)}
        {this.textField(561, 269, 129, new NavaidIdentFormat('------'), this.newLsIdent)}
        {fcomAt(561, 456, <span class="mfd-label">(OPTIONAL)</span>)}
        {fcomAt(
          728,
          13,
          <Button
            label="CANCEL"
            onClick={() => this.cancelNewRunway()}
            buttonStyle="min-width: 129px; min-height: 59px;"
          />,
        )}
        {fcomAt(
          728,
          578,
          <Button
            label={
              <span class="fr aic">
                <span style="white-space: pre; text-align: center;">{'STORE\nRWY'}</span>
                <span style="margin-left: 28px;">*</span>
              </span>
            }
            disabled={this.storeDisabled}
            onClick={() => this.storeNewRunway()}
            buttonStyle="min-width: 170px; min-height: 59px;"
          />,
        )}
      </>
    );
  }

  render(): VNode {
    const visibleWhen = (visible: Subscribable<boolean>) => ({
      display: visible.map((v) => (v ? 'block' : 'none')),
    });
    const onPanel = (panel: AirportPanel) => this.selectedPageIndex.map((i) => i === panel);
    const storedPanel = onPanel(AirportPanel.PilotStored);
    const storedWithRunways = MappedSubject.create(([p, v]) => p && v, storedPanel, this.storedVisible);
    const storedWithout = MappedSubject.create(([p, v]) => p && v, storedPanel, this.noStoredVisible);
    const storedNew = MappedSubject.create(([p, v]) => p && v, storedPanel, this.newRunwayMode);
    this.subs.push(storedPanel, storedWithRunways, storedWithout, storedNew);

    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="mfd-page-container" style="position: relative;">
          {/* Tab panels from y = 150 to 910 (P 56); their content is drawn in the overlays below */}
          <TopTabNavigator
            pageTitles={Subject.create(['DATABASE ARPTs', 'PILOT STORED RWYs'])}
            selectedPageIndex={this.selectedPageIndex}
            pageChangeCallback={(val) => this.selectedPageIndex.set(val)}
            selectedTabTextColor="white"
            {...fcomTabBar}
          >
            <TopTabNavigatorPage containerStyle="flex: 0 0 auto; box-sizing: border-box; height: 724px;" />
            <TopTabNavigatorPage containerStyle="flex: 0 0 auto; box-sizing: border-box; height: 724px;" />
          </TopTabNavigator>
          <div class="mfd-fcom-overlay" style={visibleWhen(onPanel(AirportPanel.Database))}>
            {this.renderDatabasePanel()}
          </div>
          <div class="mfd-fcom-overlay" style={visibleWhen(storedWithRunways)}>
            {this.renderStoredPanel()}
          </div>
          <div class="mfd-fcom-overlay" style={visibleWhen(storedWithout)}>
            {this.renderNoStoredPanel()}
          </div>
          <div class="mfd-fcom-overlay" style={visibleWhen(storedNew)}>
            {this.renderNewRunwayFunction()}
          </div>
          {/* P 52 / P 55: RETURN below the panels, not during the new runway function */}
          <div class="mfd-fcom-overlay" style={visibleWhen(this.newRunwayMode.map((v) => !v))}>
            <div style={visibleWhen(this.showReturnButton)}>
              {fcomAt(
                793,
                5,
                <Button
                  label="RETURN"
                  onClick={() => this.props.mfd.uiService.navigateTo('back')}
                  buttonStyle="min-width: 129px;"
                />,
              )}
            </div>
          </div>
          {/* P 57-58: confirmation windows */}
          <div class="mfd-data-airport-dialogs">
            <ConfirmationDialog
              visible={this.deleteOneDialogVisible}
              cancelAction={() => this.deleteOneDialogVisible.set(false)}
              confirmAction={() => this.deleteDisplayedStoredRunway()}
              contentContainerStyle="width: 390px; height: 165px; transform: translateX(-50%);"
            >
              DELETE STORED RWY ?
            </ConfirmationDialog>
            <ConfirmationDialog
              visible={this.deleteAllDialogVisible}
              cancelAction={() => this.deleteAllDialogVisible.set(false)}
              confirmAction={() => this.deleteAllStoredRunways()}
              contentContainerStyle="width: 480px; height: 165px; transform: translateX(-50%);"
            >
              DELETE ALL STORED RWYs ?
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
