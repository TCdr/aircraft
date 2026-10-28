// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { Arinc429Word, FailuresConsumer, NXLogicConfirmNode } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '@failures';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { isXpdrSwitchLineShown, selectedXpdrSystem, XpdrSystem } from '@shared/TransponderSystem';
import {
  EfisSideAttitudeHeading,
  efisSideAdiru,
  isCheckAttitudeShown,
  isCheckHeadingShown,
  readEfisSideAttitudeHeading,
  readNormalOperationValue,
} from '../../../../instruments/src/MsfsAvionicsCommon/EfisSideDiscrepancy';
import { ADR_DISAGREE_CAS_THRESHOLD_KT } from './AdirsAlerts';
import { StatusLines } from './CondStatus';
import { FwcAlertItem, awarenessItem, cautionItem, readBool } from './FwcAlertItem';
import { ProbeHeatComputerFlags } from './ProbeWindowHeatAlerts';

/*
 * The A320 NAV alerts of the air data and attitude sensors, the ILS receivers and the ADS-B function:
 * - NAV ILS 1(2)(1+2) FAULT: an ILS receiver failed (L:A32NX_ILS_n_FAILED, flyPad ILS receiver failures).
 * - NAV CAPT(F/O)(STBY) AOA FAULT: the ADR 1(2)(3) has lost the angle of attack of its sensor while its other air data
 *   are valid (flyPad AOA sensor failures, systems navigation/adirs.rs).
 * - NAV ATT / HDG DISCREPANCY: the attitude / heading on the CAPT and F/O sides differ by 5 degrees or more, the same
 *   comparison as the CHECK ATT / CHECK HDG messages of the PFDs (the IR selected by the ATT HDG switching on each side).
 * - NAV IAS DISCREPANCY: the airspeeds on the CAPT and F/O PFDs differ (the ADR selected by the AIR DATA switching).
 * - NAV L(R) CAPT(F/O) STATIC FAULT: a static pressure probe is lost (flyPad failures, TS only). Design choice: the
 *   ADR keeps its static pressure from the other probe of its pair, so the air data do not change.
 * - NAV ADS-B RPTG 1(2) FAULT: the ADS-B out function of a transponder failed (flyPad failures, TS only). The NAV
 *   ATC/XPDR 1(2) FAULT of a failed transponder already lists its ADS-B RPTG as INOP SYS, so it replaces this alert.
 * - NAV BKUP SPD/ALT ON CAPT(F/O) PFD: the BKUP SPD/ALT pb of one side is on while the AP or FD of that side is engaged
 *   (the AP1/FD1 of the CAPT side, the AP2/FD2 of the F/O side). NAV BKUP SPD/ALT ON CAPT+F/O PFD: both pb are on.
 *   The BKUP SPD/ALT memo shows while either pb is on.
 */

/** The alert keys, the first digits of the EwdMessages codes */
export const NAV_SENSOR_ALERT_KEYS = {
  ils1Fault: '3400600',
  ils2Fault: '3400601',
  ils12Fault: '3400602',
  captAoaFault: '3400610',
  foAoaFault: '3400611',
  stbyAoaFault: '3400612',
  attDiscrepancy: '3400620',
  hdgDiscrepancy: '3400625',
  iasDiscrepancy: '3400630',
  leftCaptStaticFault: '3400640',
  rightCaptStaticFault: '3400641',
  leftFoStaticFault: '3400642',
  rightFoStaticFault: '3400643',
  adsbReporting1Fault: '3400650',
  adsbReporting2Fault: '3400651',
  captBackupScale: '3400660',
  foBackupScale: '3400661',
  captFoBackupScale: '3400662',
} as const;

/** The BKUP SPD/ALT memo (green), the codes of the PseudoFWC memo '0000690' */
export const BACKUP_SCALE_MEMO_CODES = ['000069001'];

/** The FWC flight phases (1 to 10) in which each alert is inhibited */
const NAV_SENSOR_PHASE_INHIBITION = {
  ilsFault: [3, 4, 5],
  aoaFault: [2, 3, 4, 5, 6, 7, 8, 9],
  attDiscrepancy: [3, 4, 8],
  hdgDiscrepancy: [4, 8],
  iasDiscrepancy: [4, 5, 7, 8],
  staticFault: [3, 4, 5, 6, 7, 8, 9, 10],
  adsbReportingFault: [3, 4, 5, 7, 8],
  /** Design choice: the FCOM gives no phases for the BKUP SPD/ALT alerts; those of NAV IAS DISCREPANCY, the nearest */
  backupScale: [4, 5, 7, 8],
};

