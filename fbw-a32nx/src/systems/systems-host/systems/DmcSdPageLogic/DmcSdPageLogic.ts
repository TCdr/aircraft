// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { ConsumerValue, EventBus, Subject, Subscription } from '@microsoft/msfs-sdk';
import { A32NXFcdcBusEvents } from '../../../shared/src/publishers/A32NXFcdcBusPublisher';
import {
  Arinc429LocalVarConsumerSubject,
  Arinc429Register,
  NXLogicConfirmNode,
  NXLogicMemoryNode,
  NXLogicPulseNode,
  NXLogicTriggeredMonostableNode,
  RegisteredSimVar,
} from '@flybywiresim/fbw-sdk';
import { SdPages } from '../../../shared/src/SdPages';
import { A32NXEcpBusEvents } from '@shared/publishers/A32NXEcpBusPublisher';
import { STATUS_CLR_SCROLLS_VAR } from '../../../shared/src/StatusPaging';
import { ECAM_SINGLE_DISPLAY_VAR } from '../../../shared/src/DisplayReconfiguration';
import { isShownPageDeselectedByItsPb, isStatusPageClearedByClr } from './StatusPageSelection';
import { SdAdvisoryInputs, SdAdvisoryMonitor } from './SdAdvisories';
import { SdAdvisoryAction, sdAdvisoryAction } from './SdAdvisoryMode';
import { ECAM_SD_ADVISORY_PAGE_VAR } from '../ECP/FakeDmc';

enum SdMode {
  Manual,
  Warning,
  Advisory,
  FlightPhase,
}

/** An A32NX ECAM Control Panel, excluding the DU brightness pots. */
export class DmcSdPageLogic {
  private readonly sub = this.bus.getSubscriber<A32NXFcdcBusEvents & A32NXEcpBusEvents>();

  private readonly apuNWord = Arinc429Register.empty();

  private readonly altitudeWord = Arinc429Register.empty();

  private readonly ecpSystemSwitchWord = Arinc429LocalVarConsumerSubject.create(
    this.sub.on('a32nx_ecp_system_switch_word'),
  );

  private readonly ecpWarningSwitchWord = Arinc429LocalVarConsumerSubject.create(
    this.sub.on('a32nx_ecp_warning_switch_word'),
  );

  /*
   * The hardwired discretes of the ALL, STS and CLR pbs. Their contacts are wired directly to the DMCs, so they still
   * work with the ECAM control panel failed (A320 FCOM DSC-31-30, a320_fcom.txt l.46834-46836; ALL pb l.46788-46793).
   * The DMC reads each pb from its discrete or from the ECP word.
   */
  private readonly ecpAllDiscrete = ConsumerValue.create(this.sub.on('a32nx_ecp_discrete_out_all'), false);

  private readonly ecpStatusDiscrete = ConsumerValue.create(this.sub.on('a32nx_ecp_discrete_out_sts'), false);

  private readonly ecpClearDiscrete = ConsumerValue.create(this.sub.on('a32nx_ecp_discrete_out_clr'), false);

  private readonly allPageConfirm = new NXLogicConfirmNode(3, true);

  private readonly allPagePulse = new NXLogicPulseNode(true);

  private readonly allPageImmediatePulse = new NXLogicPulseNode(false);

  private readonly allPageImmediateInhibitConfirm = new NXLogicConfirmNode(3, true);

  private readonly allPageImmediateInhibitPulse = new NXLogicPulseNode(false);

  private readonly apuAbove95PercentConfirmNode = new NXLogicConfirmNode(10, true);

  private readonly engineStartConfirmNode = new NXLogicConfirmNode(10, false);

  private readonly controlsMovedMtrig = new NXLogicTriggeredMonostableNode(20, true, true);

  private readonly cruiseConditionConfirmNode = new NXLogicConfirmNode(60, true);

  private readonly cruiseConditionFlipFlop = new NXLogicMemoryNode(false);

