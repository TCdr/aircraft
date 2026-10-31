// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const STATUS_NOTE = 'while the alert is shown';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'a caution with master caution and single chime';

// A phase inhibition only stops a NEW alert from being shown: one that is already up stays.

/** Alerts inhibited from the second engine at take-off power through touch down (including cruise) */
const NOT_SHOWN_TAKE_OFF_TO_TOUCH_DOWN =
  'a new alert is not shown from the second engine at take-off power until touch down, so it appears on the ground ' +
  'with the engines off or the first engine started, after landing at or below 80 kt, or after engine shutdown; a ' +
  'fault that occurs earlier waits and appears then';

/** The fuel filter monitoring alert is inhibited from electrical power on to touch down */
const NOT_SHOWN_UNTIL_TOUCH_DOWN =
  'a new alert is not shown from electrical power on until touch down, so it appears only after landing at or below ' +
  '80 kt, or after engine shutdown; a fault that occurs earlier waits and appears then';

/** Alerts inhibited from take-off power to 1,500 ft and from 800 ft on approach to the end of the landing roll */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

const ENGINE_SHUT_DOWN_ALERTS = ['701800109', '701800110', '701800111', '701800112'] as const;
const FUEL_LEAK_DET_FAULT_ALERT = '281800072';
const FUEL_LEAK_DETECTED_ALERT = '281800073';

const FUEL_FILTER_CLOGGED_ALERTS = ['701800033', '701800034', '701800035', '701800036'] as const;
const FUEL_FILTER_MONITORING_ALERTS = ['701800037', '701800038', '701800039', '701800040'] as const;
const FUEL_LEAK_ALERTS = ['701800041', '701800042', '701800043', '701800044'] as const;
const FUEL_STRAINER_ALERTS = ['701800045', '701800046', '701800047', '701800048'] as const;
const FUEL_SYS_CONTAMINATION_ALERTS = ['701800049', '701800050', '701800051', '701800052'] as const;
const HP_FUEL_VLV_FAULT_ALERTS = ['701800053', '701800054', '701800055', '701800056'] as const;
const START_FAULT_ALERTS = ['701800117', '701800118', '701800119', '701800120'] as const;

const FUEL_PATH_EXPLANATION =
  'Each engine has a fuel strainer and a fuel filter, one before and one after the main engine fuel pump, to keep ' +
  'contamination out of the fuel system. Both have a bypass valve that keeps the fuel flowing to the nozzles if they clog. ';

// ---------------------------------------------------------------------------------------------------------------------
// Fuel filter clog
// ---------------------------------------------------------------------------------------------------------------------

const FuelFilterClogFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1FuelFilterClog,
    A380Failure.Eng2FuelFilterClog,
    A380Failure.Eng3FuelFilterClog,
    A380Failure.Eng4FuelFilterClog,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      `${FUEL_PATH_EXPLANATION}The fuel filter is the one after the engine fuel pump. The FADEC measures the pressure ` +
      'drop across it, and a drop above 35 PSI is reported as a clogged filter.',
    impact: [
      `The filter of engine ${number} is reported clogged. The simulation gives the engine no other effect: it runs normally.`,
      'Only the crew indications change: the amber CLOGGED on the engine page and an alert.',
    ],
    alertIds: [FUEL_FILTER_CLOGGED_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${number} FUEL FILTER CLOGGED, ${ADVISORY}, with no line, while ENG MASTER ${number} is ON and the engine runs; ` +
          `${NOT_SHOWN_TAKE_OFF_TO_TOUCH_DOWN}. The ENGINE page comes up with the alert when no page is selected.`,
      },
      {
        where: 'SD ENG',
        text: `CLOGGED in amber below the fuel flow of engine ${number} while the engine runs and its FADEC is powered. It shows at once in flight, even though the alert waits.`,
      },
      {
        where: 'E/WD',
        text: `Engine ${number} gets the amber attention box while the engine runs; the same box shows on the engine page.`,
      },
    ],
    notSimulated: [
      'In the real aircraft a pressure drop above 60 PSI opens the filter bypass valve and brings ENG FUEL SYS CONTAMINATION; here the clog never escalates.',
    ],
    logbook: {
      required: true,
      reason: `engine ${number} fuel filter clogged, advisory and CLOGGED on the engine page`,
    },
    clearing: `${MAINTENANCE_ONLY} The alert goes out when ENG MASTER ${number} is set to OFF, as the engine stops.`,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Fuel strainer clog
// ---------------------------------------------------------------------------------------------------------------------

const FuelStrainerClogFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1FuelStrainerClog,
    A380Failure.Eng2FuelStrainerClog,
    A380Failure.Eng3FuelStrainerClog,
    A380Failure.Eng4FuelStrainerClog,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      `${FUEL_PATH_EXPLANATION}The fuel strainer is the one before the engine fuel pump. The FADEC reports a clogged ` +
      'strainer when the pressure drop across it is too high.',
    impact: [
      `The strainer of engine ${number} is reported clogged. The simulation gives the engine no effect: it runs normally.`,
      'The report is only an advisory on the E/WD; no engine page indication and no STATUS line follow.',
    ],
    alertIds: [FUEL_STRAINER_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${number} FUEL STRAINER CLOGGED, ${ADVISORY}, with no line, whether or not the engine runs; ` +
          `${NOT_SHOWN_TAKE_OFF_TO_TOUCH_DOWN}.`,
      },
    ],
    notSimulated: [
      'In the real aircraft an opening bypass valve can let particles reach the metering unit; here nothing follows the report.',
    ],
    logbook: { required: true, reason: `engine ${number} fuel strainer clogged advisory` },
    clearing: MAINTENANCE_ONLY,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Fuel filter monitoring