/** Design choice: no published value; the CAS threshold of NAV ADR DISAGREE */
const IAS_DISCREPANCY_THRESHOLD_KT = ADR_DISAGREE_CAS_THRESHOLD_KT;

/** Design choice: the confirmation time of NAV ALTI DISCREPANCY, against short differences while a source switches */
const DISCREPANCY_CONFIRMATION_SECONDS = 5;

const STATUS = {
  ils: { 1: '340300036', 2: '340300037', both: '340300038' },
  cat2: '340300009',
  gpws: '240300152',
  aoa: ['300300022', '300300023', '300300024'],
  cat3SingleOnly: '220200001',
  cat3Dual: '220300001',
  staticProbes: ['300300016', '300300017', '300300018', '300300019'],
  captProbes: '300300013',
  foProbes: '300300014',
  adsbReporting: ['340300007', '340300008'],
};

/** The static probes of the alerts, in the order CAPT L, CAPT R, F/O L, F/O R */
const STATIC_PROBE_FAILURES = [
  A320Failure.CaptLeftStaticProbe,
  A320Failure.CaptRightStaticProbe,
  A320Failure.FoLeftStaticProbe,
  A320Failure.FoRightStaticProbe,
];

const ADSB_REPORTING_FAILURES = [A320Failure.AdsbReporting1, A320Failure.AdsbReporting2];

/** The data of the alerts */
export interface NavSensorAlertInputs {
  /** ILS 1, 2 receiver failed */
  ilsFailed: boolean[];
  onGround: boolean;
  /** ADR 1, 2, 3: the angle of attack is lost while the ADR works (see isAngleOfAttackLost) */
  angleOfAttackLost: boolean[];
  /** The attitude and heading displayed on the CAPT side and on the F/O side */
  captAttitudeHeading: EfisSideAttitudeHeading;
  foAttitudeHeading: EfisSideAttitudeHeading;
  /** The airspeed displayed on the CAPT and on the F/O PFD in knots, null when not valid (SPD flag) */
  captAirspeedKt: number | null;
  foAirspeedKt: number | null;
  /** CAPT L, CAPT R, F/O L, F/O R static probe failed */
  staticProbeFailed: boolean[];
  /** The CAPT and F/O probe heat computers */
  probeHeatComputers: ProbeHeatComputerFlags[];
  /** The BKUP SPD/ALT pb of the CAPT and F/O PFD is on */
  backupScalePbOn: boolean[];
  /** An AP or FD of the CAPT side (AP1, FD1) and of the F/O side (AP2, FD2) is engaged */
  apOrFdEngaged: boolean[];
  /** ADS-B function of the transponder 1, 2 failed */
  adsbFailed: boolean[];
  /** Transponder 1, 2 failed or unpowered (L:A32NX_XPDR_n_FAILED) */
  xpdrFailed: boolean[];
  selectedXpdr: XpdrSystem;
}

/**
 * NAV ILS FAULT STATUS: INOP SYS the failed receivers, CAT 2 with a single receiver failed, GPWS with ILS 1 failed on
 * the ground or both failed.
 * @param failed the failed receivers
 * @param onGround the aircraft is on the ground
 */
function ilsFaultStatus(failed: 1 | 2 | 'both', onGround: boolean): StatusLines {
  const inopSys = [STATUS.ils[failed]];
  if (failed !== 'both') {
    inopSys.push(STATUS.cat2);
  }
  if (failed === 'both' || (failed === 1 && onGround)) {
    inopSys.push(STATUS.gpws);
  }
  return { left: [], inopSys };
}

/**
 * Whether an ADR has lost its angle of attack while it works: its angle of attack is failed and its altitude is not,
 * so a lost ADR (NAV ADR FAULT) does not give this alert.
 * @param angleOfAttack the angle of attack word of the ADR
 * @param altitude the altitude word of the ADR
 */
export function isAngleOfAttackLost(angleOfAttack: Arinc429Word, altitude: Arinc429Word): boolean {
  return angleOfAttack.isFailureWarning() && !altitude.isFailureWarning();
}

