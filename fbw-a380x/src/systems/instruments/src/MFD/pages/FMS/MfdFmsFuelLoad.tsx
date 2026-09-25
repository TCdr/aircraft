// Copyright (c) 2024-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0
import {
  ClockEvents,
  FSComponent,
  MappedSubject,
  NumberFormatter,
  NumberUnitInterface,
  NumberUnitSubject,
  SimpleUnit,
  Subject,
  Unit,
  UnitFamily,
  UnitType,
  VNode,
} from '@microsoft/msfs-sdk';

import './MfdFmsFuelLoad.scss';
import { AbstractMfdPageProps } from '../../MFD';
import { Footer } from '../common/Footer';

import { InputField } from '../../../MsfsAvionicsCommon/UiWidgets/InputField';
import {
  CostIndexFormat,
  PaxNbrFormat,
  PercentageFormat,
  TimeHHMMFormat,
  WeightFormat,
} from '../common/DataEntryFormats';
import { Button } from '../../../MsfsAvionicsCommon/UiWidgets/Button';
import {
  maxAltnFuel,
  maxBlockFuel,
  maxFinalFuel,
  maxJtsnGw,
  maxMinDestFuel,
  maxRteRsvFuelPerc,
  maxTaxiFuel,
  maxZfw,
  maxZfwCg,
  minZfw,
  minZfwCg,
} from '@shared/PerformanceConstants';
import { FmsPage } from '../common/FmsPage';
import { fcomAt, fcomCentre, fcomLine, fcomRight } from '../common/FcomLayout';
import { NXSystemMessages } from '../../shared/NXSystemMessages';
import { MfdSimvars } from '../../shared/MFDSimvarPublisher';
import { FmgcFlightPhase } from '@shared/flightphase';
import { AirlineModifiableInformation } from '@shared/AirlineModifiableInformation';
import { getEtaFromUtcOrPresent, hhmmFormatter } from '../../shared/utils';
import { CostIndexMode } from '../../FMC/fmgc';
import { NXDataStore } from '@flybywiresim/fbw-sdk';
import { FlightPlanIndex } from '@fmgc/flightplanning/FlightPlanManager';
import { FlightPlanChangeNotifier } from '@fmgc/flightplanning/sync/FlightPlanChangeNotifier';

/** The flight plan performance data holds the fuel weights in tonnes (FIXME it should be in kg) */
function kilogramsToPerfPlanTonnes(kilograms: number | null): number | null {
  return kilograms !== null ? kilograms / 1000 : null;
}

interface MfdFmsFuelLoadProps extends AbstractMfdPageProps {}

export class MfdFmsFuelLoad extends FmsPage<MfdFmsFuelLoadProps> {
  private readonly weightUnit = NXDataStore.getSetting('CONFIG_USING_METRIC_UNIT').map((v) =>
    v ? UnitType.KILOGRAM : UnitType.POUND,
  );

  private readonly weightFormatter = NumberFormatter.create({
    nanString: '---.-',
    precision: 0.1,
  });

  private readonly grossWeight = NumberUnitSubject.create(UnitType.KILOGRAM.createNumber(NaN));
  private readonly grossWeightText = this.createWeightSubscribable(this.grossWeight);

  private readonly flightPlanChangeNotifier = new FlightPlanChangeNotifier(this.props.bus);

  private readonly destEfobAmber = MappedSubject.create(
    ([destEfobBelowM, loadedFpIndex]) => destEfobBelowM && loadedFpIndex === FlightPlanIndex.Active,
    this.props.fmcService.master.fmgc.data.destEfobBelowMinInActive,
    this.loadedFlightPlanIndex,
  );

  private readonly mandatoryAndActiveFpln = this.loadedFlightPlanIndex.map(
    (it) => it === FlightPlanIndex.Active || it === FlightPlanIndex.Temporary,
  );

  private readonly centerOfGravity = Subject.create<number | null>(null);
  private readonly centerOfGravityText = this.centerOfGravity.map((it) => (it ? it.toFixed(1) : '--.-'));

  private readonly fuelOnBoard = NumberUnitSubject.create(UnitType.KILOGRAM.createNumber(NaN));
  private readonly fuelOnBoardText = this.createWeightSubscribable(this.fuelOnBoard);

  /** Zero Fuel Weight in kg, or null if no value. */
  private readonly zeroFuelWeight = Subject.create<number | null>(null);

  private readonly zeroFuelWeightCenterOfGravity = Subject.create<number | null>(null);

  /** Block fuel weight in kg, or null if no value. */
  private readonly blockFuel = Subject.create<number | null>(null);

  /** Taxi fuel weight in kg, or null if no value. */
  private readonly taxiFuel = Subject.create<number | null>(null);
  private readonly taxiFuelIsPilotEntered = Subject.create<boolean>(false);