// ---------------------------------------------------------------------------------------------------------------------

const FuelFilterMonitoringFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1FuelFilterMonitoring,
    A380Failure.Eng2FuelFilterMonitoring,
    A380Failure.Eng3FuelFilterMonitoring,
    A380Failure.Eng4FuelFilterMonitoring,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      `${FUEL_PATH_EXPLANATION}The FADEC monitors the pressure drop across the fuel filter to detect a clog. When the ` +
      'monitoring is lost, the filter is no longer watched.',
    impact: [
      `The monitoring of the fuel filter of engine ${number} is lost. The simulation gives the engine no effect.`,
      'The report is only an advisory on the E/WD, shown once the flight is over; no engine page indication and no STATUS line follow.',
    ],
    alertIds: [FUEL_FILTER_MONITORING_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${number} FUEL FILTER MONITORING FAULT, ${ADVISORY}, with no line, whether or not the engine runs; ` +
          `${NOT_SHOWN_UNTIL_TOUCH_DOWN}.`,
      },
    ],
    notSimulated: [
      'With the monitoring lost, a clogged filter would not be detected in the real aircraft; here a fuel filter clog failure is still reported.',
    ],
    logbook: { required: true, reason: `engine ${number} fuel filter monitoring fault advisory` },
    clearing: MAINTENANCE_ONLY,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Fuel system contamination (the filter bypass valve is open)
// ---------------------------------------------------------------------------------------------------------------------

const FuelSystemContaminationFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1FuelSystemContamination,
    A380Failure.Eng2FuelSystemContamination,
    A380Failure.Eng3FuelSystemContamination,
    A380Failure.Eng4FuelSystemContamination,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      `${FUEL_PATH_EXPLANATION}When the bypass valve of the fuel filter opens, unfiltered fuel flows to the nozzles and ` +
      'the metering unit, and the FADEC reports a contaminated fuel system.',
    impact: [
      `The filter bypass valve of engine ${number} is reported open. The simulation gives the engine no effect: it runs normally.`,
      'The report is a caution with the engine page, with no procedure line and no STATUS line.',
    ],
    alertIds: [FUEL_SYS_CONTAMINATION_ALERTS[number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${number} FUEL SYS CONTAMINATION, ${CAUTION}, with no line, whether or not the engine runs; ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
      },
      {
        where: 'SD ENG',
        text: `The page comes up with the alert when it is the first one on the E/WD and no page is selected. Nothing else changes on the page for engine ${number}.`,
      },
    ],
    notSimulated: [
      'In the real aircraft the open bypass can contaminate the metering unit with fuel particles; here the engine is not affected.',
    ],
    logbook: { required: true, reason: `engine ${number} fuel system contamination caution` },
    clearing: MAINTENANCE_ONLY,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// HP fuel valve stuck
// ---------------------------------------------------------------------------------------------------------------------

const HpFuelValveStuckFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1HpFuelValveStuck,
    A380Failure.Eng2HpFuelValveStuck,
    A380Failure.Eng3HpFuelValveStuck,
    A380Failure.Eng4HpFuelValveStuck,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The high pressure (HP) fuel shutoff valve of an engine opens the fuel supply to the combustion chamber for a ' +
      'start and closes it when the ENG MASTER is set to OFF. The FADEC compares the valve position with its command and ' +
      'reports a valve that does not follow.',
    impact: [
      `The valve of engine ${number} sticks where it is when the failure is set: closed on a shut down engine, open on a running one.`,
      `Stuck closed: engine ${number} gets no fuel and does not light up at a start on the ground. In flight a relight does not light up either, and no alert says why.`,
      `Stuck open: nothing changes while the engine runs; ENG MASTER ${number} OFF still stops the engine, through the LP fuel valve, but the fault is reported.`,
    ],
    alertIds: [
      HP_FUEL_VLV_FAULT_ALERTS[number - 1],
      START_FAULT_ALERTS[number - 1],
      ENGINE_SHUT_DOWN_ALERTS[number - 1],
    ],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${number} HP FUEL VLV FAULT, ${CAUTION}, about 2 s after the valve position differs from the FADEC command. Valve closed when the FADEC commands it open ` +
          `at an engine start on the ground: HP FUEL VALVE NOT OPEN, ENG ${number} MAN START OFF (manual start only) and ENG ${number} MASTER OFF. Valve open when the FADEC ` +
          `commands it closed at a shutdown: HP FUEL VALVE NOT CLOSED, the same two lines and, on the ground, ENG ${number} FIRE P/B PUSH. ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}. The ENGINE page comes up with it.`,
      },
      {
        where: 'E/WD',
        text: 'At an automatic start with the valve stuck closed the HP FUEL VLV FAULT goes out during the crank and after the start is aborted, and comes back at each new attempt.',
      },
      {
        where: 'Pedestal ENG MASTER panel',
        text: `The FAULT light of ENG MASTER ${number} comes on while the HP FUEL VLV FAULT is present, and stays on after an automatic start is aborted, until ENG MASTER ${number} is set to OFF.`,
      },
      ...(number === 1
        ? [
            {
              where: 'SD STATUS',
              text: 'On the ground, pushing the ENG 1 FIRE pb as the NOT CLOSED procedure asks adds the limitation APU BLEED DO NOT USE while the pb stays released. Pushing the pb of engines 2 to 4 raises nothing.',
            },
          ]
        : []),
      {
        where: 'E/WD',
        text:
          `Stuck closed at a start on the ground: ENG ${number} START FAULT, ${ADVISORY}, with NO LIGHT UP. An automatic start shows NEW START IN PROGRESS during the automatic crank ` +
          `or a new attempt, otherwise ENG ${number} MASTER OFF; a manual start shows ENG ${number} MASTER OFF, ENG START SEL CRANK, then after 30 s ENG START SEL NORM and ENG ${number} MAN START OFF. ` +
          `${NOT_SHOWN_PHASES_3_TO_7_9_10}. It stays after the start is aborted.`,
      },
      {
        where: 'E/WD',
        text:
          `Stuck open: ENG ${number} MASTER OFF in flight also gives ENG ${number} SHUT DOWN, ${CAUTION}; it is not shown with the engines off, ` +
          'with the first engine started, after landing or after engine shutdown, nor from V1 to 400 ft.',
      },
    ],
    logbook: { required: true, reason: `engine ${number} HP fuel valve fault caution and ENG MASTER FAULT light` },
    clearing: `${MAINTENANCE_ONLY} The fault goes out once the valve follows its command again; an engine master the crew set to OFF stays OFF.`,
  }),
};

