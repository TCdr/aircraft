// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** The phases (1, 2, 3, 7, 8, 11 and 12) in which the SMOKE warnings of the bays and cargo compartments are shown */
const SMOKE_WARNING_PHASES =
  'shown with the engines off, with the first engine started, with the second engine at take-off power below 80 kt, ' +
  'from 400 ft to 1,500 ft, above 1,500 ft down to 800 ft, and at or below 80 kt after landing or with the engines ' +
  'shut down; not from 80 kt on the take-off roll to 400 ft, below 800 ft on approach, or at touch down; once shown it stays when the phase changes';

/** The phases (1, 2, 8 and 12) in which the DET FAULT cautions of the compartments are shown */
const DET_FAULT_PHASES =
  'shown with the engines off, with the first engine started, above 1,500 ft down to 800 ft, and with the engines ' +
  'shut down; not from take-off power to 1,500 ft, on approach, at touch down or after landing; once shown it stays when the phase changes';

/** Where the two detectors of a zone sit, and the model simplification for the cargo compartments */
const CARGO_DETECTOR_PLACE = 'The smoke detectors sit in cavities of the ceiling panels, two per cavity.';
const BAY_DETECTOR_PLACE = 'Its two smoke detectors sit in the air extraction ducts of the racks.';
const CARGO_DETECTOR_SIMPLIFIED = 'Each cargo compartment is modelled with one pair of detectors.';

const SDF_EXPLANATION =
  'The smoke detection function (SDF) of the cabin intercommunication data system reads the smoke detectors of the ' +
  'cargo compartments, the avionics bays, the in-flight entertainment (IFE) bay, the network server system (NSS) ' +
  'and the cabin areas, and sends the smoke warnings and detector faults to the warning system.';

/** A compartment watched by two smoke detectors, in the order of the failure ids */
interface SmokeZone {
  readonly name: string;
  readonly smokeAlert: string;
  readonly smokeTitle: string;
  readonly detFaultAlert: string;
  readonly detFaultTitle: string;
  readonly inopLine: string;
  readonly kind: 'fwdCargo' | 'aftCargo' | 'mainBay' | 'upperBay' | 'aftBay' | 'ifeBay';
}

const SMOKE_ZONES: readonly SmokeZone[] = [
  {
    name: 'forward cargo compartment',
    smokeAlert: '260800045',
    smokeTitle: 'SMOKE FWD CARGO SMOKE',
    detFaultAlert: '260800048',
    detFaultTitle: 'SMOKE FWD CARGO DET FAULT',
    inopLine: 'FWD CARGO SMK DET',
    kind: 'fwdCargo',
  },
  {
    name: 'aft cargo compartment',
    smokeAlert: '260800046',
    smokeTitle: 'SMOKE AFT CARGO SMOKE',
    detFaultAlert: '260800049',
    detFaultTitle: 'SMOKE AFT CARGO DET FAULT',
    inopLine: 'AFT CARGO SMK DET',
    kind: 'aftCargo',
  },
  {
    name: 'bulk cargo compartment',
    smokeAlert: '260800047',
    smokeTitle: 'SMOKE BULK CARGO SMOKE',
    detFaultAlert: '260800050',
    detFaultTitle: 'SMOKE BULK CARGO DET FAULT',
    inopLine: 'AFT CARGO SMK DET',
    kind: 'aftCargo',
  },
  {
    name: 'left main avionics bay',
    smokeAlert: '260800038',
    smokeTitle: 'SMOKE L MAIN AVNCS SMOKE',
    detFaultAlert: '260800034',
    detFaultTitle: 'SMOKE L MAIN AVNCS DET FAULT',
    inopLine: 'L MAIN AVNCS SMK DET',
    kind: 'mainBay',
  },
  {
    name: 'right main avionics bay',
    smokeAlert: '260800039',
    smokeTitle: 'SMOKE R MAIN AVNCS SMOKE',
    detFaultAlert: '260800035',
    detFaultTitle: 'SMOKE R MAIN AVNCS DET FAULT',
    inopLine: 'R MAIN AVNCS SMK DET',
    kind: 'mainBay',
  },
  {
    name: 'left upper avionics bay',
    smokeAlert: '260800040',
    smokeTitle: 'SMOKE L UPPER AVNCS SMOKE',
    detFaultAlert: '260800036',
    detFaultTitle: 'SMOKE L UPPER AVNCS DET FAULT',
    inopLine: 'L UPPR AVNCS SMK DET',
    kind: 'upperBay',
  },
  {
    name: 'right upper avionics bay',
    smokeAlert: '260800041',
    smokeTitle: 'SMOKE R UPPER AVNCS SMOKE',
    detFaultAlert: '260800037',
    detFaultTitle: 'SMOKE R UPPER AVNCS DET FAULT',
    inopLine: 'R UPPR AVNCS SMK DET',
    kind: 'upperBay',
  },
  {
    name: 'aft avionics bay',
    smokeAlert: '260800030',
    smokeTitle: 'SMOKE AFT AVNCS SMOKE',
    detFaultAlert: '260800029',
    detFaultTitle: 'SMOKE AFT AVNCS DET FAULT',
    inopLine: 'AFT AVNCS SMK DET',
    kind: 'aftBay',
  },
  {
    name: 'IFE bay',
    smokeAlert: '260800033',
    smokeTitle: 'SMOKE IFE BAY SMOKE',
    detFaultAlert: '260800032',
    detFaultTitle: 'SMOKE IFE BAY DET FAULT',
    inopLine: 'IFE BAY SMK DET',
    kind: 'ifeBay',
  },
];

