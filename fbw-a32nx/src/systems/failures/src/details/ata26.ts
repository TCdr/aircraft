// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** Flight phases 3, 4, 5, 7 and 8: the detection fault cautions and the smoke detection fault cautions */
const NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING =
  'not shown from take-off power set to 1,500 ft (or 2 min after lift-off), nor from 800 ft on approach through the landing roll above 80 kt';

/** Flight phases 4, 5, 7 and 8: the smoke warnings and the cargo bottle cautions */
const NOT_SHOWN_ABOVE_80_KT_AND_LOW_ALTITUDE =
  'not shown above 80 kt on the take-off roll, in the climb to 1,500 ft (or 2 min after lift-off), nor from 800 ft on approach through the landing roll above 80 kt';

/** Flight phases 3, 4, 5, 7 and 8 again, as a separate sentence for the long alert texts */
const AMBER_CAUTION = 'amber caution with the master caution and a single chime';

const ZONE_NAMES = ['ENG 1', 'ENG 2', 'APU'] as const;
const FIRE_ALERTS = ['2600010', '2600020', '2600030'] as const;
const DETECTION_FAULT_ALERTS = ['2600200', '2600230', '2600260'] as const;
const LOOP_A_FAULT_ALERTS = ['2600210', '2600240', '2600270'] as const;
const LOOP_B_FAULT_ALERTS = ['2600220', '2600250', '2600280'] as const;
const LOOP_A_STATUS_LINES = ['ENG 1 LOOP A', 'ENG 2 LOOP A', 'APU LOOP A'] as const;
const LOOP_B_STATUS_LINES = ['ENG 1 LOOP B', 'ENG 2 LOOP B', 'APU LOOP B'] as const;
const DETECTION_STATUS_LINES = ['FIRE DET 1', 'FIRE DET 2', 'APU FIRE DET'] as const;

const WHAT_THE_FIRE_DETECTION_IS =
  'Each engine and the APU has two fire detection loops, A and B, of heat sensing elements. A fire detection unit ' +
  '(FDU) reads both loops and gives the fire warning when both sense a fire, or when one senses it and the other is ' +
  'failed. It also gives the loop and detection fault cautions.';

const WHAT_THE_CARGO_SMOKE_DETECTION_IS =
  'Each cargo compartment has two smoke detectors on two channels of the smoke detection control unit (SDCU). The ' +
  'SMOKE warning comes when both detect smoke, or when one detects it and the other is failed. If both are failed, ' +
  'the compartment reports nothing and a detection fault caution tells the crew.';

const EngineAndApuFireFamily: FailureDetailFamily = {
  ids: [A320Failure.Engine1Fire, A320Failure.Engine2Fire, A320Failure.ApuFire],
  detail: (number): FailureDetail => {
    const zone = ZONE_NAMES[number - 1];
    const isApu = number === 3;
    return {
      whatItIs: isApu
        ? 'The APU compartment has a fire detection system with two loops, and one extinguisher bottle that the crew ' +
          'discharges with the APU AGENT pb. On the ground the extinguishing is automatic.'
        : `Each engine has a fire detection system with two loops, and two extinguisher bottles, AGENT 1 and AGENT 2, ` +
          `that the crew discharges after pushing the ENG ${number} FIRE pb.`,
      impact: [
        `A fire starts in the ${zone} zone. The fire detection loops sense it and the fire warning follows.`,
        'Both loops must sense it, or one loop with the other failed. With both loops or the FDU failed, no warning shows.',
        ...(isApu
          ? [
              'On the ground the APU shuts down at once, as soon as the fire is detected.',
              'On the ground its bottle discharges by itself 3 s after the warning.',
            ]
          : [
              'The fire burns until an AGENT discharge puts it out (1 chance in 2 per bottle) or the failure is restored.',
            ]),
      ],
      alertIds: [FIRE_ALERTS[number - 1], isApu ? '4900102' : ['7700111', '7700112'][number - 1]],
      effects: [
        {
          where: 'E/WD',
          text:
            `${isApu ? 'APU FIRE' : `ENG ${number} FIRE`} in red, shown in every flight phase, with the master warning ` +
            `and the continuous repetitive chime. The ${isApu ? 'APU' : 'ENG'} page is called. Pushing the ` +
            `${isApu ? 'APU' : `ENG ${number}`} FIRE pb silences the chime only: the warning stays while the fire is detected.`,
        },
        {
          where: 'Overhead FIRE panel',
          text: `The ${isApu ? 'APU' : `ENG ${number}`} FIRE pb light comes on red.`,
        },
        isApu
          ? { where: 'Aural', text: 'On the ground, the external APU fire horn sounds at the nose gear.' }
          : { where: 'Pedestal ENG panel', text: `The ENG MASTER ${number} FIRE light comes on red.` },
        isApu
          ? {
              where: 'E/WD',
              text:
                `On the ground, APU EMER SHUT DOWN, an ${AMBER_CAUTION}, the APU page called, ` +
                `${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. It is hidden while APU FIRE is up, appears once the fire is ` +
                `out and stays until the APU MASTER SW is OFF. Pushing the APU FIRE pb latches it too.`,
            }
          : {
              where: 'E/WD',
              text:
                `After the ENG ${number} FIRE pb is pushed on the ground: ENG ${number} SHUT DOWN, an ${AMBER_CAUTION}, ` +
                'the ENG page called, shown before take-off power is set and after landing.',
            },
      ],
      notSimulated: ['The fire does not damage the engine or the APU and does not spread.'],
      logbook: { required: true, reason: 'fire warning' },
      clearing: isApu
        ? 'Push the APU FIRE pb and discharge AGENT (1 chance in 2), or use Restore. On the ground the agent discharges by itself.'
        : `Push the ENG ${number} FIRE pb and discharge AGENT 1, then AGENT 2 (1 chance in 2 each), or use Restore.`,
    };
  },
};

