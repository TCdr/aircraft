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
// FIXME should not import from instruments
import {
  ProcedureLinesGenerator,
  ProcedureType,
} from '../../../instruments/src/MsfsAvionicsCommon/EcamMessages/ProcedureLinesGenerator';
// FIXME should not import from instruments
import { ChecklistState, FwsEvents } from '../../../instruments/src/MsfsAvionicsCommon/providers/FwsPublisher';
import { FwcAuralWarning, FwsCore, FwsSuppressableItem } from './FwsCore';
import { ELEC_AC_ESS_BUS_FAULT_STATUS } from './FwsElecAlerts';
import { isApFdTcasModeInop } from './FwsSurvAlerts';
import { ALL_ENG_FLAME_OUT_INHIBITED_PHASES } from './EngineFailAlerts';
import {
  condDuctOvhtActive,
  condDuctOvhtInfo,
  condDuctOvhtInopSys,
  condDuctOvhtItems,
  condDuctOvhtOutItems,
  fwdCargoTempRegulFaultActive,
  fwdCargoTempRegulFaultItemsToShow,
} from './CondTrimAirFlags';
import { DisplayUnitID } from '@shared/CdsDisplayUnits';

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

  /** Whether the XPDR & TCAS system selected on the SURV panel (L:A32NX_TRANSPONDER_SYSTEM, 0 = SYS 1) is the given one. */
  private xpdrTcasSystemIs(system: 1 | 2): boolean {
    return SimVar.GetSimVarValue('L:A32NX_TRANSPONDER_SYSTEM', 'number') === system - 1;
  }

  /**
   * ELEC GEN 1(2)(3)(4) FAULT, FCOM PRO-ABN-ECAM-10-24 l.142304, PDF p.4945 (master caution, SC).
   * GEN x ... OFF (l.142349, the Impacted DU procedure: the texts have no "OFF THEN ON" reset line).
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
      failure: 2,
      sysPage: SdPages.ElecAc,
    };
  }

  /**
   * ELEC GEN 1(2)(3)(4) OFF, FCOM l.142388, PDF p.4947 (master caution, SC): crew awareness, no procedure line.
   * @param gen 0 to 3 for GEN 1 to GEN 4
   */
  private elecGenOffItem(gen: number): EwdAbnormalItem {
    return {
      flightPhaseInhib: [1, 3, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.elecGenOff[gen],
      notActiveWhenItemActive: ['240800055'],
      // Design choice (not in the FCOM): 5 s, so that the GEN ... OFF THEN ON resets of other procedures do not
      // flash this alert
      monitorConfirmTime: 5,
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.ElecAc,
    };
  }

  /**
   * ELEC DRIVE 1(2)(3)(4) DISCONNECTED, FCOM l.141179, PDF p.4918 (master caution, SC).
   * The FCOM procedure is crew awareness only (l.141222): the GEN x OFF line of the text is hidden.
   * @param drive 0 to 3 for DRIVE 1 to DRIVE 4
   */
  private elecDriveDisconnectedItem(drive: number): EwdAbnormalItem {
    return {
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.elecDriveDisconnected[drive],
      notActiveWhenItemActive: ['240800055'],
      whichItemsToShow: () => [false],
      whichItemsChecked: () => [!this.fws.elecGenPbOn[drive].get()],
      failure: 2,
      sysPage: SdPages.ElecAc,
    };
  }

  /**
   * ELEC APU GEN A(B) FAULT, FCOM l.139366, PDF p.4872 (master caution, SC): APU GEN A(B) ... OFF (l.139412).
   * @param gen 0 for APU GEN A, 1 for APU GEN B
   */
  private elecApuGenFaultItem(gen: number): EwdAbnormalItem {
    return {
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.elecApuGenFault[gen],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [!this.fws.elecApuGenPbOn[gen].get()],
      failure: 2,
      sysPage: SdPages.ElecAc,
    };
  }

  /**
   * ELEC TR 1(2)(ESS) FAULT, FCOM l.142822, PDF p.4961 (no master light, no audio): crew awareness.
   * @param tr 0 for TR 1, 1 for TR 2, 2 for TR ESS
   */
  private elecTrFaultItem(tr: number): EwdAbnormalItem {
    return {
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.elecTrFault[tr],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 1,
      sysPage: SdPages.ElecDc,
    };
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

  public ewdAbnormalSensed: EwdAbnormalDict = {
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
      // COND DUCT OVHT (A380 FCOM PRO-ABN-ECAM-10-21-10, a380_fcom.txt:132563-132674)
      // Design choice: the phase inhibition of COND HOT AIR FAULT (the FCOM inhibition column is a picture)
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
      // Indications: audio, master light, HOT AIR pb local light and COND SD page (a380_fcom.txt:132577-132581)
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
      // COND FWD CARGO TEMP REGUL FAULT (A380 FCOM PRO-ABN-ECAM-10-21-10, a380_fcom.txt:132245-132297)
      // Design choice: the phase inhibition of COND FWD CARGO ISOL FAULT (the FCOM inhibition column is a picture)
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: MappedSubject.create(
        () => fwdCargoTempRegulFaultActive(this.fws.trimAirMonitoringFlags()),
        this.fws.fwdCargoTrimAirValveFault,
      ),
      notActiveWhenItemActive: [],
      whichItemsToShow: () => fwdCargoTempRegulFaultItemsToShow(this.fws.trimAirMonitoringFlags()),
      whichItemsChecked: () => [false, false],
      // Indications: COND SD page only, no audio and no master light (a380_fcom.txt:132254-132258)
      failure: 1,
      sysPage: SdPages.Cond,
      // FWD CRG TEMP REGUL DEGRADED (a380_fcom.txt:132294-132297)
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
    281800053: {
      // FUEL JETTISON COMPLETED (A380 FCOM PRO-ABN-ECAM-10-28): the JTSN GW is reached, or the transfer tanks are empty
      flightPhaseInhib: [],
      simVarIsActive: this.fws.fuelJettisonCompleted,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [!this.fws.fuelJettisonActivePbOn.get(), !this.fws.fuelJettisonArmPbOn.get()],
      failure: 1,
      sysPage: SdPages.Fuel,
    },
    281800054: {
      // FUEL JETTISON FAULT (A380 FCOM PRO-ABN-ECAM-10-28 P 61-62): the valve faults on ground (at the end of a flight
      // with jettison), then the jettison selected but not available
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.fuelJettisonFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const onGround = this.fws.aircraftOnGround.get();
        const notAvail = this.fws.fuelJettisonNotAvail.get();
        return [
          onGround && this.fws.fuelJettisonLValveFault.get(),
          onGround && this.fws.fuelJettisonRValveFault.get(),
          notAvail,
          notAvail,
          notAvail,
        ];
      },
      whichItemsChecked: () => [
        false,
        false,
        false,
        !this.fws.fuelJettisonActivePbOn.get(),
        !this.fws.fuelJettisonArmPbOn.get(),
      ],
      failure: 2,
      sysPage: SdPages.Fuel,
    },
    281800055: {
      // FUEL JETTISON VLV NOT CLOSED (A380 FCOM PRO-ABN-ECAM-10-28 P 63): a jettison valve abnormally open
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.fuelJettisonValveNotClosed,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true, true],
      whichItemsChecked: () => [!this.fws.fuelJettisonActivePbOn.get(), !this.fws.fuelJettisonArmPbOn.get()],
      failure: 2,
      sysPage: SdPages.Fuel,
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
      // EXCESS DIFF PRESS
      flightPhaseInhib: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
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
    // Conditions: FwsElecAlerts. Source: A380 FCOM PRO-ABN-ECAM-10-24 (16 AUG 11), "FCOM l." = line of the text copy
    // references/manuals/a380_fcom.txt; the flight phase inhibitions and the master light/audio come from the figures
    // of airbus-a380-fcom_compress.pdf ("PDF p."). Procedure lines of the texts (ata24.ts) that the FCOM procedure does
    // not contain are hidden (the texts were written from another FCOM standard: GENs resets, COMMERCIAL, CROSSFEED,
    // "IR x MODE SEL" after landing instead of the FCOM "BEFORE LAST ENG STOP : ELEC EXT PWR ON").
    240800002: {
      // AC BUS 1 FAULT, FCOM l.137656, PDF p.4832
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecAcBusFault[0],
      notActiveWhenItemActive: [],
      // On ground: FOR ENG STOP : KEEP ENG 4 LAST (FCOM l.137672)
      whichItemsToShow: () => [this.fws.aircraftOnGround.get()],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    240800004: {
      // AC BUS 2 FAULT, FCOM l.137875, PDF p.4838
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecAcBusFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get(); // FCOM l.137909
        // LDG DIST IMPACT ON WET/CONTAM RWY ONLY (FCOM l.137904), always
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
      // AC BUS 3 FAULT, FCOM l.138682, PDF p.4855
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecAcBusFault[2],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        // On ground: BEFORE OPENING ANY CABIN DOOR: RESIDUAL DIFF PRESS CHECK, CABIN CREW ADVISE (FCOM l.138711)
        const onGround = this.fws.aircraftOnGround.get();
        return [false, false, false, false, false, false, false, false, false, onGround, onGround, onGround];
      },
      whichItemsChecked: () => Array(12).fill(false),
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    240800009: {
      // AC BUS 4 FAULT, FCOM l.139000, PDF p.4863
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecAcBusFault[3],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const onGround = this.fws.aircraftOnGround.get();
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get(); // FCOM l.139053
        // On ground: FOR ENG STOP : KEEP ENG 1 LAST (l.139030); in flight: VENT AVNCS EXTRACT (l.139039)
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
      // AC ESS BUS ALTN, FCOM l.139130, PDF p.4866: crew awareness
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
      // AC ESS BUS FAULT, FCOM l.139158, PDF p.4867
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecAcEssBusFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        // IF NOT SUCCESSFUL (l.139193): the alert is still there with the AC ESS FEED pb-sw in ALTN
        const notSuccessful = this.fws.elecAcEssFeedAltn.get();
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get(); // FCOM l.139203
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
      // STATUS (FCOM l.139256-139289), see ELEC_AC_ESS_BUS_FAULT_STATUS. The REDUND LOSS items are FwsInopSys
      // entries active with this alert: the redundLoss field of this table never reaches the STATUS page.
      limitationsApprLdg: () => ELEC_AC_ESS_BUS_FAULT_STATUS.limitationsApprLdg,
      inopSysAllPhases: () => ELEC_AC_ESS_BUS_FAULT_STATUS.inopSysAllPhases,
      inopSysApprLdg: () => ELEC_AC_ESS_BUS_FAULT_STATUS.inopSysApprLdg,
      failure: 2,
      sysPage: SdPages.ElecAc,
    },
    240800014: this.elecApuGenFaultItem(0),
    240800015: this.elecApuGenFaultItem(1),
    240800016: {
      // APU TR FAULT, FCOM l.139442, PDF p.4874
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.elecApuTrFault,
      notActiveWhenItemActive: [],
      // "If the APU is off, and the APU battery is on: WHEN APU NOT RQRD : APU BAT OFF" (FCOM l.139454). Design
      // choice: shown with the APU off; the APU BAT line then shows ticked if the battery is already off.
      whichItemsToShow: () => {
        const apuOff = this.fws.apuMasterSwitch.get() === 0;
        return [apuOff, apuOff];
      },
      whichItemsChecked: () => [false, !this.fws.elecApuBatAuto.get()],
      failure: 1,
      sysPage: SdPages.ElecDc,
    },
    240800019: {
      // BUS TIE OFF, FCOM l.139586, PDF p.4879: crew awareness
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.elecBusTieOff,
      // Not when ELEC EMER CONFIG asks for BUS TIE OFF (FCOM l.141663)
      notActiveWhenItemActive: ['240800055'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    240800026: {
      // DC BUS 1 FAULT, FCOM l.139733, PDF p.4884
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecDcBusFault[0],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get(); // FCOM l.139781
        return [
          this.fws.taxiInFlapsLever0For1Min.get(), // FCOM l.139761
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
      // DC BUS 2 FAULT, FCOM l.140567, PDF p.4903
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecDcBusFault[1],
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get(); // FCOM l.140620
        return [
          this.fws.taxiInFlapsLever0For1Min.get(), // FCOM l.140595
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
      // DC ESS BUS FAULT, FCOM l.140758, PDF p.4908
      flightPhaseInhib: [4, 5, 10],
      simVarIsActive: this.fws.elecDcEssBusFault,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get(); // FCOM l.140819
        // FOR TAXI : FLAPS SELECT CONF 1+F has no condition in this procedure (FCOM l.140788)
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
      // EMER CONFIG, FCOM l.141552, PDF p.4929: master warning, CRC
      flightPhaseInhib: [1, 5, 10, 12],
      // Not while ENG ALL ENG FLAME OUT is shown: "This alert inhibits the ELEC EMER CONFIG alert." (FCOM l.173795)
      simVarIsActive: this.fws.elecEmerConfigAlert,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => {
        const proc = this.fws.elecEmerConfigProcedure;
        // "If the flight crew did not activate the FIRE SMOKE/FUMES alert" (FCOM l.141654, l.141715)
        const noSmoke = !this.fws.smokeFumesActivated.get();
        // IF NOT SUCCESSFUL (l.141662): the alert is still there after the first GENs reset
        const firstResetDone = proc.firstGensReset.isCompleted;
        const lowFl = proc.triggeredAtOrBelowFl230; // l.141704 / l.141776
        const lowFeedTanks = this.fws.feedTanks1And4BelowEmerOutrXfrThreshold.get(); // l.141817
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
          // has no such restriction yet), so the DESCENT/MAX FL lines show and "APU CONSIDER" (l.141726) does not
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
          false, // FUEL CONSUMPT INCRSD: STATUS INFO in the FCOM (l.142032), not a procedure line
          false, // FMS PRED UNRELIABLE: idem
          false, // IF SEVERE ICE ACCRETION: LIMITATIONS / DEFERRED PROC in the FCOM (l.141866, l.141891)
          true, // LDG PERF AFFECTED (l.141809)
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
      inopSysAllPhases: () => ['220300007', '220300024'],
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
      // CROSSFEED 1+2+3+4 ON and ALL FEED TKs PMPs ON: the crew actions, sensed on the pb-sw (a jammed valve or a failed
      // pump does not prevent them)
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
      // IF NO FUEL LEAK: CROSSFEED 1 ON, CROSSFEED 2 ON (FCOM PRO-ABN-ECAM-10-28 l.149903-149906), sensed on the pb-sw
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
      // FEED TK 1 MAIN PMP FAULT (A380 FCOM PRO-ABN-ECAM-10-28, a380_fcom.txt l.150267-150315): FEED TK 1 MAIN PMP
      // OFF; STATUS INOP SYS FEED TK 1 MAIN PMP. The FCOM flight phase inhibition is a figure (design choice: the one
      // of JETTISON VLV NOT CLOSED)
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
      // FEED TK 2 MAIN PMP FAULT (A380 FCOM PRO-ABN-ECAM-10-28, a380_fcom.txt l.150267-150315): FEED TK 2 MAIN PMP
      // OFF; STATUS INOP SYS FEED TK 2 MAIN PMP. The FCOM flight phase inhibition is a figure (design choice: the one
      // of JETTISON VLV NOT CLOSED)
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
      // FEED TK 3 MAIN PMP FAULT (A380 FCOM PRO-ABN-ECAM-10-28, a380_fcom.txt l.150267-150315): FEED TK 3 MAIN PMP
      // OFF; STATUS INOP SYS FEED TK 3 MAIN PMP. The FCOM flight phase inhibition is a figure (design choice: the one
      // of JETTISON VLV NOT CLOSED)
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
      // FEED TK 4 MAIN PMP FAULT (A380 FCOM PRO-ABN-ECAM-10-28, a380_fcom.txt l.150267-150315): FEED TK 4 MAIN PMP
      // OFF; STATUS INOP SYS FEED TK 4 MAIN PMP. The FCOM flight phase inhibition is a figure (design choice: the one
      // of JETTISON VLV NOT CLOSED)
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
      // FEED TK 1 STBY PMP FAULT (FCOM l.150328-150372): crew awareness; MORE INFO REDUND LOSS FEED TK 1 STBY PMP
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
      // FEED TK 2 STBY PMP FAULT (FCOM l.150328-150372): crew awareness; MORE INFO REDUND LOSS FEED TK 2 STBY PMP
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
      // FEED TK 3 STBY PMP FAULT (FCOM l.150328-150372): crew awareness; MORE INFO REDUND LOSS FEED TK 3 STBY PMP
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
      // FEED TK 4 STBY PMP FAULT (FCOM l.150328-150372): crew awareness; MORE INFO REDUND LOSS FEED TK 4 STBY PMP
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
      // L OUTR TK PMP FAULT (A380 FCOM PRO-ABN-ECAM-10-28 l.151632-151680): L OUTR TK PMP OFF; STATUS INOP SYS
      // L OUTR TK PMP, INFO OUTR TKs XFR BY GRVTY ONLY if the outer tanks are not empty. The FCOM flight phase inhibition is a figure (design choice: the one of the feed tank pump alerts).
      // The FQMS shut-off of the symmetric pump and the gravity transfer are not simulated.
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
      // R OUTR TK PMP FAULT (A380 FCOM PRO-ABN-ECAM-10-28 l.151632-151680): R OUTR TK PMP OFF; STATUS INOP SYS
      // R OUTR TK PMP, INFO OUTR TKs XFR BY GRVTY ONLY if the outer tanks are not empty. The FCOM flight phase inhibition is a figure (design choice: the one of the feed tank pump alerts).
      // The FQMS shut-off of the symmetric pump and the gravity transfer are not simulated.
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
      // L INR TK FWD PMP FAULT (FCOM l.151494-151555): L INR TK FWD PMP OFF; STATUS INOP SYS L INR TK FWD PMP.
      // The alternate transfers (INFO FUEL ALTN XFR IN USE) are not simulated.
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
      // L INR TK AFT PMP FAULT (FCOM l.151415-151490): L INR TK AFT PMP OFF; STATUS INOP SYS L INR TK AFT PMP.
      // The aft gallery pumps never run in the simulation: only turned off by the flight crew. The manual transfers
      // (FUEL MAN XFR PROCEDURE) are not simulated.
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
      // L INR TK FWD+AFT PMPs FAULT (FCOM l.151340-151410): L INR TK FWD and AFT PMP OFF; LIMITATION
      // L INR TK NOT USABLE if the tank is not empty; STATUS INOP SYS L INR TK PMPs. The INFO MAN XFR AVAIL is not
      // shown: the manual transfers are not simulated.
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
      // R INR TK FWD PMP FAULT (FCOM l.151494-151555): R INR TK FWD PMP OFF; STATUS INOP SYS R INR TK FWD PMP.
      // The alternate transfers (INFO FUEL ALTN XFR IN USE) are not simulated.
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
      // R INR TK AFT PMP FAULT (FCOM l.151415-151490): R INR TK AFT PMP OFF; STATUS INOP SYS R INR TK AFT PMP.
      // The aft gallery pumps never run in the simulation: only turned off by the flight crew. The manual transfers
      // (FUEL MAN XFR PROCEDURE) are not simulated.
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
      // R INR TK FWD+AFT PMPs FAULT (FCOM l.151340-151410): R INR TK FWD and AFT PMP OFF; LIMITATION
      // R INR TK NOT USABLE if the tank is not empty; STATUS INOP SYS R INR TK PMPs. The INFO MAN XFR AVAIL is not
      // shown: the manual transfers are not simulated.
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
      // L MID TK FWD PMP FAULT (FCOM l.151494-151555): L MID TK FWD PMP OFF; STATUS INOP SYS L MID TK FWD PMP.
      // The alternate transfers (INFO FUEL ALTN XFR IN USE) are not simulated.
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
      // L MID TK AFT PMP FAULT (FCOM l.151415-151490): L MID TK AFT PMP OFF; STATUS INOP SYS L MID TK AFT PMP.
      // The aft gallery pumps never run in the simulation: only turned off by the flight crew. The manual transfers
      // (FUEL MAN XFR PROCEDURE) are not simulated.
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
      // L MID TK FWD+AFT PMPs FAULT (FCOM l.151559-151628): L MID TK FWD and AFT PMP OFF; LIMITATION
      // L MID TK NOT USABLE if the tank is not empty; STATUS INOP SYS L MID TK PMPs. The INFO MAN XFR AVAIL is not
      // shown: the manual transfers are not simulated.
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
      // R MID TK FWD PMP FAULT (FCOM l.151494-151555): R MID TK FWD PMP OFF; STATUS INOP SYS R MID TK FWD PMP.
      // The alternate transfers (INFO FUEL ALTN XFR IN USE) are not simulated.
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
      // R MID TK AFT PMP FAULT (FCOM l.151415-151490): R MID TK AFT PMP OFF; STATUS INOP SYS R MID TK AFT PMP.
      // The aft gallery pumps never run in the simulation: only turned off by the flight crew. The manual transfers
      // (FUEL MAN XFR PROCEDURE) are not simulated.
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
      // R MID TK FWD+AFT PMPs FAULT (FCOM l.151559-151628): R MID TK FWD and AFT PMP OFF; LIMITATION
      // R MID TK NOT USABLE if the tank is not empty; STATUS INOP SYS R MID TK PMPs. The INFO MAN XFR AVAIL is not
      // shown: the manual transfers are not simulated.
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
      // TRIM TK L PMP FAULT (FCOM l.153692-153740): TRIM TK L PMP OFF; MORE INFO REDUND LOSS TRIM TK L PMP
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
      // TRIM TK R PMP FAULT (FCOM l.153692-153740): TRIM TK R PMP OFF; MORE INFO REDUND LOSS TRIM TK R PMP
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
      // TRIM TK L+R PMPs FAULT (FCOM l.153742-153808): TRIM TK L and R PMP OFF, in flight PITCH ATT < 3° FOR GRVTY FWD
      // XFR, TRIM TK FEED OPEN, if the pumps are failed TRIM TK : 2300 KG MAX NOT USABLE; LIMITATIONS FOR TRIM TK FWD XFR:
      // PITCH ATT < 3°, FUEL PARTLY UNUSABLE if the pumps are failed; STATUS INOP SYS TRIM TK PMPs, INFO TRIM TK XFR BY
      // GRVTY ONLY, TRIM TK GRVTY XFR : AROUND 3000 KG / HR. The gravity transfer from the trim tank is not simulated.
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
      // FEED TK 1 MAIN + STBY PMPs FAULT (FCOM l.149935-150260): after takeoff, CROSSFEED 1 and 2 ON, then both pumps
      // OFF (before takeoff: both pumps OFF); STATUS INOP SYS FEED TK 1 PMPs, INFO FEED TK 1 BY GRVTY ONLY. The
      // gravity feed ceiling (MAX FL 280 or 50/MEA once the inner and mid tanks are empty) is not simulated.
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
      // FEED TK 2 MAIN + STBY PMPs FAULT (FCOM l.149935-150260): after takeoff, CROSSFEED 1 and 2 ON, then both pumps
      // OFF (before takeoff: both pumps OFF); STATUS INOP SYS FEED TK 2 PMPs, INFO FEED TK 2 BY GRVTY ONLY. The
      // gravity feed ceiling (MAX FL 280 or 50/MEA once the inner and mid tanks are empty) is not simulated.
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
      // FEED TK 3 MAIN + STBY PMPs FAULT (FCOM l.149935-150260): after takeoff, CROSSFEED 3 and 4 ON, then both pumps
      // OFF (before takeoff: both pumps OFF); STATUS INOP SYS FEED TK 3 PMPs, INFO FEED TK 3 BY GRVTY ONLY. The
      // gravity feed ceiling (MAX FL 280 or 50/MEA once the inner and mid tanks are empty) is not simulated.
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
      // FEED TK 4 MAIN + STBY PMPs FAULT (FCOM l.149935-150260): after takeoff, CROSSFEED 3 and 4 ON, then both pumps
      // OFF (before takeoff: both pumps OFF); STATUS INOP SYS FEED TK 4 PMPs, INFO FEED TK 4 BY GRVTY ONLY. The
      // gravity feed ceiling (MAX FL 280 or 50/MEA once the inner and mid tanks are empty) is not simulated.
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
      // CROSSFEED VLV 1 FAULT (FCOM l.149618-149680): crew awareness; if the valve is abnormally closed and ENG 1 is
      // not running: FEED TK 1 NOT USABLE; STATUS INOP SYS CROSSFEED VLV 1
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
      // CROSSFEED VLV 2 FAULT (FCOM l.149618-149680): crew awareness; if the valve is abnormally closed and ENG 2 is
      // not running: FEED TK 2 NOT USABLE; STATUS INOP SYS CROSSFEED VLV 2
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
      // CROSSFEED VLV 3 FAULT (FCOM l.149618-149680): crew awareness; if the valve is abnormally closed and ENG 3 is
      // not running: FEED TK 3 NOT USABLE; STATUS INOP SYS CROSSFEED VLV 3
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
      // CROSSFEED VLV 4 FAULT (FCOM l.149618-149680): crew awareness; if the valve is abnormally closed and ENG 4 is
      // not running: FEED TK 4 NOT USABLE; STATUS INOP SYS CROSSFEED VLV 4
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
    290800032: {
      // Y SYS OVHT
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.yellowRsvOverheat,
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
    290800035: {
      // G SYS LO PRESS
      flightPhaseInhib: [4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.greenAbnormLoPressure,
      whichItemsToShow: () => [
        this.fws.flightPhase1112MoreThanOneMin.get(),
        true,
        true,
        true,
        !this.fws.prim3Healthy,
        !this.fws.prim3Healthy,
        true,
        true,
      ],
      whichItemsChecked: () => [false, false, false, false, false, false, false, false],
      failure: 2,
      limitationsPfd: () => ['320400001'],
      limitationsAllPhases: () => [!this.fws.prim3Healthy.get() ? '800400001' : null],
      limitationsApprLdg: () => ['320400001', '290400001', '290400002', '320400002', '320400003'],
      info: () => ['220200011', '270200001'],
      inopSysAllPhases: () => ['290100001', '320300023', '290300021'],
      inopSysApprLdg: () => ['290100003', '290100006', '320300020'],
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
        !this.fws.prim2Healthy,
        !this.fws.prim2Healthy,
        true,
      ],
      whichItemsChecked: () => [false, false, false, false, false],
      failure: 2,
      limitationsAllPhases: () => [!this.fws.prim2Healthy.get() ? '800400001' : null],
      info: () => ['800200004', '800200004'],
      inopSysAllPhases: () => ['290100001', '320300023', '290300022'],
      inopSysApprLdg: () => ['290100004', '320300024'],
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
      inopSysAllPhases: () => [
        '290100007',
        '290100008',
        '290100009',
        '290100010',
        '290100011',
        '320300013',
        '290300021',
        '290300022',
      ],
      inopSysApprLdg: () => ['290100012', '290100006', '320300008', '320300014', '320300020'],
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
    311800013: {
      // CDS CAPT PFD DU FAULT (A380 FCOM PRO-ABN-ECAM-10-31, a380_fcom.txt:157885-157978; SC, MASTER CAUT and the
      // flight phase inhibition from the PDF p. 5386). The INOP SYS of its STATUS are in FwsInopSys (310300005-011).
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.displayUnitFault[DisplayUnitID.CaptPfd],
      notActiveWhenItemActive: [],
      whichItemsToShow: showAllItems(311800013),
      whichItemsChecked: () => EcamAbnormalProcedures[311800013].items.map(() => false),
      failure: 2,
      sysPage: SdPages.None,
    },
    311800014: {
      // CDS CAPT ND DU FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.displayUnitFault[DisplayUnitID.CaptNd],
      notActiveWhenItemActive: [],
      whichItemsToShow: showAllItems(311800014),
      whichItemsChecked: () => EcamAbnormalProcedures[311800014].items.map(() => false),
      failure: 2,
      sysPage: SdPages.None,
    },
    311800015: {
      // CDS CAPT MFD DU FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.displayUnitFault[DisplayUnitID.CaptMfd],
      notActiveWhenItemActive: [],
      whichItemsToShow: showAllItems(311800015),
      whichItemsChecked: () => EcamAbnormalProcedures[311800015].items.map(() => false),
      failure: 2,
      sysPage: SdPages.None,
    },
    311800016: {
      // CDS EWD DU FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.displayUnitFault[DisplayUnitID.Ewd],
      notActiveWhenItemActive: [],
      whichItemsToShow: showAllItems(311800016),
      whichItemsChecked: () => EcamAbnormalProcedures[311800016].items.map(() => false),
      failure: 2,
      sysPage: SdPages.None,
    },
    311800017: {
      // CDS SD DU FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.displayUnitFault[DisplayUnitID.Sd],
      notActiveWhenItemActive: [],
      whichItemsToShow: showAllItems(311800017),
      whichItemsChecked: () => EcamAbnormalProcedures[311800017].items.map(() => false),
      failure: 2,
      sysPage: SdPages.None,
    },
    311800018: {
      // CDS F/O PFD DU FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.displayUnitFault[DisplayUnitID.FoPfd],
      notActiveWhenItemActive: [],
      whichItemsToShow: showAllItems(311800018),
      whichItemsChecked: () => EcamAbnormalProcedures[311800018].items.map(() => false),
      failure: 2,
      sysPage: SdPages.None,
    },
    311800019: {
      // CDS F/O ND DU FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.displayUnitFault[DisplayUnitID.FoNd],
      notActiveWhenItemActive: [],
      whichItemsToShow: showAllItems(311800019),
      whichItemsChecked: () => EcamAbnormalProcedures[311800019].items.map(() => false),
      failure: 2,
      sysPage: SdPages.None,
    },
    311800020: {
      // CDS F/O MFD DU FAULT
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10],
      simVarIsActive: this.fws.displayUnitFault[DisplayUnitID.FoMfd],
      notActiveWhenItemActive: [],
      whichItemsToShow: showAllItems(311800020),
      whichItemsChecked: () => EcamAbnormalProcedures[311800020].items.map(() => false),
      failure: 2,
      sysPage: SdPages.None,
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
      simVarIsActive: this.fws.btvLost,
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
    // GPS 1(2) FAULT, GPS 1+2 FAULT: the A380 FCOM gives no procedure (crew awareness); the flight phase inhibition is
    // the one of the ADR faults (design choice). STATUS (FCOM PRO-ABN-ECAM-10-34-10): INOP SYS GPS 1(2), GPS 1+2 and,
    // for APPR & LDG, BTV and ROW/ROP
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
      // TCAS 1 FAULT (A380 FCOM a380_fcom.txt:166882-166927). Not with XPDR 1 FAULT: a failed XPDR 1 makes TCAS 1
      // inoperative, and SURV XPDR 1 FAULT lists TCAS 1 in its STATUS (a380_fcom.txt:167319-167320).
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
      // TCAS 2 FAULT (A380 FCOM a380_fcom.txt:166882-166927). Not with XPDR 2 FAULT (see TCAS 1 FAULT).
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
      // TCAS 1+2 FAULT (A380 FCOM a380_fcom.txt:166935-166958): crew awareness, STATUS TCAS 1+2 (FwsInopSys
      // 340300029). Not with XPDR 1+2 FAULT, which lists TCAS 1+2 in its STATUS (a380_fcom.txt:167361-167362).
      flightPhaseInhib: [3, 4, 5, 6, 7, 9, 10, 11],
      simVarIsActive: this.fws.tcas1And2Fault,
      notActiveWhenItemActive: ['341800063'],
      whichItemsToShow: () => [],
      whichItemsChecked: () => [],
      failure: 2,
      sysPage: SdPages.None,
    },
    341800061: {
      // XPDR 1 FAULT (A380 FCOM a380_fcom.txt:167281-167322): the XPDR function of SURV SYS 1 is failed. Caution
      // (single chime, MASTER CAUT); flight phase inhibition as the TCAS FAULT alerts.
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
      // XPDR 2 FAULT (A380 FCOM a380_fcom.txt:167281-167322): the XPDR function of SURV SYS 2 is failed
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
      // XPDR 1+2 FAULT (A380 FCOM a380_fcom.txt:167324-167362): crew awareness, STATUS XPDR 1+2, TCAS 1+2
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
    520800017: {
      // MAIN 1L NOT CLOSED
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.main1LOpen,
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
    },
    520800018: {
      // MAIN 1R NOT CLOSED
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.main1ROpen,
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
    },
    520800019: {
      // MAIN 2L NOT CLOSED
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.main2LOpen,
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
    },
    520800020: {
      // MAIN 2R NOT CLOSED
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.main2ROpen,
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
    },
    520800021: {
      // MAIN 3L NOT CLOSED
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.main3LOpen,
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
    },
    520800022: {
      // MAIN 3R NOT CLOSED
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.main3ROpen,
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
    },
    520800023: {
      // MAIN 4L NOT CLOSED
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.main4LOpen,
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
    },
    520800024: {
      // MAIN 4R NOT CLOSED
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.main4ROpen,
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
    },
    520800025: {
      // MAIN 5L NOT CLOSED
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.main5LOpen,
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
    },
    520800026: {
      // MAIN 5R NOT CLOSED
      flightPhaseInhib: [1, 4, 5, 6, 7, 9, 10, 12],
      simVarIsActive: this.fws.main5ROpen,
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
    },
    // ATA 70 - ENGINES
    701800029: {
      // ENG 1 FAIL
      simVarIsActive: this.fws.eng1Fail,
      flightPhaseInhib: this.fws.phase56Inhibition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.aircraftOnGround.get() &&
          this.fws.gearLeverPos.get() &&
          [FwcFlightPhase.LiftOff, FwcFlightPhase.AtOrAbove400Feet].includes(this.fws.flightPhase.get()),
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
      flightPhaseInhib: this.fws.phase56Inhibition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.aircraftOnGround.get() &&
          this.fws.gearLeverPos.get() &&
          [FwcFlightPhase.LiftOff, FwcFlightPhase.AtOrAbove400Feet].includes(this.fws.flightPhase.get()),
        !this.fws.aircraftOnGround.get(),
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
      flightPhaseInhib: this.fws.phase56Inhibition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.aircraftOnGround.get() &&
          this.fws.gearLeverPos.get() &&
          [FwcFlightPhase.LiftOff, FwcFlightPhase.AtOrAbove400Feet].includes(this.fws.flightPhase.get()),
        !this.fws.aircraftOnGround.get(),
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
      flightPhaseInhib: this.fws.phase56Inhibition,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [
        !this.fws.aircraftOnGround.get() &&
          this.fws.gearLeverPos.get() &&
          [FwcFlightPhase.LiftOff, FwcFlightPhase.AtOrAbove400Feet].includes(this.fws.flightPhase.get()),
        !this.fws.aircraftOnGround.get(),
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
    701800159: {
      // ENG TWO ENGS OUT ON SAME SIDE (A380 FCOM l.175216-175470). Phases 5 and 6 inhibited (PDF p.5862).
      flightPhaseInhib: this.fws.phase56Inhibition,
      simVarIsActive: this.fws.twoEnginesOutSameSide,
      notActiveWhenItemActive: [],
      // l.175265-175271: PACK 1(2) OFF depending on the failed engines (EngineFailAlerts.sameSideLines), LDG PERF
      // AFFECTED, if ENG 1+2 failed: FOR TAXI : STEER ENDURANCE LIMITED
      whichItemsToShow: () => [
        this.fws.twoEnginesOutLeftSide.get(),
        this.fws.twoEnginesOutRightSide.get(),
        true,
        this.fws.twoEnginesOutLeftSide.get(),
      ],
      whichItemsChecked: () => [!this.fws.pack1On.get(), !this.fws.pack2On.get(), false, false],
      failure: 2,
      sysPage: SdPages.Eng,
      // STATUS l.175434-175454. ALL PHASES: PART L/G RETRACTION, PACK 1(2) here (l.175441, 175448); PART SPLRs, GEN 1+2
      // (3+4), G(Y) HYD SYS, ENG BLEED come from FwsInopSys (the HYD SYS lost with its two engines: FwsCore).
      // APPR & LDG: the lines below, REVERSER and BTV from FwsInopSys
      inopSysAllPhases: () => ['320300023', this.fws.twoEnginesOutLeftSide.get() ? '210300009' : '210300010'],
      inopSysApprLdg: () =>
        this.fws.twoEnginesOutLeftSide.get()
          ? ['290100003', '290100006', '320300020', '220300027', '220300010']
          : ['290100004', '320300014', '220300027', '220300010'],
      info: () => (this.fws.twoEnginesOutRightSide.get() ? ['800200003'] : []),
      // LIMITATIONS l.175317-175327: FOR LDG : FLAP LVR 3, FLAPS SLOW, LDG PERF AFFECTED; if ENG 1+2 failed: SLATS SLOW,
      // L/G GRVTY EXTN ONLY, STEER ENDUR LIMITED. LAND ANSA comes from the recommendation of the procedure.
      limitationsApprLdg: () =>
        this.fws.twoEnginesOutLeftSide.get()
          ? ['270400001', '290400001', '290400002', '320400002', '800400003', '320400003']
          : ['270400001', '290400002', '800400003'],
    },
    701800160: {
      // ENG TWO ENGS OUT ON OPPOSITE SIDE (A380 FCOM l.175471-175633). Phases 5 and 6 inhibited (PDF p.5868).
      // The "Depending on the failed engines: PACK 1(2) OFF" line (l.175518-175519) is not shown: the FCOM does not say
      // which pack goes with which pair of engines on opposite sides.
      flightPhaseInhib: this.fws.phase56Inhibition,
      simVarIsActive: this.fws.twoEnginesOutOppositeSide,
      notActiveWhenItemActive: [],
      whichItemsToShow: () => [true],
      whichItemsChecked: () => [false],
      failure: 2,
      sysPage: SdPages.Eng,
      // STATUS l.175614-175632: BTV (FwsInopSys), CAT 3; INFO CAT 2 ONLY
      inopSysApprLdg: () => ['220300029'],
      info: () => ['220200017'],
      // LIMITATIONS l.175549-175551: FOR LDG : FLAP LVR 3, LDG PERF AFFECTED
      limitationsApprLdg: () => ['270400001', '800400003'],
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
  };
}