  private readonly routeReserveFuelIsPilotEntered = Subject.create<boolean>(false);
  private readonly routeReserveFuelPercentage = Subject.create<number | null>(null);
  private readonly routeReserveFuelPercentageIsPilotEntered = Subject.create<boolean>(false);

  private readonly routeReserveFuel = Subject.create<number | null>(null);

  private readonly alternateFuel = Subject.create<number | null>(null);
  private readonly alternateFuelIsPilotEntered = Subject.create<boolean>(false);

  private readonly finalFuel = Subject.create<number | null>(null);
  private readonly finalFuelIsPilotEntered = Subject.create<boolean>(false);

  private readonly finalFuelTime = Subject.create<number | null>(null);
  private readonly finalFuelTimeIsPilotEntered = Subject.create<boolean>(false);

  private readonly paxNumber = Subject.create<number | null>(null);

  private readonly minimumFuelAtDestination = Subject.create<number | null>(null);
  private readonly minimumFuelAtDestinationIsPilotEntered = Subject.create<boolean>(false);

  private readonly fuelPlanningIsDisabled = Subject.create<boolean>(true);

  /** The minimum BLOCK fuel computed by the fuel planning, displayed in yellow until confirmed (FCOM P 179) */
  private readonly fuelPlanningBlockWeight = NumberUnitSubject.create(UnitType.KILOGRAM.createNumber(NaN));

  private readonly fuelPlanningBlockWeightText = this.createWeightSubscribable(this.fuelPlanningBlockWeight);

  private readonly fuelPlanningComputed = Subject.create(false);

  private readonly fuelPlanningNotComputed = this.fuelPlanningComputed.map((v) => !v);

  private readonly fuelPlanningBlockVisibility = this.fuelPlanningComputed.map((v) => (v ? 'inherit' : 'hidden'));

  private readonly destinationAlternateTimeHeader = this.activeFlightPhase.map((v) =>
    v === FmgcFlightPhase.Preflight ? 'TIME' : 'UTC',
  );
  private readonly tripFuelWeight = NumberUnitSubject.create(UnitType.KILOGRAM.createNumber(NaN));
  private readonly tripFuelWeightText = this.createWeightSubscribable(this.tripFuelWeight);

  private readonly tripFuelTime = Subject.create('--:--');

  private readonly costIndex = Subject.create<number | null>(null);

  private readonly jettisonGrossWeight = Subject.create(null);
  private readonly takeoffWeight = NumberUnitSubject.create(UnitType.KILOGRAM.createNumber(NaN));
  private readonly takeoffWeightText = this.createWeightSubscribable(this.takeoffWeight);
  private readonly landingWeight = NumberUnitSubject.create(UnitType.KILOGRAM.createNumber(NaN));
  private readonly landingWeightText = this.createWeightSubscribable(this.landingWeight);

  private readonly destIcao = Subject.create<string | null>(null);

  private readonly destIcaoDisplay = this.destIcao.map((v) => (v ? v : 'NONE'));

  private readonly destEta = Subject.create<string>('--:--');
  private readonly destEfob = NumberUnitSubject.create(UnitType.KILOGRAM.createNumber(NaN));
  private readonly destEfobText = this.createWeightSubscribable(this.destEfob);

  private readonly altnIcao = Subject.create<string>('----');

  private readonly altnEta = Subject.create<string>('--:--');

  private readonly altnEfob = NumberUnitSubject.create(UnitType.KILOGRAM.createNumber(NaN));
  private readonly altnEfobText = this.createWeightSubscribable(this.altnEfob);

  private readonly extraFuelWeight = NumberUnitSubject.create(UnitType.KILOGRAM.createNumber(NaN));
  private readonly extraFuelWeightText = this.createWeightSubscribable(this.extraFuelWeight);

  private readonly extraFuelTime = Subject.create<number | null>(null);
  private readonly extraFuelTimeText = this.extraFuelTime.map((it) => hhmmFormatter(it ?? NaN));

  private readonly blockLineRef = FSComponent.createRef<HTMLDivElement>();

  private readonly taxiAndRouteRsvDisabled = MappedSubject.create(
    ([flightPhase, fpIndex]) =>
      flightPhase >= FmgcFlightPhase.Takeoff &&
      this.props.flightPlanInterface.get(fpIndex).isActiveOrCopiedFromActive(),
    this.activeFlightPhase,
    this.loadedFlightPlanIndex,
  );

  private readonly alternateExists = Subject.create(true);
  private readonly alternateFuelDisabled = this.alternateExists.map((v) => !v);
  private readonly jettisonGrossWeightVisibility = this.mandatoryAndActiveFpln.map((isActive) =>
    isActive ? 'visible' : 'hidden',
  );

  private createWeightSubscribable(
    value: NumberUnitSubject<UnitFamily.Weight, SimpleUnit<UnitFamily.Weight>>,
  ): MappedSubject<
    [NumberUnitInterface<UnitFamily.Weight, SimpleUnit<UnitFamily.Weight>>, Unit<UnitFamily.Weight>],
    string
  > {
    return MappedSubject.create(
      ([value, weightUnit]) => this.weightFormatter(value.asUnit(weightUnit) / 1000),
      value,
      this.weightUnit,
    );
  }