  private readonly stsPageNormalMtrig = new NXLogicTriggeredMonostableNode(3, true, true);

  private readonly stsPageNormalPulse = new NXLogicPulseNode(false);

  private flightPhaseModePage = SdPages.NONE;

  private prevFwcRequestedSdPage = SdPages.NONE;

  private readonly sdWarningOverridePulseNode = new NXLogicPulseNode(true);

  private readonly sdManualSelectionPulseNode = new NXLogicPulseNode(true);

  private readonly clearPulseNode = new NXLogicPulseNode(true);

  /** The advisories: the system page with a parameter out of its normal range (FCOM DSC-31-20, see SdAdvisories) */
  private readonly advisoryMonitor = new SdAdvisoryMonitor();

  /** The advisory page at the previous update (SdPages.NONE with one ECAM display), see sdAdvisoryAction */
  private previousAdvisoryPage = SdPages.NONE;

  private readonly advisoryPageSimvar = RegisteredSimVar.create<number>(ECAM_SD_ADVISORY_PAGE_VAR, 'Enum');

  private readonly cpc1DiscreteWord = Arinc429Register.empty();

  private readonly cabinAltitudeWord = Arinc429Register.empty();

  private readonly cabinVsWord = Arinc429Register.empty();

  private readonly cabinDeltaPressureWord = Arinc429Register.empty();

  private readonly apuEgtWord = Arinc429Register.empty();

  private readonly apuEgtCautionWord = Arinc429Register.empty();

  /** L:A32NX_ECAM_STATUS_CLR_SCROLLS read at the previous update (see isStatusPageClearedByClr) */
  private statusClearScrollsBeforeUpdate = false;

  private selectedPage = Subject.create(SdPages.NONE);

  private sdMode = SdMode.FlightPhase;

  private activePage = Subject.create(SdPages.NONE);

  private activePageSimvar = RegisteredSimVar.create('L:A32NX_ECAM_SD_PAGE_TO_DISPLAY', 'Enum');

  private selectedPageSimvar = RegisteredSimVar.create('L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX', 'Enum');

  private readonly subs: Subscription[] = [];

  constructor(private readonly bus: EventBus) {}

  public init(): void {
    for (const sub of this.subs) {
      sub.resume(true);
    }

    this.activePage.sub((value) => {
      this.activePageSimvar.set(value);
    });

    this.selectedPage.sub((value) => {
      this.selectedPageSimvar.set(value);
    });
  }

