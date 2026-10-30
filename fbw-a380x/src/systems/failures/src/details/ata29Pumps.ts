// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** The phases (1, 2, 3, 8, 11 and 12) in which most of the HYD alerts of the systems are shown */
const HYD_ALERT_PHASES =
  'shown with the engines off, with the first engine started, with the second engine at take-off power below 80 kt, ' +
  'in flight from 1,500 ft on climb-out down to 800 ft on approach, and at or below 80 kt after landing or with ' +
  'the engines shut down; not from 80 kt on the take-off roll to 1,500 ft, on approach or at touch down; once shown ' +
  'it stays when the phase changes';

/** The phases (2, 3, 8 and 11) in which the ENG PMP PRESS LO alerts are shown */
const ENG_PMP_ALERT_PHASES =
  'shown with the first engine started, with the second engine at take-off power below 80 kt, in flight from ' +
  '1,500 ft on climb-out down to 800 ft on approach, and at or below 80 kt after landing; not with the engines ' +
  'off, from 80 kt on the take-off roll to 1,500 ft, on approach, at touch down or with the engines shut down; once ' +
  'shown it stays when the phase changes';

/** The phases (1 and 12) in which the ELEC PMP FAULT alerts are shown */
const ELEC_PMP_ALERT_PHASES =
  'shown only on the ground with the engines off (electrical power on, or the engines shut down), never once an ' +
  'engine is started; once shown it stays when the phase changes';

const HYD_PAGE_CALL_UP =
  'The page comes up with the alert when it is the first one on the E/WD and no page is selected.';

const SYSTEM_NAMES = ['green', 'yellow'] as const;
const SYSTEM_LETTERS = ['G', 'Y'] as const;

const LEVEL_LO_ALERTS = ['290800021', '290800022'] as const;
const AIR_PRESS_LO_ALERTS = ['290800019', '290800020'] as const;
const SYS_PRESS_LO_ALERTS = ['290800035', '290800036'] as const;
const SYS_OVERHEAT_ALERTS = ['290800031', '290800032'] as const;
const TEMP_EXCESS_ALERTS = ['290800037', '290800038'] as const;
const MONITORING_FAULT_ALERTS = ['290800029', '290800030'] as const;
const ELEC_PUMP_FAULT_ALERTS = ['290800001', '290800002', '290800003', '290800004'] as const;
const ENG_PMP_PRESS_LO_ALERTS = [
  '290800005',
  '290800006',
  '290800007',
  '290800008',
  '290800009',
  '290800010',
  '290800011',
  '290800012',
] as const;
/** The F/CTL and WHEEL secondary failures that follow a SYS PRESS LO of either system */
const PRESSURE_SECONDARY_FAILURES = ['999800001', '999800003'] as const;

/** HYD Y ENG 4 PMP A PRESS LO can never show (its conditions are not read correctly by the warning system) */
const ENG_4_PMP_A_PRESS_LO_ALERT = '290800011';

/**
 * The ENG PMP A/B PRESS LO alerts of a system that can show
 * @param system 0 green, 1 yellow
 * @returns the alert ids
 */
function engPmpAlertsOfSystem(system: number): string[] {
  return ENG_PMP_PRESS_LO_ALERTS.slice(system * 4, system * 4 + 4).filter(
    (alert) => alert !== ENG_4_PMP_A_PRESS_LO_ALERT,
  );
}

/** What the SYS PRESS LO alert of each system carries, while the alert is shown */
const SYS_PRESS_LO_PROCEDURE = [
  'FOR TAXI : FLAP LVR 1 (only after one minute after landing), FLAPS SLOW, SLATS SLOW, L/G GRVTY EXTN ONLY, ' +
    'FUEL CONSUMPT INCRSD and FMS PRED UNRELIABLE (only if PRIM 3 is failed too), LDG DIST AFFECTED and FOR TAXI : ' +
    'STEER ENDURANCE LIMITED.',
  'FOR TAXI : FLAP LVR 1 (only after one minute after landing), FLAPS SLOW, L/G GRVTY EXTN ONLY, FUEL CONSUMPT ' +
    'INCRSD and FMS PRED UNRELIABLE (only if PRIM 2 is failed too) and LDG DIST AFFECTED.',
] as const;