/** NAV CAPT(F/O)(STBY) AOA FAULT STATUS: INOP SYS CAPT (F/O)(STBY) AOA */
function aoaFaultStatus(adr: number): StatusLines {
  return { left: [], inopSys: [STATUS.aoa[adr]] };
}

/**
 * NAV IAS DISCREPANCY, before its confirmation: the airspeeds of both PFDs differ by more than the threshold. A
 * side without a valid airspeed is not compared.
 */
export function isAirspeedDiscrepancy(captAirspeedKt: number | null, foAirspeedKt: number | null): boolean {
  return (
    captAirspeedKt !== null &&
    foAirspeedKt !== null &&
    Math.abs(captAirspeedKt - foAirspeedKt) > IAS_DISCREPANCY_THRESHOLD_KT
  );
}

/** NAV IAS DISCREPANCY STATUS: CAT 3 SINGLE ONLY, INOP SYS CAT 3 DUAL */
function iasDiscrepancyStatus(): StatusLines {
  return { left: [STATUS.cat3SingleOnly], inopSys: [STATUS.cat3Dual] };
}

/**
 * Whether NAV L(R) CAPT(F/O) STATIC FAULT lists the CAPT (F/O) PROBES as INOP SYS: the AOA of that side is failed and
 * the heating of its pitot and TAT probes is lost, or all the heating of its probes is lost.
 * @param aoaLost the angle of attack of that side is lost
 * @param heat the probe heat computer of that side
 */
export function areProbesInopWithStaticFault(aoaLost: boolean, heat: ProbeHeatComputerFlags): boolean {
  const allHeatingLost =
    heat.computerFault || (heat.pitot && heat.leftStatic && heat.rightStatic && heat.aoa && heat.tat);
  const pitotAndTatHeatingLost = heat.computerFault || (heat.pitot && heat.tat);
  return (aoaLost && pitotAndTatHeatingLost) || allHeatingLost;
}

/**
 * NAV L(R) CAPT(F/O) STATIC FAULT STATUS: INOP SYS the lost static probe, and the CAPT (F/O) PROBES
 * (see areProbesInopWithStaticFault).
 * @param probe 0 CAPT L, 1 CAPT R, 2 F/O L, 3 F/O R
 * @param probesInop the probes of that side are INOP
 */
function staticFaultStatus(probe: number, probesInop: boolean): StatusLines {
  const inopSys = [STATUS.staticProbes[probe]];
  if (probesInop) {
    inopSys.push(probe < 2 ? STATUS.captProbes : STATUS.foProbes);
  }
  return { left: [], inopSys };
}

/**
 * The NAV BKUP SPD/ALT alerts: on one side only when the AP or FD of that side is engaged, on both sides always.
 * @param pbOn the BKUP SPD/ALT pb of the CAPT and F/O PFD is on
 * @param apOrFdEngaged an AP or FD of the CAPT and of the F/O side is engaged
 */
export function backupScaleAlerts(
  pbOn: boolean[],
  apOrFdEngaged: boolean[],
): { capt: boolean; fo: boolean; both: boolean } {
  const both = pbOn[0] && pbOn[1];
  return {
    capt: pbOn[0] && !pbOn[1] && apOrFdEngaged[0],
    fo: pbOn[1] && !pbOn[0] && apOrFdEngaged[1],
    both,
  };
}

/** NAV ADS-B RPTG 1(2) FAULT: the ADS-B function failed, its transponder works */
function isAdsbReportingFault(adsbFailed: boolean, xpdrFailed: boolean): boolean {
  return adsbFailed && !xpdrFailed;
}

/** The part of the failures consumer these alerts use */
export type NavSensorFailuresSource = Pick<FailuresConsumer, 'register' | 'update' | 'isActive'>;

/** The NAV sensor alerts: reads their data, keeps their state and gives the items the PseudoFWC adds to its alerts */
export class NavSensorAlerts {
  private readonly ilsFault = { 1: Subject.create(false), 2: Subject.create(false), both: Subject.create(false) };

  private readonly aoaFault = [Subject.create(false), Subject.create(false), Subject.create(false)];

  private readonly attDiscrepancyConfirmation = new NXLogicConfirmNode(DISCREPANCY_CONFIRMATION_SECONDS, true);

  private readonly hdgDiscrepancyConfirmation = new NXLogicConfirmNode(DISCREPANCY_CONFIRMATION_SECONDS, true);

  private readonly iasDiscrepancyConfirmation = new NXLogicConfirmNode(DISCREPANCY_CONFIRMATION_SECONDS, true);

