// Copyright (c) 2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  AbnormalProcedure,
  ChecklistLineStyle,
  DeferredProcedure,
  DeferredProcedureType,
  FMS_PRED_UNRELIABLE_CHECKLIST_ITEM,
} from '..';

// Convention for IDs:
// First two digits: ATA chapter
// Third digit: Sub chapter, if needed
// Fourth digit:
//    0 for MEMOs,
//    1 for normal checklists,
//    2 for infos,
//    3 for INOP SYS,
//    4 for limitations,
//    7 for deferred procedures,
//    8 for ABN sensed procedures,
//    9 for ABN non-sensed procedures

/** All abnormal sensed procedures (alerts, via ECL) should be here. */
export const EcamAbnormalSensedAta2930: { [n: number]: AbnormalProcedure } = {
  // ATA 29 Hydraulics
  290800001: {
    title: '\x1b<4m\x1b4mHYD\x1bm G ELEC PMP A FAULT',
    sensed: true,
    items: [
      {
        name: 'G ELEC PMP A',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
    ],
  },
  290800002: {
    title: '\x1b<4m\x1b4mHYD\x1bm G ELEC PMP B FAULT',
    sensed: true,
    items: [
      {
        name: 'G ELEC PMP B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
    ],
  },
  290800003: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y ELEC PMP A FAULT',
    sensed: true,
    items: [
      {
        name: 'Y ELEC PMP A',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
    ],
  },
  290800004: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y ELEC PMP B FAULT',
    sensed: true,
    items: [
      {
        name: 'Y ELEC PMP B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
    ],
  },
  290800005: {
    title: '\x1b<4m\x1b4mHYD\x1bm G ENG 1 PMP A PRESS LO',
    sensed: true,
    items: [
      {
        name: 'G ENG 1 PMP A',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        // if on ground and low pressure on 3 hydraulic pumps
        name: 'MOVE FLAPS/SPLRS IN STRAIGHT LINE ONLY',
        sensed: false,
        style: ChecklistLineStyle.Green,
      },
    ],
  },
  290800006: {
    title: '\x1b<4m\x1b4mHYD\x1bm G ENG 1 PMP B PRESS LO',
    sensed: true,
    items: [
      {
        name: 'G ENG 1 PMP B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        // if on ground and low pressure on 3 hydraulic pumps
        name: 'MOVE FLAPS/SPLRS IN STRAIGHT LINE ONLY',
        sensed: false,
        style: ChecklistLineStyle.Green,
      },
    ],
  },
  290800007: {
    title: '\x1b<4m\x1b4mHYD\x1bm G ENG 2 PMP A PRESS LO',
    sensed: true,
    items: [
      {
        name: 'G ENG 2 PMP A',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        // if on ground and low pressure on 3 hydraulic pumps
        name: 'MOVE FLAPS/SPLRS IN STRAIGHT LINE ONLY',
        sensed: false,
        style: ChecklistLineStyle.Green,
      },
    ],
  },
  290800008: {
    title: '\x1b<4m\x1b4mHYD\x1bm G ENG 2 PMP B PRESS LO',
    sensed: true,
    items: [
      {
        name: 'G ENG 2 PMP B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        // if on ground and low pressure on 3 hydraulic pumps
        name: 'MOVE FLAPS/SPLRS IN STRAIGHT LINE ONLY',
        sensed: false,
        style: ChecklistLineStyle.Green,
      },
    ],
  },
  290800009: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y ENG 3 PMP A PRESS LO',
    sensed: true,
    items: [
      {
        name: 'Y ENG 3 PMP A',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        // if on ground and low pressure on 3 hydraulic pumps
        name: 'MOVE FLAPS/SPLRS IN STRAIGHT LINE ONLY',
        sensed: false,
        style: ChecklistLineStyle.Green,
      },
    ],
  },
  290800010: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y ENG 3 PMP B PRESS LO',
    sensed: true,
    items: [
      {
        name: 'Y ENG 3 PMP B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        // if on ground and low pressure on 3 hydraulic pumps
        name: 'MOVE FLAPS/SPLRS IN STRAIGHT LINE ONLY',
        sensed: false,
        style: ChecklistLineStyle.Green,
      },
    ],
  },
  290800011: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y ENG 4 PMP A PRESS LO',
    sensed: true,
    items: [
      {
        name: 'Y ENG 4 PMP A',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        // if on ground and low pressure on 3 hydraulic pumps
        name: 'MOVE FLAPS/SPLRS IN STRAIGHT LINE ONLY',
        sensed: false,
        style: ChecklistLineStyle.Green,
      },
    ],
  },
  290800012: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y ENG 4 PMP B PRESS LO',
    sensed: true,
    items: [
      {
        name: 'Y ENG 4 PMP B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        // if on ground and low pressure on 3 hydraulic pumps
        name: 'MOVE FLAPS/SPLRS IN STRAIGHT LINE ONLY',
        sensed: false,
        style: ChecklistLineStyle.Green,
      },
    ],
  },
  290800013: {
    title: '\x1b<4m\x1b4mHYD\x1bm G FUEL HEAT EXCHANGER VLV FAULT',
    sensed: true,
    items: [],
  },
  290800014: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y FUEL HEAT EXCHANGER VLV FAULT',
    sensed: true,
    items: [],
  },
  290800015: {
    title: '\x1b<4m\x1b4mHYD\x1bm G HEAT EXCHANGER AIR LEAK',
    sensed: true,
    items: [],
  },
  290800016: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y HEAT EXCHANGER AIR LEAK',
    sensed: true,
    items: [],
  },
  290800017: {
    title: '\x1b<4m\x1b4mHYD\x1bm G HEAT EXCHANGER AIR LEAK DET FAULT',
    sensed: true,
    items: [],
  },
  290800018: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y HEAT EXCHANGER AIR LEAK DET FAULT',
    sensed: true,
    items: [],
  },
  290800019: {
    title: '\x1b<4m\x1b4mHYD\x1bm G RSVR AIR PRESS LO',
    sensed: true,
    items: [
      {
        name: 'G SYS PRESSURE FLUCTUATES',
        sensed: false,
        condition: true,
      },
      {
        name: 'G ENG 1 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'G ENG 2 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      // if on ground and all engines off
      {
        name: 'G ELEC PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
    ],
  },
  290800020: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y RSVR AIR PRESS LO',
    sensed: true,
    items: [
      {
        name: 'Y SYS PRESSURE FLUCTUATES',
        sensed: false,
        condition: true,
      },
      {
        name: 'Y ENG 3 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'Y ENG 4 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      // if on ground and all engines off
      {
        name: 'Y ELEC PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
    ],
  },
  290800021: {
    title: '\x1b<4m\x1b4mHYD\x1bm G RSVR LEVEL LO',
    sensed: true,
    items: [
      {
        name: 'G ENG 1 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'G ENG 2 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'G ENG 1 PMP A+B',
        sensed: true,
        labelNotCompleted: 'DISC',
      },
      {
        name: 'G ENG 2 PMP A+B',
        sensed: true,
        labelNotCompleted: 'DISC',
      },

      // if on ground and all engines off
      {
        name: 'G ELEC PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
    ],
  },
  290800022: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y RSVR LEVEL LO',
    sensed: true,
    items: [
      {
        name: 'Y ENG 3 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'Y ENG 4 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'Y ENG 3 PMP A+B',
        sensed: true,
        labelNotCompleted: 'DISC',
      },
      {
        name: 'Y ENG 4 PMP A+B',
        sensed: true,
        labelNotCompleted: 'DISC',
      },

      // if on ground and all engines off
      {
        name: 'Y ELEC PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
    ],
  },
  290800023: {
    title: '\x1b<4m\x1b4mHYD\x1bm G SYS CHAN A OVHT DET FAULT',
    sensed: true,
    items: [],
  },
  290800024: {
    title: '\x1b<4m\x1b4mHYD\x1bm G SYS CHAN  B OVHT DET FAULT',
    sensed: true,
    items: [],
  },
  290800025: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y SYS CHAN A OVHT DET FAULT',
    sensed: true,
    items: [],
  },
  290800026: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y SYS CHAN B OVHT DET FAULT',
    sensed: true,
    items: [],
  },
  290800027: {
    title: '\x1b<4m\x1b4mHYD\x1bm G SYS COOLING FAULT',
    sensed: true,
    items: [],
  },
  290800028: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y SYS COOLING FAULT',
    sensed: true,
    items: [],
  },
  290800029: {
    title: '\x1b<4m\x1b4mHYD\x1bm G SYS MONITORING FAULT',
    sensed: true,
    items: [],
  },
  290800030: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y SYS MONITORING FAULT',
    sensed: true,
    items: [],
  },
  290800031: {
    title: '\x1b<4m\x1b4mHYD\x1bm G SYS OVERHEAT',
    sensed: true,
    items: [
      {
        name: 'G ENG 1 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'G ENG 2 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'G ENG 1 PMP A+B',
        sensed: true,
        labelNotCompleted: 'DISC',
      },
      {
        name: 'G ENG 2 PMP A+B',
        sensed: true,
        labelNotCompleted: 'DISC',
      },
      // if on ground and all engines off
      {
        name: 'G ELEC PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
    ],
  },
  290800032: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y SYS OVERHEAT',
    sensed: true,
    items: [
      {
        name: 'Y ENG 3 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'Y ENG 4 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'Y ENG 3 PMP A+B',
        sensed: true,
        labelNotCompleted: 'DISC',
      },
      {
        name: 'Y ENG 4 PMP A+B',
        sensed: true,
        labelNotCompleted: 'DISC',
      },
      // if on ground and all engines off
      {
        name: 'Y ELEC PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
    ],
  },
  290800033: {
    title: '\x1b<4m\x1b4mHYD\x1bm G SYS OVHT DET FAULT',
    sensed: true,
    items: [],
  },
  290800034: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y SYS OVHT DET FAULT',
    sensed: true,
    items: [],
  },
  290800035: {
    title: "\x1b<4m\x1b4mHYD\x1bm \x1b'mG SYS PRESS LO\x1bm",
    sensed: true,
    items: [
      {
        name: 'FOR TAXI : FLAP LVR 1',
        sensed: false,
      },
      {
        name: 'FLAPS SLOW',
        sensed: false,
      },
      {
        name: 'SLATS SLOW',
        sensed: false,
      },
      {
        name: 'L/G GRVTY EXTN ONLY',
        sensed: false,
      },
      {
        // if prim3 also failed
        name: 'FUEL CONSUMPT INCRSD',
        sensed: false,
      },
      { ...FMS_PRED_UNRELIABLE_CHECKLIST_ITEM },
      {
        name: 'LDG DIST AFFECTED',
        sensed: false,
      },
      {
        name: 'FOR TAXI : STEER ENDURANCE LIMITED',
        sensed: false,
      },
    ],
  },
  290800036: {
    title: "\x1b<4m\x1b4mHYD\x1bm \x1b'mY SYS PRESS LO\x1bm",
    sensed: true,
    items: [
      {
        name: 'FOR TAXI : FLAP LVR 1',
        sensed: false,
      },
      {
        name: 'FLAPS SLOW',
        sensed: false,
      },
      {
        // A380 FCOM PRO-ABN HYD G (Y) SYS PRESS LO: "L/G GRVTY EXTN ONLY" for both systems
        name: 'L/G GRVTY EXTN ONLY',
        sensed: false,
      },
      {
        // if prim2 also failed
        name: 'FUEL CONSUMPT INCRSD',
        sensed: false,
      },
      { ...FMS_PRED_UNRELIABLE_CHECKLIST_ITEM },
      {
        name: 'LDG DIST AFFECTED',
        sensed: false,
      },
    ],
  },
  290800037: {
    title: '\x1b<4m\x1b4mHYD\x1bm G SYS TEMP HI',
    sensed: true,
    items: [
      {
        name: 'G ENG 1 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'G ENG 2 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      // if on ground and all engines off
      {
        name: 'G ELEC PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },

      // if not succesfull
      {
        name: 'G ENG 1 PMP A+B',
        sensed: true,
        labelNotCompleted: 'DISC',
      },
      {
        name: 'G ENG 2 PMP A+B',
        sensed: true,
        labelNotCompleted: 'DISC',
      },
    ],
  },
  290800038: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y SYS TEMP HI',
    sensed: true,
    items: [
      {
        name: 'Y ENG 3 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'Y ENG 4 PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      // if on ground and all engines off
      {
        name: 'Y ELEC PMP A AND B',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      // if not succesfull
      {
        name: 'Y ENG 1 PMP A+B',
        sensed: true,
        labelNotCompleted: 'DISC',
      },
      {
        name: 'Y ENG 2 PMP A+B',
        sensed: true,
        labelNotCompleted: 'DISC',
      },
    ],
  },
  290800039: {
    title: "\x1b<4m\x1b4mHYD\x1bm \x1b'mG+Y SYS PRESS LO\x1bm",
    sensed: true,
    items: [
      {
        name: 'ALL ENG PMPs',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      // if flaps less than 3
      {
        name: '[MFD SURV] TAWS FLAP MODE',
        sensed: true,
        labelNotCompleted: 'OFF',
      },

      {
        name: 'SLATS SLOW',
        sensed: false,
      },

      {
        name: 'FOR LDG : FLAP LVR 3',
        sensed: false,
      },

      {
        name: 'L/G GRVTY EXTN ONLY',
        sensed: false,
      },

      {
        name: 'NO AUTOLAND',
        sensed: false,
      },

      {
        name: 'FOR GA : KEEP S/F CONF',
        sensed: false,
      },
      {
        // if prim3 also failed
        name: 'FUEL CONSUMPT INCRSD',
        sensed: false,
      },
      { ...FMS_PRED_UNRELIABLE_CHECKLIST_ITEM },
      {
        // A380 FCOM l.155898: LDG PERF AFFECTED (loss of 6 pairs of ground spoilers and 2 ailerons, increased VAPP)
        name: 'LDG PERF AFFECTED',
        sensed: false,
      },
      {
        name: 'FOR TAXI : STEER ENDURANCE LIMITED',
        sensed: false,
      },
    ],
  },
  290800040: {
    title: '\x1b<4m\x1b4mHYD\x1bm Y ELEC PMP A+B OFF',
    sensed: true,
    items: [],
  },
  // ATA 30 A-ICE
  300800001: {
    // A380 FCOM PRO-ABN-ECAM-10-30 A-ICE ICE DETECTED (a380_fcom.txt l.156579-156607)
    title: '\x1b<4m\x1b4mA-ICE\x1bm ICE DETECTED',
    sensed: true,
    items: [
      { name: 'ENG 1 A-ICE', sensed: true, labelNotCompleted: 'ON' },
      { name: 'ENG 2 A-ICE', sensed: true, labelNotCompleted: 'ON' },
      { name: 'ENG 3 A-ICE', sensed: true, labelNotCompleted: 'ON' },
      { name: 'ENG 4 A-ICE', sensed: true, labelNotCompleted: 'ON' },
    ],
  },
  300800002: {
    // A380 FCOM PRO-ABN-ECAM-10-30 A-ICE SEVERE ICE DETECTED (a380_fcom.txt l.157282-157300)
    title: '\x1b<4m\x1b4mA-ICE\x1bm SEVERE ICE DETECTED',
    sensed: true,
    items: [
      { name: 'ENG 1 A-ICE', sensed: true, labelNotCompleted: 'ON' },
      { name: 'ENG 2 A-ICE', sensed: true, labelNotCompleted: 'ON' },
      { name: 'ENG 3 A-ICE', sensed: true, labelNotCompleted: 'ON' },
      { name: 'ENG 4 A-ICE', sensed: true, labelNotCompleted: 'ON' },
      { name: 'WING A-ICE', sensed: true, labelNotCompleted: 'ON' },
    ],
  },
  // ATA 30 A-ICE valves (A380 FCOM PRO-ABN-ECAM-10-30, a380_fcom.txt l.156370-157060), see FWS AntiIceValveAlerts
  300800010: {
    // A-ICE ENG 1 VLV CLOSED (l.156374-156426)
    title: '\x1b<4m\x1b4mA-ICE\x1bm ENG 1 VLV CLOSED',
    sensed: true,
    items: [{ name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan }],
  },
  300800011: {
    // A-ICE ENG 2 VLV CLOSED (l.156374-156426)
    title: '\x1b<4m\x1b4mA-ICE\x1bm ENG 2 VLV CLOSED',
    sensed: true,
    items: [{ name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan }],
  },
  300800012: {
    // A-ICE ENG 3 VLV CLOSED (l.156374-156426)
    title: '\x1b<4m\x1b4mA-ICE\x1bm ENG 3 VLV CLOSED',
    sensed: true,
    items: [{ name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan }],
  },
  300800013: {
    // A-ICE ENG 4 VLV CLOSED (l.156374-156426)
    title: '\x1b<4m\x1b4mA-ICE\x1bm ENG 4 VLV CLOSED',
    sensed: true,
    items: [{ name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan }],
  },
  300800014: {
    // A-ICE ENG 1 VLV OPEN (l.156505-156521): crew awareness
    title: '\x1b<4m\x1b4mA-ICE\x1bm ENG 1 VLV OPEN',
    sensed: true,
    items: [],
  },
  300800015: {
    // A-ICE ENG 2 VLV OPEN (l.156505-156521): crew awareness
    title: '\x1b<4m\x1b4mA-ICE\x1bm ENG 2 VLV OPEN',
    sensed: true,
    items: [],
  },
  300800016: {
    // A-ICE ENG 3 VLV OPEN (l.156505-156521): crew awareness
    title: '\x1b<4m\x1b4mA-ICE\x1bm ENG 3 VLV OPEN',
    sensed: true,
    items: [],
  },
  300800017: {
    // A-ICE ENG 4 VLV OPEN (l.156505-156521): crew awareness
    title: '\x1b<4m\x1b4mA-ICE\x1bm ENG 4 VLV OPEN',
    sensed: true,
    items: [],
  },
  300800018: {
    // A-ICE L WING VLV CLOSED (l.156743-156830)
    title: '\x1b<4m\x1b4mA-ICE\x1bm L WING VLV CLOSED',
    sensed: true,
    items: [
      { name: 'WING A-ICE', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan },
    ],
  },
  300800019: {
    // A-ICE R WING VLV CLOSED (l.156743-156830)
    title: '\x1b<4m\x1b4mA-ICE\x1bm R WING VLV CLOSED',
    sensed: true,
    items: [
      { name: 'WING A-ICE', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan },
    ],
  },
  300800020: {
    // A-ICE L WING VLV OPEN (l.156837-156905): before takeoff and after landing, then in flight
    title: '\x1b<4m\x1b4mA-ICE\x1bm L WING VLV OPEN',
    sensed: true,
    items: [
      { name: 'X BLEED', sensed: true, labelNotCompleted: 'CLOSE' },
      { name: 'PACK 1', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'ENG 1 BLEED', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'ENG 2 BLEED', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'APU BLEED', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'BLEEDS/ PACK/ WING A-ICE AVAIL IN FLT', sensed: false },
      { name: 'ENG 1 BLEED', sensed: true, labelNotCompleted: 'ON' },
      { name: 'ENG 2 BLEED', sensed: true, labelNotCompleted: 'ON' },
      { name: 'PACK 1', sensed: true, labelNotCompleted: 'ON' },
      { name: 'X BLEED', sensed: true, labelNotCompleted: 'AUTO' },
    ],
  },
  300800021: {
    // A-ICE R WING VLV OPEN (l.156837-156905): before takeoff and after landing, then in flight
    title: '\x1b<4m\x1b4mA-ICE\x1bm R WING VLV OPEN',
    sensed: true,
    items: [
      { name: 'X BLEED', sensed: true, labelNotCompleted: 'CLOSE' },
      { name: 'PACK 2', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'ENG 3 BLEED', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'ENG 4 BLEED', sensed: true, labelNotCompleted: 'OFF' },
      // never shown for the right wing: "If L WING VLV OPEN: APU BLEED OFF" (l.156881-156882)
      { name: 'APU BLEED', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'BLEEDS/ PACK/ WING A-ICE AVAIL IN FLT', sensed: false },
      { name: 'ENG 3 BLEED', sensed: true, labelNotCompleted: 'ON' },
      { name: 'ENG 4 BLEED', sensed: true, labelNotCompleted: 'ON' },
      { name: 'PACK 2', sensed: true, labelNotCompleted: 'ON' },
      { name: 'X BLEED', sensed: true, labelNotCompleted: 'AUTO' },
    ],
  },
  300800022: {
    // A-ICE L WING VLV PRESS HI (l.156922-156937): crew awareness
    title: '\x1b<4m\x1b4mA-ICE\x1bm L WING VLV PRESS HI',
    sensed: true,
    items: [],
  },
  300800023: {
    // A-ICE R WING VLV PRESS HI (l.156922-156937): crew awareness
    title: '\x1b<4m\x1b4mA-ICE\x1bm R WING VLV PRESS HI',
    sensed: true,
    items: [],
  },
  300800024: {
    // A-ICE L WING VLV PRESS LO (l.156949-157053): on ground, then in flight
    title: '\x1b<4m\x1b4mA-ICE\x1bm L WING VLV PRESS LO',
    sensed: true,
    items: [
      { name: 'WING A-ICE', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'THRUST', sensed: false, labelNotCompleted: 'INCREASE' },
      { name: 'NOT SUCCESSFUL', sensed: false, condition: true },
      { name: 'WING A-ICE', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
    ],
  },
  300800025: {
    // A-ICE R WING VLV PRESS LO (l.156949-157053): on ground, then in flight
    title: '\x1b<4m\x1b4mA-ICE\x1bm R WING VLV PRESS LO',
    sensed: true,
    items: [
      { name: 'WING A-ICE', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'THRUST', sensed: false, labelNotCompleted: 'INCREASE' },
      { name: 'NOT SUCCESSFUL', sensed: false, condition: true },
      { name: 'WING A-ICE', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
    ],
  },
};

/**
 * ATA 29 deferred procedures. The FCOM gives no title for them; design choice: the title names the alert they come from.
 * The items checked are in FwsAbnormalSensed ewdDeferredProcs.
 */
export const EcamDeferredProcAta2930: { [n: number]: DeferredProcedure } = {
  290700001: {
    // A380 FCOM HYD G(Y) RSVR AIR PRESS LO DEFERRED PROC FOR APPROACH (a380_fcom.txt l.155249-155253): pump cavitation
    // decreases at a lower altitude, the system may be restored
    fromAbnormalProcs: ['290800019'],
    title: 'G RSVR AIR PRESS LO',
    type: DeferredProcedureType.FOR_APPROACH,
    items: [
      { name: 'G ENG 1 PMP A AND B', sensed: true, labelNotCompleted: 'ON' },
      { name: 'G ENG 2 PMP A AND B', sensed: true, labelNotCompleted: 'ON' },
    ],
  },
  290700002: {
    // Y RSVR AIR PRESS LO, as 290700001
    fromAbnormalProcs: ['290800020'],
    title: 'Y RSVR AIR PRESS LO',
    type: DeferredProcedureType.FOR_APPROACH,
    items: [
      { name: 'Y ENG 3 PMP A AND B', sensed: true, labelNotCompleted: 'ON' },
      { name: 'Y ENG 4 PMP A AND B', sensed: true, labelNotCompleted: 'ON' },
    ],
  },
  290700003: {
    // A380 FCOM HYD G(Y) SYS OVHT DEFERRED PROC APPROACH (a380_fcom.txt l.155480-155487): IF G(Y) SYS OVHT OUT, the
    // engine pumps ON; "The ECAM does not display the following procedure, if the flight crew disconnected the engine
    // pumps" (FwsAbnormalSensed ewdDeferredProcs)
    fromAbnormalProcs: ['290800031'],
    title: 'G SYS OVHT',
    type: DeferredProcedureType.FOR_APPROACH,
    items: [
      { name: 'IF G SYS OVHT OUT', sensed: true, condition: true },
      { name: 'G ENG 1 PMP A AND B', sensed: true, labelNotCompleted: 'ON', level: 1 },
      { name: 'G ENG 2 PMP A AND B', sensed: true, labelNotCompleted: 'ON', level: 1 },
    ],
  },
  290700004: {
    // Y SYS OVHT, as 290700003
    fromAbnormalProcs: ['290800032'],
    title: 'Y SYS OVHT',
    type: DeferredProcedureType.FOR_APPROACH,
    items: [
      { name: 'IF Y SYS OVHT OUT', sensed: true, condition: true },
      { name: 'Y ENG 3 PMP A AND B', sensed: true, labelNotCompleted: 'ON', level: 1 },
      { name: 'Y ENG 4 PMP A AND B', sensed: true, labelNotCompleted: 'ON', level: 1 },
    ],
  },
};