  private readonly costIndexModeDisabled = MappedSubject.create(
    ([flightPhase, dest, fpIndex]) =>
      (this.props.flightPlanInterface.get(fpIndex).isActiveOrCopiedFromActive() &&
        flightPhase >= FmgcFlightPhase.Descent) ||
      !dest,
    this.activeFlightPhase,
    this.destIcao,
    this.loadedFlightPlanIndex,
  );

  private readonly costIndexDisabled = this.costIndexModeDisabled;

  protected onNewData() {
    // no op
  }
  private readonly weightUnitText = this.weightUnit.map((v) => (v === UnitType.KILOGRAM ? 'T' : 'KLB'));

  /** @inheritdoc */
  public override onAfterRender(node: VNode): void {
    super.onAfterRender(node);

    const sub = this.props.bus.getSubscriber<ClockEvents & MfdSimvars>();

    this.subs.push(
      sub
        .on('realTime')
        .atFrequency(1)
        .handle((_t) => {
          if (!this.props.fmcService.master || !this.loadedFlightPlan) {
            return;
          }

          this.loadFlightPlanPerformanceData();

          const loadedfpIndex = this.loadedFlightPlanIndex.get();
          this.updateFuelPlanning(loadedfpIndex);
          // FIXME: Move to main update loop once calculated by the predictions
          this.props.fmcService.master.acInterface.calculateFinalAndAlternateFuel(loadedfpIndex);
          this.props.fmcService.master.calculateTakeoffWeight(loadedfpIndex);
          const fp = this.props.flightPlanInterface.get(loadedfpIndex);
          this.alternateExists.set(fp.alternateDestinationAirport !== undefined);
          const pd = this.loadedFlightPlan!.performanceData;
          this.landingWeight.set(
            this.props.fmcService.master.getLandingWeight(loadedfpIndex) ?? NaN,
            UnitType.KILOGRAM,
          );
          this.takeoffWeight.set(
            this.props.fmcService.master.getTakeoffWeight(loadedfpIndex) ?? NaN,
            UnitType.KILOGRAM,
          );
          const rteRsv = this.props.fmcService.master.getRouteReserveFuel(loadedfpIndex);
          this.routeReserveFuel.set(rteRsv);
          // Calculate RTE RSV percentage
          if (pd.isRouteReserveFuelPercentagePilotEntered.get()) {
            this.routeReserveFuelPercentage.set(pd.routeReserveFuelPercentage.get());
          } else {
            let caclulatedRteRsvPercentage: number | null = null;
            // If route reserve is pilot entry, calculate new percentage.
            if (pd.isRouteReserveFuelPilotEntered.get()) {
              const trip = this.props.fmcService.master.getTripFuel(loadedfpIndex);
              if (trip !== null) {
                caclulatedRteRsvPercentage = ((pd.pilotRouteReserveFuel.get()! * 1000) / trip) * 100;
              }
            } else {
              caclulatedRteRsvPercentage = pd.routeReserveFuelPercentage.get();
            }
            this.routeReserveFuelPercentage.set(caclulatedRteRsvPercentage);
          }

          if (!this.props.fmcService.master.enginesWereStarted.get()) {
            this.grossWeight.set(NaN);
            this.centerOfGravity.set(null);
            this.fuelOnBoard.set(NaN);
          } else {
            // GW only displayed after engine start. Value received from FQMS, or falls back to ZFW + FOB
            this.grossWeight.set(
              this.props.fmcService.master.fmgc.getGrossWeightKg(loadedfpIndex) ?? NaN,
              UnitType.KILOGRAM,
            );

            // CG only displayed after engine start. Value received from FQMS, or falls back to value from WBBC
            this.centerOfGravity.set(this.props.fmcService.master.fmgc.getGrossWeightCg());

            // FOB only displayed after engine start. Value received from FQMS, or falls back to FOB stored at engine start + fuel used by FADEC
            this.fuelOnBoard.set(
              (this.props.fmcService.master.fmgc.getFOB(loadedfpIndex) ?? NaN) * 1000,
              UnitType.KILOGRAM,
            );
          }

          const tripFuel = this.props.fmcService.master.getTripFuel(loadedfpIndex) ?? NaN;
          this.tripFuelWeight.set(tripFuel);

          if (loadedfpIndex === FlightPlanIndex.Active) {
            // TODO SEC predictions
            const destPred = this.props.fmcService.master.guidanceController.vnavDriver.getDestinationPrediction();
            this.tripFuelTime.set(getEtaFromUtcOrPresent(destPred?.secondsFromPresent, true));
          }

          this.extraFuelWeight.set(this.props.fmcService.master.getExtraFuel(loadedfpIndex) ?? NaN);
          this.updateDestAndAltnPredictions();
        }),
    );

    if (this.props.fmcService.master) {
      this.subs.push(
        this.props.fmcService.master.enginesWereStarted.sub((val) => {
          if (this.blockLineRef.getOrDefault()) {
            this.blockLineRef.instance.style.visibility = val ? 'hidden' : 'visible';
          }
        }, true),
      );
    }

    this.subs.push(
      this.flightPlanChangeNotifier.flightPlanChanged.sub(() => {
        this.loadFlightPlanPerformanceData();
      }, true),
    );

    this.subs.push(
      this.weightUnit,
      this.mandatoryAndActiveFpln,
      this.grossWeightText,
      this.fuelOnBoardText,
      this.tripFuelWeightText,
      this.takeoffWeightText,
      this.landingWeightText,
      this.destEfobText,
      this.centerOfGravityText,
      this.fuelOnBoardText,
      this.destinationAlternateTimeHeader,
      this.tripFuelWeightText,
      this.altnEfobText,
      this.extraFuelWeightText,
      this.extraFuelTimeText,
      this.taxiAndRouteRsvDisabled,
      this.costIndexDisabled,
      this.costIndexModeDisabled,
      this.jettisonGrossWeightVisibility,
      this.destEfobAmber,
    );
  }

