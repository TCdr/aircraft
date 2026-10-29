// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** Flight phases 3, 4, 5, 7 and 8: LGCIU 1(2) FAULT */
const NOT_SHOWN_FROM_TAKE_OFF_POWER =
  'not shown from take-off power set to 1,500 ft (or 2 min), nor from 800 ft on approach to 80 kt on landing';

/** Flight phases 4, 5, 7 and 8: LGCIU 1+2 FAULT */
const NOT_SHOWN_ON_TAKE_OFF_AND_LANDING =
  'not shown on take-off from 80 kt to 1,500 ft (or 2 min), nor from 800 ft on approach to 80 kt on landing';

/** Flight phases 3, 4, 5 and 8: GEAR NOT DOWNLOCKED */
const GEAR_NOT_DOWNLOCKED_SHOWN =
  'not shown from take-off power set to 1,500 ft (or 2 min), nor on the landing roll above 80 kt';

/** Flight phases 3, 4, 7, 8, 9 and 10: GEAR NOT UPLOCKED */
const GEAR_NOT_UPLOCKED_SHOWN =
  'not shown on the take-off roll, nor from 800 ft on approach until 5 min after engine shutdown';

/** Flight phases 1, 3, 4, 5, 8, 9 and 10 are inhibited: L/G DOORS NOT CLOSED */
const DOORS_NOT_CLOSED_SHOWN =
  'shown only during engine start and taxi, and in flight from 1,500 ft (or 2 min) down to touchdown';

const LGCIU_DESCRIPTION =
  'The two landing gear control and interface units (LGCIUs) read the position sensors of the gear legs and doors. ' +
  'One of them sequences each gear cycle and the other takes over at the next retraction. Both send the gear data ' +
  'to the SD WHEEL page, the warning computers and other systems. LGCIU 1 is supplied by the DC ESS bus, LGCIU 2 by ' +
  'the DC GND/FLT bus.';

const SENSOR_DESCRIPTION =
  'Each gear leg and each gear door carries proximity sensors that tell the LGCIUs where it is: locked up or closed, ' +
  'locked down or fully open. Every position has one sensor for each LGCIU, so each LGCIU reads the gear on its own.';

const IN_CONTROL =
  'The LGCIU in control is LGCIU 1 at the start; control changes to the other unit at every gear-up selection.';

const GEAR_NOT_DOWN_EFFECT = {
  where: 'E/WD',
  text:
    'GEAR NOT DOWN, a red warning with master warning and continuous chime, below 750 ft radio height with the flaps or slats extended ' +
    'for landing, or with both engines near idle. Not shown from take-off power set to 1,500 ft (or 2 min).',
};

const LATCHED_FAULT = 'It stays on after control passes to the other unit.';

const GEAR_NOT_DOWNLOCKED_EFFECT = {
  where: 'E/WD',
  text: `Gear down selected: GEAR NOT DOWNLOCKED, a red warning with master warning and continuous chime, 30 s later; ${GEAR_NOT_DOWNLOCKED_SHOWN}.`,
};

const GEAR_NOT_UPLOCKED_EFFECT = {
  where: 'E/WD',
  text: `Gear up selected: GEAR NOT UPLOCKED, a caution with master caution and single chime, 30 s later; ${GEAR_NOT_UPLOCKED_SHOWN}.`,
};

const DOORS_STAY_OPEN_EFFECT = {
  where: 'E/WD',
  text: `L/G DOORS NOT CLOSED, a caution with master caution and single chime, 30 s after the doors stay open; ${DOORS_NOT_CLOSED_SHOWN}.`,
};

const FAULT_OF_CONTROLLING_UNIT_EFFECT = {
  where: 'E/WD',
  text: `LGCIU 1 FAULT or LGCIU 2 FAULT for the unit that was in control, crew awareness only, ${NOT_SHOWN_FROM_TAKE_OFF_POWER}. ${LATCHED_FAULT}`,
};

/** LGCIU n FAULT: crew awareness, flight phases 3, 4, 5, 7 and 8 (LGCIU 1 adds the GPWS SYS OFF line) */
function lgciuFaultEffect(lgciu: 1 | 2, qualifier: string, latched = false) {
  return {
    where: 'E/WD',
    text:
      `${qualifier}LGCIU ${lgciu} FAULT, crew awareness only (no master caution, no chime), ${NOT_SHOWN_FROM_TAKE_OFF_POWER}.` +
      (lgciu === 1 ? ' The GPWS SYS OFF line follows.' : '') +
      (latched ? ` ${LATCHED_FAULT}` : ''),
  };
}

