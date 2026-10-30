// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import type { FailureDetail, FailureDetailFamily, SeenEffect } from '@flybywiresim/fbw-sdk';
import { A380Failure } from '../a380';

const MAINTENANCE_ONLY = 'Maintenance only: use Restore.';

const ADVISORY = 'an amber advisory with no master caution and no chime';
const CAUTION = 'a caution with master caution and single chime';

const STATUS_NOTE = 'while the alert is shown';

// A phase inhibition only stops a NEW alert from being shown: one that is already up stays.
const RCL_NOTE = 'holding RCL for 3 s shows it until the flight phase changes';

/** Alerts inhibited in flight phases 4, 5 and 10 */
const NOT_SHOWN_PHASES_4_5_10 =
  'a new alert is not shown on the take-off roll above 80 kt, nor from touch down until the landing roll is below 80 kt';

/** Alerts inhibited in flight phases 3 to 7, 9 and 10 */
const NOT_SHOWN_PHASES_3_TO_7_9_10 =
  'a new alert is not shown from take-off power to 1,500 ft, nor from 800 ft on approach until the landing roll is ' +
  'below 80 kt';

/** Alerts inhibited in flight phases 2 to 11 */
const NOT_SHOWN_PHASES_2_TO_11 = 'a new alert is not shown from the first engine start until engine shutdown';

/** Alerts inhibited in flight phases 3 to 11 */
const SHOWN_BEFORE_TAKE_OFF_OR_AFTER_SHUTDOWN_ONLY =
  'a new alert is shown only on the ground before take-off power or after engine shutdown';

/** The FWS raises a busbar alert only while at least one AC busbar is powered */
const AC_NETWORK_UP_NOTE =
  'only while at least one AC busbar is still powered (with all four lost, ELEC EMER CONFIG covers the situation)';

const NO_INDICATION = 'no indication to report';

/** The shared consequence of a failed busbar in the electrical model: it carries no power at all */
const BUSBAR_DEAD = 'The busbar becomes non-conductive: it is unpowered and everything it feeds loses its supply.';

const FUEL_PUMPS_KEEP_RUNNING = 'The fuel pumps supplied by this busbar do not stop.';

/**
 * The combined alerts that replace a single busbar alert when other busbars are lost too: they all need a second
 * failure, and the single alert then goes out.
 */
const combinedAlertsReplaceSingleEffect = (alerts: string): SeenEffect => ({
  where: 'E/WD',
  text: `With the other busbars in its title lost too, ${alerts} replaces this single alert.`,
});

/** Cautions for the combined busbar alerts, inhibited in flight phases 4, 5 and 10 */
const combinedBusCautionEffect = (title: string, condition: string): SeenEffect => ({
  where: 'E/WD',
  text: `${title}, ${CAUTION}, when ${condition}; ${NOT_SHOWN_PHASES_4_5_10}. It replaces the two single alerts.`,
});

// ---------------------------------------------------------------------------------------------------------------------
// Main AC busbars AC 1 to AC 4
// ---------------------------------------------------------------------------------------------------------------------

const AC_BUS_FAULT_ALERTS = ['240800002', '240800004', '240800007', '240800009'] as const;

/** Loads of each main AC busbar that the electrical model and the systems code supply from it */
const AC_BUS_LOADS = [
  'the GREEN A electric hydraulic pump, a rudder EBHA actuator, radio altimeter 1 and ice detector 1',
  'the GREEN B electric hydraulic pump, radio altimeter 2, ADR 3, the reverser 2 supply, the cargo air heater, NSS ' +
    'AVNCS ANSU 1, pack 1 controller channel 2 and trim air controller channel 1',
  'the YELLOW A electric hydraulic pump, GPS receiver 2 and the TR 2 supply',
  'the YELLOW B electric hydraulic pump, ADR 2, transponder 2, TAWS 2, ice detector 2, the reverser 3 supply, pack 2 ' +
    'controller channel 2, trim air controller channel 2 and the APU TR supply',
] as const;

/** What else follows from the loss of each main AC busbar in the network */
const AC_BUS_NETWORK_EFFECT = [
  'The AC ESS busbar is then fed by AC 4 through its alternate feed, so AC ESS stays powered.',
  'TR 1 loses its supply; DC 1 is then fed by TR 2 through the DC bus tie once the TR 1 line contactor has opened.',
  'TR 2 loses its supply and DC 2 is fed by TR 1 through the DC bus tie. The AC EHA busbar moves to AC ESS.',
  'The APU TR loses its supply, so the DC APU busbar runs on the APU battery, and AC ESS loses its alternate feed.',
] as const;