  public destroy(): void {
    this.flightPlanChangeNotifier.destroy();

    super.destroy();
  }

  /**
   * FUEL PLANNING button (A380 FCOM DSC-22-FMS-20-30 P 179): the computation is possible before engine start, with a
   * flight plan and a cruise flight level, the ZFW and ZFWCG entered and no BLOCK entered by the flight crew. Once
   * computed, the button confirms the BLOCK.
   */
  private updateFuelPlanning(loadedFlightPlanIndex: number): void {
    const fmc = this.props.fmcService.master;
    const pd = this.loadedFlightPlan?.performanceData;
    if (!fmc || !pd) {
      return;
    }
    const computedBlock = fmc.fuelPlanningBlockFuel.get();
    this.fuelPlanningComputed.set(computedBlock !== null);
    this.fuelPlanningBlockWeight.set(computedBlock !== null ? computedBlock * 1000 : NaN, UnitType.KILOGRAM);
    this.fuelPlanningIsDisabled.set(
      loadedFlightPlanIndex !== FlightPlanIndex.Active ||
        fmc.fuelPlanningInProgress.get() ||
        (computedBlock === null &&
          (fmc.enginesWereStarted.get() ||
            !fmc.hasActiveFlightPlan.get() ||
            pd.cruiseFlightLevel.get() === null ||
            pd.zeroFuelWeight.get() === null ||
            pd.zeroFuelWeightCenterOfGravity.get() === null ||
            pd.blockFuel.get() !== null)),
    );
  }

  private loadFlightPlanPerformanceData(): void {
    const pd = this.loadedFlightPlan?.performanceData;

    const pdZfw = pd?.zeroFuelWeight.get();
    if (pdZfw !== undefined && pdZfw !== null) {
      this.zeroFuelWeight.set(pdZfw * 1000);
    } else {
      this.zeroFuelWeight.set(null);
    }
    this.zeroFuelWeightCenterOfGravity.set(pd?.zeroFuelWeightCenterOfGravity.get() ?? null);

    const pdBlockFuel = pd?.blockFuel.get();
    if (pdBlockFuel !== undefined && pdBlockFuel !== null) {
      this.blockFuel.set(pdBlockFuel * 1000);
    } else {
      this.blockFuel.set(null);
    }
    const pdTaxiFuel = pd?.taxiFuel.get();
    if (pdTaxiFuel !== undefined && pdTaxiFuel !== null && !this.taxiAndRouteRsvDisabled.get()) {
      this.taxiFuel.set(pdTaxiFuel * 1000);
    } else {
      this.taxiFuel.set(null);
    }
    this.taxiFuelIsPilotEntered.set(pd?.taxiFuelIsPilotEntered.get() ?? false);
    this.routeReserveFuelIsPilotEntered.set(pd?.isRouteReserveFuelPilotEntered.get() ?? false);
    this.routeReserveFuelPercentageIsPilotEntered.set(pd?.isRouteReserveFuelPercentagePilotEntered.get() ?? false);
    const pdAlternateFuel = pd?.alternateFuel.get();
    if (pdAlternateFuel !== undefined && pdAlternateFuel !== null) {
      this.alternateFuel.set(pdAlternateFuel * 1000);
    } else {
      this.alternateFuel.set(null);
    }
    this.alternateFuelIsPilotEntered.set(pd?.isAlternateFuelPilotEntered.get() ?? false);
    this.finalFuelTime.set(pd?.finalHoldingTime.get() ?? null);
    this.finalFuelIsPilotEntered.set(pd?.isFinalHoldingFuelPilotEntered.get() ?? false);
    this.finalFuelTimeIsPilotEntered.set(pd?.isFinalHoldingTimePilotEntered.get() ?? false);
    const pdFinalFuel = pd?.finalHoldingFuel.get();
    if (pdFinalFuel !== undefined && pdFinalFuel !== null) {
      this.finalFuel.set(pdFinalFuel * 1000);
    } else {
      this.finalFuel.set(null);
    }
    const pdMinDestFuel = pd?.minimumDestinationFuelOnBoard.get();
    if (pdMinDestFuel !== undefined && pdMinDestFuel !== null) {
      this.minimumFuelAtDestination.set(pdMinDestFuel * 1000);
    } else {
      this.minimumFuelAtDestination.set(null);
    }
    this.minimumFuelAtDestinationIsPilotEntered.set(pd?.isMinimumDestinationFuelOnBoardPilotEntered.get() ?? false);
    this.paxNumber.set(pd?.paxNumber ? pd.paxNumber.get() : null);
    this.costIndex.set(pd?.costIndex ? pd.costIndex.get() : null);
  }

