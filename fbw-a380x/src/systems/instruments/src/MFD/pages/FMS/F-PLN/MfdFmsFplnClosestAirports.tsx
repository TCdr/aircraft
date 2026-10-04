// Copyright (c) 2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { ClockEvents, FSComponent, Subject, Subscribable, Subscription, UnitType, VNode } from '@microsoft/msfs-sdk';
import { isNearbyAirportFacility, MagVar, NXDataStore } from '@flybywiresim/fbw-sdk';
import { bearingTo, Coordinates, distanceTo } from 'msfs-geo';
import { A380AircraftConfig } from '@fmgc/flightplanning/A380AircraftConfig';
import { NavigationDatabaseService } from '@fmgc/flightplanning/NavigationDatabaseService';
import { Predictions } from '@fmgc/guidance/vnav/Predictions';
import { FmsError, FmsErrorType } from '@fmgc/FmsError';
import { FmgcFlightPhase } from '@shared/flightphase';
import { A380AltitudeUtils } from '@shared/OperatingAltitudes';

import { AbstractMfdPageProps } from '../../../MFD';
import { FmsPage } from '../../common/FmsPage';
import { Footer } from '../../common/Footer';
import { Button, ButtonMenuItem } from '../../../../MsfsAvionicsCommon/UiWidgets/Button';
import { InputField } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { AirportFormat, TripWindFormat } from '../../common/DataEntryFormats';

import { fcomAt } from '../../common/FcomLayout';
import './MfdFmsFplnClosestAirports.scss';

interface MfdFmsFplnClosestAirportsProps extends AbstractMfdPageProps {}

/** FCOM: the four closest airports, and up to three other airports entered by the flight crew */
const NUM_CLOSEST_AIRPORTS = 4;

const NUM_OTHER_AIRPORTS = 3;

/** One airport line: ident, distance, bearing, time and EFOB from the present position, and the effective wind */
class AirportLine {
  readonly ident = Subject.create<string | null>(null);

  location: Coordinates | null = null;

  readonly distance = Subject.create('');

  readonly bearing = Subject.create('');

  readonly time = Subject.create('');

  readonly efob = Subject.create('');

  /** Effective wind entered by the flight crew, in knots, positive = tail wind */
  readonly pilotEffectiveWind = Subject.create<number | null>(null);

  /** Effective wind used for the predictions: the flight crew entry, or the default */
  readonly effectiveWind = Subject.create<number | null>(null);

  readonly effectiveWindEntered = this.pilotEffectiveWind.map((it) => it !== null);

  readonly visible = this.ident.map((it) => (it ? 'visible' : 'hidden'));

  clear(): void {
    this.ident.set(null);
    this.location = null;
    this.pilotEffectiveWind.set(null);
    this.effectiveWind.set(null);
    this.distance.set('');
    this.bearing.set('');
    this.time.set('');
    this.efob.set('');
  }
}

/**
 * CLOSEST AIRPORTS page (A380 FCOM DSC-22-FMS-20-30 "CLOSEST AIRPORTS PAGE"): the four closest airports, ranked by
 * distance from the aircraft present position, and up to three airports entered by the flight crew, with the direct
 * distance, bearing, time and EFOB. Time and EFOB are only computed in the cruise phase.
 *
 * Simplified: the FCOM predictions assume a flight at the CRZ FL down to the ground; here the whole great-circle
 * distance is flown level at the CRZ FL (no descent segment). The default effective wind is the INIT trip wind.
 */
export class MfdFmsFplnClosestAirports extends FmsPage<MfdFmsFplnClosestAirportsProps> {
  private readonly closestLines = Array.from({ length: NUM_CLOSEST_AIRPORTS }, () => new AirportLine());

  private readonly otherLines = Array.from({ length: NUM_OTHER_AIRPORTS }, () => new AirportLine());

  private readonly otherEntryIndex = Subject.create(0);

  private readonly otherEntryVisibility = this.otherEntryIndex.map((i) =>
    i < NUM_OTHER_AIRPORTS ? 'visible' : 'hidden',
  );