  public updateFlightPhasePage(dt: number) {
    // FIXME should come from relevant systems
    const fwcFlightPhase = SimVar.GetSimVarValue('L:A32NX_FWC_FLIGHT_PHASE', 'Enum');

    const sidestickPosX = SimVar.GetSimVarValue('L:A32NX_SIDESTICK_POSITION_X', 'Number');
    const sidestickPosY = SimVar.GetSimVarValue('L:A32NX_SIDESTICK_POSITION_Y', 'Number');
    const rudderPos = SimVar.GetSimVarValue('RUDDER PEDAL POSITION', 'Position');
    const controlsMoved = Math.abs(sidestickPosX) > 0.05 || Math.abs(sidestickPosY) > 0.05 || Math.abs(rudderPos) > 0.2;
    this.controlsMovedMtrig.write(controlsMoved, dt);

    const engModeSel = SimVar.GetSimVarValue('L:XMLVAR_ENG_MODE_SEL', 'number');
    const eng1State = SimVar.GetSimVarValue('L:A32NX_ENGINE_STATE:1', 'number');
    const eng2State = SimVar.GetSimVarValue('L:A32NX_ENGINE_STATE:2', 'number');
    const oneEngOff = eng1State !== 1 || eng2State !== 1;

    this.engineStartConfirmNode.write(engModeSel === 0 || (oneEngOff && engModeSel === 2), dt);

    this.apuNWord.setFromSimVar('L:A32NX_APU_N');
    const currentAPUMasterState = SimVar.GetSimVarValue('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON', 'Bool');
    this.apuAbove95PercentConfirmNode.write(this.apuNWord.valueOr(0) > 95, dt);

    const toPowerSet =
      Math.max(
        SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_TLA:1', 'number'),
        SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_TLA:2', 'number'),
      ) >= 35 &&
      SimVar.GetSimVarValue('ENG N1 RPM:1', 'Percent') > 15 &&
      SimVar.GetSimVarValue('ENG N1 RPM:2', 'Percent') > 15;
    const flapsDeployed = SimVar.GetSimVarValue('L:A32NX_FLAPS_HANDLE_INDEX', 'number') !== 0;

    this.cruiseConditionConfirmNode.write(fwcFlightPhase === 6 && (toPowerSet || flapsDeployed), dt);
    this.cruiseConditionFlipFlop.write(
      this.cruiseConditionConfirmNode.read() || (fwcFlightPhase === 6 && !flapsDeployed && !toPowerSet),
      fwcFlightPhase !== 6,
    );

    this.altitudeWord.setFromSimVar('L:A32NX_ADIRS_ADR_1_BARO_CORRECTED_ALTITUDE_1');
    const isGearExtended = SimVar.GetSimVarValue('GEAR TOTAL PCT EXTENDED', 'percent') > 0.95;

    const wheelCondition = isGearExtended && this.altitudeWord.value < 15500 && !this.altitudeWord.isFailureWarning();

    if (this.engineStartConfirmNode.read()) {
      this.flightPhaseModePage = SdPages.ENG;
    } else if (currentAPUMasterState && !this.apuAbove95PercentConfirmNode.read()) {
      this.flightPhaseModePage = SdPages.APU;
    } else if (fwcFlightPhase === 1 || fwcFlightPhase === 10) {
      this.flightPhaseModePage = SdPages.DOOR;
    } else if (fwcFlightPhase === 2 && this.controlsMovedMtrig.read()) {
      this.flightPhaseModePage = SdPages.FCTL;
    } else if (fwcFlightPhase === 2 && !this.controlsMovedMtrig.read()) {
      this.flightPhaseModePage = SdPages.WHEEL;
    } else if (
      fwcFlightPhase === 3 ||
      fwcFlightPhase === 4 ||
      fwcFlightPhase === 5 ||
      (fwcFlightPhase === 6 && !this.cruiseConditionFlipFlop.read())
    ) {
      this.flightPhaseModePage = SdPages.ENG;
    } else if (
      (fwcFlightPhase === 6 && wheelCondition) ||
      fwcFlightPhase === 7 ||
      fwcFlightPhase === 8 ||
      fwcFlightPhase === 9
    ) {
      this.flightPhaseModePage = SdPages.WHEEL;
    } else {
      this.flightPhaseModePage = SdPages.CRZ;
    }
  }

  computeEcpButtonPressedFromWord(): SdPages {
    if (this.ecpSystemSwitchWord.get().bitValueOr(11, false)) {
      return SdPages.ENG;
    } else if (this.ecpSystemSwitchWord.get().bitValueOr(12, false)) {
      return SdPages.BLEED;
    } else if (this.ecpSystemSwitchWord.get().bitValueOr(13, false)) {
      return SdPages.APU;
    } else if (this.ecpSystemSwitchWord.get().bitValueOr(14, false)) {
      return SdPages.HYD;
    } else if (this.ecpSystemSwitchWord.get().bitValueOr(15, false)) {
      return SdPages.ELEC;
    } else if (this.ecpSystemSwitchWord.get().bitValueOr(17, false)) {
      return SdPages.COND;
    } else if (this.ecpSystemSwitchWord.get().bitValueOr(18, false)) {
      return SdPages.PRESS;
    } else if (this.ecpSystemSwitchWord.get().bitValueOr(19, false)) {
      return SdPages.FUEL;
    } else if (this.ecpSystemSwitchWord.get().bitValueOr(20, false)) {
      return SdPages.FCTL;
    } else if (this.ecpSystemSwitchWord.get().bitValueOr(21, false)) {
      return SdPages.DOOR;
    } else if (this.ecpSystemSwitchWord.get().bitValueOr(22, false)) {
      return SdPages.WHEEL;
    } else if (this.ecpWarningSwitchWord.get().bitValueOr(13, false) || !!this.ecpStatusDiscrete.get()) {
      return SdPages.STS;
    } else {
      return SdPages.NONE;
    }
  }