const SmokeFamily: FailureDetailFamily = {
  ids: [
    A380Failure.FwdCargoSmoke,
    A380Failure.AftCargoSmoke,
    A380Failure.BulkCargoSmoke,
    A380Failure.LeftMainAvionicsSmoke,
    A380Failure.RightMainAvionicsSmoke,
    A380Failure.LeftUpperAvionicsSmoke,
    A380Failure.RightUpperAvionicsSmoke,
    A380Failure.AftAvionicsSmoke,
    A380Failure.IfeBaySmoke,
  ],
  detail: (number): FailureDetail => {
    const zone = SMOKE_ZONES[number - 1];
    const cargo = zone.kind === 'fwdCargo' || zone.kind === 'aftCargo';
    const avionics = zone.kind === 'mainBay' || zone.kind === 'upperBay' || zone.kind === 'aftBay';
    const effects: { where: string; text: string }[] = [
      {
        where: 'E/WD',
        text:
          `${zone.smokeTitle}, red warning with master warning and continuous chime, as soon as the detectors ` +
          `report smoke. It is ${SMOKE_WARNING_PHASES}.`,
      },
    ];
    if (zone.kind === 'mainBay') {
      effects.push({
        where: 'E/WD',
        text: 'Hidden while the upper avionics bay of the same side also has smoke: only the UPPER alert is shown then.',
      });
    }
    if (cargo) {
      effects.push({
        where: 'Overhead CARGO SMOKE panel',
        text: `The SMOKE light of the AGENT TO ${zone.kind === 'fwdCargo' ? 'FWD' : 'AFT'} pushbutton comes on${zone.kind === 'aftCargo' ? ' (the aft and bulk compartments share it)' : ''}.`,
      });
      effects.push({
        where: 'SD COND',
        text: `A red SMOKE shows in the ${zone.kind === 'fwdCargo' ? 'forward' : 'aft and bulk'} cargo area, and the page is called up with the alert when it is the first alert on the E/WD and the crew has not selected another page.`,
      });
    } else if (zone.kind === 'mainBay' || zone.kind === 'upperBay') {
      effects.push({
        where: 'SD COND',
        text: 'A red L SMOKE or R SMOKE legend shows at the bay (L R SMOKE when both sides have smoke).',
      });
    } else if (zone.kind === 'aftBay') {
      effects.push({
        where: 'SD COND',
        text: 'The page is called up with the alert when it is the first alert on the E/WD and the crew has not selected another page.',
      });
    }
    return {
      whatItIs:
        `${SDF_EXPLANATION} ${cargo ? CARGO_DETECTOR_PLACE : `The ${zone.name}: ${BAY_DETECTOR_PLACE}`} The SDF ` +
        'warns of smoke when both detectors of a pair detect it, or when one is failed and the other detects it.',
      impact: [
        `Smoke is reported in the ${zone.name}. The warning stays on as long as the failure is set, a detector is powered and the SDF works.`,
        cargo
          ? 'Nothing else is moved by the system: the crew closes the isolation valves and discharges the agent.'
          : 'Nothing else is moved by the system: the crew runs the procedure.',
      ],
      alertIds: [zone.smokeAlert],
      effects,
      notSimulated: [
        ...(avionics ? ['The AVNCS SMOKE light of the overhead VENT panel does not come on.'] : []),
        ...(zone.kind === 'ifeBay'
          ? [
              'The IFE extraction fan does not stop and the IFE power is not cut off.',
              'The IFEC pushbutton SMOKE light and the alert on the flight attendant panel do not come on.',
            ]
          : []),
        ...(cargo ? ['The smoke does not clear after the agent discharge, so the warning stays.'] : []),
        ...(cargo ? [CARGO_DETECTOR_SIMPLIFIED] : []),
        ...(number === 3
          ? [
              'The ventilation of the bulk compartment does not stop by itself: its isolation valves stay open and the extraction fan keeps running.',
            ]
          : []),
      ],
      logbook: { required: true, reason: 'red warning with a smoke procedure' },
      clearing: cargo
        ? 'Maintenance only: use Restore. The agent discharge does not clear the warning.'
        : MAINTENANCE_ONLY,
    };
  },
};

