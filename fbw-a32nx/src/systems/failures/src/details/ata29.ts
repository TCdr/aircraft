// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** Flight phases 3, 4, 5, 7 and 8, the inhibition of the reservoir, pump overheat and PTU alerts */
const NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING =
  'not shown from take-off power set to 1,500 ft (or 2 min after lift-off), nor from 800 ft on approach through the landing roll above 80 kt';

/** Flight phases 3, 4, 7 and 8, plus the first 15 s of phase 5, held back by the monitor */
const GREEN_YELLOW_LOW_LEVEL_INHIBITION =
  'not shown from take-off power set until lift-off, nor from 800 ft on approach through the landing roll above ' +
  '80 kt; in the first 15 s after lift-off it is held back too';

/** Every HYD alert here is an amber caution that calls the HYD page */
const AMBER_CAUTION_AND_HYD_PAGE =
  'an amber caution with master caution and a single chime, and the HYD page is called';

const SYSTEM_NAMES = ['green', 'blue', 'yellow'] as const;
const SYSTEM_LETTERS = ['G', 'B', 'Y'] as const;

/** The ENG pump pb of the green and yellow systems, the blue electric pump pb */
const PUMP_PB_NAMES = ['ENG 1 PUMP', 'BLUE ELEC PUMP', 'ENG 2 PUMP'] as const;

const RESERVOIR_LOW_LEVEL_ALERTS = ['2900111', '2900110', '2900112'] as const;
const RESERVOIR_LOW_AIR_PRESSURE_ALERTS = ['2900108', '2900107', '2900109'] as const;
const RESERVOIR_OVERHEAT_ALERTS = ['2900128', '2900126', '2900127'] as const;

const WHAT_A_RESERVOIR_IS =
  'Each of the three hydraulic systems (green, blue, yellow) has a reservoir that feeds its pumps. Bleed air from ' +
  'engine 1 pressurises the reservoirs so the pumps do not starve. Switches in each reservoir sense a low fluid ' +
  'level, a low air pressure and an overheat.';

/** The alert shown for a low level of the reservoir, with its flight-phase inhibition */
function lowLevelAlertEffect(systemIndex: number): { where: string; text: string } {
  const inhibition = systemIndex === 1 ? NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING : GREEN_YELLOW_LOW_LEVEL_INHIBITION;
  return {
    where: 'E/WD',
    text: `HYD ${SYSTEM_LETTERS[systemIndex]} RSVR LO LVL, ${AMBER_CAUTION_AND_HYD_PAGE}, ${inhibition}.`,
  };
}

/** The pb FAULT lights that follow a reservoir fault, which differ per system */
function reservoirFaultLightEffect(systemIndex: number, whichFault: string): { where: string; text: string } {
  if (systemIndex === 1) {
    return {
      where: 'Overhead HYD panel',
      text: `The BLUE ELEC PUMP FAULT light comes on with the ${whichFault}, unless the pump pb is OFF.`,
    };
  }
  return {
    where: 'Overhead HYD panel',
    text:
      `The ${PUMP_PB_NAMES[systemIndex]} FAULT light comes on with the ${whichFault}, unless that pump pb is OFF. ` +
      'The PTU FAULT light comes on too while the PTU pb is AUTO.',
  };
}

/** Yellow only: the electric pump alert is not hidden by a yellow reservoir alert */
const YELLOW_ELEC_PUMP_LO_PR_NOTE =
  'HYD Y ELEC PUMP LO PR is not hidden: with the YELLOW ELEC PUMP pb ON, or a cargo door running the pump, it also shows, with its FAULT light, and may show with take-off power set below 80 kt.';

const ReservoirLeakFamily: FailureDetailFamily = {
  ids: [A320Failure.GreenReservoirLeak, A320Failure.BlueReservoirLeak, A320Failure.YellowReservoirLeak],
  detail: (number): FailureDetail => {
    const index = number - 1;
    const system = SYSTEM_NAMES[index];
    const isBlue = index === 1;
    const otherSideAlerts = isBlue ? [] : ['2900116', index === 0 ? '2900127' : '2900128'];
    return {
      whatItIs: WHAT_A_RESERVOIR_IS,
      impact: [
        `The ${system} reservoir loses fluid continuously until it is empty, in well under a minute.`,
        `The ${system} pumps run dry, so the ${system} system loses its pressure and everything it powers.`,
        ...(isBlue
          ? []
          : ['With the PTU running, the loss heats the fluid of the other system and can overheat its reservoir.']),
      ],
      alertIds: [RESERVOIR_LOW_LEVEL_ALERTS[index], ...(index === 2 ? ['2900103'] : []), ...otherSideAlerts],
      effects: [
        {
          where: 'SD HYD',
          text: `The ${system} reservoir level bar falls and turns amber. The ${system} pressure then drops below 1,450 psi and turns amber.`,
        },
        {
          ...lowLevelAlertEffect(index),
          text: `${lowLevelAlertEffect(index).text} It hides the ${system} pump and system low pressure alerts.${index === 2 ? ` ${YELLOW_ELEC_PUMP_LO_PR_NOTE}` : ''}`,
        },
        ...(isBlue
          ? []
          : [
              {
                where: 'E/WD',
                text: 'In flight with the PTU pb AUTO: PTU FAULT once the level is low and a green or yellow pressure is low for 5 s. The other reservoir may later show RSVR OVHT.',
              },
            ]),
        reservoirFaultLightEffect(index, 'low level'),
      ],
      logbook: { required: true, reason: 'ECAM caution, fault light and a hydraulic system lost' },
      clearing: `${MAINTENANCE_ONLY} Restore stops the leak.`,
    };
  },
};