/** The procedure lines that the FWS can show for each alert, in plain words */
const AC_BUS_LINES = [
  'Its only line, LAST ENG SHUTDOWN : ENG 4, is shown on the ground.',
  'Its shown line is LDG DIST: AFFECTED; EMER OUTR TK XFR, EXPECT FEED TKS IMBALANCE and FUEL MAN BALANCING PROC are added when feed tanks 1 and 4 are both below 19,000 kg.',
  'On the ground it adds BEFORE OPENING ANY CABIN DOOR with RESIDUAL DIFF PRESS and CABIN CREW lines.',
  'On the ground it shows LAST ENG SHUTDOWN : ENG 1, in flight VENT AVNCS EXTRACT; it also shows AIR DATA SWTG, WXR & TAWS, XPDR & TCAS and LDG DIST: AFFECTED, and EMER OUTR TK XFR, EXPECT FEED TKS IMBALANCE and FUEL MAN BALANCING PROC when feed tanks 1 and 4 are both below 19,000 kg.',
] as const;

/** The combined alerts that contain each AC busbar */
const AC_BUS_COMBINED_ALERTS = [
  'ELEC AC BUS 1+2 & DC BUS 1 FAULT',
  'ELEC AC BUS 1+2 & DC BUS 1 FAULT or ELEC AC BUS 2+3 & DC BUS 1+2 FAULT',
  'ELEC AC BUS 2+3 & DC BUS 1+2 FAULT or ELEC AC BUS 3+4 & DC BUS 2 FAULT',
  'ELEC AC BUS 3+4 & DC BUS 2 FAULT',
] as const;

/** SD effects of the controller channels that each AC busbar supplies */
const AC_BUS_CONTROLLER_EFFECTS: readonly (readonly SeenEffect[])[] = [
  [],
  [
    { where: 'SD BLEED', text: 'The pack 1 CTL box appears with channel 2 in amber; no channel alert follows.' },
    { where: 'SD COND', text: 'The TEMP CTL box appears with channel 1 in amber; no channel alert follows.' },
  ],
  [],
  [
    { where: 'SD BLEED', text: 'The pack 2 CTL box appears with channel 2 in amber; no channel alert follows.' },
    { where: 'SD COND', text: 'The TEMP CTL box appears with channel 2 in amber; no channel alert follows.' },
  ],
];

/** The SD ELEC AC TR indication that turns amber when the busbar that supplies the TR is lost */
const AC_BUS_TR_LABEL = ['', 'TR 1', 'TR 2', 'APU TR'] as const;