  updateDestAndAltnPredictions() {
    const hasFp = this.loadedFlightPlan !== null;
    const fpIndex = hasFp ? this.loadedFlightPlanIndex.get() : null;
    this.destIcao.set(this.loadedFlightPlan?.destinationAirport?.ident ?? null);

    // TODO SEC predictions
    const destPred =
      hasFp && (fpIndex === FlightPlanIndex.Active || fpIndex === FlightPlanIndex.Temporary)
        ? this.props.fmcService.master.guidanceController.vnavDriver.getDestinationPrediction()
        : null;
    // TODO Should display ETA if EET present
    this.destEta.set(
      getEtaFromUtcOrPresent(destPred?.secondsFromPresent, this.activeFlightPhase.get() == FmgcFlightPhase.Preflight),
    );
    const destEfob = hasFp ? this.props.fmcService.master.fmgc.getDestEFOB(true, fpIndex!) : null;
    if (destEfob !== null) {
      this.destEfob.set(destEfob * 1000, UnitType.KILOGRAM);
    } else {
      this.destEfob.set(NaN);
    }

    const fp = hasFp ? this.props.flightPlanInterface.get(fpIndex!) : null;
    this.altnIcao.set(fp?.alternateDestinationAirport?.ident ?? 'NONE');
    this.altnEta.set('--:--');
    if (fp) {
      this.altnEfob.set(this.props.fmcService.master.fmgc.getAltEFOB(fpIndex!) ?? NaN, UnitType.KILOGRAM);
    } else {
      this.altnEfob.set(NaN);
    }
    this.altnEfob.set(hasFp ? this.props.fmcService.master.fmgc.getAltEFOB(fpIndex!) ?? NaN : NaN, UnitType.KILOGRAM);
  }

  render(): VNode {
    return (
      this.props.fmcService.master && (
        <>
          {super.render()}
          {/* begin page content */}
          <div class="mfd-page-container" style="position: relative;">
            {/* Positions from the FCOM figure (DSC-22-FMS-20-30 P 174), page container coordinates */}
            <div class="mfd-fcom-canvas">
              {fcomRight(24, 96, <span class="mfd-label">GW</span>)}
              {fcomRight(24, 286, [
                <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.grossWeightText}</span>,
                <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>,
              ])}
              {fcomRight(24, 370, <span class="mfd-label">CG</span>)}
              {fcomRight(24, 490, [
                <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.centerOfGravityText}</span>,
                <span class="mfd-label-unit mfd-unit-trailing">%</span>,
              ])}
              {fcomRight(24, 591, <span class="mfd-label">FOB</span>)}
              {fcomRight(24, 761, [
                <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.fuelOnBoardText}</span>,
                <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>,
              ])}