const ReservoirAirLeakFamily: FailureDetailFamily = {
  ids: [A320Failure.GreenReservoirAirLeak, A320Failure.BlueReservoirAirLeak, A320Failure.YellowReservoirAirLeak],
  detail: (number): FailureDetail => {
    const index = number - 1;
    const system = SYSTEM_NAMES[index];
    return {
      whatItIs: WHAT_A_RESERVOIR_IS,
      impact: [
        `The air pressure in the ${system} reservoir bleeds away through a leak and falls below the switch threshold.`,
        `The ${system} pumps cavitate on the unpressurised fluid, so their output falls and the pressure can fluctuate or drop.`,
        'A pump that gives no pressure leads to a low system pressure.',
      ],
      alertIds: [RESERVOIR_LOW_AIR_PRESSURE_ALERTS[index], ...(index === 2 ? ['2900103'] : [])],
      effects: [
        {
          where: 'SD HYD',
          text: `LO AIR shows in amber at the ${system} reservoir. If the pumps lose pressure, the ${system} pressure turns amber too.`,
        },
        {
          where: 'E/WD',
          text: `HYD ${SYSTEM_LETTERS[index]} RSVR LO AIR PR, ${AMBER_CAUTION_AND_HYD_PAGE}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.${index === 2 ? ` ${YELLOW_ELEC_PUMP_LO_PR_NOTE}` : ''}`,
        },
        reservoirFaultLightEffect(index, 'low air pressure'),
      ],
      logbook: { required: true, reason: 'ECAM caution, fault light and degraded pump output' },
      clearing: `${MAINTENANCE_ONLY} Restore stops the leak and the bleed air refills the reservoir.`,
    };
  },
};

const ReservoirReturnLeakFamily: FailureDetailFamily = {
  ids: [
    A320Failure.GreenReservoirReturnLeak,
    A320Failure.BlueReservoirReturnLeak,
    A320Failure.YellowReservoirReturnLeak,
  ],
  detail: (number): FailureDetail => {
    const index = number - 1;
    const system = SYSTEM_NAMES[index];
    return {
      whatItIs:
        'Fluid that has driven an actuator flows back to the reservoir through return lines. A pipe leak in the ' +
        'return line loses part of that fluid on its way home, so the reservoir slowly empties with use.',
      impact: [
        `A tenth of the fluid returning to the ${system} reservoir is lost, so the level falls only while the system works.`,
        `The more the ${system} users move (flight controls, gear, brakes), the faster the level falls.`,
        'In the end the low level alert and a lost system follow, as for a leak in the reservoir.',
      ],
      alertIds: [RESERVOIR_LOW_LEVEL_ALERTS[index], ...(index === 2 ? ['2900103'] : [])],
      effects: [
        { where: 'SD HYD', text: `The ${system} reservoir level bar falls slowly, and turns amber at the low level.` },
        {
          ...lowLevelAlertEffect(index),
          text: `${lowLevelAlertEffect(index).text}${index === 2 ? ` ${YELLOW_ELEC_PUMP_LO_PR_NOTE}` : ''}`,
        },
        reservoirFaultLightEffect(index, 'low level'),
      ],
      logbook: { required: true, reason: 'falling reservoir level, ECAM caution once low' },
      clearing: `${MAINTENANCE_ONLY} Restore stops the leak.`,
    };
  },
};