// ---------------------------------------------------------------------------------------------------------------------
// Engine fuel leak
// ---------------------------------------------------------------------------------------------------------------------

const EngineFuelLeakFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1FuelLeak, A380Failure.Eng2FuelLeak, A380Failure.Eng3FuelLeak, A380Failure.Eng4FuelLeak],
  detail: (number): FailureDetail => ({
    whatItIs:
      'An internal engine fuel leak is a leak between the fuel flow transmitter and the combustion chamber: the leaking ' +
      'fuel passes the flowmeter, so the fuel flow and the fuel used of the engine read higher than those of the other ' +
      'engines. The warning system finds the leak by comparing them.',
    impact: [
      `While engine ${number} runs, its feed tank ${number} loses about 1,200 kg/h more than the engine burns, so the fuel on board falls faster than the fuel used shows.`,
      `The leak stops when engine ${number} stops. The fuel lost is not recovered.`,
      'After the leak has run for 5 min the warning system raises the alert; the engine itself keeps its thrust.',
    ],
    alertIds: [
      FUEL_LEAK_ALERTS[number - 1],
      ENGINE_SHUT_DOWN_ALERTS[number - 1],
      FUEL_LEAK_DET_FAULT_ALERT,
      FUEL_LEAK_DETECTED_ALERT,
    ],
    effects: [
      {
        where: 'E/WD',
        text:
          `ENG ${number} FUEL LEAK, ${CAUTION}, after 5 min of leak with the engine running. Its lines are ENG FUEL PARAMETERS CHECK, IF FUEL LEAK, ` +
          `THR LEVER ${number} IDLE and ENG ${number} MASTER OFF; ${NOT_SHOWN_PHASES_3_TO_7_9_10}. The ENGINE page comes up with it. The alert goes out as soon as the engine stops or the failure is restored.`,
      },
      {
        where: 'SD FUEL',
        text: `The quantity of feed tank ${number} and the fuel on board fall faster than the fuel used shows; in flight the transfers refill the feed tank, so the other tanks lose that fuel.`,
      },
      {
        where: 'E/WD',
        text: `Flying the procedure (ENG ${number} MASTER OFF) in flight: ENG ${number} SHUT DOWN, ${CAUTION}, not shown with the engines off, with the first engine started, after landing or after engine shutdown, nor from V1 to 400 ft.`,
      },
      {
        where: 'E/WD',
        text:
          `With the engine out, the aircraft leak detection is inhibited: FUEL LEAK DET FAULT, ${ADVISORY}, shown only in flight above 1,500 ft down to 800 ft ` +
          '(climb, cruise and descent above 800 ft). It has no SD page and lasts as long as an engine is out; the slow leak detection is then lost for the rest of the flight.',
      },
      {
        where: 'E/WD',
        text:
          `If the engine keeps leaking with all four engines running and no jettison, FUEL LEAK DETECTED, ${CAUTION}, comes after about 5 h 50 min of leak with all four engines running ` +
          '(15,450 lb between the block fuel and the fuel on board plus fuel used). It is shown only with the first engine started on the ground and in flight above 1,500 ft down to ' +
          '800 ft (climb, cruise and descent above 800 ft). The lines ask to check the tank quantities, fuel on board and fuel used; if the fuel on board plus fuel used disagrees with the block fuel, to set all crossfeeds and the transfer pumps OFF; and, with a feed tank leak suspected, to set the affected thrust lever to IDLE and the affected engine master OFF. The SD FUEL page comes up with it when it is the first alert on the E/WD and no page is selected. Once raised it stays until the aircraft is on the ground with an engine shut down.',
      },
      {
        where: 'SD STATUS',
        text:
          `FUEL LEAK DETECTED, ${STATUS_NOTE}: LIMITATIONS LAND ANSA and FUEL PARTLY UNUSABLE; ticking the LEAK STOPS line removes FUEL PARTLY UNUSABLE, and ticking LEAK CONTINUES adds ` +
          'INFO MIN FUEL USABLE : OTHER FEED TKs and (ALL OTHER FUEL MAYBE LOST). FUEL LEAK DET FAULT adds INOP SYS FUEL LEAK DET.',
      },
      { where: 'PFD', text: 'The limitation LAND ANSA is shown while FUEL LEAK DETECTED is shown.' },
    ],
    notSimulated: [
      'The real detection compares the fuel flow or the fuel used of the engines and is inhibited below FL 290 with N1 under 62 %, without autothrust, with a thrust lever below the climb detent, or with a degraded fuel flow; here the alert comes after 5 min of leak in any condition.',
      'In the real aircraft the fuel flow and the fuel used of the leaking engine read high; here they stay normal and only the tank quantity and the fuel on board fall.',
    ],
    logbook: { required: true, reason: `engine ${number} fuel leak caution and fuel loss` },
    clearing: `${MAINTENANCE_ONLY} The fuel already lost is not recovered, an engine master the crew set to OFF stays OFF, and a FUEL LEAK DETECTED already raised stays until the aircraft is on the ground with an engine shut down. After an engine was shut down in flight the slow leak detection stays lost for the flight.`,
  }),
};

export const Ata73FuelFamilies: FailureDetailFamily[] = [
  EngineFuelLeakFamily,
  FuelFilterClogFamily,
  HpFuelValveStuckFamily,
  FuelStrainerClogFamily,
  FuelFilterMonitoringFamily,
  FuelSystemContaminationFamily,
];
