// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import {
  ArraySubject,
  FSComponent,
  MappedSubject,
  Subject,
  Subscribable,
  SubscribableUtils,
  VNode,
} from '@microsoft/msfs-sdk';
import {
  coordinateToString,
  IlsNavaid,
  isIlsNavaid,
  isNdbNavaid,
  isVhfNavaid,
  LsCategory,
  NdbNavaid,
  VhfNavaid,
  VhfNavaidType,
} from '@flybywiresim/fbw-sdk';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import { FmsErrorType } from '@fmgc/FmsError';

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
  DataEntryFormat,
  ElevationFormat,
  FrequencyADFFormat,
  FrequencyILSFormat,
  FrequencyVORDMEFormat,
  GlsChannelFormat,
  GlsSlopeFormat,
  LatitudeDmsFormat,
  LongitudeDmsFormat,
  LsCourseFormat,
  NavaidIdentFormat,
  StationDeclinationFormat,
  WaypointFormat,
} from '../../common/DataEntryFormats';
import {
  hasElevation,
  hasStationDeclination,
  isLandingSystemClass,
  PilotNavaidClass,
  pilotNavaidClassLabels,
  PilotStoredNavaid,
} from '../../../FMC/PilotStoredElements';
import { showReturnButtonUriExtra } from '../../../shared/utils';

import './MfdFmsDataNavaid.scss';
import { fcomAt, fcomTabBar } from '../../common/FcomLayout';

interface MfdFmsDataNavaidProps extends AbstractMfdPageProps {}

/** FCOM P 71: the new NAVAID function shows the latitude as -------- and the longitude as --------- */
class NewNavaidLatitudeFormat extends LatitudeDmsFormat {
  public readonly placeholder = '--------';
}

class NewNavaidLongitudeFormat extends LongitudeDmsFormat {
  public readonly placeholder = '---------';
}

enum NavaidPanel {
  Database,
  PilotStored,
}

const newNavaidUriExtra = 'new';

/** The FCOM NAVAID data lines of the DATA / NAVAID page, as display strings (empty = the line is not displayed). */
class NavaidDataDisplay {
  readonly navaidClass = Subject.create('');

  readonly latLong = Subject.create('');

  readonly elevation = Subject.create('');

  readonly runwayIdent = Subject.create('');

  readonly stationDeclination = Subject.create('');

  readonly stationDeclinationUnit = Subject.create('');

  readonly frequency = Subject.create('');

  readonly frequencyLabel = Subject.create('FREQ');

  readonly frequencyUnit = Subject.create('');

  readonly category = Subject.create('');

  readonly figureOfMerit = Subject.create('');

  readonly course = Subject.create('');

  readonly courseUnit = Subject.create('°');

  readonly slope = Subject.create('');

  clear(): void {
    for (const s of [
      this.navaidClass,
      this.latLong,
      this.elevation,
      this.runwayIdent,
      this.stationDeclination,
      this.frequency,
      this.category,
      this.figureOfMerit,
      this.course,
      this.slope,
    ]) {
      s.set('');
    }
  }

  setFromDatabaseNavaid(navaid: VhfNavaid | NdbNavaid | IlsNavaid): void {
    this.clear();
    if (isVhfNavaid(navaid)) {
      this.navaidClass.set(vhfNavaidClassName(navaid.type));
      this.latLong.set(coordinateToString(navaid.location, false));
      const isVor = navaid.type === VhfNavaidType.Vor;
      if (!isVor && navaid.dmeLocation?.alt !== undefined) {
        this.elevation.set(Math.round(navaid.dmeLocation.alt).toFixed(0));
      }
      if (isVor || navaid.type === VhfNavaidType.VorDme || navaid.type === VhfNavaidType.Vortac) {
        this.stationDeclination.set(navaid.trueReferenced ? 'TRUE' : Math.abs(navaid.stationDeclination).toFixed(1));
        this.stationDeclinationUnit.set(navaid.trueReferenced ? '' : declinationUnit(navaid.stationDeclination));
      }
      this.frequencyLabel.set('FREQ');
      this.frequency.set(formatVhfFrequency(navaid.frequency));
      this.frequencyUnit.set('');
      this.figureOfMerit.set(navaid.figureOfMerit <= 3 ? navaid.figureOfMerit.toFixed(0) : '-');
    } else if (isNdbNavaid(navaid)) {
      this.navaidClass.set('NDB');
      this.latLong.set(coordinateToString(navaid.location, false));
      this.frequencyLabel.set('FREQ');
      this.frequency.set(navaid.frequency.toFixed(1));
      this.frequencyUnit.set('KHZ');
    } else if (isIlsNavaid(navaid)) {
      const locOnly = navaid.category === LsCategory.LocOnly;
      this.navaidClass.set(locOnly ? 'LOC' : navaid.dmeLocation ? 'ILS/DME' : 'ILS');
      this.latLong.set(coordinateToString(navaid.locLocation, false));
      const elevation = navaid.gsLocation?.alt ?? navaid.dmeLocation?.alt;
      if (elevation !== undefined) {
        this.elevation.set(Math.round(elevation).toFixed(0));
      }
      // The navigation database does not carry the runway of an ILS
      this.runwayIdent.set('----');
      this.frequencyLabel.set('FREQ');
      this.frequency.set(formatVhfFrequency(navaid.frequency));
      this.frequencyUnit.set('');
      this.category.set(lsCategoryNumber(navaid.category));
      this.course.set(Math.round(navaid.locBearing).toFixed(0).padStart(3, '0'));
      this.courseUnit.set(navaid.trueReferenced ? '°T' : '°');
    }
  }