              {fcomRight(85, 181, <span class="mfd-label">ZFW</span>)}
              {fcomAt(
                85,
                194,
                <InputField<number, number, false>
                  dataEntryFormat={new WeightFormat(Subject.create(minZfw), Subject.create(maxZfw), this.weightUnit)}
                  dataHandlerDuringValidation={async (v) => {
                    this.props.flightPlanInterface.setPerformanceData(
                      'zeroFuelWeight',
                      kilogramsToPerfPlanTonnes(v),
                      this.loadedFlightPlanIndex.get(),
                    );
                  }}
                  readonlyValue={this.zeroFuelWeight}
                  mandatory={this.mandatoryAndActiveFpln}
                  canBeCleared={Subject.create(false)}
                  alignText="flex-end"
                  containerStyle="width: 153px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomRight(85, 469, <span class="mfd-label">ZFWCG</span>)}
              {fcomAt(
                85,
                481,
                <InputField<number, number, false>
                  dataEntryFormat={new PercentageFormat(Subject.create(minZfwCg), Subject.create(maxZfwCg))}
                  dataHandlerDuringValidation={async (v) =>
                    this.props.flightPlanInterface.setPerformanceData(
                      'zeroFuelWeightCenterOfGravity',
                      v,
                      this.loadedFlightPlanIndex.get(),
                    )
                  }
                  readonlyValue={this.zeroFuelWeightCenterOfGravity}
                  mandatory={this.mandatoryAndActiveFpln}
                  canBeCleared={Subject.create(false)}
                  alignText="center"
                  containerStyle="width: 104px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}

              <div ref={this.blockLineRef}>
                {fcomRight(148, 181, <span class="mfd-label">BLOCK</span>)}
                {fcomAt(
                  148,
                  194,
                  <InputField<number, number, false>
                    dataEntryFormat={new WeightFormat(Subject.create(0), Subject.create(maxBlockFuel), this.weightUnit)}
                    dataHandlerDuringValidation={async (v) =>
                      this.props.flightPlanInterface.setPerformanceData(
                        'blockFuel',
                        kilogramsToPerfPlanTonnes(v),
                        this.loadedFlightPlanIndex.get(),
                      )
                    }
                    readonlyValue={this.blockFuel}
                    mandatory={this.mandatoryAndActiveFpln}
                    alignText="flex-end"
                    containerStyle="width: 153px;"
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
                <div style={{ visibility: this.fuelPlanningBlockVisibility }}>
                  {fcomRight(148, 455, [
                    <span class="mfd-value" style="color: #ffff00;">
                      {this.fuelPlanningBlockWeightText}
                    </span>,
                    <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>,
                  ])}
                </div>
                {fcomAt(
                  148,
                  511,
                  <Button
                    disabled={this.fuelPlanningIsDisabled}
                    visible={this.fuelPlanningNotComputed}
                    label="FUEL<br />PLANNING *"
                    onClick={() => this.props.fmcService.master?.startFuelPlanning()}
                    buttonStyle="min-width: 168px; min-height: 56px;"
                  />,
                )}
                {fcomAt(
                  148,
                  511,
                  <Button
                    disabled={this.fuelPlanningIsDisabled}
                    visible={this.fuelPlanningComputed}
                    label="CONFIRM<br />BLOCK *"
                    onClick={() => this.props.fmcService.master?.confirmFuelPlanning()}
                    buttonStyle="color: #ffff00; min-width: 168px; min-height: 56px;"
                  />,
                )}
              </div>
              {fcomLine(188, 0, 746)}

              {fcomRight(237, 114, <span class="mfd-label">TAXI</span>)}
              {fcomAt(
                237,
                126,
                <InputField<number, number, false>
                  dataEntryFormat={new WeightFormat(Subject.create(0), Subject.create(maxTaxiFuel), this.weightUnit)}
                  dataHandlerDuringValidation={async (v) =>
                    this.props.flightPlanInterface.setPerformanceData(
                      'pilotTaxiFuel',
                      kilogramsToPerfPlanTonnes(v),
                      this.loadedFlightPlanIndex.get(),
                    )
                  }
                  enteredByPilot={this.taxiFuelIsPilotEntered}
                  readonlyValue={this.taxiFuel}
                  disabled={this.taxiAndRouteRsvDisabled}
                  alignText="flex-end"
                  containerStyle="width: 152px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomRight(298, 114, <span class="mfd-label">TRIP</span>)}
              {fcomRight(298, 279, [
                <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.tripFuelWeightText}</span>,
                <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>,
              ])}
              {fcomAt(298, 311, <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.tripFuelTime}</span>)}
              {fcomRight(357, 114, <span class="mfd-label">RTE RSV</span>)}
              {fcomAt(
                357,
                126,
                <InputField<number, number, false>
                  disabled={this.taxiAndRouteRsvDisabled}
                  dataEntryFormat={
                    new WeightFormat(
                      Subject.create(AirlineModifiableInformation.EK.rsvMin),
                      Subject.create(AirlineModifiableInformation.EK.rsvMax),
                      this.weightUnit,
                    )
                  }
                  dataHandlerDuringValidation={async (v) => {
                    this.props.flightPlanInterface.setPerformanceData(
                      'pilotRouteReserveFuel',
                      kilogramsToPerfPlanTonnes(v),
                      this.loadedFlightPlanIndex.get(),
                    );

                    this.props.flightPlanInterface.setPerformanceData(
                      'pilotRouteReserveFuelPercentage',
                      null,
                      this.loadedFlightPlanIndex.get(),
                    );
                  }}
                  enteredByPilot={this.routeReserveFuelIsPilotEntered}
                  readonlyValue={this.routeReserveFuel}
                  alignText="flex-end"
                  containerStyle="width: 152px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomAt(
                357,
                298,
                <InputField<number, number, false>
                  disabled={this.taxiAndRouteRsvDisabled}
                  dataEntryFormat={new PercentageFormat(Subject.create(0), Subject.create(maxRteRsvFuelPerc))}
                  dataHandlerDuringValidation={async (v) => {
                    this.props.flightPlanInterface.setPerformanceData(
                      'pilotRouteReserveFuel',
                      null,
                      this.loadedFlightPlanIndex.get(),
                    );
                    this.props.flightPlanInterface.setPerformanceData(
                      'pilotRouteReserveFuelPercentage',
                      v,
                      this.loadedFlightPlanIndex.get(),
                    );
                  }}
                  enteredByPilot={this.routeReserveFuelPercentageIsPilotEntered}
                  readonlyValue={this.routeReserveFuelPercentage}
                  alignText="center"
                  containerStyle="width: 110px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomRight(416, 114, <span class="mfd-label">ALTN</span>)}
              {fcomAt(
                416,
                126,
                <InputField<number, number, false>
                  dataEntryFormat={new WeightFormat(Subject.create(0), Subject.create(maxAltnFuel), this.weightUnit)}
                  dataHandlerDuringValidation={async (v) =>
                    this.props.flightPlanInterface.setPerformanceData(
                      'pilotAlternateFuel',
                      kilogramsToPerfPlanTonnes(v),
                      this.loadedFlightPlanIndex.get(),
                    )
                  }
                  disabled={this.alternateFuelDisabled}
                  enteredByPilot={this.alternateFuelIsPilotEntered}
                  readonlyValue={this.alternateFuel}
                  alignText="flex-end"
                  containerStyle="width: 152px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomAt(416, 311, <span class={{ 'mfd-value': true, sec: this.secActive }}>--:--</span>)}
              {fcomRight(477, 114, <span class="mfd-label">FINAL</span>)}
              {fcomAt(
                477,
                126,
                <InputField<number, number, false>
                  dataEntryFormat={new WeightFormat(Subject.create(0), Subject.create(maxFinalFuel), this.weightUnit)}
                  dataHandlerDuringValidation={async (v) => {
                    this.props.flightPlanInterface.setPerformanceData(
                      'pilotFinalHoldingFuel',
                      kilogramsToPerfPlanTonnes(v),
                      this.loadedFlightPlanIndex.get(),
                    );
                    this.props.flightPlanInterface.setPerformanceData(
                      'pilotFinalHoldingTime',
                      null,
                      this.loadedFlightPlanIndex.get(),
                    );
                  }}
                  enteredByPilot={this.finalFuelIsPilotEntered}
                  readonlyValue={this.finalFuel}
                  alignText="flex-end"
                  containerStyle="width: 152px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomAt(
                477,
                298,
                <InputField<number, number, false>
                  dataEntryFormat={new TimeHHMMFormat()}
                  dataHandlerDuringValidation={async (v) => {
                    this.props.flightPlanInterface.setPerformanceData(
                      'pilotFinalHoldingFuel',
                      null,
                      this.loadedFlightPlanIndex.get(),
                    );
                    this.props.flightPlanInterface.setPerformanceData(
                      'pilotFinalHoldingTime',
                      v,
                      this.loadedFlightPlanIndex.get(),
                    );
                  }}
                  enteredByPilot={this.finalFuelTimeIsPilotEntered}
                  readonlyValue={this.finalFuelTime}
                  alignText="center"
                  containerStyle="width: 110px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}

              {fcomRight(237, 573, <span class="mfd-label">PAX NBR</span>)}
              {fcomAt(
                237,
                581,
                <InputField<number>
                  dataEntryFormat={new PaxNbrFormat()}
                  dataHandlerDuringValidation={async (v) => {
                    if (v !== null) {
                      this.props.flightPlanInterface.setPerformanceData(
                        'paxNumber',
                        v,
                        this.loadedFlightPlanIndex.get(),
                      );
                      this.props.fmcService.master.acInterface.updatePaxNumber(v);
                    }
                  }}
                  value={this.paxNumber}
                  mandatory={this.mandatoryAndActiveFpln}
                  alignText="center"
                  containerStyle="width: 70px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomRight(298, 573, <span class="mfd-label">CI</span>)}
              {fcomAt(
                298,
                581,
                <InputField<number>
                  dataEntryFormat={new CostIndexFormat()}
                  dataHandlerDuringValidation={async (v) => {
                    this.props.flightPlanInterface?.setPerformanceData(
                      'costIndex',
                      v,
                      this.loadedFlightPlanIndex.get(),
                    );
                    // No LRC / ECON mode field on the FCOM page: a cost index selects the economy speeds
                    this.props.flightPlanInterface?.setPerformanceData(
                      'costIndexMode',
                      CostIndexMode.ECON,
                      this.loadedFlightPlanIndex.get(),
                    );
                  }}
                  value={this.costIndex}
                  mandatory={this.mandatoryAndActiveFpln}
                  disabled={this.costIndexDisabled}
                  alignText="center"
                  containerStyle="width: 70px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              <div style={{ visibility: this.jettisonGrossWeightVisibility }}>
                {fcomRight(357, 573, <span class="mfd-label">JTSN GW</span>)}
                {fcomAt(
                  357,
                  581,
                  <InputField<number, number, false>
                    dataEntryFormat={new WeightFormat(Subject.create(0), Subject.create(maxJtsnGw), this.weightUnit)}
                    disabled={Subject.create(true)}
                    readonlyValue={this.jettisonGrossWeight}
                    alignText="flex-end"
                    containerStyle="width: 173px;"
                    errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                    hEventConsumer={this.props.mfd.hEventConsumer}
                    interactionMode={this.props.mfd.interactionMode}
                  />,
                )}
              </div>
              {fcomRight(416, 573, <span class="mfd-label">TOW</span>)}
              {fcomRight(416, 761, [
                <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.takeoffWeightText}</span>,
                <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>,
              ])}
              {fcomRight(477, 573, <span class="mfd-label">LW</span>)}
              {fcomRight(477, 761, [
                <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.landingWeightText}</span>,
                <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>,
              ])}
              {fcomLine(533, 10, 747)}

              {fcomCentre(576, 256, <span class="mfd-label">{this.destinationAlternateTimeHeader}</span>)}
              {fcomCentre(576, 380, <span class="mfd-label">EFOB</span>)}
              {fcomLine(597, 23, 460)}
              {fcomAt(630, 29, <span class="mfd-label">DEST</span>)}
              {fcomAt(
                630,
                108,
                <span
                  class={{
                    'mfd-label': true,
                    bigger: true,
                    green: this.mandatoryAndActiveFpln,
                    sec: this.secActive,
                  }}
                >
                  {this.destIcaoDisplay}
                </span>,
              )}
              {fcomAt(
                630,
                212,
                <span
                  class={{
                    'mfd-label': true,
                    bigger: true,
                    green: this.mandatoryAndActiveFpln,
                    sec: this.secActive,
                  }}
                >
                  {this.destEta}
                </span>,
              )}
              {fcomRight(630, 486, [
                <span class={{ 'mfd-value': true, amber: this.destEfobAmber, sec: this.secActive }}>
                  {this.destEfobText}
                </span>,
                <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>,
              ])}
              {fcomAt(674, 29, <span class="mfd-label">ALTN</span>)}
              {fcomAt(
                674,
                108,
                <span class={{ 'mfd-label': true, bigger: true, green: this.mandatoryAndActiveFpln }}>
                  {this.altnIcao}
                </span>,
              )}
              {fcomAt(
                674,
                212,
                <span class={{ 'mfd-label': true, bigger: true, green: this.mandatoryAndActiveFpln }}>
                  {this.altnEta}
                </span>,
              )}
              {fcomRight(674, 486, [
                <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.altnEfobText}</span>,
                <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>,
              ])}

              {fcomCentre(576, 613, <span class="mfd-label">MIN FUEL AT DEST</span>)}
              {fcomAt(
                630,
                524,
                <InputField<number, number, false>
                  dataEntryFormat={new WeightFormat(undefined, Subject.create(maxMinDestFuel), this.weightUnit)}
                  dataHandlerDuringValidation={async (v) => {
                    // FCOM DSC-22-FMS-20-30 FUEL&LOAD page: clearing MIN FUEL AT DEST without a value is NOT ALLOWED
                    if (v === null) {
                      this.props.fmcService.master.addMessageToQueue(NXSystemMessages.notAllowed, undefined, undefined);
                      return false;
                    }
                    this.props.flightPlanInterface?.setPerformanceData(
                      'pilotMinimumDestinationFuelOnBoard',
                      kilogramsToPerfPlanTonnes(v),
                      this.loadedFlightPlanIndex.get(),
                    );
                    return true;
                  }}
                  enteredByPilot={this.minimumFuelAtDestinationIsPilotEntered}
                  readonlyValue={this.minimumFuelAtDestination}
                  alignText="flex-end"
                  containerStyle="width: 173px;"
                  errorHandler={(e) => this.props.fmcService.master.showFmsErrorMessage(e.type, e.details)}
                  hEventConsumer={this.props.mfd.hEventConsumer}
                  interactionMode={this.props.mfd.interactionMode}
                />,
              )}
              {fcomCentre(692, 619, <span class="mfd-label">EXTRA</span>)}
              {fcomRight(726, 614, [
                <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.extraFuelWeightText}</span>,
                <span class="mfd-label-unit mfd-unit-trailing">{this.weightUnitText}</span>,
              ])}
              {fcomAt(
                726,
                644,
                <span class={{ 'mfd-value': true, sec: this.secActive }}>{this.extraFuelTimeText}</span>,
              )}
            </div>
            <div class="mfd-fcom-overlay">
              {fcomAt(
                784,
                8,
                <Button
                  label="RETURN"
                  onClick={() =>
                    // FCOM DSC-22-FMS-20-30 FUEL&LOAD page: RETURN displays the ACTIVE / INIT page
                    this.props.mfd.uiService.navigateTo(this.mandatoryAndActiveFpln.get() ? 'fms/active/init' : 'back')
                  }
                  buttonStyle="min-width: 148px;"
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