  private readonly attDiscrepancy = Subject.create(false);

  private readonly hdgDiscrepancy = Subject.create(false);

  private readonly iasDiscrepancy = Subject.create(false);

  private readonly staticFault = STATIC_PROBE_FAILURES.map(() => Subject.create(false));

  private readonly adsbReportingFault = [Subject.create(false), Subject.create(false)];

  private readonly captBackupScale = Subject.create(false);

  private readonly foBackupScale = Subject.create(false);

  private readonly captFoBackupScale = Subject.create(false);

  /** BKUP SPD/ALT memo, for the PseudoFWC memos */
  public readonly backupScaleMemo = Subject.create(false);

  private onGround = false;

  private captProbesInop = false;

  private foProbesInop = false;

  private selectedXpdr: XpdrSystem = 1;

  private otherXpdrOperative = [true, true];

  /**
   * @param failuresConsumer the failures consumer (a test double in the specs)
   */
  constructor(private readonly failuresConsumer: NavSensorFailuresSource = new FailuresConsumer()) {}

  /** Registers the failures, called once by the PseudoFWC init */
  init(): void {
    for (const failure of [...STATIC_PROBE_FAILURES, ...ADSB_REPORTING_FAILURES]) {
      this.failuresConsumer.register(failure);
    }
  }