  setFromPilotNavaid(navaid: PilotStoredNavaid): void {
    this.clear();
    this.navaidClass.set(pilotNavaidClassLabels[navaid.class]);
    this.latLong.set(coordinateToString(navaid.location, false));
    if (hasElevation(navaid.class) && navaid.elevation !== undefined) {
      this.elevation.set(Math.round(navaid.elevation).toFixed(0));
    }
    if (isLandingSystemClass(navaid.class)) {
      this.runwayIdent.set(navaid.runwayIdent ?? '----');
      this.category.set(navaid.category?.toFixed(0) ?? '-');
      this.course.set(navaid.course !== undefined ? Math.round(navaid.course).toFixed(0).padStart(3, '0') : '---');
      this.courseUnit.set(navaid.courseTrue ? '°T' : '°');
    }
    if (hasStationDeclination(navaid.class) && navaid.stationDeclination !== undefined) {
      this.stationDeclination.set(Math.abs(navaid.stationDeclination).toFixed(1));
      this.stationDeclinationUnit.set(declinationUnit(navaid.stationDeclination));
    }
    if (navaid.class === PilotNavaidClass.Gls) {
      this.frequencyLabel.set('CHANNEL');
      this.frequency.set(navaid.channel?.toFixed(0) ?? '-----');
      this.frequencyUnit.set('');
      this.slope.set(navaid.slope !== undefined ? navaid.slope.toFixed(1) : '-.-');
    } else {
      this.frequencyLabel.set('FREQ');
      const isNdb = navaid.class === PilotNavaidClass.Ndb;
      this.frequency.set(
        navaid.frequency !== undefined
          ? isNdb
            ? navaid.frequency.toFixed(1)
            : formatVhfFrequency(navaid.frequency)
          : '---.--',
      );
      this.frequencyUnit.set(isNdb ? 'KHZ' : '');
    }
    this.figureOfMerit.set(navaid.figureOfMerit?.toFixed(0) ?? '-');
  }
}

function vhfNavaidClassName(type: VhfNavaidType): string {
  switch (type) {
    case VhfNavaidType.Vor:
      return 'VOR';
    case VhfNavaidType.VorDme:
    case VhfNavaidType.Vortac:
      return 'VOR/DME';
    case VhfNavaidType.Dme:
    case VhfNavaidType.Tacan:
      return 'DME';
    case VhfNavaidType.IlsDme:
    case VhfNavaidType.IlsTacan:
      return 'ILS/DME';
    default:
      return 'VOR';
  }
}

function lsCategoryNumber(category: LsCategory): string {
  switch (category) {
    case LsCategory.Category1:
      return '1';
    case LsCategory.Category2:
      return '2';
    case LsCategory.Category3:
      return '3';
    default:
      return '-';
  }
}

/** Station declination unit as in the FCOM figure (0.1°W): degrees and E or W */
function declinationUnit(declination: number): string {
  return declination < 0 ? '°W' : '°E';
}

/** VHF frequency as in the FCOM figures (110.7, 116.0, 116.05): two decimals without a trailing zero */
function formatVhfFrequency(frequency: number): string {
  return frequency.toFixed(2).replace(/0$/, '');
}

/**
 * Vertical centres (panel coordinates) of the NAVAID data lines, from the FCOM figures (DSC-22-FMS-20-30 P 65, 67, 71):
 * a line keeps its slot whether or not the lines above it are displayed.
 */
const navaidSlots = {
  ident: 66,
  navaidClass: 141,
  latLong: 201,
  elevation: 262,
  runwayOrDeclination: 322,
  frequency: 401,
  category: 460,
  course: 522,
  lastLine: 573,
  afterLastLine: 625,
};

/** Right edge of the labels and left edge of the values (panel coordinates: display x - 22, display y - 200) */
const navaidLabelRight = 219;
const navaidValueLeft = 245;

/** FCOM P 73: the figure of merit list */
const figureOfMeritLabels = ['0 (40NM)', '1 (70NM)', '2 (130NM)', '3 (250NM)'];

/**
 * DATA / NAVAID page (A380 FCOM DSC-22-FMS-20-30 "DATA / NAVAID PAGE"): the DATABASE NAVAIDS panel shows the data of
 * a navigation database NAVAID (class, position, elevation, runway, station declination, frequency or channel, category,
 * figure of merit, course, slope); the PILOT STORED NAVAIDS panel lists the NAVAIDs created by the flight crew and
 * offers the new NAVAID function.
 *
 * Pilot stored NAVAIDs are kept in the pilot stored elements database but cannot be tuned or used as flight plan fixes yet.
 */
export class MfdFmsDataNavaid extends FmsPage<MfdFmsDataNavaidProps> {
  private readonly pilotStoredElements = this.props.fmcService.master.pilotStoredElements;

  private readonly selectedPageIndex = Subject.create<number>(NavaidPanel.Database);