const AcMainBusFamily: FailureDetailFamily = {
  ids: [
    A380Failure.AlternatingCurrent1,
    A380Failure.AlternatingCurrent2,
    A380Failure.AlternatingCurrent3,
    A380Failure.AlternatingCurrent4,
  ],
  detail: (number): FailureDetail => {
    const radioAltimeterAlert = number === 1 ? 'A' : 'B';
    const radioAltimeterGate = number === 1 ? 'AC 2' : 'AC 4';
    const effects: SeenEffect[] = [
      {
        where: 'E/WD',
        text:
          `ELEC AC BUS ${number} FAULT, ${CAUTION}, ${AC_NETWORK_UP_NOTE}; ${NOT_SHOWN_PHASES_4_5_10}. ` +
          `${AC_BUS_LINES[number - 1]}`,
      },
    ];
    if (number <= 2) {
      effects.push({
        where: 'E/WD',
        text:
          `NAV RA SYS ${radioAltimeterAlert} FAULT, ${ADVISORY}, when radio altimeter ${number} reports a failure ` +
          `while ${radioAltimeterGate} is powered; ${NOT_SHOWN_PHASES_2_TO_11}, so it appears with the engines off ` +
          `on the ground. Radio altimeter ${number} is on AC ${number}, but the warning system checks ` +
          `${radioAltimeterGate} instead of AC ${number}.`,
      });
    }
    if (number === 2 || number === 4) {
      effects.push(
        combinedBusCautionEffect('ELEC AC BUS 2+4 FAULT', 'AC 2 and AC 4 are both lost'),
        combinedAlertsReplaceSingleEffect(AC_BUS_COMBINED_ALERTS[number - 1]),
      );
    } else {
      effects.push(combinedAlertsReplaceSingleEffect(AC_BUS_COMBINED_ALERTS[number - 1]));
    }
    effects.push({
      where: 'SD ELEC AC',
      text: `The AC ${number} busbar label turns from green to amber.`,
    });
    if (number >= 2) {
      effects.push({
        where: 'SD ELEC AC',
        text: `The ${AC_BUS_TR_LABEL[number - 1]} label and triangle turn amber, as the busbar no longer supplies it.`,
      });
    }
    effects.push(...AC_BUS_CONTROLLER_EFFECTS[number - 1]);
    if (number === 1) {
      effects.push({
        where: 'SD F/CTL',
        text: 'The rudder EBHA symbol it supplies turns amber.',
      });
    }
    return {
      whatItIs:
        `AC ${number} is one of four main 115 V AC busbars. Engine generator ${number} normally feeds it, and the ` +
        'bus ties let the other generators, the APU generators or external power supply it instead. It distributes ' +
        'the power to its systems and to the transformer rectifiers.',
      impact: [BUSBAR_DEAD, `Among the loads on it: ${AC_BUS_LOADS[number - 1]}.`, AC_BUS_NETWORK_EFFECT[number - 1]],
      alertIds: [
        AC_BUS_FAULT_ALERTS[number - 1],
        ...(number === 1 ? ['340800053'] : []),
        ...(number === 2 ? ['340800054'] : []),
        ...(number === 2 || number === 4 ? ['240800006'] : []),
      ],
      effects,
      notSimulated: [FUEL_PUMPS_KEEP_RUNNING],
      logbook: { required: true, reason: 'caution and a lost AC busbar' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// AC ESS, AC EMER, AC EHA and AC GND FLT SRV
// ---------------------------------------------------------------------------------------------------------------------

const AcEssBusEntry: FailureDetail = {
  whatItIs:
    'The AC ESS busbar is the essential 115 V AC busbar. In normal operation AC 1 feeds it, and AC 4 takes over ' +
    'automatically when AC 1 is lost. It feeds the essential systems and the ESS TR, and the AC EMER busbar is ' +
    'supplied through it.',
  impact: [
    `${BUSBAR_DEAD} The AC EMER busbar and the ESS TR lose their supply with it.`,
    'Among the loads on it: pack controller channel 1 of both packs, ADR 1, FADEC igniter A, radio altimeter 3, ' +
      'TAWS 1, transponder 1, ADR 1 probe heating, window heating and several flight control EHAs.',
    'DC ESS is then supplied from DC 1 through the DC bus line.',
    'The FLT OPS ANSU shuts down 10 s after AC ESS is lost; no alert follows.',
  ],
  alertIds: ['240800012'],
  effects: [
    {
      where: 'E/WD',
      text:
        `ELEC AC ESS BUS FAULT, ${CAUTION}, ${AC_NETWORK_UP_NOTE}; ${NOT_SHOWN_PHASES_4_5_10}. Its first line is ` +
        'AC ESS FEED ALTN; if that does not help, it adds AIR DATA SWTG, WXR & TAWS, XPDR & TCAS and SLATS SLOW, ' +
        'and the fuel balancing lines when feed tanks 1 and 4 are low.',
    },
    {
      where: 'E/WD',
      text:
        'ELEC AC ESS BUS ALTN (caution, no procedure line) is not shown while this alert is active: it only tells ' +
        'that AC 4 took over the busbar.',
    },
    {
      where: 'Overhead ELEC panel',
      text: 'The AC ESS FEED pb-sw FAULT light comes on while the AC ESS busbar is not supplied.',
    },
    {
      where: 'SD ELEC AC',
      text: 'The AC ESS and AC EMER busbar labels turn amber.',
    },
    {
      where: 'SD ELEC AC',
      text: 'The ESS TR label and triangle turn amber.',
    },
    { where: 'SD BLEED', text: 'The pack 1 CTL and pack 2 CTL boxes appear with channel 1 in amber.' },
    { where: 'SD F/CTL', text: 'The EHA and EBHA symbols it supplies turn amber.' },
    {
      where: 'SD STATUS',
      text:
        `ADR 1, GPS 1, WXR 1, XPDR 1, TCAS 1, HF 1, FEED TK 2 MAIN PMP, STBY PITOT HEATG, L WINDSHIELD HEATG and ` +
        `DFDR are listed as inoperative, with SLAT SYS 1, CAT 2, GLS AUTOLAND, LS 1 and TAWS 1 for approach and ` +
        `landing and SLATS SLOW as a limitation for approach and landing, ${STATUS_NOTE}.`,
    },
    {
      where: 'SD STATUS',
      text:
        `The STATUS MORE page lists RA SYS C, FEED TK 3 STBY PMP, TRIM TK L PMP, ENG 1+2+3+4 IGN A, PACK 1 CTL 1 ` +
        `and PACK 2 CTL 1 under REDUND LOSS while the AC ESS busbar is lost, also in the phases that inhibit the alert.`,
    },
  ],
  notSimulated: [FUEL_PUMPS_KEEP_RUNNING],
  logbook: { required: true, reason: 'caution and a lost essential AC busbar' },
  clearing: MAINTENANCE_ONLY,
};

const AcEmerBusEntry: FailureDetail = {
  whatItIs:
    'The AC EMER busbar is the emergency 115 V AC busbar. It is fed through the AC ESS busbar, or by the static ' +
    'inverter in the emergency configuration when no AC busbar and no RAT generator supplies power.',
  impact: [
    `${BUSBAR_DEAD} The AC ESS busbar keeps its power.`,
    'Among the loads on it: GPS receiver 1 and the ADR 1 pitot, temperature and angle-of-attack probe heating.',
  ],
  alertIds: [],
  effects: [
    {
      where: 'SD ELEC AC',
      text: 'The AC EMER busbar label turns from green to amber.',
    },
    {
      where: 'E/WD',
      text: 'No alert: ELEC AC EMER BUS FAULT exists in the alert table but nothing in the warning system raises it.',
    },
  ],
  logbook: { required: true, reason: 'amber AC EMER busbar and unsupplied GPS 1 and ADR 1 probe heating' },
  clearing: MAINTENANCE_ONLY,
};

const AcEhaBusEntry: FailureDetail = {
  whatItIs:
    'The AC EHA busbar (247XP) supplies electro-hydrostatic actuators of the flight controls: the inward aileron ' +
    'EHAs, the left outward and right inward elevator EHAs and the lower EBHA of the upper rudder panel. AC 3 ' +
    'normally feeds it, and AC ESS takes over when AC 3 is lost.',
  impact: [`${BUSBAR_DEAD}`, 'The EHAs on this busbar lose their electric supply.'],
  alertIds: ['240800060'],
  effects: [
    {
      where: 'E/WD',
      text:
        `ELEC F/CTL ACTUATOR PWR SUPPLY FAULT, ${ADVISORY}, when the busbar has been unpowered for 2 s while an AC ` +
        `busbar is powered; ${SHOWN_BEFORE_TAKE_OFF_OR_AFTER_SHUTDOWN_ONLY}; ${RCL_NOTE}. It has no procedure line.`,
    },
    {
      where: 'SD F/CTL',
      text: 'The EHA symbols of the actuators supplied by this busbar turn amber.',
    },
  ],
  logbook: { required: true, reason: 'advisory alert and unsupplied flight control actuators' },
  clearing: MAINTENANCE_ONLY,
};

const AcGndFltServiceEntry: FailureDetail = {
  whatItIs:
    'The AC GND/FLT service busbar supplies the ground servicing loads. It is fed by AC 3 in normal operation, or ' +
    'by EXT 1 directly during ground servicing.',
  impact: [
    `${BUSBAR_DEAD}`,
    'In the simulation only the electrical load of its consumers is attached to it: nothing else changes.',
  ],
  alertIds: [],
  effects: [
    {
      where: 'E/WD',
      text: 'No alert and no display shows this busbar.',
    },
  ],
  notSimulated: ['The ground servicing loads are not modelled as systems.'],
  logbook: { required: false, reason: NO_INDICATION },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// DC 1 and DC 2
// ---------------------------------------------------------------------------------------------------------------------

const DC_BUS_FAULT_ALERTS = ['240800026', '240800029'] as const;
const DC_BUS_SUPPLY = ['TR 1', 'TR 2'] as const;

const DC_BUS_LOADS = [
  'PRIM 3 and SEC 3, VHF 3, the YELLOW electric hydraulic pump control, ADR 3, FQDC 2, forward ventilation ' +
    'controller channel 1 and the Captain OIS laptop',
  'FCU 2, VHF 2, the F/O PFD and SD display units (which have no other supply), the GREEN electric hydraulic pump ' +
    'control, ADR 2, aft ventilation controller channel 1, and the DC GND/FLT service busbar with LGCIU 2',
] as const;

const DC_BUS_EXTRA = [
  'The Captain and F/O ND and MFD display units have a second supply and stay on.',
  'The DC EHA busbar is fed from DC 2 and is lost too, so PRIM 2 and SEC 2 lose their power.',
] as const;

const DC_BUS_LINES = [
  'On the ground in taxi it shows FOR TAXI : FLAPS SELECT CONF 1+F; it also shows ATC COM VOICE ONLY, AP: SIDESTICK LOCKING DEVICE NOT AVAIL, FUEL CONSUMPT INCRSD and LDG DIST: AFFECTED.',
  'It shows FOR TAXI : FLAPS SELECT CONF 1+F in taxi, AIR DATA SWTG, F/O BARO REF : STD ONLY, USE VHF 1 OR 3, DU RECONF P/B AVAIL, F/O KEYBOARD CURSOR CTL AVAIL, FUEL CONSUMPT INCRSD and LDG DIST: AFFECTED.',
] as const;

const DC_BUS_COMBINED_ALERTS = [
  'ELEC AC BUS 1+2 & DC BUS 1 FAULT, ELEC AC BUS 2+3 & DC BUS 1+2 FAULT or ELEC DC BUS 1+ESS FAULT',
  'ELEC AC BUS 2+3 & DC BUS 1+2 FAULT or ELEC AC BUS 3+4 & DC BUS 2 FAULT',
] as const;

const DcMainBusFamily: FailureDetailFamily = {
  ids: [A380Failure.DirectCurrent1, A380Failure.DirectCurrent2],
  detail: (number): FailureDetail => {
    const effects: SeenEffect[] = [
      {
        where: 'E/WD',
        text:
          `ELEC DC BUS ${number} FAULT, ${CAUTION}, ${AC_NETWORK_UP_NOTE}; ${NOT_SHOWN_PHASES_4_5_10}. ` +
          `${DC_BUS_LINES[number - 1]}`,
      },
      combinedBusCautionEffect('ELEC DC BUS 1+2 FAULT', 'DC 1 and DC 2 are both lost'),
      combinedAlertsReplaceSingleEffect(DC_BUS_COMBINED_ALERTS[number - 1]),
    ];
    if (number === 1) {
      effects.push(
        {
          where: 'E/WD',
          text:
            `ELEC ABNORMAL FLIGHT OPS SUPPLY, ${ADVISORY}, when DC 1 is unpowered in flight while DC ESS is powered; ` +
            'the warning system remembers it until the next first engine start, and ' +
            `${NOT_SHOWN_PHASES_2_TO_11}, so it appears after the flight. It has no procedure line.`,
        },
        { where: 'SD COND', text: 'The FWD VENT CTL box appears with channel 1 in amber; no channel alert follows.' },
        { where: 'SD ELEC DC', text: 'The DC 1 busbar label turns from green to amber.' },
        { where: 'Overhead F/CTL panel', text: 'The PRIM 3 and SEC 3 pushbutton lights lose their supply.' },
        {
          where: 'Overhead ELEC panel',
          text: 'The COMMERCIAL 1 pushbutton light also loses its supply (it needs DC 1 and DC ESS).',
        },
        {
          where: 'Overhead AIR panel',
          text: 'The PACK 1 and HOT AIR pushbutton lights also lose their supply (they need DC 1 and DC ESS).',
        },
      );
    } else {
      effects.push(
        {
          where: 'E/WD',
          text:
            `L/G CTL 2 FAULT, ${ADVISORY}, when LGCIU 2 has no power (not during ground servicing, when TR 2 feeds the DC GND/FLT busbar); it is not shown with L/G CTL 1+2 FAULT; ` +
            `${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
        },
        {
          where: 'SD ELEC DC',
          text: 'The SD display unit has no other supply and goes dark, so the DC 2 busbar label cannot be seen unless a DU RECONF selection shows the SD.',
        },
        {
          where: 'PFD',
          text:
            'The F/O PFD display unit has no other supply and goes dark: the F/O PFD moves to the F/O ND display unit. ' +
            'The SD stays lost unless a DU RECONF selection puts it on another display unit.',
        },
        {
          where: 'Overhead ELEC panel',
          text: 'Among others the BAT 2, APU BAT, GEN 3, GEN 4, APU GEN 2, COMMERCIAL 2, ELMU and GALY & CAB pushbutton lights lose their supply.',
        },
        {
          where: 'Overhead AIR panel',
          text: 'Among others the ENG 1 BLEED, ENG 4 BLEED and PACK 2 pushbutton lights lose their supply.',
        },
        {
          where: 'Overhead F/CTL panel',
          text: 'The PRIM 2 and SEC 2 pushbutton lights lose their supply through the DC EHA busbar.',
        },
      );
    }
    return {
      whatItIs:
        `DC ${number} is one of two main 28 V DC busbars. ${DC_BUS_SUPPLY[number - 1]} normally feeds it, a battery ` +
        'covers source changes, and the DC bus tie lets the other TR supply it.',
      impact: [BUSBAR_DEAD, `Among the loads on it: ${DC_BUS_LOADS[number - 1]}.`, DC_BUS_EXTRA[number - 1]],
      alertIds: [DC_BUS_FAULT_ALERTS[number - 1], ...(number === 1 ? ['240800001'] : ['320800034']), '240800027'],
      effects,
      logbook: { required: true, reason: 'caution and a lost DC busbar' },
      clearing: MAINTENANCE_ONLY,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// DC ESS and its partial loss
// ---------------------------------------------------------------------------------------------------------------------

const DcEssBusEntry: FailureDetail = {
  whatItIs:
    'The DC ESS busbar is the essential 28 V DC busbar. The ESS TR feeds it, the batteries back it up, and DC 1 can ' +
    'supply it through the DC bus line. It feeds the essential systems and, through the ESS IN FLIGHT contactor, the ' +
    'sub-busbar of the Captain PFD, PRIM 1, SEC 1 and FCU 1.',
  impact: [
    `${BUSBAR_DEAD} The sub-busbar behind the ESS IN FLIGHT contactor is lost with it.`,
    'Among the loads on it: the E/WD display unit and the Captain PFD display unit (no other supply), PRIM 1, SEC 1, ' +
      'FCU 1, VHF 1, ADR 1, LGCIU 1, forward and aft ventilation controller channel 2, the ECAM control panel, fire ' +
      'extinguisher bottle supply (second source) and the fuel quantity data concentrator.',
    'The Captain ND and MFD, and the F/O displays, keep another supply.',
    'The ISIS and SND then run only above 50 kt on the HOT 1 busbar and are off below it.',
  ],
  alertIds: ['240800030', '320800033'],
  effects: [
    {
      where: 'E/WD',
      text:
        `ELEC DC ESS BUS FAULT, ${CAUTION}, ${AC_NETWORK_UP_NOTE}; ${NOT_SHOWN_PHASES_4_5_10}. Its lines include ` +
        'AIR DATA SWTG, HEADSETS, USE RMP 3, USE VHF 2 OR 3, WXR & TAWS, SLATS SLOW and LDG DIST AFFECTED, ' +
        'and the fuel balancing lines when feed tanks 1 and 4 are low.',
    },
    {
      where: 'E/WD',
      text:
        `L/G CTL 1 FAULT, ${ADVISORY}, when LGCIU 1 has no power; it is not shown with L/G CTL 1+2 FAULT; ` +
        `${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
    },
    {
      where: 'E/WD',
      text:
        'The E/WD display unit has no other supply and goes dark: the E/WD appears on the SD display unit, so the SD ' +
        'pages are not visible unless a DU RECONF selection moves them.',
    },
    {
      where: 'PFD',
      text:
        'The Captain PFD display unit has no other supply and goes dark: the Captain PFD moves to the Captain ND ' +
        'display unit.',
    },
    {
      where: 'SD ELEC DC',
      text: 'The DC ESS busbar label turns from green to amber, visible only once the SD is on a display unit.',
    },
    { where: 'SD COND', text: 'The FWD VENT CTL and AFT VENT CTL boxes appear with channel 2 in amber.' },
    {
      where: 'Overhead ELEC panel',
      text: 'Among others the BAT 1, BAT ESS, GEN 1, GEN 2, APU GEN 1, PAX, DRIVE 1 to 4, BUS TIE and AC ESS FEED pushbutton lights lose their supply; COMMERCIAL 1 also needs DC 1.',
    },
    {
      where: 'Overhead EMER ELEC PWR panel',
      text: 'The RAT MAN ON pushbutton light loses its supply.',
    },
    {
      where: 'Overhead AIR panel',
      text: 'Among others the ENG 2 BLEED, ENG 3 BLEED, APU BLEED, RAM AIR, PACK 1 and HOT AIR pushbutton lights lose their supply.',
    },
    {
      where: 'Overhead ENG panel',
      text: 'The FADEC 1 to 4 GND PWR pushbutton lights lose their supply.',
    },
    {
      where: 'Overhead RCDR GND CTL panel',
      text: 'The RCDR GND CTL pushbutton light loses its supply.',
    },
    {
      where: 'Overhead F/CTL panel',
      text: 'The PRIM 1 and SEC 1 pushbutton lights lose their supply.',
    },
  ],
  logbook: { required: true, reason: 'caution, lost essential DC busbar and blank display units' },
  clearing: MAINTENANCE_ONLY,
};

const DcEssBusPartEntry: FailureDetail = {
  whatItIs:
    'The DC ESS busbar is split into parts. A loss of one part removes the systems on it while the rest of the ' +
    'busbar stays powered.',
  impact: [
    'The part loss only raises the alert and lists the systems that the part feeds: the busbar stays powered, so ' +
      'those systems keep working in the simulation.',
  ],
  alertIds: ['240800031'],
  effects: [
    {
      where: 'E/WD',
      text:
        `ELEC DC ESS BUS PART FAULT, ${CAUTION}, while the DC ESS busbar is powered; ` +
        `${NOT_SHOWN_PHASES_3_TO_7_9_10}. Its lines include FOR TAXI : FLAPS SELECT CONF 1+F, AIR DATA SWTG, ` +
        'HEADSETS, WXR & TAWS, DU RECONF P/B AVAIL, ECP KEYS NOT AVAIL and SLATS SLOW.',
    },
    {
      where: 'SD STATUS',
      text:
        `PART SPLRs, PRIM 1, SEC 1, ADR 1, WXR 1, FEED TK 2 MAIN PMP, AUTO REFUEL, FUEL AUTO GND XFR, LOUDSPEAKERS, ` +
        `CAPT EFIS CTL and RECORDER SYS are listed as inoperative, with SLAT SYS 1, BTV, CAT 2 and TAWS 1 for ` +
        `approach and landing, SLATS SLOW and LDG DIST AFFECTED as limitations, and LDG DIST COEF < 1.45 ON DRY ` +
        `RUNWAY and CAPT KEYBOARD CURSOR CTL AVAIL as information, ${STATUS_NOTE}.`,
    },
  ],
  notSimulated: ['The listed systems keep working: only the alert and the STATUS lines are produced.'],
  logbook: { required: true, reason: 'caution and a lost part of the DC ESS busbar' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// DC EHA, DC APU, DC GND FLT SRV
// ---------------------------------------------------------------------------------------------------------------------

const DcEhaBusEntry: FailureDetail = {
  whatItIs:
    'The DC EHA busbar (247PP) supplies PRIM 2 and SEC 2. DC 2 normally feeds it, and the DC ESS ' +
    'busbar takes over when all engines have failed.',
  impact: [`${BUSBAR_DEAD}`, 'PRIM 2 and SEC 2 lose their power supply.'],
  alertIds: ['271800037', '271800059'],
  effects: [
    {
      where: 'E/WD',
      text: `F/CTL PRIM 2 FAULT, ${CAUTION}, while the DC 2 busbar is powered; ${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
    },
    {
      where: 'E/WD',
      text: `F/CTL SEC 2 FAULT, ${CAUTION}, while the DC 2 busbar is powered; ${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
    },
    {
      where: 'SD STATUS',
      text:
        `SEC 2 FAULT lists SEC 2 and PART SPLRs as inoperative (MOST SPLRs when all three SECs are unhealthy, with ` +
        `RUDDER TRIM when SEC 1 and SEC 3 are not healthy) and ON DRY RWY ONLY : LDG DIST AFFECTED < 15% as ` +
        `information, ${STATUS_NOTE}. PRIM 2 FAULT has no STATUS entry.`,
    },
    {
      where: 'Overhead F/CTL panel',
      text: 'The PRIM 2 and SEC 2 pushbutton lights lose their supply.',
    },
  ],
  logbook: { required: true, reason: 'two flight control computer alerts and unpowered PRIM 2 and SEC 2' },
  clearing: MAINTENANCE_ONLY,
};

const DcApuBusEntry: FailureDetail = {
  whatItIs:
    'The DC APU busbar (309PP) is fed by the APU TR, or by the APU battery when no other source is available. It ' +
    'supplies the APU start motor.',
  impact: [`${BUSBAR_DEAD}`, 'The APU start contactors cannot close, so the APU cannot be started.'],
  alertIds: [],
  effects: [
    {
      where: 'SD ELEC DC',
      text: 'The DC APU busbar label turns from green to amber.',
    },
    {
      where: 'E/WD',
      text: 'No alert: neither the APU TR nor the APU battery alert reads this busbar.',
    },
  ],
  logbook: { required: true, reason: 'amber DC APU busbar and an APU that cannot be started' },
  clearing: MAINTENANCE_ONLY,
};

const DcGndFltServiceEntry: FailureDetail = {
  whatItIs:
    'The DC GND/FLT service busbar supplies LGCIU 2 and the ground servicing loads. DC 2 normally feeds it, and ' +
    'TR 2 feeds it during ground servicing.',
  impact: [
    `${BUSBAR_DEAD}`,
    'LGCIU 2 has no power and writes failure warnings.',
    'The electrical load of the ground servicing consumers is also attached to it.',
  ],
  alertIds: ['320800034'],
  effects: [
    {
      where: 'E/WD',
      text:
        `L/G CTL 2 FAULT, ${ADVISORY}, when LGCIU 2 has no power; it is not shown with L/G CTL 1+2 FAULT; ` +
        `${NOT_SHOWN_PHASES_3_TO_7_9_10}.`,
    },
  ],
  notSimulated: ['The ground servicing loads are not modelled as systems.'],
  logbook: { required: true, reason: 'advisory alert and an unpowered landing gear interface unit' },
  clearing: MAINTENANCE_ONLY,
};

// ---------------------------------------------------------------------------------------------------------------------
// DC HOT 1 to 4
// ---------------------------------------------------------------------------------------------------------------------

const HOT_BUS_NAME = ['HOT 1', 'HOT 2', 'HOT ESS', 'HOT APU'] as const;
const HOT_BUS_BATTERY = ['BAT 1', 'BAT 2', 'ESS BAT', 'APU BAT'] as const;

const HOT_BUS_CONSEQUENCES: readonly (readonly string[])[] = [
  [
    'The automatic RAT deployment solenoid loses its supply: the RAT no longer deploys by itself after a loss of all AC power (RAT MAN ON still works through the HOT ESS solenoid).',
    'The fire extinguisher bottles keep their second supply from DC ESS.',
    'The ISIS and SND lose their in-flight supply from this busbar when DC ESS is lost.',
  ],
  ['The F/O OIS laptop loses its second supply, which it uses when DC 2 is lost.'],
  [
    'The RAT MAN ON solenoid loses its supply: the pushbutton no longer deploys the RAT (the automatic solenoid still does).',
    'The emergency configuration relays are not latched when the RAT deployment is requested.',
  ],
  ['Only the electrical load of its consumers is attached to it.'],
];

const HotBusFamily: FailureDetailFamily = {
  ids: [
    A380Failure.DirectCurrentHot1,
    A380Failure.DirectCurrentHot2,
    A380Failure.DirectCurrentHot3,
    A380Failure.DirectCurrentHot4,
  ],
  detail: (number): FailureDetail => ({
    whatItIs:
      `The ${HOT_BUS_NAME[number - 1]} busbar is permanently connected to ${HOT_BUS_BATTERY[number - 1]}, so it keeps ` +
      'its few critical loads supplied even when the battery pb-sw is OFF and no source is connected.',
    impact: [BUSBAR_DEAD, ...HOT_BUS_CONSEQUENCES[number - 1]],
    alertIds: [],
    effects: [
      {
        where: 'E/WD',
        text: 'No alert and no display shows this busbar; the effects appear only when the lost function is used.',
      },
    ],
    logbook: { required: false, reason: NO_INDICATION },
    clearing: MAINTENANCE_ONLY,
  }),
};

export const Ata24BusesEntries: Record<number, FailureDetail> = {
  [A380Failure.AlternatingCurrentEssential]: AcEmerBusEntry,
  [A380Failure.AlternatingCurrentEssentialShed]: AcEssBusEntry,
  [A380Failure.AlternatingCurrent_247XP]: AcEhaBusEntry,
  [A380Failure.AlternatingCurrentGndFltService]: AcGndFltServiceEntry,
  [A380Failure.DirectCurrentEssential]: DcEssBusEntry,
  [A380Failure.DirectCurrent_247PP]: DcEhaBusEntry,
  [A380Failure.DirectCurrent_309PP]: DcApuBusEntry,
  [A380Failure.DirectCurrentGndFltService]: DcGndFltServiceEntry,
  [A380Failure.DirectCurrentEssentialPartial]: DcEssBusPartEntry,
};

export const Ata24BusesFamilies: FailureDetailFamily[] = [AcMainBusFamily, DcMainBusFamily, HotBusFamily];