  /**
   * Reads the data from the sim and the failures, then updates the alerts.
   * @param deltaTime the frame time in milliseconds
   * @param onGround the aircraft is on the ground
   * @param probeHeatComputers the CAPT, F/O and STBY probe heat computers
   */
  readAndUpdate(deltaTime: number, onGround: boolean, probeHeatComputers: ProbeHeatComputerFlags[]): void {
    this.failuresConsumer.update();
    const airDataSwitching = SimVar.GetSimVarValue('L:A32NX_AIR_DATA_SWITCHING_KNOB', 'Enum');
    this.update(
      {
        ilsFailed: [1, 2].map((receiver) => readBool(`L:A32NX_ILS_${receiver}_FAILED`)),
        onGround,
        angleOfAttackLost: [1, 2, 3].map((adr) =>
          isAngleOfAttackLost(
            Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_ADR_${adr}_ANGLE_OF_ATTACK`),
            Arinc429Word.fromSimVarValue(`L:A32NX_ADIRS_ADR_${adr}_ALTITUDE`),
          ),
        ),
        captAttitudeHeading: readEfisSideAttitudeHeading('L'),
        foAttitudeHeading: readEfisSideAttitudeHeading('R'),
        captAirspeedKt: readNormalOperationValue(
          `L:A32NX_ADIRS_ADR_${efisSideAdiru('L', airDataSwitching)}_COMPUTED_AIRSPEED`,
        ),
        foAirspeedKt: readNormalOperationValue(
          `L:A32NX_ADIRS_ADR_${efisSideAdiru('R', airDataSwitching)}_COMPUTED_AIRSPEED`,
        ),
        staticProbeFailed: STATIC_PROBE_FAILURES.map((failure) => this.failuresConsumer.isActive(failure)),
        probeHeatComputers,
        backupScalePbOn: ['L', 'R'].map((side) => readBool(`L:A32NX_EFIS_${side}_BKUP_SPD_ALT_PB_IS_ON`)),
        apOrFdEngaged: [1, 2].map(
          (fmgc) => readBool(`L:A32NX_FMGC_${fmgc}_AP_ENGAGED`) || readBool(`L:A32NX_FMGC_${fmgc}_FD_ENGAGED`),
        ),
        adsbFailed: ADSB_REPORTING_FAILURES.map((failure) => this.failuresConsumer.isActive(failure)),
        xpdrFailed: [1, 2].map((xpdr) => readBool(`L:A32NX_XPDR_${xpdr}_FAILED`)),
        selectedXpdr: selectedXpdrSystem(SimVar.GetSimVarValue('L:A32NX_TRANSPONDER_SYSTEM', 'number')),
      },
      deltaTime,
    );
  }

  /**
   * Updates the alerts.
   * @param inputs the data of the alerts
   * @param deltaTime the frame time in milliseconds
   */
  update(inputs: NavSensorAlertInputs, deltaTime: number): void {
    const [ils1Failed, ils2Failed] = inputs.ilsFailed;
    this.ilsFault[1].set(ils1Failed && !ils2Failed);
    this.ilsFault[2].set(ils2Failed && !ils1Failed);
    this.ilsFault.both.set(ils1Failed && ils2Failed);
    this.onGround = inputs.onGround;

    this.aoaFault.forEach((alert, adr) => alert.set(inputs.angleOfAttackLost[adr]));

    this.attDiscrepancy.set(
      this.attDiscrepancyConfirmation.write(
        isCheckAttitudeShown(inputs.captAttitudeHeading, inputs.foAttitudeHeading),
        deltaTime,
      ),
    );
    this.hdgDiscrepancy.set(
      this.hdgDiscrepancyConfirmation.write(
        isCheckHeadingShown(inputs.captAttitudeHeading, inputs.foAttitudeHeading),
        deltaTime,
      ),
    );
    this.iasDiscrepancy.set(
      this.iasDiscrepancyConfirmation.write(
        isAirspeedDiscrepancy(inputs.captAirspeedKt, inputs.foAirspeedKt),
        deltaTime,
      ),
    );

    this.staticFault.forEach((alert, probe) => alert.set(inputs.staticProbeFailed[probe]));
    this.captProbesInop = areProbesInopWithStaticFault(inputs.angleOfAttackLost[0], inputs.probeHeatComputers[0]);
    this.foProbesInop = areProbesInopWithStaticFault(inputs.angleOfAttackLost[1], inputs.probeHeatComputers[1]);

    const backupScale = backupScaleAlerts(inputs.backupScalePbOn, inputs.apOrFdEngaged);
    this.captBackupScale.set(backupScale.capt);
    this.foBackupScale.set(backupScale.fo);
    this.captFoBackupScale.set(backupScale.both);
    this.backupScaleMemo.set(inputs.backupScalePbOn.some((on) => on));

    this.adsbReportingFault.forEach((alert, index) =>
      alert.set(isAdsbReportingFault(inputs.adsbFailed[index], inputs.xpdrFailed[index])),
    );
    this.selectedXpdr = inputs.selectedXpdr;
    this.otherXpdrOperative = [1, 0].map((other) => !inputs.xpdrFailed[other] && !inputs.adsbFailed[other]);
  }

  private ilsFaultItem(key: string, failed: 1 | 2 | 'both'): FwcAlertItem {
    return awarenessItem(
      key,
      1,
      this.ilsFault[failed],
      NAV_SENSOR_PHASE_INHIBITION.ilsFault,
      () => [0],
      () => ilsFaultStatus(failed, this.onGround),
    );
  }

  private aoaFaultItem(key: string, adr: number): FwcAlertItem {
    return awarenessItem(
      key,
      1,
      this.aoaFault[adr],
      NAV_SENSOR_PHASE_INHIBITION.aoaFault,
      () => [0],
      () => aoaFaultStatus(adr),
    );
  }

  private staticFaultItem(key: string, probe: number): FwcAlertItem {
    return cautionItem(
      key,
      2,
      this.staticFault[probe],
      NAV_SENSOR_PHASE_INHIBITION.staticFault,
      () => [0, 1],
      EcamSysPage.NONE,
      () => staticFaultStatus(probe, probe < 2 ? this.captProbesInop : this.foProbesInop),
    );
  }

  private adsbReportingFaultItem(key: string, xpdr: XpdrSystem): FwcAlertItem {
    return cautionItem(
      key,
      2,
      this.adsbReportingFault[xpdr - 1],
      NAV_SENSOR_PHASE_INHIBITION.adsbReportingFault,
      () => [0, isXpdrSwitchLineShown(xpdr, this.selectedXpdr, this.otherXpdrOperative[xpdr - 1]) ? 1 : null],
      EcamSysPage.NONE,
      () => ({ left: [], inopSys: [STATUS.adsbReporting[xpdr - 1]] }),
    );
  }

  /**
   * The alert items, by key, for the PseudoFWC ewdMessageFailures. The ILS and AOA faults are crew awareness (level
   * 1). Design choice: the others are cautions (level 2), as NAV ALTI DISCREPANCY and NAV ATC/XPDR 1(2) FAULT.
   */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [NAV_SENSOR_ALERT_KEYS.ils1Fault]: this.ilsFaultItem(NAV_SENSOR_ALERT_KEYS.ils1Fault, 1),
    [NAV_SENSOR_ALERT_KEYS.ils2Fault]: this.ilsFaultItem(NAV_SENSOR_ALERT_KEYS.ils2Fault, 2),
    [NAV_SENSOR_ALERT_KEYS.ils12Fault]: this.ilsFaultItem(NAV_SENSOR_ALERT_KEYS.ils12Fault, 'both'),
    [NAV_SENSOR_ALERT_KEYS.captAoaFault]: this.aoaFaultItem(NAV_SENSOR_ALERT_KEYS.captAoaFault, 0),
    [NAV_SENSOR_ALERT_KEYS.foAoaFault]: this.aoaFaultItem(NAV_SENSOR_ALERT_KEYS.foAoaFault, 1),
    [NAV_SENSOR_ALERT_KEYS.stbyAoaFault]: this.aoaFaultItem(NAV_SENSOR_ALERT_KEYS.stbyAoaFault, 2),
    [NAV_SENSOR_ALERT_KEYS.attDiscrepancy]: cautionItem(
      NAV_SENSOR_ALERT_KEYS.attDiscrepancy,
      3,
      this.attDiscrepancy,
      NAV_SENSOR_PHASE_INHIBITION.attDiscrepancy,
      () => [0, 1, 2],
      EcamSysPage.NONE,
    ),
    [NAV_SENSOR_ALERT_KEYS.hdgDiscrepancy]: cautionItem(
      NAV_SENSOR_ALERT_KEYS.hdgDiscrepancy,
      3,
      this.hdgDiscrepancy,
      NAV_SENSOR_PHASE_INHIBITION.hdgDiscrepancy,
      () => [0, 1, 2],
      EcamSysPage.NONE,
    ),
    [NAV_SENSOR_ALERT_KEYS.iasDiscrepancy]: cautionItem(
      NAV_SENSOR_ALERT_KEYS.iasDiscrepancy,
      3,
      this.iasDiscrepancy,
      NAV_SENSOR_PHASE_INHIBITION.iasDiscrepancy,
      () => [0, 1, 2],
      EcamSysPage.NONE,
      iasDiscrepancyStatus,
    ),
    [NAV_SENSOR_ALERT_KEYS.leftCaptStaticFault]: this.staticFaultItem(NAV_SENSOR_ALERT_KEYS.leftCaptStaticFault, 0),
    [NAV_SENSOR_ALERT_KEYS.rightCaptStaticFault]: this.staticFaultItem(NAV_SENSOR_ALERT_KEYS.rightCaptStaticFault, 1),
    [NAV_SENSOR_ALERT_KEYS.leftFoStaticFault]: this.staticFaultItem(NAV_SENSOR_ALERT_KEYS.leftFoStaticFault, 2),
    [NAV_SENSOR_ALERT_KEYS.rightFoStaticFault]: this.staticFaultItem(NAV_SENSOR_ALERT_KEYS.rightFoStaticFault, 3),
    [NAV_SENSOR_ALERT_KEYS.adsbReporting1Fault]: this.adsbReportingFaultItem(
      NAV_SENSOR_ALERT_KEYS.adsbReporting1Fault,
      1,
    ),
    [NAV_SENSOR_ALERT_KEYS.adsbReporting2Fault]: this.adsbReportingFaultItem(
      NAV_SENSOR_ALERT_KEYS.adsbReporting2Fault,
      2,
    ),
    [NAV_SENSOR_ALERT_KEYS.captBackupScale]: cautionItem(
      NAV_SENSOR_ALERT_KEYS.captBackupScale,
      3,
      this.captBackupScale,
      NAV_SENSOR_PHASE_INHIBITION.backupScale,
      () => [0, 1, 2],
      EcamSysPage.NONE,
    ),
    [NAV_SENSOR_ALERT_KEYS.foBackupScale]: cautionItem(
      NAV_SENSOR_ALERT_KEYS.foBackupScale,
      3,
      this.foBackupScale,
      NAV_SENSOR_PHASE_INHIBITION.backupScale,
      () => [0, 1, 2],
      EcamSysPage.NONE,
    ),
    [NAV_SENSOR_ALERT_KEYS.captFoBackupScale]: cautionItem(
      NAV_SENSOR_ALERT_KEYS.captFoBackupScale,
      5,
      this.captFoBackupScale,
      NAV_SENSOR_PHASE_INHIBITION.backupScale,
      () => [0, 1, 2, 3, 4],
      EcamSysPage.NONE,
    ),
  };
}