  private readonly showReturnButton = Subject.create(true);

  // ---- DATABASE NAVAIDS panel -----------------------------------------------------------------------------------------

  private readonly databaseIdent = Subject.create<string | null>(null);

  private readonly databaseData = new NavaidDataDisplay();

  private readonly databaseDataVisible = this.databaseData.navaidClass.map((v) => v !== '');

  // ---- PILOT STORED NAVAIDS panel ---------------------------------------------------------------------------------

  private readonly storedIdents = ArraySubject.create<string>([]);

  private readonly selectedStored = Subject.create<number | null>(null);

  private readonly storedNumberText = Subject.create('0/0');

  private readonly storedData = new NavaidDataDisplay();

  private readonly hasStoredNavaids = Subject.create(false);

  private readonly newNavaidMode = Subject.create(false);

  private readonly listVisible = MappedSubject.create(
    ([hasStored, newMode]) => hasStored && !newMode,
    this.hasStoredNavaids,
    this.newNavaidMode,
  );

  private readonly noStoredVisible = MappedSubject.create(
    ([hasStored, newMode]) => !hasStored && !newMode,
    this.hasStoredNavaids,
    this.newNavaidMode,
  );

  private readonly previousStoredDisabled = this.selectedStored.map((i) => i === null || i <= 0);

  private readonly nextStoredDisabled = MappedSubject.create(
    ([i, navaids]) => i === null || i >= navaids.length - 1,
    this.selectedStored,
    this.pilotStoredElements.navaids,
  );

  private readonly deleteOneDialogVisible = Subject.create(false);

  private readonly deleteAllDialogVisible = Subject.create(false);

  // ---- new NAVAID function ------------------------------------------------------------------------------------------

  private readonly newIdent = Subject.create<string | null>(null);

  private readonly newClass = Subject.create<number | null>(null);

  private readonly newClassLabels = ArraySubject.create([...pilotNavaidClassLabels]);

  private readonly newLatitude = Subject.create<number | null>(null);

  private readonly newLongitude = Subject.create<number | null>(null);

  private readonly newElevation = Subject.create<number | null>(null);

  private readonly newRunwayIdent = Subject.create<string | null>(null);

  private readonly newStationDeclination = Subject.create<number | null>(null);

  private readonly newVorDmeFrequency = Subject.create<number | null>(null);

  private readonly newIlsFrequency = Subject.create<number | null>(null);

  private readonly newNdbFrequency = Subject.create<number | null>(null);

  private readonly newGlsChannel = Subject.create<number | null>(null);

  private readonly newCategory = Subject.create<number | null>(null);

  private readonly newFigureOfMerit = Subject.create<number | null>(null);

  private readonly newCourse = Subject.create<number | null>(null);

  private readonly newSlope = Subject.create<number | null>(null);

  private readonly newClassValue = this.newClass.map((c) => (c !== null ? (c as PilotNavaidClass) : null));

  private readonly newElevationVisible = this.newClassValue.map((c) => c !== null && hasElevation(c));

  private readonly newLandingSystemVisible = this.newClassValue.map((c) => c !== null && isLandingSystemClass(c));

  private readonly newStationDeclinationVisible = this.newClassValue.map((c) => c !== null && hasStationDeclination(c));

  private readonly newVorDmeFrequencyVisible = this.newClassValue.map(
    (c) => c === PilotNavaidClass.Vor || c === PilotNavaidClass.Dme || c === PilotNavaidClass.VorDme,
  );

  private readonly newIlsFrequencyVisible = this.newClassValue.map(
    (c) => c === PilotNavaidClass.Loc || c === PilotNavaidClass.Ils,
  );

  private readonly newNdbFrequencyVisible = this.newClassValue.map((c) => c === PilotNavaidClass.Ndb);

  private readonly newGlsVisible = this.newClassValue.map((c) => c === PilotNavaidClass.Gls);

