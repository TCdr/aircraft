// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily } from '@flybywiresim/fbw-sdk';
import { A320Failure } from '../a320';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

/** An amber caution: master caution light and a single chime */
const CAUTION = 'caution with master caution and a single chime';

/** Inhibited in the flight phases 3, 4, 5, 7 and 8 */
const NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING =
  'not shown from take-off power until 1,500 ft, nor below 800 ft on approach and in the landing roll above 80 kt';

/** Inhibited in the flight phases 4 and 8 */
const NOT_SHOWN_IN_ROLLS = 'not shown in the take-off roll or in the landing roll above 80 kt';

/** Inhibited in the flight phases 4, 5, 7 and 8 */
const NOT_SHOWN_IN_ROLLS_AND_LOW_PHASES =
  'not shown in the take-off roll, from lift-off to 1,500 ft, below 800 ft on approach or in the landing roll above 80 kt';

/** Shown in the flight phases 2, 6 and 9 only */
const SHOWN_ON_GROUND_AND_EN_ROUTE =
  'shown only in engine start and taxi, in climb, cruise and descent above 800 ft, and below 80 kt after landing';

const RADIO_ALTIMETER_DESCRIPTION =
  'Two radio altimeters measure the height of the aircraft above the ground. Each sends a radio signal down from a ' +
  'transmit antenna under the fuselage and times the echo on a receive antenna. The height feeds the PFDs, the ' +
  'flight controls, the ground proximity warning, the TCAS and the automatic call-outs.';

const AIR_DATA_UNIT_DESCRIPTION =
  'Each of the three air data and inertial reference units has an air data part (ADR). It turns the pitot, static ' +
  'and angle of attack probe readings into airspeed, Mach, altitude, vertical speed and angle of attack. ADR 1 feeds ' +
  'the captain, ADR 2 the first officer, and ADR 3 is the spare that the AIR DATA selector can put in place of either.';

const INERTIAL_UNIT_DESCRIPTION =
  'Each of the three air data and inertial reference units has an inertial reference part (IR) with laser gyros and ' +
  'accelerometers. It gives attitude, heading, track, ground speed, position and accelerations. IR 1 feeds the ' +
  'captain, IR 2 the first officer, and IR 3 is the spare that the ATT HDG selector can put in place of either.';

/** The ADR the PFD of the captain side (1), the first officer side (2) or neither (3) takes its air data from */
const SIDE_OF_UNIT = ['captain', 'first officer', 'spare'] as const;
const AIR_DATA_SPARE_POSITION = ['CAPT 3', 'F/O 3'] as const;

const AOA_SENSOR_NAMES = ['CAPT', 'F/O', 'STBY'] as const;

