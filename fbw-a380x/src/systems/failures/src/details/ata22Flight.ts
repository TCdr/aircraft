// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily, SeenEffect } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

/** Engines 1 and 2 are on the left wing, 3 and 4 on the right wing */
const ENGINE_POSITIONS = ['outer left', 'inner left', 'inner right', 'outer right'] as const;

const position = (engine: number): string => ENGINE_POSITIONS[engine - 1];

/** AUTO FLT FMC-A(B)(C) FAULT: inhibited in flight phases 3 to 7, 9, 10 and 11 */
const NOT_SHOWN_PHASES_FMC_FAULT =
  'a new alert is not shown from the second engine at take-off power up to 1,500 ft, nor from 800 ft on the approach ' +
  'until the engines are shut down after landing; it shows with the engines off, with engines running before ' +
  'take-off power is set, in ' +
  'climb above 1,500 ft, cruise and descent above 800 ft, and after the engines are shut down';

/** AUTO FLT FMS 1(2)(1+2) FAULT: inhibited in flight phases 3 to 7 and 10 */
const NOT_SHOWN_PHASES_FMS_FAULT =
  'a new alert is not shown from the second engine at take-off power up to 1,500 ft, nor at touch down and on the ' +
  'landing roll above 80 kt';

/** AUTO FLT AFS CTL PNL FAULT, AFS BKUP CTL FAULT: inhibited in flight phases 4 to 7 and 10 */
const NOT_SHOWN_PHASES_AFS =
  'a new alert is not shown from 80 kt on the take-off roll through the climb to 1,500 ft, nor on the landing roll ' +
  'above 80 kt; it shows on the ground before 80 kt, in climb, cruise and descent above 800 ft, on the approach, and ' +
  'after landing below 80 kt';

/** AUTO FLT ENG n A/THR OFF: inhibited in flight phases 3, 4, 5 and 10 */
const NOT_SHOWN_PHASES_ATHR_OFF =
  'a new alert is not shown from the second engine at take-off power through the take-off roll, nor at touch down ' +
  'and on the landing roll above 80 kt; it shows on the ground before take-off power and after landing below 80 kt ' +
  '(with the A/THR armed), and ' +
  'from lift-off through climb, cruise, descent and approach';

/** AUTO FLT TCAS MODE FAULT: inhibited in flight phases 3 to 7 and 9 to 11 */
const NOT_SHOWN_PHASES_TCAS_FAULT =
  'a new alert is not shown from the second engine at take-off power up to 1,500 ft, nor from 800 ft on the approach ' +
  'until the engines are shut down after landing; it shows with the engines off, with engines running before ' +
  'take-off power is set, in ' +
  'climb above 1,500 ft, cruise and descent above 800 ft, and after the engines are shut down';

/** The INOP SYS lines that come with an alert only reach the STATUS page while that alert is shown */
const STATUS_WHILE_SHOWN = 'while the alert is shown and not held back by the flight phase';

// ---------------------------------------------------------------------------------------------------------------------
// FMC-A, FMC-B and FMC-C
// ---------------------------------------------------------------------------------------------------------------------

const FIRST_FMC_FAULT_ALERT = 221800001;
const FMS_1_FAULT_ALERT = '221800004';
const FMS_2_FAULT_ALERT = '221800005';
const FMS_1_AND_2_FAULT_ALERT = '221800006';

const FMC_TEXT =
  'The flight management computers run the flight management system: flight plan, navigation, performance ' +
  'predictions and the data for the autoflight system. There are three: FMC-A normally serves FMS 1 on the captain ' +
  'side, FMC-B serves FMS 2 on the first officer side, and FMC-C stands by for either of them.';

type FmcLetter = 'A' | 'B' | 'C';

const FMC_FAULT_ALERT: Record<FmcLetter, string> = {
  A: FIRST_FMC_FAULT_ALERT.toString(),
  B: (FIRST_FMC_FAULT_ALERT + 1).toString(),
  C: (FIRST_FMC_FAULT_ALERT + 2).toString(),
};

/** The bus that the warning system needs powered before it raises the FAULT alert of that FMC */
const FMC_ALERT_BUS: Record<FmcLetter, string> = { A: 'DC ESS', B: 'DC 2', C: 'DC 1' };

/** The FMS side that has the FMC as its normal computer, with the line of the FMS 1 (2) ON FMC-C information */
const FMC_SIDE: Record<FmcLetter, string> = { A: 'FMS 1', B: 'FMS 2', C: '' };