const SYS_PRESS_LO_STATUS = [
  'INFO: FMS PRED UNRELIABLE, ON DRY RWY ONLY : LDG DIST AFFECTED < 15% and CAT 3 SINGLE ONLY. INOP SYS: PART SPLRs, ' +
    'PART L/G RETRACTION and G HYD SYS; for approach and landing also FLAP SYS 1, SLAT SYS 2, BTV, NORM N/W STEER and ' +
    'CAT 3 DUAL. The limitations are MAX SPEED : 220 KT, SLATS SLOW, FLAPS SLOW, L/G GRVTY EXTN ONLY and STEER ENDUR ' +
    'LIMITED for approach and landing, and FUEL CONSUMPT INCRSD in all phases if PRIM 3 is failed too.',
  'INFO: TAXI WITH CARE, AVOID MAX TILLER ANGLE TURN ON WET/CONTAM RWY, NO BRAKED PIVOT TURN and CAT 3 SINGLE ONLY. ' +
    'INOP SYS: PART SPLRs, PART L/G RETRACTION and Y HYD SYS; for approach and landing also FLAP SYS 2, BTV, NORM B/W ' +
    'STEER and CAT 3 DUAL. The limitation is MAX SPEED : 220 KT for approach and landing, and FUEL CONSUMPT INCRSD in all phases if PRIM 2 is failed too.',
] as const;

const SYS_PRESS_LO_PFD = 'The limitation MAX SPEED : 220 KT is shown while the alert is shown.';

const RESERVOIR_EXPLANATION =
  'Each of the two hydraulic systems, green and yellow, has a reservoir that feeds its pumps. The reservoir is ' +
  'pressurised with air from the bleed system, so that the pumps do not cavitate, and a level switch tells when the ' +
  'fluid is low.';

/**
 * The follow-on effects when a reservoir has lost its fluid and the pumps run dry
 * @param system 0 green, 1 yellow
 * @returns the effects
 */
function pressureLossEffects(system: number): { where: string; text: string }[] {
  const letter = SYSTEM_LETTERS[system];
  const eng4Note = system === 1 ? ' HYD Y ENG 4 PMP A PRESS LO never shows.' : '';
  return [
    {
      where: 'E/WD',
      text:
        `Once the pumps starve: HYD ${letter} SYS PRESS LO, amber caution with master caution and single chime, ` +
        `when an engine of the system runs or outside the ground phases, confirmed after 1 s. It is ${HYD_ALERT_PHASES}.`,
    },
    { where: 'E/WD', text: `Procedure lines of SYS PRESS LO: ${SYS_PRESS_LO_PROCEDURE[system]}` },
    { where: 'SD STATUS', text: `${SYS_PRESS_LO_STATUS[system]} Only while the alert is shown.` },
    { where: 'PFD', text: SYS_PRESS_LO_PFD },
    {
      where: 'E/WD',
      text:
        '*F/CTL and *WHEEL secondary failures, amber with master caution, while SYS PRESS LO of a system is active; ' +
        'no phase inhibition.',
    },
    {
      where: 'E/WD',
      text:
        `HYD ${letter} ENG n PMP A (B) PRESS LO for each pump of the system, amber caution with master caution and ` +
        `single chime, with the engine running. It is ${ENG_PMP_ALERT_PHASES}.${eng4Note}`,
    },
    {
      where: 'E/WD',
      text:
        `On the ground with the first engine started, while the system still has pressure (no RSVR AIR PRESS LO, SYS OVERHEAT or SYS PRESS LO), setting an ENG PMP pushbutton OFF, as the procedure asks, also raises ENG n ` +
        `PMP A (B) PRESS LO for that pump after 10 s.`,
    },
    {
      where: 'E/WD',
      text:
        `HYD ${letter} ELEC PMP A (B) FAULT for an electric pump that is running, amber caution with master ` +
        `caution and single chime. It is ${ELEC_PMP_ALERT_PHASES}.`,
    },
    {
      where: 'SD HYD',
      text: `${HYD_PAGE_CALL_UP} The system pressure figure, triangle and box turn amber when the pressure goes.`,
    },
  ];
}