const SmokeDetectorFamily: FailureDetailFamily = {
  ids: [
    A380Failure.FwdCargoSmokeDetector1,
    A380Failure.FwdCargoSmokeDetector2,
    A380Failure.AftCargoSmokeDetector1,
    A380Failure.AftCargoSmokeDetector2,
    A380Failure.BulkCargoSmokeDetector1,
    A380Failure.BulkCargoSmokeDetector2,
    A380Failure.LeftMainAvionicsSmokeDetector1,
    A380Failure.LeftMainAvionicsSmokeDetector2,
    A380Failure.RightMainAvionicsSmokeDetector1,
    A380Failure.RightMainAvionicsSmokeDetector2,
    A380Failure.LeftUpperAvionicsSmokeDetector1,
    A380Failure.LeftUpperAvionicsSmokeDetector2,
    A380Failure.RightUpperAvionicsSmokeDetector1,
    A380Failure.RightUpperAvionicsSmokeDetector2,
    A380Failure.AftAvionicsSmokeDetector1,
    A380Failure.AftAvionicsSmokeDetector2,
    A380Failure.IfeBaySmokeDetector1,
    A380Failure.IfeBaySmokeDetector2,
  ],
  detail: (number): FailureDetail => {
    const zone = SMOKE_ZONES[Math.floor((number - 1) / 2)];
    const detector = ((number - 1) % 2) + 1;
    const cargo = zone.kind === 'fwdCargo' || zone.kind === 'aftCargo';
    const effects = [
      {
        where: 'E/WD',
        text:
          `${zone.detFaultTitle}, amber caution with master caution and single chime. It is ${DET_FAULT_PHASES}. ` +
          'It stays on when the other detector is failed too; when the remaining detector reports smoke, the DET FAULT goes out and the SMOKE warning replaces it.',
      },
      {
        where: 'SD STATUS',
        text: `${zone.inopLine} is listed as inoperative while the alert is shown.`,
      },
    ];
    if (cargo) {
      effects.splice(1, 0, {
        where: 'E/WD',
        text:
          zone.kind === 'fwdCargo'
            ? 'The procedure lines are IF NO LIVESTOCK : FWD ISOL VALVES OFF.'
            : 'The procedure lines are IF NO LIVESTOCK : BULK ISOL VALVES OFF and BULK CARGO HEATER OFF.',
      });
    }
    return {
      whatItIs:
        `${SDF_EXPLANATION} ${cargo ? CARGO_DETECTOR_PLACE : `The ${zone.name}: ${BAY_DETECTOR_PLACE}`} One ` +
        'detector of a pair can fail without losing the detection.',
      impact: [
        `Smoke detector ${detector} of the ${zone.name} is failed. The other detector still detects smoke.`,
        'With smoke in the compartment, the SMOKE warning still comes from the remaining detector.',
        'With both detectors failed, smoke in the compartment is no longer detected.',
      ],
      alertIds: [zone.detFaultAlert],
      effects,
      ...(cargo ? { notSimulated: [CARGO_DETECTOR_SIMPLIFIED] } : {}),
      logbook: { required: true, reason: 'ECAM caution and a smoke detector listed inoperative' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

function nssDetectorDetail(detector: number): FailureDetail {
  return {
    whatItIs:
      'The network server system (NSS) is the group of servers of the onboard information system. It has two smoke ' +
      'detectors that the smoke detection function reads, so one can fail without losing the detection.',
    impact: [
      `Smoke detector ${detector} of the NSS is failed. The other one still detects smoke.`,
      'With both NSS detectors failed, smoke in the NSS is no longer detected.',
    ],
    alertIds: [],
    effects: [{ where: 'E/WD', text: 'No indication: the NSS has no detector fault alert.' }],
    logbook: { required: false, reason: 'no indication to report' },
    clearing: MAINTENANCE_ONLY,
  };
}

export const Ata26SmokeBaysEntries: Record<number, FailureDetail> = {
  [A380Failure.SmokeDetectionFunction]: {
    whatItIs: SDF_EXPLANATION,
    impact: [
      'The SDF is lost: no compartment reports smoke or a detector fault any more, whatever the detectors see.',
      'This covers the cargo compartments, the avionics and IFE bays, the NSS and the cabin areas.',
      'A SMOKE warning or DET FAULT already shown goes out when the SDF fails, with the red SMOKE on the SD COND page and the SMOKE lights of the AGENT TO pushbuttons.',
      'SMOKE FACILITIES DET FAULT and SMOKE SAFETY TEST REQUIRED are not shown while the SDF is failed.',
      'The cargo fire extinguishing keeps working, but the cargo smoke test no longer raises the SMOKE warnings on the E/WD.',
    ],
    alertIds: ['260800031'],
    effects: [
      {
        where: 'E/WD',
        text:
          'SMOKE DET FAULT, amber caution with master caution and single chime. It is shown with the engines off, ' +
          'with the first engine started, above 1,500 ft down to 800 ft, after landing and with the engines shut ' +
          'down; not from take-off power to 1,500 ft, on approach or at touch down' +
          '; once shown it stays when the phase changes.',
      },
      {
        where: 'E/WD',
        text: 'The procedure lines are IFEC OFF, IF NO LIVESTOCK, CARGO FWD ISOL VALVES OFF, CARGO BULK ISOL VALVES OFF and CARGO BULK CARGO HEAT OFF.',
      },
      {
        where: 'SD STATUS',
        text: 'ALL SMOKE DET, FWD CRG VENT, FWD CGR TEMP REGUL, BULK CRG VENT and BULK CRG HEATER are listed as inoperative while the alert is shown.',
      },
    ],
    notSimulated: ['The cargo ventilation, temperature regulation and heater are not shut down by the failure.'],
    logbook: { required: true, reason: 'ECAM caution and all smoke detection lost' },
    clearing: MAINTENANCE_ONLY,
  },

  [A380Failure.NssSmoke]: {
    whatItIs:
      'The network server system (NSS) is the group of servers of the onboard information system. It has two smoke ' +
      'detectors, read by the smoke detection function, and the NSS MASTER switch of the overhead ENTERTAINMENT ' +
      'panel carries a SMOKE light.',
    impact: [
      'Smoke is reported in the NSS. There is no ECAM alert for it.',
      'The light stays on as long as the failure is set, a detector is powered and the SDF works.',
    ],
    alertIds: [],
    effects: [
      {
        where: 'Overhead ENTERTAINMENT panel',
        text: 'The SMOKE light of the NSS MASTER switch comes on (the light needs AC bus 1 powered).',
      },
    ],
    logbook: { required: true, reason: 'SMOKE light on the NSS MASTER switch' },
    clearing: MAINTENANCE_ONLY,
  },

  [A380Failure.SmokeDetectionFacilities]: {
    whatItIs:
      SDF_EXPLANATION +
      ' The facilities part of it knows the cabin configuration and the smoke detectors of the cabin areas.',
    impact: [
      'The cabin areas (lavatories, crew rests and work stations) report neither smoke nor detector faults.',
      'The cargo compartments, the avionics bays, the IFE bay and the NSS are not affected.',
    ],
    alertIds: ['260800042'],
    effects: [
      {
        where: 'E/WD',
        text:
          'SMOKE FACILITIES DET FAULT, amber caution with master caution and single chime. Only a new alert on the ' +
          'ground with all engines stopped; it does not appear once the first engine is started, but once shown it ' +
          'stays when the phase changes. Not shown while the smoke detection function is also failed.',
      },
      { where: 'E/WD', text: 'The procedure line asks to establish CKPT / CABIN COM.' },
      { where: 'SD STATUS', text: 'FACILITIES SMK DET is listed as inoperative while the alert is shown.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and the cabin smoke detection lost' },
    clearing: MAINTENANCE_ONLY,
  },

  [A380Failure.SmokeDetectionSafetyTestOverdue]: {
    whatItIs:
      SDF_EXPLANATION +
      ' On the ground it also runs an automatic safety test of itself every 10 hours, and asks for a test when ' +
      'those tests have been missed.',
    impact: ['The SDF reports that its safety test is overdue. Detection itself is not affected.'],
    alertIds: ['260800092'],
    effects: [
      {
        where: 'E/WD',
        text:
          'SMOKE SAFETY TEST REQUIRED, amber advisory without master caution or chime. Only a new alert on the ground ' +
          'with all engines stopped; once shown it stays when the phase changes. Not shown while the smoke ' +
          'detection function is also failed.',
      },
    ],
    logbook: { required: true, reason: 'ECAM advisory' },
    clearing: MAINTENANCE_ONLY,
  },

  [A380Failure.NssSmokeDetector1]: nssDetectorDetail(1),
  [A380Failure.NssSmokeDetector2]: nssDetectorDetail(2),
};

export const Ata26SmokeBaysFamilies: FailureDetailFamily[] = [SmokeFamily, SmokeDetectorFamily];