const fmcFailureImpact = (fmc: FmcLetter): string[] => {
  const common =
    'The FMS carries on unchanged: the flight plan, navigation and predictions keep running until all three FMCs ' +
    'are lost.';
  if (fmc === 'C') {
    return [
      common,
      'FMC-C is the standby: no FMS side depends on it, so nothing changes on the displays.',
      'The standby is lost: a second failure of FMC-A or FMC-B then takes the FMS of that side down.',
    ];
  }
  const side = FMC_SIDE[fmc];
  return [
    common,
    `${side} is flagged as running on FMC-C: the FMS tab of the MFD shows ${side}-C instead of ${side} on the sides ` +
      `${side} serves.`,
    `The standby FMC-C is the last computer behind ${side}: a second failure of it takes ${side} down.`,
  ];
};

/** The FMS FAULT alerts that a second FMC failure brings */
const fmsFaultEffects = (fmc: FmcLetter): SeenEffect[] => {
  const effects: SeenEffect[] = [];
  const lostFms = (fms: 1 | 2, other: FmcLetter, lines: string): void => {
    const fmsName = `FMS ${fms}`;
    effects.push({
      where: 'E/WD',
      text:
        `With FMC-${other} failed as well, AUTO FLT ${fmsName} FAULT replaces the FMC FAULT alerts, ${CAUTION}; ` +
        `${NOT_SHOWN_PHASES_FMS_FAULT}. Its lines: ${lines}. The STATUS page lists ${fmsName} under INOP SYS in all ` +
        `phases, and the ${fms === 1 ? 'captain' : 'first officer'} MFD shows FMS PAGE NOT AVAIL on its FMS pages ` +
        `unless the FMS switching is on the other side.`,
    });
  };
  if (fmc === 'A' || fmc === 'C') {
    lostFms(1, fmc === 'A' ? 'C' : 'A', 'FMC A+C FAULT, FMS SWTG BOTH ON 2');
  }
  if (fmc === 'B' || fmc === 'C') {
    lostFms(2, fmc === 'B' ? 'C' : 'B', 'FMC B+C FAULT, FMS SWTG BOTH ON 1');
  }
  effects.push({
    where: 'E/WD',
    text:
      'With all three FMCs failed, AUTO FLT FMS 1+2 FAULT replaces everything above, ' +
      `${CAUTION}; ${NOT_SHOWN_PHASES_FMS_FAULT}. Its lines: ALL FMCs FAULT, FMS SWTG NORM, FOR NAV: USE STBY ` +
      'INSTRUMENTS, FOR NAVAID TUNING: USE RMP, TAWS FLAP MODE OFF. The STATUS page lists FMS 1+2 and GPWS 1+2 under ' +
      'INOP SYS and STBY INSTRUMENTS NAV AVAIL under INFO. The FMS then stops: the flight plan and FMS data are ' +
      'reset, navigation and predictions are no longer updated, and the FMS pages of both MFDs show FMS PAGE NOT ' +
      'AVAIL.',
  });
  return effects;
};

const fmcDetail = (fmc: FmcLetter): FailureDetail => {
  const fmsLine = FMC_SIDE[fmc];
  const alertIds = [FMC_FAULT_ALERT[fmc]];
  if (fmc !== 'B') {
    alertIds.push(FMS_1_FAULT_ALERT);
  }
  if (fmc !== 'A') {
    alertIds.push(FMS_2_FAULT_ALERT);
  }
  alertIds.push(FMS_1_AND_2_FAULT_ALERT);
  const statusText =
    fmc === 'C'
      ? 'FMC-C is listed only under REDUND LOSS on the STATUS MORE page, in all phases. A STATUS page that holds ' +
        'only ' +
        'such lines counts as empty: the E/WD shows no STS indication and the page goes back after a few seconds, so ' +
        'the line is hard to read.'
      : `The STATUS page lists ${fmsLine} ON FMC-C under INFO while the alert is shown and not held back by the ` +
        `flight phase. FMC-${fmc} is also listed under REDUND LOSS on the STATUS MORE page in all phases.`;
  return {
    whatItIs: FMC_TEXT,
    impact: fmcFailureImpact(fmc),
    alertIds,
    effects: [
      {
        where: 'E/WD',
        text:
          `AUTO FLT FMC-${fmc} FAULT appears, ${ADVISORY}, with the line FMS SWTG NORM (done when the FMS switching ` +
          `is at NORM); ${NOT_SHOWN_PHASES_FMC_FAULT}. It needs the ${FMC_ALERT_BUS[fmc]} bus powered and does not ` +
          'show while any FMS FAULT alert is shown.',
      },
      { where: 'SD STATUS', text: statusText },
      ...fmsFaultEffects(fmc),
    ],
    notSimulated: [
      'The sim runs one FMS for both sides: when FMC-C takes over a side, only the FMS label and the alerts change, ' +
        'and no flight plan or data is transferred between computers.',
    ],
    logbook: { required: true, reason: `advisory, FMC-${fmc} fault` },
    clearing:
      `${MAINTENANCE_ONLY} If all three FMCs were lost, the flight plan and FMS data erased at that moment stay ` +
      'erased and must be entered again.',
  };
};