  private readonly storeDisabled = MappedSubject.create(
    ([ident, navaidClass, lat, long, vorDme, ils, ndb, gls]) => {
      if (ident === null || navaidClass === null || lat === null || long === null) {
        return true;
      }
      switch (navaidClass as PilotNavaidClass) {
        case PilotNavaidClass.Vor:
        case PilotNavaidClass.Dme:
        case PilotNavaidClass.VorDme:
          return vorDme === null;
        case PilotNavaidClass.Loc:
        case PilotNavaidClass.Ils:
          return ils === null;
        case PilotNavaidClass.Ndb:
          return ndb === null;
        case PilotNavaidClass.Gls:
          return gls === null;
        default:
          return true;
      }
    },
    this.newIdent,
    this.newClass,
    this.newLatitude,
    this.newLongitude,
    this.newVorDmeFrequency,
    this.newIlsFrequency,
    this.newNdbFrequency,
    this.newGlsChannel,
  );

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.databaseDataVisible,
      this.listVisible,
      this.noStoredVisible,
      this.previousStoredDisabled,
      this.nextStoredDisabled,
      this.newClassValue,
      this.newElevationVisible,
      this.newLandingSystemVisible,
      this.newStationDeclinationVisible,
      this.newVorDmeFrequencyVisible,
      this.newIlsFrequencyVisible,
      this.newNdbFrequencyVisible,
      this.newGlsVisible,
      this.storeDisabled,
      this.pilotStoredElements.navaids.sub(() => this.refreshStoredNavaids(), true),
      this.selectedStored.sub((i) => this.showStoredNavaid(i), true),
      this.props.mfd.uiService.activeUri.sub((uri) => this.handleUriExtra(uri.extra ?? ''), true),
    );
  }

  protected onNewData(): void {
    // The page has no flight plan data
  }

  private handleUriExtra(extra: string): void {
    const parts = extra.split('/');
    // FCOM: the RETURN button displays the page that was displayed before; the menu bar entry has no previous page
    this.showReturnButton.set(parts.includes(showReturnButtonUriExtra));

    const newIndex = parts.indexOf(newNavaidUriExtra);
    if (newIndex >= 0) {
      this.openNewNavaidFunction(parts[newIndex + 1] ?? null);
    } else if (parts.includes('pilot-stored')) {
      this.selectedPageIndex.set(NavaidPanel.PilotStored);
    }
  }

  // ---- DATABASE NAVAIDS ---------------------------------------------------------------------------------------------

  /**
   * FCOM: a pilot created NAVAID opens the PILOT STORED NAVAIDS panel with its data; an ident that is neither in the
   * navigation database nor pilot created opens the new NAVAID function.
   */
  private async onDatabaseIdentEntered(ident: string | null): Promise<boolean> {
    this.databaseData.clear();
    if (ident === null) {
      return true;
    }

    const storedIndex = this.pilotStoredElements.navaids.get().findIndex((n) => n.ident === ident);
    if (storedIndex >= 0) {
      this.newNavaidMode.set(false);
      this.selectedStored.set(storedIndex);
      this.selectedPageIndex.set(NavaidPanel.PilotStored);
      return true;
    }

    const database = NavigationDatabaseService.activeDatabase;
    const candidates: (VhfNavaid | NdbNavaid | IlsNavaid)[] = [
      ...(await database.searchAllNavaid(ident)),
      ...(await database.searchIls(ident)),
    ];
    if (candidates.length === 0) {
      this.openNewNavaidFunction(ident);
      return true;
    }

    const navaid =
      candidates.length > 1 ? await this.props.fmcService.master.deduplicateFacilities(candidates) : candidates[0];
    if (navaid === undefined) {
      return false;
    }
    this.databaseData.setFromDatabaseNavaid(navaid);
    return true;
  }

  // ---- PILOT STORED NAVAIDS -----------------------------------------------------------------------------------------

  private refreshStoredNavaids(): void {
    const navaids = this.pilotStoredElements.navaids.get();
    this.storedIdents.set(navaids.map((n) => n.ident));
    this.hasStoredNavaids.set(navaids.length > 0);

    const current = this.selectedStored.get();
    const newIndex = navaids.length === 0 ? null : Math.min(current ?? 0, navaids.length - 1);
    if (current === newIndex) {
      this.showStoredNavaid(newIndex);
    } else {
      this.selectedStored.set(newIndex);
    }
  }

  private showStoredNavaid(index: number | null): void {
    const navaids = this.pilotStoredElements.navaids.get();
    const navaid = index !== null ? navaids[index] : undefined;
    if (!navaid) {
      this.storedNumberText.set('0/0');
      this.storedData.clear();
      return;
    }
    this.storedNumberText.set(`${(index! + 1).toFixed(0)}/${navaids.length.toFixed(0)}`);
    this.storedData.setFromPilotNavaid(navaid);
  }

  private scrollStoredNavaid(delta: number): void {
    const current = this.selectedStored.get();
    if (current === null) {
      return;
    }
    const next = current + delta;
    if (next >= 0 && next < this.pilotStoredElements.navaids.get().length) {
      this.selectedStored.set(next);
    }
  }

  private deleteSelectedStoredNavaid(): void {
    this.deleteOneDialogVisible.set(false);
    const index = this.selectedStored.get();
    if (index !== null) {
      this.pilotStoredElements.deleteNavaid(index);
    }
  }

  private deleteAllStoredNavaids(): void {
    this.deleteAllDialogVisible.set(false);
    this.pilotStoredElements.deleteAllNavaids();
  }

  // ---- new NAVAID function ------------------------------------------------------------------------------------------

  private openNewNavaidFunction(ident: string | null): void {
    this.clearNewNavaid();
    this.newIdent.set(ident);
    this.newNavaidMode.set(true);
    this.selectedPageIndex.set(NavaidPanel.PilotStored);
  }

  private clearNewNavaid(): void {
    this.newIdent.set(null);
    this.newClass.set(null);
    this.newLatitude.set(null);
    this.newLongitude.set(null);
    this.newElevation.set(null);
    this.newRunwayIdent.set(null);
    this.newStationDeclination.set(null);
    this.newVorDmeFrequency.set(null);
    this.newIlsFrequency.set(null);
    this.newNdbFrequency.set(null);
    this.newGlsChannel.set(null);
    this.newCategory.set(null);
    this.newFigureOfMerit.set(null);
    this.newCourse.set(null);
    this.newSlope.set(null);
  }

  private cancelNewNavaid(): void {
    this.clearNewNavaid();
    this.newNavaidMode.set(false);
  }

  /** FCOM STORE NAVAID: stores the new NAVAID in the pilot stored elements database (maximum 20 NAVAIDs). */
  private storeNewNavaid(): void {
    const ident = this.newIdent.get();
    const navaidClass = this.newClassValue.get();
    const lat = this.newLatitude.get();
    const long = this.newLongitude.get();
    if (this.storeDisabled.get() || ident === null || navaidClass === null || lat === null || long === null) {
      this.props.fmcService.master.showFmsErrorMessage(FmsErrorType.FormatError);
      return;
    }

    const isGls = navaidClass === PilotNavaidClass.Gls;
    const isLandingSystem = isLandingSystemClass(navaidClass);
    const frequency =
      navaidClass === PilotNavaidClass.Ndb
        ? this.newNdbFrequency.get()
        : navaidClass === PilotNavaidClass.Loc || navaidClass === PilotNavaidClass.Ils
          ? this.newIlsFrequency.get()
          : this.newVorDmeFrequency.get();
    const course = this.newCourse.get();

    this.pilotStoredElements.storeNavaid({
      ident,
      class: navaidClass,
      location: { lat, long },
      elevation: hasElevation(navaidClass) ? this.newElevation.get() ?? undefined : undefined,
      runwayIdent: isLandingSystem ? this.newRunwayIdent.get() ?? undefined : undefined,
      stationDeclination: hasStationDeclination(navaidClass)
        ? this.newStationDeclination.get() ?? undefined
        : undefined,
      frequency: isGls ? undefined : frequency ?? undefined,
      channel: isGls ? this.newGlsChannel.get() ?? undefined : undefined,
      category: this.newCategory.get() !== null ? this.newCategory.get()! + 1 : undefined,
      figureOfMerit: this.newFigureOfMerit.get() ?? undefined,
      course: isLandingSystem && course !== null ? Math.abs(course) : undefined,
      courseTrue: isLandingSystem && course !== null ? course < 0 : undefined,
      slope: isGls ? this.newSlope.get() ?? undefined : undefined,
    });

    this.newNavaidMode.set(false);
    this.clearNewNavaid();
    this.selectedStored.set(this.pilotStoredElements.navaids.get().findIndex((n) => n.ident === ident));
  }

  // ---- render ---------------------------------------------------------------------------------------------------------

  /** A label right-aligned on the label column, at the vertical centre y */
  private static label(y: number, text: string | Subscribable<string>): VNode {
    return (
      <div class="mfd-data-navaid-item mfd-data-navaid-label" style={`top: ${y - 18}px; width: ${navaidLabelRight}px;`}>
        <span class="mfd-label">{text}</span>
      </div>
    );
  }

  /** An element whose left edge is at x, centred on y */
  private static at(y: number, x: number, content: VNode | VNode[]): VNode {
    return (
      <div class="mfd-data-navaid-item" style={`top: ${y - 18}px; left: ${x}px;`}>
        {content}
      </div>
    );
  }

  /**
   * One NAVAID data line, hidden while its value is empty. Values are left-aligned on the value column, or right-aligned
   * on rightEdge when given (numbers with a unit, as in the FCOM figures).
   */
  private renderDataLine(
    y: number | Subscribable<number>,
    label: string | Subscribable<string>,
    value: Subscribable<string>,
    unit?: Subscribable<string> | string,
    rightEdge?: number,
  ): VNode {
    const display = value.map((v) => (v ? 'block' : 'none'));
    this.subs.push(display);
    const top = SubscribableUtils.toSubscribable(y, true);
    const labelStyle = top.map((t) => `top: ${t - 18}px; width: ${navaidLabelRight}px;`);
    const valueStyle = top.map((t) =>
      rightEdge !== undefined
        ? `top: ${t - 18}px; left: ${navaidValueLeft}px; width: ${rightEdge - navaidValueLeft}px; justify-content: flex-end;`
        : `top: ${t - 18}px; left: ${navaidValueLeft}px;`,
    );
    const unitStyle = top.map((t) => `top: ${t - 18}px; left: ${(rightEdge ?? 0) + 4}px;`);
    return (
      <div style={{ display }}>
        <div class="mfd-data-navaid-item mfd-data-navaid-label" style={labelStyle}>
          <span class="mfd-label">{label}</span>
        </div>
        <div class="mfd-data-navaid-item" style={valueStyle}>
          <span class="mfd-value bigger">{value}</span>
          {unit !== undefined && rightEdge === undefined && (
            <span class="mfd-label-unit mfd-unit-trailing">{unit}</span>
          )}
        </div>
        {unit !== undefined && rightEdge !== undefined && (
          <div class="mfd-data-navaid-item" style={unitStyle}>
            <span class="mfd-label-unit">{unit}</span>
          </div>
        )}
      </div>
    );
  }

  private renderNavaidData(data: NavaidDataDisplay): VNode {
    // GLS: the SLOPE takes the last line and the figure of merit moves below it
    const figureOfMeritSlot = data.slope.map((slope) => (slope ? navaidSlots.afterLastLine : navaidSlots.lastLine));
    this.subs.push(figureOfMeritSlot);
    return (
      <div>
        {this.renderDataLine(navaidSlots.navaidClass, 'CLASS', data.navaidClass)}
        {this.renderDataLine(navaidSlots.latLong, 'LAT/LONG', data.latLong)}
        {this.renderDataLine(navaidSlots.elevation, 'ELEVATION', data.elevation, 'FT', 348)}
        {this.renderDataLine(navaidSlots.runwayOrDeclination, 'RWY IDENT', data.runwayIdent)}
        {this.renderDataLine(
          navaidSlots.runwayOrDeclination,
          'STATION DEC',
          data.stationDeclination,
          data.stationDeclinationUnit,
          348,
        )}
        {this.renderDataLine(navaidSlots.frequency, data.frequencyLabel, data.frequency, data.frequencyUnit)}
        {this.renderDataLine(navaidSlots.category, 'CAT', data.category)}
        {this.renderDataLine(navaidSlots.course, 'CRS', data.course, data.courseUnit, 332)}
        {this.renderDataLine(navaidSlots.lastLine, 'SLOPE', data.slope, '°')}
        {this.renderDataLine(figureOfMeritSlot, 'FIG OF MERIT', data.figureOfMerit)}
      </div>
    );
  }

  /** An entry line of the new NAVAID function, at its FCOM slot */
  private renderInputRow(y: number, label: string, visible: Subscribable<boolean> | null, field: VNode): VNode {
    const display = visible ? visible.map((v) => (v ? 'block' : 'none')) : 'block';
    if (typeof display !== 'string') {
      this.subs.push(display);
    }
    return (
      <div style={{ display }}>
        {MfdFmsDataNavaid.label(y, label)}
        {MfdFmsDataNavaid.at(y, 248, field)}
      </div>
    );
  }

  private numberField(
    format: DataEntryFormat<number>,
    value: Subject<number | null>,
    width: number,
    mandatory = false,
  ): VNode {
    return (
      <InputField<number>
        dataEntryFormat={format}
        value={value}
        mandatory={Subject.create(mandatory)}
        containerStyle={`width: ${width}px;`}
        alignText="center"
        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
        hEventConsumer={this.props.mfd.hEventConsumer}
        interactionMode={this.props.mfd.interactionMode}
      />
    );
  }

  private textField(
    format: DataEntryFormat<string>,
    value: Subject<string | null>,
    width: number,
    mandatory = false,
  ): VNode {
    return (
      <InputField<string>
        dataEntryFormat={format}
        value={value}
        mandatory={Subject.create(mandatory)}
        containerStyle={`width: ${width}px;`}
        alignText="center"
        errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
        hEventConsumer={this.props.mfd.hEventConsumer}
        interactionMode={this.props.mfd.interactionMode}
      />
    );
  }

  /** NEW NAVAID FUNCTION (FCOM DSC-22-FMS-20-30 P 71): positions in panel coordinates */
  private renderNewNavaidFunction(): VNode {
    return (
      <div class="mfd-data-navaid-canvas">
        <div
          class="mfd-data-navaid-item mfd-data-navaid-label"
          style={`top: ${navaidSlots.ident - 18}px; width: 279px;`}
        >
          <span class="mfd-label">NAVAID IDENT</span>
        </div>
        {MfdFmsDataNavaid.at(navaidSlots.ident, 287, this.textField(new NavaidIdentFormat(), this.newIdent, 88))}
        {this.renderInputRow(
          navaidSlots.navaidClass,
          'CLASS',
          null,
          <DropdownMenu
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataNavaidClassDropdown`}
            selectedIndex={this.newClass}
            values={this.newClassLabels}
            freeTextAllowed={false}
            containerStyle="width: 172px;"
            alignLabels="flex-start"
            numberOfDigitsForInputField={7}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {MfdFmsDataNavaid.label(navaidSlots.latLong, 'LAT/LONG')}
        {MfdFmsDataNavaid.at(
          navaidSlots.latLong,
          248,
          this.numberField(new NewNavaidLatitudeFormat(), this.newLatitude, 148),
        )}
        {MfdFmsDataNavaid.at(navaidSlots.latLong, 414, <span class="mfd-label">/</span>)}
        {MfdFmsDataNavaid.at(
          navaidSlots.latLong,
          440,
          this.numberField(new NewNavaidLongitudeFormat(), this.newLongitude, 167),
        )}
        {this.renderInputRow(
          navaidSlots.elevation,
          'ELEVATION',
          this.newElevationVisible,
          this.numberField(new ElevationFormat(), this.newElevation, 139),
        )}
        {this.renderInputRow(
          navaidSlots.runwayOrDeclination,
          'RWY IDENT',
          this.newLandingSystemVisible,
          this.textField(new WaypointFormat(), this.newRunwayIdent, 149),
        )}
        {this.renderInputRow(
          navaidSlots.runwayOrDeclination,
          'STATION DEC',
          this.newStationDeclinationVisible,
          this.numberField(new StationDeclinationFormat(), this.newStationDeclination, 89),
        )}
        {this.renderInputRow(
          navaidSlots.frequency,
          'FREQ',
          this.newVorDmeFrequencyVisible,
          this.numberField(new FrequencyVORDMEFormat(), this.newVorDmeFrequency, 140, true),
        )}
        {this.renderInputRow(
          navaidSlots.frequency,
          'FREQ',
          this.newIlsFrequencyVisible,
          this.numberField(new FrequencyILSFormat(), this.newIlsFrequency, 140, true),
        )}
        {this.renderInputRow(
          navaidSlots.frequency,
          'FREQ',
          this.newNdbFrequencyVisible,
          this.numberField(new FrequencyADFFormat(), this.newNdbFrequency, 140, true),
        )}
        {this.renderInputRow(
          navaidSlots.frequency,
          'CHANNEL',
          this.newGlsVisible,
          this.numberField(new GlsChannelFormat(), this.newGlsChannel, 140, true),
        )}
        {/* FCOM P 71-72: the category is selected in a list (1, 2 or 3) */}
        {this.renderInputRow(
          navaidSlots.category,
          'CAT',
          null,
          <DropdownMenu
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataNavaidCatDropdown`}
            selectedIndex={this.newCategory}
            values={ArraySubject.create(['1', '2', '3'])}
            freeTextAllowed={false}
            containerStyle="width: 55px;"
            alignLabels="flex-start"
            numberOfDigitsForInputField={1}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />,
        )}
        {this.renderInputRow(
          navaidSlots.course,
          'CRS',
          this.newLandingSystemVisible,
          this.numberField(new LsCourseFormat(), this.newCourse, 120),
        )}
        {this.renderInputRow(
          navaidSlots.lastLine,
          'SLOPE',
          this.newGlsVisible,
          this.numberField(new GlsSlopeFormat(), this.newSlope, 100),
        )}
        <div style={{ display: this.newGlsVisible.map((v) => (v ? 'none' : 'block')) }}>
          {this.renderInputRow(
            navaidSlots.lastLine,
            'FIG OF MERIT',
            null,
            <DropdownMenu
              idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataNavaidFomDropdown`}
              selectedIndex={this.newFigureOfMerit}
              values={ArraySubject.create(figureOfMeritLabels)}
              freeTextAllowed={false}
              containerStyle="width: 174px;"
              alignLabels="flex-start"
              numberOfDigitsForInputField={8}
              hEventConsumer={this.props.mfd.hEventConsumer}
              interactionMode={this.props.mfd.interactionMode}
            />,
          )}
        </div>
        <div style={{ display: this.newGlsVisible.map((v) => (v ? 'block' : 'none')) }}>
          {this.renderInputRow(
            navaidSlots.afterLastLine,
            'FIG OF MERIT',
            null,
            <DropdownMenu
              idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataNavaidFomDropdown`}
              selectedIndex={this.newFigureOfMerit}
              values={ArraySubject.create(figureOfMeritLabels)}
              freeTextAllowed={false}
              containerStyle="width: 174px;"
              alignLabels="flex-start"
              numberOfDigitsForInputField={8}
              hEventConsumer={this.props.mfd.hEventConsumer}
              interactionMode={this.props.mfd.interactionMode}
            />,
          )}
        </div>
        {MfdFmsDataNavaid.at(
          664,
          -3,
          <Button
            label="CANCEL"
            onClick={() => this.cancelNewNavaid()}
            buttonStyle="min-width: 130px; min-height: 58px;"
          />,
        )}
        {MfdFmsDataNavaid.at(
          664,
          556,
          <Button
            label={
              <span class="fr aic">
                <span style="white-space: pre; text-align: center;">{'STORE\nNAVAID'}</span>
                <span style="margin-left: 20px;">*</span>
              </span>
            }
            disabled={this.storeDisabled}
            onClick={() => this.storeNewNavaid()}
            buttonStyle="min-width: 170px; min-height: 58px;"
          />,
        )}
      </div>
    );
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        {/* begin page content */}
        <div class="mfd-page-container" style="position: relative;">
          <TopTabNavigator
            pageTitles={Subject.create(['DATABASE NAVAIDS', 'PILOT STORED NAVAIDS'])}
            selectedPageIndex={this.selectedPageIndex}
            pageChangeCallback={(val) => this.selectedPageIndex.set(val)}
            selectedTabTextColor="white"
            {...fcomTabBar}
          >
            <TopTabNavigatorPage containerStyle="flex: 0 0 auto; box-sizing: border-box; height: 722px;">
              {/* DATABASE NAVAIDS panel (FCOM DSC-22-FMS-20-30 P 65) */}
              <div class="mfd-data-navaid-canvas">
                <div
                  class="mfd-data-navaid-item mfd-data-navaid-label"
                  style={`top: ${navaidSlots.ident - 18}px; width: 277px;`}
                >
                  <span class="mfd-label">NAVAID IDENT</span>
                </div>
                {MfdFmsDataNavaid.at(
                  navaidSlots.ident,
                  309,
                  <InputField<string>
                    dataEntryFormat={new NavaidIdentFormat()}
                    value={this.databaseIdent}
                    dataHandlerDuringValidation={(v) => this.onDatabaseIdentEntered(v)}
                    mandatory={Subject.create(true)}
                    canBeCleared={Subject.create(false)}
                    containerStyle="width: 91px;"
                    alignText="center"
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                <div style={{ display: this.databaseDataVisible.map((v) => (v ? 'block' : 'none')) }}>
                  {this.renderNavaidData(this.databaseData)}
                </div>
              </div>
            </TopTabNavigatorPage>
            <TopTabNavigatorPage containerStyle="flex: 0 0 auto; box-sizing: border-box; height: 722px;">
              {/* NO PILOT STORED NAVAID (FCOM DSC-22-FMS-20-30 P 68) */}
              <div
                class="mfd-data-navaid-canvas"
                style={{ display: this.noStoredVisible.map((v) => (v ? 'flex' : 'none')) }}
              >
                <div class="mfd-data-navaid-item mfd-data-navaid-centred" style="top: 48px; left: 318px; width: 80px;">
                  <span class="mfd-label">NO PILOT STORED NAVAID</span>
                </div>
                {MfdFmsDataNavaid.at(
                  664,
                  556,
                  <Button
                    label="NEW NAVAID"
                    onClick={() => this.openNewNavaidFunction(null)}
                    buttonStyle="min-width: 170px; min-height: 58px;"
                  />,
                )}
              </div>
              {/* PILOT STORED NAVAIDS panel (FCOM DSC-22-FMS-20-30 P 67) */}
              <div
                class="mfd-data-navaid-canvas"
                style={{ display: this.listVisible.map((v) => (v ? 'flex' : 'none')) }}
              >
                <div
                  class="mfd-data-navaid-item mfd-data-navaid-label"
                  style={`top: ${navaidSlots.ident - 18}px; width: 277px;`}
                >
                  <span class="mfd-label">NAVAID IDENT</span>
                </div>
                {MfdFmsDataNavaid.at(
                  navaidSlots.ident,
                  284,
                  <DropdownMenu
                    idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_dataNavaidStoredDropdown`}
                    selectedIndex={this.selectedStored}
                    values={this.storedIdents}
                    freeTextAllowed={false}
                    containerStyle="width: 178px;"
                    alignLabels="center"
                    numberOfDigitsForInputField={4}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                <div
                  class="mfd-data-navaid-item mfd-data-navaid-centred"
                  style={`top: ${navaidSlots.ident - 18}px; left: 514px; width: 80px;`}
                >
                  <span class="mfd-label">{this.storedNumberText}</span>
                </div>
                <div class="mfd-data-navaid-scroll">
                  <IconButton
                    icon="double-left"
                    disabled={this.previousStoredDisabled}
                    onClick={() => this.scrollStoredNavaid(-1)}
                    containerStyle="width: 61px; height: 55px;"
                  />
                  <IconButton
                    icon="double-right"
                    disabled={this.nextStoredDisabled}
                    onClick={() => this.scrollStoredNavaid(1)}
                    containerStyle="width: 61px; height: 55px;"
                  />
                </div>
                {this.renderNavaidData(this.storedData)}
                {MfdFmsDataNavaid.at(
                  664,
                  -3,
                  <Button
                    label={
                      <span class="fr aic">
                        <span style="white-space: pre; text-align: center;">{'DELETE\nSTORED NAVAID'}</span>
                        <span style="margin-left: 16px;">*</span>
                      </span>
                    }
                    onClick={() => this.deleteOneDialogVisible.set(true)}
                    buttonStyle="min-width: 232px; min-height: 58px;"
                  />,
                )}
                {MfdFmsDataNavaid.at(
                  664,
                  240,
                  <Button
                    label={
                      <span class="fr aic">
                        <span style="white-space: pre; text-align: center;">{'DELETE ALL\nSTORED NAVAIDS'}</span>
                        <span style="margin-left: 16px;">*</span>
                      </span>
                    }
                    onClick={() => this.deleteAllDialogVisible.set(true)}
                    buttonStyle="min-width: 240px; min-height: 58px;"
                  />,
                )}
                {MfdFmsDataNavaid.at(
                  664,
                  556,
                  <Button
                    label="NEW NAVAID"
                    onClick={() => this.openNewNavaidFunction(null)}
                    buttonStyle="min-width: 170px; min-height: 58px;"
                  />,
                )}
              </div>
              <div
                class="mfd-data-navaid-canvas"
                style={{ display: this.newNavaidMode.map((v) => (v ? 'flex' : 'none')) }}
              >
                {this.renderNewNavaidFunction()}
              </div>
            </TopTabNavigatorPage>
          </TopTabNavigator>
          {/* RETURN below the panels (not displayed when the page was called from the menu bar) */}
          <div class="mfd-fcom-overlay">
            {fcomAt(
              793,
              5,
              <Button
                label="RETURN"
                visible={this.showReturnButton}
                onClick={() => this.props.mfd.uiService.navigateTo('back')}
                buttonStyle="min-width: 129px;"
              />,
            )}
          </div>
          <div class="mfd-data-navaid-dialogs">
            <ConfirmationDialog
              visible={this.deleteOneDialogVisible}
              cancelAction={() => this.deleteOneDialogVisible.set(false)}
              confirmAction={() => this.deleteSelectedStoredNavaid()}
              contentContainerStyle="width: 480px; height: 165px; transform: translateX(-50%);"
            >
              DELETE STORED NAVAID ?
            </ConfirmationDialog>
            <ConfirmationDialog
              visible={this.deleteAllDialogVisible}
              cancelAction={() => this.deleteAllDialogVisible.set(false)}
              confirmAction={() => this.deleteAllStoredNavaids()}
              contentContainerStyle="width: 480px; height: 165px; transform: translateX(-50%);"
            >
              DELETE ALL STORED NAVAIDS ?
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