const ReservoirLeakFamily: FailureDetailFamily = {
  ids: [A380Failure.GreenReservoirLeak, A380Failure.YellowReservoirLeak],
  detail: (number): FailureDetail => {
    const system = number - 1;
    const letter = SYSTEM_LETTERS[system];
    return {
      whatItIs: RESERVOIR_EXPLANATION,
      impact: [
        `The ${SYSTEM_NAMES[system]} reservoir loses fluid at 0.1 US gal/s whatever the pumps do: the level reaches the low level limit in about ${system === 0 ? '95 s (80 s when started with the gear up)' : '100 s'} from a normal level.`,
        'The pumps starve about 25 s later and the system loses its pressure; the lost fluid is not replaced.',
        'Everything driven by the system then has less pressure available.',
      ],
      alertIds: [
        LEVEL_LO_ALERTS[system],
        SYS_PRESS_LO_ALERTS[system],
        ...engPmpAlertsOfSystem(system),
        ELEC_PUMP_FAULT_ALERTS[system * 2],
        ELEC_PUMP_FAULT_ALERTS[system * 2 + 1],
        ...PRESSURE_SECONDARY_FAILURES,
      ],
      effects: [
        {
          where: 'E/WD',
          text: `HYD ${letter} RSVR LEVEL LO, amber caution with master caution and single chime, when the level is below 2.6 US gal. It is ${HYD_ALERT_PHASES}.`,
        },
        ...pressureLossEffects(system),
        { where: 'SD HYD', text: 'The reservoir gauge falls and turns amber below the low level limit.' },
        {
          where: 'Overhead HYD panel',
          text: 'With the low level, the FAULT lights of the ENG PMP pushbuttons at AUTO and the ENG PMP A+B DISC pushbutton of the system come on; the ELEC PMP lights follow on the ground with the engines off.',
        },
      ],
      logbook: { required: true, reason: 'ECAM caution and a hydraulic system lost' },
      clearing:
        'Maintenance only: use Restore. It stops the leak, but the fluid already lost is not refilled, and pumps disconnected with ENG PMP A+B DISC stay disconnected.',
    };
  },
};