const FmcFamilyEntries: Record<number, FailureDetail> = {
  [A380Failure.FmcA]: fmcDetail('A'),
  [A380Failure.FmcB]: fmcDetail('B'),
  [A380Failure.FmcC]: fmcDetail('C'),
};

// ---------------------------------------------------------------------------------------------------------------------
// FCU 1 and FCU 2
// ---------------------------------------------------------------------------------------------------------------------

const FCU_TEXT =
  'The flight control unit (FCU) carries the glareshield controls: an EFIS control panel for each pilot and the ' +
  'AFS control panel. It is made of two units: FCU 1 serves the captain EFIS control panel and FCU 2 the first ' +
  'officer one, and the AFS control panel is driven by one of the two, the one selected by the master PRIM.';

const fcuDetail = (fcu: 1 | 2): FailureDetail => {
  const afsDriver =
    fcu === 2
      ? 'FCU 2 drives the AFS control panel with PRIM 1 or PRIM 3 master, which is the normal case, so the AFS ' +
        'display and lights go out'
      : 'FCU 1 drives the AFS control panel only with PRIM 2 master, so with PRIM 1 or PRIM 3 master the AFS panel ' +
        'is not affected; with PRIM 2 master the AFS display and lights go out';
  const pilot = fcu === 1 ? 'captain' : 'first officer';
  const side = fcu === 1 ? 'CAPT' : 'F/O';
  const bus = fcu === 1 ? 'DC ESS' : 'DC 2';
  return {
    whatItIs: `${FCU_TEXT} FCU ${fcu} is supplied from the ${bus} bus.`,
    impact: [
      `FCU ${fcu} sends invalid data and drives nothing: the ${pilot} EFIS control panel is dead.`,
      `The PFD and ND of the ${pilot} side no longer get baro, range or mode data from the panel: they fall back to ` +
        'default settings.',
      `${afsDriver}, and the knobs and pushbuttons sent through the FCU do nothing; the AP 1, AP 2 and A/THR ` +
        'pushbuttons still reach the PRIMs. The PRIMs never switch to the other FCU.',
    ],
    alertIds: [],
    effects: [
      {
        where: 'E/WD',
        text:
          'No alert and no STATUS line: the warning system does not read the health of the FCU. The CDS and AUTO FLT ' +
          'control panel alerts come from other failures.',
      },
      {
        where: 'Glareshield FCU',
        text:
          `The display and lights of the ${side} EFIS control panel go out. The AFS display and lights follow the ` +
          'unit that the master PRIM has selected: they stay if that is the other FCU, and go out if it is the ' +
          'failed ' +
          'one. The sync of the two baro settings stops while either FCU is failed.',
      },
      {
        where: 'PFD',
        text:
          `The baro reference box of the ${side} PFD shows STD with no baro value, because the baro setting word of ` +
          'the FCU is invalid. The LS scales and the flight path vector are shown as if LS and the velocity vector ' +
          'were selected, and the altimeter of that side is set to 1013.',
      },
      {
        where: 'ND',
        text: `The ND of the ${side} side goes to ROSE NAV, 80 NM range, with traffic shown, and cannot be changed.`,
      },
    ],
    logbook: { required: true, reason: `FCU ${fcu} lost, ${side} EFIS control panel dead` },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// AFS control panel and the AFS page of the FCU backups
// ---------------------------------------------------------------------------------------------------------------------

const AFS_PANEL_TEXT =
  'The AFS control panel on the glareshield is the main interface of the autoflight system: it engages the AP, FD ' +
  'and A/THR, selects managed or selected guidance, and sets the speed, heading or track, altitude and vertical ' +
  'speed targets. On the aircraft, if it fails, the AFS page of the FCU backup on the MFD of either side gives the ' +
  'same controls.';

const FCU_BACKUP_AFS_TEXT =
  'The FCU backup is a set of MFD pages that replace the FCU controls when a panel is lost: an AFS page for the ' +
  'AFS control panel and an EFIS page for each EFIS control panel. Each side has its own backup, with its own ' +
  'power supply (DC ESS for the captain, DC 2 for the first officer).';

const afsPanelDetail: FailureDetail = {
  whatItIs: AFS_PANEL_TEXT,
  impact: [
    'The AFS control panel is flagged as failed: the warning system raises the AUTO FLT alert and the STATUS line.',
    'The warning system counts a FCU backup as available while its AFS page is not failed and it has power.',
    'Nothing else reads the failure: the pushbuttons and knobs of the panel keep working.',
  ],
  alertIds: ['220800005', '220800016', '220800017'],
  effects: [
    {
      where: 'E/WD',
      text:
        `AUTO FLT AFS CTL PNL FAULT appears, ${CAUTION}; ${NOT_SHOWN_PHASES_AFS}. Its line is USE MFD FCU BKUP when ` +
        'both FCU backups are available, USE CAPT MFD FCU BKUP when only the captain one is, USE F/O MFD FCU BKUP ' +
        'when only the first officer one is, and none when neither is.',
    },
    {
      where: 'E/WD',
      text:
        `For a backup that is not available (its AFS page is failed, or its bus has no power), AUTO FLT CAPT ` +
        `(F/O) AFS BKUP CTL FAULT appears as well, ${ADVISORY}, with no lines and the same phase rule. It does not ` +
        'replace the AFS CTL PNL FAULT alert.',
    },
    {
      where: 'SD STATUS',
      text:
        `INOP SYS lists AFS CTL PNL ${STATUS_WHILE_SHOWN}, and CAPT (F/O) AFS BKUP CTL for each backup alert that is ` +
        'shown.',
    },
  ],
  notSimulated: [
    'The failed panel still works: its buttons and knobs are not disabled.',
    'The AFS page of the FCU backup is not modelled: the MFD shows a NOT FOUND page for it, so the USE MFD FCU BKUP ' +
      'line has nothing behind it.',
  ],
  logbook: { required: true, reason: 'caution, AFS control panel failed' },
  clearing: MAINTENANCE_ONLY,
};

const afsBackupPageDetail = (side: 'CAPT' | 'F/O'): FailureDetail => {
  const pilot = side === 'CAPT' ? 'captain' : 'first officer';
  const alert = side === 'CAPT' ? '220800016' : '220800017';
  const bus = side === 'CAPT' ? 'DC ESS' : 'DC 2';
  return {
    whatItIs: FCU_BACKUP_AFS_TEXT,
    impact: [
      `The AFS page of the ${side} FCU backup is flagged as failed, but alone it changes nothing.`,
      `It matters only when the AFS control panel fails too: the warning system then counts the ${pilot} backup as ` +
        `lost, as it does without power on the ${bus} bus.`,
      'Nothing else reads the failure.',
    ],
    alertIds: [],
    effects: [
      {
        where: 'E/WD',
        text:
          'On its own the failure shows no alert and no STATUS line. Together with the AFS control panel failure, ' +
          `AUTO FLT ${side} AFS BKUP CTL FAULT (${alert}) appears, ${ADVISORY}, as well as AFS CTL PNL FAULT, and ` +
          `the ` +
          'USE ... MFD FCU BKUP line of that alert names only the other side.',
      },
    ],
    notSimulated: [
      'The AFS page of the FCU backup is not modelled: the MFD shows a NOT FOUND page for it, so a failure of it ' +
        'changes nothing there.',
    ],
    logbook: { required: false, reason: 'no indication to report on its own' },
    clearing: MAINTENANCE_ONLY,
  };
};

// ---------------------------------------------------------------------------------------------------------------------
// Engine autothrust
// ---------------------------------------------------------------------------------------------------------------------

const FIRST_ATHR_OFF_ALERT = 220800009;
const TO_THRUST_DISAGREE_ALERT = '701800155';

const autothrustDetail = (engine: number): FailureDetail => ({
  whatItIs:
    'The autothrust (A/THR) of the flight guidance computers (PRIMs) commands the thrust of the four engines. Each ' +
    'engine FADEC gets the thrust orders from the PRIMs over the avionics network and sets the engine thrust, ' +
    `following the thrust lever when the A/THR is not in control. Engine ${engine} is the ${position(engine)} engine.`,
  impact: [
    `Engine ${engine} gets no A/THR orders: its FADEC follows thrust lever ${engine} alone, as for the loss of the ` +
      'FADEC link to the avionics networks. The other three engines stay under A/THR.',
    `In the CL detent engine ${engine} goes to climb thrust; the crew sets its thrust with thrust lever ${engine}.`,
    `The A/THR is not disconnected. With the A/THR off, engine ${engine} follows its lever as before, except that it ` +
      'loses the FLEX take-off thrust.',
  ],
  alertIds: [(FIRST_ATHR_OFF_ALERT + engine - 1).toString(), TO_THRUST_DISAGREE_ALERT],
  effects: [
    {
      where: 'E/WD',
      text:
        `AUTO FLT ENG ${engine} A/THR OFF appears, ${CAUTION}, only with the A/THR armed or active; ` +
        `${NOT_SHOWN_PHASES_ATHR_OFF}. In flight its line is THR LEVER ${engine} MAN ADJUST; on the ground it has ` +
        `no line. It does not show with ENG ${engine} FADEC FAULT, which lists the A/THR loss in its own STATUS.`,
    },
    {
      where: 'SD STATUS',
      text: `INOP SYS lists ENG ${engine} A/THR ${STATUS_WHILE_SHOWN}.`,
    },
    {
      where: 'E/WD',
      text:
        `With a FLEX TEMP entered, FADEC ${engine} no longer gets it with the dead PRIM bus and keeps TOGA as its ` +
        'take-off mode, whatever the A/THR state: ENG T.O THRUST DISAGREE appears, ' +
        `${CAUTION}, as one alert for the four engines that does not name engine ${engine}. It has no lines, calls ` +
        'up no SD page and shows only on the ground below 80 kt, while taxiing before take-off power is set and ' +
        `after landing; an alert already on screen stays when take-off power is set. Engine ${engine} then gives MCT ` +
        'instead of FLEX thrust in the FLX/MCT detent.',
    },
  ],
  logbook: { required: true, reason: `caution, engine ${engine} A/THR lost` },
  clearing: MAINTENANCE_ONLY,
});

const AutothrustFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1Autothrust, A380Failure.Eng2Autothrust, A380Failure.Eng3Autothrust, A380Failure.Eng4Autothrust],
  detail: autothrustDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// AP/FD TCAS mode
// ---------------------------------------------------------------------------------------------------------------------

const apFdTcasModeDetail: FailureDetail = {
  whatItIs:
    'The AP/FD TCAS mode lets the autopilot and flight directors fly a TCAS resolution advisory. The PRIMs get the ' +
    'TCAS data over the avionics network and engage the mode by themselves after a resolution advisory.',
  impact: [
    'The PRIMs get no valid TCAS data: the AP/FD TCAS mode cannot arm or engage after a resolution advisory.',
    'The TCAS function itself is not changed: traffic and resolution advisories are still computed and announced.',
    'The crew flies a resolution advisory manually.',
  ],
  alertIds: ['220800014'],
  effects: [
    {
      where: 'E/WD',
      text:
        `AUTO FLT TCAS MODE FAULT appears, ${CAUTION}; ${NOT_SHOWN_PHASES_TCAS_FAULT}. Its lines: FOR TCAS ALERT, AP ` +
        '& FD OFF (done when both the AP and the FD are off), FLY MANUALLY TCAS RA ORDER.',
    },
    {
      where: 'SD STATUS',
      text: `INOP SYS lists AP/FD TCAS MODE ${STATUS_WHILE_SHOWN}.`,
    },
  ],
  logbook: { required: true, reason: 'caution, AP/FD TCAS mode lost' },
  clearing: MAINTENANCE_ONLY,
};

export const Ata22FlightEntries: Record<number, FailureDetail> = {
  ...FmcFamilyEntries,
  [A380Failure.Fcu1]: fcuDetail(1),
  [A380Failure.Fcu2]: fcuDetail(2),
  [A380Failure.AfsControlPanel]: afsPanelDetail,
  [A380Failure.CaptFcuBackupAfsPage]: afsBackupPageDetail('CAPT'),
  [A380Failure.FoFcuBackupAfsPage]: afsBackupPageDetail('F/O'),
  [A380Failure.ApFdTcasMode]: apFdTcasModeDetail,
};

export const Ata22FlightFamilies: FailureDetailFamily[] = [AutothrustFamily];
