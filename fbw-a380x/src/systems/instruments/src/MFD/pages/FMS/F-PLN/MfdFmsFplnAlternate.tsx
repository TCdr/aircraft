// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ClockEvents, FSComponent, Subject, Subscribable, Subscription, UnitType, VNode } from '@microsoft/msfs-sdk';
import { MagVar, NXDataStore } from '@flybywiresim/fbw-sdk';
import { bearingTo, Coordinates, distanceTo } from 'msfs-geo';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import { Predictions } from '@fmgc/guidance/vnav/Predictions';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { Button, ButtonMenuItem } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { AirportFormat } from '../../common/DataEntryFormats';
import { routeSelectionPage, showReturnButtonUriExtra } from '../../../shared/utils';
import { alternateRouteSelectionUriExtra } from './MfdFmsFplnRouteSelection';

import { fcomAt } from '../../common/FcomLayout';
import './MfdFmsFplnAlternate.scss';

interface MfdFmsFplnAlternateProps extends AbstractMfdPageProps {}

const NUM_OTHER_ALTERNATES = 2;

/** FCOM DSC-22-FMS-20-30 P 10: the database alternate list has a maximum of 6 airports */
const NUM_DATABASE_ALTERNATES = 6;

/** One alternate line: company route, direct track and distance from the primary destination, extra fuel */
class AlternateLine {
  readonly ident = Subject.create<string | null>(null);

  location: Coordinates | null = null;

  readonly companyRoute = Subject.create('');

  readonly directTrack = Subject.create('');

  readonly distance = Subject.create('');

  readonly extra = Subject.create('');

  readonly visible = this.ident.map((it) => (it ? 'visible' : 'hidden'));

  readonly entryVisible = this.ident.map((it) => (it ? 'hidden' : 'visible'));
}

/**
 * ALTERNATE page (A380 FCOM DSC-22-FMS-20-30 "ALTERNATE PAGE"): the selected alternate, NO ALTN, and up to two other
 * airports entered by the flight crew, with the direct track and distance from the primary destination and the extra
 * fuel. Any of them can be selected as the alternate destination.
 *
 * The database alternates are the company alternates of the destination: the navigation data has no alternate
 * records, so they come from the company flight plan (the alternates of the SimBrief OFP for this destination).
 * Not modelled: alternate company routes.
 * Simplified: the fuel to an alternate is a level flight at FL220 (below 200 NM) or FL310 over the direct distance,
 * from the destination EFOB; the selection inserts the alternate directly instead of creating a temporary flight plan.
 */
export class MfdFmsFplnAlternate extends FmsPage<MfdFmsFplnAlternateProps> {
  private readonly destinationIdent = Subject.create('----');

  private readonly selectedLine = new AlternateLine();

  private readonly noAlternateExtra = Subject.create('');

  private readonly otherLines = Array.from({ length: NUM_OTHER_ALTERNATES }, () => new AlternateLine());

  private readonly databaseLines = Array.from({ length: NUM_DATABASE_ALTERNATES }, () => new AlternateLine());

  /** Company alternates of the displayed destination, and the airport locations already looked up */
  private databaseAlternatesKey = '';

  private readonly airportLocations = new Map<string, Coordinates | null>();