  /** The parameters of the advisories, read as their SD pages read them (see SdAdvisories) */
  private readAdvisoryInputs(fwcFlightPhase: number): SdAdvisoryInputs {
    const engine = (n: number) => ({
      fadecPowered: SimVar.GetSimVarValue(`L:A32NX_FADEC_POWERED_ENG${n}`, 'Bool') > 0,
      oilPressurePsi: SimVar.GetSimVarValue(`GENERAL ENG OIL PRESSURE:${n}`, 'psi'),
      n2Percent: SimVar.GetSimVarValue(`L:A32NX_ENGINE_N2:${n}`, 'number'),
      oilQuantityQt: SimVar.GetSimVarValue(`L:A32NX_ENGINE_OIL_QTY:${n}`, 'number'),
      oilTemperatureCelsius: SimVar.GetSimVarValue(`GENERAL ENG OIL TEMPERATURE:${n}`, 'celsius'),
      n1VibrationUnits: SimVar.GetSimVarValue(`L:A32NX_ENGINE_${n}_N1_VIBRATION`, 'number'),
      n2VibrationUnits: SimVar.GetSimVarValue(`L:A32NX_ENGINE_${n}_N2_VIBRATION`, 'number'),
    });

    // The cabin values of the active CPC, or the manual ones (as the CAB PRESS page)
    this.cpc1DiscreteWord.setFromSimVar('L:A32NX_PRESS_CPC_1_DISCRETE_WORD');
    const activeCpc = this.cpc1DiscreteWord.bitValueOr(11, false) ? 1 : 2;
    this.cabinAltitudeWord.setFromSimVar(`L:A32NX_PRESS_CPC_${activeCpc}_CABIN_ALTITUDE`);
    this.cabinVsWord.setFromSimVar(`L:A32NX_PRESS_CPC_${activeCpc}_CABIN_VS`);
    this.cabinDeltaPressureWord.setFromSimVar(`L:A32NX_PRESS_CPC_${activeCpc}_CABIN_DELTA_PRESSURE`);
    const cpcOrManual = (word: Arinc429Register, manualVar: string, unit: string): number =>
      word.isNormalOperation() ? word.value : SimVar.GetSimVarValue(manualVar, unit);

    const fuelKgPerGallon = SimVar.GetSimVarValue('FUEL WEIGHT PER GALLON', 'kilogram');
    const wingFuelKg = (side: 'LEFT' | 'RIGHT') =>
      (SimVar.GetSimVarValue(`FUEL TANK ${side} MAIN QUANTITY`, 'gallons') +
        SimVar.GetSimVarValue(`FUEL TANK ${side} AUX QUANTITY`, 'gallons')) *
      fuelKgPerGallon;

    this.apuEgtWord.setFromSimVar('L:A32NX_APU_EGT');
    this.apuEgtCautionWord.setFromSimVar('L:A32NX_APU_EGT_CAUTION');

    return {
      fwcFlightPhase,
      engines: [engine(1), engine(2)],
      idgOilTemperaturesCelsius: [
        SimVar.GetSimVarValue('L:A32NX_ELEC_ENG_GEN_1_IDG_OIL_OUTLET_TEMPERATURE', 'celsius'),
        SimVar.GetSimVarValue('L:A32NX_ELEC_ENG_GEN_2_IDG_OIL_OUTLET_TEMPERATURE', 'celsius'),
      ],
      cabinAltitudeFt: cpcOrManual(this.cabinAltitudeWord, 'L:A32NX_PRESS_MAN_CABIN_ALTITUDE', 'feet'),
      cabinVsFtMin: cpcOrManual(this.cabinVsWord, 'L:A32NX_PRESS_MAN_CABIN_VS', 'feet per minute'),
      cabinDeltaPsi: cpcOrManual(this.cabinDeltaPressureWord, 'L:A32NX_PRESS_MAN_CABIN_DELTA_PRESSURE', 'psi'),
      leftWingFuelKg: wingFuelKg('LEFT'),
      rightWingFuelKg: wingFuelKg('RIGHT'),
      apuEgtCelsius: this.apuEgtWord.isNormalOperation() ? this.apuEgtWord.value : null,
      apuEgtCautionCelsius: this.apuEgtCautionWord.isNormalOperation() ? this.apuEgtCautionWord.value : null,
      apuStarting:
        SimVar.GetSimVarValue('L:A32NX_OVHD_APU_START_PB_IS_ON', 'Bool') > 0 &&
        !(SimVar.GetSimVarValue('L:A32NX_OVHD_APU_START_PB_IS_AVAILABLE', 'Bool') > 0),
      apuFlapNotClosed: SimVar.GetSimVarValue('L:A32NX_APU_FLAP_OPEN_PERCENTAGE', 'percent') !== 0,
      apuMasterOn: SimVar.GetSimVarValue('L:A32NX_OVHD_APU_MASTER_SW_PB_IS_ON', 'Bool') > 0,
    };
  }