const ReservoirAirLeakFamily: FailureDetailFamily = {
  ids: [A380Failure.GreenReservoirAirLeak, A380Failure.YellowReservoirAirLeak],
  detail: (number): FailureDetail => {
    const system = number - 1;
    const letter = SYSTEM_LETTERS[system];
    return {
      whatItIs: RESERVOIR_EXPLANATION,
      impact: [
        `The air pressure of the ${SYSTEM_NAMES[system]} reservoir leaks away and falls below the 25 psi switch within about 20 s.`,
        'The pumps cavitate: their output falls with the air pressure (full at 30 psi, none at 0 psi), so the system pressure may sag.',
      ],
      alertIds: [AIR_PRESS_LO_ALERTS[system]],
      effects: [
        {
          where: 'E/WD',
          text: `HYD ${letter} RSVR AIR PRESS LO, amber caution with master caution and single chime. It is ${HYD_ALERT_PHASES}. It is hidden while both systems have lost their pressure (HYD G+Y SYS PRESS LO).`,
        },
        {
          where: 'SD HYD',
          text: `${HYD_PAGE_CALL_UP} AIR PRESS LOW is written beside the reservoir; the system pressure may turn amber below 2,900 psi.`,
        },
        {
          where: 'Overhead HYD panel',
          text: 'The FAULT lights of the ENG PMP pushbuttons at AUTO and of the ELEC PMP pushbuttons of the system come on (the ELEC PMP lights only on the ground with the engines off).',
        },
      ],
      logbook: { required: true, reason: 'ECAM caution and a loss of pump output' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const ReservoirReturnLeakFamily: FailureDetailFamily = {
  ids: [A380Failure.GreenReservoirReturnLeak, A380Failure.YellowReservoirReturnLeak],
  detail: (number): FailureDetail => {
    const system = number - 1;
    const letter = SYSTEM_LETTERS[system];
    return {
      whatItIs:
        RESERVOIR_EXPLANATION + ' The fluid used by the actuators and the other users flows back to the reservoir.',
      impact: [
        `10 % of the fluid that returns to the ${SYSTEM_NAMES[system]} reservoir is lost.`,
        'The level falls only as fast as the system is used, so the low level comes later than with a leak at the reservoir.',
        'When the reservoir is empty, the system loses its pressure as for a reservoir leak.',
      ],
      alertIds: [
        LEVEL_LO_ALERTS[system],
        SYS_PRESS_LO_ALERTS[system],
        ...engPmpAlertsOfSystem(system),
        ELEC_PUMP_FAULT_ALERTS[system * 2],
        ELEC_PUMP_FAULT_ALERTS[system * 2 + 1],
        ...PRESSURE_SECONDARY_FAILURES,
      ],
      effects: [
        {
          where: 'E/WD',
          text: `HYD ${letter} RSVR LEVEL LO, amber caution with master caution and single chime, once enough fluid has been lost to bring the level below 2.6 US gal. It is ${HYD_ALERT_PHASES}.`,
        },
        ...pressureLossEffects(system),
        { where: 'SD HYD', text: 'The reservoir gauge falls and turns amber below the low level limit.' },
      ],
      logbook: { required: true, reason: 'ECAM caution and a hydraulic system lost' },
      clearing:
        'Maintenance only: use Restore. It stops the loss, but the fluid already lost is not refilled, and pumps disconnected with ENG PMP A+B DISC stay disconnected.',
    };
  },
};

const ElecPumpOverheatFamily: FailureDetailFamily = {
  ids: [
    A380Failure.GreenElecPumpAOHeat,
    A380Failure.GreenElecPumpBOHeat,
    A380Failure.YellowElecPumpAOHeat,
    A380Failure.YellowElecPumpBOHeat,
  ],
  detail: (number): FailureDetail => {
    const system = number <= 2 ? 0 : 1;
    const letter = SYSTEM_LETTERS[system];
    const pump = number % 2 === 1 ? 'A' : 'B';
    return {
      whatItIs:
        `The ${SYSTEM_NAMES[system]} system has two electric pumps, A and B. They work on the ground only, to pressurise ` +
        'the system with the engines off (cargo doors, pushback, manual ON), and the hydraulic system monitoring unit ' +
        '(HSMU) controls them and switches one off when it overheats.',
      impact: [
        `While electric pump ${letter} ${pump} runs, its motor heats up and is reported overheated after about 20 s. With the pump at rest nothing overheats.`,
        'The HSMU then switches the pump off; it restarts a few seconds later once below the overheat limit, and keeps cycling while the failure is active.',
      ],
      alertIds: [ELEC_PUMP_FAULT_ALERTS[number - 1]],
      effects: [
        {
          where: 'E/WD',
          text: `HYD ${letter} ELEC PMP ${pump} FAULT, amber caution with master caution and single chime, with the bus of the pump powered. It follows the overheat of the pump, so it comes and goes with the cycling. It is ${ELEC_PMP_ALERT_PHASES}. The procedure line asks for ${letter} ELEC PMP ${pump} OFF.`,
        },
        {
          where: 'Overhead HYD panel',
          text: `The FAULT light of the ELEC PMP ${pump} pushbutton comes on, and stays on with the pushbutton OFF until the overheat is gone.`,
        },
        {
          where: 'SD HYD',
          text: `${HYD_PAGE_CALL_UP} OVHT is written next to the symbol of the pump, shown while no engine runs.`,
        },
      ],
      logbook: { required: true, reason: 'ECAM caution, FAULT light and a pump lost' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

/**
 * The detail of one engine pump overheat
 * @param number the position in the failure list, 1 (engine 1 pump A) to 8 (engine 4 pump B)
 * @returns the detail
 */
function enginePumpOverheatDetail(number: number): FailureDetail {
  const engine = Math.ceil(number / 2);
  const system = engine <= 2 ? 0 : 1;
  const letter = SYSTEM_LETTERS[system];
  const pump = number % 2 === 1 ? 'A' : 'B';
  const pressLoAlert = ENG_PMP_PRESS_LO_ALERTS[number - 1];
  const pressLoNeverShows = pressLoAlert === ENG_4_PMP_A_PRESS_LO_ALERT;
  return {
    whatItIs:
      `Each engine drives two hydraulic pumps, A and B. Engines 1 and 2 feed the green system, engines 3 and 4 the ` +
      `yellow one. The fluid of a pump returns to the reservoir through the case drain, which is watched for ` +
      `overheat.`,
    impact: [
      `While engine ${engine} turns pump ${pump}, even with its pushbutton OFF, the pump heats up and is reported overheated after about 20 s.`,
      `While the pump delivers flow, its hot fluid heats the ${SYSTEM_NAMES[system]} reservoir, which overheats about 50 s after the pump; with the pushbutton OFF the fluid stops heating but the pump does not.`,
      'After 2 minutes of overheat the pump is damaged and stops pressurising for good.',
    ],
    alertIds: [SYS_OVERHEAT_ALERTS[system], TEMP_EXCESS_ALERTS[system], ...(pressLoNeverShows ? [] : [pressLoAlert])],
    effects: [
      {
        where: 'E/WD',
        text: `HYD ${letter} SYS OVERHEAT, amber caution with master caution and single chime. It is ${HYD_ALERT_PHASES}. It needs the overheat detection of the system to work.`,
      },
      {
        where: 'E/WD',
        text: `HYD ${letter} SYS TEMP EXCESS HI, amber caution with master caution and single chime, once the heat has damaged the pump (or the reservoir after 5 minutes); it replaces SYS OVERHEAT. Same phases.`,
      },
      pressLoNeverShows
        ? {
            where: 'E/WD',
            text: 'HYD Y ENG 4 PMP A PRESS LO never shows, even when the pump has stopped pressurising.',
          }
        : {
            where: 'E/WD',
            text: `HYD ${letter} ENG ${engine} PMP ${pump} PRESS LO, amber caution with master caution and single chime, once the pump has stopped pressurising and no overheat of the pump or the reservoir is active any more (about 80 s for the pump, longer if the reservoir overheated too). It is ${ENG_PMP_ALERT_PHASES}.`,
          },
      {
        where: 'Overhead HYD panel',
        text: `The FAULT lights of the ENG PMP pushbuttons of the pump, among others, come on with the overheat; the ENG ${engine} PMP A+B DISC light comes on if switching the pumps OFF did not depressurise them.`,
      },
      {
        where: 'SD HYD',
        text: `${HYD_PAGE_CALL_UP} OVHT is written at the reservoir once the reservoir overheats.`,
      },
    ],
    logbook: { required: true, reason: 'ECAM caution and an engine pump lost' },
    clearing:
      'Maintenance only: use Restore. It stops the heating, but a pump damaged by the heat stays dead and SYS TEMP EXCESS HI stays on; pumps disconnected with ENG PMP A+B DISC stay disconnected.',
  };
}

const HsmuFamily: FailureDetailFamily = {
  ids: [A380Failure.GreenHsmu, A380Failure.YellowHsmu],
  detail: (number): FailureDetail => {
    const system = number - 1;
    const letter = SYSTEM_LETTERS[system];
    return {
      whatItIs:
        `The ${SYSTEM_NAMES[system]} hydraulic system monitoring unit (HSMU) watches the pumps, the reservoir and the ` +
        'temperature of its system, controls the electric pumps and the heat exchangers, and detects a system overheat.',
      impact: [
        `The ${SYSTEM_NAMES[system]} HSMU is lost: the overheat detection of the system is lost with it.`,
        `A later overheat of the ${SYSTEM_NAMES[system]} system no longer gives SYS OVERHEAT or SYS TEMP EXCESS HI.`,
      ],
      alertIds: [MONITORING_FAULT_ALERTS[system]],
      effects: [
        {
          where: 'E/WD',
          text: `HYD ${letter} SYS MONITORING FAULT, amber advisory without master caution or chime. It is ${HYD_ALERT_PHASES}.`,
        },
        { where: 'SD STATUS', text: `${letter} HSMU is listed as inoperative.` },
      ],
      notSimulated: [
        'The electric pumps of the system keep working; on the real aircraft they are lost with the HSMU.',
        'The fire shut-off valve and reservoir level indications are not lost.',
      ],
      logbook: { required: true, reason: 'ECAM advisory and a monitoring unit lost' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

export const Ata29PumpsEntries: Record<number, FailureDetail> = {
  // Own entry: its ENG PMP PRESS LO alert can never show
  [A380Failure.EnginePump4AOHeat]: enginePumpOverheatDetail(7),
};

const EnginePumpOverheatFamily: FailureDetailFamily = {
  ids: [
    A380Failure.EnginePump1AOHeat,
    A380Failure.EnginePump1BOHeat,
    A380Failure.EnginePump2AOHeat,
    A380Failure.EnginePump2BOHeat,
    A380Failure.EnginePump3AOHeat,
    A380Failure.EnginePump3BOHeat,
    A380Failure.EnginePump4AOHeat,
    A380Failure.EnginePump4BOHeat,
  ],
  detail: enginePumpOverheatDetail,
};

export const Ata29PumpsFamilies: FailureDetailFamily[] = [
  ReservoirLeakFamily,
  ReservoirAirLeakFamily,
  ReservoirReturnLeakFamily,
  ElecPumpOverheatFamily,
  EnginePumpOverheatFamily,
  HsmuFamily,
];