  private readonly weightUnit = NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').map((metric) =>
    metric ? 'T' : 'KLB',
  );

  private readonly lineSubscriptions: Subscription[] = [];

  protected onNewData(): void {
    this.update();
  }

  public onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    this.subs.push(
      this.props.bus
        .getSubscriber<ClockEvents>()
        .on('realTime')
        .atFrequency(1)
        .handle(() => this.update()),
      this.weightUnit,
    );
  }

  private update(): void {
    const plan = this.loadedFlightPlan;
    const destination = plan?.destinationAirport;
    this.destinationIdent.set(destination?.ident ?? '----');

    const alternate = this.loadedAlternateFlightPlan?.destinationAirport;
    this.selectedLine.ident.set(alternate?.ident ?? null);
    this.selectedLine.location = alternate?.location ?? null;

    const destinationEfob = this.destinationEfob();
    const finalFuel = plan?.performanceData.finalHoldingFuel.get() ?? null;
    this.noAlternateExtra.set(
      destinationEfob !== null && finalFuel !== null ? this.formatFuel(destinationEfob - finalFuel) : '',
    );

    this.updateDatabaseAlternates(destination?.ident ?? null);

    for (const line of [this.selectedLine, ...this.databaseLines, ...this.otherLines]) {
      this.updateLine(line, destination?.location ?? null, destinationEfob, finalFuel);
    }
  }

  /** Fills the database alternate lines with the company alternates of the destination */
  private updateDatabaseAlternates(destinationIdent: string | null): void {
    const idents = destinationIdent ? this.props.fmcService.master.getCompanyAlternates(destinationIdent) : [];
    const key = idents.join(',');
    if (key !== this.databaseAlternatesKey) {
      this.databaseAlternatesKey = key;
      for (const ident of idents) {
        if (!this.airportLocations.has(ident)) {
          this.airportLocations.set(ident, null);
          NavigationDatabaseService.activeDatabase
            .searchAirport(ident)
            .then((airport) => {
              this.airportLocations.set(ident, airport?.location ?? null);
              this.update();
            })
            .catch(() => {});
        }
      }
    }
    this.databaseLines.forEach((line, i) => {
      const ident = idents[i] ?? null;
      line.ident.set(ident);
      line.location = ident ? this.airportLocations.get(ident) ?? null : null;
    });
  }

  /** The destination EFOB in tonnes; FCOM: the extra fuel is dashed when a MIN FUEL AT DEST is entered */
  private destinationEfob(): number | null {
    const plan = this.loadedFlightPlan;
    if (!plan || plan.performanceData.isMinimumDestinationFuelOnBoardPilotEntered.get()) {
      return null;
    }
    return this.props.fmcService.master.fmgc.getDestEFOB(true, this.loadedFlightPlanIndex.get());
  }

  private updateLine(
    line: AlternateLine,
    destination: Coordinates | null,
    destinationEfob: number | null,
    finalFuel: number | null,
  ): void {
    if (!line.location || !destination) {
      line.companyRoute.set('');
      line.directTrack.set('');
      line.distance.set('');
      line.extra.set('');
      return;
    }

    const distance = distanceTo(destination, line.location);
    const magVar = MagVar.get(destination);
    const trueTrack = bearingTo(destination, line.location);
    const track = magVar !== null ? MagVar.trueToMagnetic(trueTrack, magVar) : trueTrack;
    line.companyRoute.set('NONE');
    line.directTrack.set(track.toFixed(0).padStart(3, '0'));
    line.distance.set(Math.min(distance, 9999).toFixed(0));

    const fuelToAlternate = destinationEfob !== null ? this.fuelToAlternate(distance, destinationEfob) : null;
    line.extra.set(
      destinationEfob !== null && fuelToAlternate !== null && finalFuel !== null
        ? this.formatFuel(destinationEfob - fuelToAlternate - finalFuel)
        : '---.-',
    );
  }

  /** Fuel in tonnes to fly to the alternate at the FCOM alternate cruise altitude (FL220 below 200 NM, else FL310) */
  private fuelToAlternate(distance: number, destinationEfob: number): number | null {
    const fmc = this.props.fmcService.master;
    const zfw = this.loadedFlightPlan?.performanceData.zeroFuelWeight.get() ?? null;
    if (zfw === null) {
      return null;
    }
    const cruiseLevel = distance < 200 ? 220 : 310;
    const step = Predictions.levelFlightStep(
      A380AircraftConfig,
      cruiseLevel * 100,
      distance,
      fmc.fmgc.getManagedCruiseSpeed(),
      fmc.fmgc.getManagedCruiseSpeedMach(),
      UnitType.POUND.convertFrom(zfw, UnitType.TONNE),
      UnitType.POUND.convertFrom(destinationEfob, UnitType.TONNE),
      0,
      0,
      fmc.fmgc.getTropoPause(),
    );
    return UnitType.TONNE.convertFrom(step.fuelBurned, UnitType.POUND);
  }

  private formatFuel(tonnes: number): string {
    const value = this.weightUnit.get() === 'T' ? tonnes : UnitType.POUND.convertFrom(tonnes, UnitType.TONNE) / 1000;
    return value.toFixed(1);
  }

  private async selectAsAlternate(ident: string | undefined): Promise<void> {
    await this.props.flightPlanInterface.setAlternate(ident, this.loadedFlightPlanIndex.get());
    if (this.loadedFlightPlanIndex.get() === FlightPlanIndex.Active) {
      this.props.fmcService.master.acInterface.updateFmsData();
    }
  }

  private async onOtherAlternateEntered(line: AlternateLine, ident: string | null): Promise<void> {
    if (!ident) {
      return;
    }
    const airport = await NavigationDatabaseService.activeDatabase.searchAirport(ident);
    if (!airport) {
      throw new FmsError(FmsErrorType.NotInDatabase);
    }
    line.ident.set(airport.ident);
    line.location = airport.location;
    this.update();
  }

  private otherAlternateMenu(line: AlternateLine): Subscribable<ButtonMenuItem[]> {
    const menu = line.ident.map((ident): ButtonMenuItem[] => [
      { label: 'SELECT AS ALTN', action: () => this.selectAsAlternate(ident ?? undefined) },
      { label: 'DATA AIRPORT', action: () => this.props.mfd.uiService.navigateTo(`fms/data/airport/arpt/${ident}`) },
      {
        label: 'RTE SELECTION',
        action: () =>
          this.props.mfd.uiService.navigateTo(
            `fms/${this.props.mfd.uiService.activeUri.get().category}/${routeSelectionPage}/${alternateRouteSelectionUriExtra}/${showReturnButtonUriExtra}`,
          ),
      },
    ]);
    this.lineSubscriptions.push(menu);
    return menu;
  }

  private renderData(line: AlternateLine): VNode {
    return (
      <>
        <span class="mfd-value bigger mfd-alternate-cell co-rte">{line.companyRoute}</span>
        <span class="mfd-alternate-cell trk">
          <span class="mfd-value bigger">{line.directTrack}</span>
          <span class="mfd-label-unit mfd-unit-trailing">°</span>
        </span>
        <span class="mfd-alternate-cell dist">
          <span class="mfd-value bigger">{line.distance}</span>
          <span class="mfd-label-unit mfd-unit-trailing">NM</span>
        </span>
        <span class="mfd-alternate-cell extra">
          <span class="mfd-value bigger">{line.extra}</span>
          <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnit}</span>
        </span>
      </>
    );
  }

  /** A database alternate (P 10): the airport ident menu gives SELECT AS ALTN and DATA AIRPORT */
  private renderDatabaseLine(line: AlternateLine, index: number): VNode {
    const label = line.ident.map((it) => it ?? '');
    const menu = line.ident.map((ident): ButtonMenuItem[] => [
      { label: 'SELECT AS ALTN', action: () => this.selectAsAlternate(ident ?? undefined) },
      { label: 'DATA AIRPORT', action: () => this.props.mfd.uiService.navigateTo(`fms/data/airport/arpt/${ident}`) },
    ]);
    this.lineSubscriptions.push(line.visible, line.entryVisible, label, menu);
    return (
      <div class="mfd-alternate-line" style={{ visibility: line.visible }}>
        <Button
          label={label}
          onClick={() => {}}
          menuItems={menu}
          idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_databaseAltn${index}`}
          buttonStyle="min-width: 116px; padding: 9px 2px 5px 2px; white-space: nowrap;"
        />
        {this.renderData(line)}
      </div>
    );
  }

  private renderOtherLine(line: AlternateLine, index: number): VNode {
    const label = line.ident.map((it) => it ?? '');
    this.lineSubscriptions.push(line.visible, line.entryVisible, label);
    return (
      <div class="mfd-alternate-other-slot">
        <div class="mfd-alternate-line" style={{ visibility: line.visible }}>
          <Button
            label={label}
            onClick={() => {}}
            menuItems={this.otherAlternateMenu(line)}
            idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_otherAltn${index}`}
            buttonStyle="min-width: 116px; padding: 9px 2px 5px 2px; white-space: nowrap;"
          />
          {this.renderData(line)}
        </div>
        <div class="mfd-alternate-entry" style={{ visibility: line.entryVisible }}>
          <InputField<string>
            dataEntryFormat={new AirportFormat()}
            value={Subject.create<string | null>(null)}
            onModified={(v) => this.onOtherAlternateEntered(line, v)}
            containerStyle="width: 109px;"
            alignText="center"
            errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
            hEventConsumer={this.props.mfd.hEventConsumer}
            interactionMode={this.props.mfd.interactionMode}
          />
        </div>
      </div>
    );
  }

  public destroy(): void {
    for (const s of this.lineSubscriptions) {
      s.destroy();
    }
    this.selectedLine.visible.destroy();
    this.selectedLine.entryVisible.destroy();
    super.destroy();
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        <div class="mfd-page-container" style="position: relative;">
          <div class="mfd-alternate-title">
            <span class="mfd-label">DATA FROM</span>
            <span class="mfd-value bigger" style="margin: 0 10px;">
              {this.destinationIdent}
            </span>
            <span class="mfd-label">TO ALTN</span>
          </div>
          <div class="mfd-alternate-header">
            <span class="mfd-label co-rte">CO RTE</span>
            <span class="mfd-label trk">DIR TRK</span>
            <span class="mfd-label dist">DIST</span>
            <span class="mfd-label extra">EXTRA</span>
          </div>
          <div class="mfd-alternate-box">
            <span class="mfd-label mfd-alternate-box-title">SELECTED</span>
            <div class="mfd-alternate-line" style={{ visibility: this.selectedLine.visible }}>
              <span class="mfd-value bigger mfd-alternate-ident">{this.selectedLine.ident}</span>
              {this.renderData(this.selectedLine)}
            </div>
          </div>
          <div class="mfd-alternate-box database">
            <span class="mfd-label mfd-alternate-box-title">DATABASE</span>
            <div class="mfd-alternate-line">
              <Button
                label="NO ALTN"
                onClick={() => this.selectAsAlternate(undefined)}
                buttonStyle="min-width: 116px; padding: 9px 2px 5px 2px; white-space: nowrap;"
              />
              <span class="mfd-alternate-cell no-altn-extra">
                <span class="mfd-value bigger">{this.noAlternateExtra}</span>
                <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnit}</span>
              </span>
            </div>
            {this.databaseLines.map((line, i) => this.renderDatabaseLine(line, i))}
          </div>
          <div class="mfd-alternate-box other">
            <span class="mfd-label mfd-alternate-box-title">OTHER ALTN</span>
            {this.otherLines.map((line, i) => this.renderOtherLine(line, i))}
          </div>
          <div class="mfd-fcom-overlay">
            {fcomAt(
              795,
              0,
              <Button
                label="RETURN"
                onClick={() => this.props.mfd.uiService.navigateTo('back')}
                buttonStyle="min-width: 130px;"
              />,
            )}
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
