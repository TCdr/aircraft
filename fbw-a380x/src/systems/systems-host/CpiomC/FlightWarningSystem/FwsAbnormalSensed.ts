// Copyright (c) 2021-2026 FlyByWire Simulations
//
// SPDX-License-Identifier: GPL-3.0

import { FwcFlightPhase } from './FwsFlightPhases';
import { EcamAbnormalProcedures, WD_NUM_LINES } from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages';
import {
  MappedSubject,
  MappedSubscribable,
  SimVarValueType,
  Subject,
  Subscribable,
  SubscribableMapEventType,
  SubscribableMapFunctions,
  Subscription,
} from '@microsoft/msfs-sdk';
import { SdPages } from '@shared/EcamSystemPages';
import { accuPressLoItems } from './FwsBrakeAlerts';
import { diffPressHiItemsToShow, ldgElevnFaultItemsToShow } from './CabPressAlerts';
import { isApproachCapabilityDowngradedByRa } from './AutoFlightAlerts';
import { antiIceItemsChecked, ICE_DETECTED_PHASE_INHIBITION, isSevereIceDetected } from './AntiIceAlerts';
import { abnormBleedConfigItems, abnormBleedConfigLimitations } from './AbnormBleedConfig';
import {
  BLEED_ALERTS_FLIGHT_PHASE_INHIBITION,
  BLEED_ALERTS_LEVEL,
  bleedLeakInopSys,
  bleedLeakItems,
  bleedLeakLimitations,
  ENG_BLEED_FAULT_ALERT_IDS,
  ENG_BLEED_LEAK_ALERT_IDS,
  engineBleedFaultInopSys,
  engineBleedFaultItems,
  WING_LEAK_ALERT_IDS,
} from './BleedMonitoringAlerts';
import {
  APU_FAULT_INOP_SYS,
  APU_FAULT_PHASE_INHIBITION,
  apuFaultItemsChecked,
  apuFaultItemsToShow,
} from './ApuFaultAlerts';
import { elecDriveOilAbnormalItems } from './FwsElecDriveOilAlerts';
import {
  avionicsSmokeItemsChecked,
  CARGO_BOTTLE_FAULT_INOP_SYS,
  CARGO_BOTTLE_FAULT_PHASE_INHIBITION,
  cargoSmokeItemsChecked,
  cargoSmokeItemsToShow,
  SMOKE_DET_FAULT_PHASE_INHIBITION,
  SMOKE_WARNING_PHASE_INHIBITION,
  SMOKE_ZONES,
  SmokeProcedureState,
} from './SmokeAlerts';
// FIXME should not import from instruments
import {
  ProcedureLinesGenerator,
  ProcedureType,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/ProcedureLinesGenerator';
// FIXME should not import from instruments
import { ChecklistState, FwsEvents } from '../../../instruments/src/MsfsAvionicsCommon/providers/FwsPublisher';
import { FwcAuralWarning, FwsCore, FwsSuppressableItem } from './FwsCore';
import { ELEC_AC_ESS_BUS_FAULT_STATUS } from './FwsElecAlerts';
import { TAIL_STRIKE_DET_FAULT_PHASE_INHIBITION, TAIL_STRIKE_PHASE_INHIBITION } from './FwsTailStrikeAlerts';
import {
  APU_GEN_INOP_SYS,
  APU_TR_INOP_SYS,
  apuTrFaultInfo,
  ENG_GEN_INOP_SYS,
  elecSystemAbnormalItems,
  engineGeneratorLostApprLdg,
  engineGeneratorLostInfo,
  TR_INOP_SYS,
} from './FwsElecSystemAlerts';
import { gpwsFaultItemsToShow, isApFdTcasModeInop } from './FwsSurvAlerts';
import {
  FM_GPS_POS_DISAGREE_INFO,
  FM_GPS_POS_DISAGREE_PHASE_INHIBITION,
  LS_TUNING_DISAGREE_INOP_SYS_APPR_LDG,
  LS_TUNING_DISAGREE_PHASE_INHIBITION,
} from './FwsNavPositionAlerts';
import {
  ALL_ENG_FLAME_OUT_INHIBITED_PHASES,
  ENG_FAIL_FLIGHT_PHASE_INHIBITION,
  oppositeSideApproachItems,
  sameSideApproachItems,
  TwoEnginesOutDeferredInputs,
  twoEnginesOutAllPhasesItems,
} from './EngineFailAlerts';
import {
  OIL_FILTER_CLOGGED_LEVEL,
  OIL_FILTER_CLOGGED_PHASE_INHIBITION,
  OIL_PRESS_LO_PHASE_INHIBITION,
  OIL_TEMP_HI_PHASE_INHIBITION,
} from './EngineOilAlerts';
import { FUEL_FILTER_CLOGGED_LEVEL, FUEL_FILTER_CLOGGED_PHASE_INHIBITION } from './EngineFuelFilterAlerts';
import {
  ENGINE_MONITORING_ALERTS,
  ENGINE_MONITORING_ALERT_LEVEL,
  HP_FUEL_VLV_FAULT_LEVEL,
  HP_FUEL_VLV_FAULT_PHASE_INHIBITION,
  hpFuelVlvFaultItems,
} from './EngineMonitoringAlerts';
import {
  OIL_TEMP_LO_PHASE_INHIBITION,
  THR_LEVERS_NOT_SET_PHASE_INHIBITION,
  thrLeversNotSetItemsShown,
} from './EngineTakeoffAlerts';
import {
  THRUST_LOSS_PHASE_INHIBITION,
  TO_THRUST_DISAGREE_PHASE_INHIBITION,
  thrustLossItemsChecked,
} from './EngineThrustAlerts';
import {
  IGN_A_AND_B_FAULT_LEVEL,
  IGN_A_OR_B_FAULT_LEVEL,
  IGN_FAULT_FLIGHT_PHASE_INHIBITION,
  START_ALERTS_FLIGHT_PHASE_INHIBITION,
  START_FAULT_LEVEL,
  startFaultItems,
  startValveNotClosedItems,
  startValveNotClosedStatus,
  startValveNotOpenItems,
} from './EngineStartAlerts';
import { ENG_OVER_LIMIT_ITEMS_SHOWN, ENG_STALL_ITEMS_SHOWN } from './EngineParameterAlerts';
import {
  FADEC_FAULT_PHASE_INHIBITION,
  FADEC_SYS_FAULT_PHASE_INHIBITION,
  FADEC_TEMP_HI_PHASE_INHIBITION,
  REVERSER_CTL_FAULT_PHASE_INHIBITION,
  REVERSER_ENERGIZED_PHASE_INHIBITION,
  REVERSER_FAULT_PHASE_INHIBITION,
  REVERSER_LOCKED_PHASE_INHIBITION,
  REVERSER_SELECTED_PHASE_INHIBITION,
  REVERSER_UNLOCKED_PHASE_INHIBITION,
  THR_LEVER_FAULT_PHASE_INHIBITION,
  fadecFaultItemsChecked,
  fadecFaultItemsShown,
  isThrLeverInClimbDetent,
  reverserInopItemsShown,
  reverserSelectedItemsShown,
  reverserUnlockedItemsChecked,
  reverserUnlockedItemsShown,
  thrLeverFaultItemsChecked,
  thrLeverFaultItemsShown,
} from './FadecReverserAlerts';
import {
  condDuctOvhtActive,
  condDuctOvhtInfo,
  condDuctOvhtInopSys,
  condDuctOvhtItems,
  condDuctOvhtOutItems,
  fwdCargoTempRegulFaultActive,
  fwdCargoTempRegulFaultItemsToShow,
} from './CondTrimAirFlags';
import {
  AC_BUS_12_DC_1_FAULT_STATUS,
  AC_BUS_23_DC_12_FAULT_STATUS,
  AC_BUS_24_FAULT_STATUS,
  AC_BUS_34_DC_2_FAULT_STATUS,
  acBus12Dc1FaultLines,
  acBus23Dc12FaultLines,
  acBus24FaultLines,
  acBus34Dc2FaultLines,
  DC_BUS_12_FAULT_STATUS,
  DC_BUS_1_ESS_FAULT_STATUS,
  dcBus12FaultLines,
  dcBus1EssFaultLines,
  ROUND8_ELEC_PHASE_INHIBITION,
} from './FwsElecAlertsRound8';
import {
  innerTanksQtyLoLines,
  ROUND8_FUEL_PHASE_INHIBITION,
  WING_FEED_PUMPS_FAULT_STATUS,
  wingFeedPumpsFaultLines,
  wingsBalancedLines,
  wingsNotBalancedLines,
} from './FwsFuelAlertsRound8';
import {
  ANTI_ICE_VALVE_ALERT_IDS,
  AVOID_ICING_LIMITATION,
  ENGINE_ANTI_ICE_INOP_SYS,
  isWingAntiIceFailedAfterPressLo,
  WING_ANTI_ICE_INOP_SYS,
  wingPressLoLines,
  wingValveOpenLines,
} from './AntiIceValveAlerts';
import { OXYGEN_ALERT_IDS } from './OxygenAlerts';
import { cabinDoorNotClosedAlertId, cargoDoorNotClosedAlertId } from './DoorAlerts';
import {
  aboveGearDoorSpeed,
  doorsNotClosedChecked,
  doorsNotClosedItems,
  doorsNotClosedLimitations,
  gearNotLockedDownChecked,
  gearNotLockedDownItems,
  gearNotLockedUpChecked,
  gearNotLockedUpItems,
  gearNotLockedUpLimitations,
  lgCtl12Items,
  lgCtl12Limitations,
  lgCtl12PfdLimitations,
} from './FwsGearAlerts';
import { directLawInfo, directLawInopSysAllPhases, lawInopSysApprLdg } from './FwsFctlAlerts';
import {
  ENG_LP_VALVE_FAULT_INOP_SYS,
  engLpValveFaultLines,
  FUEL_LEAK_DET_FAULT_INOP_SYS,
  FUEL_LEAK_LP_VALVE_PHASE_INHIBITION,
} from './FwsFuelLeakLpValveAlerts';

export interface EwdAbnormalItem extends FwsSuppressableItem {
  flightPhaseInhib: number[];
  /** aural warning, defaults to simVarIsActive and SC for level 2 or CRC for level 3 if not provided */
  auralWarning?: MappedSubscribable<FwcAuralWarning> | Subscribable<FwcAuralWarning>;
  /** The monitor confirm time in seconds. Defaults to 0.6 s. */
  monitorConfirmTime?: number;
  /** Returns a boolean vector (same length as number of items). If true, item is shown in ECAM actions */
  whichItemsToShow: () => boolean[];
  /** Returns a boolean vector (same length as number of items). If true, item is marked as completed */
  whichItemsChecked: () => boolean[];
  /** Returns a boolean vector (same length as number of items). Optional, defaults to true. If true, item is shown as activated */
  whichItemsActive?: () => boolean[];
  whichItemsTimer?: () => (number | null | undefined)[];
  /** 3 = master warning, 2 = master caution */
  failure: number;
  /** Index of ECAM page to be displayed on SD */
  sysPage: SdPages;
  /** Cancel flag for level 3 warning audio (only emergency cancel can cancel if false), defaults to true. */
  cancel?: boolean;
  /**
   * @deprecated Use FwsInopSys instead to display INOP SYS on STS page
   * Optional for now: Message IDs of INOP SYS to be displayed on STS page for ALL PHASES.
   * Ideally they're not triggered from faults but rather taken from the system's health status.
   * checked allows access to the status of all items */
  inopSysAllPhases?: (checked: boolean[]) => (string | null)[];
  /**
   * @deprecated Use FwsInopSys instead to display INOP SYS on STS page
   * Optional for now: Message IDs of INOP SYS to be displayed on STS page for APPR&LDG.
   * Ideally they're not triggered from faults but rather taken from the system's health status */
  inopSysApprLdg?: (checked: boolean[]) => (string | null)[];
  /**
   * @deprecated Use FwsInformation instead to display INFOs on STS page
   */
  info?: (checked: boolean[]) => (string | null)[];
  /**
   * @deprecated Use FwsInopSys instead to display REDUND LOSSes on STS page
   */
  redundLoss?: (checked: boolean[]) => (string | null)[];
  /**
   * @deprecated Use FwsLimitations instead to display LIMITATIONS on STS page
   */
  limitationsAllPhases?: (checked: boolean[]) => (string | null)[];
  /**
   * @deprecated Use FwsLimitations instead to display LIMITATIONS on STS page
   */
  limitationsApprLdg?: (checked: boolean[]) => (string | null)[];
  /**
   * @deprecated Use FwsLimitations instead to display LIMITATIONS on STS page
   */
  limitationsPfd?: (checked: boolean[]) => (string | null)[];

  /** If true, is not used to display on the EWD */
  nonProcedureKey?: boolean;
}

/**
 * whichItemsToShow of a procedure whose items have no display condition: every item, from the procedure definition, so
 * the list always matches the items.
 */
export function showAllItems(procedureId: number): () => boolean[] {
  return () => EcamAbnormalProcedures[procedureId].items.map(() => true);
}

export interface EwdAbnormalDict {
  [key: keyof typeof EcamAbnormalProcedures]: EwdAbnormalItem;
}

/**
 * Sorts abnormal procedures by decreasing priority, for display on the EWD. Show secondary failures last
 * @param idA first procedure ID
 * @param idB second procedure ID
 * @returns comparison result, i.e. relative priority of procedures A and B
 */

export class FwsAbnormalSensed {
  private readonly pub = this.fws.bus.getPublisher<FwsEvents>();

  private readonly subscriptions: Subscription[] = [];

  /** @returns the ENG 1 to 4 A-ICE pb states, for the A-ICE ICE DETECTED lines */
  private engAntiIceOn(): boolean[] {
    return [
      this.fws.eng1AntiIce.get(),
      this.fws.eng2AntiIce.get(),
      this.fws.eng3AntiIce.get(),
      this.fws.eng4AntiIce.get(),
    ];
  }

  /** Whether the XPDR & TCAS system selected on the SURV panel (L:A32NX_TRANSPONDER_SYSTEM, 0 = SYS 1) is the given one. */
  private xpdrTcasSystemIs(system: 1 | 2): boolean {
    return SimVar.GetSimVarValue('L:A32NX_TRANSPONDER_SYSTEM', 'number') === system - 1;
  }

  /**
   * ELEC GEN 1(2)(3)(4) FAULT (master caution, SC): GEN x ... OFF only, the procedure has no "OFF THEN ON" reset
   * line.
   * @param gen 0 to 3 for GEN 1 to GEN 4
   */
  private elecGenFaultItem(gen: number): EwdAbnormalItem {
    return {
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.elecGenFault[gen],
      // Design choice: ELEC EMER CONFIG has its own GENs procedure
      notActiveWhenItemActive: ['240800055'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.elecGenPbOn[gen].get()],
      inopSysAllPhases: () => [ENG_GEN_INOP_SYS[gen]],
      inopSysApprLdg: () => engineGeneratorLostApprLdg(this.fws.apuAvail.get()),
      info: () => engineGeneratorLostInfo(this.fws.apuAvail.get()),
      failure: 2,
      sysPage: SdPages.ElecAc,
    };
  }

  /**
   * ELEC GEN 1(2)(3)(4) OFF (master caution, SC): crew awareness, no procedure line.
   * @param gen 0 to 3 for GEN 1 to GEN 4
   */
  private elecGenOffItem(gen: number): EwdAbnormalItem {
    return {
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.elecGenOff[gen],
      notActiveWhenItemActive: ['240800055'],
      // Design choice: 5 s, so that the GEN ... OFF THEN ON resets of other procedures do not flash this alert
      monitorConfirmTime: 5,
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      inopSysAllPhases: () => [ENG_GEN_INOP_SYS[gen]],
      inopSysApprLdg: () => engineGeneratorLostApprLdg(this.fws.apuAvail.get()),
      info: () => engineGeneratorLostInfo(this.fws.apuAvail.get()),
      failure: 2,
      sysPage: SdPages.ElecAc,
    };
  }

  /**
   * ELEC DRIVE 1(2)(3)(4) DISCONNECTED (master caution, SC). The real procedure is crew awareness only: the GEN x OFF
   * line of the text is hidden.
   * @param drive 0 to 3 for DRIVE 1 to DRIVE 4
   */
  private elecDriveDisconnectedItem(drive: number): EwdAbnormalItem {
    return {
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.elecDriveDisconnected[drive],
      notActiveWhenItemActive: ['240800055'],
      whichItemsToShow: () => [false],
      whichItemsChecked: () => [!this.fws.elecGenPbOn[drive].get()],
      inopSysAllPhases: () => [ENG_GEN_INOP_SYS[drive]],
      inopSysApprLdg: () => engineGeneratorLostApprLdg(this.fws.apuAvail.get()),
      info: () => engineGeneratorLostInfo(this.fws.apuAvail.get()),
      failure: 2,
      sysPage: SdPages.ElecAc,
    };
  }

  /**
   * ELEC APU GEN A(B) FAULT (master caution, SC): APU GEN A(B) ... OFF.
   * @param gen 0 for APU GEN A, 1 for APU GEN B
   */
  private elecApuGenFaultItem(gen: number): EwdAbnormalItem {
    return {
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.elecApuGenFault[gen],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.elecApuGenPbOn[gen].get()],
      inopSysAllPhases: () => [APU_GEN_INOP_SYS[gen]],
      failure: 2,
      sysPage: SdPages.ElecAc,
    };
  }

  /**
   * ELEC TR 1(2)(ESS) FAULT (no master light, no audio): crew awareness.
   * @param tr 0 for TR 1, 1 for TR 2, 2 for TR ESS
   */
  private elecTrFaultItem(tr: number): EwdAbnormalItem {
    return {
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.elecTrFault[tr],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      inopSysAllPhases: () => [TR_INOP_SYS[tr]],
      failure: 1,
      sysPage: SdPages.ElecDc,
    };
  }

  /**
   * DOOR MAIN 1(2)(3)(4)(5)L(R) / UPPER 1(2)(3)L(R) NOT CLOSED and DOOR FWD(AFT) CARGO NOT CLOSED (520800017-034),
   * A380 FCOM PRO-ABN-ECAM-10-52: "The door is not closed and is not locked." One procedure for all doors:
   * PACK 1+2 & CAB PRESS NOT AVAIL only in flight phases 2 or 3 if pressurization is not available, then in flight
   * IF ABNORM CAB V/S (crew-confirmed condition, which also adds MAX FL 100/MEA to the LIMITATIONS).
   * See DoorAlerts.ts for the door list and the trigger.
   */
  private doorNotClosedAlerts(): EwdAbnormalDict {
    const doorNotClosedItem = (doorNotClosed: Subscribable<boolean>): EwdAbnormalItem => ({
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: doorNotClosed,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        (this.fws.flightPhase.get() === 2 || this.fws.flightPhase.get() === 3) && this.fws.pressSysFault.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
      ],
      whichItemsChecked: () => [false, false, false, false, false, false],
      failure: 2,
      sysPage: SdPages.Door,
      limitationsAllPhases: (checked) => (checked[1] ? ['210400001'] : []),
      limitationsPfd: (checked) => (checked[1] ? ['210400001'] : []),
    });
    const alerts: EwdAbnormalDict = {};
    this.fws.cabinDoorNotClosed.forEach((doorNotClosed, index) => {
      alerts[cabinDoorNotClosedAlertId(index)] = doorNotClosedItem(doorNotClosed);
    });
    this.fws.cargoDoorNotClosed.forEach((doorNotClosed, index) => {
      alerts[cargoDoorNotClosedAlertId(index)] = doorNotClosedItem(doorNotClosed);
    });
    return alerts;
  }

  /**
   * A-ICE ENG 1(2)(3)(4) VLV CLOSED / VLV OPEN and A-ICE L(R) WING VLV CLOSED / VLV OPEN / VLV PRESS HI / VLV PRESS LO
   * (300800010-025), A380 FCOM PRO-ABN-ECAM-10-30 (a380_fcom.txt l.156370-157060). Flight phase inhibitions, audio and
   * master lights from the FCOM figures (2019 FCOM PDF pages 5338-5355): PRESS HI has no audio and no master light.
   * See AntiIceValveAlerts.ts for the triggers and the procedure lines.
   */
  private antiIceValveAlerts(): EwdAbnormalDict {
    const alerts: EwdAbnormalDict = {};
    const valves = this.fws.antiIceValveAlerts;
    const avoidIcing = () => [AVOID_ICING_LIMITATION];
    [0, 1, 2, 3].forEach((engine) => {
      alerts[ANTI_ICE_VALVE_ALERT_IDS.engineValveClosed[engine]] = {
        flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
        simVarIsActive: valves.engineValveClosed[engine],
        notActiveWhenItemActive: [],
        whichItemsToShow: () => [true],
        whichItemsChecked: () => [false],
        failure: 2,
        sysPage: SdPages.None,
        limitationsAllPhases: avoidIcing,
        limitationsPfd: avoidIcing,
        inopSysAllPhases: () => [ENGINE_ANTI_ICE_INOP_SYS[engine]],
      };
      alerts[ANTI_ICE_VALVE_ALERT_IDS.engineValveOpen[engine]] = {
        flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 11, 12],
        simVarIsActive: valves.engineValveOpen[engine],
        notActiveWhenItemActive: [],
        whichItemsToShow: () => [],
        whichItemsChecked: () => [],
        failure: 2,
        sysPage: SdPages.None,
      };
    });
    [0, 1].forEach((wing) => {
      const leftWing = wing === 0;
      alerts[ANTI_ICE_VALVE_ALERT_IDS.wingValveClosed[wing]] = {
        flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11, 12],
        simVarIsActive: valves.wingValveClosed[wing],
        notActiveWhenItemActive: [],
        whichItemsToShow: () => [true, true],
        whichItemsChecked: () => [!this.fws.wingAntiIce.get(), false],
        failure: 2,
        sysPage: SdPages.Bleed,
        limitationsAllPhases: avoidIcing,
        limitationsPfd: avoidIcing,
        inopSysAllPhases: () => [WING_ANTI_ICE_INOP_SYS],
      };
      const bleedControls = () => {
        const firstEngine = leftWing ? 0 : 2;
        return {
          onGround: this.fws.aircraftOnGround.get(),
          beforeTakeoff: this.fws.flightPhase.get() <= 2,
          crossBleedShut: this.fws.xBleedSelectorShut.get(),
          crossBleedAuto: this.fws.xBleedSelectorAuto.get(),
          packOn: !!(leftWing ? this.fws.pack1On : this.fws.pack2On).get(),
          firstEngineBleedOn: valves.engineBleedPbAuto[firstEngine],
          secondEngineBleedOn: valves.engineBleedPbAuto[firstEngine + 1],
          apuBleedOn: !!this.fws.apuBleedPbOn.get(),
        };
      };
      alerts[ANTI_ICE_VALVE_ALERT_IDS.wingValveOpen[wing]] = {
        flightPhaseInhib: [3, 4, 5, 6, 7, 10],
        simVarIsActive: valves.wingValveOpen[wing],
        notActiveWhenItemActive: [],
        whichItemsToShow: () => wingValveOpenLines(bleedControls(), leftWing).show,
        whichItemsChecked: () => wingValveOpenLines(bleedControls(), leftWing).checked,
        failure: 2,
        sysPage: SdPages.Bleed,
      };
      alerts[ANTI_ICE_VALVE_ALERT_IDS.wingPressHi[wing]] = {
        flightPhaseInhib: [4, 5, 6, 7],
        simVarIsActive: valves.wingValvePressHi[wing],
        notActiveWhenItemActive: [],
        whichItemsToShow: () => [],
        whichItemsChecked: () => [],
        failure: 1,
        sysPage: SdPages.None,
      };
      const failedAfterPressLo = (checked: boolean[]) =>
        isWingAntiIceFailedAfterPressLo(this.fws.aircraftOnGround.get(), checked);
      alerts[ANTI_ICE_VALVE_ALERT_IDS.wingPressLo[wing]] = {
        flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 12],
        simVarIsActive: valves.wingValvePressLo[wing],
        notActiveWhenItemActive: [],
        whichItemsToShow: () => wingPressLoLines(this.fws.aircraftOnGround.get(), this.fws.wingAntiIce.get()).show,
        whichItemsChecked: () => wingPressLoLines(this.fws.aircraftOnGround.get(), this.fws.wingAntiIce.get()).checked,
        failure: 2,
        sysPage: SdPages.Bleed,
        limitationsAllPhases: (checked) => (failedAfterPressLo(checked) ? [AVOID_ICING_LIMITATION] : []),
        limitationsPfd: (checked) => (failedAfterPressLo(checked) ? [AVOID_ICING_LIMITATION] : []),
        inopSysAllPhases: (checked) => (failedAfterPressLo(checked) ? [WING_ANTI_ICE_INOP_SYS] : []),
      };
    });
    return alerts;
  }

  /**
   * The SMOKE alerts of the cargo compartments and the avionics / IFE bays, fed by the SDF of systems.wasm (see
   * SmokeAlerts.ts for the alerts, the procedures and the flight phase inhibitions of the FCOM PDF p.4982-5007)
   */
  private smokeAlerts(): EwdAbnormalDict {
    const state = (forwardCargo: boolean): SmokeProcedureState => ({
      cabFansOn: this.fws.cabFansOn.get(),
      galleyOff: this.fws.elecGalleyOff.get(),
      signsOn: this.fws.seatBelt.get() === 1,
      oneEngineRunning: this.fws.oneEngineRunning.get(),
      isolValvesPbOn: forwardCargo ? this.fws.fwdIsolValvePbOn.get() : this.fws.bulkIsolValvePbOn.get(),
      agentDischarged: forwardCargo ? this.fws.cargoFireAgentDisch.get() : this.fws.aftCargoFireAgentDisch.get(),
    });
    const alerts: EwdAbnormalDict = {};
    SMOKE_ZONES.forEach((smokeZone, index) => {
      const cargo = smokeZone.zone.endsWith('_CARGO');
      const forwardCargo = smokeZone.zone === 'FWD_CARGO';
      const upperBay = smokeZone.zone.includes('UPPER');
      const mainBay = smokeZone.zone.includes('MAIN');
      const smokeId = Number(smokeZone.smokeAlert);
      const detFaultId = Number(smokeZone.detFaultAlert);
      alerts[smokeId] = {
        flightPhaseInhib: SMOKE_WARNING_PHASE_INHIBITION,
        simVarIsActive: this.fws.smokeZoneWarning[index],
        notActiveWhenItemActive: [],
        whichItemsToShow: cargo ? () => cargoSmokeItemsToShow(state(forwardCargo)) : showAllItems(smokeId),
        whichItemsChecked: () => {
          if (cargo) {
            return cargoSmokeItemsChecked(state(forwardCargo));
          }
          if (smokeZone.zone === 'IFE_BAY') {
            // CAB FANS OFF, IFEC OFF, CKPT / CABIN COM ESTABLISH (PDF p.4991-4992)
            return [!this.fws.cabFansOn.get(), false, false];
          }
          return avionicsSmokeItemsChecked(state(false), upperBay, mainBay);
        },
        failure: 3,
        sysPage: cargo || smokeZone.zone === 'AFT_AVNCS' ? SdPages.Cond : SdPages.None,
      };
      alerts[detFaultId] = {
        flightPhaseInhib: SMOKE_DET_FAULT_PHASE_INHIBITION,
        simVarIsActive: this.fws.smokeZoneDetFault[index],
        notActiveWhenItemActive: [],
        whichItemsToShow: showAllItems(detFaultId),
        whichItemsChecked: () => {
          if (!cargo) {
            return EcamAbnormalProcedures[detFaultId].items.map(() => false);
          }
          // IF NO LIVESTOCK : FWD (BULK) ISOL VALVES OFF (and BULK CARGO HEATER OFF, not read), PDF p.5004
          const isolValvesOff = forwardCargo ? !this.fws.fwdIsolValvePbOn.get() : !this.fws.bulkIsolValvePbOn.get();
          return forwardCargo ? [false, isolValvesOff] : [false, isolValvesOff, false];
        },
        failure: 2,
        sysPage: SdPages.None,
        inopSysAllPhases: () => [smokeZone.detFaultInopSys],
      };
    });
    // SMOKE FWD+AFT CARGOS BTL 1(2) FAULT (PDF p.5007): "Fire extinguishing bottle 1(2) of the cargo compartments is
    // failed", here its loss of agent
    this.fws.cargoBottleLowPressure.forEach((lowPressure, index) => {
      alerts[260800052 + index] = {
        flightPhaseInhib: CARGO_BOTTLE_FAULT_PHASE_INHIBITION,
        simVarIsActive: lowPressure,
        notActiveWhenItemActive: [],
        whichItemsToShow: () => [],
        whichItemsChecked: () => [],
        failure: 2,
        sysPage: SdPages.None,
        inopSysAllPhases: () => [CARGO_BOTTLE_FAULT_INOP_SYS[index]],
      };
    });
    return alerts;
  }

  public readonly abnormalShown = Subject.create(false);

  public readonly showAbnormalSensedRequested = Subject.create(false);

  /** ID of active abnormal procedure */
  public readonly activeProcedureId = Subject.create<string | null>(null);

  /** Marked with cyan box */
  public readonly selectedItemIndex = Subject.create(1);

  /** For overflowing checklists */
  public readonly showFromLine = Subject.create(0);

  private procedures: ProcedureLinesGenerator[] = [];

  private activeProcedure: ProcedureLinesGenerator | undefined = undefined;

  static compareAbnormalProceduresByPriority(
    idA: string,
    idB: string,
    failureLevelA: number,
    failureLevelB: number,
    nonSensedA: boolean,
    nonSensedB: boolean,
  ) {
    // 9998: Secondary failures at the end; non-sensed procedures at the top
    const bPriority = idB.substring(0, 4) === '9998' ? 0 : nonSensedB ? 4 : failureLevelB;
    const aPriority = idA.substring(0, 4) === '9998' ? 0 : nonSensedA ? 4 : failureLevelA;

    // Sort desceding, from highest failure level to lowest
    return bPriority - aPriority;
  }

  constructor(private fws: FwsCore) {
    this.subscriptions.push(
      this.fws.presentedAbnormalProceduresList.sub(
        (
          map: ReadonlyMap<string, ChecklistState>,
          type: SubscribableMapEventType,
          key: string,
          value: ChecklistState,
        ) => {
          const flattened: ChecklistState[] = [];
          map.forEach((val, key) =>
            flattened.push({
              id: key,
              procedureActivated: val.procedureActivated,
              procedureCompleted: val.procedureCompleted,
              itemsChecked: val.itemsChecked,
              itemsActive: val.itemsActive,
              itemsToShow: val.itemsToShow,
              itemsTimeStamp: val.itemsTimeStamp,
            }),
          );
          // Sort by decreasing importance
          const sortedAbnormalsFlattened = flattened.sort((a, b) => {
            return FwsAbnormalSensed.compareAbnormalProceduresByPriority(
              a.id,
              b.id,
              this.fws.ewdAbnormal[a.id].failure,
              this.fws.ewdAbnormal[b.id].failure,
              !EcamAbnormalProcedures[a.id].sensed,
              !EcamAbnormalProcedures[b.id].sensed,
            );
          });

          if (type === SubscribableMapEventType.Added) {
            const procGen = new ProcedureLinesGenerator(
              value.id,
              this.activeProcedureId.map((id) => value.id === id),
              ProcedureType.Abnormal,
              value,
              (newState) => this.fws.presentedAbnormalProceduresList.setValue(value.id, newState),
              this.clearActiveProcedure.bind(this),
              () => {},
              this.fws.aircraftOnGround.get() ? undefined : EcamAbnormalProcedures[value.id].recommendation,
            );
            this.procedures.push(procGen);
          } else if (type === SubscribableMapEventType.Changed) {
            const procGenIndex = this.procedures.findIndex((v) => v.procedureId === key);
            if (procGenIndex !== -1) {
              this.procedures[procGenIndex].checklistState = value;
            }
          } else if (type === SubscribableMapEventType.Deleted) {
            const procGenIndex = this.procedures.findIndex((v) => v.procedureId === key);
            this.procedures.splice(procGenIndex, 1);
          }

          sortedAbnormalsFlattened.forEach((val) => {
            if (val.id === this.activeProcedureId.get()) {
              const procGenIndex = this.procedures.findIndex((v) => v.procedureId === val.id);
              if (procGenIndex !== -1) {
                this.activeProcedure = this.procedures[procGenIndex];
                this.activeProcedure.selectedItemIndex.pipe(this.selectedItemIndex);
              }
            }
          });

          this.activeProcedureId.set(sortedAbnormalsFlattened.length > 0 ? sortedAbnormalsFlattened[0].id : null);
          this.pub.pub('fws_abn_sensed_procedures', sortedAbnormalsFlattened, true);
        },
      ),
    );

    this.subscriptions.push(
      this.abnormalShown.sub((shown) => {
        if (shown) {
          this.activeProcedure?.selectFirst();
        }
      }),
    );

    this.subscriptions.push(
      this.activeProcedureId.sub((id) => {
        if (id) {
          this.procedures.forEach((val) => {
            if (val.procedureId === id) {
              this.activeProcedure = val;
              this.activeProcedure.selectedItemIndex.pipe(this.selectedItemIndex);
            }
          });
          this.activeProcedure?.selectFirst();
        }
      }),
    );

    this.subscriptions.push(this.selectedItemIndex.sub(() => this.scrollToSelectedLine()));

    this.publishInitialState();
  }

  publishInitialState() {
    this.pub.pub('fws_abn_sensed_procedures', [], true);
  }

  getAbnormalProceduresKeysSorted() {
    return Array.from(this.fws.presentedAbnormalProceduresList.get().keys());
  }

  public clearActiveProcedure(newState?: ChecklistState) {
    const activeProcedureId = this.activeProcedureId.get();
    if (activeProcedureId === null) {
      return;
    }

    const numFailures = this.fws.presentedFailures.length;
    if (numFailures === 1) {
      if (!this.fws.ecamStatusNormal.get()) {
        // Call STS page on SD
        SimVar.SetSimVarValue('L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX', SimVarValueType.Enum, SdPages.Status);
      }

      // If there are deferred procedures, open ECL menu
      this.fws.normalChecklists.openIfDeferredApplicable();
    }
    this.fws.presentedFailures.splice(this.fws.presentedFailures.indexOf(activeProcedureId), 1);
    // The RCL LAST pb cancels the last CLEAR action (FwsRecall.ts)
    this.fws.clearHistory.onCleared(activeProcedureId);

    // Delete procedure completely if not-sensed procedure is de-activated
    if (newState?.procedureActivated === false && EcamAbnormalProcedures[activeProcedureId]?.sensed === false) {
      this.fws.activeAbnormalNonSensedKeys.delete(parseInt(activeProcedureId));
      this.fws.allCurrentFailures.splice(this.fws.allCurrentFailures.indexOf(activeProcedureId), 1);
    }

    this.fws.recallFailures = this.fws.allCurrentFailures.filter(
      (item) => !this.fws.presentedFailures.includes(item) && !this.fws.emerCancel.isCancelledCaution(item),
    );
  }

  private scrollToSelectedLine() {
    if (!this.activeProcedure) {
      return;
    }

    this.showFromLine.set(Math.max(0, this.activeProcedure.numLinesUntilSelected() - WD_NUM_LINES + 2));
  }

  private checkIfStsAutoDisplay() {
    const approachCondition =
      this.fws.presentedAbnormalProceduresList.get().size === 0 &&
      this.fws.flightPhase.get() === 8 &&
      (this.fws.adrPressureAltitude.get() ?? 0) < 20_000 &&
      !this.fws.ecamStatusNormal.get();
    const triggerAutoDisplay =
      this.fws.approachAutoDisplayQnhSetPulseNode.read() || this.fws.approachAutoDisplaySlatsExtendedPulseNode.read();

    if (approachCondition && triggerAutoDisplay) {
      // Call STS page on SD
      SimVar.SetSimVarValue('L:A32NX_ECAM_SD_CURRENT_PAGE_INDEX', SimVarValueType.Enum, SdPages.Status);
    }
  }

  /**
   * The majority of ECAM fault logic is still inside FwsCore (due to dependencies to MEMOs, and general flow)
   * This block deals mostly with the pilot interaction through the ECAM CP and transmission to the CDS/EWD
   */
  update() {
    if (this.fws.presentedAbnormalProceduresList.get().size > 0) {
      this.showAbnormalSensedRequested.set(true);
    } else {
      this.showAbnormalSensedRequested.set(false);
    }

    this.checkIfStsAutoDisplay();

    if (!this.abnormalShown.get()) {
      return;
    }

    if (this.fws.clDownPulseNode.read()) {
      this.activeProcedure?.moveDown(true);
    }

    if (this.fws.clUpPulseNode.read()) {
      this.activeProcedure?.moveUp();
    }

    if (this.fws.clCheckPulseNode.read()) {
      this.activeProcedure?.checkSelected();
    }

    // Auto-move-down if currently marked item was sensed as completed
    const ids = this.getAbnormalProceduresKeysSorted();

    if (this.activeProcedure) {
      for (let id = 0; id < ids.length; id++) {
        const procId = ids[id];

        if (!this.fws.ewdAbnormal[procId] || !this.fws.abnormalUpdatedItems.has(procId)) {
          continue;
        }

        if (procId === this.activeProcedureId.get()) {
          const changedEntries = this.fws.abnormalUpdatedItems.get(procId);
          const sii = this.activeProcedure.selectedItemIndex.get();
          if (changedEntries && changedEntries.includes(sii) && this.activeProcedure.checklistState.itemsChecked[sii]) {
            this.activeProcedure.moveDown(true);
          }
        }
      }
    }
  }

  reset() {
    this.showAbnormalSensedRequested.set(false);
  }

  destroy() {
    this.subscriptions.forEach((s) => s.destroy());

    for (const key in this.ewdAbnormalSensed) {
      const element = this.ewdAbnormalSensed[key];
      if ('destroy' in element.simVarIsActive) {
        element.simVarIsActive.destroy();
      }

      if (element.auralWarning && 'destroy' in element.auralWarning) {
        element.auralWarning.destroy();
      }
    }

    for (const key in this.ewdDeferredProcs) {
      const element = this.ewdDeferredProcs[key];
      if ('destroy' in element.simVarIsActive) {
        element.simVarIsActive.destroy();
      }

      if (element.auralWarning && 'destroy' in element.auralWarning) {
        element.auralWarning.destroy();
      }
    }
  }

  /**
   * ENG n START FAULT (701800117-120), START VLV FAULT (NOT CLOSED) (121-124), (NOT OPEN) (125-128), IGN A FAULT
   * (057-060), IGN B FAULT (061-064), IGN A+B FAULT (065-068), see EngineStartAlerts.ts. Amber cautions.
   */
  private engineStartAlerts(): EwdAbnormalDict {
    const alerts: EwdAbnormalDict = {};
    const masters = [this.fws.engine1Master, this.fws.engine2Master, this.fws.engine3Master, this.fws.engine4Master];
    for (let index = 0; index < 4; index++) {
      const engineNumber = (index + 1) as 1 | 2 | 3 | 4;
      const valveInputs = () => ({
        engineNumber,
        onGround: this.fws.aircraftOnGround.get(),
        masterOn: masters[index].get(),
        manualStartPbOn: this.fws.engineManualStartPbOn[index],
        apuBleedPbOn: this.fws.apuBleedPbOn.get(),
      });
      const startFault = () =>
        startFaultItems({
          fault: this.fws.engineStartFault[index],
          phase: this.fws.engineStartPhase[index],
          attempt: this.fws.engineStartAttempt[index],
          manualStart: this.fws.engineStartManual[index],
          onGround: this.fws.aircraftOnGround.get(),
          masterOn: masters[index].get(),
          manualStartPbOn: this.fws.engineManualStartPbOn[index],
          engStartSelector: this.fws.engSelectorPosition.get(),
          apuBleedPbOn: this.fws.apuBleedPbOn.get(),
          allThrustLeversIdle: this.fws.allThrottleIdle.get(),
        });
      // START FAULT: no aural, no MASTER light and no SD page
      alerts[701800117 + index] = {
        flightPhaseInhib: START_ALERTS_FLIGHT_PHASE_INHIBITION,
        simVarIsActive: this.fws.engineStartFaultActive[index],
        notActiveWhenItemActive: [],
        whichItemsToShow: () => startFault().show,
        whichItemsChecked: () => startFault().checked,
        failure: START_FAULT_LEVEL,
        sysPage: SdPages.None,
      };
      // START VLV FAULT (NOT CLOSED) LIMITATIONS and STATUS; the deferred procedure is ata70 700700001
      const valveNotClosedStatus = startValveNotClosedStatus(engineNumber);
      alerts[701800121 + index] = {
        flightPhaseInhib: START_ALERTS_FLIGHT_PHASE_INHIBITION,
        simVarIsActive: this.fws.engineStartValveNotClosed[index],
        notActiveWhenItemActive: [],
        whichItemsToShow: () => startValveNotClosedItems(valveInputs()).show,
        whichItemsChecked: () => startValveNotClosedItems(valveInputs()).checked,
        failure: 2,
        sysPage: SdPages.Eng,
        limitationsAllPhases: () => valveNotClosedStatus.limitations,
        limitationsPfd: () => valveNotClosedStatus.limitations,
        inopSysAllPhases: () => valveNotClosedStatus.inopSys,
      };
      alerts[701800125 + index] = {
        flightPhaseInhib: START_ALERTS_FLIGHT_PHASE_INHIBITION,
        simVarIsActive: this.fws.engineStartValveNotOpen[index],
        notActiveWhenItemActive: [],
        whichItemsToShow: () => startValveNotOpenItems(valveInputs()).show,
        whichItemsChecked: () => startValveNotOpenItems(valveInputs()).checked,
        failure: 2,
        sysPage: SdPages.Eng,
      };
      // IGN A(B) FAULT: crew awareness, no aural and no MASTER light; IGN A+B FAULT: SC + MASTER CAUT
      const ignitionFault = (simVarIsActive: Subscribable<boolean>, flightPhaseInhib: number[], level: number) => ({
        flightPhaseInhib,
        simVarIsActive,
        notActiveWhenItemActive: [],
        whichItemsToShow: () => [],
        whichItemsChecked: () => [],
        failure: level,
        sysPage: SdPages.None,
      });
      alerts[701800057 + index] = ignitionFault(
        this.fws.engineIgnAFault[index],
        IGN_FAULT_FLIGHT_PHASE_INHIBITION,
        IGN_A_OR_B_FAULT_LEVEL,
      );
      alerts[701800061 + index] = ignitionFault(
        this.fws.engineIgnBFault[index],
        IGN_FAULT_FLIGHT_PHASE_INHIBITION,
        IGN_A_OR_B_FAULT_LEVEL,
      );
      alerts[701800065 + index] = ignitionFault(
        this.fws.engineIgnAPlusBFault[index],
        START_ALERTS_FLIGHT_PHASE_INHIBITION,
        IGN_A_AND_B_FAULT_LEVEL,
      );
    }
    return alerts;
  }

  /**
   * ENG n HP FUEL VLV FAULT (701800053-056) and the FADEC fault crew awareness alerts FUEL STRAINER CLOGGED, FUEL FILTER
   * MONITORING FAULT, OIL CHIP DETECTED, MINOR FAULT, OVTHR PROT LOST, SENSOR FAULT: A380 FCOM PRO-ABN-ECAM-10-70, see
   * EngineMonitoringAlerts.ts.
   */
  private engineMonitoringAlerts(): EwdAbnormalDict {
    const alerts: EwdAbnormalDict = {};
    const masters = [this.fws.engine1Master, this.fws.engine2Master, this.fws.engine3Master, this.fws.engine4Master];
    const fireButtons = [
      this.fws.fireButtonEng1,
      this.fws.fireButtonEng2,
      this.fws.fireButtonEng3,
      this.fws.fireButtonEng4,
    ];
    for (let index = 0; index < 4; index++) {
      const items = () =>
        hpFuelVlvFaultItems({
          fault: this.fws.engineHpFuelValveFault[index],
          onGround: this.fws.aircraftOnGround.get(),
          masterOn: masters[index].get(),
          manualStartPbOn: this.fws.engineManualStartPbOn[index],
          firePbReleased: fireButtons[index].get(),
        });
      alerts[701800053 + index] = {
        flightPhaseInhib: HP_FUEL_VLV_FAULT_PHASE_INHIBITION,
        simVarIsActive: this.fws.engineHpFuelVlvFaultActive[index],
        notActiveWhenItemActive: [],
        whichItemsToShow: () => items().show,
        whichItemsChecked: () => items().checked,
        failure: HP_FUEL_VLV_FAULT_LEVEL,
        sysPage: SdPages.Eng,
      };
      ENGINE_MONITORING_ALERTS.forEach((alert, alertIndex) => {
        alerts[alert.engine1Key + index] = {
          flightPhaseInhib: alert.flightPhaseInhibition,
          simVarIsActive: this.fws.engineMonitoringAlertActive[alertIndex][index],
          notActiveWhenItemActive: [],
          whichItemsToShow: () => [],
          whichItemsChecked: () => [],
          failure: ENGINE_MONITORING_ALERT_LEVEL,
          sysPage: SdPages.None,
        };
      });
    }
    return alerts;
  }

  /** AIR ENG n BLEED FAULT and the bleed leak alerts (BleedMonitoringAlerts.ts, ata35-36-42.ts) */
  private bleedMonitoringAlerts(): EwdAbnormalDict {
    const alerts: EwdAbnormalDict = {};
    for (let engine = 0; engine < 4; engine++) {
      alerts[ENG_BLEED_FAULT_ALERT_IDS[engine]] = {
        flightPhaseInhib: BLEED_ALERTS_FLIGHT_PHASE_INHIBITION,
        simVarIsActive: this.fws.engineBleedFault[engine],
        notActiveWhenItemActive: [],
        whichItemsToShow: () => engineBleedFaultItems(this.fws.bleedMonitoringInputs, engine).show,
        whichItemsChecked: () => engineBleedFaultItems(this.fws.bleedMonitoringInputs, engine).checked,
        failure: BLEED_ALERTS_LEVEL,
        sysPage: SdPages.Bleed,
        inopSysAllPhases: () => engineBleedFaultInopSys(this.fws.bleedMonitoringInputs, engine),
      };
      const leakAlert = (simVarIsActive: Subscribable<boolean>, wing: boolean): EwdAbnormalItem => ({
        flightPhaseInhib: BLEED_ALERTS_FLIGHT_PHASE_INHIBITION,
        simVarIsActive,
        notActiveWhenItemActive: [],
        whichItemsToShow: () => bleedLeakItems(this.fws.bleedMonitoringInputs, engine, wing).show,
        whichItemsChecked: () => bleedLeakItems(this.fws.bleedMonitoringInputs, engine, wing).checked,
        failure: BLEED_ALERTS_LEVEL,
        sysPage: SdPages.Bleed,
        inopSysAllPhases: () => bleedLeakInopSys(this.fws.bleedMonitoringInputs, engine, wing),
        limitationsAllPhases: () => bleedLeakLimitations(this.fws.bleedMonitoringInputs, engine),
        limitationsPfd: () => bleedLeakLimitations(this.fws.bleedMonitoringInputs, engine),
      });
      alerts[ENG_BLEED_LEAK_ALERT_IDS[engine]] = leakAlert(this.fws.engineBleedLeak[engine], false);
      alerts[WING_LEAK_ALERT_IDS[engine]] = leakAlert(this.fws.wingBleedLeak[engine], true);
    }
    return alerts;
  }

  public ewdAbnormalSensed: EwdAbnormalDict = {
    ...this.engineStartAlerts(),
    ...this.bleedMonitoringAlerts(),
    ...this.engineMonitoringAlerts(),
    // ATA 21 - AIR CONDITIONING AND PRESSURIZATION
    211800001: {
      // PACK 1 CTL 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.pack1Ctl1Fault,
      notActiveWhenItemActive: ['211800009', '211800021'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Bleed,
      redundLoss: () => ['210300001'],
    },
    211800002: {
      // PACK 1 CTL 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.pack1Ctl2Fault,
      notActiveWhenItemActive: ['211800009', '211800021'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Bleed,
      redundLoss: () => ['210300002'],
    },
    211800003: {
      // PACK 2 CTL 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.pack2Ctl1Fault,
      notActiveWhenItemActive: ['211800010', '211800021'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Bleed,
      redundLoss: () => ['210300003'],
    },
    211800004: {
      // PACK 2 CTL 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.pack2Ctl2Fault,
      notActiveWhenItemActive: ['211800010', '211800021'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Bleed,
      redundLoss: () => ['210300004'],
    },
    211800005: {
      // PACK 1 CTL DEGRADED
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.pack1Degraded,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Bleed,
      inopSysAllPhases: () => ['210300005'],
    },
    211800006: {
      // PACK 2 CTL DEGRADED
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.pack2Degraded,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Bleed,
      inopSysAllPhases: () => ['210300006'],
    },
    211800007: {
      // PACK 1 CTL REDUNDANCY LOST
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.pack1RedundLost,
      notActiveWhenItemActive: ['211800005'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Bleed,
      redundLoss: () => ['210300007'],
    },
    211800008: {
      // PACK 2 CTL REDUNDANCY LOST
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.pack2RedundLost,
      notActiveWhenItemActive: ['211800006'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Bleed,
      redundLoss: () => ['210300008'],
    },
    211800009: {
      // PACK 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        ([fdac1fault, fdac2fault]) => fdac1fault && fdac2fault,
        this.fws.fdac1Channel1Failure,
        this.fws.fdac1Channel2Failure,
      ),
      notActiveWhenItemActive: ['211800021'],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, !this.fws.pack1On.get()],
      failure: 2,
      sysPage: SdPages.Bleed,
      inopSysAllPhases: () => ['210300009'],
    },
    211800010: {
      // PACK 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        ([fdac1fault, fdac2fault]) => fdac1fault && fdac2fault,
        this.fws.fdac2Channel1Failure,
        this.fws.fdac2Channel2Failure,
      ),
      notActiveWhenItemActive: ['211800021'],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, !this.fws.pack2On.get()],
      failure: 2,
      sysPage: SdPages.Bleed,
      inopSysAllPhases: () => ['210300010'],
    },
    211800011: {
      // PACK 1 OFF
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
      simVarIsActive: this.fws.pack1OffConfirmTime,
      notActiveWhenItemActive: ['211800009', '211800021'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Bleed,
      inopSysAllPhases: () => ['210300009'],
    },
    211800012: {
      // PACK 2 OFF
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
      simVarIsActive: this.fws.pack2OffConfirmTime,
      notActiveWhenItemActive: ['211800010', '211800021'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Bleed,
      inopSysAllPhases: () => ['210300010'],
    },
    211800021: {
      // PACK 1+2 FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.pack1And2Fault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        false,
        false,
        true,
        true,
        false,
        false,
        false,
        !this.fws.aircraftOnGround.get() && this.fws.flightLevel.get() > 100,
        !this.fws.aircraftOnGround.get() && this.fws.flightLevel.get() > 100,
        !this.fws.aircraftOnGround.get() && this.fws.flightLevel.get() > 100,
        !this.fws.aircraftOnGround.get() && this.fws.flightLevel.get() > 100,
        !this.fws.aircraftOnGround.get() && this.fws.flightLevel.get() > 100,
        !this.fws.aircraftOnGround.get() && this.fws.flightLevel.get() <= 100,
        !this.fws.aircraftOnGround.get() && this.fws.flightLevel.get() <= 100,
        !this.fws.aircraftOnGround.get() && this.fws.flightLevel.get() <= 100,
      ], // TODO: Add logic for doors on ground and pack overheat
      whichItemsChecked: () => [
        false,
        false,
        !this.fws.pack1On.get(),
        !this.fws.pack2On.get(),
        false,
        false,
        false,
        false,
        false,
        false,
        this.fws.ramAirOn.get(),
        this.fws.cabinAirExtractOn.get(),
        false,
        this.fws.ramAirOn.get(),
        this.fws.cabinAirExtractOn.get(),
      ],
      failure: 2,
      sysPage: SdPages.Bleed,
      limitationsAllPhases: () => ['2', '210400001'],
      limitationsPfd: () => ['2', '210400001'],
      inopSysAllPhases: () => ['210300011'],
    },
    211800023: {
      // ALL PRIMARY CABIN FANS FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.allCabinFansFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [this.fws.flowSelectorKnob.get() === 3],
      failure: 2,
      sysPage: SdPages.Cond,
      info: () => ['210200001'],
      inopSysAllPhases: () => ['210300012'],
    },
    211800025: {
      // BULK CARGO HEATER FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.bulkCargoHeaterFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      inopSysAllPhases: () => ['210300013'],
    },
    211800026: {
      // BULK CARGO ISOL FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        ([bulkIsolOpen, bulkIsolFault]) => bulkIsolOpen && bulkIsolFault,
        this.fws.bulkIsolValveOpen,
        this.fws.bulkIsolValveFault,
      ),
      notActiveWhenItemActive: ['211800027'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.bulkIsolValvePbOn.get()],
      failure: 2,
      sysPage: SdPages.Cond,
      inopSysAllPhases: () => ['210300014'],
    },
    211800027: {
      // BULK CARGO VENT FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([bulkIsolOpen, bulkIsolFault]) => !bulkIsolOpen && bulkIsolFault,
        this.fws.bulkIsolValveOpen,
        this.fws.bulkIsolValveFault,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      inopSysAllPhases: () => ['210300013', '210300015'],
    },
    211800028: {
      // COND DUCT OVHT. Design choice: the phase inhibition of COND HOT AIR FAULT (the real inhibition is not known)
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        () => condDuctOvhtActive(this.fws.trimAirMonitoringFlags()),
        this.fws.ckptDuctOvht,
        this.fws.cabinDuctOvhtHotAir1,
        this.fws.cabinDuctOvhtHotAir2,
        this.fws.fwdCargoDuctOvht,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () =>
        condDuctOvhtItems(this.fws.trimAirMonitoringFlags(), this.fws.hotAirValveFlags(), this.fws.packPbsOn()).show,
      whichItemsChecked: () =>
        condDuctOvhtItems(this.fws.trimAirMonitoringFlags(), this.fws.hotAirValveFlags(), this.fws.packPbsOn()).checked,
      // Audio, master light, HOT AIR pb local light and COND SD page
      failure: 2,
      sysPage: SdPages.Cond,
      info: () => condDuctOvhtInfo(this.fws.trimAirMonitoringFlags()),
      inopSysAllPhases: () => condDuctOvhtInopSys(this.fws.trimAirMonitoringFlags()),
    },
    211800029: {
      // FWD CARGO ISOL FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        ([fwdIsolOpen, fwdIsolFault]) => fwdIsolOpen && fwdIsolFault,
        this.fws.fwdIsolValveOpen,
        this.fws.fwdIsolValveFault,
      ),
      notActiveWhenItemActive: ['211800031'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.fwdIsolValvePbOn.get()],
      failure: 2,
      sysPage: SdPages.Cond,
      inopSysAllPhases: () => ['210300016'],
    },
    211800030: {
      // COND FWD CARGO TEMP REGUL FAULT. Design choice: the phase inhibition of COND FWD CARGO ISOL FAULT (the real
      // inhibition is not known)
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        () => fwdCargoTempRegulFaultActive(this.fws.trimAirMonitoringFlags()),
        this.fws.fwdCargoTrimAirValveFault,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => fwdCargoTempRegulFaultItemsToShow(this.fws.trimAirMonitoringFlags()),
      whichItemsChecked: () => [false, false],
      // COND SD page only, no audio and no master light
      failure: 1,
      sysPage: SdPages.Cond,
      // FWD CRG TEMP REGUL DEGRADED
      info: () => ['210200003'],
      inopSysAllPhases: () => [],
    },
    211800031: {
      // FWD CARGO VENT FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([fwdIsolOpen, fwdIsolFault]) => !fwdIsolOpen && fwdIsolFault,
        this.fws.fwdIsolValveOpen,
        this.fws.fwdIsolValveFault,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      info: () => ['210200002', '210200003'],
      inopSysAllPhases: () => ['210300017', '210300018'],
    },
    211800032: {
      // HOT AIR 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        ([hotAirDisagrees, hotAirOpen]) => hotAirDisagrees && !hotAirOpen,
        this.fws.hotAir1Disagrees,
        this.fws.hotAir1Open,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, !this.fws.hotAir1PbOn.get()],
      whichItemsChecked: () => [false, this.fws.hotAir1PbOn.get()],
      failure: 1,
      sysPage: SdPages.Cond,
      info: () => ['210200001'],
      inopSysAllPhases: () => ['210300019', '210300020'],
    },
    211800033: {
      // HOT AIR 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        ([hotAirDisagrees, hotAirOpen]) => hotAirDisagrees && !hotAirOpen,
        this.fws.hotAir2Disagrees,
        this.fws.hotAir2Open,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, !this.fws.hotAir2PbOn.get()],
      whichItemsChecked: () => [false, this.fws.hotAir2PbOn.get()],
      failure: 1,
      sysPage: SdPages.Cond,
      info: () => ['210200001'],
      inopSysAllPhases: () => ['210300019', '210300020'],
    },
    211800035: {
      // ONE PRIMARY CABIN FAN FAULT
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.onePrimaryCabinFanFault,
      notActiveWhenItemActive: ['211800023', '211800043', '211800044'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      redundLoss: () => ['210300025'],
    },
    211800039: {
      // TEMP CTL 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.tempCtl1Fault,
      notActiveWhenItemActive: ['211800041'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      redundLoss: () => ['210300021'],
    },
    211800040: {
      // TEMP CTL 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.tempCtl2Fault,
      notActiveWhenItemActive: ['211800041'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      redundLoss: () => ['210300022'],
    },
    211800041: {
      // TEMP CTL FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.tempCtlFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: showAllItems(211800041),
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Cond,
      info: () => ['210200003'],
      inopSysAllPhases: () => ['210300023'],
    },
    211800042: {
      // TEMP CTL REDUNDANCY LOST
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.oneTcsAppFailed,
      notActiveWhenItemActive: ['211800050'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['210300024'],
    },
    211800043: {
      // THREE PRIMARY CABIN FANS FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.threePrimaryCabinFanFault,
      notActiveWhenItemActive: ['211800023'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Cond,
      info: () => ['210200001'],
      inopSysAllPhases: () => ['210300027'],
    },
    211800044: {
      // TWO PRIMARY CABIN FANS FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.twoPrimaryCabinFanFault,
      notActiveWhenItemActive: ['211800023', '211800043'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Cond,
      info: () => ['210200001'],
      inopSysAllPhases: () => ['210300026'],
    },
    211800046: {
      // HOT AIR 1 OFF
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
      simVarIsActive: MappedSubject.create(([hotAirPbOn]) => !hotAirPbOn, this.fws.hotAir1PbOn),
      // Not while COND DUCT OVHT asks for this pb OFF (design choice: the pb is not abnormally OFF then)
      notActiveWhenItemActive: ['211800028'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Cond,
      info: () => ['210200001'],
      inopSysAllPhases: () => ['210300019', '210300020'],
    },
    211800047: {
      // HOT AIR 2 OFF
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
      simVarIsActive: MappedSubject.create(([hotAirPbOn]) => !hotAirPbOn, this.fws.hotAir2PbOn),
      // Not while COND DUCT OVHT asks for this pb OFF (design choice: the pb is not abnormally OFF then)
      notActiveWhenItemActive: ['211800028'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Cond,
      info: () => ['210200001'],
      inopSysAllPhases: () => ['210300019', '210300020'],
    },
    211800048: {
      // HOT AIR 1 VLV OPEN
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([hotAirDisagrees, hotAirOpen]) => hotAirDisagrees && hotAirOpen,
        this.fws.hotAir1Disagrees,
        this.fws.hotAir1Open,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
    },
    211800049: {
      // HOT AIR 2 VLV OPEN
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([hotAirDisagrees, hotAirOpen]) => hotAirDisagrees && hotAirOpen,
        this.fws.hotAir2Disagrees,
        this.fws.hotAir2Open,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
    },
    211800050: {
      // TEMP CTL DEGRADED
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.tempCtrDegraded,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      inopSysAllPhases: () => ['210300028'],
    },
    211800051: {
      // APU BLEED FAULT due to outside envelope
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.apuBleedPbOnOver22500ft,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [false, false, false, false, true, (this.fws.adrPressureAltitude.get() ?? 0) > 22_500],
      whichItemsChecked: () => [false, false, false, false, !this.fws.apuBleedPbOn.get(), false],
      failure: 2,
      sysPage: SdPages.Bleed,
      inopSysAllPhases: () => ['260300006'],
    },
    211800052: {
      // ENG 1 BLEED OFF
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.eng1BleedAbnormalOff,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Bleed,
      inopSysAllPhases: () => ['260300002'],
    },
    211800053: {
      // ENG 2 BLEED OFF
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.eng2BleedAbnormalOff,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Bleed,
      inopSysAllPhases: () => ['260300003'],
    },
    211800054: {
      // ENG 3 BLEED OFF
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.eng3BleedAbnormalOff,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Bleed,
      inopSysAllPhases: () => ['260300004'],
    },
    211800055: {
      // ENG 4 BLEED OFF
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.eng4BleedAbnormalOff,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Bleed,
      inopSysAllPhases: () => ['260300005'],
    },
    211800056: {
      // AIR ABNORM BLEED CONFIG (A380 FCOM PRO-ABN-ECAM-10-36, a380_fcom.txt l.167558-167674, AbnormBleedConfig.ts). The
      // FCOM shows no indication nor flight phase inhibition of its own: it follows its trigger (ENG SHUT DOWN, ENG FIRE),
      // so the ENG SHUT DOWN inhibition and no aural (its trigger has it). Not simulated: the STATUS INOP SYS
      // "depending on failure cases" and the XBLEED MAN CTL ONLY INFO (no crossbleed auto control failure).
      flightPhaseInhib: this.fws.phase56Inhibition,
      simVarIsActive: this.fws.abnormBleedConfig,
      auralWarning: Subject.create(FwcAuralWarning.None),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => abnormBleedConfigItems(this.fws.abnormBleedConfigInputs).show,
      whichItemsChecked: () => abnormBleedConfigItems(this.fws.abnormBleedConfigInputs).checked,
      failure: 2,
      sysPage: SdPages.Bleed,
      limitationsAllPhases: () => abnormBleedConfigLimitations(this.fws.abnormBleedConfigInputs),
      limitationsPfd: () => abnormBleedConfigLimitations(this.fws.abnormBleedConfigInputs),
    },
    212800001: {
      // AFT VENT CTL 1 FAULT
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.aftVentCtl1Fault,
      notActiveWhenItemActive: ['212800004'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      redundLoss: () => ['212300001'],
    },
    212800002: {
      // AFT VENT CTL 2 FAULT
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.aftVentCtl2Fault,
      notActiveWhenItemActive: ['212800004'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      redundLoss: () => ['212300002'],
    },
    212800003: {
      // AFT VENT CTL DEGRADED
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.aftVentCtrDegraded,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      inopSysAllPhases: () => ['212300003'],
    },
    212800004: {
      // AFT VENT CTL FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([channel1, channel2]) => channel1 && channel2,
        this.fws.vcmAftChannel1Failure,
        this.fws.vcmAftChannel2Failure,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Cond,
      info: () => ['210200001'],
      inopSysAllPhases: () => ['212300004', '212300005'],
    },
    212800005: {
      // AFT VENT CTL REDUNDANCY LOST
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.aftVentRedundLost,
      notActiveWhenItemActive: ['212800003'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['212300006'],
    },
    212800007: {
      // FWD VENT CTL 1 FAULT
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.fwdVentCtl1Fault,
      notActiveWhenItemActive: ['212800010'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      redundLoss: () => ['212300007'],
    },
    212800008: {
      // FWD VENT CTL 2 FAULT
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.fwdVentCtl2Fault,
      notActiveWhenItemActive: ['212800010'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      redundLoss: () => ['212300008'],
    },
    212800009: {
      // FWD VENT CTL DEGRADED
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.fwdVentCtrDegraded,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Cond,
      inopSysAllPhases: () => ['212300009'],
    },
    212800010: {
      // FWD VENT CTL FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        ([channel1, channel2]) => channel1 && channel2,
        this.fws.vcmFwdChannel1Failure,
        this.fws.vcmFwdChannel2Failure,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [true], // TODO IFEC overhead PB
      failure: 2,
      sysPage: SdPages.Cond,
      info: () => ['210200001'],
      inopSysAllPhases: () => ['212300010', '212300011', '212300012'],
    },
    212800011: {
      // FWD VENT CTL REDUNDANCY LOST
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.fwdVentRedundLost,
      notActiveWhenItemActive: ['212800009'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['212300013'],
    },
    213800001: {
      // EXCESS CAB ALT
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
      simVarIsActive: this.fws.excessCabinAltitude,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        this.fws.flightLevel.get() > 100,
        this.fws.flightLevel.get() > 100 && this.fws.flightLevel.get() < 160,
        this.fws.flightLevel.get() > 100 && this.fws.flightLevel.get() < 160,
        this.fws.flightLevel.get() > 160, // Emer descent
        this.fws.flightLevel.get() > 160, // Emer descent announce
        this.fws.flightLevel.get() > 160, // Emer descent initiate
        this.fws.flightLevel.get() > 160, // All trust levers idle
        this.fws.flightLevel.get() > 160, // Speed brake lever
        this.fws.flightLevel.get() > 160, // Speed max
        this.fws.flightLevel.get() > 160, // Atc notify
        this.fws.flightLevel.get() > 160, // Atc squawk
        this.fws.flightLevel.get() > 160, // Atc emergency msg
        true, // Max 100MEA
        true, // If cab alt above 14000
        true, // Pax oxy mask on
        this.fws.flightLevel.get() > 100, // When descent stablished
        this.fws.flightLevel.get() > 100, // Crew oxy mask dilution
        true, // When diff Pr <2 psi
        true, // Ram air on
        true, // If diff press > 1 PSI
        true, // Cabin air extract on
        true, // When all outflow valves open
        true, // Cabin air extract deselect
      ],
      whichItemsChecked: () => [
        false, // Crew oxy masks
        false, // Crew advise
        false, // Descent initiate
        false, // Emer descent
        false, // Emer descent announce
        false, // Descent initiate
        this.fws.allThrottleIdle.get(), // All trust levers idle
        // Fixme. The speed break should use the lever position instead of the command signal from the FCDC.
        this.fws.speedBrakeCommand.get(), // Speed brake lever
        false, // Speed max
        false, // Atc notify
        false, // Atc squawk
        false, // Atc emergency msg
        false, // Max 100MEA
        false, // If cab alt above 14000
        this.fws.paxOxyMasksDeployed.get(), // Pax oxy mask on
        false, // When descent stablished
        false, // Crew oxy mask dilution
        false, // When diff Pr <2 psi
        this.fws.ramAirOn.get(), // Ram air on
        false, // If diff press > 1 PSI
        this.fws.cabinAirExtractOn.get() || (!this.fws.cabinAirExtractOn.get() && this.fws.allOutflowValvesOpen.get()), // Cabin air extract on
        false, // When all outflow valves open
        !this.fws.cabinAirExtractOn.get() && this.fws.allOutflowValvesOpen.get(), // Cabin air extract deselect
      ],
      failure: 3,
      sysPage: SdPages.Press,
      limitationsAllPhases: () => ['210400002'],
      limitationsPfd: () => ['210400002'],
    },
    213800002: {
      // EXCESS DIFF PRESS: active in flight phases 1, 8 and 9 (A380 FCOM PRO-ABN CAB PRESS EXCESS DIFF PRESS, flight
      // phase inhibition figure, airbus-a380-fcom PDF p.4755); it was active in phase 8 only
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 10, 11, 12],
      simVarIsActive: this.fws.excessDiffPressure,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, this.fws.flightLevel.get() > 100, true, true, true, true],
      whichItemsChecked: () => [
        !this.fws.pack1On.get(),
        !this.fws.pack2On.get(),
        false,
        false,
        false,
        this.fws.ramAirOn.get(),
        this.fws.cabinAirExtractOn.get(),
      ],
      failure: 3,
      sysPage: SdPages.Press,
      limitationsAllPhases: () => ['210400002', '210400001'],
      limitationsPfd: () => ['210400002', '210400001'],
    },
    213800003: {
      // EXCESS NEGATIVE DIFF PRESS (A380 FCOM PRO-ABN-ECAM-10-21-30, a380_fcom.txt l.135252-135280): CRC, master warning,
      // active in flight phases 8 and 9 (flight phase inhibition figure, airbus-a380-fcom PDF p.4757)
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],
      simVarIsActive: this.fws.excessNegativeDiffPressure,
      notActiveWhenItemActive: [],
      // ACFT IMMEDIATE LEVEL OFF; AIR FLOW HI "If at least one pack is operating"; RAM AIR ON "If no pack is operating"
      whichItemsToShow: () => [
        true,
        this.fws.pack1On.get() || this.fws.pack2On.get(),
        !this.fws.pack1On.get() && !this.fws.pack2On.get(),
      ],
      // AIR FLOW selector position 3 = HI (air_conditioning/mod.rs A380AirConditioningSystemOverhead::read)
      whichItemsChecked: () => [false, this.fws.flowSelectorKnob.get() === 3, this.fws.ramAirOn.get()],
      failure: 3,
      sysPage: SdPages.Press,
    },
    213800007: {
      // DIFF PRESS HI (a380_fcom.txt l.134890-134966): SC, master caution, active in flight phase 8 only (PDF p.4748).
      // There is no MAN CTL FAULT model: the manual pressurization system is always available.
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
      simVarIsActive: this.fws.diffPressHi,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => diffPressHiItemsToShow(true),
      whichItemsChecked: () => [this.fws.manCabinAltMode.get(), false, false],
      failure: 2,
      sysPage: SdPages.Press,
    },
    213800008: {
      // DIFF PRESS LO (a380_fcom.txt l.134991-135018): SC, master caution, active in flight phases 8 and 9 (PDF p.4751)
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],
      simVarIsActive: this.fws.diffPressLo,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.Press,
    },
    213800043: {
      // LDG ELEVN FAULT (a380_fcom.txt l.135431-135520): SC, master caution, active in flight phase 8 only (PDF p.4763).
      // With the manual pressurization system (always available, no MAN CTL FAULT model) the procedure is the LDG
      // ELEVN deferred procedure (221700001).
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
      simVarIsActive: this.fws.ldgElevnFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ldgElevnFaultItemsToShow(true),
      whichItemsChecked: () => [false, false, false],
      failure: 2,
      sysPage: SdPages.Press,
    },
    213800004: {
      // EXCESS RESIDUAL DIFF PRESS
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10],
      simVarIsActive: this.fws.excessResidualDiffPressure,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true, true, true],
      whichItemsChecked: () => [!this.fws.pack1On.get(), !this.fws.pack2On.get(), false, false, false],
      failure: 3,
      sysPage: SdPages.Press,
    },
    213800005: {
      // PRESS AUTO CTL FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.ocsmAutoCtlFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        true,
        // TODO: Sensor failure is not simulated, so the manual system is not available
        true,
        true,
        true,
        true,
        true,
        // TODO: Ambient pressure not available
        false,
        false,
        false,
        false,
        // TODO: Manual pressure available (only when sensor failure)
        false,
        false,
      ],
      whichItemsChecked: () => [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        this.fws.manCabinAltMode.get(),
        false,
      ],
      failure: 2,
      sysPage: SdPages.Press,
      limitationsAllPhases: () => ['210400003'],
      limitationsPfd: () => ['210400004'],
    },
    213800006: {
      // PRESS CTL REDUNDANCY LOST
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.pressRedundLost,
      notActiveWhenItemActive: ['213800005'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => [],
    },
    213800009: {
      // INHIBITED BY DOORS
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 11, 12],
      simVarIsActive: this.fws.inhibitedByDoors,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [true],
      failure: 2,
      sysPage: SdPages.Press,
      limitationsAllPhases: () => ['210400001'],
      limitationsPfd: () => ['210400001'],
    },
    213800011: {
      // PRESS OUTFLW VLV CTL 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.ocsm1Failure,
      notActiveWhenItemActive: [
        '213800017',
        '213800019',
        '213800020',
        '213800021',
        '213800023',
        '213800024',
        '213800025',
      ],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300001'],
    },
    213800012: {
      // PRESS OUTFLW VLV CTL 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.ocsm2Failure,
      notActiveWhenItemActive: [
        '213800017',
        '213800019',
        '213800020',
        '213800022',
        '213800023',
        '213800026',
        '213800027',
      ],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300002'],
    },
    213800013: {
      // PRESS OUTFLW VLV CTL 3 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.ocsm3Failure,
      notActiveWhenItemActive: [
        '213800017',
        '213800019',
        '213800021',
        '213800022',
        '213800024',
        '213800026',
        '213800028',
      ],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300003'],
    },
    213800014: {
      // PRESS OUTFLW VLV CTL 4 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.ocsm4Failure,
      notActiveWhenItemActive: [
        '213800017',
        '213800020',
        '213800021',
        '213800022',
        '213800025',
        '213800027',
        '213800028',
      ],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300004'],
    },
    213800017: {
      // CAB PRESS SYS FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.pressSysFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
      ],
      whichItemsChecked: () => [
        this.fws.flowSelectorKnob.get() == 3,
        false,
        this.fws.diffPressure.valueOr(0) > 9.6,
        !this.fws.pack1On.get(),
        !this.fws.pack2On.get(),
        false,
        false,
        this.fws.diffPressure.valueOr(0) < 2 && this.fws.flightLevel.get() < 100,
        this.fws.ramAirOn.get(),
        this.fws.cabinAirExtractOn.get(),
        false,
        !this.fws.pack1On.get(),
        !this.fws.pack2On.get(),
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['210400001', '2'],
      limitationsAllPhases: () => ['210400001', '2'],
      limitationsPfd: () => ['210400004'],
    },
    213800019: {
      // PRESS OUTFLW VLV CTL FAULT OUTFLW VLV 1+2+3
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm1, ocsm2, ocsm3]) => ocsm1 && ocsm2 && ocsm3,
        this.fws.ocsm1Failure,
        this.fws.ocsm2Failure,
        this.fws.ocsm3Failure,
      ),
      notActiveWhenItemActive: ['213800017'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300011'],
    },
    213800020: {
      // PRESS OUTFLW VLV CTL FAULT OUTFLW VLV 1+2+4
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm1, ocsm2, ocsm4]) => ocsm1 && ocsm2 && ocsm4,
        this.fws.ocsm1Failure,
        this.fws.ocsm2Failure,
        this.fws.ocsm4Failure,
      ),
      notActiveWhenItemActive: ['213800017'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300012'],
    },
    213800021: {
      // PRESS OUTFLW VLV CTL FAULT OUTFLW VLV 1+3+4
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm1, ocsm3, ocsm4]) => ocsm1 && ocsm3 && ocsm4,
        this.fws.ocsm1Failure,
        this.fws.ocsm3Failure,
        this.fws.ocsm4Failure,
      ),
      notActiveWhenItemActive: ['213800017'],
      whichItemsToShow: () => [
        true,
        // TODO: Only when manual press is available
        true,
        true,
        // TODO: Only when ambient pressure is not available
        false,
        false,
        false,
        false,
      ],
      whichItemsChecked: () => [false, this.fws.manCabinAltMode.get(), false, false, false, false, false],
      failure: 2,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300013'],
    },
    213800022: {
      // PRESS OUTFLW VLV CTL FAULT OUTFLW VLV 2+3+4
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm2, ocsm3, ocsm4]) => ocsm2 && ocsm3 && ocsm4,
        this.fws.ocsm2Failure,
        this.fws.ocsm3Failure,
        this.fws.ocsm4Failure,
      ),
      notActiveWhenItemActive: ['213800017'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300014'],
    },
    213800023: {
      // PRESS OUTFLW VLV CTL FAULT OUTFLW VLV 1+2
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm1, ocsm2]) => ocsm1 && ocsm2,
        this.fws.ocsm1Failure,
        this.fws.ocsm2Failure,
      ),
      notActiveWhenItemActive: ['213800017', '213800019', '213800020', '213800021', '213800022'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300006'],
    },
    213800024: {
      // PRESS OUTFLW VLV CTL FAULT OUTFLW VLV 1+3
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm1, ocsm3]) => ocsm1 && ocsm3,
        this.fws.ocsm1Failure,
        this.fws.ocsm3Failure,
      ),
      notActiveWhenItemActive: ['213800017', '213800019', '213800020', '213800021', '213800022'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300007'],
    },
    213800025: {
      // PRESS OUTFLW VLV CTL FAULT OUTFLW VLV 1+4
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm1, ocsm4]) => ocsm1 && ocsm4,
        this.fws.ocsm1Failure,
        this.fws.ocsm4Failure,
      ),
      notActiveWhenItemActive: ['213800017', '213800019', '213800020', '213800021', '213800022'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300008'],
    },
    213800026: {
      // PRESS OUTFLW VLV CTL FAULT OUTFLW VLV 2+3
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm2, ocsm3]) => ocsm2 && ocsm3,
        this.fws.ocsm2Failure,
        this.fws.ocsm3Failure,
      ),
      notActiveWhenItemActive: ['213800017', '213800019', '213800020', '213800021', '213800022'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300009'],
    },
    213800027: {
      // PRESS OUTFLW VLV CTL FAULT OUTFLW VLV 2+4
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm2, ocsm4]) => ocsm2 && ocsm4,
        this.fws.ocsm2Failure,
        this.fws.ocsm4Failure,
      ),
      notActiveWhenItemActive: ['213800017', '213800019', '213800020', '213800021', '213800022'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300010'],
    },
    213800028: {
      // PRESS OUTFLW VLV CTL FAULT OUTFLW VLV 3+4
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm3, ocsm4]) => ocsm3 && ocsm4,
        this.fws.ocsm3Failure,
        this.fws.ocsm4Failure,
      ),
      notActiveWhenItemActive: ['213800017', '213800019', '213800020', '213800021', '213800022'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300015'],
    },
    213800029: {
      // PRESS AUTO CTL FAULT SYS 1
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.ocsm1AutoFailure,
      notActiveWhenItemActive: [
        '213800005',
        '213800039',
        '213800040',
        '213800041',
        '213800033',
        '213800034',
        '213800035',
      ],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300016'],
    },
    213800030: {
      // PRESS AUTO CTL FAULT SYS 2
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.ocsm2AutoFailure,
      notActiveWhenItemActive: [
        '213800005',
        '213800039',
        '213800040',
        '213800042',
        '213800033',
        '213800036',
        '213800037',
      ],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300017'],
    },
    213800031: {
      // PRESS AUTO CTL FAULT SYS 3
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.ocsm3AutoFailure,
      notActiveWhenItemActive: [
        '213800005',
        '213800039',
        '213800041',
        '213800042',
        '213800034',
        '213800036',
        '213800038',
      ],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300018'],
    },
    213800032: {
      // PRESS AUTO CTL FAULT SYS 4
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.ocsm4AutoFailure,
      notActiveWhenItemActive: [
        '213800005',
        '213800040',
        '213800041',
        '213800042',
        '213800035',
        '213800037',
        '213800038',
      ],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300019'],
    },
    213800033: {
      // PRESS AUTO CTL FAULT SYS 1+2
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm1, ocsm2]) => ocsm1 && ocsm2,
        this.fws.ocsm1AutoFailure,
        this.fws.ocsm2AutoFailure,
      ),
      notActiveWhenItemActive: ['213800005', '213800039', '213800040', '213800041', '213800042'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300016', '213300017'],
    },
    213800034: {
      // PRESS AUTO CTL FAULT SYS 1+3
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm1, ocsm3]) => ocsm1 && ocsm3,
        this.fws.ocsm1AutoFailure,
        this.fws.ocsm3AutoFailure,
      ),
      notActiveWhenItemActive: ['213800005', '213800039', '213800040', '213800041', '213800042'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300016', '213300018'],
    },
    213800035: {
      // PRESS AUTO CTL FAULT SYS 1+4
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm1, ocsm4]) => ocsm1 && ocsm4,
        this.fws.ocsm1AutoFailure,
        this.fws.ocsm4AutoFailure,
      ),
      notActiveWhenItemActive: ['213800005', '213800039', '213800040', '213800041', '213800042'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300016', '213300019'],
    },
    213800036: {
      // PRESS AUTO CTL FAULT SYS 2+3
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm2, ocsm3]) => ocsm2 && ocsm3,
        this.fws.ocsm2AutoFailure,
        this.fws.ocsm3AutoFailure,
      ),
      notActiveWhenItemActive: ['213800005', '213800039', '213800040', '213800041', '213800042'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300017', '213300018'],
    },
    213800037: {
      // PRESS AUTO CTL FAULT SYS 2+4
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm2, ocsm4]) => ocsm2 && ocsm4,
        this.fws.ocsm2AutoFailure,
        this.fws.ocsm4AutoFailure,
      ),
      notActiveWhenItemActive: ['213800005', '213800039', '213800040', '213800041', '213800042'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300017', '213300019'],
    },
    213800038: {
      // PRESS AUTO CTL FAULT SYS 3+4
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm3, ocsm4]) => ocsm3 && ocsm4,
        this.fws.ocsm3AutoFailure,
        this.fws.ocsm4AutoFailure,
      ),
      notActiveWhenItemActive: ['213800005', '213800039', '213800040', '213800041', '213800042'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300018', '213300019'],
    },
    213800039: {
      // PRESS AUTO CTL FAULT SYS 1+2+3
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm1, ocsm2, ocsm3]) => ocsm1 && ocsm2 && ocsm3,
        this.fws.ocsm1AutoFailure,
        this.fws.ocsm2AutoFailure,
        this.fws.ocsm3AutoFailure,
      ),
      notActiveWhenItemActive: ['213800005'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300016', '213300017', '213300018'],
    },
    213800040: {
      // PRESS AUTO CTL FAULT SYS 1+2+4
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm1, ocsm2, ocsm4]) => ocsm1 && ocsm2 && ocsm4,
        this.fws.ocsm1AutoFailure,
        this.fws.ocsm2AutoFailure,
        this.fws.ocsm4AutoFailure,
      ),
      notActiveWhenItemActive: ['213800005'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300016', '213300017', '213300019'],
    },
    213800041: {
      // PRESS AUTO CTL FAULT SYS 1+3+4
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm1, ocsm3, ocsm4]) => ocsm1 && ocsm3 && ocsm4,
        this.fws.ocsm1AutoFailure,
        this.fws.ocsm3AutoFailure,
        this.fws.ocsm4AutoFailure,
      ),
      notActiveWhenItemActive: ['213800005'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300016', '213300018', '213300019'],
    },
    213800042: {
      // PRESS AUTO CTL FAULT SYS 2+3+4
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([ocsm2, ocsm3, ocsm4]) => ocsm2 && ocsm3 && ocsm4,
        this.fws.ocsm2AutoFailure,
        this.fws.ocsm3AutoFailure,
        this.fws.ocsm4AutoFailure,
      ),
      notActiveWhenItemActive: ['213800005'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Press,
      inopSysAllPhases: () => ['213300017', '213300018', '213300019'],
    },
    // ATA 22 - FLIGHT GUIDANCE
    220800001: {
      // AP OFF involuntary
      flightPhaseInhib: [],
      simVarIsActive: this.fws.autoPilotOffInvoluntary,
      auralWarning: this.fws.autoPilotOffInvoluntary.map((a) =>
        a ? FwcAuralWarning.CavalryCharge : FwcAuralWarning.None,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 3,
      cancel: true,
      sysPage: SdPages.None,
      monitorConfirmTime: 0.0,
      info: () => [],
    },
    220800004: {
      // A/THR OFF involuntary
      flightPhaseInhib: [3, 4, 5, 10],
      simVarIsActive: this.fws.autoThrustOffInvoluntaryWarning,
      auralWarning: this.fws.autoThrustOffInvoluntaryCaution.map((a) =>
        a ? FwcAuralWarning.SingleChime : FwcAuralWarning.None,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.engineThrustLocked],
      failure: 2,
      sysPage: SdPages.None,
      monitorConfirmTime: 0.0,
      info: () => [],
    },
    220800006: {
      // APPROACH CAPABILITY DOWNGRADED (A380 FCOM PRO-ABN-ECAM-10-22-FG, a380_fcom.txt l.136343-136416): SC, master
      // caution, active in flight phases 2, 8 and 9 (airbus-a380-fcom PDF p.4790), crew awareness. Only the RA B trigger
      // is simulated (AutoFlightAlerts.ts). STATUS: CAT 3 DUAL "depending on failure case" (l.136409), design choice for
      // the RA B: three RAs are needed for CAT 3 DUAL (NAV RA SYS A+B FAULT leaves CAT 2 ONLY, l.165793-165797); INFO "If
      // CAT 3 DUAL is inoperative: CAT 3 SINGLE ONLY" (l.136414-136415).
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 10, 11, 12],
      simVarIsActive: MappedSubject.create(
        ([raAFailed, raBFailed, raCFailed]) => isApproachCapabilityDowngradedByRa(raAFailed, raBFailed, raCFailed),
        this.fws.height1Failed,
        this.fws.height2Failed,
        this.fws.height3Failed,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysApprLdg: () => ['220300028'],
      info: () => ['220200016'],
    },
    // A/THR OFF memo caution
    220000002: {
      flightPhaseInhib: [],
      simVarIsActive: this.fws.voluntaryAthrOffCaution,
      failure: 2,
      sysPage: -1,
      monitorConfirmTime: 0.0,
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      nonProcedureKey: true,
    },

    // ATA 22 - AUTOFLIGHT
    220800003: {
      // A/THR LIMITED
      flightPhaseInhib: [2, 3, 4, 5, 6, 10, 11],
      simVarIsActive: this.fws.autoThrustLimited,
      whichItemsToShow: () => [this.fws.autoThrustLimitedClb, this.fws.autoThrustLimitedMct],
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.None,
      monitorConfirmTime: 0,
    },

    220800013: {
      // ROLL OUT FAULT
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 12],
      simVarIsActive: this.fws.rollOutFault,
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.None,
    },
    221800001: {
      // FMC-A FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.fmcAFault,
      notActiveWhenItemActive: ['221800004', '221800005', '221800006'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [this.fws.fmsSwitchingKnob.get() === 1],
      failure: 1,
      sysPage: SdPages.None,
      info: () => ['220200001'],
      redundLoss: () => ['221300001'],
    },
    221800002: {
      // FMC-B FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.fmcBFault,
      notActiveWhenItemActive: ['221800004', '221800005', '221800006'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [this.fws.fmsSwitchingKnob.get() === 1],
      failure: 1,
      sysPage: SdPages.None,
      info: () => ['220200002'],
      redundLoss: () => ['221300002'],
    },
    221800003: {
      // FMC-C FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.fmcCFault,
      notActiveWhenItemActive: ['221800004', '221800005', '221800006'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [this.fws.fmsSwitchingKnob.get() === 1],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['221300003'],
    },
    221800004: {
      // FMS 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10],
      simVarIsActive: this.fws.fms1Fault,
      notActiveWhenItemActive: ['221800006'],
      whichItemsToShow: () => [
        !this.fws.fmcAHealthy.get() && !this.fws.fmcCHealthy.get(),
        !this.fws.fmcAHealthy.get() && !this.fws.fmcBHealthy.get(),
        !this.fws.fmcAHealthy.get() && this.fws.fmcBHealthy.get() && this.fws.fmcCHealthy.get(),
        true,
      ],
      whichItemsChecked: () => [true, true, true, this.fws.fmsSwitchingKnob.get() === 0],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['221300004'],
    },
    221800005: {
      // FMS 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10],
      simVarIsActive: this.fws.fms2Fault,
      notActiveWhenItemActive: ['221800006'],
      whichItemsToShow: () => [
        !this.fws.fmcAHealthy.get() && !this.fws.fmcBHealthy.get(),
        !this.fws.fmcBHealthy.get() && !this.fws.fmcCHealthy.get(),
        !this.fws.fmcBHealthy.get() && this.fws.fmcAHealthy.get() && this.fws.fmcCHealthy.get(),
        true,
      ],
      whichItemsChecked: () => [true, true, true, this.fws.fmsSwitchingKnob.get() === 2],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['221300005'],
    },
    221800006: {
      // FMS 1+2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.and(), this.fws.fms1Fault, this.fws.fms2Fault),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true, true, true],
      whichItemsChecked: () => [
        true,
        this.fws.fmsSwitchingKnob.get() === 1,
        false,
        false,
        this.fws.tawsFlapModeOff.get(),
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['221300006', '340300003'],
      info: () => ['220200003'],
    },
    221800007: {
      // TO SPEEDS NOT INSERTED
      flightPhaseInhib: [1, 4, 5, 6, 7, 8, 9, 10, 12],
      simVarIsActive: this.fws.toSpeedsNotInsertedWarning,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    221800008: {
      // TO SPEEDS TOO LOW
      flightPhaseInhib: [1, 4, 5, 6, 7, 8, 9, 10, 12],
      simVarIsActive: this.fws.toSpeedsTooLowWarning,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.None,
    },
    221800009: {
      // TO V1/VR/V2 DISAGREE
      flightPhaseInhib: [1, 4, 5, 6, 7, 8, 9, 10, 12],
      simVarIsActive: this.fws.toV2VRV2DisagreeWarning,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    // ATA 23 - COMMUNICATION
    230800012: {
      // RMP 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.rmp1Fault,
      notActiveWhenItemActive: ['230800015', '230800016', '230800018'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [this.fws.rmp1Off.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    230800013: {
      // RMP 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.rmp2Fault,
      notActiveWhenItemActive: ['230800015', '230800017', '230800018'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [this.fws.rmp2Off.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    230800014: {
      // RMP 3 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.rmp3Fault,
      notActiveWhenItemActive: ['230800016', '230800017', '230800018'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [this.fws.rmp3Off.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    230800015: {
      // RMP 1+2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.and(), this.fws.rmp1Fault, this.fws.rmp2Fault),
      notActiveWhenItemActive: ['230800018'],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.rmp1Off.get(), this.fws.rmp2Off.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    230800016: {
      // RMP 1+3 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.and(), this.fws.rmp1Fault, this.fws.rmp3Fault),
      notActiveWhenItemActive: ['230800018'],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.rmp1Off.get(), this.fws.rmp3Off.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    230800017: {
      // RMP 2+3 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.and(), this.fws.rmp2Fault, this.fws.rmp3Fault),
      notActiveWhenItemActive: ['230800018'],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.rmp2Off.get(), this.fws.rmp3Off.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    230800018: {
      // RMP 1+2+3 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.rmp1Fault,
        this.fws.rmp2Fault,
        this.fws.rmp3Fault,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true, false, false, true],
      whichItemsChecked: () => [
        this.fws.rmp1Off.get(),
        this.fws.rmp2Off.get(),
        this.fws.rmp3Off.get(),
        false,
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.None,
    },
    // ATA 24 - ELECTRICAL
    // Conditions: FwsElecAlerts. Procedure lines of the texts (ata24.ts) that the real procedure does not contain are
    // hidden (the texts were written from another standard: GENs resets, COMMERCIAL, CROSSFEED, "IR x MODE SEL" after
    // landing instead of "BEFORE LAST ENG STOP : ELEC EXT PWR ON").
    240800002: {
      // AC BUS 1 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecAcBusFault[0],
      notActiveWhenItemActive: [],
      // On ground: FOR ENG STOP : KEEP ENG 4 LAST
      whichItemsToShow: () => [this.fws.aircraftOnGround.get()],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    240800004: {
      // AC BUS 2 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecAcBusFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get();
        // LDG DIST IMPACT ON WET/CONTAM RWY ONLY, always
        return [false, false, false, true, lowFeedTanks, lowFeedTanks, lowFeedTanks, false, false];
      },
      whichItemsChecked: () => [
        false,
        false,
        false,
        false,
        this.fws.fuelEmerOutrTkXfrOn.get(),
        false,
        false,
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    240800007: {
      // AC BUS 3 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecAcBusFault[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        // On ground: BEFORE OPENING ANY CABIN DOOR: RESIDUAL DIFF PRESS CHECK, CABIN CREW ADVISE
        const onGround = this.fws.aircraftOnGround.get();
        return [false, false, false, false, false, false, false, false, false, onGround, onGround, onGround];
      },
      whichItemsChecked: () => Array(12).fill(false),
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    240800009: {
      // AC BUS 4 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecAcBusFault[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const onGround = this.fws.aircraftOnGround.get();
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get();
        // On ground: FOR ENG STOP : KEEP ENG 1 LAST; in flight: VENT AVNCS EXTRACT
        return [onGround, !onGround, true, true, true, true, lowFeedTanks, lowFeedTanks, lowFeedTanks];
      },
      whichItemsChecked: () => [
        false,
        false, // VENT AVNCS EXTRACT: no avionics ventilation pb-sw in the simulation
        this.fws.airKnob.get() === 2, // AIR DATA SWTG F/O ON 3
        this.fws.tawsWxrSelected.get() === 1,
        this.xpdrTcasSystemIs(1),
        false,
        this.fws.fuelEmerOutrTkXfrOn.get(),
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    240800011: {
      // AC ESS BUS ALTN: crew awareness
      flightPhaseInhib: [4, 5, 6, 7, 8, 9, 10],
      simVarIsActive: this.fws.elecAcEssBusAltn,
      // Design choice: not when AC 4 takes over automatically after the loss of AC 1 (ELEC AC BUS 1 FAULT), nor when
      // the AC ESS busbar is lost anyway
      notActiveWhenItemActive: ['240800002', '240800012'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    240800012: {
      // AC ESS BUS FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecAcEssBusFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        // IF NOT SUCCESSFUL: the alert is still there with the AC ESS FEED pb-sw in ALTN
        const notSuccessful = this.fws.elecAcEssFeedAltn.get();
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get();
        return [
          true,
          notSuccessful,
          notSuccessful,
          notSuccessful,
          notSuccessful,
          notSuccessful,
          lowFeedTanks,
          lowFeedTanks,
          lowFeedTanks,
          false,
          false,
        ];
      },
      whichItemsChecked: () => [
        this.fws.elecAcEssFeedAltn.get(),
        false,
        false,
        false,
        false,
        false,
        this.fws.fuelEmerOutrTkXfrOn.get(),
        false,
        false,
        false,
        false,
      ],
      // STATUS: see ELEC_AC_ESS_BUS_FAULT_STATUS. The REDUND LOSS items are FwsInopSys entries active with this alert:
      // the redundLoss field of this table never reaches the STATUS page.
      limitationsApprLdg: () => ELEC_AC_ESS_BUS_FAULT_STATUS.limitationsApprLdg,
      inopSysAllPhases: () => ELEC_AC_ESS_BUS_FAULT_STATUS.inopSysAllPhases,
      inopSysApprLdg: () => ELEC_AC_ESS_BUS_FAULT_STATUS.inopSysApprLdg,
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    240800014: this.elecApuGenFaultItem(0),
    240800015: this.elecApuGenFaultItem(1),
    240800016: {
      // APU TR FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.elecApuTrFault,
      notActiveWhenItemActive: [],
      // WHEN APU NOT RQRD : APU BAT OFF applies when the APU is off and the APU battery is on. Design choice: shown
      // with the APU off; the APU BAT line then shows ticked if the battery is already off.
      whichItemsToShow: () => {
        const apuOff = this.fws.apuMasterSwitch.get() === 0;
        return [apuOff, apuOff];
      },
      whichItemsChecked: () => [false, !this.fws.elecApuBatAuto.get()],
      inopSysAllPhases: () => [APU_TR_INOP_SYS],
      info: () => apuTrFaultInfo(this.fws.elecSystemAlerts.batFault[3].get()),
      failure: 1,
      sysPage: SdPages.ElecDc,
    },
    240800019: {
      // BUS TIE OFF: crew awareness
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.elecBusTieOff,
      // Not when ELEC EMER CONFIG asks for BUS TIE OFF
      notActiveWhenItemActive: ['240800055'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    240800026: {
      // DC BUS 1 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecDcBusFault[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get();
        return [
          this.fws.taxiInFlapsLever0For1Min.get(), // FOR TAXI : FLAPS SELECT CONF 1+F
          true,
          true,
          false,
          false,
          true,
          lowFeedTanks,
          lowFeedTanks,
          lowFeedTanks,
          false,
          false,
        ];
      },
      whichItemsChecked: () => [
        false,
        false,
        false,
        false,
        false,
        false,
        this.fws.fuelEmerOutrTkXfrOn.get(),
        false,
        false,
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.ElecDc,
    },
    240800029: {
      // DC BUS 2 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecDcBusFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get();
        return [
          this.fws.taxiInFlapsLever0For1Min.get(), // FOR TAXI : FLAPS SELECT CONF 1+F
          true,
          true,
          true,
          true,
          true,
          false,
          false,
          true,
          lowFeedTanks,
          lowFeedTanks,
          lowFeedTanks,
        ];
      },
      whichItemsChecked: () => [
        false,
        this.fws.airKnob.get() === 2, // AIR DATA SWTG F/O ON 3
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        this.fws.fuelEmerOutrTkXfrOn.get(),
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.ElecDc,
    },
    240800030: {
      // DC ESS BUS FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecDcEssBusFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get();
        // FOR TAXI : FLAPS SELECT CONF 1+F has no condition in this procedure
        return [...Array(15).fill(true), lowFeedTanks, lowFeedTanks, lowFeedTanks, false, false];
      },
      whichItemsChecked: () => [
        false,
        this.fws.airKnob.get() === 0, // AIR DATA SWTG CAPT ON 3
        false,
        false,
        false,
        false,
        this.fws.tawsWxrSelected.get() === 2,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        this.fws.fuelEmerOutrTkXfrOn.get(),
        false,
        false,
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.ElecDc,
    },
    240800036: this.elecDriveDisconnectedItem(0),
    240800037: this.elecDriveDisconnectedItem(1),
    240800038: this.elecDriveDisconnectedItem(2),
    240800039: this.elecDriveDisconnectedItem(3),
    240800055: {
      // EMER CONFIG: master warning, CRC
      flightPhaseInhib: [1, 5, 10, 12],
      // Not while ENG ALL ENG FLAME OUT is shown: "This alert inhibits the ELEC EMER CONFIG alert." (FCOM l.173795)
      simVarIsActive: this.fws.elecEmerConfigAlert,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const proc = this.fws.elecEmerConfigProcedure;
        // Lines shown only if the flight crew did not activate the FIRE SMOKE/FUMES alert
        const noSmoke = !this.fws.smokeFumesActivated.get();
        // IF NOT SUCCESSFUL: the alert is still there after the first GENs reset
        const firstResetDone = proc.firstGensReset.isCompleted;
        const lowFl = proc.triggeredAtOrBelowFl230;
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get();
        return [
          true, // RAT MAN ON
          true, // MIN RAT SPEED
          noSmoke, // ALL GENs OFF THEN ON
          noSmoke && firstResetDone, // IF NOT SUCCESSFUL
          noSmoke && firstResetDone, // BUS TIE OFF
          noSmoke && firstResetDone, // ALL GENs OFF THEN ON
          true, // USE VHF 1 OR HF 1
          true, // A/THR
          true, // ATC COM VOICE ONLY
          true, // VENT AVNCS EXTRACT
          // Design choice: the maximum flight level is taken as not restricted below FL 200 by another alert (the FWS
          // has no such restriction yet), so the DESCENT/MAX FL lines show and APU CONSIDER does not
          lowFl, // DESCENT TO FL 200/MEA
          lowFl, // MAX FL
          lowFl && noSmoke, // WHEN BELOW FL 200 : APU
          true, // SLATS SLOW
          true, // L/G GRVTY EXTN ONLY
          true, // AVOID ICING CONDs
          true, // FOR SD : MAILBOX
          true, // INR TKs NOT USABLE
          true, // MID TKs NOT USABLE
          true, // FEED TK 1
          true, // FEED TK 4
          !lowFl, // DESCENT TO FL 200/MEA
          !lowFl, // MAX FL
          !lowFl && noSmoke, // WHEN BELOW FL 200 : APU
          false, // APU CONSIDER (maximum flight level restricted below FL 200)
          false, // FUEL CONSUMPT INCRSD: a STATUS INFO, not a procedure line
          false, // FMS PRED UNRELIABLE: idem
          false, // IF SEVERE ICE ACCRETION: LIMITATIONS / DEFERRED PROC, not procedure lines
          true, // LDG PERF AFFECTED
          lowFeedTanks, // EMER OUTR TK XFR
        ];
      },
      whichItemsChecked: () => {
        const proc = this.fws.elecEmerConfigProcedure;
        return [
          this.fws.ratDeployed.get() > 0,
          false,
          proc.firstGensReset.isCompleted,
          false,
          this.fws.elecBusTieOff.get(),
          proc.secondGensReset.isCompleted,
          false,
          !this.fws.autoThrustEngaged.get(),
          false,
          false, // VENT AVNCS EXTRACT: no avionics ventilation pb-sw in the simulation
          ...Array(20).fill(false),
        ];
      },
      failure: 3,
      sysPage: SdPages.ElecAc,
    },
    240800061: this.elecGenFaultItem(0),
    240800062: this.elecGenFaultItem(1),
    240800063: this.elecGenFaultItem(2),
    240800064: this.elecGenFaultItem(3),
    240800065: this.elecGenOffItem(0),
    240800066: this.elecGenOffItem(1),
    240800067: this.elecGenOffItem(2),
    240800068: this.elecGenOffItem(3),
    240800081: this.elecTrFaultItem(0),
    240800082: this.elecTrFaultItem(1),
    240800083: this.elecTrFaultItem(2),
    // Round 8: combined busbar alerts and STATIC INV FAULT. Conditions, lines and STATUS: FwsElecAlertsRound8 (master
    // caution and SC, PDF p.4834, 4841, 4849, 4858, 4889, 4897; STATIC INV FAULT: no light, no audio, PDF p.4959)
    240800003: {
      // AC BUS 1+2 & DC BUS 1 FAULT, FCOM l.137715
      flightPhaseInhib: ROUND8_ELEC_PHASE_INHIBITION.combinedBusFault,
      simVarIsActive: this.fws.elecAc12Dc1Fault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => acBus12Dc1FaultLines().show,
      whichItemsChecked: () => acBus12Dc1FaultLines().checked,
      limitationsApprLdg: () => AC_BUS_12_DC_1_FAULT_STATUS.limitationsApprLdg,
      inopSysAllPhases: () => AC_BUS_12_DC_1_FAULT_STATUS.inopSysAllPhases,
      inopSysApprLdg: () => AC_BUS_12_DC_1_FAULT_STATUS.inopSysApprLdg,
      info: () => AC_BUS_12_DC_1_FAULT_STATUS.info,
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    240800005: {
      // AC BUS 2+3 & DC BUS 1+2 FAULT, FCOM l.138014
      flightPhaseInhib: ROUND8_ELEC_PHASE_INHIBITION.combinedBusFault,
      simVarIsActive: this.fws.elecAc23Dc12Fault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => acBus23Dc12FaultLines(this.fws.elecRound8Inputs).show,
      whichItemsChecked: () => acBus23Dc12FaultLines(this.fws.elecRound8Inputs).checked,
      limitationsAllPhases: () => AC_BUS_23_DC_12_FAULT_STATUS.limitationsAllPhases,
      limitationsApprLdg: () => AC_BUS_23_DC_12_FAULT_STATUS.limitationsApprLdg,
      limitationsPfd: () => AC_BUS_23_DC_12_FAULT_STATUS.limitationsPfd,
      inopSysAllPhases: () => AC_BUS_23_DC_12_FAULT_STATUS.inopSysAllPhases,
      inopSysApprLdg: () => AC_BUS_23_DC_12_FAULT_STATUS.inopSysApprLdg,
      info: () => AC_BUS_23_DC_12_FAULT_STATUS.info,
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    240800006: {
      // AC BUS 2+4 FAULT, FCOM l.138416
      flightPhaseInhib: ROUND8_ELEC_PHASE_INHIBITION.combinedBusFault,
      simVarIsActive: this.fws.elecAc24Fault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => acBus24FaultLines(this.fws.elecRound8Inputs).show,
      whichItemsChecked: () => acBus24FaultLines(this.fws.elecRound8Inputs).checked,
      limitationsAllPhases: () => AC_BUS_24_FAULT_STATUS.limitationsAllPhases,
      limitationsPfd: () => AC_BUS_24_FAULT_STATUS.limitationsPfd,
      inopSysAllPhases: () => AC_BUS_24_FAULT_STATUS.inopSysAllPhases,
      inopSysApprLdg: () => AC_BUS_24_FAULT_STATUS.inopSysApprLdg,
      info: () => AC_BUS_24_FAULT_STATUS.info,
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    240800008: {
      // AC BUS 3+4 & DC BUS 2 FAULT, FCOM l.138771 (ELEC DC SD page)
      flightPhaseInhib: ROUND8_ELEC_PHASE_INHIBITION.combinedBusFault,
      simVarIsActive: this.fws.elecAc34Dc2Fault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => acBus34Dc2FaultLines(this.fws.elecRound8Inputs).show,
      whichItemsChecked: () => acBus34Dc2FaultLines(this.fws.elecRound8Inputs).checked,
      limitationsApprLdg: () => AC_BUS_34_DC_2_FAULT_STATUS.limitationsApprLdg,
      inopSysAllPhases: () => AC_BUS_34_DC_2_FAULT_STATUS.inopSysAllPhases,
      inopSysApprLdg: () => AC_BUS_34_DC_2_FAULT_STATUS.inopSysApprLdg,
      info: () => AC_BUS_34_DC_2_FAULT_STATUS.info,
      failure: 2,
      sysPage: SdPages.ElecDc,
    },
    240800027: {
      // DC BUS 1+2 FAULT, FCOM l.139924
      flightPhaseInhib: ROUND8_ELEC_PHASE_INHIBITION.combinedBusFault,
      simVarIsActive: this.fws.elecDc12Fault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => dcBus12FaultLines(this.fws.elecRound8Inputs).show,
      whichItemsChecked: () => dcBus12FaultLines(this.fws.elecRound8Inputs).checked,
      limitationsAllPhases: () => DC_BUS_12_FAULT_STATUS.limitationsAllPhases,
      limitationsApprLdg: () => DC_BUS_12_FAULT_STATUS.limitationsApprLdg,
      limitationsPfd: () => DC_BUS_12_FAULT_STATUS.limitationsPfd,
      inopSysAllPhases: () => DC_BUS_12_FAULT_STATUS.inopSysAllPhases,
      inopSysApprLdg: () => DC_BUS_12_FAULT_STATUS.inopSysApprLdg,
      info: () => DC_BUS_12_FAULT_STATUS.info,
      failure: 2,
      sysPage: SdPages.ElecDc,
    },
    240800028: {
      // DC BUS 1+ESS FAULT, FCOM l.140296 (LAND ANSA)
      flightPhaseInhib: ROUND8_ELEC_PHASE_INHIBITION.combinedBusFault,
      simVarIsActive: this.fws.elecDc1EssFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => dcBus1EssFaultLines(this.fws.elecRound8Inputs).show,
      whichItemsChecked: () => dcBus1EssFaultLines(this.fws.elecRound8Inputs).checked,
      limitationsAllPhases: () => DC_BUS_1_ESS_FAULT_STATUS.limitationsAllPhases,
      limitationsApprLdg: () => DC_BUS_1_ESS_FAULT_STATUS.limitationsApprLdg,
      limitationsPfd: () => DC_BUS_1_ESS_FAULT_STATUS.limitationsPfd,
      inopSysAllPhases: () => DC_BUS_1_ESS_FAULT_STATUS.inopSysAllPhases,
      inopSysApprLdg: () => DC_BUS_1_ESS_FAULT_STATUS.inopSysApprLdg,
      info: () => DC_BUS_1_ESS_FAULT_STATUS.info,
      failure: 2,
      sysPage: SdPages.ElecDc,
    },
    240800080: {
      // STATIC INV FAULT, FCOM l.142773: crew awareness, no STATUS in the FCOM
      flightPhaseInhib: ROUND8_ELEC_PHASE_INHIBITION.staticInvFault,
      simVarIsActive: this.fws.elecStaticInvFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.ElecAc,
    },
    // BAT, APU BAT, EXT PWR, RAT, TR MONITORING, DRIVE DISC alerts of the electrical failures (FwsElecSystemAlerts)
    ...elecSystemAbnormalItems(this.fws.elecSystemAlerts),
    // DRIVE OIL LEVEL LO, OIL OVHT, OIL PRESS LO (FwsElecDriveOilAlerts)
    ...elecDriveOilAbnormalItems(this.fws.elecDriveOilAlerts),
    // ATA 26 - FIRE PROTECTION
    260800001: {
      // APU FIRE
      flightPhaseInhib: [5, 6],
      simVarIsActive: this.fws.apuFireDetected,
      auralWarning: this.fws.apuFireDetectedAural.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [!this.fws.fireTestPb.get(), !this.fws.fireTestPb.get(), !this.fws.fireTestPb.get()],
      whichItemsChecked: () => [
        this.fws.fireButtonAPU.get(),
        this.fws.apuAgentDischarged.get(),
        this.fws.apuMasterSwitch.get() === 0,
      ],
      whichItemsTimer: () => [undefined, this.fws.apuFireAgent1Discharge10SecondsTimestamp.get(), undefined],
      failure: 3,
      sysPage: SdPages.Apu,
    },
    260800002: {
      // APU FIRE DET FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.apuLoopAFault,
        this.fws.apuLoopBFault,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['260300001'],
    },
    260800003: {
      // APU FIRE LOOP A FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.apuLoopAFault,
      notActiveWhenItemActive: ['260800002'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['260200025'],
    },
    260800004: {
      // APU FIRE LOOP B FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.apuLoopBFault,
      notActiveWhenItemActive: ['260800002'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['260200026'],
    },
    260800005: {
      // ENG 1 FIRE (IN FLIGHT)
      flightPhaseInhib: [5, 6],
      simVarIsActive: MappedSubject.create(
        ([aircraftOnGround, eng1Fire]) => !aircraftOnGround && eng1Fire,
        this.fws.aircraftOnGround,
        this.fws.eng1FireDetected,
      ),
      auralWarning: this.fws.eng1FireDetectedAural.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        true,
        true,
        true,
        this.fws.apuAvail.get(),
        this.fws.fireButtonEng1.get(),
        true,
        true,
        true,
        true,
      ],
      whichItemsChecked: () => [
        // When the fire pb is released, the FADEC is not powered and the throttle position is unknown which resets this condition
        this.fws.thrustLever1Idle.get() && !this.fws.fireButtonEng1.get(),
        !this.fws.engine1ValueSwitch.get(),
        this.fws.fireButtonEng1.get(),
        !this.fws.apuBleedValveOpen.get(),
        false,
        this.fws.eng1Agent1Discharged.get(),
        false,
        false,
        this.fws.eng1Agent2Discharged.get(),
      ],
      whichItemsTimer: () => [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        this.fws.fireEng1Agent1Discharge10sTimeStamp.get(),
        undefined,
        this.fws.fireEng1Agent2Discharge30sTimeStamp.get(),
      ],
      failure: 3,
      sysPage: SdPages.Eng,
    },
    260800006: {
      // ENG 2 FIRE (IN FLIGHT)
      flightPhaseInhib: [5, 6],
      simVarIsActive: MappedSubject.create(
        ([aircraftOnGround, eng2Fire]) => !aircraftOnGround && eng2Fire,
        this.fws.aircraftOnGround,
        this.fws.eng2FireDetected,
      ),
      auralWarning: this.fws.eng2FireDetectedAural.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true, true, true, true, true],
      whichItemsChecked: () => [
        // When the fire pb is released, the FADEC is not powered and the throttle position is unknown which resets this condition
        this.fws.thrustLever2Idle.get() && !this.fws.fireButtonEng2.get(),
        !this.fws.engine2ValueSwitch.get(),
        this.fws.fireButtonEng2.get(),
        this.fws.eng2Agent1Discharged.get(),
        false,
        false,
        this.fws.eng2Agent2Discharged.get(),
      ],
      whichItemsTimer: () => [
        undefined,
        undefined,
        undefined,
        this.fws.fireEng1Agent1Discharge10sTimeStamp.get(),
        undefined,
        this.fws.fireEng2Agent2Discharge30sTimeStamp.get(),
      ],
      failure: 3,
      sysPage: SdPages.Eng,
    },
    260800007: {
      // ENG 3 FIRE (IN FLIGHT)
      flightPhaseInhib: [5, 6],
      simVarIsActive: MappedSubject.create(
        ([aircraftOnGround, eng3Fire]) => !aircraftOnGround && eng3Fire,
        this.fws.aircraftOnGround,
        this.fws.eng3FireDetected,
      ),
      auralWarning: this.fws.eng3FireDetectedAural.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true, true, true, true, true],
      whichItemsChecked: () => [
        // When the fire pb is released, the FADEC is not powered and the throttle position is unknown which resets this condition
        this.fws.thrustLever3Idle.get() && !this.fws.fireButtonEng3.get(),
        !this.fws.engine3ValueSwitch.get(),
        this.fws.fireButtonEng3.get(),
        this.fws.eng3Agent1Discharged.get(),
        false,
        false,
        this.fws.eng3Agent2Discharged.get(),
      ],
      whichItemsTimer: () => [
        undefined,
        undefined,
        undefined,
        this.fws.fireEng3Agent1Discharge10sTimeStamp.get(),
        undefined,
        this.fws.fireEng3Agent2Discharge30sTimeStamp.get(),
      ],
      failure: 3,
      sysPage: SdPages.Eng,
    },
    260800008: {
      // ENG 4 FIRE (IN FLIGHT)
      flightPhaseInhib: [5, 6],
      simVarIsActive: MappedSubject.create(
        ([aircraftOnGround, eng4Fire]) => !aircraftOnGround && eng4Fire,
        this.fws.aircraftOnGround,
        this.fws.eng4FireDetected,
      ),
      auralWarning: this.fws.eng4FireDetectedAural.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true, true, true, true, true],
      whichItemsChecked: () => [
        // When the fire pb is released, the FADEC is not powered and the throttle position is unknown which resets this condition
        this.fws.thrustLever4Idle.get() && !this.fws.fireButtonEng4.get(),
        !this.fws.engine4ValueSwitch.get(),
        this.fws.fireButtonEng4.get(),
        this.fws.eng4Agent1Discharged.get(),
        false,
        false,
        this.fws.eng4Agent2Discharged.get(),
      ],
      whichItemsTimer: () => [
        undefined,
        undefined,
        undefined,
        this.fws.fireEng4Agent1Discharge10sTimeStamp.get(),
        undefined,
        this.fws.fireEng4Agent2Discharge30sTimeStamp.get(),
      ],
      failure: 3,
      sysPage: SdPages.Eng,
    },
    260800009: {
      // ENG 1 FIRE (ON GROUND)
      flightPhaseInhib: [5, 6],
      simVarIsActive: MappedSubject.create(
        ([aircraftOnGround, eng1Fire]) => aircraftOnGround && eng1Fire,
        this.fws.aircraftOnGround,
        this.fws.eng1FireDetected,
      ),
      auralWarning: this.fws.eng1FireDetectedAural.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
      ],
      whichItemsChecked: () => [
        // When the fire pb is released, the FADEC is not powered and the throttle position is unknown which resets this condition
        this.fws.allThrottleIdle.get() && !this.fws.fireButtonEng1.get(),
        this.fws.parkBrakeSet.get(),
        this.fws.parkBrakeSet.get(),
        false,
        false,
        !this.fws.engine1ValueSwitch.get(),
        this.fws.fireButtonEng1.get(),
        this.fws.eng1Agent1Discharged.get() && this.fws.eng1Agent2Discharged.get(),
        this.fws.allEngineSwitchOff.get(),
        this.fws.allFireButtons.get(),
        false,
        false,
        !this.fws.evacCommand.get(),
        this.fws.allBatteriesOff.get(),
        false,
        false,
      ],
      failure: 3,
      sysPage: SdPages.Eng,
    },
    260800010: {
      // ENG 2 FIRE (ON GROUND)
      flightPhaseInhib: [5, 6],
      simVarIsActive: MappedSubject.create(
        ([aircraftOnGround, eng2Fire]) => aircraftOnGround && eng2Fire,
        this.fws.aircraftOnGround,
        this.fws.eng2FireDetected,
      ),
      auralWarning: this.fws.eng2FireDetectedAural.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
      ],
      whichItemsChecked: () => [
        // When the fire pb is released, the FADEC is not powered and the throttle position is unknown which resets this condition
        this.fws.allThrottleIdle.get() && !this.fws.fireButtonEng2.get(),
        this.fws.parkBrakeSet.get(),
        this.fws.parkBrakeSet.get(),
        false,
        false,
        !this.fws.engine2ValueSwitch.get(),
        this.fws.fireButtonEng2.get(),
        this.fws.eng2Agent1Discharged.get() && this.fws.eng2Agent2Discharged.get(),
        this.fws.allEngineSwitchOff.get(),
        this.fws.allFireButtons.get(),
        false,
        false,
        !this.fws.evacCommand.get(),
        this.fws.allBatteriesOff.get(),
        false,
        false,
      ],
      failure: 3,
      sysPage: SdPages.Eng,
    },
    260800011: {
      // ENG 3 FIRE (ON GROUND)
      flightPhaseInhib: [5, 6],
      simVarIsActive: MappedSubject.create(
        ([aircraftOnGround, eng3Fire]) => aircraftOnGround && eng3Fire,
        this.fws.aircraftOnGround,
        this.fws.eng3FireDetected,
      ),
      auralWarning: this.fws.eng3FireDetectedAural.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
      ],
      whichItemsChecked: () => [
        // When the fire pb is released, the FADEC is not powered and the throttle position is unknown which resets this condition
        this.fws.allThrottleIdle.get() && !this.fws.fireButtonEng3.get(),
        this.fws.parkBrakeSet.get(),
        this.fws.parkBrakeSet.get(),
        false,
        false,
        !this.fws.engine3ValueSwitch.get(),
        this.fws.fireButtonEng3.get(),
        this.fws.eng3Agent1Discharged.get() && this.fws.eng3Agent2Discharged.get(),
        this.fws.allEngineSwitchOff.get(),
        this.fws.allFireButtons.get(),
        false,
        false,
        !this.fws.evacCommand.get(),
        this.fws.allBatteriesOff.get(),
        false,
        false,
      ],
      failure: 3,
      sysPage: SdPages.Eng,
    },
    260800012: {
      // ENG 4 FIRE (ON GROUND)
      flightPhaseInhib: [5, 6],
      simVarIsActive: MappedSubject.create(
        ([aircraftOnGround, eng4Fire]) => aircraftOnGround && eng4Fire,
        this.fws.aircraftOnGround,
        this.fws.eng4FireDetected,
      ),
      auralWarning: this.fws.eng4FireDetectedAural.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
        !this.fws.fireTestPb.get(),
      ],
      whichItemsChecked: () => [
        // When the fire pb is released, the FADEC is not powered and the throttle position is unknown which resets this condition
        this.fws.allThrottleIdle.get() && !this.fws.fireButtonEng4.get(),
        this.fws.parkBrakeSet.get(),
        this.fws.parkBrakeSet.get(),
        false,
        false,
        !this.fws.engine4ValueSwitch.get(),
        this.fws.fireButtonEng4.get(),
        this.fws.eng4Agent1Discharged.get() && this.fws.eng4Agent2Discharged.get(),
        this.fws.allEngineSwitchOff.get(),
        this.fws.allFireButtons.get(),
        false,
        false,
        !this.fws.evacCommand.get(),
        this.fws.allBatteriesOff.get(),
        false,
        false,
      ],
      failure: 3,
      sysPage: SdPages.Eng,
    },
    260800013: {
      // ENG 1 FIRE DET FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.eng1FireDetFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['260300010'],
    },
    260800014: {
      // ENG 2 FIRE DET FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.eng2FireDetFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['260300011'],
    },
    260800015: {
      // ENG 3 FIRE DET FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.eng3FireDetFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['260300012'],
    },
    260800016: {
      // ENG 4 FIRE DET FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.eng4FireDetFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['260300013'],
    },
    260800017: {
      // ENG 1 FIRE LOOP A FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.eng1LoopAFault,
      notActiveWhenItemActive: ['260800013'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['260300014'],
    },
    260800018: {
      // ENG 1 FIRE LOOP B FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.eng1LoopBFault,
      notActiveWhenItemActive: ['260800013'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['260300015'],
    },
    260800019: {
      // ENG 2 FIRE LOOP A FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.eng2LoopAFault,
      notActiveWhenItemActive: ['260800014'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['260300016'],
    },
    260800020: {
      // ENG 2 FIRE LOOP B FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.eng2LoopBFault,
      notActiveWhenItemActive: ['260800014'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['260300017'],
    },
    260800021: {
      // ENG 3 FIRE LOOP A FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.eng3LoopAFault,
      notActiveWhenItemActive: ['260800015'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['260300018'],
    },
    260800022: {
      // ENG 3 FIRE LOOP B FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.eng3LoopBFault,
      notActiveWhenItemActive: ['260800015'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['260300019'],
    },
    260800023: {
      // ENG 4 FIRE LOOP A FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.eng4LoopAFault,
      notActiveWhenItemActive: ['260800016'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['260300020'],
    },
    260800024: {
      // ENG 4 FIRE LOOP B FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.eng4LoopBFault,
      notActiveWhenItemActive: ['260800016'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['260300021'],
    },
    260800025: {
      // MLG BAY FIRE
      flightPhaseInhib: [5],
      simVarIsActive: this.fws.mlgFireDetected,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.fireTestPb.get() &&
          (this.fws.computedAirSpeedToNearest2.get() > 250 || this.fws.machSelectedFromAdr.get() > 0.55),
        !this.fws.fireTestPb.get() && true,
        !this.fws.fireTestPb.get() && true,
        !this.fws.fireTestPb.get() && true,
        !this.fws.fireTestPb.get() && true,
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
        !this.fws.fireTestPb.get() && this.fws.aircraftOnGround.get(),
      ],
      whichItemsChecked: () => [
        false,
        this.fws.gearLeverPos.get(),
        false,
        false,
        false,
        this.fws.allThrottleIdle.get(),
        false,
        this.fws.parkBrakeSet.get(),
        false,
        false,
        this.fws.allEngineSwitchOff.get(),
        false,
        false,
        !this.fws.evacCommand.get(),
        this.fws.apuMasterSwitch.get() === 0,
        this.fws.allBatteriesOff.get(),
        false,
        false,
      ],
      failure: 3,
      sysPage: SdPages.Wheel,
      limitationsAllPhases: () => ['260400002'],
      limitationsPfd: () => ['260400002'],
    },
    260800026: {
      // MLG BAY FIRE DET FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.mlgLoopAFault,
        this.fws.mlgLoopBFault,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['260300022'],
    },
    260800027: {
      // MLG BAY FIRE LOOP A FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.mlgLoopAFault,
      notActiveWhenItemActive: ['260800026'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['260300023'],
    },
    260800028: {
      // MLG BAY FIRE LOOP B FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.mlgLoopBFault,
      notActiveWhenItemActive: ['260800026'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['260300024'],
    },
    // SMOKE ... SMOKE / DET FAULT of the SDF compartments and FWD+AFT CARGOS BTL 1(2) FAULT, see smokeAlerts()
    ...this.smokeAlerts(),

    // ATA 27 - FLIGHT CONTROLS
    271800003: {
      // PITCH TRIM NOT IN TO RANGE
      flightPhaseInhib: [5, 6, 7, 8, 9, 10, 12],
      simVarIsActive: this.fws.pitchTrimNotToWarning,
      auralWarning: this.fws.pitchTrimNotToAudio.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 3,
      sysPage: SdPages.Fctl,
      inopSysAllPhases: () => [],
    },
    271800004: {
      // RUDDER TRIM NOT IN TO RANGE
      flightPhaseInhib: [5, 6, 7, 8, 9, 10],
      auralWarning: this.fws.rudderTrimNotToAudio.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      simVarIsActive: this.fws.rudderTrimNotToWarning,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 3,
      sysPage: SdPages.Fctl,
      inopSysAllPhases: () => [],
    },
    271800005: {
      // SPD BRK NOT RETRACTED
      flightPhaseInhib: [5, 6, 7, 8, 9, 10],
      auralWarning: this.fws.speedbrakesConfigAural.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      simVarIsActive: this.fws.speedbrakesConfigWarning,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 3,
      sysPage: SdPages.Fctl,
      inopSysAllPhases: () => [],
    },
    271800008: {
      // ALTN LAW
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.altnLawCondition,
      notActiveWhenItemActive: [],
      // MAX SPEED 310 KT: "The limitation is not applicable in ALT 1A" (A380 FCOM PRO-ABN F/CTL ALTN LAW)
      whichItemsToShow: () => [!this.fws.altn1ALawCondition.get()],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [
        this.fws.altn2LawConfirm ? '220300007' : '',
        this.fws.altn2LawConfirm ? '220300024' : '',
      ],
      inopSysApprLdg: () => lawInopSysApprLdg(),
      info: () => ['340200002'],
    },
    271800009: {
      // DIRECT LAW
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.directLawCondition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, this.fws.allPrimFailed.get(), this.fws.allPrimAndSecFailed.get()],
      whichItemsChecked: () => [false, false, false, false],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => directLawInopSysAllPhases(),
      inopSysApprLdg: () => lawInopSysApprLdg(),
      info: () => directLawInfo(this.fws.allPrimAndSecFailed.get()),
    },
    271800013: {
      // FCDC 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.fcdc1FaultCondition,
      notActiveWhenItemActive: ['271800015'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    271800014: {
      // FCDC 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.fcdc2FaultCondition,
      notActiveWhenItemActive: ['271800015'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    271800015: {
      // FCDC 1+2 FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.fcdc12FaultCondition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    271800032: {
      // PITCH TRIM FMS DISAGREE
      flightPhaseInhib: [1, 4, 5, 6, 7, 8, 9, 10, 12],
      simVarIsActive: this.fws.pitchTrimMcduCgDisagree,
      notActiveWhenItemActive: ['271800003'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
    },
    // PRIM 1 FAULT
    271800036: {
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.prim1FaultCondition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        this.fws.flightPhase1112MoreThanOneMin.get(),
        true,
        true,
        true,
        this.fws.twoPrimsFailed.get(),
        this.fws.fuelConsumptIncreasePreCondition.get() &&
          (this.fws.primTwoAndThreeFailed.get() || this.fws.prim2FailedBeforeTakeoff.read()),
        this.fws.fmsPredUnreliablePreCondition.get() &&
          (this.fws.primTwoAndThreeFailed.get() || this.fws.prim2FailedBeforeTakeoff.read()),
        this.fws.allPrimFailed.get(),
        this.fws.allPrimFailed.get(),
        true,
      ],
      whichItemsChecked: () => [
        false,
        this.fws.prim1OffThenOnMemoryNode.read(),
        this.fws.prim1OffThenOnMemoryNode.read(),
        this.fws.prim1PbOff.get(),
        true,
        true,
        true,
        true,
        true,
        true,
      ],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    // PRIM 2 FAULT
    271800037: {
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.prim2FaultCondition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        this.fws.flightPhase1112MoreThanOneMin.get(),
        true,
        true,
        this.fws.dcEhaPowered.get(),
        !this.fws.dcEhaPowered.get(),
        this.fws.twoPrimsFailed.get(),
        this.fws.fuelConsumptIncreasePreCondition.get() &&
          (this.fws.primTwoAndThreeFailed.get() || this.fws.prim2FailedBeforeTakeoff.read()),
        this.fws.fmsPredUnreliablePreCondition.get() &&
          (this.fws.primTwoAndThreeFailed.get() || this.fws.prim2FailedBeforeTakeoff.read()),
        this.fws.allPrimFailed.get(),
        this.fws.allPrimFailed.get(),
        true,
      ],
      whichItemsChecked: () => [
        false,
        this.fws.prim2OffThenOnMemoryNode.read(),
        this.fws.prim2OffThenOnMemoryNode.read(),
        this.fws.prim2PbOff.get(),
        !this.fws.prim2PbOff.get(),
        true,
        true,
        true,
        true,
        true,
        true,
      ],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    // PRIM 3 FAULT
    271800038: {
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.prim3FaultCondition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        this.fws.flightPhase1112MoreThanOneMin.get(),
        true,
        true,
        true,
        this.fws.twoPrimsFailed.get(),
        this.fws.fuelConsumptIncreasePreCondition.get() &&
          (this.fws.primTwoAndThreeFailed.get() || this.fws.prim2FailedBeforeTakeoff.read()),
        this.fws.fmsPredUnreliablePreCondition.get() &&
          (this.fws.primTwoAndThreeFailed.get() || this.fws.prim2FailedBeforeTakeoff.read()),
        this.fws.allPrimFailed.get(),
        this.fws.allPrimFailed.get(),
        true,
      ],
      whichItemsChecked: () => [
        false,
        this.fws.prim3OffThenOnMemoryNode.read(),
        this.fws.prim3OffThenOnMemoryNode.read(),
        this.fws.prim3PbOff.get(),
        true,
        true,
        true,
        true,
        true,
        true,
      ],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    271800017: {
      // GND SPLRs NOT ARMED
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],
      simVarIsActive: this.fws.groundSpoilerNotArmedWarning,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    271800058: {
      // SEC 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.sec1FaultCondition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [this.fws.flightPhase1112MoreThanOneMin.get(), true, true, true, true],
      whichItemsChecked: () => [
        true,
        this.fws.sec1OffThenOnMemoryNode.read(),
        this.fws.sec1OffThenOnMemoryNode.read(),
        this.fws.sec1PbOff.get(),
        true,
      ],
      failure: 2,
      sysPage: SdPages.Fctl,
      inopSysAllPhases: () => [
        !this.fws.sec1Healthy.get() && !this.fws.sec2Healthy.get() && !this.fws.sec3Healthy.get()
          ? '290100011'
          : '290100001',
        !this.fws.sec1Healthy.get() && !this.fws.sec3Healthy.get() ? '270300004' : null,
      ],
      info: () => ['270200001'],
      redundLoss: () => ['270300005'],
    },
    271800059: {
      // SEC 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.sec2FaultCondition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        this.fws.flightPhase1112MoreThanOneMin.get(),
        true,
        true,
        this.fws.dcEhaPowered.get(),
        !this.fws.dcEhaPowered.get(),
        true,
      ],
      whichItemsChecked: () => [
        true,
        this.fws.sec2OffThenOnMemoryNode.read(),
        this.fws.sec2OffThenOnMemoryNode.read(),
        this.fws.sec2PbOff.get(),
        !this.fws.sec2PbOff.get(),
        true,
      ],
      failure: 2,
      sysPage: SdPages.Fctl,
      inopSysAllPhases: () => [
        '270300002',
        !this.fws.sec1Healthy.get() && !this.fws.sec2Healthy.get() && !this.fws.sec3Healthy.get()
          ? '290100011'
          : '290100001',
        !this.fws.sec1Healthy.get() && !this.fws.sec3Healthy.get() ? '270300004' : null,
      ],
      info: () => ['270200001'],
      redundLoss: () => [],
    },
    271800060: {
      // SEC 3 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.sec3FaultCondition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [this.fws.flightPhase1112MoreThanOneMin.get(), true, true, true, true],
      whichItemsChecked: () => [
        true,
        this.fws.sec3OffThenOnMemoryNode.read(),
        this.fws.sec3OffThenOnMemoryNode.read(),
        this.fws.sec3PbOff.get(),
        true,
      ],
      failure: 2,
      sysPage: SdPages.Fctl,
      inopSysAllPhases: () => [
        '270300003',
        !this.fws.sec1Healthy.get() && !this.fws.sec2Healthy.get() && !this.fws.sec3Healthy.get()
          ? '290100011'
          : '290100001',
        !this.fws.sec1Healthy.get() && !this.fws.sec3Healthy.get() ? '270300004' : null,
      ],
      info: () => ['270200001'],
      redundLoss: () => ['270300006'],
    },
    271800062: {
      // SINGLE RUDDER FAULT
      flightPhaseInhib: [4, 5, 6],
      simVarIsActive: this.fws.singleRudderFaultCondition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.Fctl,
      limitationsAllPhases: () => ['800400001'],
      inopSysAllPhases: () => ['290100008', this.fws.lowerRudderFault.get() ? '270300009' : '270300008'],
      info: () => ['340200002', '220200011'],
    },
    271800064: {
      // SPEED BRAKES POS/LEVER DISAGREE
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.speedBrakePosLeverDisagree,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    271800065: {
      // SPEED BRAKES STILL EXTENDED
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],
      simVarIsActive: this.fws.speedBrakesStillExtended,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    271800069: {
      // OVERSPEED
      flightPhaseInhib: [2, 3, 4, 5, 10, 11, 12],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.or(),
        this.fws.overspeedVmo,
        this.fws.overspeedVle,
        this.fws.overspeedVfeConf1,
        this.fws.overspeedVfeConf1F,
        this.fws.overspeedVfeConf2,
        this.fws.overspeedVfeConf3,
        this.fws.overspeedVfeConfFull,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        this.fws.overspeedVmo.get(),
        this.fws.overspeedVle.get(),
        this.fws.overspeedVfeConf1.get(),
        this.fws.overspeedVfeConf1F.get(),
        this.fws.overspeedVfeConf2.get(),
        this.fws.overspeedVfeConf3.get(),
        this.fws.overspeedVfeConfFull.get(),
      ],
      whichItemsChecked: () => [false, false, false, false, false, false, false],
      failure: 3,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
    },
    272800001: {
      // SLAT NOT IN TO CONFIG
      flightPhaseInhib: [5, 6, 7, 8, 9, 10, 12],
      auralWarning: this.fws.slatConfigAural.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      simVarIsActive: this.fws.slatConfigWarning,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 3,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
    },
    272800002: {
      // FLAPS NOT IN TO CONFIG
      flightPhaseInhib: [5, 6, 7, 8, 9, 10, 12],
      auralWarning: this.fws.flapConfigAural.map((on) => (on ? FwcAuralWarning.Crc : FwcAuralWarning.None)),
      simVarIsActive: this.fws.flapConfigWarning,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 3,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
    },
    272800003: {
      // FLAPS LEVER NOT ZERO
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
      simVarIsActive: this.fws.flapsLeverNotZero,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 3,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
    },
    272800006: {
      // FLAP SYS 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.flapSys1Fault,
      notActiveWhenItemActive: ['272800008'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    272800007: {
      // FLAP SYS 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.flapSys2Fault,
      notActiveWhenItemActive: ['272800008'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    272800008: {
      // FLAP SYS 1+2 FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.allFlapSysFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        true,
        this.fws.flapsJammed.get(),
        this.fws.flapsJammed.get(),
        true,
        this.fws.flapsHandle.get() < 3,
        !this.fws.flapPositionValid.get(),
        !this.fws.flapsRetracted.get(),
        !this.fws.flapsRetracted.get(),
        true,
        true,
        true,
        true,
      ],
      whichItemsChecked: () => [
        false,
        false,
        false,
        false,
        this.fws.tawsFlapModeOff.get(),
        this.fws.tawsGpwsOff.get(),
        false,
        false,
        false,
        false,
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    272800021: {
      // SLAT SYS 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.slatSys1Fault,
      notActiveWhenItemActive: ['272800023'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    272800022: {
      // SLAT SYS 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.slatSys2Fault,
      notActiveWhenItemActive: ['272800023'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    272800023: {
      // SLAT SYS 1+2 FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.allSlatSysFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        this.fws.elecEmerConfig.get(),
        true,
        this.fws.slatsJammed.get(),
        this.fws.slatsJammed.get(),
        true,
        !this.fws.slatsRetracted.get(),
        !this.fws.slatsRetracted.get(),
        true,
        true,
        true,
        true,
      ],
      whichItemsChecked: () => [false, false, false, false, false, false, false, false, false, false, false],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    272800028: {
      // TO FLAPS FMS DISAGREE
      flightPhaseInhib: [1, 4, 5, 6, 7, 8, 9, 10, 12],
      simVarIsActive: this.fws.flapsMcduDisagree,
      notActiveWhenItemActive: ['272800002'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
    },
    271800070: {
      // LOAD ANALYSIS REQUIRED
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.loadAnalysysRequired,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
    },
    // TAIL STRIKE and TAIL STRIKE DET FAULT (a380_fcom.txt l.147331-147385), see FwsTailStrikeAlerts
    271800071: {
      // TAIL STRIKE, master caution, LAND ANSA
      flightPhaseInhib: TAIL_STRIKE_PHASE_INHIBITION,
      simVarIsActive: this.fws.tailStrike,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    271800072: {
      // TAIL STRIKE DET FAULT, crew awareness; INOP SYS APPR TAIL STRIKE DET in FwsInopSys
      flightPhaseInhib: TAIL_STRIKE_DET_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.tailStrikeDetFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
    },
    // ATA 29 - FUEL
    281800002: {
      // ALL FEED TKs LEVEL LO
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.feedTank1Low,
        this.fws.feedTank2Low,
        this.fws.feedTank3Low,
        this.fws.feedTank4Low,
      ),
      whichItemsToShow: () => [true, true, false, false, false, false, false],
      // CROSSFEED 1+2+3+4 ON and ALL FEED TKs PMPs ON: the crew actions, sensed on the pb-sw (a jammed valve or a
      // failed pump does not prevent them)
      whichItemsChecked: () => [
        this.fws.allCrossFeedPbsOn.get(),
        this.fws.allFeedTankPumpPbsOn.get(),
        false,
        false,
        false,
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      notActiveWhenItemActive: [],
      inopSysAllPhases: () => [],
      limitationsAllPhases: () => ['2'],
      limitationsPfd: () => ['2'],
    },
    281800023: {
      // FEED TK 1 LEVEL LO
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.feedTank1Low,
      whichItemsToShow: () => [true, true, true, false, false, false, false, false],
      // IF NO FUEL LEAK: CROSSFEED 1 ON, CROSSFEED 2 ON, sensed on the pb-sw
      whichItemsChecked: () => [
        false,
        this.fws.crossFeedPbOn[0].get(),
        this.fws.crossFeedPbOn[1].get(),
        false,
        false,
        false,
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      notActiveWhenItemActive: ['281800102', '281800002'],
      inopSysAllPhases: () => [],
    },
    281800024: {
      // FEED TK 2 LEVEL LO
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.feedTank2Low,
      whichItemsToShow: () => [true, true, true, false, false, false, false, false],
      whichItemsChecked: () => [
        false,
        this.fws.crossFeedPbOn[0].get(),
        this.fws.crossFeedPbOn[1].get(),
        false,
        false,
        false,
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      notActiveWhenItemActive: ['281800102', '281800002'],
      inopSysAllPhases: () => [],
    },
    281800025: {
      // FEED TK 3 LEVEL LO
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.feedTank3Low,
      whichItemsToShow: () => [true, true, true, false, false, false, false, false],
      whichItemsChecked: () => [
        false,
        this.fws.crossFeedPbOn[2].get(),
        this.fws.crossFeedPbOn[3].get(),
        false,
        false,
        false,
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      notActiveWhenItemActive: ['281800103', '281800002'],
      inopSysAllPhases: () => [],
    },
    281800026: {
      // FEED TK 4 LEVEL LO
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.feedTank4Low,
      whichItemsToShow: () => [true, true, true, false, false, false, false, false],
      whichItemsChecked: () => [
        false,
        this.fws.crossFeedPbOn[2].get(),
        this.fws.crossFeedPbOn[3].get(),
        false,
        false,
        false,
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      notActiveWhenItemActive: ['281800103', '281800002'],
      inopSysAllPhases: () => [],
    },
    281800031: {
      // FEED TK 1 MAIN PMP FAULT: FEED TK 1 MAIN PMP OFF; STATUS INOP SYS FEED TK 1 MAIN PMP. Design choice: the flight
      // phase inhibition of JETTISON VLV NOT CLOSED (the real one is not known)
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.feedTankMainPumpFault[0],
      notActiveWhenItemActive: ['281800027'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.feedTankMainPumpPbOn[0].get()],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300005'],
    },
    281800032: {
      // FEED TK 2 MAIN PMP FAULT, as FEED TK 1
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.feedTankMainPumpFault[1],
      notActiveWhenItemActive: ['281800028'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.feedTankMainPumpPbOn[1].get()],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300002'],
    },
    281800033: {
      // FEED TK 3 MAIN PMP FAULT, as FEED TK 1
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.feedTankMainPumpFault[2],
      notActiveWhenItemActive: ['281800029'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.feedTankMainPumpPbOn[2].get()],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300006'],
    },
    281800034: {
      // FEED TK 4 MAIN PMP FAULT, as FEED TK 1
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.feedTankMainPumpFault[3],
      notActiveWhenItemActive: ['281800030'],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.feedTankMainPumpPbOn[3].get()],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300007'],
    },
    281800035: {
      // FEED TK 1 STBY PMP FAULT: crew awareness; MORE INFO REDUND LOSS FEED TK 1 STBY PMP
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.feedTankStbyPumpFault[0],
      notActiveWhenItemActive: ['281800027'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Fuel,
      redundLoss: () => ['280300008'],
    },
    281800036: {
      // FEED TK 2 STBY PMP FAULT, as FEED TK 1
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.feedTankStbyPumpFault[1],
      notActiveWhenItemActive: ['281800028'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Fuel,
      redundLoss: () => ['280300009'],
    },
    281800037: {
      // FEED TK 3 STBY PMP FAULT, as FEED TK 1
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.feedTankStbyPumpFault[2],
      notActiveWhenItemActive: ['281800029'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Fuel,
      redundLoss: () => ['280300003'],
    },
    281800038: {
      // FEED TK 4 STBY PMP FAULT, as FEED TK 1
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.feedTankStbyPumpFault[3],
      notActiveWhenItemActive: ['281800030'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Fuel,
      redundLoss: () => ['280300010'],
    },
    281800068: {
      // L OUTR TK PMP FAULT: L OUTR TK PMP OFF; STATUS INOP SYS L OUTR TK PMP, INFO OUTR TKs XFR BY GRVTY ONLY if the
      // outer tanks are not empty. Design choice: the flight phase inhibition of the feed tank pump alerts (the real
      // one is not known). The FQMS shut-off of the symmetric pump and the gravity transfer are not simulated.
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.outerTankPumpFault[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.transferPumpFlags.leftOuter.pbOn],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300019'],
      info: () => (this.fws.outerTanksNotEmpty.get() ? ['280200008'] : []),
    },
    281800069: {
      // R OUTR TK PMP FAULT, as L OUTR TK PMP FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.outerTankPumpFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.transferPumpFlags.rightOuter.pbOn],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300020'],
      info: () => (this.fws.outerTanksNotEmpty.get() ? ['280200008'] : []),
    },
    281800063: {
      // L INR TK FWD PMP FAULT: L INR TK FWD PMP OFF; STATUS INOP SYS L INR TK FWD PMP. The alternate transfers (INFO
      // FUEL ALTN XFR IN USE) are not simulated.
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.innerTankPumpFaults[0].fwd,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.transferPumpFlags.leftInnerFwd.pbOn],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300021'],
    },
    281800058: {
      // L INR TK AFT PMP FAULT: L INR TK AFT PMP OFF; STATUS INOP SYS L INR TK AFT PMP. The aft gallery pumps never run
      // in the simulation: only turned off by the flight crew. The manual transfers (FUEL MAN XFR PROCEDURE) are not
      // simulated.
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.innerTankPumpFaults[0].aft,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.transferPumpFlags.leftInnerAft.pbOn],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300025'],
    },
    281800056: {
      // L INR TK FWD+AFT PMPs FAULT: L INR TK FWD and AFT PMP OFF; LIMITATION L INR TK NOT USABLE if the tank is not
      // empty; STATUS INOP SYS L INR TK PMPs. The INFO MAN XFR AVAIL is not shown: the manual transfers are not
      // simulated.
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.innerTankPumpFaults[0].fwdAndAft,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [
        !this.fws.transferPumpFlags.leftInnerFwd.pbOn,
        !this.fws.transferPumpFlags.leftInnerAft.pbOn,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300029'],
      limitationsAllPhases: () => (this.fws.innerTankNotEmpty[0].get() ? ['280400007'] : []),
    },
    281800065: {
      // R INR TK FWD PMP FAULT, as L INR TK FWD PMP FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.innerTankPumpFaults[1].fwd,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.transferPumpFlags.rightInnerFwd.pbOn],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300022'],
    },
    281800060: {
      // R INR TK AFT PMP FAULT, as L INR TK AFT PMP FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.innerTankPumpFaults[1].aft,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.transferPumpFlags.rightInnerAft.pbOn],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300026'],
    },
    281800057: {
      // R INR TK FWD+AFT PMPs FAULT, as L INR TK FWD+AFT PMPs FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.innerTankPumpFaults[1].fwdAndAft,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [
        !this.fws.transferPumpFlags.rightInnerFwd.pbOn,
        !this.fws.transferPumpFlags.rightInnerAft.pbOn,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300030'],
      limitationsAllPhases: () => (this.fws.innerTankNotEmpty[1].get() ? ['280400008'] : []),
    },
    281800062: {
      // L MID TK FWD PMP FAULT, as L INR TK FWD PMP FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.midTankPumpFaults[0].fwd,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.transferPumpFlags.leftMidFwd.pbOn],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300023'],
    },
    281800059: {
      // L MID TK AFT PMP FAULT, as L INR TK AFT PMP FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.midTankPumpFaults[0].aft,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.transferPumpFlags.leftMidAft.pbOn],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300027'],
    },
    281800066: {
      // L MID TK FWD+AFT PMPs FAULT, as L INR TK FWD+AFT PMPs FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.midTankPumpFaults[0].fwdAndAft,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [
        !this.fws.transferPumpFlags.leftMidFwd.pbOn,
        !this.fws.transferPumpFlags.leftMidAft.pbOn,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300031'],
      limitationsAllPhases: () => (this.fws.midTankNotEmpty[0].get() ? ['280400009'] : []),
    },
    281800064: {
      // R MID TK FWD PMP FAULT, as L INR TK FWD PMP FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.midTankPumpFaults[1].fwd,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.transferPumpFlags.rightMidFwd.pbOn],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300024'],
    },
    281800061: {
      // R MID TK AFT PMP FAULT, as L INR TK AFT PMP FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.midTankPumpFaults[1].aft,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.transferPumpFlags.rightMidAft.pbOn],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300028'],
    },
    281800067: {
      // R MID TK FWD+AFT PMPs FAULT, as L INR TK FWD+AFT PMPs FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.midTankPumpFaults[1].fwdAndAft,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [
        !this.fws.transferPumpFlags.rightMidFwd.pbOn,
        !this.fws.transferPumpFlags.rightMidAft.pbOn,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300032'],
      limitationsAllPhases: () => (this.fws.midTankNotEmpty[1].get() ? ['280400010'] : []),
    },
    281800089: {
      // TRIM TK L PMP FAULT: TRIM TK L PMP OFF; MORE INFO REDUND LOSS TRIM TK L PMP
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.trimTankPumpFaults.left,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.transferPumpFlags.trimLeft.pbOn],
      failure: 2,
      sysPage: SdPages.Fuel,
      redundLoss: () => ['280300004'],
    },
    281800090: {
      // TRIM TK R PMP FAULT, as TRIM TK L PMP FAULT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.trimTankPumpFaults.right,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.transferPumpFlags.trimRight.pbOn],
      failure: 2,
      sysPage: SdPages.Fuel,
      redundLoss: () => ['280300033'],
    },
    281800091: {
      // TRIM TK L+R PMPs FAULT: TRIM TK L and R PMP OFF, in flight PITCH ATT < 3° FOR GRVTY FWD XFR, TRIM TK FEED
      // OPEN, if the pumps are failed TRIM TK : 2300 KG MAX NOT USABLE; LIMITATIONS FOR TRIM TK FWD XFR: PITCH ATT <
      // 3°; FUEL PARTLY UNUSABLE if the pumps are failed; STATUS INOP SYS TRIM TK PMPs, INFO TRIM TK XFR BY GRVTY
      // ONLY, TRIM TK GRVTY XFR : AROUND 3000 KG / HR. The gravity transfer from the trim tank is not simulated.
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.trimTankPumpFaults.leftAndRight,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const pumpsFailed = this.fws.transferPumpFlags.trimLeft.fault && this.fws.transferPumpFlags.trimRight.fault;
        return [true, true, !this.fws.aircraftOnGround.get(), true, pumpsFailed];
      },
      whichItemsChecked: () => [
        !this.fws.transferPumpFlags.trimLeft.pbOn,
        !this.fws.transferPumpFlags.trimRight.pbOn,
        false,
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300034'],
      limitationsAllPhases: () =>
        this.fws.transferPumpFlags.trimLeft.fault && this.fws.transferPumpFlags.trimRight.fault
          ? ['280400011', '280400001']
          : ['280400011'],
      info: () =>
        this.fws.transferPumpFlags.trimLeft.fault && this.fws.transferPumpFlags.trimRight.fault
          ? ['280200009', '280200010', '280200011']
          : ['280200009', '280200010'],
    },
    281800027: {
      // FEED TK 1 MAIN + STBY PMPs FAULT: after takeoff, CROSSFEED 1 and 2 ON, then both pumps OFF (before takeoff:
      // both pumps OFF); STATUS INOP SYS FEED TK 1 PMPs, INFO FEED TK 1 BY GRVTY ONLY. The gravity feed ceiling (MAX FL
      // 280 or 50/MEA once the inner and mid tanks are empty) is not simulated.
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.feedTankMainAndStbyPumpsFault[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const inFlight = !this.fws.aircraftOnGround.get();
        return [inFlight, inFlight, true, true, true];
      },
      whichItemsChecked: () => [
        this.fws.crossFeedPbOn[0].get(),
        this.fws.crossFeedPbOn[1].get(),
        !this.fws.feedTankMainPumpPbOn[0].get(),
        !this.fws.feedTankStbyPumpPbOn[0].get(),
        false,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300011'],
      info: () => ['280200004'],
    },
    281800028: {
      // FEED TK 2 MAIN + STBY PMPs FAULT, as FEED TK 1
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.feedTankMainAndStbyPumpsFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const inFlight = !this.fws.aircraftOnGround.get();
        return [inFlight, inFlight, true, true, true];
      },
      whichItemsChecked: () => [
        this.fws.crossFeedPbOn[0].get(),
        this.fws.crossFeedPbOn[1].get(),
        !this.fws.feedTankMainPumpPbOn[1].get(),
        !this.fws.feedTankStbyPumpPbOn[1].get(),
        false,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300012'],
      info: () => ['280200005'],
    },
    281800029: {
      // FEED TK 3 MAIN + STBY PMPs FAULT, as FEED TK 1 with CROSSFEED 3 and 4
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.feedTankMainAndStbyPumpsFault[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const inFlight = !this.fws.aircraftOnGround.get();
        return [inFlight, inFlight, true, true, true];
      },
      whichItemsChecked: () => [
        this.fws.crossFeedPbOn[2].get(),
        this.fws.crossFeedPbOn[3].get(),
        !this.fws.feedTankMainPumpPbOn[2].get(),
        !this.fws.feedTankStbyPumpPbOn[2].get(),
        false,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300013'],
      info: () => ['280200006'],
    },
    281800030: {
      // FEED TK 4 MAIN + STBY PMPs FAULT, as FEED TK 1 with CROSSFEED 3 and 4
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.feedTankMainAndStbyPumpsFault[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const inFlight = !this.fws.aircraftOnGround.get();
        return [inFlight, inFlight, true, true, true];
      },
      whichItemsChecked: () => [
        this.fws.crossFeedPbOn[2].get(),
        this.fws.crossFeedPbOn[3].get(),
        !this.fws.feedTankMainPumpPbOn[3].get(),
        !this.fws.feedTankStbyPumpPbOn[3].get(),
        false,
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300014'],
      info: () => ['280200007'],
    },
    281800014: {
      // CROSSFEED VLV 1 FAULT: crew awareness; if the valve is abnormally closed and ENG 1 is not running: FEED TK 1
      // NOT USABLE; STATUS INOP SYS CROSSFEED VLV 1
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.crossFeedValveFault[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300015'],
      limitationsAllPhases: () =>
        this.fws.crossFeedValveClosed[0].get() && !this.fws.engine1Running.get() ? ['280400003'] : [],
    },
    281800015: {
      // CROSSFEED VLV 2 FAULT, as CROSSFEED VLV 1 with ENG 2 and FEED TK 2
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.crossFeedValveFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300016'],
      limitationsAllPhases: () =>
        this.fws.crossFeedValveClosed[1].get() && !this.fws.engine2Running.get() ? ['280400004'] : [],
    },
    281800016: {
      // CROSSFEED VLV 3 FAULT, as CROSSFEED VLV 1 with ENG 3 and FEED TK 3
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.crossFeedValveFault[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300017'],
      limitationsAllPhases: () =>
        this.fws.crossFeedValveClosed[2].get() && !this.fws.engine3Running.get() ? ['280400005'] : [],
    },
    281800017: {
      // CROSSFEED VLV 4 FAULT, as CROSSFEED VLV 1 with ENG 4 and FEED TK 4
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.crossFeedValveFault[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Fuel,
      inopSysAllPhases: () => ['280300018'],
      limitationsAllPhases: () =>
        this.fws.crossFeedValveClosed[3].get() && !this.fws.engine4Running.get() ? ['280400006'] : [],
    },
    281800101: {
      // ZFW OR ZFWCG FMS DISAGREE
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11, 12],
      simVarIsActive: this.fws.fqmsZfwOrZfwCgDisagree,
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.None,
    },
    281800102: {
      // FEED TKs 1+2 LEVEL LO
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.feedTank1Low,
        this.fws.feedTank2Low,
      ),
      whichItemsToShow: () => [true, true, false, false, false, false, false],
      whichItemsChecked: () => [false, this.fws.allCrossFeedPbsOn.get(), false, false, false, false, false],
      failure: 2,
      sysPage: SdPages.Fuel,
      notActiveWhenItemActive: ['281800002'],
      inopSysAllPhases: () => [],
    },
    281800103: {
      // FEED TKs 3+4 LEVEL LO
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.feedTank3Low,
        this.fws.feedTank4Low,
      ),
      whichItemsToShow: () => [true, true, false, false, false, false, false],
      whichItemsChecked: () => [false, this.fws.allCrossFeedPbsOn.get(), false, false, false, false, false],
      failure: 2,
      sysPage: SdPages.Fuel,
      notActiveWhenItemActive: ['281800002'],
      inopSysAllPhases: () => [],
    },
    281800076: {
      // NO ZFW OR ZFWCG DATA
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 11, 12],
      simVarIsActive: this.fws.fqmsZfwOrZfwCgNotSet,
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.None,
      notActiveWhenItemActive: [],
      inopSysAllPhases: () => [],
    },
    // Round 8 (master caution and SC). Conditions and lines: FwsFuelAlertsRound8
    281800051: {
      // INR TKs QTY LO, FCOM l.151118, PDF p.5199
      flightPhaseInhib: ROUND8_FUEL_PHASE_INHIBITION.innerTanksQtyLo,
      simVarIsActive: this.fws.fuelInnerTanksQtyLo,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => innerTanksQtyLoLines().show,
      whichItemsChecked: () => innerTanksQtyLoLines().checked,
      info: () => ['280200012'], // EACH INR TK : 5100 KG MIN FOR T.O (l.151160)
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    281800070: {
      // L WING FEED PMPs FAULT, FCOM l.151694, PDF p.5216
      flightPhaseInhib: ROUND8_FUEL_PHASE_INHIBITION.wingFeedPumpsFault,
      simVarIsActive: this.fws.fuelWingFeedPumpsFault[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () =>
        wingFeedPumpsFaultLines(this.fws.fuelRound8Inputs, 0, this.fws.wingFeedCrossfeedsSeenOff[0]).show,
      whichItemsChecked: () =>
        wingFeedPumpsFaultLines(this.fws.fuelRound8Inputs, 0, this.fws.wingFeedCrossfeedsSeenOff[0]).checked,
      inopSysAllPhases: () => WING_FEED_PUMPS_FAULT_STATUS.inopSysAllPhases[0],
      info: () => WING_FEED_PUMPS_FAULT_STATUS.info[0],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    281800071: {
      // R WING FEED PMPs FAULT, FCOM l.151694, PDF p.5216
      flightPhaseInhib: ROUND8_FUEL_PHASE_INHIBITION.wingFeedPumpsFault,
      simVarIsActive: this.fws.fuelWingFeedPumpsFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () =>
        wingFeedPumpsFaultLines(this.fws.fuelRound8Inputs, 1, this.fws.wingFeedCrossfeedsSeenOff[1]).show,
      whichItemsChecked: () =>
        wingFeedPumpsFaultLines(this.fws.fuelRound8Inputs, 1, this.fws.wingFeedCrossfeedsSeenOff[1]).checked,
      inopSysAllPhases: () => WING_FEED_PUMPS_FAULT_STATUS.inopSysAllPhases[1],
      info: () => WING_FEED_PUMPS_FAULT_STATUS.info[1],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    281800098: {
      // WINGS BALANCED, FCOM l.154594, PDF p.5289
      flightPhaseInhib: ROUND8_FUEL_PHASE_INHIBITION.wingsBalanced,
      simVarIsActive: this.fws.fuelWingsBalanced,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => wingsBalancedLines(this.fws.fuelRound8Inputs, this.fws.wingsBalanceState).show,
      whichItemsChecked: () => wingsBalancedLines(this.fws.fuelRound8Inputs, this.fws.wingsBalanceState).checked,
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    281800100: {
      // WINGS NOT BALANCED, FCOM l.154808, PDF p.5294
      flightPhaseInhib: ROUND8_FUEL_PHASE_INHIBITION.wingsNotBalanced,
      simVarIsActive: this.fws.fuelWingsNotBalanced,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => wingsNotBalancedLines(this.fws.fuelRound8Inputs, this.fws.wingsBalanceState).show,
      whichItemsChecked: () => wingsNotBalancedLines(this.fws.fuelRound8Inputs, this.fws.wingsBalanceState).checked,
      // LIMITATIONS "On ground: DELAY T.O" (l.154910-154911); STATUS INFO FUEL CONSUMPT INCRSD : FMS PRED DISREGARD
      // (l.154919)
      limitationsAllPhases: () => (this.fws.aircraftOnGround.get() ? ['280400002'] : []),
      info: () => ['280200003'],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    281800018: {
      // ENG 1 LP VLV FAULT, FCOM l.149688, PDF p.5162 (FwsFuelLeakLpValveAlerts)
      flightPhaseInhib: FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.engLpValveFault,
      simVarIsActive: this.fws.fuelEngLpValveFault[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => engLpValveFaultLines(this.fws.flightPhase.get(), this.fws.engine1Master.get()).show,
      whichItemsChecked: () => engLpValveFaultLines(this.fws.flightPhase.get(), this.fws.engine1Master.get()).checked,
      inopSysAllPhases: () => [ENG_LP_VALVE_FAULT_INOP_SYS[0]],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    281800019: {
      // ENG 2 LP VLV FAULT, FCOM l.149688, PDF p.5162 (FwsFuelLeakLpValveAlerts)
      flightPhaseInhib: FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.engLpValveFault,
      simVarIsActive: this.fws.fuelEngLpValveFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => engLpValveFaultLines(this.fws.flightPhase.get(), this.fws.engine2Master.get()).show,
      whichItemsChecked: () => engLpValveFaultLines(this.fws.flightPhase.get(), this.fws.engine2Master.get()).checked,
      inopSysAllPhases: () => [ENG_LP_VALVE_FAULT_INOP_SYS[1]],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    281800020: {
      // ENG 3 LP VLV FAULT, FCOM l.149688, PDF p.5162 (FwsFuelLeakLpValveAlerts)
      flightPhaseInhib: FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.engLpValveFault,
      simVarIsActive: this.fws.fuelEngLpValveFault[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => engLpValveFaultLines(this.fws.flightPhase.get(), this.fws.engine3Master.get()).show,
      whichItemsChecked: () => engLpValveFaultLines(this.fws.flightPhase.get(), this.fws.engine3Master.get()).checked,
      inopSysAllPhases: () => [ENG_LP_VALVE_FAULT_INOP_SYS[2]],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    281800021: {
      // ENG 4 LP VLV FAULT, FCOM l.149688, PDF p.5162 (FwsFuelLeakLpValveAlerts)
      flightPhaseInhib: FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.engLpValveFault,
      simVarIsActive: this.fws.fuelEngLpValveFault[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => engLpValveFaultLines(this.fws.flightPhase.get(), this.fws.engine4Master.get()).show,
      whichItemsChecked: () => engLpValveFaultLines(this.fws.flightPhase.get(), this.fws.engine4Master.get()).checked,
      inopSysAllPhases: () => [ENG_LP_VALVE_FAULT_INOP_SYS[3]],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    281800072: {
      // LEAK DET FAULT, FCOM l.151966, PDF p.5222 (FwsFuelLeakLpValveAlerts): crew awareness, no master light
      flightPhaseInhib: FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.leakDetFault,
      simVarIsActive: this.fws.fuelLeakDetectionFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      inopSysAllPhases: () => [FUEL_LEAK_DET_FAULT_INOP_SYS],
      failure: 1,
      sysPage: SdPages.None,
    },
    281800073: {
      // LEAK DETECTED, FCOM l.152017, PDF p.5224 (FwsFuelLeakLpValveAlerts): the procedure of the ABN PROC FUEL LEAK
      // (280900002), with its STATUS: LAND ANSA; FUEL PARTLY UNUSABLE except an engine fuel leak (LEAK STOPS, item 13);
      // the minimum usable fuel when the leak continues (item 17)
      flightPhaseInhib: FUEL_LEAK_LP_VALVE_PHASE_INHIBITION.leakDetected,
      simVarIsActive: this.fws.fuelLeakDetected,
      notActiveWhenItemActive: [],
      whichItemsToShow: showAllItems(281800073),
      whichItemsChecked: () => EcamAbnormalProcedures[281800073].items.map(() => false),
      limitationsAllPhases: (checked) => ['2', checked[13] ? null : '280400001'],
      limitationsPfd: () => ['2'],
      info: (checked) => (checked[17] ? ['280200001', '280200002'] : []),
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    // ATA 29 - HYDRAULICS
    290800001: {
      // G ELEC PMP A FAULT
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.greenAPumpFault,
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.greenAPumpAuto.get()],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
      inopSysAllPhases: () => ['290300001'],
    },
    290800002: {
      // G ELEC PMP B FAULT
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.greenBPumpFault,
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.greenBPumpAuto.get()],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
      inopSysAllPhases: () => ['290300002'],
    },
    290800003: {
      // Y ELEC PMP A FAULT
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.yellowAPumpFault,
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.yellowAPumpAuto.get()],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
      inopSysAllPhases: () => ['290300003'],
    },
    290800004: {
      // Y ELEC PMP B FAULT
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.yellowBPumpFault,
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.yellowBPumpAuto.get()],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
      inopSysAllPhases: () => ['290300004'],
    },
    290800005: {
      // G ENG 1 PMP A PRESS LO
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.eng1APumpFault,
      whichItemsToShow: () => [true, this.fws.aircraftOnGround.get() && this.fws.threeYellowPumpsFailed.get()],
      whichItemsChecked: () => [!this.fws.eng1APumpAuto.get(), false],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800006: {
      // G ENG 1 PMP B PRESS LO
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.eng1BPumpFault,
      whichItemsToShow: () => [true, this.fws.aircraftOnGround.get() && this.fws.threeYellowPumpsFailed.get()],
      whichItemsChecked: () => [!this.fws.eng1BPumpAuto.get(), false],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800007: {
      // G ENG 2 PMP A PRESS LO
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.eng2APumpFault,
      whichItemsToShow: () => [true, this.fws.aircraftOnGround.get() && this.fws.threeYellowPumpsFailed.get()],
      whichItemsChecked: () => [!this.fws.eng2APumpAuto.get(), false],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800008: {
      // G ENG 2 PMP B PRESS LO
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.eng2BPumpFault,
      whichItemsToShow: () => [true, this.fws.aircraftOnGround.get() && this.fws.threeYellowPumpsFailed.get()],
      whichItemsChecked: () => [!this.fws.eng2BPumpAuto.get(), false],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800009: {
      // Y ENG 3 PMP A PRESS LO
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.eng3APumpFault,
      whichItemsToShow: () => [true, this.fws.aircraftOnGround.get() && this.fws.threeYellowPumpsFailed.get()],
      whichItemsChecked: () => [!this.fws.eng3APumpAuto.get(), false],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800010: {
      // Y ENG 3 PMP B PRESS LO
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.eng3BPumpFault,
      whichItemsToShow: () => [true, this.fws.aircraftOnGround.get() && this.fws.threeYellowPumpsFailed.get()],
      whichItemsChecked: () => [!this.fws.eng3BPumpAuto.get(), false],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800011: {
      // Y ENG 4 PMP A PRESS LO
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.eng4APumpFault,
      whichItemsToShow: () => [true, this.fws.aircraftOnGround.get() && this.fws.threeYellowPumpsFailed.get()],
      whichItemsChecked: () => [!this.fws.eng4APumpAuto.get(), false],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800012: {
      // Y ENG 4 PMP B PRESS LO
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.eng4BPumpFault,
      whichItemsToShow: () => [true, this.fws.aircraftOnGround.get() && this.fws.threeYellowPumpsFailed.get()],
      whichItemsChecked: () => [!this.fws.eng4BPumpAuto.get(), false],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800019: {
      // G RSVR AIR PRESS LO
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.greenRsvLoAirPressure,
      whichItemsToShow: () => [
        true,
        this.fws.engine1Running.get(),
        this.fws.engine2Running.get(),
        this.fws.enginesOffAndOnGroundSignal.read(),
      ],
      whichItemsChecked: () => [
        false,
        !this.fws.eng1APumpAuto.get() && !this.fws.eng1BPumpAuto.get(),
        !this.fws.eng2APumpAuto.get() && !this.fws.eng2BPumpAuto.get(),
        !this.fws.greenAPumpAuto.get() && !this.fws.greenBPumpAuto.get(),
      ],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800020: {
      // Y RSVR AIR PRESS LO
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.yellowRsvLoAirPressure,
      whichItemsToShow: () => [
        true,
        this.fws.engine3Running.get(),
        this.fws.engine4Running.get(),
        this.fws.enginesOffAndOnGroundSignal.read(),
      ],
      whichItemsChecked: () => [
        false,
        !this.fws.eng3APumpAuto.get() && !this.fws.eng3BPumpAuto.get(),
        !this.fws.eng4APumpAuto.get() && !this.fws.eng4BPumpAuto.get(),
        !this.fws.yellowAPumpAuto.get() && !this.fws.yellowBPumpAuto.get(),
      ],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800021: {
      // G RSVR LEVEL LO
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.greenRsvLoLevel,
      whichItemsToShow: () => [
        this.fws.engine1Running.get(),
        this.fws.engine2Running.get(),
        true,
        true,
        this.fws.enginesOffAndOnGroundSignal.read(),
      ],
      whichItemsChecked: () => [
        !this.fws.eng1APumpAuto.get() && !this.fws.eng1BPumpAuto.get(),
        !this.fws.eng2APumpAuto.get() && !this.fws.eng2BPumpAuto.get(),
        this.fws.eng1PumpDisc.get(),
        this.fws.eng2PumpDisc.get(),
        // G ELEC PMP A and B ... OFF (A380 FCOM PRO-ABN HYD G RSVR LEVEL LO / G SYS OVHT)
        !this.fws.greenAPumpAuto.get() && !this.fws.greenBPumpAuto.get(),
      ],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800022: {
      // Y RSVR LEVEL LO
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.yellowRsvLoLevel,
      whichItemsToShow: () => [
        this.fws.engine3Running.get(),
        this.fws.engine4Running.get(),
        true,
        true,
        this.fws.enginesOffAndOnGroundSignal.read(),
      ],
      whichItemsChecked: () => [
        !this.fws.eng3APumpAuto.get() && !this.fws.eng3BPumpAuto.get(),
        !this.fws.eng4APumpAuto.get() && !this.fws.eng4BPumpAuto.get(),
        this.fws.eng3PumpDisc.get(),
        this.fws.eng4PumpDisc.get(),
        !this.fws.yellowAPumpAuto.get() && !this.fws.yellowBPumpAuto.get(),
      ],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800031: {
      // G SYS OVHT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.greenRsvOverheat,
      whichItemsToShow: () => [
        this.fws.engine1Running.get(),
        this.fws.engine2Running.get(),
        // ENG PMP A+B DISC only "If turning off ... is not successful" (FCOM, see HydOverheatFlags)
        this.fws.eng1PumpsOffUnsuccessful.get(),
        this.fws.eng2PumpsOffUnsuccessful.get(),
        this.fws.enginesOffAndOnGroundSignal.read(),
      ],
      whichItemsChecked: () => [
        !this.fws.eng1APumpAuto.get() && !this.fws.eng1BPumpAuto.get(),
        !this.fws.eng2APumpAuto.get() && !this.fws.eng2BPumpAuto.get(),
        this.fws.eng1PumpDisc.get(),
        this.fws.eng2PumpDisc.get(),
        // G ELEC PMP A and B ... OFF (A380 FCOM PRO-ABN HYD G RSVR LEVEL LO / G SYS OVHT)
        !this.fws.greenAPumpAuto.get() && !this.fws.greenBPumpAuto.get(),
      ],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800032: {
      // Y SYS OVHT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.yellowRsvOverheat,
      whichItemsToShow: () => [
        this.fws.engine3Running.get(),
        this.fws.engine4Running.get(),
        // ENG PMP A+B DISC only "If turning off ... is not successful" (FCOM, see HydOverheatFlags)
        this.fws.eng3PumpsOffUnsuccessful.get(),
        this.fws.eng4PumpsOffUnsuccessful.get(),
        this.fws.enginesOffAndOnGroundSignal.read(),
      ],
      whichItemsChecked: () => [
        !this.fws.eng3APumpAuto.get() && !this.fws.eng3BPumpAuto.get(),
        !this.fws.eng4APumpAuto.get() && !this.fws.eng4BPumpAuto.get(),
        this.fws.eng3PumpDisc.get(),
        this.fws.eng4PumpDisc.get(),
        !this.fws.yellowAPumpAuto.get() && !this.fws.yellowBPumpAuto.get(),
      ],
      failure: 2,
      sysPage: SdPages.Hyd,
      notActiveWhenItemActive: [],
    },
    290800035: {
      // G SYS LO PRESS
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.greenAbnormLoPressure,
      whichItemsToShow: () => [
        this.fws.flightPhase1112MoreThanOneMin.get(),
        true,
        true,
        true,
        // FUEL CONSUMPT INCRSD / FMS PRED UNRELIABLE if PRIM 3 also failed (the Subject itself was tested: never shown)
        !this.fws.prim3Healthy.get(),
        !this.fws.prim3Healthy.get(),
        true,
        true,
      ],
      whichItemsChecked: () => [false, false, false, false, false, false, false, false],
      failure: 2,
      limitationsPfd: () => ['320400001'],
      limitationsAllPhases: () => [!this.fws.prim3Healthy.get() ? '800400001' : null],
      limitationsApprLdg: () => ['320400001', '290400001', '290400002', '320400002', '320400003'],
      // A380 FCOM PRO-ABN HYD G (Y) SYS PRESS LO STATUS (a380_fcom.txt l.155731-155766): INFO CAT 3 SINGLE ONLY;
      // INOP SYS APPR & LDG FLAPS SYS 1 (2), SLATS SYS 2 (G only), BTV, NORM N/W (B/W) STEER, CAT 3 DUAL
      info: () => ['220200011', '270200001', '220200016'],
      inopSysAllPhases: () => ['290100001', '320300023', '290300021'],
      inopSysApprLdg: () => ['290100003', '290100006', '320300007', '320300020', '220300028'],
      notActiveWhenItemActive: ['290800039'],
      sysPage: SdPages.Hyd,
    },
    290800036: {
      // Y SYS LO PRESS
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.yellowAbnormLoPressure,
      whichItemsToShow: () => [
        this.fws.flightPhase1112MoreThanOneMin.get(),
        true,
        true, // L/G GRVTY EXTN ONLY
        // FUEL CONSUMPT INCRSD / FMS PRED UNRELIABLE if PRIM 2 also failed
        !this.fws.prim2Healthy.get(),
        !this.fws.prim2Healthy.get(),
        true,
      ],
      whichItemsChecked: () => [false, false, false, false, false, false],
      failure: 2,
      // A380 FCOM PRO-ABN HYD G (Y) SYS PRESS LO LIMITATIONS (a380_fcom.txt l.155652-155700): "For gravity extension:
      // MAX SPEED : 220 KT" on the ECAM (APPR & LDG) and on the PFD (ALL PHASES); the other limitation lines are "If G
      // SYS PRESS LO" only
      limitationsPfd: () => ['320400001'],
      limitationsAllPhases: () => [!this.fws.prim2Healthy.get() ? '800400001' : null],
      limitationsApprLdg: () => ['320400001'],
      // A380 FCOM PRO-ABN HYD G (Y) SYS PRESS LO STATUS (a380_fcom.txt l.155731-155766), in the case of a Y SYS PRESS
      // LO: INFO TAXI WITH CARE, AVOID MAX TILLER ANGLE TURN ON WET/CONTAM RWY, NO BRAKED PIVOT TURN, CAT 3 SINGLE ONLY
      // (AVOID MAX TILLER ANGLE was listed twice); INOP SYS APPR & LDG FLAPS SYS 2, BTV, NORM B/W STEER, CAT 3 DUAL
      info: () => ['800200003', '800200004', '800200005', '220200016'],
      inopSysAllPhases: () => ['290100001', '320300023', '290300022'],
      inopSysApprLdg: () => ['290100004', '320300007', '320300024', '220300028'],
      notActiveWhenItemActive: ['290800039'],
      sysPage: SdPages.Hyd,
    },
    290800039: {
      // G + Y SYS LO PRESS
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.greenYellowAbnormLoPressure,
      whichItemsToShow: () => [
        true,
        this.fws.flapsHandle.get() <= 3, // fix me use actual flap angle
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
      ],
      whichItemsChecked: () => [
        !this.fws.eng1APumpAuto.get() &&
          !this.fws.eng1BPumpAuto.get() &&
          !this.fws.eng2APumpAuto.get() &&
          !this.fws.eng2BPumpAuto.get() &&
          !this.fws.eng3APumpAuto.get() &&
          !this.fws.eng3BPumpAuto.get() &&
          !this.fws.eng4APumpAuto.get() &&
          !this.fws.eng4BPumpAuto.get(),
        this.fws.tawsFlapModeOff.get(),
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ],
      failure: 2,
      limitationsPfd: () => ['320400001'],
      limitationsAllPhases: () => ['800400001'],
      limitationsApprLdg: () => [
        '320400001',
        '270400001',
        '290400001',
        '320400002',
        '220400001',
        '800400004',
        '320400003',
      ],
      info: () => ['340200002', '220200011', '320200001', '800200004', '800200005'],
      // STATUS INOP SYS (A380 FCOM l.156098-156109): ALL PHASES F/CTL PROT, L(R) OUTR AILERON, MOST SPLRs, L/G RETRACTION,
      // G (Y) HYD SYS (no STABILIZER); APP & LDG FLAPS, SLAT SYS 2, BTV, NORM BRK, B/W STEER, NORM N/W STEER, CAT 2,
      // GLS AUTOLAND
      inopSysAllPhases: () => [
        '290100008',
        '290100009',
        '290100010',
        '290100011',
        '320300013',
        '290300021',
        '290300022',
      ],
      inopSysApprLdg: () => [
        '290100012',
        '290100006',
        '320300007',
        '320300008',
        '320300014',
        '320300020',
        '220300027',
        '220300010',
      ],
      notActiveWhenItemActive: [],
      sysPage: SdPages.Hyd,
    },
    290800040: {
      // Y ELEC PMP A+B OFF
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10],
      simVarIsActive: this.fws.yellowElecAandBPumpOff,
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      notActiveWhenItemActive: [],
      failure: -1,
      sysPage: SdPages.None,
    },
    // ATA 31 - DISPLAY/RECORDING
    314800006: {
      // AUDIO FUNCTION LOST
      flightPhaseInhib: [3, 4, 5, 6, 7, 10, 11],
      simVarIsActive: this.fws.audioFunctionLost,
      whichItemsToShow: () => [true, true, true, true],
      whichItemsChecked: () => [true, true, true, true],
      notActiveWhenItemActive: ['314800004'],
      monitorConfirmTime: 5.0,
      failure: -1,
      sysPage: SdPages.None,
      inopSysApprLdg: () => ['320300007', '320300022'],
    },
    314800007: {
      // ECP FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.fwsEcpFailed,
      whichItemsToShow: () => [true, true, true],
      whichItemsChecked: () => [true, true, true],
      notActiveWhenItemActive: [],
      failure: 1,
      sysPage: SdPages.None,
    },
    314800008: {
      // FWS 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.fws1Failed,
        this.fws.dcESSBusPowered,
      ),
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      notActiveWhenItemActive: ['314800003', '314800004'],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['310300002'],
    },
    314800009: {
      // FWS 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.and(), this.fws.fws2Failed, this.fws.dc2BusPowered),
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      notActiveWhenItemActive: ['314800003', '314800004'],
      failure: 1,
      sysPage: SdPages.None,
      redundLoss: () => ['310300003'],
    },
    // ATA 32 - LANDING GEAR & BRAKES
    320800008: {
      // BRAKES A_SKID OFF
      flightPhaseInhib: [4, 5, 6, 7],
      simVarIsActive: this.fws.antiSkidSwitchOff, // TODO check for power source & fault signal
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, false],
      notActiveWhenItemActive: [],
      failure: 2,
      sysPage: SdPages.Wheel,
      inopSysAllPhases: () => ['320300001', '320300002'],
      info: () => ['320200002', '320200003', this.fws.oneEngineRunning.get() ? '800200003' : null, '800200005'],
    },
    320800014: {
      // BTV FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7],
      simVarIsActive: this.fws.btvFaultCaution,
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    320800018: {
      // BRAKES HOT
      flightPhaseInhib: [4, 5, 9, 10, 11],
      simVarIsActive: this.fws.brakesHot,
      whichItemsToShow: () => [
        this.fws.phase112.get(),
        this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
      ],
      whichItemsChecked: () => [false, false, false, false, false],
      limitationsPfd: () => [this.fws.aircraftOnGround.get() ? '' : '260400002'],
      limitationsAllPhases: () => [this.fws.aircraftOnGround.get() ? '' : '260400002'],
      notActiveWhenItemActive: [],
      failure: 2,
      sysPage: SdPages.Wheel,
    },
    320800022: {
      // BRAKES PARK BRK ON
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],
      simVarIsActive: this.fws.lgParkBrkOn,
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.parkBrakeSet.get()],
      notActiveWhenItemActive: [],
      failure: 2,
      sysPage: SdPages.None,
    },
    // BRAKES and STEER alerts from the BCS, EBCU and SCS faults (FwsBrakeAlerts.ts); no audio and no master light =
    // level 1.
    320800020: {
      // BRAKES NORM BRK FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10, 11],
      simVarIsActive: this.fws.brakeSteerAlerts.normBrkFault,
      notActiveWhenItemActive: [],
      // NO LOSS IN BRK EFFICIENCY: only if the alternate braking is failed on another wheel group (not modelled)
      whichItemsToShow: () => [false],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Wheel,
      inopSysApprLdg: () => ['320300008'],
      // ALTN BRK WITH A-SKID, while the alternate braking works
      info: () => [this.fws.brakeSteerAlerts.altnBrkFault.get() ? null : '320200001'],
    },
    320800011: {
      // BRAKES ALTN BRK FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.brakeSteerAlerts.altnBrkFault,
      notActiveWhenItemActive: [],
      // NO LOSS IN BRK EFFICIENCY: only if the normal braking is failed on another wheel group (not modelled)
      whichItemsToShow: () => [false],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Wheel,
      inopSysApprLdg: () => ['320300005'],
    },
    320800017: {
      // BRAKES EMER BRK FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.brakeSteerAlerts.emerBrkFault,
      notActiveWhenItemActive: [],
      // NO LOSS IN BRK EFFICIENCY: in cruise or after landing, if braking is not affected
      whichItemsToShow: () => [
        [8, 11, 12].includes(this.fws.flightPhase.get()) && !this.fws.brakeSteerAlerts.normBrkFault.get(),
      ],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Wheel,
      inopSysApprLdg: () => ['320300006'],
    },
    320800010: {
      // BRAKES ALTN + EMER BRK FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.brakeSteerAlerts.altnEmerBrkFault,
      notActiveWhenItemActive: [],
      // NO LOSS IN BRK EFFICIENCY: only in cruise or after landing
      whichItemsToShow: () => [[8, 11, 12].includes(this.fws.flightPhase.get())],
      whichItemsChecked: () => [false],
      failure: 1,
      sysPage: SdPages.Wheel,
      inopSysAllPhases: () => ['320300005', '320300006'],
    },
    320800024: {
      // BRAKES PEDAL BRAKING FAULT
      flightPhaseInhib: [4, 5, 6, 7],
      simVarIsActive: this.fws.brakeSteerAlerts.pedalBrakingFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.Wheel,
      // LIMITATIONS APPR & LDG: PARK BRK ONLY (no message id yet), LDG DIST AFFECTED
      limitationsApprLdg: () => ['800400002'],
      inopSysApprLdg: () => ['320300010', '320300002'],
    },
    320800009: {
      // BRAKES ACCU PRESS LO
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.brakeSteerAlerts.accuPressLo,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => accuPressLoItems(this.fws.oneEngineRunning.get()),
      // ACCUS REINFLATE: the pb is not modelled
      whichItemsChecked: () => [false, false, false, false],
      failure: 2,
      sysPage: SdPages.Wheel,
      inopSysAllPhases: () => ['320300004'],
    },
    320800023: {
      // BRAKES PARK BRK PRESS LO
      flightPhaseInhib: [3, 4, 5, 6, 7, 8, 9, 10],
      simVarIsActive: this.fws.brakeSteerAlerts.parkBrkPressLo,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => accuPressLoItems(this.fws.oneEngineRunning.get()),
      whichItemsChecked: () => [false, false, false, false],
      failure: 2,
      sysPage: SdPages.Wheel,
      inopSysAllPhases: () => ['320300009'],
    },
    320800001: {
      // BRAKES A-SKID FAULT ON ALL L/G (l.159033-159140, PDF p.5423-5425): emergency braking with the A-SKID sw ON
      flightPhaseInhib: [4, 5, 6, 7],
      simVarIsActive: this.fws.brakeSteerAlerts.aSkidFaultOnAllLg,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.Wheel,
      limitationsApprLdg: () => ['800400002'],
      inopSysApprLdg: () => ['320300001', '320300002', '220300029'],
      info: () => [
        '320200002',
        '320200003',
        this.fws.oneEngineRunning.get() ? '800200003' : null,
        this.fws.oneEngineRunning.get() ? '800200005' : null,
        this.fws.oneEngineRunning.get() ? '220200017' : null,
      ],
    },
    320800013: {
      // BRAKES AUTO BRK FAULT (l.159949-159960, PDF p.5447-5448)
      flightPhaseInhib: [3, 4, 5, 6, 7],
      simVarIsActive: this.fws.brakeSteerAlerts.autoBrkFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Wheel,
      inopSysAllPhases: () => ['320300002'],
    },
    320800060: {
      // STEER NORM N/W STEER FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10],
      simVarIsActive: this.fws.brakeSteerAlerts.normNwSteerFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Wheel,
      limitationsApprLdg: () => ['320400003'],
      inopSysApprLdg: () => ['320300020'],
    },
    320800047: {
      // STEER ALTN N/W STEER FAULT; STATUS: REDUND LOSS ALTN N/W STEER (not shown)
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.brakeSteerAlerts.altnNwSteerFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Wheel,
    },
    320800058: {
      // STEER N/W STEER FAULT
      flightPhaseInhib: [4, 5, 6, 7],
      simVarIsActive: this.fws.brakeSteerAlerts.nwSteerFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Wheel,
      inopSysAllPhases: () => ['320300019', '220300028'],
      // INFO B/W STEER AVAIL FOR TOW & PUSHBACK (no message id yet), CAT 3 SINGLE ONLY
      info: () => ['220200016'],
    },
    320800049: {
      // STEER B/W STEER FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.brakeSteerAlerts.bwSteerFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Wheel,
      inopSysApprLdg: () => ['320300014'],
      // TAXI WITH CARE ... only if at least one engine is running
      info: () => (this.fws.oneEngineRunning.get() ? ['800200003', '800200004', '800200005'] : []),
    },
    320800053: {
      // STEER CTL 1 FAULT; STATUS: REDUND LOSS STEER CTL 1 (not shown)
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.brakeSteerAlerts.steerCtl1Fault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Wheel,
    },
    320800054: {
      // STEER CTL 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.brakeSteerAlerts.steerCtl2Fault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Wheel,
    },
    320800055: {
      // STEER N/W + B/W STEER FAULT
      flightPhaseInhib: [4, 5, 6, 7],
      simVarIsActive: this.fws.brakeSteerAlerts.nwBwSteerFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Wheel,
      inopSysApprLdg: () => ['320300017', '220300028'],
      info: () => ['220200016'],
    },
    320800030: {
      // CONFIG PARK BRK ON
      flightPhaseInhib: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      simVarIsActive: this.fws.configParkBrakeOn,
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      notActiveWhenItemActive: [],
      failure: 3,
      sysPage: SdPages.None,
    },
    320800037: {
      // L/G NOT DOWN NO CANCEL
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],
      simVarIsActive: this.fws.lgNotDownNoCancel,
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      notActiveWhenItemActive: [],
      failure: 3,
      sysPage: SdPages.Wheel,
      cancel: false,
    },
    320800038: {
      // L/G NOT DOWN CANCEL
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12],
      simVarIsActive: MappedSubject.create(
        ([lgNotDown, lgNotDownCancel]) => lgNotDown && !lgNotDownCancel,
        this.fws.lgNotDown,
        this.fws.lgNotDownNoCancel,
      ),
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      notActiveWhenItemActive: [],
      failure: 3,
      sysPage: SdPages.Wheel,
      cancel: true,
    },
    320000001: {
      // AUTO BRK OFF Master Caution light
      simVarIsActive: this.fws.autoBrakeOffMasterCautionLight,
      failure: 2,
      auralWarning: Subject.create(FwcAuralWarning.None),
      flightPhaseInhib: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      sysPage: SdPages.None,
      monitorConfirmTime: 0,
      nonProcedureKey: true,
    },
    // L/G alerts from the LGCIS (A380 FCOM PRO-ABN-ECAM-10-32, FwsGearAlerts.ts). The FCOM flight phase inhibitions are
    // figures: design choice, the A32NX FWC phases of the matching A320 alert mapped onto the A380 phases (A320 3 -> 3,
    // 4 -> 4+5, 5 -> 6+7, 7 -> 9, 8 -> 10, 9 -> 11, 10 -> 12), the A380 F/CTL crew awareness set for the others.
    320800033: {
      // L/G CTL 1 FAULT: crew awareness, SD page only (l.160908-160921). Phases: A320 LGCIU 1 FAULT [3, 4, 5, 7, 8].
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.gearAlerts.lgCtl1Fault,
      notActiveWhenItemActive: ['320800035'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Wheel,
    },
    320800034: {
      // L/G CTL 2 FAULT: crew awareness, SD page only (l.160908-160921). Phases: A320 LGCIU 2 FAULT [3, 4, 5, 7, 8].
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.gearAlerts.lgCtl2Fault,
      notActiveWhenItemActive: ['320800035'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Wheel,
    },
    320800035: {
      // L/G CTL 1+2 FAULT: audio, master light, SD page (l.160933-161049). Phases: A320 LGCIU 1+2 FAULT [4, 5, 7, 8].
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.gearAlerts.lgCtl12Fault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () =>
        lgCtl12Items(this.fws.gearAlerts.ctl12WithGearDown.get(), this.fws.oneEngineRunning.get()),
      whichItemsChecked: () => [this.fws.tawsGpwsOff.get(), false],
      failure: 2,
      sysPage: SdPages.Wheel,
      limitationsAllPhases: () => lgCtl12Limitations(this.fws.gearAlerts.ctl12WithGearDown.get()),
      limitationsPfd: () => lgCtl12PfdLimitations(this.fws.gearAlerts.ctl12WithGearDown.get()),
      // STATUS INOP SYS APPR & LDG: L/G CTL 1+2, GPWS 1+2 (l.161040-161045)
      inopSysApprLdg: () => ['320300011', '340300003'],
    },
    320800039: {
      // L/G GEAR NOT LOCKED DOWN: lever DOWN, a gear not downlocked after about 60 s (l.161239-161344). Red title as
      // the A320 L/G GEAR NOT DOWNLOCKED warning. Phases: A320 GEAR NOT DOWNLOCKED [3, 4, 5, 8].
      flightPhaseInhib: [3, 4, 5, 6, 7, 10],
      simVarIsActive: this.fws.gearAlerts.gearNotLockedDown,
      notActiveWhenItemActive: [],
      whichItemsToShow: () =>
        gearNotLockedDownItems(
          !this.fws.aircraftOnGround.get(),
          this.fws.gearAlerts.notLockedDownGravityDue.get(),
          SimVar.GetSimVarValue('L:A32NX_LG_GRVTY_SWITCH_POS', SimVarValueType.Number) === 2 &&
            this.fws.gearAlerts.leverDown.get(),
        ),
      whichItemsChecked: () =>
        gearNotLockedDownChecked(
          this.fws.gearAlerts.notLockedDownRecycled.get(),
          this.fws.gearAlerts.leverDown.get(),
          SimVar.GetSimVarValue('L:A32NX_LG_GRVTY_SWITCH_POS', SimVarValueType.Number) === 2,
        ),
      failure: 3,
      sysPage: SdPages.Wheel,
      // For gravity extension: MAX SPEED : 220KT, on the ECAM and the PFD (l.161335-161344)
      limitationsAllPhases: () => [this.fws.gearAlerts.notLockedDownGravityDue.get() ? '320400001' : ''],
      limitationsPfd: () => [this.fws.gearAlerts.notLockedDownGravityDue.get() ? '320400001' : ''],
    },
    320800040: {
      // L/G GEAR NOT LOCKED UP: lever UP, a gear not locked up after about 40 s (l.161354-161477). Phases: A320 GEAR
      // NOT UPLOCKED [3, 4, 7, 8, 9, 10].
      flightPhaseInhib: [3, 4, 5, 9, 10, 11, 12],
      simVarIsActive: this.fws.gearAlerts.gearNotLockedUp,
      notActiveWhenItemActive: [],
      whichItemsToShow: () =>
        gearNotLockedUpItems(
          !this.fws.aircraftOnGround.get(),
          this.fws.gearAlerts.anyDoorNotClosed.get(),
          aboveGearDoorSpeed(this.fws.computedAirSpeedToNearest2.get(), this.fws.machSelectedFromAdr.get()),
          this.fws.gearAlerts.notLockedUpRecycled.get(),
        ),
      whichItemsChecked: () =>
        gearNotLockedUpChecked(
          aboveGearDoorSpeed(this.fws.computedAirSpeedToNearest2.get(), this.fws.machSelectedFromAdr.get()),
          this.fws.gearAlerts.notLockedUpRecycled.get(),
          this.fws.gearAlerts.leverDown.get(),
        ),
      failure: 2,
      sysPage: SdPages.Wheel,
      limitationsAllPhases: () =>
        gearNotLockedUpLimitations(
          this.fws.gearAlerts.allGearsDownlocked.get(),
          this.fws.gearAlerts.anyDoorNotClosed.get(),
        ),
      limitationsPfd: () =>
        gearNotLockedUpLimitations(
          this.fws.gearAlerts.allGearsDownlocked.get(),
          this.fws.gearAlerts.anyDoorNotClosed.get(),
        ),
      // STATUS INOP SYS ALL PHASES L/G RETRACTION, APPR & LDG L/G DOORS if a door is open (l.161441-161446), INFO
      // FUEL CONSUMPT INCRSD : FMS PRED DISREGARD (l.161450)
      inopSysAllPhases: () => ['320300013'],
      inopSysApprLdg: () => [this.fws.gearAlerts.anyDoorNotClosed.get() ? '320300012' : ''],
      info: () => [this.fws.aircraftOnGround.get() ? '' : '280200003'],
    },
    320800036: {
      // L/G DOORS NOT CLOSED: a door not closed with the gear stopped (l.161055-161207). Master light and SD page.
      // Phases: the A380 crew awareness set (design choice).
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.gearAlerts.doorsNotClosed,
      notActiveWhenItemActive: ['320800039', '320800040'],
      whichItemsToShow: () =>
        doorsNotClosedItems(
          !this.fws.aircraftOnGround.get(),
          aboveGearDoorSpeed(this.fws.computedAirSpeedToNearest2.get(), this.fws.machSelectedFromAdr.get()),
          this.fws.oneEngineRunning.get(),
        ),
      whichItemsChecked: () =>
        doorsNotClosedChecked(
          aboveGearDoorSpeed(this.fws.computedAirSpeedToNearest2.get(), this.fws.machSelectedFromAdr.get()),
          this.fws.gearAlerts.doorsRecycled.get(),
        ),
      failure: 2,
      sysPage: SdPages.Wheel,
      limitationsAllPhases: () => doorsNotClosedLimitations(!this.fws.aircraftOnGround.get()),
      limitationsPfd: () => doorsNotClosedLimitations(!this.fws.aircraftOnGround.get()),
      // STATUS INOP SYS APPR & LDG L/G DOORS (l.161174-161176), INFO FUEL CONSUMPT INCRSD : FMS PRED DISREGARD (l.161180)
      inopSysApprLdg: () => ['320300012'],
      info: () => [this.fws.aircraftOnGround.get() ? '' : '280200003'],
    },
    320800045: {
      // L/G SYSTEM DISAGREE: crew awareness, SD page only (l.162498-162516). Phases: as L/G CTL 1(2) FAULT.
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.gearAlerts.systemDisagree,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Wheel,
    },

    // ATA 34 - NAVIGATION
    340800001: {
      // ADR 1 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.adr1Faulty,
      notActiveWhenItemActive: ['340800004', '340800008', '340800005'],
      whichItemsToShow: () => [true, true, true, true],
      whichItemsChecked: () => [
        this.fws.airKnob.get() === 0,
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_ADR_1_PB_IS_ON', 'Bool'),
        true,
        SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_1_MODE_SELECTOR_KNOB', 'number') === 0,
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [
        '340300004',
        this.fws.airKnob.get() === 0 ? '' : '340300011',
        this.fws.airKnob.get() === 0 ? '' : '340300001',
      ],
    },
    340800002: {
      // ADR 2 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.adr2Faulty,
      notActiveWhenItemActive: ['340800004', '340800008', '340800006'],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [
        this.fws.airKnob.get() === 2,
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_ADR_2_PB_IS_ON', 'Bool'),
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [
        '340300005',
        this.fws.airKnob.get() === 2 ? '' : '340300012',
        this.fws.airKnob.get() === 2 ? '' : '340300002',
      ],
    },
    340800003: {
      // ADR 3 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.adr3Faulty,
      notActiveWhenItemActive: ['340800005', '340800006', '340800008'],
      whichItemsToShow: () => [true, true, true, true],
      whichItemsChecked: () => [
        this.fws.airKnob.get() === 1,
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_ADR_3_PB_IS_ON', 'Bool'),
        true,
        SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_3_MODE_SELECTOR_KNOB', 'number') === 0,
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['340300006'],
    },
    340800004: {
      // ADR 1+2 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.and(), this.fws.adr1Faulty, this.fws.adr2Faulty),
      notActiveWhenItemActive: ['340800008'],
      whichItemsToShow: () => [true, true, true, true, true, true, true, true],
      whichItemsChecked: () => [
        this.fws.airKnob.get() === 0,
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_ADR_1_PB_IS_ON', 'Bool'),
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_ADR_2_PB_IS_ON', 'Bool'),
        this.fws.tawsWxrSelected.get() === 1,
        this.xpdrTcasSystemIs(1),
        true,
        true,
        SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_1_MODE_SELECTOR_KNOB', 'number') === 0,
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [
        '290100008',
        '340300014',
        '340300021',
        '220300007',
        '220300024',
        '340300007',
        this.fws.airKnob.get() === 0 ? '340300012' : '340300029',
        this.fws.airKnob.get() === 0 ? '340300002' : '340300003',
      ],
      inopSysApprLdg: () => ['220300010', '220300025'],
      info: () => ['340200002', '340200003'],
      limitationsApprLdg: () => ['240400001'],
    },
    340800005: {
      // ADR 1+3 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.and(), this.fws.adr1Faulty, this.fws.adr3Faulty),
      notActiveWhenItemActive: ['340800008'],
      whichItemsToShow: () => [true, true, true, true, true, true, true, true],
      whichItemsChecked: () => [
        this.fws.airKnob.get() === 1,
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_ADR_1_PB_IS_ON', 'Bool'),
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_ADR_3_PB_IS_ON', 'Bool'),
        this.fws.tawsWxrSelected.get() === 2,
        this.xpdrTcasSystemIs(2),
        true,
        true,
        SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_1_MODE_SELECTOR_KNOB', 'number') === 0,
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [
        '290100008',
        '340300014',
        '340300021',
        '220300007',
        '220300024',
        '340300009',
        '340300011',
        '340300001',
      ],
      inopSysApprLdg: () => ['220300010', '220300025'],
      info: () => ['340200002', '340200003'],
      limitationsApprLdg: () => ['240400001'],
    },
    340800006: {
      // ADR 2+3 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.and(), this.fws.adr2Faulty, this.fws.adr3Faulty),
      notActiveWhenItemActive: ['340800008'],
      whichItemsToShow: () => [true, true, true, true, true, true, true, true],
      whichItemsChecked: () => [
        this.fws.airKnob.get() === 1,
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_ADR_2_PB_IS_ON', 'Bool'),
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_ADR_3_PB_IS_ON', 'Bool'),
        this.fws.tawsWxrSelected.get() === 1,
        this.xpdrTcasSystemIs(1),
        true,
        true,
        SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_3_MODE_SELECTOR_KNOB', 'number') === 0,
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [
        '290100008',
        '340300014',
        '340300021',
        '220300007',
        '220300024',
        '340300008',
        '340300012',
        '340300002',
      ],
      inopSysApprLdg: () => ['220300010', '220300025'],
      info: () => ['340200002', '340200003'],
      limitationsApprLdg: () => ['240400001'],
    },
    340800008: {
      // ADR 1+2+3 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.adr1Faulty,
        this.fws.adr2Faulty,
        this.fws.adr3Faulty,
      ),
      notActiveWhenItemActive: ['340800010', '340800071'],
      whichItemsToShow: () => [true, true, true],
      whichItemsChecked: () => [
        false,
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_ADR_1_PB_IS_ON', 'Bool') &&
          !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_ADR_2_PB_IS_ON', 'Bool') &&
          !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_ADR_3_PB_IS_ON', 'Bool'),
        true,
      ],
      failure: 3,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [
        '290100008',
        '340300014',
        '340300021',
        '220300007',
        '220300024',
        '340300010',
        '340300029',
        '340300003',
      ],
      inopSysApprLdg: () => ['220300010', '220300021', '220300025'],
      info: () => ['340200002', '340200003', '340200007'],
      limitationsAllPhases: () => ['240400002', '240400003', '240400004', '300400001'],
      limitationsApprLdg: () => ['240400001'],
      limitationsPfd: () => ['240400002', '240400003', '240400004', '300400001'],
    },
    // NAV AIR DATA DISAGREE, ALL AIR DATA DISAGREE, AOA DISAGREE: logic in FwsAirDataAlerts.ts
    340800009: {
      // AIR DATA DISAGREE
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.airDataAlerts.airDataDisagree,
      notActiveWhenItemActive: ['340800010'],
      whichItemsToShow: () => this.fws.airDataAlerts.airDataDisagreeItemsToShow(),
      whichItemsChecked: () => [false, false, false, false, false, false, false],
      failure: 2,
      sysPage: SdPages.None,
      info: () => (this.fws.airDataAlerts.twoSourcesRejected() ? ['220200015'] : []),
    },
    340800010: {
      // ALL AIR DATA DISAGREE
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.airDataAlerts.allAirDataDisagree,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => this.fws.airDataAlerts.allAirDataDisagreeItemsToShow(),
      whichItemsChecked: () => this.fws.airDataAlerts.allAirDataDisagreeItemsChecked(this.fws.speedBrakeCommand.get()),
      failure: 3,
      sysPage: SdPages.None,
      inopSysAllPhases: () => this.fws.airDataAlerts.allAirDataDisagreeInopSysAllPhases(),
      inopSysApprLdg: () => ['220300027', '220300010', '220300021'],
      info: () => this.fws.airDataAlerts.allAirDataDisagreeInfo(),
      limitationsAllPhases: () => this.fws.airDataAlerts.allAirDataDisagreeLimitations(),
      limitationsPfd: () => this.fws.airDataAlerts.allAirDataDisagreeLimitations(),
    },
    340800014: {
      // AOA DISAGREE: F/CTL ALTN LAW (PROT LOST) is associated (two ADRs with a rejected AOA, PRIM model)
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.airDataAlerts.aoaDisagree,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['290100008', '220300007', '220300001', '220300024'],
      inopSysApprLdg: () => ['220300027', '220300010', '220300021'],
      info: () => ['340200002', '340200020'],
      limitationsAllPhases: () => ['270400002'],
      limitationsPfd: () => ['270400002'],
    },
    340800015: {
      // ARPT NAV LOST
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.arptNavFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
    },
    340800021: {
      // EXTREME LATITUDE
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.extremeLatitudeAlert,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [SimVar.GetSimVarValue('L:A32NX_PUSH_TRUE_REF', 'Bool')],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
      inopSysApprLdg: () => [''],
      redundLoss: () => [''],
      info: () => [''],
    },
    // GPS 1(2) FAULT, GPS 1+2 FAULT: no procedure (crew awareness); design choice: the flight phase inhibition of the
    // ADR faults. STATUS: INOP SYS GPS 1(2), GPS 1+2 and, for APPR & LDG, BTV and ROW/ROP
    340800034: {
      // GPS 1 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.gps1Faulty,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['340300050'],
      inopSysApprLdg: () => [''],
      redundLoss: () => [''],
      info: () => [''],
    },
    340800035: {
      // GPS 2 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.gps2Faulty,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['340300051'],
      inopSysApprLdg: () => [''],
      redundLoss: () => [''],
      info: () => [''],
    },
    340800036: {
      // GPS 1+2 FAULT
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.gps1And2Faulty,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['340300052'],
      inopSysApprLdg: () => ['320300007', '320300022'],
      redundLoss: () => [''],
      info: () => [''],
    },
    340800025: {
      // NAV FM / GPS POS DISAGREE (see FwsNavPositionAlerts): ACFT POS ... CHECK, INFO FLS : RAW ONLY
      flightPhaseInhib: FM_GPS_POS_DISAGREE_PHASE_INHIBITION,
      simVarIsActive: this.fws.navPositionAlerts.fmGpsPosDisagree,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
      inopSysApprLdg: () => [],
      redundLoss: () => [],
      info: () => [FM_GPS_POS_DISAGREE_INFO],
    },
    340800049: {
      // NAV LS TUNING DISAGREE (see FwsNavPositionAlerts): crew awareness, INOP SYS APPR & LDG CAT 2, GLS AUTOLAND
      flightPhaseInhib: LS_TUNING_DISAGREE_PHASE_INHIBITION,
      simVarIsActive: this.fws.navPositionAlerts.lsTuningDisagree,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
      inopSysApprLdg: () => LS_TUNING_DISAGREE_INOP_SYS_APPR_LDG,
      redundLoss: () => [],
      info: () => [],
    },
    340800040: {
      // IR 1 FAULT
      flightPhaseInhib: [4, 5, 6, 9, 10],
      simVarIsActive: this.fws.ir1Fault,
      notActiveWhenItemActive: ['340800042', '340800043'],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [
        this.fws.attKnob.get() === 0,
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_1_PB_IS_ON', 'Bool'),
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [
        '340300030',
        this.fws.attKnob.get() === 0 ? '' : '340300011',
        this.fws.attKnob.get() === 0 ? '' : '340300037',
        this.fws.attKnob.get() === 0 ? '' : '340300039',
        this.fws.attKnob.get() === 0 ? '' : '340300041',
      ],
    },
    340800041: {
      // IR 2 FAULT
      flightPhaseInhib: [4, 5, 6, 9, 10],
      simVarIsActive: this.fws.ir2Fault,
      notActiveWhenItemActive: ['340800042', '340800044'],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [
        this.fws.attKnob.get() === 2,
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_2_PB_IS_ON', 'Bool'),
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [
        '340300031',
        this.fws.attKnob.get() === 2 ? '' : '340300012',
        this.fws.attKnob.get() === 2 ? '' : '340300038',
        this.fws.attKnob.get() === 2 ? '' : '340300040',
        this.fws.attKnob.get() === 2 ? '' : '340300042',
      ],
    },
    340800072: {
      // IR 3 FAULT
      flightPhaseInhib: [4, 5, 6, 9, 10],
      simVarIsActive: this.fws.ir3Fault,
      notActiveWhenItemActive: ['340800043', '340800044'],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [
        this.fws.attKnob.get() === 1,
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_3_PB_IS_ON', 'Bool'),
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['340300032'],
    },
    340800042: {
      // IR 1+2 FAULT
      flightPhaseInhib: [4, 5, 6, 9, 10],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.and(), this.fws.ir1Fault, this.fws.ir2Fault),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true, true, true],
      whichItemsChecked: () => [
        this.fws.attKnob.get() === 0,
        this.fws.tawsWxrSelected.get() === 1,
        this.xpdrTcasSystemIs(1),
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_1_PB_IS_ON', 'Bool'),
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_2_PB_IS_ON', 'Bool'),
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [
        '290100008',
        '340300033',
        this.fws.attKnob.get() === 0 ? '340300038' : '340300043',
        this.fws.attKnob.get() === 0 ? '340300012' : '340300029',
        this.fws.attKnob.get() === 0 ? '340300040' : '340300044',
        this.fws.attKnob.get() === 0 ? '340300042' : '340300045',
      ],
      info: () => ['340200002'],
    },
    340800043: {
      // IR 1+3 FAULT
      flightPhaseInhib: [4, 5, 6, 9, 10],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.and(), this.fws.ir1Fault, this.fws.ir3Fault),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true, true, true, true],
      whichItemsChecked: () => [
        this.fws.attKnob.get() === 1,
        this.fws.tawsWxrSelected.get() === 2,
        this.xpdrTcasSystemIs(2),
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_1_PB_IS_ON', 'Bool'),
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_3_PB_IS_ON', 'Bool'),
        true,
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [
        '290100008',
        '340300034',
        '220300005',
        '220300022',
        '340300037',
        '340300011',
        '340300039',
        '340300041',
      ],
      info: () => ['340200002', '340200008'],
    },
    340800044: {
      // IR 2+3 FAULT
      flightPhaseInhib: [4, 5, 6, 9, 10],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.and(), this.fws.ir2Fault, this.fws.ir3Fault),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true, true, true],
      whichItemsChecked: () => [
        this.fws.attKnob.get() === 1,
        this.fws.tawsWxrSelected.get() === 1,
        this.xpdrTcasSystemIs(1),
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_2_PB_IS_ON', 'Bool'),
        !SimVar.GetSimVarValue('L:A32NX_OVHD_ADIRS_IR_3_PB_IS_ON', 'Bool'),
      ],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [
        '290100008',
        '340300035',
        '220300006',
        '220300023',
        '340300038',
        '340300012',
        '340300040',
        '340300042',
      ],
      info: () => ['340200002'],
    },
    340800045: {
      // IR NOT ALIGNED
      flightPhaseInhib: [1, 4, 5, 6, 7, 8, 9, 10, 12],
      simVarIsActive: this.fws.irExcessMotion,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        this.fws.ir1MaintWord.bitValueOr(13, false) &&
          !this.fws.ir2MaintWord.bitValueOr(13, false) &&
          !this.fws.ir3MaintWord.bitValueOr(13, false),
        !this.fws.ir1MaintWord.bitValueOr(13, false) &&
          this.fws.ir2MaintWord.bitValueOr(13, false) &&
          !this.fws.ir3MaintWord.bitValueOr(13, false),
        !this.fws.ir1MaintWord.bitValueOr(13, false) &&
          !this.fws.ir2MaintWord.bitValueOr(13, false) &&
          this.fws.ir3MaintWord.bitValueOr(13, false),
        this.fws.ir1MaintWord.bitValueOr(13, false) &&
          this.fws.ir2MaintWord.bitValueOr(13, false) &&
          !this.fws.ir3MaintWord.bitValueOr(13, false),
        this.fws.ir1MaintWord.bitValueOr(13, false) &&
          !this.fws.ir2MaintWord.bitValueOr(13, false) &&
          this.fws.ir3MaintWord.bitValueOr(13, false),
        !this.fws.ir1MaintWord.bitValueOr(13, false) &&
          this.fws.ir2MaintWord.bitValueOr(13, false) &&
          !this.fws.ir3MaintWord.bitValueOr(13, false),
        this.fws.ir1MaintWord.bitValueOr(13, false) &&
          this.fws.ir2MaintWord.bitValueOr(13, false) &&
          this.fws.ir3MaintWord.bitValueOr(13, false),
      ],
      whichItemsChecked: () => [true, true, true, true, true, true, true],
      failure: 2,
      sysPage: SdPages.None,
    },
    340800053: {
      // RA SYS A FAULT
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.height1Failed,
        this.fws.ac2BusPowered,
      ),
      notActiveWhenItemActive: ['340800059', '340800060', '340800062'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
      inopSysApprLdg: () => [''],
      redundLoss: () => ['340300022'],
      info: () => [''],
    },
    340800054: {
      // RA SYS B FAULT
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.height2Failed,
        this.fws.ac4BusPowered,
      ),
      notActiveWhenItemActive: ['340800059', '340800061', '340800062'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
      redundLoss: () => ['340300023'],
    },
    340800055: {
      // RA SYS C FAULT
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.height3Failed,
        this.fws.acESSBusPowered,
      ),
      notActiveWhenItemActive: ['340800060', '340800061', '340800062'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
      inopSysApprLdg: () => [''],
      redundLoss: () => ['340300024'],
      info: () => [''],
    },
    340800059: {
      // RA SYS A+B FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10, 11],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.height1Failed,
        this.fws.height2Failed,
        this.fws.ac2BusPowered,
        this.fws.ac4BusPowered,
      ),
      notActiveWhenItemActive: ['340800062'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
      inopSysApprLdg: () => ['340300025'],
    },
    340800060: {
      // RA SYS A+C FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10, 11],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.height1Failed,
        this.fws.height3Failed,
        this.fws.ac2BusPowered,
        this.fws.acESSBusPowered,
      ),
      notActiveWhenItemActive: ['340800062'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
      inopSysApprLdg: () => ['340300026'],
    },
    340800061: {
      // RA SYS B+C FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10, 11],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.height2Failed,
        this.fws.height3Failed,
        this.fws.ac4BusPowered,
        this.fws.acESSBusPowered,
      ),
      notActiveWhenItemActive: ['340800062'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => [],
      inopSysApprLdg: () => ['340300027'],
    },
    340800062: {
      // RA SYS A+B+C FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.height1Failed,
        this.fws.height2Failed,
        this.fws.height3Failed,
        this.fws.ac2BusPowered,
        this.fws.ac4BusPowered,
        this.fws.acESSBusPowered,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true],
      whichItemsChecked: () => [true, true, true],
      failure: 2,
      sysPage: SdPages.None,
      inopSysAllPhases: () => ['340300029', '340300003', '341300003'],
      inopSysApprLdg: () => ['340300028', '310300001', '220300010', '220300021'],
      info: () => ['220200007', '220200008', '220200009'],
    },
    // NAV CAPT AND F/O DISAGREE alerts (A380 FCOM PRO-ABN-ECAM-10-34-10, FwsNavAlerts.ts): audio and master light, no SD
    // page. The FCOM flight phase inhibitions are figures: design choice, the phases of the NAV ADR/IR FAULT alerts.
    340800016: {
      // CAPT AND F/O ALT DISAGREE (l.164494-164516)
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.navAlerts.altDisagree,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    340800017: {
      // CAPT AND F/O ATT DISAGREE (l.164527-164598, lines of TDU 00023230)
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.navAlerts.attDisagree,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    340800018: {
      // CAPT AND F/O BARO REF DISAGREE (l.164609-164624)
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.navAlerts.baroRefDisagree,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.None,
    },
    340800020: {
      // CAPT AND F/O HDG DISAGREE (l.164635-164716, lines of TDU 00023229)
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.navAlerts.hdgDisagree,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    // ATA 34 - SURVEILLANCE
    341800015: {
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.rowLost,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800016: {
      // TCAS 1 FAULT. Not with XPDR 1 FAULT: a failed XPDR 1 makes TCAS 1 inoperative, and SURV XPDR 1 FAULT lists TCAS
      // 1 in its STATUS.
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.tcas1Fault,
      notActiveWhenItemActive: ['341800061'],
      // XPDR & TCAS ..... SYS 2: if selected on SYS 1 and the XPDR/TCAS on SYS 2 is operative
      whichItemsToShow: () => [this.fws.tcas1SwitchLine.isShown()],
      whichItemsChecked: () => [this.fws.tcas1SwitchLine.isChecked(this.fws.xpdrTcasSystem.get())],
      // STATUS: TCAS 1 (FwsInopSys 340300011), AP/FD TCAS MODE if the XPDR/TCAS is selected on SYS 1
      inopSysAllPhases: () => [isApFdTcasModeInop(1, this.fws.xpdrTcasSystem.get()) ? '220300020' : null],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800017: {
      // TCAS 2 FAULT. Not with XPDR 2 FAULT (see TCAS 1 FAULT).
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.tcas2Fault,
      notActiveWhenItemActive: ['341800062'],
      // XPDR & TCAS ..... SYS 1: if selected on SYS 2 and the XPDR/TCAS on SYS 1 is operative
      whichItemsToShow: () => [this.fws.tcas2SwitchLine.isShown()],
      whichItemsChecked: () => [this.fws.tcas2SwitchLine.isChecked(this.fws.xpdrTcasSystem.get())],
      // STATUS: TCAS 2 (FwsInopSys 340300012), AP/FD TCAS MODE if the XPDR/TCAS is selected on SYS 2
      inopSysAllPhases: () => [isApFdTcasModeInop(2, this.fws.xpdrTcasSystem.get()) ? '220300020' : null],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800018: {
      // TCAS 1+2 FAULT: crew awareness, STATUS TCAS 1+2 (FwsInopSys 340300029). Not with XPDR 1+2 FAULT, which lists
      // TCAS 1+2 in its STATUS.
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.tcas1And2Fault,
      notActiveWhenItemActive: ['341800063'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800061: {
      // XPDR 1 FAULT: the XPDR function of SURV SYS 1 is failed. Caution (single chime, MASTER CAUT); flight phase
      // inhibition as the TCAS FAULT alerts.
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.xpdr1Fault,
      notActiveWhenItemActive: [],
      // XPDR & TCAS ..... SYS 2: if selected on SYS 1 and XPDR 2 is operative
      whichItemsToShow: () => [this.fws.xpdr1SwitchLine.isShown()],
      whichItemsChecked: () => [this.fws.xpdr1SwitchLine.isChecked(this.fws.xpdrTcasSystem.get())],
      // STATUS: XPDR 1, TCAS 1, AP/FD TCAS MODE if the XPDR/TCAS is selected on SYS 1
      inopSysAllPhases: () => [
        '340300053',
        '340300011',
        isApFdTcasModeInop(1, this.fws.xpdrTcasSystem.get()) ? '220300020' : null,
      ],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800062: {
      // XPDR 2 FAULT: the XPDR function of SURV SYS 2 is failed
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.xpdr2Fault,
      notActiveWhenItemActive: [],
      // XPDR & TCAS ..... SYS 1: if selected on SYS 2 and XPDR 1 is operative
      whichItemsToShow: () => [this.fws.xpdr2SwitchLine.isShown()],
      whichItemsChecked: () => [this.fws.xpdr2SwitchLine.isChecked(this.fws.xpdrTcasSystem.get())],
      // STATUS: XPDR 2, TCAS 2, AP/FD TCAS MODE if the XPDR/TCAS is selected on SYS 2
      inopSysAllPhases: () => [
        '340300056',
        '340300012',
        isApFdTcasModeInop(2, this.fws.xpdrTcasSystem.get()) ? '220300020' : null,
      ],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800063: {
      // XPDR 1+2 FAULT: crew awareness, STATUS XPDR 1+2, TCAS 1+2
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.xpdr1And2Fault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      inopSysAllPhases: () => ['340300057', '340300029'],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800019: {
      // TCAS STBY
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
      simVarIsActive: this.fws.tcasStandby,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800020: {
      // TERR SYS 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10],
      simVarIsActive: this.fws.terrSys1FaultCond,
      notActiveWhenItemActive: ['341800022'],
      whichItemsToShow: () => [
        !this.fws.terrSys2Failed.get(),
        this.fws.terrSys2Failed.get(),
        this.fws.terrSys2Failed.get(),
      ],
      whichItemsChecked: () => [this.fws.tawsWxrSelected.get() === 2, false, false],
      inopSysAllPhases: () => ['340300039'],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800021: {
      // TERR SYS 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10],
      simVarIsActive: this.fws.terrSys2FaultCond,
      notActiveWhenItemActive: ['341800022'],
      whichItemsToShow: () => [
        !this.fws.terrSys1Failed.get(),
        this.fws.terrSys1Failed.get(),
        this.fws.terrSys1Failed.get(),
      ],
      whichItemsChecked: () => [this.fws.tawsWxrSelected.get() === 1, false, false],
      inopSysAllPhases: () => ['340300040'],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800022: {
      // TERR SYS 1+2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.terrSys1FaultCond,
        this.fws.terrSys2FaultCond,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [this.fws.tawsTerrOff.get()],
      inopSysAllPhases: () => ['340300044'],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800023: {
      // TAWS 1 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10],
      simVarIsActive: this.fws.taws1FaultCond,
      notActiveWhenItemActive: ['341800025'],
      whichItemsToShow: () => [
        this.fws.tawsWxrSelected.get() === 1 && !this.fws.taws2Failed.get(),
        this.fws.taws2Failed.get(),
      ],
      whichItemsChecked: () => [this.fws.tawsWxrSelected.get() === 2, false],
      inopSysAllPhases: () => ['340300046'],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800024: {
      // TAWS 2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10],
      simVarIsActive: this.fws.taws2FaultCond,
      notActiveWhenItemActive: ['341800025'],
      whichItemsToShow: () => [
        this.fws.tawsWxrSelected.get() === 2 && !this.fws.taws1Failed.get(),
        this.fws.taws1Failed.get(),
      ],
      whichItemsChecked: () => [this.fws.tawsWxrSelected.get() === 1, false],
      inopSysAllPhases: () => ['340300047'],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800025: {
      // TAWS 1+2 FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 10],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.and(),
        this.fws.taws1FaultCond,
        this.fws.taws2FaultCond,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.tawsTerrOff.get(), this.fws.tawsGpwsOff.get()],
      inopSysAllPhases: () => ['340300048'],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800026: {
      // SURV GPWS 1 FAULT (A380 FCOM PRO-ABN-ECAM-10-34-20, a380_fcom.txt l.166421-166462): SC, master caution, flight
      // phases 3-7, 10 and 11 inhibited (airbus-a380-fcom PDF p.5623). INOP SYS GPWS 1 is in FwsInopSys.
      flightPhaseInhib: [3, 4, 5, 6, 7, 10, 11],
      simVarIsActive: this.fws.gpws1FaultCond,
      notActiveWhenItemActive: ['341800028'],
      whichItemsToShow: () =>
        gpwsFaultItemsToShow(
          1,
          this.fws.tawsWxrSelected.get(),
          this.fws.wxr2Failed.get(),
          this.fws.gpws2Failed.get() || this.fws.terrSys2Failed.get(),
        ),
      whichItemsChecked: () => [this.fws.tawsWxrSelected.get() === 2, false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800027: {
      // SURV GPWS 2 FAULT, as GPWS 1
      flightPhaseInhib: [3, 4, 5, 6, 7, 10, 11],
      simVarIsActive: this.fws.gpws2FaultCond,
      notActiveWhenItemActive: ['341800028'],
      whichItemsToShow: () =>
        gpwsFaultItemsToShow(
          2,
          this.fws.tawsWxrSelected.get(),
          this.fws.wxr1Failed.get(),
          this.fws.gpws1Failed.get() || this.fws.terrSys1Failed.get(),
        ),
      whichItemsChecked: () => [this.fws.tawsWxrSelected.get() === 1, false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800028: {
      // SURV GPWS 1+2 FAULT (a380_fcom.txt l.166477-166498): [MFD SURV] GPWS ... OFF (l.166493)
      flightPhaseInhib: [3, 4, 5, 6, 7, 10, 11],
      simVarIsActive: MappedSubject.create(
        ([gpws1Fault, gpws2Fault]) => gpws1Fault && gpws2Fault,
        this.fws.gpws1FaultCond,
        this.fws.gpws2FaultCond,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [this.fws.tawsGpwsOff.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800037: {
      // XPDR STBY
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 10, 12],
      simVarIsActive: this.fws.xpdrStby,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    // ATA 30 - ICE AND RAIN PROTECTION
    300800001: {
      // A-ICE ICE DETECTED (A380 FCOM l.156579-156607, AntiIceAlerts.ts): SC, master caution, "inhibited, when all ENG
      // A-ICE pb are set to ON" (in FwsCore iceDetectedTimer2Status). Design choice: not with SEVERE ICE DETECTED, whose
      // procedure has the same lines and WING A-ICE ON.
      flightPhaseInhib: ICE_DETECTED_PHASE_INHIBITION,
      simVarIsActive: this.fws.iceDetectedTimer2Status,
      notActiveWhenItemActive: ['300800002'],
      whichItemsToShow: () => [true, true, true, true],
      whichItemsChecked: () => antiIceItemsChecked(this.engAntiIceOn(), null),
      failure: 2,
      sysPage: SdPages.None,
    },
    300800002: {
      // A-ICE SEVERE ICE DETECTED (A380 FCOM l.157282-157300, AntiIceAlerts.ts): SC, master caution
      flightPhaseInhib: ICE_DETECTED_PHASE_INHIBITION,
      simVarIsActive: MappedSubject.create(
        ([severeIcing, wingAntiIceOn]) => isSevereIceDetected(severeIcing, wingAntiIceOn),
        this.fws.iceSevereDetectedTimerStatus,
        this.fws.wingAntiIce,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true, true, true],
      whichItemsChecked: () => antiIceItemsChecked(this.engAntiIceOn(), this.fws.wingAntiIce.get()),
      failure: 2,
      sysPage: SdPages.None,
    },
    // ATA 49 - APU
    490800001: {
      // APU FAULT (A380 FCOM PRO-ABN-ECAM-10-49, a380_fcom.txt l.170067-170193, ApuFaultAlerts.ts): SC, master caution
      flightPhaseInhib: APU_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.apuFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => apuFaultItemsToShow(this.fws.apuFaultInputs),
      whichItemsChecked: () => apuFaultItemsChecked(this.fws.apuMasterSwitch.get() > 0),
      inopSysAllPhases: () => APU_FAULT_INOP_SYS,
      failure: 2,
      sysPage: SdPages.Apu,
    },
    // ATA 52 - DOORS
    520800008: {
      // CKPT SLIDING WINDOW NOT CLOSED
      flightPhaseInhib: [1, 4, 5, 6, 7, 8, 9, 10, 12],
      simVarIsActive: this.fws.cockpitWindowOpen,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.cockpitWindowOpen.get()],
      failure: 2,
      sysPage: SdPages.Door,
    },
    // DOOR MAIN 1L ... 5R, UPPER 1L ... 3R and FWD/AFT CARGO NOT CLOSED (520800017-034), see doorNotClosedAlerts()
    ...this.doorNotClosedAlerts(),
    // A-ICE ENG and WING valve alerts (300800010-025), see antiIceValveAlerts()
    ...this.antiIceValveAlerts(),
    // ATA 35 OXYGEN (A380 FCOM PRO-ABN-ECAM-10-35, a380_fcom.txt l.167419-167530), see OxygenAlerts.ts. Flight phase
    // inhibitions, audio and master lights from the FCOM figures (2019 FCOM PDF pages 5656-5659): CABIN VLV CLOSED has
    // no audio and no master light
    [OXYGEN_ALERT_IDS.cabinBottlePressLo]: {
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.oxyCabinBottlePressLo,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Door,
    },
    [OXYGEN_ALERT_IDS.cabinValveClosed]: {
      flightPhaseInhib: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      simVarIsActive: this.fws.oxyCabinValveClosed,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.Door,
    },
    [OXYGEN_ALERT_IDS.ckptBottlePressLo]: {
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.oxyCkptBottlePressLo,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Door,
    },
    // ATA 70 - ENGINES
    701800029: {
      // ENG 1 FAIL
      simVarIsActive: this.fws.eng1Fail,
      flightPhaseInhib: ENG_FAIL_FLIGHT_PHASE_INHIBITION, // none
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.aircraftOnGround.get() &&
          this.fws.gearLeverPos.get() &&
          [FwcFlightPhase.LiftOff, FwcFlightPhase.AtOrAbove400Feet].includes(this.fws.flightPhase.get()),
        // AUTO RELIGHT IN PROGRESS only while the FADEC auto relight runs (EngineFailAlerts.ts)
        this.fws.engineAutoRelightInProgress[0].get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get() && !this.fws.engineRelightProcApply.get(),
        !this.fws.aircraftOnGround.get() && this.fws.engineRelightProcApply.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
      ],
      whichItemsChecked: () => [
        !this.fws.gearLeverPos.get(),
        false,
        this.fws.thrustLever1Idle.get(),
        false,
        !this.fws.engine1Master.get(),
        false,
        this.fws.fireButtonEng1.get(),
        !this.fws.apuBleedPbOn.get(),
        false,
        this.fws.eng1Agent1Discharged.get(),
        false,
        false,
        false,
        false,
        this.fws.thrustLever1Idle.get(),
        !this.fws.engine1Master.get(),
        false,
        this.fws.fireButtonEng1.get(),
        !this.fws.apuBleedPbOn.get(),
        false,
        this.fws.eng1Agent1Discharged.get(),
        false,
        false,
        false,
      ],
      sysPage: SdPages.Eng,
      failure: 2,
    },
    701800030: {
      // ENG 2 FAIL
      simVarIsActive: this.fws.eng2Fail,
      flightPhaseInhib: ENG_FAIL_FLIGHT_PHASE_INHIBITION, // none
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.aircraftOnGround.get() &&
          this.fws.gearLeverPos.get() &&
          [FwcFlightPhase.LiftOff, FwcFlightPhase.AtOrAbove400Feet].includes(this.fws.flightPhase.get()),
        // AUTO RELIGHT IN PROGRESS only while the FADEC auto relight runs (EngineFailAlerts.ts)
        this.fws.engineAutoRelightInProgress[1].get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get() && false,
        !this.fws.aircraftOnGround.get() && false,
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get() && !this.fws.engineRelightProcApply.get(),
        !this.fws.aircraftOnGround.get() && this.fws.engineRelightProcApply.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get() && false,
        this.fws.aircraftOnGround.get() && false,
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
      ],
      whichItemsChecked: () => [
        !this.fws.gearLeverPos.get(),
        false,
        this.fws.thrustLever2Idle.get(),
        false,
        !this.fws.engine2Master.get(),
        false,
        this.fws.fireButtonEng2.get(),
        !this.fws.apuBleedPbOn.get(),
        false,
        this.fws.eng2Agent1Discharged.get(),
        false,
        false,
        false,
        false,
        this.fws.thrustLever2Idle.get(),
        !this.fws.engine2Master.get(),
        false,
        this.fws.fireButtonEng2.get(),
        !this.fws.apuBleedPbOn.get(),
        false,
        this.fws.eng2Agent1Discharged.get(),
        false,
        false,
        false,
      ],
      sysPage: SdPages.Eng,
      failure: 2,
    },
    701800031: {
      // ENG 3 FAIL
      simVarIsActive: this.fws.eng3Fail,
      flightPhaseInhib: ENG_FAIL_FLIGHT_PHASE_INHIBITION, // none
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.aircraftOnGround.get() &&
          this.fws.gearLeverPos.get() &&
          [FwcFlightPhase.LiftOff, FwcFlightPhase.AtOrAbove400Feet].includes(this.fws.flightPhase.get()),
        // AUTO RELIGHT IN PROGRESS only while the FADEC auto relight runs (EngineFailAlerts.ts)
        this.fws.engineAutoRelightInProgress[2].get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get() && false,
        !this.fws.aircraftOnGround.get() && false,
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get() && !this.fws.engineRelightProcApply.get(),
        !this.fws.aircraftOnGround.get() && this.fws.engineRelightProcApply.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get() && false,
        this.fws.aircraftOnGround.get() && false,
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
      ],
      whichItemsChecked: () => [
        !this.fws.gearLeverPos.get(),
        false,
        this.fws.thrustLever3Idle.get(),
        false,
        !this.fws.engine3Master.get(),
        false,
        this.fws.fireButtonEng3.get(),
        !this.fws.apuBleedPbOn.get(),
        false,
        this.fws.eng3Agent1Discharged.get(),
        false,
        false,
        false,
        false,
        this.fws.thrustLever3Idle.get(),
        !this.fws.engine3Master.get(),
        false,
        this.fws.fireButtonEng3.get(),
        !this.fws.apuBleedPbOn.get(),
        false,
        this.fws.eng3Agent1Discharged.get(),
        false,
        false,
        false,
      ],
      sysPage: SdPages.Eng,
      failure: 2,
    },
    701800032: {
      // ENG 4 FAIL
      simVarIsActive: this.fws.eng4Fail,
      flightPhaseInhib: ENG_FAIL_FLIGHT_PHASE_INHIBITION, // none
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.aircraftOnGround.get() &&
          this.fws.gearLeverPos.get() &&
          [FwcFlightPhase.LiftOff, FwcFlightPhase.AtOrAbove400Feet].includes(this.fws.flightPhase.get()),
        // AUTO RELIGHT IN PROGRESS only while the FADEC auto relight runs (EngineFailAlerts.ts)
        this.fws.engineAutoRelightInProgress[3].get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get() && false,
        !this.fws.aircraftOnGround.get() && false,
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get(),
        !this.fws.aircraftOnGround.get() && !this.fws.engineRelightProcApply.get(),
        !this.fws.aircraftOnGround.get() && this.fws.engineRelightProcApply.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get() && false,
        this.fws.aircraftOnGround.get() && false,
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
        this.fws.aircraftOnGround.get(),
      ],
      whichItemsChecked: () => [
        !this.fws.gearLeverPos.get(),
        false,
        this.fws.thrustLever4Idle.get(),
        false,
        !this.fws.engine4Master.get(),
        false,
        this.fws.fireButtonEng4.get(),
        !this.fws.apuBleedPbOn.get(),
        false,
        this.fws.eng4Agent1Discharged.get(),
        false,
        false,
        false,
        false,
        this.fws.thrustLever4Idle.get(),
        !this.fws.engine4Master.get(),
        false,
        this.fws.fireButtonEng4.get(),
        !this.fws.apuBleedPbOn.get(),
        false,
        this.fws.eng4Agent1Discharged.get(),
        false,
        false,
        false,
      ],
      sysPage: SdPages.Eng,
      failure: 2,
    },
    701800109: {
      // ENG 1 SHUTDOWN
      flightPhaseInhib: this.fws.phase56Inhibition, // phase 1,2, 11 & 12 inhibited in logic for inop sys & secondary failures reusing
      simVarIsActive: this.fws.eng1ShutdownAbnormalSensed,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.tcasInop.get(),
        this.fws.flightPhase.get() === 7,
        this.fws.fuelOnBoardBetween55And95T.get(),
        this.fws.fuelOnBoardBetween55And95T.get(),
        true,
        true,
        true,
        true,
      ],
      whichItemsChecked: () => [
        this.fws.tcasTaOnly.get(),
        this.fws.gearLeverPos.get(),
        false,
        this.fws.crossFeedPbOn[0].get(),
        false,
        this.fws.flowSelectorKnob.get() === 1,
        this.fws.fwdCargoTempRegulatorOff.get(),
        false,
      ],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800113: {
      // ENG 1 STALL (EngineParameterAlerts.ts): amber, inhibited from V1 to 400 ft unless two or more engines stall
      flightPhaseInhib: [],
      simVarIsActive: this.fws.engStall[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ENG_STALL_ITEMS_SHOWN,
      whichItemsChecked: () => [this.fws.thrustLever1Idle.get(), false, false, !this.fws.engine1Master.get(), false],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800009: {
      // ENG 1 EGT OVER LIMIT (EngineParameterAlerts.ts): amber, inhibited in phases 4, 5 and 6
      flightPhaseInhib: [4, 5, 6],
      simVarIsActive: this.fws.engEgtOverLimit[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ENG_OVER_LIMIT_ITEMS_SHOWN,
      whichItemsChecked: () => [false, false, !this.fws.engine1Master.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800073: {
      // ENG 1 N1/N2 OVER LIMIT (EngineParameterAlerts.ts): red warning, inhibited in phases 5 and 6
      flightPhaseInhib: [5, 6],
      simVarIsActive: this.fws.engN1N2OverLimit[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ENG_OVER_LIMIT_ITEMS_SHOWN,
      whichItemsChecked: () => [false, false, !this.fws.engine1Master.get()],
      failure: 3,
      sysPage: SdPages.None,
    },
    701800114: {
      // ENG 2 STALL, as ENG 1
      flightPhaseInhib: [],
      simVarIsActive: this.fws.engStall[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ENG_STALL_ITEMS_SHOWN,
      whichItemsChecked: () => [this.fws.thrustLever2Idle.get(), false, false, !this.fws.engine2Master.get(), false],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800010: {
      // ENG 2 EGT OVER LIMIT, as ENG 1
      flightPhaseInhib: [4, 5, 6],
      simVarIsActive: this.fws.engEgtOverLimit[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ENG_OVER_LIMIT_ITEMS_SHOWN,
      whichItemsChecked: () => [false, false, !this.fws.engine2Master.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800074: {
      // ENG 2 N1/N2 OVER LIMIT, as ENG 1
      flightPhaseInhib: [5, 6],
      simVarIsActive: this.fws.engN1N2OverLimit[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ENG_OVER_LIMIT_ITEMS_SHOWN,
      whichItemsChecked: () => [false, false, !this.fws.engine2Master.get()],
      failure: 3,
      sysPage: SdPages.None,
    },
    701800115: {
      // ENG 3 STALL, as ENG 1
      flightPhaseInhib: [],
      simVarIsActive: this.fws.engStall[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ENG_STALL_ITEMS_SHOWN,
      whichItemsChecked: () => [this.fws.thrustLever3Idle.get(), false, false, !this.fws.engine3Master.get(), false],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800011: {
      // ENG 3 EGT OVER LIMIT, as ENG 1
      flightPhaseInhib: [4, 5, 6],
      simVarIsActive: this.fws.engEgtOverLimit[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ENG_OVER_LIMIT_ITEMS_SHOWN,
      whichItemsChecked: () => [false, false, !this.fws.engine3Master.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800075: {
      // ENG 3 N1/N2 OVER LIMIT, as ENG 1
      flightPhaseInhib: [5, 6],
      simVarIsActive: this.fws.engN1N2OverLimit[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ENG_OVER_LIMIT_ITEMS_SHOWN,
      whichItemsChecked: () => [false, false, !this.fws.engine3Master.get()],
      failure: 3,
      sysPage: SdPages.None,
    },
    701800116: {
      // ENG 4 STALL, as ENG 1
      flightPhaseInhib: [],
      simVarIsActive: this.fws.engStall[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ENG_STALL_ITEMS_SHOWN,
      whichItemsChecked: () => [this.fws.thrustLever4Idle.get(), false, false, !this.fws.engine4Master.get(), false],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800012: {
      // ENG 4 EGT OVER LIMIT, as ENG 1
      flightPhaseInhib: [4, 5, 6],
      simVarIsActive: this.fws.engEgtOverLimit[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ENG_OVER_LIMIT_ITEMS_SHOWN,
      whichItemsChecked: () => [false, false, !this.fws.engine4Master.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800076: {
      // ENG 4 N1/N2 OVER LIMIT, as ENG 1
      flightPhaseInhib: [5, 6],
      simVarIsActive: this.fws.engN1N2OverLimit[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => ENG_OVER_LIMIT_ITEMS_SHOWN,
      whichItemsChecked: () => [false, false, !this.fws.engine4Master.get()],
      failure: 3,
      sysPage: SdPages.None,
    },
    701800110: {
      // ENG 2 SHUTDOWN
      flightPhaseInhib: this.fws.phase56Inhibition,
      simVarIsActive: this.fws.eng2ShutdownAbnormalSensed,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.tcasInop.get(),
        this.fws.flightPhase.get() === 7,
        this.fws.fuelOnBoardBetween55And95T.get(),
        this.fws.fuelOnBoardBetween55And95T.get(),
        true,
        true,
        true,
        true,
        true,
      ],
      whichItemsChecked: () => [
        this.fws.tcasTaOnly.get(),
        this.fws.gearLeverPos.get(),
        false,
        this.fws.crossFeedPbOn[1].get(),
        false,
        this.fws.flowSelectorKnob.get() === 1,
        this.fws.fwdCargoTempRegulatorOff.get(),
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800111: {
      // ENG 3 SHUTDOWN
      flightPhaseInhib: this.fws.phase56Inhibition,
      simVarIsActive: this.fws.eng3ShutdownAbnormalSensed,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.tcasInop.get(),
        this.fws.flightPhase.get() === 7,
        this.fws.fuelOnBoardBetween55And95T.get(),
        this.fws.fuelOnBoardBetween55And95T.get(),
        true,
        true,
        true,
        true,
        true,
      ],
      whichItemsChecked: () => [
        this.fws.tcasTaOnly.get(),
        this.fws.gearLeverPos.get(),
        false,
        this.fws.crossFeedPbOn[2].get(),
        false,
        this.fws.flowSelectorKnob.get() === 1,
        this.fws.fwdCargoTempRegulatorOff.get(),
        false,
        false,
      ],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800112: {
      // ENG 4 SHUTDOWN
      flightPhaseInhib: this.fws.phase56Inhibition,
      simVarIsActive: this.fws.eng4ShutdownAbnormalSensed,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.tcasInop.get(),
        this.fws.flightPhase.get() === 7,
        this.fws.fuelOnBoardBetween55And95T.get(),
        this.fws.fuelOnBoardBetween55And95T.get(),
        true,
        true,
        true,
        true,
      ],
      whichItemsChecked: () => [
        this.fws.tcasTaOnly.get(),
        this.fws.gearLeverPos.get(),
        false,
        this.fws.crossFeedPbOn[3].get(),
        false,
        this.fws.flowSelectorKnob.get() === 1,
        this.fws.fwdCargoTempRegulatorOff.get(),
        false,
      ],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800033: {
      // ENG 1 FUEL FILTER CLOGGED (EngineFuelFilterAlerts.ts): amber, crew awareness
      flightPhaseInhib: FUEL_FILTER_CLOGGED_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineFuelFilterClogged[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: FUEL_FILTER_CLOGGED_LEVEL,
      sysPage: SdPages.Eng,
    },
    701800034: {
      // ENG 2 FUEL FILTER CLOGGED
      flightPhaseInhib: FUEL_FILTER_CLOGGED_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineFuelFilterClogged[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: FUEL_FILTER_CLOGGED_LEVEL,
      sysPage: SdPages.Eng,
    },
    701800035: {
      // ENG 3 FUEL FILTER CLOGGED
      flightPhaseInhib: FUEL_FILTER_CLOGGED_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineFuelFilterClogged[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: FUEL_FILTER_CLOGGED_LEVEL,
      sysPage: SdPages.Eng,
    },
    701800036: {
      // ENG 4 FUEL FILTER CLOGGED
      flightPhaseInhib: FUEL_FILTER_CLOGGED_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineFuelFilterClogged[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: FUEL_FILTER_CLOGGED_LEVEL,
      sysPage: SdPages.Eng,
    },
    701800081: {
      // ENG 1 OIL FILTER CLOGGED (EngineOilAlerts.ts): amber, crew awareness
      flightPhaseInhib: OIL_FILTER_CLOGGED_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilFilterClogged[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: OIL_FILTER_CLOGGED_LEVEL,
      sysPage: SdPages.Eng,
    },
    701800085: {
      // ENG 1 OIL PRESS LO (EngineOilAlerts.ts): red warning
      flightPhaseInhib: OIL_PRESS_LO_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilPressLo[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.thrustLever1Idle.get(), !this.fws.engine1Master.get()],
      failure: 3,
      sysPage: SdPages.Eng,
    },
    701800093: {
      // ENG 1 OIL TEMP HI (EngineOilAlerts.ts): amber
      flightPhaseInhib: OIL_TEMP_HI_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilTempHi[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true],
      whichItemsChecked: () => [false, false, !this.fws.engine1Master.get()],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800082: {
      // ENG 2 OIL FILTER CLOGGED
      flightPhaseInhib: OIL_FILTER_CLOGGED_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilFilterClogged[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: OIL_FILTER_CLOGGED_LEVEL,
      sysPage: SdPages.Eng,
    },
    701800086: {
      // ENG 2 OIL PRESS LO
      flightPhaseInhib: OIL_PRESS_LO_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilPressLo[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.thrustLever2Idle.get(), !this.fws.engine2Master.get()],
      failure: 3,
      sysPage: SdPages.Eng,
    },
    701800094: {
      // ENG 2 OIL TEMP HI
      flightPhaseInhib: OIL_TEMP_HI_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilTempHi[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true],
      whichItemsChecked: () => [false, false, !this.fws.engine2Master.get()],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800083: {
      // ENG 3 OIL FILTER CLOGGED
      flightPhaseInhib: OIL_FILTER_CLOGGED_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilFilterClogged[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: OIL_FILTER_CLOGGED_LEVEL,
      sysPage: SdPages.Eng,
    },
    701800087: {
      // ENG 3 OIL PRESS LO
      flightPhaseInhib: OIL_PRESS_LO_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilPressLo[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.thrustLever3Idle.get(), !this.fws.engine3Master.get()],
      failure: 3,
      sysPage: SdPages.Eng,
    },
    701800095: {
      // ENG 3 OIL TEMP HI
      flightPhaseInhib: OIL_TEMP_HI_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilTempHi[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true],
      whichItemsChecked: () => [false, false, !this.fws.engine3Master.get()],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800084: {
      // ENG 4 OIL FILTER CLOGGED
      flightPhaseInhib: OIL_FILTER_CLOGGED_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilFilterClogged[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: OIL_FILTER_CLOGGED_LEVEL,
      sysPage: SdPages.Eng,
    },
    701800088: {
      // ENG 4 OIL PRESS LO
      flightPhaseInhib: OIL_PRESS_LO_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilPressLo[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.thrustLever4Idle.get(), !this.fws.engine4Master.get()],
      failure: 3,
      sysPage: SdPages.Eng,
    },
    701800096: {
      // ENG 4 OIL TEMP HI
      flightPhaseInhib: OIL_TEMP_HI_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilTempHi[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true],
      whichItemsChecked: () => [false, false, !this.fws.engine4Master.get()],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800097: {
      // ENG 1 OIL TEMP LO (EngineTakeoffAlerts.ts): amber, phases 2 and 3
      flightPhaseInhib: OIL_TEMP_LO_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilTempLo[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.thrustLever1Idle.get(), false],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800098: {
      // ENG 2 OIL TEMP LO
      flightPhaseInhib: OIL_TEMP_LO_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilTempLo[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.thrustLever2Idle.get(), false],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800099: {
      // ENG 3 OIL TEMP LO
      flightPhaseInhib: OIL_TEMP_LO_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilTempLo[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.thrustLever3Idle.get(), false],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800100: {
      // ENG 4 OIL TEMP LO
      flightPhaseInhib: OIL_TEMP_LO_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineOilTempLo[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.thrustLever4Idle.get(), false],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800151: {
      // ALL ENG FLAME OUT
      simVarIsActive: this.fws.allEnginesFailure,
      flightPhaseInhib: ALL_ENG_FLAME_OUT_INHIBITED_PHASES,
      notActiveWhenItemActive: [],
      whichItemsToShow: showAllItems(701800151),
      whichItemsChecked: () => [
        this.fws.ratDeployed.get() > 0, // RAT MAN ON (as ELEC EMER CONFIG)
        this.fws.allThrottleIdle.get(),
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        this.fws.allEngineSwitchOff.get(),
        false,
        this.fws.apuBleedPbOn.get(),
        false,
        false,
        false,
        false,
        false,
        this.fws.ramAirOn.get(),
        false,
        false,
        false,
        false,
        false,
        false,
        this.fws.tawsGpwsOff.get(),
        false,
        false,
        false, // L/G GRVTY (EXTN 2 MIN)
        false,
        this.fws.gearLeverPos.get(),
        false,
        false,
        false,
        this.fws.spoilersArmed.get(),
        false,
        false,
        false,
        false,
        false,
        this.fws.allEngineSwitchOff.get(),
        !this.fws.apuMasterSwitch.get(),
        false,
        this.fws.parkBrakeSet.get(),
        false,
        false,
        this.fws.allFireButtons.get(),
        false,
        false,
        !this.fws.evacCommand.get(),
        this.fws.allBatteriesOff.get(),
        false,
        false,
        this.fws.tawsGpwsOff.get(),
        false,
        !this.fws.gearLeverPos.get(),
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        this.fws.allEngineSwitchOff.get(),
        !this.fws.apuMasterSwitch.get(),
        false,
        false,
        false,
        this.fws.allFireButtons.get(),
        false,
        false,
        !this.fws.evacCommand.get(),
        false,
        this.fws.allBatteriesOff.get(),
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        this.fws.ramAirOn.get(),
        false,
        false,
        false,
        false,
        false,
        false,
        this.fws.tawsGpwsOff.get(),
        false,
        false,
        false,
        false,
        this.fws.gearLeverPos.get(),
        false,
        false,
        false,
        this.fws.spoilersArmed.get(),
        false,
        false,
        false,
        false,
        false,
        this.fws.allEngineSwitchOff.get(),
        !this.fws.apuMasterSwitch.get(),
        false,
        this.fws.parkBrakeSet.get(),
        false,
        false,
        this.fws.allFireButtons.get(),
        false,
        false,
        !this.fws.evacCommand.get(),
        this.fws.allBatteriesOff.get(),
        false,
        false,
        this.fws.tawsGpwsOff.get(),
        false,
        !this.fws.gearLeverPos.get(),
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        this.fws.allEngineSwitchOff.get(),
        !this.fws.apuMasterSwitch.get(),
        false,
        false,
        false,
        this.fws.allFireButtons.get(),
        false,
        false,
        !this.fws.evacCommand.get(),
        false,
        this.fws.allBatteriesOff.get(),
      ],
      sysPage: SdPages.Eng,
      failure: 3,
    },
    701800013: {
      // ENG 1 FADEC FAULT (see FadecReverserAlerts)
      flightPhaseInhib: FADEC_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.fadecFault[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => fadecFaultItemsShown(this.fws.autoThrustStatus.get() !== 0),
      whichItemsChecked: () => fadecFaultItemsChecked(this.fws.thrustLever1Idle.get(), !this.fws.engine1Master.get()),
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800014: {
      // ENG 2 FADEC FAULT
      flightPhaseInhib: FADEC_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.fadecFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => fadecFaultItemsShown(this.fws.autoThrustStatus.get() !== 0),
      whichItemsChecked: () => fadecFaultItemsChecked(this.fws.thrustLever2Idle.get(), !this.fws.engine2Master.get()),
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800015: {
      // ENG 3 FADEC FAULT
      flightPhaseInhib: FADEC_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.fadecFault[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => fadecFaultItemsShown(this.fws.autoThrustStatus.get() !== 0),
      whichItemsChecked: () => fadecFaultItemsChecked(this.fws.thrustLever3Idle.get(), !this.fws.engine3Master.get()),
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800016: {
      // ENG 4 FADEC FAULT
      flightPhaseInhib: FADEC_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.fadecFault[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => fadecFaultItemsShown(this.fws.autoThrustStatus.get() !== 0),
      whichItemsChecked: () => fadecFaultItemsChecked(this.fws.thrustLever4Idle.get(), !this.fws.engine4Master.get()),
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800021: {
      // ENG 1 FADEC SYS FAULT: crew awareness
      flightPhaseInhib: FADEC_SYS_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.fadecSysFault[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800022: {
      // ENG 2 FADEC SYS FAULT
      flightPhaseInhib: FADEC_SYS_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.fadecSysFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800023: {
      // ENG 3 FADEC SYS FAULT
      flightPhaseInhib: FADEC_SYS_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.fadecSysFault[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800024: {
      // ENG 4 FADEC SYS FAULT
      flightPhaseInhib: FADEC_SYS_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.fadecSysFault[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800025: {
      // ENG 1 FADEC TEMP HI: crew awareness
      flightPhaseInhib: FADEC_TEMP_HI_PHASE_INHIBITION,
      simVarIsActive: this.fws.fadecTempHi[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800026: {
      // ENG 2 FADEC TEMP HI
      flightPhaseInhib: FADEC_TEMP_HI_PHASE_INHIBITION,
      simVarIsActive: this.fws.fadecTempHi[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800027: {
      // ENG 3 FADEC TEMP HI
      flightPhaseInhib: FADEC_TEMP_HI_PHASE_INHIBITION,
      simVarIsActive: this.fws.fadecTempHi[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800028: {
      // ENG 4 FADEC TEMP HI
      flightPhaseInhib: FADEC_TEMP_HI_PHASE_INHIBITION,
      simVarIsActive: this.fws.fadecTempHi[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800129: {
      // ENG 1 THR LEVER FAULT (see FadecReverserAlerts)
      flightPhaseInhib: THR_LEVER_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.thrLeverFault[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => thrLeverFaultItemsShown(this.fws.aircraftOnGround.get(), false),
      whichItemsChecked: () =>
        thrLeverFaultItemsChecked(
          this.fws.thrustLever1Idle.get(),
          isThrLeverInClimbDetent(SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_TLA:1', 'number')),
          false,
        ),
      failure: 2,
      sysPage: SdPages.None,
    },
    701800130: {
      // ENG 2 THR LEVER FAULT
      flightPhaseInhib: THR_LEVER_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.thrLeverFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => thrLeverFaultItemsShown(this.fws.aircraftOnGround.get(), true),
      whichItemsChecked: () =>
        thrLeverFaultItemsChecked(
          this.fws.thrustLever2Idle.get(),
          isThrLeverInClimbDetent(SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_TLA:2', 'number')),
          true,
        ),
      failure: 2,
      sysPage: SdPages.None,
    },
    701800131: {
      // ENG 3 THR LEVER FAULT
      flightPhaseInhib: THR_LEVER_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.thrLeverFault[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => thrLeverFaultItemsShown(this.fws.aircraftOnGround.get(), true),
      whichItemsChecked: () =>
        thrLeverFaultItemsChecked(
          this.fws.thrustLever3Idle.get(),
          isThrLeverInClimbDetent(SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_TLA:3', 'number')),
          true,
        ),
      failure: 2,
      sysPage: SdPages.None,
    },
    701800132: {
      // ENG 4 THR LEVER FAULT
      flightPhaseInhib: THR_LEVER_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.thrLeverFault[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => thrLeverFaultItemsShown(this.fws.aircraftOnGround.get(), false),
      whichItemsChecked: () =>
        thrLeverFaultItemsChecked(
          this.fws.thrustLever4Idle.get(),
          isThrLeverInClimbDetent(SimVar.GetSimVarValue('L:A32NX_AUTOTHRUST_TLA:4', 'number')),
          false,
        ),
      failure: 2,
      sysPage: SdPages.None,
    },
    701800137: {
      // ENG 2 REVERSER CTL FAULT
      flightPhaseInhib: REVERSER_CTL_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.reverserCtlFault[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => reverserInopItemsShown(this.fws.aircraftOnGround.get()),
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800139: {
      // ENG 2 REVERSER ENERGIZED
      flightPhaseInhib: REVERSER_ENERGIZED_PHASE_INHIBITION,
      simVarIsActive: this.fws.reverserEnergized[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [this.fws.thrustLever2Idle.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800141: {
      // ENG 2 REVERSER FAULT
      flightPhaseInhib: REVERSER_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.reverserFault[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => reverserInopItemsShown(this.fws.aircraftOnGround.get()),
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800145: {
      // ENG 2 REVERSER LOCKED
      flightPhaseInhib: REVERSER_LOCKED_PHASE_INHIBITION,
      simVarIsActive: this.fws.reverserLocked[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => reverserInopItemsShown(this.fws.aircraftOnGround.get()),
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800149: {
      // ENG 2 REVERSER UNLOCKED (see FadecReverserAlerts)
      flightPhaseInhib: REVERSER_UNLOCKED_PHASE_INHIBITION,
      simVarIsActive: this.fws.reverserUnlocked[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => reverserUnlockedItemsShown(this.fws.aircraftOnGround.get()),
      whichItemsChecked: () =>
        reverserUnlockedItemsChecked(this.fws.thrustLever2Idle.get(), !this.fws.engine2Master.get()),
      failure: 2,
      sysPage: SdPages.None,
    },
    701800138: {
      // ENG 3 REVERSER CTL FAULT
      flightPhaseInhib: REVERSER_CTL_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.reverserCtlFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => reverserInopItemsShown(this.fws.aircraftOnGround.get()),
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800140: {
      // ENG 3 REVERSER ENERGIZED
      flightPhaseInhib: REVERSER_ENERGIZED_PHASE_INHIBITION,
      simVarIsActive: this.fws.reverserEnergized[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [this.fws.thrustLever3Idle.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800142: {
      // ENG 3 REVERSER FAULT
      flightPhaseInhib: REVERSER_FAULT_PHASE_INHIBITION,
      simVarIsActive: this.fws.reverserFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => reverserInopItemsShown(this.fws.aircraftOnGround.get()),
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800146: {
      // ENG 3 REVERSER LOCKED
      flightPhaseInhib: REVERSER_LOCKED_PHASE_INHIBITION,
      simVarIsActive: this.fws.reverserLocked[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => reverserInopItemsShown(this.fws.aircraftOnGround.get()),
      whichItemsChecked: () => [false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800150: {
      // ENG 3 REVERSER UNLOCKED
      flightPhaseInhib: REVERSER_UNLOCKED_PHASE_INHIBITION,
      simVarIsActive: this.fws.reverserUnlocked[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => reverserUnlockedItemsShown(this.fws.aircraftOnGround.get()),
      whichItemsChecked: () =>
        reverserUnlockedItemsChecked(this.fws.thrustLever3Idle.get(), !this.fws.engine3Master.get()),
      failure: 2,
      sysPage: SdPages.None,
    },
    701800133: {
      // ENG 1 THRUST LOSS (EngineThrustAlerts.ts): amber, phase 3 only
      flightPhaseInhib: THRUST_LOSS_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineThrustLoss[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => thrustLossItemsChecked(this.fws.thrustLever1Idle.get(), !!this.fws.engine1Master.get()),
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800134: {
      // ENG 2 THRUST LOSS
      flightPhaseInhib: THRUST_LOSS_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineThrustLoss[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => thrustLossItemsChecked(this.fws.thrustLever2Idle.get(), !!this.fws.engine2Master.get()),
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800135: {
      // ENG 3 THRUST LOSS
      flightPhaseInhib: THRUST_LOSS_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineThrustLoss[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => thrustLossItemsChecked(this.fws.thrustLever3Idle.get(), !!this.fws.engine3Master.get()),
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800136: {
      // ENG 4 THRUST LOSS
      flightPhaseInhib: THRUST_LOSS_PHASE_INHIBITION,
      simVarIsActive: this.fws.engineThrustLoss[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => thrustLossItemsChecked(this.fws.thrustLever4Idle.get(), !!this.fws.engine4Master.get()),
      failure: 2,
      sysPage: SdPages.Eng,
    },
    701800155: {
      // ENG T.O THRUST DISAGREE (EngineThrustAlerts.ts): amber, phases 2 and 11, crew awareness
      flightPhaseInhib: TO_THRUST_DISAGREE_PHASE_INHIBITION,
      simVarIsActive: this.fws.takeoffThrustDisagree,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800154: {
      // ENG REVERSER SELECTED
      flightPhaseInhib: REVERSER_SELECTED_PHASE_INHIBITION,
      simVarIsActive: this.fws.anyReverserSelected,
      notActiveWhenItemActive: [],
      whichItemsToShow: () =>
        reverserSelectedItemsShown(this.fws.reverserSelected[0].get(), this.fws.reverserSelected[1].get()),
      whichItemsChecked: () => [false, false, false],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800159: {
      // ENG TWO ENGS OUT ON SAME SIDE. Phases 5 and 6 inhibited.
      flightPhaseInhib: this.fws.phase56Inhibition,
      simVarIsActive: this.fws.twoEnginesOutSameSide,
      notActiveWhenItemActive: [],
      // PACK 1(2) OFF depending on the failed engines (EngineFailAlerts.sameSideLines), LDG PERF AFFECTED, if ENG 1+2
      // failed: FOR TAXI : STEER ENDURANCE LIMITED
      whichItemsToShow: () => [
        this.fws.twoEnginesOutLeftSide.get(),
        this.fws.twoEnginesOutRightSide.get(),
        true,
        this.fws.twoEnginesOutLeftSide.get(),
      ],
      whichItemsChecked: () => [!this.fws.pack1On.get(), !this.fws.pack2On.get(), false, false],
      failure: 2,
      sysPage: SdPages.Eng,
      // STATUS. ALL PHASES: PART L/G RETRACTION, PACK 1(2) here; PART SPLRs, GEN 1+2 (3+4), G(Y) HYD SYS, ENG BLEED
      // come from FwsInopSys (the HYD SYS lost with its two engines: FwsCore). APPR & LDG: the lines below, REVERSER
      // and BTV from FwsInopSys
      inopSysAllPhases: () => ['320300023', this.fws.twoEnginesOutLeftSide.get() ? '210300009' : '210300010'],
      inopSysApprLdg: () =>
        this.fws.twoEnginesOutLeftSide.get()
          ? ['290100003', '290100006', '320300020', '220300027', '220300010']
          : ['290100004', '320300014', '220300027', '220300010'],
      info: () => (this.fws.twoEnginesOutRightSide.get() ? ['800200003'] : []),
      // LIMITATIONS: FOR LDG : FLAP LVR 3, FLAPS SLOW, LDG PERF AFFECTED; if ENG 1+2 failed: SLATS SLOW, L/G GRVTY EXTN
      // ONLY, STEER ENDUR LIMITED. LAND ANSA comes from the recommendation of the procedure.
      limitationsApprLdg: () =>
        this.fws.twoEnginesOutLeftSide.get()
          ? ['270400001', '290400001', '290400002', '320400002', '800400003', '320400003']
          : ['270400001', '290400002', '800400003'],
    },
    701800160: {
      // ENG TWO ENGS OUT ON OPPOSITE SIDE. Phases 5 and 6 inhibited. The PACK 1(2) OFF line, which depends on the
      // failed engines, is not shown: which pack goes with which pair of engines on opposite sides is not known.
      flightPhaseInhib: this.fws.phase56Inhibition,
      simVarIsActive: this.fws.twoEnginesOutOppositeSide,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Eng,
      // STATUS: BTV (FwsInopSys), CAT 3; INFO CAT 2 ONLY
      inopSysApprLdg: () => ['220300029'],
      info: () => ['220200017'],
      // LIMITATIONS: FOR LDG : FLAP LVR 3, LDG PERF AFFECTED
      limitationsApprLdg: () => ['270400001', '800400003'],
    },
    701800157: {
      // ENG THR LEVERS NOT SET (EngineTakeoffAlerts.ts): amber, phases 2 and 3. Design choice: confirmed 3 s, as the
      // A32NX FWC (a lever moved through CL to FLX/MCT does not trigger it)
      flightPhaseInhib: THR_LEVERS_NOT_SET_PHASE_INHIBITION,
      simVarIsActive: this.fws.thrustLeverNotSet,
      monitorConfirmTime: 3,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => thrLeversNotSetItemsShown(this.fws.flexTakeoffMode.get()),
      whichItemsChecked: () => [this.fws.allThrottleToga.get(), this.fws.allThrottleMct.get()],
      failure: 2,
      sysPage: SdPages.None,
    },
    701800158: {
      // ENGINE THRUST LOCKED
      simVarIsActive: this.fws.engineThrustLockedAbnormalSensed,
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 10, 11, 12],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      sysPage: SdPages.None,
      failure: 2,
    },

    // SECONDARY FAILURES
    999800001: {
      // *F/CTL
      flightPhaseInhib: [],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.or(),
        this.fws.greenAbnormLoPressure,
        this.fws.yellowAbnormLoPressure,
        this.fws.greenYellowAbnormLoPressure,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Fctl,
    },
    999800002: {
      // *FUEL
      flightPhaseInhib: [],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.or()),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    999800003: {
      // *WHEEL
      flightPhaseInhib: [],
      simVarIsActive: MappedSubject.create(
        SubscribableMapFunctions.or(),
        this.fws.greenAbnormLoPressure,
        this.fws.yellowAbnormLoPressure,
        this.fws.greenYellowAbnormLoPressure,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Wheel,
    },
    999800004: {
      // *ELEC
      flightPhaseInhib: [],
      simVarIsActive: this.fws.elecAcSecondaryFailure,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    999800005: {
      // *ELEC
      flightPhaseInhib: [],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.or()),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.ElecDc,
    },
    999800006: {
      // *BLEED
      flightPhaseInhib: [],
      simVarIsActive: this.fws.bleedSecondaryFailure,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Bleed,
    },
    999800007: {
      // *HYD
      flightPhaseInhib: [],
      simVarIsActive: MappedSubject.create(SubscribableMapFunctions.or()),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.Hyd,
    },
  };

  public ewdDeferredProcs: EwdAbnormalDict = {
    210700001: {
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.pack1On.get(), this.fws.pack2On.get()],
      failure: 0,
      sysPage: SdPages.None,
    },
    210700002: {
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.ramAirOn.get(), this.fws.cabinAirExtractOn.get()],
      failure: 0,
      sysPage: SdPages.None,
    },
    210700003: {
      // WHEN DUCT OVHT OUT (COND DUCT OVHT deferred procedure)
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () =>
        condDuctOvhtOutItems(this.fws.trimAirMonitoringFlags(), this.fws.hotAirValveFlags(), this.fws.packPbsOn()).show,
      whichItemsChecked: () =>
        condDuctOvhtOutItems(this.fws.trimAirMonitoringFlags(), this.fws.hotAirValveFlags(), this.fws.packPbsOn())
          .checked,
      failure: 0,
      sysPage: SdPages.None,
    },
    221700001: {
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [this.fws.manCabinAltMode.get(), false],
      failure: 0,
      sysPage: SdPages.None,
    },
    290700001: {
      // HYD G RSVR AIR PRESS LO FOR APPROACH (a380_fcom.txt l.155249-155253): G ENG 1(2) PMP A and B ON
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [
        this.fws.eng1APumpAuto.get() && this.fws.eng1BPumpAuto.get(),
        this.fws.eng2APumpAuto.get() && this.fws.eng2BPumpAuto.get(),
      ],
      failure: 0,
      sysPage: SdPages.None,
    },
    290700002: {
      // HYD Y RSVR AIR PRESS LO FOR APPROACH: Y ENG 3(4) PMP A and B ON
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [
        this.fws.eng3APumpAuto.get() && this.fws.eng3BPumpAuto.get(),
        this.fws.eng4APumpAuto.get() && this.fws.eng4BPumpAuto.get(),
      ],
      failure: 0,
      sysPage: SdPages.None,
    },
    290700003: {
      // HYD G SYS OVHT APPROACH (a380_fcom.txt l.155480-155487): "The ECAM does not display the following procedure, if
      // the flight crew disconnected the engine pumps."
      flightPhaseInhib: [],
      simVarIsActive: MappedSubject.create(
        ([eng1PumpDisc, eng2PumpDisc]) => !eng1PumpDisc && !eng2PumpDisc,
        this.fws.eng1PumpDisc,
        this.fws.eng2PumpDisc,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true],
      whichItemsChecked: () => [
        !this.fws.greenRsvOverheat.get(),
        this.fws.eng1APumpAuto.get() && this.fws.eng1BPumpAuto.get(),
        this.fws.eng2APumpAuto.get() && this.fws.eng2BPumpAuto.get(),
      ],
      failure: 0,
      sysPage: SdPages.None,
    },
    290700004: {
      // HYD Y SYS OVHT APPROACH, as 290700003
      flightPhaseInhib: [],
      simVarIsActive: MappedSubject.create(
        ([eng3PumpDisc, eng4PumpDisc]) => !eng3PumpDisc && !eng4PumpDisc,
        this.fws.eng3PumpDisc,
        this.fws.eng4PumpDisc,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true],
      whichItemsChecked: () => [
        !this.fws.yellowRsvOverheat.get(),
        this.fws.eng3APumpAuto.get() && this.fws.eng3BPumpAuto.get(),
        this.fws.eng4APumpAuto.get() && this.fws.eng4BPumpAuto.get(),
      ],
      failure: 0,
      sysPage: SdPages.None,
    },
    270700001: {
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true, true, true],
      whichItemsChecked: () => [false, false, false, false, false],
      failure: 0,
      sysPage: SdPages.None,
    },
    320700001: {
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true, true, true, true],
      whichItemsChecked: () => [
        false,
        SimVar.GetSimVarValue('L:A32NX_GEAR_LEVER_POSITION_REQUEST', SimVarValueType.Number) === 0,
        SimVar.GetSimVarValue('L:A32NX_LG_GRVTY_SWITCH_POS', SimVarValueType.Number) === 2,
        this.fws.isAllGearDownlocked,
        SimVar.GetSimVarValue('L:A32NX_GEAR_LEVER_POSITION_REQUEST', SimVarValueType.Number) === 1,
      ],
      failure: 0,
      sysPage: SdPages.None,
    },
    700700001: {
      // ENG 1(4) START VLV FAULT (NOT CLOSED) FOR APPROACH: IF SEVERE ICE ACCRETION: FOR LDG : FLAP LVR 3
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [false, false],
      failure: 0,
      sysPage: SdPages.None,
    },
    700700002: {
      // ENG TWO ENGS OUT ALL PHASES: IF GW DECREASE RQRD: JETTISON ARM ON, JETTISON ACTIVE ON (EngineFailAlerts.ts)
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => twoEnginesOutAllPhasesItems(this.twoEnginesOutDeferredInputs()).show,
      whichItemsChecked: () => twoEnginesOutAllPhasesItems(this.twoEnginesOutDeferredInputs()).checked,
      failure: 0,
      sysPage: SdPages.None,
    },
    700700003: {
      // ENG TWO ENGS OUT ON SAME SIDE FOR APPROACH (EngineFailAlerts.ts)
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => sameSideApproachItems(this.twoEnginesOutDeferredInputs()).show,
      whichItemsChecked: () => sameSideApproachItems(this.twoEnginesOutDeferredInputs()).checked,
      failure: 0,
      sysPage: SdPages.None,
    },
    700700004: {
      // ENG TWO ENGS OUT ON OPPOSITE SIDE APPR & LDG (EngineFailAlerts.ts)
      flightPhaseInhib: [],
      simVarIsActive: Subject.create(true),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => oppositeSideApproachItems(this.twoEnginesOutDeferredInputs()).show,
      whichItemsChecked: () => oppositeSideApproachItems(this.twoEnginesOutDeferredInputs()).checked,
      failure: 0,
      sysPage: SdPages.None,
    },
  };

  /** The aircraft state that the ENG TWO ENGS OUT deferred procedures sense */
  private twoEnginesOutDeferredInputs(): TwoEnginesOutDeferredInputs {
    return {
      // The FWS has no fuel jettison pb inputs of its own: the pbs are read here directly
      jettisonArmPbOn: SimVar.GetSimVarValue('L:A380X_OVHD_FUEL_JETTISON_ARM_PB_IS_ON', SimVarValueType.Bool) > 0,
      jettisonActivePbOn: SimVar.GetSimVarValue('L:A380X_OVHD_FUEL_JETTISON_ACTIVE_PB_IS_ON', SimVarValueType.Bool) > 0,
      engines1And2Out: this.fws.twoEnginesOutLeftSide.get(),
      flapsHandleIndex: this.fws.flapsHandle.get(),
      gearLeverDown: this.fws.gearLeverPos.get(),
      gravityExtensionDown: SimVar.GetSimVarValue('L:A32NX_LG_GRVTY_SWITCH_POS', SimVarValueType.Number) === 2,
      athrEngaged: this.fws.autoThrustStatus.get() !== 0,
      groundSpoilersArmed: this.fws.spoilersArmed.get(),
    };
  }
}