const RaFaultFamily: FailureDetailFamily = {
  ids: [A320Failure.RadioAltimeter1, A320Failure.RadioAltimeter2],
  detail: (number): FailureDetail => ({
    whatItIs: RADIO_ALTIMETER_DESCRIPTION,
    impact: [
      `Radio altimeter ${number} gives no valid height (failure warning).`,
      'The PFDs use the other radio altimeter, so the crew keeps a radio height.',
      'Both failed: the PFDs lose the radio height, and the GPWS and TCAS lose their height input.',
    ],
    alertIds: [['3400140', '3400150'][number - 1], '3400145', '3400680', '0000320', '0000325', '3200150'],
    effects: [
      { where: 'E/WD', text: `RA ${number} FAULT, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
      { where: 'SD STATUS', text: `RA ${number} and CAT 3 are listed as inoperative, with CAT 2 ONLY.` },
      { where: 'PFD', text: 'Both failed: a red RA flag replaces the radio height.' },
      {
        where: 'E/WD',
        text:
          'Both failed: RA 1 AND 2 FAULT replaces the two alerts. GPWS FAULT follows, and the TCAS STBY memo: ' +
          'green, amber in climb, cruise and descent. Gear up with flaps 3 or full there: GEAR NOT DOWN.',
      },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost radio altimeter' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const RaAntennaInterruptedFamily: FailureDetailFamily = {
  ids: [A320Failure.RadioAntennaInterrupted1, A320Failure.RadioAntennaInterrupted2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each radio altimeter has a transmit antenna and a receive antenna under the fuselage, linked to the ' +
      'transceiver by cables. The receive antenna picks up the echo of the signal sent by the transmit antenna, and ' +
      'the delay of the echo gives the height.',
    impact: [
      `The cable of an antenna of radio altimeter ${number} is cut, so no echo reaches its receiver.`,
      'The unit reports no computed data, with its height stuck at the maximum, and does not declare a failure.',
      'The other radio altimeter keeps the radio height on the PFDs and the TCAS.',
    ],
    alertIds: ['3200150'],
    effects: [
      { where: 'PFD', text: 'The radio height is hidden, without a flag, when both radio altimeters have this fault.' },
      { where: 'E/WD', text: 'No RA FAULT alert: the unit does not report a failure.' },
      {
        where: 'E/WD',
        text: 'Both radio altimeters with the fault, gear up and flaps full in climb, cruise or descent: GEAR NOT DOWN.',
      },
    ],
    logbook: { required: true, reason: 'radio height lost without a warning' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const RaDirectCouplingFamily: FailureDetailFamily = {
  ids: [A320Failure.RadioAntennaDirectCoupling1, A320Failure.RadioAntennaDirectCoupling2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Each radio altimeter has a transmit antenna and a receive antenna under the fuselage. The receive antenna is ' +
      'meant to hear only the echo that comes back from the ground, and the delay of the echo gives the height.',
    impact: [
      `The receive antenna of radio altimeter ${number} hears the transmit antenna directly along the fuselage.`,
      'The unit reads about minus 6 ft at every height and does not declare a failure.',
      'In flight the two radio altimeters disagree, so RA DEGRADED follows.',
    ],
    alertIds: ['3400155'],
    effects: [
      ...(number === 1
        ? [
            {
              where: 'ND',
              text: 'TA ONLY shows: the TCAS uses this height, so it inhibits every resolution advisory and the TA aural.',
            },
          ]
        : []),
      {
        where: 'PFD',
        text: `The radio height of the side that uses radio altimeter ${number} reads about -6 ft instead of the real height.`,
      },
      {
        where: 'E/WD',
        text:
          'RA DEGRADED once the two heights differ by more than 15 ft and 10 percent for 2 s, so not on the ground, ' +
          `${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.`,
      },
    ],
    logbook: { required: true, reason: 'wrong radio height and ECAM caution' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const GpsFamily: FailureDetailFamily = {
  ids: [A320Failure.Gps1, A320Failure.Gps2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Two GPS receivers give position, ground speed and track from the satellites. Each inertial reference unit ' +
      'blends the position of one of them with its own inertial position, and the result lets the flight management ' +
      'system navigate in GPS PRIMARY.',
    impact: [
      `GPS ${number} goes to FAULT mode and gives no position.`,
      'The air data and inertial units all use the other receiver, so GPS PRIMARY stays available.',
      number === 1
        ? 'The terrain awareness takes its position from GPS 1, so it goes to standby.'
        : 'Both receivers failed: GPS PRIMARY is lost.',
    ],
    alertIds: number === 1 ? ['3400165', '0000546'] : ['3400175'],
    effects: [
      { where: 'E/WD', text: `GPS ${number} FAULT, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}.` },
      { where: 'SD STATUS', text: `GPS ${number} is listed as inoperative. Both failed: GPS 1+2 and FLS LIMITED.` },
      { where: 'MCDU', text: `The GPS MONITOR page shows FAULT for receiver ${number} and dashes for its data.` },
      number === 1
        ? {
            where: 'E/WD',
            text: 'The TERR STBY memo shows after 3 s and the terrain picture leaves the NDs.',
          }
        : { where: 'MCDU', text: 'Both failed: the amber message GPS PRIMARY LOST, also flagged on the ND.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and a lost GPS receiver' },
    clearing: 'Maintenance only: use Restore. The receiver then runs its self-test and searches for satellites again.',
  }),
};

const TransponderFamily: FailureDetailFamily = {
  ids: [A320Failure.Transponder1, A320Failure.Transponder2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'Two mode S transponders answer the ground radar and the TCAS of other aircraft with the identity and the ' +
      'altitude of the aircraft. The XPDR selector of the ATC/TCAS panel picks the one in use, and the TCAS works ' +
      'through it. Transponder 1 is supplied by AC essential shed, transponder 2 by AC bus 2.',
    impact: [
      `Transponder ${number} is lost. If it is the selected one, the aircraft stops answering interrogations.`,
      'The other transponder does not take over by itself: the crew selects it with the XPDR selector.',
      'Both transponders lost: the TCAS goes to standby.',
    ],
    alertIds: [['3400860', '3400870'][number - 1], '3400890', '0000320', '0000325'],
    effects: [
      {
        where: 'E/WD',
        text:
          `ATC/XPDR ${number} FAULT, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. ` +
          `Its action line asks for SYS ${3 - number} while ${number} is selected and the other one works.`,
      },
      {
        where: 'Pedestal (ATC/TCAS panel)',
        text: `The ATC FAIL light comes on when transponder ${number} is the selected one.`,
      },
      { where: 'SD STATUS', text: `ATC/XPDR ${number} and ADS-B RPTG ${number} are listed as inoperative.` },
      {
        where: 'E/WD',
        text: 'Both failed: ATC/XPDR 1+2 FAULT replaces the two alerts. The TCAS STBY memo shows: green, amber in climb, cruise and descent.',
      },
    ],
    notSimulated: ['A power loss of the transponder bus gives an ELEC alert instead of ATC/XPDR FAULT.'],
    logbook: { required: true, reason: 'ECAM caution, ATC FAIL light and a lost transponder' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const AdsbFamily: FailureDetailFamily = {
  ids: [A320Failure.AdsbReporting1, A320Failure.AdsbReporting2],
  detail: (number): FailureDetail => ({
    whatItIs:
      'ADS-B out is a function of each mode S transponder. It broadcasts the position, altitude and speed of the ' +
      'aircraft so that ground stations and other aircraft see it without interrogating it.',
    impact: [
      `The ADS-B out function of transponder ${number} is lost. The transponder itself keeps working.`,
      'Only the alert and the STATUS listing follow.',
    ],
    alertIds: [['3400650', '3400651'][number - 1]],
    effects: [
      {
        where: 'E/WD',
        text:
          `ADS-B RPTG ${number} FAULT, ${CAUTION}, ${NOT_SHOWN_AROUND_TAKE_OFF_AND_LANDING}. ` +
          `Its action line asks for SYS ${3 - number} while ${number} is selected and the other one works.`,
      },
      { where: 'SD STATUS', text: `ADS-B RPTG ${number} is listed as inoperative.` },
      {
        where: 'E/WD',
        text: `Not shown when transponder ${number} itself has failed: ATC/XPDR ${number} FAULT replaces it.`,
      },
    ],
    notSimulated: ['The simulator transponder keeps broadcasting its position.'],
    logbook: { required: true, reason: 'ECAM caution and a lost ADS-B function' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const AirDataFaultFamily: FailureDetailFamily = {
  ids: [A320Failure.Adr1Fault, A320Failure.Adr2Fault, A320Failure.Adr3Fault],
  detail: (number): FailureDetail => ({
    whatItIs: AIR_DATA_UNIT_DESCRIPTION,
    impact: [
      `ADR ${number} gives no valid data: airspeed, Mach, altitude, vertical speed and angle of attack all fail.`,
      number === 3
        ? 'Nothing changes for the pilots while ADR 3 is not in use.'
        : `The ${SIDE_OF_UNIT[number - 1]} side loses its air data unless AIR DATA is selected to ADR 3.`,
      'Two ADRs lost: the flight controls revert to alternate law. All three lost: the ELACs lose all air data.',
    ],
    alertIds: [
      ['3400300', '3400310', '3400320'][number - 1],
      '3400500',
      ...(number === 1 ? ['3400680', '0000546'] : []),
      '3400330',
      '3400360',
    ],
    effects: [
      {
        where: 'E/WD',
        text:
          `ADR ${number} FAULT, ${CAUTION}, ${number === 3 ? NOT_SHOWN_IN_ROLLS_AND_LOW_PHASES : NOT_SHOWN_IN_ROLLS}` +
          `${number === 3 ? ', and not with take-off power set below 80 kt unless ADR 3 is in use' : ''}. ` +
          'A second ADR lost: ADR 1+2 (1+3, 2+3) FAULT replaces it; all three: ADR 1+2+3 FAULT.',
      },
      {
        where: 'PFD',
        text:
          number === 3
            ? 'No flag while ADR 3 is not in use. If AIR DATA is on CAPT 3 or F/O 3, that PFD shows red SPD, ALT and V/S flags.'
            : `The ${SIDE_OF_UNIT[number - 1]} PFD shows red SPD, ALT and V/S flags, unless AIR DATA is on ${AIR_DATA_SPARE_POSITION[number - 1]}.`,
      },
      { where: 'Overhead ADIRS panel', text: `The FAULT light of the ADR ${number} pushbutton comes on.` },
      {
        where: 'E/WD',
        text:
          (number === 1
            ? 'GPWS FAULT and the TERR STBY memo, as the ground proximity computer also uses ADR 1; the terrain picture leaves the NDs. '
            : '') +
          `TCAS FAULT while the TCAS takes its altitude from this ADR (transponder in use ${number === 1 ? '1' : number === 2 ? '2' : 'with AIR DATA on the spare'}), ` +
          `${SHOWN_ON_GROUND_AND_EN_ROUTE}.`,
      },
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and lost air data' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const InertialFaultFamily: FailureDetailFamily = {
  ids: [A320Failure.Ir1Fault, A320Failure.Ir2Fault, A320Failure.Ir3Fault],
  detail: (number): FailureDetail => ({
    whatItIs: INERTIAL_UNIT_DESCRIPTION,
    impact: [
      `IR ${number} gives no valid inertial data: attitude, heading, track, speed, position and rates all fail.`,
      number === 3
        ? 'Nothing changes for the pilots while IR 3 is not in use.'
        : `The ${SIDE_OF_UNIT[number - 1]} side loses attitude and heading unless ATT HDG is selected to IR 3.`,
      'Two IRs lost: the flight controls revert to alternate law. All three lost: direct law.',
    ],
    alertIds: [['3400400', '3400410', '3400420'][number - 1], '3400430', ...(number === 1 ? ['0000546'] : [])],
    effects: [
      {
        where: 'E/WD',
        text:
          `IR ${number} FAULT, ${CAUTION}, ${NOT_SHOWN_IN_ROLLS_AND_LOW_PHASES}` +
          `${number === 3 ? ', and not with take-off power set below 80 kt unless IR 3 is in use' : ''}. ` +
          'A second IR lost: IR 1+2 (1+3, 2+3) FAULT replaces it.',
      },
      {
        where: 'PFD',
        text:
          number === 3
            ? 'No flag while IR 3 is not in use. If ATT HDG is on CAPT 3 or F/O 3, that PFD shows red ATT and HDG flags.'
            : `The ${SIDE_OF_UNIT[number - 1]} PFD shows red ATT and HDG flags, unless ATT HDG is on ${AIR_DATA_SPARE_POSITION[number - 1]}.`,
      },
      { where: 'Overhead ADIRS panel', text: `The FAULT light of the IR ${number} mode selector comes on, steady.` },
      ...(number === 1
        ? [{ where: 'E/WD', text: 'The TERR STBY memo shows and the terrain picture leaves the NDs.' }]
        : []),
    ],
    notSimulated: [
      'The real IR may still give attitude after a fault; here every inertial output fails.',
      ...(number === 1 ? ['STATUS lists TCAS as inoperative with IR 1 lost, but the TCAS keeps working here.'] : []),
    ],
    logbook: { required: true, reason: 'ECAM caution, fault light and lost inertial data' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const AirspeedErroneousFamily: FailureDetailFamily = {
  ids: [A320Failure.Adr1AirspeedErroneous, A320Failure.Adr2AirspeedErroneous, A320Failure.Adr3AirspeedErroneous],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The pitot probes measure the total pressure of the airflow. Each ADR compares it with the static pressure to ' +
      'work out its computed airspeed, Mach number and true airspeed.',
    impact: [
      `ADR ${number} airspeed, Mach and true airspeed read too low, as with a blocked pitot probe.`,
      'The airspeed is 40 kt too low and still valid, so there is no flag and no ADR fault.',
      number === 3
        ? 'Only a PFD that uses ADR 3 shows it, and the flight controls use ADR 3 only after an ADR 1 or 2 loss.'
        : 'The flight controls average ADR 1 and ADR 2, so they carry half of the error.',
    ],
    alertIds: ['3400630', '3400370'],
    effects: [
      {
        where: 'PFD',
        text:
          number === 3
            ? 'The PFD that uses ADR 3 (AIR DATA on CAPT 3 or F/O 3) shows an airspeed 40 kt too low.'
            : `The ${SIDE_OF_UNIT[number - 1]} PFD shows an airspeed 40 kt too low, unless AIR DATA is on ${AIR_DATA_SPARE_POSITION[number - 1]}.`,
      },
      {
        where: 'E/WD',
        text:
          'IAS DISCREPANCY after 5 s when the two PFD speeds are more than 16 kt apart, ' +
          `${CAUTION}, ${NOT_SHOWN_IN_ROLLS_AND_LOW_PHASES}. Both speeds must be above 30 kt.`,
      },
      {
        where: 'E/WD',
        text: 'ADR DISAGREE once another ADR is lost, because the two ADRs left are 40 kt apart.',
      },
    ],
    notSimulated: ['The error is a fixed 40 kt, not the slow drift of a pitot probe that ices up.'],
    logbook: { required: true, reason: 'wrong airspeed and ECAM caution' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const AngleOfAttackErroneousFamily: FailureDetailFamily = {
  ids: [A320Failure.Adr1AoaErroneous, A320Failure.Adr2AoaErroneous, A320Failure.Adr3AoaErroneous],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The angle of attack probes on the nose measure the angle between the airflow and the aircraft. Each ADR ' +
      'corrects that reading into its angle of attack, which the flight controls use for their protections.',
    impact: [
      `ADR ${number} gives an angle of attack 10 degrees too high, still valid, so there is no flag and no fault.`,
      number === 3
        ? 'The ELACs use ADR 3 only after an ADR 1 or 2 loss.'
        : 'The ELACs average ADR 1 and ADR 2, so they carry half of the error.',
    ],
    alertIds: ['3400370'],
    effects: [
      { where: 'E/WD', text: 'No alert while the three ADRs are valid.' },
      {
        where: 'E/WD',
        text:
          'ADR DISAGREE once another ADR is lost and the two left are more than 3.6 degrees apart in flight ' +
          `(8 degrees on the ground), ${CAUTION}, ${NOT_SHOWN_IN_ROLLS_AND_LOW_PHASES}.`,
      },
    ],
    logbook: { required: true, reason: 'wrong angle of attack feeding the flight controls' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const AngleOfAttackSensorFamily: FailureDetailFamily = {
  ids: [A320Failure.CaptAoaSensor, A320Failure.FoAoaSensor, A320Failure.StbyAoaSensor],
  detail: (number): FailureDetail => {
    const name = AOA_SENSOR_NAMES[number - 1];
    return {
      whatItIs:
        'An angle of attack probe on the nose gives the angle between the airflow and the aircraft. The CAPT probe ' +
        'feeds ADR 1, the F/O probe ADR 2 and the STBY probe ADR 3.',
      impact: [
        `The angle of attack of ADR ${number} is lost. Its airspeed, altitude and other data stay valid.`,
        'The ELACs count an ADR with no angle of attack as lost, as the flight guidance computers do.',
        'Two sensors lost: the flight controls revert to alternate law.',
      ],
      alertIds: [['3400610', '3400611', '3400612'][number - 1]],
      effects: [
        {
          where: 'E/WD',
          text:
            `${name} AOA FAULT, crew awareness only: no master caution, no chime. It is shown only before the first ` +
            'engine start and in the 5 minutes after shutdown.',
        },
        { where: 'SD STATUS', text: `${name} AOA is listed as inoperative.` },
      ],
      logbook: { required: true, reason: 'ECAM alert and a lost angle of attack sensor' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

const HeadingErroneousFamily: FailureDetailFamily = {
  ids: [A320Failure.Ir1HeadingErroneous, A320Failure.Ir2HeadingErroneous, A320Failure.Ir3HeadingErroneous],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The inertial reference part of each ADIRU computes the magnetic and true heading of the aircraft. The PFD ' +
      'and the ND of each side show the heading of the IR selected for that side.',
    impact: [
      `IR ${number} heading, magnetic and true, is 10 degrees too high and still valid: no flag, no fault.`,
      number === 3
        ? 'Only a side that uses IR 3 (ATT HDG on CAPT 3 or F/O 3) shows it.'
        : `The ${SIDE_OF_UNIT[number - 1]} side shows the wrong heading, so the two sides disagree.`,
    ],
    alertIds: ['3400625', '3400460'],
    effects: [
      {
        where: 'PFD',
        text: 'CHECK HDG when the two sides differ by 5 degrees or more. It flashes for 9 s, then stays steady.',
      },
      {
        where: 'E/WD',
        text: `HDG DISCREPANCY after 5 s, ${CAUTION}, ${NOT_SHOWN_IN_ROLLS}.`,
      },
      {
        where: 'E/WD',
        text: `IR DISAGREE once another IR is lost, because the two IRs left are 10 degrees apart, ${CAUTION}, ${NOT_SHOWN_IN_ROLLS_AND_LOW_PHASES}.`,
      },
    ],
    logbook: { required: true, reason: 'wrong heading and ECAM caution' },
    clearing: MAINTENANCE_ONLY,
  }),
};

const PitchErroneousFamily: FailureDetailFamily = {
  ids: [A320Failure.Ir1PitchErroneous, A320Failure.Ir2PitchErroneous, A320Failure.Ir3PitchErroneous],
  detail: (number): FailureDetail => ({
    whatItIs:
      'The inertial reference part of each ADIRU computes the pitch and roll attitude of the aircraft. The attitude ' +
      'indicator of the PFD on each side shows the attitude of the IR selected for that side.',
    impact: [
      `IR ${number} pitch is 10 degrees nose up too high and still valid: no flag, no fault.`,
      number === 3
        ? 'Only a side that uses IR 3 (ATT HDG on CAPT 3 or F/O 3) shows it.'
        : `The ${SIDE_OF_UNIT[number - 1]} attitude indicator shows the wrong pitch, so the two sides disagree.`,
    ],
    alertIds: ['3400620', '3400460'],
    effects: [
      {
        where: 'PFD',
        text: 'CHECK ATT when the pitch or the roll of the two sides differs by 5 degrees or more. It flashes for 9 s.',
      },
      {
        where: 'E/WD',
        text:
          `ATT DISCREPANCY after 5 s, ${CAUTION}, not shown with take-off power set below 80 kt, ` +
          'in the take-off roll or in the landing roll above 80 kt.',
      },
      {
        where: 'E/WD',
        text: `IR DISAGREE once another IR is lost, because the two IRs left are 10 degrees apart, ${CAUTION}, ${NOT_SHOWN_IN_ROLLS_AND_LOW_PHASES}.`,
      },
    ],
    logbook: { required: true, reason: 'wrong attitude and ECAM caution' },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata34SensorsEntries: Record<number, FailureDetail> = {
  [A320Failure.Egpwc]: {
    whatItIs:
      'The enhanced ground proximity warning computer watches the position, height, speed and configuration of the ' +
      'aircraft against the terrain. It gives the GPWS aural alerts and lights, and the terrain picture of the NDs. ' +
      'Two pushbuttons of the overhead GPWS panel switch its functions off.',
    impact: [
      'The computer is lost: no GPWS aural alert, no pull-up or GPWS light, and no TERR AHEAD message.',
      'The terrain picture leaves the NDs, and the TERR ON ND selections stay as set.',
      'Both the basic GPWS modes and the terrain functions report a fault.',
    ],
    alertIds: ['3400680', '3400685'],
    effects: [
      {
        where: 'E/WD',
        text:
          `GPWS FAULT with GPWS OFF, and GPWS TERR DET FAULT with GPWS TERR OFF, both ${CAUTION}, shown only in engine ` +
          'start and taxi, in climb, cruise and descent above 800 ft, on approach below 800 ft and below 80 kt after landing.',
      },
      {
        where: 'Overhead GPWS panel',
        text: 'The FAULT lights of the SYS and TERR pushbuttons come on, unless the pushbutton is already OFF.',
      },
      { where: 'SD STATUS', text: 'GPWS and GPWS TERR are listed as inoperative.' },
      { where: 'ND', text: 'The terrain picture is removed, and no GPWS alert is spoken.' },
    ],
    logbook: { required: true, reason: 'ECAM cautions, fault lights and lost ground proximity warning' },
    clearing: MAINTENANCE_ONLY,
  },
  [A320Failure.TcasComputer]: {
    whatItIs:
      'The TCAS computer follows nearby aircraft through their transponder replies. It gives traffic advisories and ' +
      'resolution advisories, shown on the ND and PFD and spoken. It works through the transponder in use and takes ' +
      'its altitude from the air data.',
    impact: [
      'The computer fails: no traffic, no traffic advisory and no resolution advisory.',
      'A resolution advisory that was running is cleared.',
    ],
    alertIds: ['3400500'],
    effects: [
      {
        where: 'E/WD',
        text: `TCAS FAULT, ${CAUTION}, ${SHOWN_ON_GROUND_AND_EN_ROUTE}. It does not show with the TCAS in standby.`,
      },
      { where: 'PFD', text: 'The amber TCAS letters beside the vertical speed scale flash for 9 s, then stay steady.' },
      { where: 'SD STATUS', text: 'TCAS is listed as inoperative.' },
    ],
    logbook: { required: true, reason: 'ECAM caution and lost traffic alerting' },
    clearing: MAINTENANCE_ONLY,
  },
};

export const Ata34SensorsFamilies: FailureDetailFamily[] = [
  RaFaultFamily,
  RaAntennaInterruptedFamily,
  RaDirectCouplingFamily,
  GpsFamily,
  TransponderFamily,
  AdsbFamily,
  AirDataFaultFamily,
  InertialFaultFamily,
  AirspeedErroneousFamily,
  AngleOfAttackErroneousFamily,
  AngleOfAttackSensorFamily,
  HeadingErroneousFamily,
  PitchErroneousFamily,
];
