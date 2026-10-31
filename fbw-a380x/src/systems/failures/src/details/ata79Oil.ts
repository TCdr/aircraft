// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';
const WARNING = 'a red warning with master warning and continuous repetitive chime';

// A phase inhibition only stops a NEW alert from being shown: one that is already up stays.

/** ENG n OIL PRESS LO: inhibited in flight phases 1, 5, 6 and 12 */
const OIL_PRESS_LO_PHASES = 'a new alert is not shown from V1 to 400 ft; once shown it stays when the phase changes';

/** ENG n OIL TEMP HI: inhibited in flight phases 1, 4 to 7, 9, 10 and 12 */
const OIL_TEMP_HI_PHASES =
  'a new alert is shown on the ground before take-off and during the take-off roll below 80 kt, in flight above ' +
  '1,500 ft down to 800 ft (climb, cruise and descent above 800 ft), and after landing below 80 kt; not from 80 kt on ' +
  'the take-off roll up to 1,500 ft, nor from 800 ft on approach until the landing roll is below 80 kt';

/** ENG n OIL FILTER CLOGGED: inhibited in flight phases 3 to 10, and monitored only with the engine running */
const OIL_FILTER_CLOGGED_PHASES =
  'a new alert is not shown from the second engine at take-off power until the landing roll is below 80 kt, so it ' +
  'appears on the ground once the engine runs before take-off power, or after landing below 80 kt; a clog set in ' +
  'flight waits for the landing';

/** ENG n OIL CHIP DETECTED and OIL FILTER MONITORING FAULT: inhibited in flight phases 1 to 10 */
const SHOWN_ONLY_AFTER_LANDING =
  'a new alert is not shown from electrical power on until the landing roll is below 80 kt, so it appears only after ' +
  'landing below 80 kt or after the engines are shut down at the end of the flight; a fault that occurs earlier waits ' +
  'and appears then';

/** ENG n OIL SYS CONTAMINATION: inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_TAKE_OFF_AND_LANDING =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** ENG n SHUT DOWN: not raised in flight phases 1, 2, 11 and 12, inhibited in 5 and 6 */
const SHUT_DOWN_TIMING =
  'it appears for an engine switched off in flight, on the take-off roll before V1 or on the landing roll above 80 ' +
  'kt, but not while taxiing or stopped on the ground, and a new one is not shown from V1 to 400 ft';

/** FUEL LEAK DET FAULT: inhibited in every flight phase except 8 */
const FUEL_LEAK_DET_FAULT_TEXT =
  `With the engine out in flight, the aircraft fuel leak detection is inhibited: FUEL LEAK DET FAULT, ${ADVISORY}, ` +
  'shown only in flight above 1,500 ft down to 800 ft (climb, cruise and descent above 800 ft). It lasts as long as ' +
  'an engine is out, and the slow leak detection is lost for the rest of the flight. While it is shown, the STATUS ' +
  'page lists FUEL LEAK DET as inoperative.';

/** AIR ABNORM BLEED CONFIG: comes with every ENG n SHUT DOWN (the shut-down engine bleed is lost) */
const abnormBleedConfigText = (engine: number): string =>
  'With the engine shut down, AIR ABNORM BLEED CONFIG also appears, an amber caution with master caution and no ' +
  'chime of its own; a new one is not shown from V1 to 400 ft. The BLEED page comes up with it. Its lines: XBLEED ' +
  'OPEN when the crossbleed did not open by itself, then IF XBLEED OPEN and IF MAX THR RQRD: AIR FLOW LO and FWD ' +
  'CARGO TEMP REGUL OFF' +
  (engine === 1 || engine === 4
    ? '; if the crossbleed stays closed, WING A-ICE OFF, ENGs A-ICE AS RQRD and AVOID ICING CONDs. AVOID ICING CONDs ' +
      'is also shown as a limitation on the E/WD, the STATUS page and the PFD while the wing anti-ice is off.'
    : '.');

const SD_ENG_CALL_UP = 'The page comes up with the alert when it is the first one on the E/WD and no page is selected.';

const ENGINE_POSITIONS = ['outer left', 'inner left', 'inner right', 'outer right'] as const;

const OIL_SYSTEM_DESCRIPTION =
  'The engine oil system lubricates and cools the bearings, gears and accessory drives. A feed pump, driven by the ' +
  'accessory gearbox, takes the oil from the engine oil tank to the engine, scavenge pumps bring it back, and the ' +
  'fuel/oil heat exchanger cools it with the engine fuel.';