const LATCHED_QUALIFIER = 'Once this LGCIU has controlled a gear cycle: ';

const LGCIU_FAULT_ALERTS = ['3200180', '3200190'] as const;

const LgciuPowerSupplyFamily: FailureDetailFamily = {
  ids: [A320Failure.LgciuPowerSupply1, A320Failure.LgciuPowerSupply2],
  detail: (number): FailureDetail => {
    const lgciu = number === 1 ? 1 : 2;
    return {
      whatItIs: LGCIU_DESCRIPTION,
      impact: [
        `LGCIU ${lgciu} loses its power: all its outputs go invalid and it stops reading the gear sensors.`,
        'If it was in control, the other LGCIU takes over the gear sequence, so gear and doors keep working.',
        lgciu === 1
          ? 'The terrain computer takes its gear-down signal from LGCIU 1 only, so it no longer sees the gear down.'
          : 'The brake fans run only with the left main gear sensed down by LGCIU 2, so they stop.',
        'With both LGCIUs lost the gear and doors stay where they are, whatever the lever says.',
      ],
      alertIds: [LGCIU_FAULT_ALERTS[lgciu - 1], '3200195'],
      effects: [
        lgciuFaultEffect(lgciu, ''),
        {
          where: 'E/WD',
          text:
            `Both LGCIUs lost: LGCIU 1+2 FAULT replaces it, a caution with master caution and single chime, ${NOT_SHOWN_ON_TAKE_OFF_AND_LANDING}. ` +
            'The L/G GRVTY PROC and GPWS SYS OFF lines follow, and the SD WHEEL page comes up.',
        },
        {
          where: 'SD WHEEL',
          text: `The half of each gear symbol that belongs to LGCIU ${lgciu} shows amber XX. With both LGCIUs lost the door symbols show XX too.`,
        },
        lgciu === 1
          ? {
              where: 'Landing gear panel (L/G lever, LDG GEAR lights, BRK FAN, A/SKID & N/W STRG, AUTO BRK)',
              text: 'The green and red LDG GEAR lights go out: they follow LGCIU 1 only.',
            }
          : {
              where: 'SD STATUS',
              text: 'ENG 2 APPR IDLE ONLY and INOP SYS LGCIU 2, REVERSER 2 are listed.',
            },
      ],
      notSimulated: [`Reverser ${lgciu} is listed as inoperative on the status page, but the reverser keeps working.`],
      logbook: { required: true, reason: 'ECAM alert and a lost LGCIU' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const LgciuInternalErrorFamily: FailureDetailFamily = {
  ids: [A320Failure.LgciuInternalError1, A320Failure.LgciuInternalError2],
  detail: (number): FailureDetail => {
    const lgciu = number === 1 ? 1 : 2;
    return {
      whatItIs: LGCIU_DESCRIPTION,
      impact: [
        `LGCIU ${lgciu} flags an internal error and drops out of control. It stays powered and still sends valid gear data.`,
        'If it was in control, the other LGCIU takes over at once. A unit in error cannot take control back.',
        'With both LGCIUs in error, the gear and door selector valve closes: the gear and doors stop moving.',
      ],
      alertIds: [LGCIU_FAULT_ALERTS[lgciu - 1], '3200195'],
      effects: [
        lgciuFaultEffect(lgciu, 'The unit in error raises '),
        {
          where: 'E/WD',
          text:
            `Both LGCIUs in error: LGCIU 1+2 FAULT replaces it, a caution with master caution and single chime, ${NOT_SHOWN_ON_TAKE_OFF_AND_LANDING}. ` +
            'The L/G GRVTY PROC and GPWS SYS OFF lines follow, and the SD WHEEL page comes up.',
        },
        {
          where: 'SD STATUS',
          text: `ENG ${lgciu} APPR IDLE ONLY and INOP SYS LGCIU ${lgciu}, REVERSER ${lgciu} are listed.`,
        },
      ],
      notSimulated: [`Reverser ${lgciu} is listed as inoperative on the status page, but the reverser keeps working.`],
      logbook: { required: true, reason: 'ECAM alert and a faulty LGCIU' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

// Family positions follow the ids: the sensor is wired to the LGCIU named in the failure name
const UPLOCK_SENSORS = [
  { gear: 'nose', lgciu: 1 },
  { gear: 'right main', lgciu: 1 },
  { gear: 'left main', lgciu: 2 },
] as const;

const DOWNLOCK_SENSORS = [
  { gear: 'nose', lgciu: 2 },
  { gear: 'right main', lgciu: 2 },
  { gear: 'left main', lgciu: 1 },
] as const;

const DOOR_CLOSED_SENSORS = [
  { door: 'nose gear', lgciu: 1 },
  { door: 'right main gear', lgciu: 2 },
  { door: 'left main gear', lgciu: 2 },
] as const;

const DOOR_OPENED_SENSORS = [
  { door: 'nose gear', lgciu: 2 },
  { door: 'right main gear', lgciu: 1 },
  { door: 'left main gear', lgciu: 1 },
] as const;

const GearUplockSensorFamily: FailureDetailFamily = {
  ids: [
    A320Failure.GearProxSensorDamageGearUplockNose1,
    A320Failure.GearProxSensorDamageGearUplockRight1,
    A320Failure.GearProxSensorDamageGearUplockLeft2,
  ],
  detail: (number): FailureDetail => {
    const { gear, lgciu } = UPLOCK_SENSORS[number - 1];
    return {
      whatItIs: SENSOR_DESCRIPTION,
      impact: [
        `The ${gear} gear uplock sensor of LGCIU ${lgciu} stops detecting: that LGCIU reads the gear as not locked up.`,
        'The other LGCIU still reads it correctly. With the gear down nothing shows, as it is not locked up then.',
        'If this LGCIU controls a retraction, it never sees all gear up and locked: the retraction does not finish and the doors stay open.',
        IN_CONTROL,
      ],
      alertIds: ['3400180', '3200135', LGCIU_FAULT_ALERTS[lgciu - 1]],
      effects: [
        {
          where: 'SD WHEEL',
          text: `With the gear up, a red triangle shows for this gear on the LGCIU ${lgciu} half and L/G CTL shows in amber.`,
        },
        {
          where: 'E/WD',
          text: 'OVER SPEED VLE, a red warning with master warning and continuous chime, above 284 kt CAS with the gear up: the FWC reads the gear as not uplocked.',
        },
        DOORS_STAY_OPEN_EFFECT,
        lgciuFaultEffect(lgciu, LATCHED_QUALIFIER, true),
      ],
      logbook: { required: true, reason: 'ECAM alert and a degraded gear indication' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const GearDownlockSensorFamily: FailureDetailFamily = {
  ids: [
    A320Failure.GearProxSensorDamageGearDownlockNose2,
    A320Failure.GearProxSensorDamageGearDownlockRight2,
    A320Failure.GearProxSensorDamageGearDownlockLeft1,
  ],
  detail: (number): FailureDetail => {
    const { gear, lgciu } = DOWNLOCK_SENSORS[number - 1];
    return {
      whatItIs: SENSOR_DESCRIPTION,
      impact: [
        `The ${gear} gear downlock sensor of LGCIU ${lgciu} stops detecting: that LGCIU reads the gear as not locked down.`,
        'The other LGCIU still reads it correctly, so GEAR NOT DOWNLOCKED does not show: it needs both LGCIUs.',
        'If this LGCIU controls an extension, it never sees all gear down and locked: it faults and the gear doors stay open.',
        IN_CONTROL,
      ],
      alertIds: ['3200200', '3200135', LGCIU_FAULT_ALERTS[lgciu - 1]],
      effects: [
        {
          where: 'SD WHEEL',
          text: `With the gear down, this gear is red instead of green on the LGCIU ${lgciu} half and L/G CTL shows in amber.`,
        },
        {
          where: 'E/WD',
          text:
            'L/G SYS DISAGREE after 1 s, a caution with master caution and single chime, shown only on the ground before take-off power and after landing below 80 kt. ' +
            'The LANDING MEMO shows LDG GEAR......DN instead of LDG GEAR DN while a LGCIU reads a gear not downlocked.',
        },
        lgciuFaultEffect(lgciu, LATCHED_QUALIFIER, true),
        DOORS_STAY_OPEN_EFFECT,
      ],
      logbook: { required: true, reason: 'ECAM alert and a degraded gear indication' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const DoorClosedSensorFamily: FailureDetailFamily = {
  ids: [
    A320Failure.GearProxSensorDamageGearDoorClosedNose1,
    A320Failure.GearProxSensorDamageGearDoorClosedRight2,
    A320Failure.GearProxSensorDamageGearDoorClosedLeft2,
  ],
  detail: (number): FailureDetail => {
    const { door, lgciu } = DOOR_CLOSED_SENSORS[number - 1];
    return {
      whatItIs: SENSOR_DESCRIPTION,
      impact: [
        `The ${door} door closed sensor of LGCIU ${lgciu} stops detecting: that LGCIU reads the door as not closed.`,
        'The other LGCIU still reads it correctly, so L/G DOORS NOT CLOSED does not show: it needs both LGCIUs.',
        'If this LGCIU is in control, it cannot accept a settled gear, up or down: it faults and keeps its outputs. The doors then close normally.',
        IN_CONTROL,
      ],
      alertIds: ['3400180', '3200135', LGCIU_FAULT_ALERTS[lgciu - 1]],
      effects: [
        {
          where: 'SD WHEEL',
          text: `The ${door} door is drawn amber and part open, though it is closed${door === 'nose gear' ? ' (both nose doors)' : ''}.`,
        },
        {
          where: 'E/WD',
          text: 'OVER SPEED VLE, a red warning with master warning and continuous chime, above 284 kt CAS: either LGCIU reporting a door not closed is enough.',
        },
        lgciuFaultEffect(lgciu, LATCHED_QUALIFIER, true),
      ],
      logbook: { required: true, reason: 'ECAM alert and a degraded door indication' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const DoorOpenedSensorFamily: FailureDetailFamily = {
  ids: [
    A320Failure.GearProxSensorDamageGearDoorOpenedNose2,
    A320Failure.GearProxSensorDamageGearDoorOpenedRight1,
    A320Failure.GearProxSensorDamageGearDoorOpenedLeft1,
  ],
  detail: (number): FailureDetail => {
    const { door, lgciu } = DOOR_OPENED_SENSORS[number - 1];
    return {
      whatItIs: SENSOR_DESCRIPTION,
      impact: [
        `The ${door} door fully open sensor of LGCIU ${lgciu} stops detecting: that LGCIU never sees the door fully open.`,
        'The other LGCIU still reads it correctly, and the SD WHEEL door symbol uses either one, so the drawing is right.',
        'If this LGCIU is in control, it waits for all doors fully open before moving the gear.',
        'An extension then does not start, and a retraction leaves the gear down with the doors open.',
        `After 30 s the unit faults and the next lever movement hands control to the other LGCIU. ${IN_CONTROL}`,
      ],
      alertIds: ['3200140', '3200150', '3200155', '3200135', '3200130', LGCIU_FAULT_ALERTS[lgciu - 1]],
      effects: [
        GEAR_NOT_DOWNLOCKED_EFFECT,
        GEAR_NOT_DOWN_EFFECT,
        GEAR_NOT_UPLOCKED_EFFECT,
        DOORS_STAY_OPEN_EFFECT,
        lgciuFaultEffect(lgciu, LATCHED_QUALIFIER, true),
        {
          where: 'SD WHEEL',
          text: 'The gear stays unmoved: a red triangle shows for each gear that is not locked and L/G CTL shows in amber.',
        },
      ],
      logbook: { required: true, reason: 'ECAM alert and a gear that does not move' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const JAMMED_GEARS = ['nose', 'left main', 'right main'] as const;

const GearJammedActuatorFamily: FailureDetailFamily = {
  ids: [
    A320Failure.GearActuatorJammedGearNose,
    A320Failure.GearActuatorJammedGearLeft,
    A320Failure.GearActuatorJammedGearRight,
  ],
  detail: (number): FailureDetail => {
    const gear = JAMMED_GEARS[number - 1];
    return {
      whatItIs:
        'Each gear leg is moved by a hydraulic actuator, held retracted by an uplock and held extended by a downlock. ' +
        'The LGCIU in control sequences the doors and the legs from the position sensors.',
      impact: [
        `The ${gear} gear actuator freezes at a random point of its travel and holds there until Restore.`,
        'It freezes at once if the leg sits within a fifth of its travel of that point, otherwise at the next gear movement.',
        'The LGCIUs never see the leg locked at its new position, so the gear sequence cannot finish.',
        'After 30 s the LGCIU in control faults.',
      ],
      alertIds: ['3200140', '3200150', '3200155', '3200130', '3200135', LGCIU_FAULT_ALERTS[0], LGCIU_FAULT_ALERTS[1]],
      effects: [
        GEAR_NOT_DOWNLOCKED_EFFECT,
        GEAR_NOT_DOWN_EFFECT,
        GEAR_NOT_UPLOCKED_EFFECT,
        {
          ...DOORS_STAY_OPEN_EFFECT,
          text: DOORS_STAY_OPEN_EFFECT.text.replace(
            'after the doors stay open',
            'after a gear-down selection leaves them open',
          ),
        },
        FAULT_OF_CONTROLLING_UNIT_EFFECT,
        {
          where: 'SD WHEEL',
          text: `The ${gear} gear shows a red triangle on both halves and L/G CTL shows in amber while it is not locked.`,
        },
      ],
      logbook: { required: true, reason: 'ECAM alert and a gear that does not lock' },
      clearing: 'Maintenance only: use Restore. Recycling the lever does not free the jam.',
    };
  },
};

const JAMMED_DOORS = ['nose gear', 'left main gear', 'right main gear'] as const;

const GearDoorJammedActuatorFamily: FailureDetailFamily = {
  ids: [
    A320Failure.GearActuatorJammedGearDoorNose,
    A320Failure.GearActuatorJammedGearDoorLeft,
    A320Failure.GearActuatorJammedGearDoorRight,
  ],
  detail: (number): FailureDetail => {
    const door = JAMMED_DOORS[number - 1];
    return {
      whatItIs:
        'Each gear door is moved by its own actuator and is held closed by a door uplock. The doors open before the legs ' +
        'move and close again once the legs are locked.',
      impact: [
        `The ${door} door actuator freezes at a random point of its travel and holds there until Restore.`,
        'It freezes at once if the door sits within a fifth of its travel of that point, otherwise at the next gear movement.',
        'The gear moves only once all doors are fully open: a gear-down selection leaves the gear up, a gear-up selection leaves it down.',
        'Only a door that froze fully open lets the gear move.',
        'After 30 s the LGCIU in control faults.',
      ],
      alertIds: ['3200140', '3200150', '3200155', '3200135', '3200130', LGCIU_FAULT_ALERTS[0], LGCIU_FAULT_ALERTS[1]],
      effects: [
        GEAR_NOT_DOWNLOCKED_EFFECT,
        GEAR_NOT_DOWN_EFFECT,
        GEAR_NOT_UPLOCKED_EFFECT,
        DOORS_STAY_OPEN_EFFECT,
        FAULT_OF_CONTROLLING_UNIT_EFFECT,
        {
          where: 'SD WHEEL',
          text: `The ${door} door is drawn amber and part open, and L/G CTL shows in amber while a gear is not locked.`,
        },
      ],
      logbook: { required: true, reason: 'ECAM alert and a gear that does not move' },
      clearing: 'Maintenance only: use Restore. Recycling the lever does not free the jam.',
    };
  },
};

const UplockStuckFamily: FailureDetailFamily = {
  ids: [
    A320Failure.GearUplockStuckLockedNose,
    A320Failure.GearUplockStuckLockedLeft,
    A320Failure.GearUplockStuckLockedRight,
  ],
  detail: (number): FailureDetail => {
    const gear = JAMMED_GEARS[number - 1];
    return {
      whatItIs:
        'A hook holds each gear leg in its bay when retracted and releases it hydraulically for the extension. ' +
        'A sensor on the hook tells both LGCIUs that the leg is locked up.',
      impact: [
        `Once the ${gear} gear has left its uplock, both LGCIUs keep reading it as locked up, whatever its position.`,
        'With the gear down, both LGCIUs then read this leg as locked up and locked down at once.',
        'The leg is still driven by the hydraulics as usual: only its position signals are wrong.',
      ],
      alertIds: ['3200510'],
      effects: [
        {
          where: 'E/WD',
          text: 'GEAR UPLOCK FAULT, a caution with master caution and single chime, once the gear is read down and uplocked at once. Not shown on the take-off roll above 80 kt. Its lines: L/G KEEP DOWN, speed and fuel limits.',
        },
        {
          where: 'SD STATUS',
          text: 'The same speed and fuel limits are listed, with INOP SYS L/G RETRACT.',
        },
        {
          where: 'Landing gear panel (L/G lever, LDG GEAR lights, BRK FAN, A/SKID & N/W STRG, AUTO BRK)',
          text: 'With the gear down, the red UNLK light and the green DOWN light of this gear are both on.',
        },
        {
          where: 'SD WHEEL',
          text: 'No triangle is drawn for this gear on either half of its symbol, as it is read as locked up.',
        },
      ],
      notSimulated: [
        'The real uplock would keep the leg in its bay so it could not extend; here the leg still extends and only the signal is wrong.',
      ],
      logbook: { required: true, reason: 'ECAM alert and false gear position indications' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

export const Ata32GearEntries: Record<number, FailureDetail> = {};

export const Ata32GearFamilies: FailureDetailFamily[] = [
  LgciuPowerSupplyFamily,
  LgciuInternalErrorFamily,
  GearUplockSensorFamily,
  GearDownlockSensorFamily,
  DoorClosedSensorFamily,
  DoorOpenedSensorFamily,
  GearJammedActuatorFamily,
  GearDoorJammedActuatorFamily,
  UplockStuckFamily,
];