  private readonly weightUnit = NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').map((metric) =>
    metric ? 'T' : 'KLB',
  );

  private readonly lineSubscriptions: Subscription[] = [];

  protected onNewData(): void {
    // Data refreshed every second
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
      this.otherEntryVisibility,
    );
    this.update();
  }

  private update(): void {
    const fmc = this.props.fmcService.master;
    const ppos = fmc.navigation.getPpos();

    const nearby = ppos
      ? fmc
          .getNearbyAirports()
          .filter(isNearbyAirportFacility)
          .map((airport) => ({ airport, distance: distanceTo(ppos, airport.location) }))
          .sort((a, b) => a.distance - b.distance)
      : [];
    this.closestLines.forEach((line, i) => {
      const entry = nearby[i];
      if (!entry) {
        line.clear();
        return;
      }
      if (line.ident.get() !== entry.airport.ident) {
        line.pilotEffectiveWind.set(null);
      }
      line.ident.set(entry.airport.ident);
      line.location = entry.airport.location;
    });

    for (const line of [...this.closestLines, ...this.otherLines]) {
      this.updateLine(line, ppos);
    }
  }

  private updateLine(line: AirportLine, ppos: Coordinates | null): void {
    if (!line.location || !ppos) {
      line.distance.set('');
      line.bearing.set('');
      line.time.set('');
      line.efob.set('');
      return;
    }

    line.effectiveWind.set(this.effectiveWind(line));
    const distance = distanceTo(ppos, line.location);
    const magVar = MagVar.get(ppos);
    const trueBearing = bearingTo(ppos, line.location);
    const bearing = magVar !== null ? MagVar.trueToMagnetic(trueBearing, magVar) : trueBearing;
    line.distance.set(Math.min(distance, 9999).toFixed(0));
    line.bearing.set(bearing.toFixed(0).padStart(3, '0'));

    const prediction = this.cruisePrediction(distance, this.effectiveWind(line));
    if (prediction) {
      line.time.set(this.props.fmcService.master.timeKeeper.formatEta(prediction.seconds));
      const efob =
        this.weightUnit.get() === 'T'
          ? prediction.efobTonnes
          : UnitType.POUND.convertFrom(prediction.efobTonnes, UnitType.TONNE) / 1000;
      line.efob.set(efob.toFixed(1));
    } else {
      line.time.set('--:--');
      line.efob.set('---.-');
    }
  }

  /** Effective wind in knots, positive = tail wind: the flight crew entry, or the INIT trip wind by default */
  private effectiveWind(line: AirportLine): number {
    return (
      line.pilotEffectiveWind.get() ?? this.props.flightPlanInterface.active?.performanceData.pilotTripWind.get() ?? 0
    );
  }

  /** FCOM: time and EFOB are only computed in the CRZ phase */
  private cruisePrediction(distance: number, tailWind: number): { seconds: number; efobTonnes: number } | null {
    const fmc = this.props.fmcService.master;
    const plan = this.props.flightPlanInterface.active;
    const cruiseLevel = plan?.performanceData.cruiseFlightLevel.get() ?? null;
    const zfw = plan?.performanceData.zeroFuelWeight.get() ?? null;
    const fob = fmc.fmgc.getFOB();
    const sat = fmc.getStaticAirTemperature();
    if (
      this.activeFlightPhase.get() !== FmgcFlightPhase.Cruise ||
      cruiseLevel === null ||
      zfw === null ||
      fob === null ||
      sat === null
    ) {
      return null;
    }

    const isaDev = sat - A380AltitudeUtils.getIsaTemp(cruiseLevel * 100);
    const step = Predictions.levelFlightStep(
      A380AircraftConfig,
      cruiseLevel * 100,
      distance,
      fmc.fmgc.getManagedCruiseSpeed(),
      fmc.fmgc.getManagedCruiseSpeedMach(),
      UnitType.POUND.convertFrom(zfw, UnitType.TONNE),
      UnitType.POUND.convertFrom(fob, UnitType.TONNE),
      -tailWind,
      isaDev,
      fmc.fmgc.getTropoPause(),
    );
    return {
      seconds: step.timeElapsed,
      efobTonnes: Math.max(0, fob - UnitType.TONNE.convertFrom(step.fuelBurned, UnitType.POUND)),
    };
  }

  private async onOtherAirportEntered(ident: string | null): Promise<void> {
    const index = this.otherEntryIndex.get();
    if (!ident || index >= NUM_OTHER_AIRPORTS) {
      return;
    }
    const airport = await NavigationDatabaseService.activeDatabase.searchAirport(ident);
    if (!airport) {
      throw new FmsError(FmsErrorType.NotInDatabase);
    }
    const line = this.otherLines[index];
    line.ident.set(airport.ident);
    line.location = airport.location;
    this.otherEntryIndex.set(index + 1);
    this.updateLine(line, this.props.fmcService.master.navigation.getPpos());
  }

  private deleteOtherAirport(index: number): void {
    // The next airports move up one line
    for (let i = index; i < NUM_OTHER_AIRPORTS - 1; i++) {
      const next = this.otherLines[i + 1];
      this.otherLines[i].ident.set(next.ident.get());
      this.otherLines[i].location = next.location;
      this.otherLines[i].pilotEffectiveWind.set(next.pilotEffectiveWind.get());
    }
    this.otherLines[NUM_OTHER_AIRPORTS - 1].clear();
    this.otherEntryIndex.set(Math.max(0, this.otherEntryIndex.get() - 1));
    this.update();
  }

  private airportMenu(line: AirportLine, onDelete?: () => void): Subscribable<ButtonMenuItem[]> {
    const menu = line.ident.map((ident) => {
      const items: ButtonMenuItem[] = [
        {
          label: 'DATA AIRPORT',
          action: () => this.props.mfd.uiService.navigateTo(`fms/data/airport/arpt/${ident}`),
        },
      ];
      if (onDelete) {
        items.push({ label: 'DELETE', action: onDelete });
      }
      return items;
    });
    this.lineSubscriptions.push(menu);
    return menu;
  }

  private renderLine(line: AirportLine, menu: Subscribable<ButtonMenuItem[]>, id: string): VNode {
    const label = line.ident.map((it) => it ?? '');
    this.lineSubscriptions.push(line.effectiveWindEntered, line.visible, label);
    return (
      <div class="mfd-closest-airports-line" style={{ visibility: line.visible }}>
        <Button
          label={label}
          onClick={() => {}}
          menuItems={menu}
          idPrefix={`${this.props.mfd.uiService.captOrFo}_MFD_closestArpt_${id}`}
          buttonStyle="min-width: 94px; padding: 9px 2px 5px 2px; white-space: nowrap;"
        />
        <span class="mfd-closest-airports-cell dist">
          <span class="mfd-value bigger">{line.distance}</span>
          <span class="mfd-label-unit mfd-unit-trailing">NM</span>
        </span>
        <span class="mfd-closest-airports-cell brg">
          <span class="mfd-value bigger">{line.bearing}</span>
          <span class="mfd-label-unit mfd-unit-trailing">°</span>
        </span>
        <span class="mfd-closest-airports-cell time">
          <span class="mfd-value bigger">{line.time}</span>
        </span>
        <span class="mfd-closest-airports-cell efob">
          <span class="mfd-value bigger">{line.efob}</span>
          <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnit}</span>
        </span>
        <InputField<number, number, false>
          dataEntryFormat={new TripWindFormat()}
          readonlyValue={line.effectiveWind}
          dataHandlerDuringValidation={async (v) => {
            line.pilotEffectiveWind.set(v);
            this.updateLine(line, this.props.fmcService.master.navigation.getPpos());
          }}
          enteredByPilot={line.effectiveWindEntered}
          containerStyle="width: 101px;"
          alignText="center"
          errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
          hEventConsumer={this.props.mfd.hEventConsumer}
          interactionMode={this.props.mfd.interactionMode}
        />
      </div>
    );
  }

  public destroy(): void {
    for (const s of this.lineSubscriptions) {
      s.destroy();
    }
    super.destroy();
  }

  render(): VNode {
    return (
      <>
        {super.render()}
        <div class="mfd-page-container" style="position: relative;">
          <span class="mfd-label mfd-closest-airports-title">DATA FROM P.POS TO ARPTs</span>
          <div class="mfd-closest-airports-header">
            <span class="mfd-label dist">DIST</span>
            <span class="mfd-label brg">BRG</span>
            <span class="mfd-label time">UTC</span>
            <span class="mfd-label efob">EFOB</span>
            <span class="mfd-label wind">EFF WIND</span>
          </div>
          <div class="mfd-closest-airports-box">
            <span class="mfd-label mfd-closest-airports-box-title">CLOSEST ARPTs</span>
            {this.closestLines.map((line, i) => this.renderLine(line, this.airportMenu(line), `closest${i}`))}
          </div>
          <div class="mfd-closest-airports-box other">
            <span class="mfd-label mfd-closest-airports-box-title">OTHER ARPT</span>
            {this.otherLines.map((line, i) =>
              this.renderLine(
                line,
                this.airportMenu(line, () => this.deleteOtherAirport(i)),
                `other${i}`,
              ),
            )}
            <div class="mfd-closest-airports-entry" style={{ visibility: this.otherEntryVisibility }}>
              <InputField<string>
                dataEntryFormat={new AirportFormat()}
                value={Subject.create<string | null>(null)}
                onModified={(v) => this.onOtherAirportEntered(v)}
                containerStyle="width: 101px;"
                alignText="center"
                errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                hEventConsumer={this.props.mfd.hEventConsumer}
                interactionMode={this.props.mfd.interactionMode}
              />
            </div>
          </div>
          <div class="mfd-fcom-overlay">
            {fcomAt(
              789,
              4,
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