const OIL_FILTERS_DESCRIPTION =
  'Two oil filters protect the oil system: one in the feed line and one in the return line. Only the return line ' +
  'filter has a bypass valve, which opens when that filter is fully clogged so that the oil keeps flowing.';

const OIL_PRESS_LO_FIRST = 701800085;
const OIL_TEMP_HI_FIRST = 701800093;
const OIL_FILTER_CLOGGED_FIRST = 701800081;
const OIL_CHIP_FIRST = 701800077;
const OIL_SYS_CONTAMINATION_FIRST = 701800089;
const OIL_FILTER_MONITORING_FIRST = 701800170;
const SHUT_DOWN_FIRST = 701800109;
const FUEL_LEAK_DET_FAULT_ALERT = '281800072';
const ABNORM_BLEED_CONFIG_ALERT = '211800056';

const alertId = (first: number, engine: number): string => (first + engine - 1).toString();

const engineIs = (engine: number): string => `Engine ${engine} is the ${ENGINE_POSITIONS[engine - 1]} engine.`;

/** What the shut-down engine adds to the STATUS page: the reverser and the BTV only for the engines 2 and 3 */
const engineOutStatus = (engine: number): string =>
  `GEN ${engine} and ENG ${engine} BLEED are listed as inoperative in all phases` +
  (engine === 2 || engine === 3
    ? `, and ENG ${engine} REVERSER and BTV for approach and landing (BTV cannot be armed)`
    : '') +
  '; with the APU off, CAT 3 DUAL for approach and landing and CAT 3 SINGLE ONLY as information; among others.';

const shutDownEffect = (engine: number, line: string): FailureDetail['effects'][number] => ({
  where: 'E/WD',
  text:
    `If the crew follows the ${line} and sets the ENG ${engine} MASTER OFF, ENG ${engine} SHUT DOWN appears, ` +
    `${CAUTION}; ${SHUT_DOWN_TIMING}. On the STATUS page: ${engineOutStatus(engine)}`,
});

const fuelLeakDetFaultEffect: FailureDetail['effects'][number] = { where: 'E/WD', text: FUEL_LEAK_DET_FAULT_TEXT };

const abnormBleedConfigEffect = (engine: number): FailureDetail['effects'][number] => ({
  where: 'E/WD',
  text: abnormBleedConfigText(engine),
});

/** The alerts that follow the ENG MASTER OFF line of a procedure */
const shutDownAlerts = (engine: number): string[] => [
  alertId(SHUT_DOWN_FIRST, engine),
  ABNORM_BLEED_CONFIG_ALERT,
  FUEL_LEAK_DET_FAULT_ALERT,
];

// ---------------------------------------------------------------------------------------------------------------------
// Oil leak
// ---------------------------------------------------------------------------------------------------------------------

const oilLeakDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${OIL_SYSTEM_DESCRIPTION} A leak loses oil overboard; once the system is nearly empty the feed pump can no longer ` +
    `keep the oil pressure. ${engineIs(engine)}`,
  impact: [
    `While engine ${engine} runs (core speed above about 10 %), its oil system loses 2 qt per minute; the tank ` +
      'quantity shown falls by about 1.6 qt per minute. The loss stops once the engine is shut down.',
    'An engine holds 17 to 20 qt: after about 8 to 10 minutes of running the oil pressure falls to zero.',
    'The engine itself keeps running and gives its thrust even without oil pressure: no engine damage is simulated.',
  ],
  alertIds: [alertId(OIL_PRESS_LO_FIRST, engine), ...shutDownAlerts(engine)],
  effects: [
    {
      where: 'SD ENG',
      text:
        `The oil quantity of engine ${engine} falls; below 1.2 qt its needle and value pulse green (not at take-off ` +
        'or go-around thrust, in reverse or in alpha floor). Then the oil pressure falls, and its needle and value turn ' +
        'red at or below 25 PSI.',
    },
    {
      where: 'E/WD',
      text:
        `With the engine running and its ENG MASTER ON, ENG ${engine} OIL PRESS LO appears below 25 PSI, ${WARNING}; ` +
        `${OIL_PRESS_LO_PHASES}. Its lines: THR LEVER ${engine} IDLE and ENG ${engine} MASTER OFF. The ENG page ` +
        'comes up with it, and an amber box surrounds the engine gauges while the pressure is at or below 25 PSI.',
    },
    shutDownEffect(engine, 'procedure'),
    abnormBleedConfigEffect(engine),
    fuelLeakDetFaultEffect,
  ],
  notSimulated: [
    'In the real aircraft an engine running without oil pressure is damaged; here it keeps running normally.',
  ],
  logbook: { required: true, reason: 'oil quantity lost, oil pressure low warning' },
  clearing:
    `${MAINTENANCE_ONLY} The leak stops, but the oil already lost is not refilled until the aircraft is loaded again, ` +
    'and an ENG MASTER the crew set OFF stays OFF.',
});

const OilLeakFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1OilLeak, A380Failure.Eng2OilLeak, A380Failure.Eng3OilLeak, A380Failure.Eng4OilLeak],
  detail: oilLeakDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// Oil filter clog
// ---------------------------------------------------------------------------------------------------------------------

const oilFilterClogDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${OIL_FILTERS_DESCRIPTION} The FADEC monitors the pressure loss across the filters and reports a clogged filter. ` +
    engineIs(engine),
  impact: [
    `The oil filter of engine ${engine} is reported clogged. The oil pressure, quantity and temperature stay normal.`,
    'The report is only for crew awareness: it has no procedure line and no STATUS line.',
  ],
  alertIds: [alertId(OIL_FILTER_CLOGGED_FIRST, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `With the engine running and its ENG MASTER ON, ENG ${engine} OIL FILTER CLOGGED appears, ${ADVISORY}, with ` +
        `no line; ${OIL_FILTER_CLOGGED_PHASES}. It goes out when the engine stops. While the engine runs an amber box ` +
        'surrounds its gauges.',
    },
    {
      where: 'SD ENG',
      text: `${SD_ENG_CALL_UP} An amber CLOGGED shows below the oil pressure of engine ${engine} while the engine runs.`,
    },
  ],
  notSimulated: [
    'In the real aircraft a clogged feed line filter, which has no bypass, can reduce the oil pressure down to ENG OIL ' +
      'PRESS LO; here the oil pressure is not affected.',
  ],
  logbook: { required: true, reason: `engine ${engine} oil filter clogged` },
  clearing: MAINTENANCE_ONLY,
});

const OilFilterClogFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1OilFilterClog,
    A380Failure.Eng2OilFilterClog,
    A380Failure.Eng3OilFilterClog,
    A380Failure.Eng4OilFilterClog,
  ],
  detail: oilFilterClogDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// Oil overheat
// ---------------------------------------------------------------------------------------------------------------------

const oilOverheatDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${OIL_SYSTEM_DESCRIPTION} With the cooling lost the oil temperature rises with the engine thrust. ` +
    engineIs(engine),
  impact: [
    `The oil of engine ${engine} heads towards about 170 °C at idle and about 230 °C at full thrust, over a few minutes.`,
    'At cruise thrust it passes 196 °C after about 2 minutes; reducing the thrust brings it down, below 196 °C at idle ' +
      'within about 1 to 2 minutes.',
    'The engine keeps its thrust: no engine damage is simulated.',
  ],
  alertIds: [alertId(OIL_TEMP_HI_FIRST, engine), ...shutDownAlerts(engine)],
  effects: [
    {
      where: 'SD ENG',
      text: `The oil temperature of engine ${engine} pulses green above 163 °C and turns amber above 177 °C.`,
    },
    {
      where: 'E/WD',
      text: 'While the oil temperature is above 177 °C and the engine runs, an amber box surrounds the engine gauges.',
    },
    {
      where: 'E/WD',
      text:
        `With the engine running and its ENG MASTER ON, ENG ${engine} OIL TEMP HI appears above 196 °C, ${CAUTION}; ` +
        `${OIL_TEMP_HI_PHASES}. Its lines: THR LEVER ${engine} REDUCE BELOW OIL TEMP LIM, then IF HI TEMP PERSISTS: ` +
        `ENG ${engine} MASTER OFF. The ENG page comes up with it. It goes out once the oil is back below 196 °C.`,
    },
    shutDownEffect(engine, 'last line'),
    abnormBleedConfigEffect(engine),
    fuelLeakDetFaultEffect,
  ],
  logbook: { required: true, reason: `engine ${engine} oil temperature high caution` },
  clearing:
    `${MAINTENANCE_ONLY} The oil cools back to its normal temperature within a few minutes, and the alert stays until ` +
    'it is below 196 °C; an ENG MASTER the crew set OFF stays OFF.',
});

const OilOverheatFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1OilOverheat,
    A380Failure.Eng2OilOverheat,
    A380Failure.Eng3OilOverheat,
    A380Failure.Eng4OilOverheat,
  ],
  detail: oilOverheatDetail,
};

// ---------------------------------------------------------------------------------------------------------------------
// Oil chip, oil filter bypass open (contamination), oil filter monitoring: alerts only
// ---------------------------------------------------------------------------------------------------------------------

const oilChipDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${OIL_SYSTEM_DESCRIPTION} A chip detector in the oil system collects metal particles and gives an indication of ` +
    `the internal condition of the engine. ${engineIs(engine)}`,
  impact: [
    `Metal particles are reported in the oil of engine ${engine}. The simulation gives the engine no effect.`,
    'The report is only an advisory, shown once the flight is over; no engine page indication and no STATUS line follow.',
  ],
  alertIds: [alertId(OIL_CHIP_FIRST, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} OIL CHIP DETECTED, ${ADVISORY}, with no line and no SD page, whether or not the engine runs; ` +
        `${SHOWN_ONLY_AFTER_LANDING}.`,
    },
  ],
  logbook: { required: true, reason: `engine ${engine} oil chip detected advisory` },
  clearing: MAINTENANCE_ONLY,
});

const OilChipFamily: FailureDetailFamily = {
  ids: [A380Failure.Eng1OilChip, A380Failure.Eng2OilChip, A380Failure.Eng3OilChip, A380Failure.Eng4OilChip],
  detail: oilChipDetail,
};

const oilSystemContaminationDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${OIL_FILTERS_DESCRIPTION} An open bypass valve means the return line filter is clogged and unfiltered oil can ` +
    `contaminate the oil system. ${engineIs(engine)}`,
  impact: [
    `The return line filter bypass of engine ${engine} is reported open. The simulation gives the engine no effect: ` +
      'it runs normally.',
    'The report is a caution with the engine page, with no procedure line and no STATUS line.',
  ],
  alertIds: [alertId(OIL_SYS_CONTAMINATION_FIRST, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} OIL SYS CONTAMINATION, ${CAUTION}, with no line, whether or not the engine runs; ` +
        `${NOT_SHOWN_TAKE_OFF_AND_LANDING}.`,
    },
    {
      where: 'SD ENG',
      text: `${SD_ENG_CALL_UP} Nothing else changes on the page for engine ${engine}.`,
    },
  ],
  notSimulated: [
    'In the real aircraft the unfiltered oil can contaminate the engine oil system; here the engine is not affected.',
  ],
  logbook: { required: true, reason: `engine ${engine} oil system contamination caution` },
  clearing: MAINTENANCE_ONLY,
});

const OilSystemContaminationFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1OilSystemContamination,
    A380Failure.Eng2OilSystemContamination,
    A380Failure.Eng3OilSystemContamination,
    A380Failure.Eng4OilSystemContamination,
  ],
  detail: oilSystemContaminationDetail,
};

const oilFilterMonitoringDetail = (engine: number): FailureDetail => ({
  whatItIs:
    `${OIL_FILTERS_DESCRIPTION} The oil filter monitoring watches the pressure loss across the filters to detect a ` +
    `clog; when it fails, the filters are no longer watched. ${engineIs(engine)}`,
  impact: [
    `The oil filter monitoring of engine ${engine} is lost. The simulation gives the engine no effect.`,
    'The report is only an advisory, shown once the flight is over; no engine page indication and no STATUS line follow.',
  ],
  alertIds: [alertId(OIL_FILTER_MONITORING_FIRST, engine)],
  effects: [
    {
      where: 'E/WD',
      text:
        `ENG ${engine} OIL FILTER MONITORING FAULT, ${ADVISORY}, with no line and no SD page, whether or not the ` +
        `engine runs; ${SHOWN_ONLY_AFTER_LANDING}.`,
    },
  ],
  notSimulated: [
    'The real alert calls up the ENG page; here it calls up no page.',
    'With the monitoring lost, a clogged oil filter would not be detected in the real aircraft; here an oil filter ' +
      'clog failure is still reported.',
  ],
  logbook: { required: true, reason: `engine ${engine} oil filter monitoring fault advisory` },
  clearing: MAINTENANCE_ONLY,
});

const OilFilterMonitoringFamily: FailureDetailFamily = {
  ids: [
    A380Failure.Eng1OilFilterMonitoring,
    A380Failure.Eng2OilFilterMonitoring,
    A380Failure.Eng3OilFilterMonitoring,
    A380Failure.Eng4OilFilterMonitoring,
  ],
  detail: oilFilterMonitoringDetail,
};

export const Ata79OilFamilies: FailureDetailFamily[] = [
  OilLeakFamily,
  OilFilterClogFamily,
  OilOverheatFamily,
  OilChipFamily,
  OilSystemContaminationFamily,
  OilFilterMonitoringFamily,
];