const EnginePumpOverheatFamily: FailureDetailFamily = {
  ids: [A320Failure.GreenEdpOverheat, A320Failure.YellowEdpOverheat],
  detail: (number): FailureDetail => {
    const system = number === 1 ? 'green' : 'yellow';
    const letter = number === 1 ? 'G' : 'Y';
    const engine = number;
    const reservoirAlert = number === 1 ? '2900128' : '2900127';
    const pumpLowPressureAlerts = number === 1 ? ['2900105', '2900114'] : ['2900106', '2900115'];
    return {
      whatItIs:
        `The engine-driven pump of the ${system} system is driven by the accessory gearbox of engine ${engine}. ` +
        'It delivers the system pressure while the engine turns and the pump pb is ON. Its case drain returns ' +
        'warm fluid to the reservoir.',
      impact: [
        `The pump of engine ${engine} overheats about 30 s after the engine turns it above 200 rpm, whatever its pb.`,
        `The hot pump overheats the fluid, so the ${system} reservoir overheats within a couple of minutes.`,
        `After about 2 min of overheat the pump is ruined and the ${system} pressure is lost unless the PTU supplies it.`,
        'Setting the pump pb OFF does not stop the heating: the pump keeps turning with the engine.',
      ],
      alertIds: [reservoirAlert, ...pumpLowPressureAlerts],
      effects: [
        {
          where: 'E/WD',
          text: `HYD ${letter} RSVR OVHT once the reservoir overheats, ${AMBER_CAUTION_AND_HYD_PAGE}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
        },
        {
          where: 'SD HYD',
          text: `OVHT shows in amber at the ${system} reservoir. Once the pump is ruined, the ${system} pressure drops and turns amber.`,
        },
        {
          where: 'Overhead HYD panel',
          text: `The ENG ${engine} PUMP FAULT light stays on during the overheat, even with the pb OFF. The PTU FAULT light comes on too.`,
        },
        {
          where: 'E/WD',
          text: `If the ruined pump loses pressure before the reservoir overheats: HYD ${letter} ENG ${engine} PUMP LO PR and ${letter} SYS LO PR. A ${system} reservoir alert hides them once it is up.`,
        },
      ],
      logbook: { required: true, reason: 'ECAM caution, fault light and a pump lost' },
      clearing:
        'Maintenance only: use Restore. The pump keeps heating while the engine turns it, pb OFF or not. After Restore it cools with a time constant of 2 min.',
    };
  },
};

const ElecPumpOverheatFamily: FailureDetailFamily = {
  ids: [A320Failure.BlueEpumpOverheat, A320Failure.YellowEpumpOverheat],
  detail: (number): FailureDetail => {
    const isBlue = number === 1;
    const system = isBlue ? 'blue' : 'yellow';
    const letter = isBlue ? 'B' : 'Y';
    const pumpPb = isBlue ? 'BLUE ELEC PUMP' : 'YELLOW ELEC PUMP';
    return {
      whatItIs: isBlue
        ? 'The blue system has no engine pump: an electric pump powers it. It runs in flight, and on the ground once ' +
          'an engine runs or the override is pressed. A temperature sensor on the pump watches for overheat.'
        : 'The yellow electric pump pressurises the yellow system without an engine, for the cargo doors and for ' +
          'ground use. It runs when its pb is ON or a cargo door needs it. A temperature sensor on the pump watches ' +
          'for overheat.',
      impact: [
        `The ${system} electric pump overheats about 30 s after it starts turning, and its drag grows.`,
        `The hot pump heats the ${system} fluid, so the ${system} reservoir can overheat too.`,
        `After about 2 min of overheat the pump is ruined and the ${system} system loses its pressure.`,
        'No effect while the pump does not run.',
      ],
      alertIds: [isBlue ? '2900102' : '2900104', RESERVOIR_OVERHEAT_ALERTS[isBlue ? 1 : 2]],
      effects: [
        {
          where: 'E/WD',
          text: `HYD ${letter} ELEC PUMP OVHT at once, ${AMBER_CAUTION_AND_HYD_PAGE}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. It takes the place of the pump low pressure and system low pressure alerts.`,
        },
        { where: 'SD HYD', text: `OVHT shows in amber at the ${system} electric pump.` },
        {
          where: 'Overhead HYD panel',
          text: `The ${pumpPb} FAULT light comes on and stays on during the overheat.`,
        },
        {
          where: 'E/WD',
          text: `Later, if the reservoir overheats too: HYD ${letter} RSVR OVHT, with the same severity.`,
        },
      ],
      logbook: { required: true, reason: 'ECAM caution, fault light and a pump lost' },
      clearing: `Selecting the pump OFF stops the heating, and the overheat then cools with a time constant of 2 min. It overheats again after the pump runs: use Restore.`,
    };
  },
};

export const Ata29Entries: Record<number, FailureDetail> = {};

export const Ata29Families: FailureDetailFamily[] = [
  ReservoirLeakFamily,
  ReservoirAirLeakFamily,
  ReservoirReturnLeakFamily,
  EnginePumpOverheatFamily,
  ElecPumpOverheatFamily,
];