  updateSdSelection(dt: number) {
    const fwcSdPageRequest = SimVar.GetSimVarValue('L:A32NX_ECAM_SFAIL', 'number') as SdPages;

    const allButtonPressed = this.ecpSystemSwitchWord.get().bitValueOr(23, false) || !!this.ecpAllDiscrete.get();
    this.allPageConfirm.write(allButtonPressed && !this.allPagePulse.read(), dt);
    this.allPagePulse.write(this.allPageConfirm.read());

    this.allPageImmediatePulse.write(allButtonPressed);
    this.allPageImmediateInhibitConfirm.write(allButtonPressed, dt);
    this.allPageImmediateInhibitPulse.write(this.allPageImmediateInhibitConfirm.read());

    const systemPageButtonPressed = this.computeEcpButtonPressedFromWord();
    this.sdManualSelectionPulseNode.write(systemPageButtonPressed !== SdPages.NONE);

    this.sdWarningOverridePulseNode.write(fwcSdPageRequest !== this.prevFwcRequestedSdPage);

    // An empty STATUS page shows NORMAL for 3 s (A320 FCOM DSC-31-30 STS pb); the FWC says whether it is empty
    const stsNormal = SimVar.GetSimVarValue('L:A32NX_ECAM_STATUS_NORMAL', 'Bool') !== 0;
    this.stsPageNormalMtrig.write(systemPageButtonPressed === SdPages.STS && stsNormal, dt);
    this.stsPageNormalPulse.write(this.stsPageNormalMtrig.read());

    // CLR removes the STATUS page called with the STS pb, once no alert is shown on the E/WD (A320 FCOM DSC-31-30)
    const clearPressed =
      this.ecpWarningSwitchWord.get().bitValueOr(11, false) ||
      this.ecpWarningSwitchWord.get().bitValueOr(16, false) ||
      !!this.ecpClearDiscrete.get();
    this.clearPulseNode.write(clearPressed);
    // ... unless the push shows the next page of an overflowing STATUS page (FWC, see StatusPageSelection)
    const statusPageCleared = isStatusPageClearedByClr(
      this.clearPulseNode.read(),
      this.sdMode === SdMode.Manual && this.selectedPage.get() === SdPages.STS,
      !!SimVar.GetSimVarValue('L:A32NX_EWD_LEFT_FAILURE_ACTIVE', 'Bool'),
      this.statusClearScrollsBeforeUpdate,
    );
    this.statusClearScrollsBeforeUpdate = SimVar.GetSimVarValue(STATUS_CLR_SCROLLS_VAR, 'Bool') > 0;
    const singleDisplay = SimVar.GetSimVarValue(ECAM_SINGLE_DISPLAY_VAR, 'Bool') > 0;

    const advisoryPage = this.advisoryMonitor.update(
      this.readAdvisoryInputs(SimVar.GetSimVarValue('L:A32NX_FWC_FLIGHT_PHASE', 'Enum')),
      dt / 1000,
    );
    this.advisoryPageSimvar.set(advisoryPage);
    const advisoryAction = sdAdvisoryAction({
      advisoryPage,
      previousAdvisoryPage: this.previousAdvisoryPage,
      inAdvisoryMode: this.sdMode === SdMode.Advisory,
      inWarningMode: this.sdMode === SdMode.Warning,
      singleDisplay,
    });
    // With one ECAM display the advisory page is not called (its pb flashes, FakeDmc): it is called when the second
    // display comes back
    this.previousAdvisoryPage = singleDisplay ? SdPages.NONE : advisoryPage;

    if (this.sdManualSelectionPulseNode.read() && this.selectedPage.get() !== systemPageButtonPressed) {
      this.selectedPage.set(systemPageButtonPressed);
      this.sdMode = SdMode.Manual;
    } else if (
      this.allPagePulse.read() ||
      (this.allPageImmediatePulse.read() && !this.allPageImmediateInhibitPulse.read())
    ) {
      this.selectedPage.set(
        this.selectedPage.get() === SdPages.NONE || this.selectedPage.get() === SdPages.STS
          ? SdPages.ENG
          : (this.selectedPage.get() + 1) % 11,
      );
      this.sdMode = SdMode.Manual;
    } else if (this.sdWarningOverridePulseNode.read() && fwcSdPageRequest !== SdPages.NONE) {
      this.selectedPage.set(fwcSdPageRequest);
      this.sdMode = SdMode.Warning;
    } else if (advisoryAction === SdAdvisoryAction.ShowAdvisoryPage) {
      // DSC-31-20 l.46102-46103, l.46122-46123: the advisory page replaces the page shown
      this.selectedPage.set(advisoryPage);
      this.sdMode = SdMode.Advisory;
    } else if (
      (this.sdWarningOverridePulseNode.read() && fwcSdPageRequest === SdPages.NONE && this.sdMode === SdMode.Warning) ||
      advisoryAction === SdAdvisoryAction.EndAdvisory ||
      (this.sdManualSelectionPulseNode.read() &&
        (this.sdMode === SdMode.Manual || this.sdMode === SdMode.Advisory) &&
        this.selectedPage.get() === systemPageButtonPressed &&
        isShownPageDeselectedByItsPb(systemPageButtonPressed, singleDisplay)) ||
      (this.stsPageNormalPulse.read() && this.selectedPage.get() === SdPages.STS) ||
      statusPageCleared
    ) {
      if (this.sdMode === SdMode.Warning) {
        // the failure page is gone: an advisory still active calls its page at the next update
        this.previousAdvisoryPage = SdPages.NONE;
      }
      this.selectedPage.set(SdPages.NONE);
      this.sdMode = SdMode.FlightPhase;
    }
    this.prevFwcRequestedSdPage = fwcSdPageRequest;
  }

  public update(dt: number): void {
    this.updateFlightPhasePage(dt);
    this.updateSdSelection(dt);

    if (this.sdMode === SdMode.Manual || this.sdMode === SdMode.Warning || this.sdMode === SdMode.Advisory) {
      this.activePage.set(this.selectedPage.get());
    } else {
      this.activePage.set(this.flightPhaseModePage);
    }
  }
}