const FireLoopFamily: FailureDetailFamily = {
  ids: [
    A320Failure.Engine1FireLoopA,
    A320Failure.Engine1FireLoopB,
    A320Failure.Engine2FireLoopA,
    A320Failure.Engine2FireLoopB,
    A320Failure.ApuFireLoopA,
    A320Failure.ApuFireLoopB,
  ],
  detail: (number): FailureDetail => {
    const zoneIndex = Math.ceil(number / 2) - 1;
    const zone = ZONE_NAMES[zoneIndex];
    const isLoopA = number % 2 === 1;
    const loop = isLoopA ? 'A' : 'B';
    const otherLoop = isLoopA ? 'B' : 'A';
    return {
      whatItIs: WHAT_THE_FIRE_DETECTION_IS,
      impact: [
        `Loop ${loop} of the ${zone} zone breaks. Loop ${otherLoop} alone keeps protecting the zone.`,
        `A real fire still gives the fire warning, because loop ${otherLoop} senses it and loop ${loop} is failed.`,
        `Both loops failed: no fire warning, and the DET FAULT caution replaces the two loop cautions.`,
        `Failing both loops within 5 s of each other gives a false ${zone} fire warning (flame effect).`,
      ],
      alertIds: [
        (isLoopA ? LOOP_A_FAULT_ALERTS : LOOP_B_FAULT_ALERTS)[zoneIndex],
        DETECTION_FAULT_ALERTS[zoneIndex],
        FIRE_ALERTS[zoneIndex],
      ],
      effects: [
        {
          where: 'E/WD',
          text: `${zone} FIRE LOOP ${loop} FAULT, an ${AMBER_CAUTION}. It is ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
        },
        { where: 'SD STATUS', text: `${(isLoopA ? LOOP_A_STATUS_LINES : LOOP_B_STATUS_LINES)[zoneIndex]} is listed.` },
        {
          where: 'E/WD',
          text: `Both loops failed: ${zone} FIRE DET FAULT instead, with ${DETECTION_STATUS_LINES[zoneIndex]} on the status page.`,
        },
        {
          where: 'E/WD',
          text:
            `Both loops failed within 5 s: a false ${zone === 'APU' ? 'APU FIRE' : `${zone} FIRE`} in red, in every ` +
            `flight phase, with the master warning, the continuous chime and the FIRE pb light${zone === 'APU' ? '' : ' and ENG MASTER FIRE light'}. ` +
            `It stays while both loops are broken. Losing the power of both loops does not count.`,
        },
      ],
      logbook: { required: true, reason: 'ECAM caution and a detection loop lost' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const FireDetectionUnitFamily: FailureDetailFamily = {
  ids: [A320Failure.Engine1FireDetectionUnit, A320Failure.Engine2FireDetectionUnit, A320Failure.ApuFireDetectionUnit],
  detail: (number): FailureDetail => {
    const zone = ZONE_NAMES[number - 1];
    return {
      whatItIs: WHAT_THE_FIRE_DETECTION_IS,
      impact: [
        `The FDU of the ${zone} zone stops processing the loops, whatever they sense.`,
        `A real fire in the ${zone} zone then gives no fire warning at all.`,
        'The loop cautions are replaced by the detection fault caution.',
      ],
      alertIds: [DETECTION_FAULT_ALERTS[number - 1]],
      effects: [
        {
          where: 'E/WD',
          text: `${zone} FIRE DET FAULT, an ${AMBER_CAUTION}. It is ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
        },
        { where: 'SD STATUS', text: `${DETECTION_STATUS_LINES[number - 1]} is listed.` },
      ],
      logbook: { required: true, reason: 'ECAM caution and fire detection lost' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const CargoSmokeFamily: FailureDetailFamily = {
  ids: [A320Failure.FwdCargoSmoke, A320Failure.AftCargoSmoke],
  detail: (number): FailureDetail => {
    const compartment = number === 1 ? 'FWD' : 'AFT';
    return {
      whatItIs: WHAT_THE_CARGO_SMOKE_DETECTION_IS,
      impact: [
        `Smoke fills the ${number === 1 ? 'forward' : 'aft'} cargo compartment and the detectors report it at once.`,
        'The warning needs both detectors, or one detector with the other failed. With both failed, nothing shows.',
        ...(number === 2 ? ['The aft cargo ventilation closes its isolation valves by itself.'] : []),
        'The warning stays until the failure is restored: the agent does not put the smoke out.',
      ],
      alertIds: [number === 1 ? '2600150' : '2600160'],
      effects: [
        {
          where: 'E/WD',
          text: `SMOKE ${compartment} CARGO SMOKE in red, with the master warning and the continuous chime, ${NOT_SHOWN_ABOVE_80_KT_AND_LOW_ALTITUDE}.`,
        },
        { where: 'Overhead CARGO SMOKE panel', text: `The ${compartment} SMOKE light comes on red.` },
        {
          where: 'E/WD',
          text: 'The lines call for the AGENT discharge and the passenger disembarkation, and for CAB FANS off if they are on.',
        },
      ],
      notSimulated: ['The agent does not clear the smoke.', 'The ISOL VALVE OFF line is never listed.'],
      logbook: { required: true, reason: 'smoke warning' },
      clearing: 'Discharge the AGENT per the procedure; the warning goes only with Restore.',
    };
  },
};

const CargoSmokeDetectionLoopFamily: FailureDetailFamily = {
  ids: [
    A320Failure.FwdCargoSmokeDetectionLoop1,
    A320Failure.FwdCargoSmokeDetectionLoop2,
    A320Failure.AftCargoSmokeDetectionLoop1,
    A320Failure.AftCargoSmokeDetectionLoop2,
  ],
  detail: (number): FailureDetail => {
    const isForward = number <= 2;
    const compartment = isForward ? 'FWD' : 'AFT';
    const loop = number % 2 === 1 ? 1 : 2;
    const otherLoop = loop === 1 ? 2 : 1;
    return {
      whatItIs: WHAT_THE_CARGO_SMOKE_DETECTION_IS,
      impact: [
        `Detection loop ${loop} of the ${isForward ? 'forward' : 'aft'} cargo compartment fails. Loop ${otherLoop} still protects it.`,
        'One loop failed gives no alert, and smoke is still reported.',
        'Both loops of the compartment failed: no smoke is reported, even with smoke present.',
      ],
      alertIds: [isForward ? '2600170' : '2600180'],
      effects: [
        {
          where: 'E/WD',
          text: `Both loops failed: SMOKE ${compartment} CRG DET FAULT, an ${AMBER_CAUTION}. It is ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
        },
        { where: 'SD STATUS', text: `Both loops failed: ${compartment} CRG DET is listed.` },
      ],
      logbook: { required: false, reason: 'no indication to report while the other loop works' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const SmokeDetectionControlUnitFamily: FailureDetailFamily = {
  ids: [A320Failure.SmokeDetectionControlUnitChannel1, A320Failure.SmokeDetectionControlUnitChannel2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The smoke detection control unit (SDCU) reads the cargo and lavatory smoke detectors. It has two identical ' +
      'channels, so one is enough to keep the detection working. The avionics duct detector does not use it.',
    impact: [
      `Channel ${number} of the SDCU fails. The other channel keeps the detection working.`,
      'Both channels failed: no cargo or lavatory smoke is reported any more, and their detector faults are hidden.',
      'The avionics smoke detection is not affected.',
    ],
    alertIds: ['2600330'],
    effects: [
      {
        where: 'E/WD',
        text: `Both channels failed: SMOKE DET FAULT, an ${AMBER_CAUTION}, with IF NO LIVE STOCK, AFT ISOL VALVE OFF and PAX SYS OFF lines. It is ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'SD STATUS', text: 'Both channels failed: SMOKE DET is listed.' },
    ],
    logbook: { required: false, reason: 'no indication to report while the other channel works' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata26Entries: Record<number, FailureDetail> = {
  [A320Failure.AvionicsSmoke]: {
    whatItIs:
      'A smoke detector in the avionics ventilation extract duct watches the air leaving the avionics bay. It ' +
      'reports to the crew directly, without the SDCU, and only after the smoke has been present for a few seconds.',
    impact: [
      'Smoke reaches the extract duct. The detector confirms it after 5 s.',
      'The crew must apply the smoke and fumes procedure for avionics smoke.',
    ],
    alertIds: ['2600300'],
    effects: [
      {
        where: 'E/WD',
        text: `AVIONICS SMOKE, an ${AMBER_CAUTION}, with the smoke and fumes procedure. It is ${NOT_SHOWN_ABOVE_80_KT_AND_LOW_ALTITUDE}.`,
      },
      { where: 'Overhead VENT panel', text: 'The BLOWER and EXTRACT pb lights come on amber.' },
      { where: 'Overhead EMER ELEC PWR panel', text: 'The GEN 1 LINE pb light comes on amber.' },
      { where: 'SD CAB PRESS', text: 'VENT turns amber, with BLOWER and EXTRACT shown.' },
    ],
    logbook: { required: true, reason: 'smoke caution and fault lights' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.AvionicsSmokeDetector]: {
    whatItIs:
      'A smoke detector in the avionics ventilation extract duct watches the air leaving the avionics bay. It is ' +
      'the only detector of the compartment.',
    impact: [
      'The detector fails. The avionics smoke detection is lost.',
      'Smoke in the duct is then not reported at all.',
    ],
    alertIds: [],
    effects: [{ where: 'E/WD', text: 'Nothing shows: no detector fault alert exists for the avionics detector.' }],
    logbook: { required: false, reason: 'no indication to report' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.CargoFireBottleLowPressure]: {
    whatItIs:
      'One cargo fire extinguisher bottle serves both cargo compartments, through a discharge head for each. The ' +
      'crew discharges it with the DISCH pb of the compartment on fire.',
    impact: [
      'The bottle loses its agent. Nothing is left to discharge into either compartment.',
      'Only a bottle still full is affected: an already discharged bottle shows nothing.',
    ],
    alertIds: ['2600190', '2600191'],
    effects: [
      {
        where: 'E/WD',
        text: `SMOKE FWD CRG BTL 1 FAULT and SMOKE AFT CRG BTL 1 FAULT, amber cautions with the master caution and a single chime, ${NOT_SHOWN_ABOVE_80_KT_AND_LOW_ALTITUDE}.`,
      },
      { where: 'Overhead CARGO SMOKE panel', text: 'A DISCH pb push gives no discharge and no DISCH light.' },
    ],
    notSimulated: ['A failed squib is not modelled: only the low pressure of the bottle.'],
    logbook: { required: true, reason: 'ECAM caution and no cargo fire extinguishing' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.LavatorySmoke]: {
    whatItIs:
      'The lavatory smoke detectors report to the SDCU. The crew learns of smoke in a lavatory from the E/WD and ' +
      'contacts the cabin crew.',
    impact: [
      'Smoke in a lavatory is reported at once.',
      'The warning needs the SDCU: with both channels failed nothing shows.',
    ],
    alertIds: ['2600310'],
    effects: [
      {
        where: 'E/WD',
        text: `SMOKE LAVATORY SMOKE with the CKPT/CAB COM ESTABLISH line, amber caution with the master caution and a single chime, ${NOT_SHOWN_ABOVE_80_KT_AND_LOW_ALTITUDE}.`,
      },
    ],
    logbook: { required: true, reason: 'ECAM caution' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.LavatorySmokeDetector]: {
    whatItIs:
      'The lavatory smoke detectors report to the SDCU. When they are failed, the system tells the crew with a ' +
      'detection fault message.',
    impact: ['The lavatory detection is lost.', 'Smoke in a lavatory is then not reported.'],
    alertIds: ['2600320'],
    effects: [
      {
        where: 'E/WD',
        text: `SMOKE LAVATORY DET FAULT, amber awareness only, with no master caution and no chime, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
      { where: 'SD STATUS', text: 'LAV DET is listed.' },
    ],
    logbook: { required: true, reason: 'ECAM alert and detection lost' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata26Families: FailureDetailFamily[] = [
  EngineAndApuFireFamily,
  FireLoopFamily,
  FireDetectionUnitFamily,
  CargoSmokeFamily,
  CargoSmokeDetectionLoopFamily,
  SmokeDetectionControlUnitFamily,
];
