// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'an amber caution with master caution and single chime';

/** OXY CKPT / CABIN BOTTLE PRESS LO: inhibited in flight phases 3 to 7 and 9 to 11 */
const NOT_SHOWN_BOTTLE_PHASES =
  'a new alert shows on the ground with the engines off or with engines running before take-off power is set ' +
  '(engine start and taxi-out), in flight from 1,500 ft through the climb, cruise and descent down to 800 ft, and ' +
  'after the engines are shut ' +
  'down; it is not shown from take-off power to 1,500 ft, on approach below 800 ft, nor during the landing roll';

/** OXY CABIN VLV CLOSED: inhibited in flight phases 2 to 11 */
const NOT_SHOWN_VALVE_PHASES =
  'a new alert shows only on the ground with all engines off; one that appears once an engine is running shows ' +
  'after all engines are shut down';

const DEPRESSURIZATION_INHIBIT =
  'The alert is not raised during a depressurization: with a valid cabin altitude above 13,800 ft, or once the ' +
  'cabin masks are released (MASK MAN ON pushbutton).';

const LEAK_RATE = 'The pressure falls at a steady 100 PSI per minute from a full 1,850 PSI down to zero.';

const NO_MASK_DRAW =
  'The masks and the oxygen flow are not simulated: no mask runs short of oxygen, and the bottles are not drawn on ' +
  'in normal use.';

const cockpitBottleLeakDetail: FailureDetail = {
  whatItIs:
    'The cockpit oxygen system supplies the five full-face quick-donning masks of the flight crew from one ' +
    'high-pressure bottle in the upper avionics bay, through a pressure reducer and a supply valve that the CREW ' +
    'SUPPLY pushbutton on the overhead OXYGEN panel closes. The oxygen system control unit monitors it and the ' +
    'pressure is shown on the DOOR page of the SD.',
  impact: [
    'The cockpit oxygen bottle empties.',
    LEAK_RATE,
    'The low pressure caution comes below 350 PSI, about 15 minutes after the leak starts on a full bottle.',
  ],
  alertIds: ['350800003'],
  effects: [
    {
      where: 'E/WD',
      text:
        `OXY CKPT BOTTLE PRESS LO appears below 350 PSI, ${CAUTION}; ${NOT_SHOWN_BOTTLE_PHASES}. It has no ` +
        `lines. ${DEPRESSURIZATION_INHIBIT}`,
    },
    {
      where: 'SD DOOR',
      text:
        'The alert calls up the DOOR page when it first appears, unless the crew has selected another page. The ' +
        'CKPT oxygen pressure value in the OXYGEN part falls, turns amber below 350 PSI, and on the ground shows an ' +
        'amber half-frame below 1,000 PSI.',
    },
  ],
  notSimulated: [NO_MASK_DRAW],
  logbook: { required: true, reason: 'OXY CKPT BOTTLE PRESS LO caution, cockpit oxygen pressure falling' },
  clearing:
    'Restore stops the leak but does not refill the bottle: the pressure stays where it fell, so the alert and the ' +
    'amber indications stay. Only a new load of the aircraft starts with a full bottle.',
};

const cabinBottleLeakDetail: FailureDetail = {
  whatItIs:
    'The fixed cabin oxygen system supplies the cabin occupants through high-pressure bottles behind the right-hand ' +
    'sidewall of the forward cargo compartment, two regulators with supply valves and two supply lines. The masks ' +
    'drop automatically above 13,800 ft cabin altitude or with the MASK MAN ON pushbutton, and the pressure is shown ' +
    'on the DOOR page of the SD.',
  impact: [
    'The cabin oxygen bottles empty.',
    LEAK_RATE,
    'The low pressure caution comes below a limit set by the passenger number, or below 800 PSI while no engine runs.',
  ],
  alertIds: ['350800001'],
  effects: [
    {
      where: 'E/WD',
      text:
        `OXY CABIN BOTTLE PRESS LO appears, ${CAUTION}; ${NOT_SHOWN_BOTTLE_PHASES}. It has no lines. With an ` +
        'engine running the limit rises with the passenger number, from 286 PSI up to 1,526 PSI (about 16 to 3 ' +
        'minutes after the leak starts on a full charge); with the engines off it is 800 PSI (about 10 minutes). ' +
        DEPRESSURIZATION_INHIBIT,
    },
    {
      where: 'SD DOOR',
      text:
        'The alert calls up the DOOR page when it first appears, unless the crew has selected another page. In the ' +
        'OXYGEN part the CABIN legend and its pressure value turn amber once the pressure is below the limit; on ' +
        'the ground only, the value gets an amber half-frame below 1,600 PSI and REGUL PR LO appears below 98 PSI.',
    },
  ],
  notSimulated: [NO_MASK_DRAW],
  logbook: { required: true, reason: 'OXY CABIN BOTTLE PRESS LO caution, cabin oxygen pressure falling' },
  clearing:
    'Restore stops the leak but does not refill the bottles: the pressure stays where it fell, so the alert and the ' +
    'amber indications stay. Only a new load of the aircraft starts with full bottles.',
};

const cabinValveStuckClosedDetail: FailureDetail = {
  whatItIs:
    'Two regulators with supply valves feed the cabin oxygen distribution to the main deck and upper deck lines. ' +
    'The valves open to give the cabin occupants a continuous flow of oxygen, regulated to the cabin altitude. A ' +
    'closed supply valve, or a closed engine-burst area shutoff valve, is reported by the oxygen system control unit.',
  impact: [
    'One regulator supply valve is held closed. The bottle pressure and the passenger masks are not changed in the ' +
      'sim.',
    'Only the crew indications follow: an advisory on the E/WD and an amber CABIN legend on the DOOR page.',
  ],
  alertIds: ['350800002'],
  effects: [
    {
      where: 'E/WD',
      text:
        `OXY CABIN VLV CLOSED appears, ${ADVISORY}; ${NOT_SHOWN_VALVE_PHASES}. It has no lines and it is not ` +
        'held back by a depressurization.',
    },
    {
      where: 'SD DOOR',
      text:
        'The alert calls up the DOOR page when it first appears, unless the crew has selected another page. The ' +
        'CABIN legend in the OXYGEN part turns amber at any time, also when the alert is held back by the flight ' +
        'phase; the pressure value stays normal.',
    },
  ],
  notSimulated: [
    'The oxygen flow to the masks is not simulated: a closed valve does not cut the oxygen of any mask.',
    'The engine-burst area shutoff valves are not modelled.',
  ],
  logbook: { required: true, reason: 'OXY CABIN VLV CLOSED advisory, cabin oxygen valve closed' },
  clearing: MAINTENANCE_ONLY,
};

export const Ata35OxygenEntries: Record<number, FailureDetail> = {
  [A380Failure.CockpitOxygenBottleLeak]: cockpitBottleLeakDetail,
  [A380Failure.CabinOxygenBottleLeak]: cabinBottleLeakDetail,
  [A380Failure.CabinOxygenValveStuckClosed]: cabinValveStuckClosedDetail,
};
