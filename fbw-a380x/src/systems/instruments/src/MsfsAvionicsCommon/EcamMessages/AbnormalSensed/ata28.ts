// Copyright (c) 2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AbnormalProcedure, ChecklistLineStyle } from '..';

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
export const EcamAbnormalSensedAta28: { [n: number]: AbnormalProcedure } = {
  281800001: {
    title: '\x1b<4m\x1b4mFUEL\x1bm ABNORM AUTO REFUEL DISTRIBUTION',
    sensed: true,
    items: [],
  },
  281800002: {
    title: '\x1b<4m\x1b4mFUEL\x1bm ALL FEED TKs LEVEL LO',
    sensed: true,
    items: [
      {
        name: 'CROSSFEED 1+2+3+4',
        sensed: true,
        labelNotCompleted: 'ON',
      },
      {
        name: 'ALL FEED TKs PMPs',
        sensed: true,
        labelNotCompleted: 'ON',
      },
      {
        name: 'TRIM TK FEED', // If gravity transfer from the trim tank is in progress
        sensed: true,
        labelNotCompleted: 'AUTO',
      },
      {
        name: 'OUTR TK XFR', // For transfer tanks containing fuel
        sensed: true,
        labelNotCompleted: 'MAN',
      },
      {
        name: 'TRIM TK XFR', // If at least one trim tank pump is running
        sensed: true,
        labelNotCompleted: 'FWD',
      },
      {
        name: 'INR TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
      },
      {
        name: 'MID TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
      },
    ],
  },
  281800003: {
    title: '\x1b<4m\x1b4mFUEL\x1bm APU FEED FAULT',
    sensed: true,
    items: [],
  },
  281800004: {
    title: '\x1b<4m\x1b4mFUEL\x1bm APU FEED VLV NOT CLOSED',
    sensed: true,
    items: [],
  },
  281800005: {
    title: '\x1b<4m\x1b4mFUEL\x1bm AUTO GND XFR COMPLETED',
    sensed: true,
    items: [],
  },
  281800006: {
    title: '\x1b<4m\x1b4mFUEL\x1bm AUTO GND XFR FAULT',
    sensed: true,
    items: [],
  },
  281800007: {
    title: '\x1b<4m\x1b4mFUEL\x1bm CG AT FWD LIMIT',
    sensed: true,
    items: [],
  },
  281800008: {
    title: '\x1b<4m\x1b4mFUEL\x1bm CG DATA DISAGREE',
    sensed: true,
    items: [],
  },
  281800009: {
    title: '\x1b<4m\x1b4mFUEL\x1bm CG OUT OF RANGE',
    sensed: true,
    items: [],
  },
  281800010: {
    title: '\x1b<4m\x1b4mFUEL\x1bm COLLECTOR CELL 1 NOT FULL',
    sensed: true,
    items: [],
  },
  281800011: {
    title: '\x1b<4m\x1b4mFUEL\x1bm COLLECTOR CELL 2 NOT FULL',
    sensed: true,
    items: [],
  },
  281800012: {
    title: '\x1b<4m\x1b4mFUEL\x1bm COLLECTOR CELL 3 NOT FULL',
    sensed: true,
    items: [],
  },
  281800013: {
    title: '\x1b<4m\x1b4mFUEL\x1bm COLLECTOR CELL 4 NOT FULL',
    sensed: true,
    items: [],
  },
  281800014: {
    title: '\x1b<4m\x1b4mFUEL\x1bm CROSSFEED VLV 1 FAULT',
    sensed: true,
    items: [],
  },
  281800015: {
    title: '\x1b<4m\x1b4mFUEL\x1bm CROSSFEED VLV 2 FAULT',
    sensed: true,
    items: [],
  },
  281800016: {
    title: '\x1b<4m\x1b4mFUEL\x1bm CROSSFEED VLV 3 FAULT',
    sensed: true,
    items: [],
  },
  281800017: {
    title: '\x1b<4m\x1b4mFUEL\x1bm CROSSFEED VLV 4 FAULT',
    sensed: true,
    items: [],
  },
  281800018: {
    title: '\x1b<4m\x1b4mFUEL\x1bm ENG 1 LP VLV FAULT',
    sensed: true,
    items: [],
  },
  281800019: {
    title: '\x1b<4m\x1b4mFUEL\x1bm ENG 2 LP VLV FAULT',
    sensed: true,
    items: [],
  },
  281800020: {
    title: '\x1b<4m\x1b4mFUEL\x1bm ENG 3 LP VLV FAULT',
    sensed: true,
    items: [],
  },
  281800021: {
    title: '\x1b<4m\x1b4mFUEL\x1bm ENG 4 LP VLV FAULT',
    sensed: true,
    items: [],
  },
  281800022: {
    title: '\x1b<4m\x1b4mFUEL\x1bm EXCESS AFT CG',
    sensed: true,
    items: [],
  },
  281800023: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 1 LEVEL LO',
    sensed: true,
    items: [
      {
        name: 'NO FUEL LEAK',
        sensed: false,
        condition: true,
      },
      {
        name: 'CROSSFEED 1',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'CROSSFEED 2',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'TRIM TK FEED', // If gravity transfer from the trim tank is in progress
        sensed: true,
        labelNotCompleted: 'AUTO',
        level: 1,
      },
      {
        name: 'OUTR TK XFR', // For transfer tanks containing fuel:
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
      {
        name: 'TRIM TK XFR', // If at least one trim tank pump is running
        sensed: true,
        labelNotCompleted: 'FWD',
        level: 1,
      },
      {
        name: 'INR TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
      {
        name: 'MID TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
    ],
  },
  281800024: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 2 LEVEL LO',
    sensed: true,
    items: [
      {
        name: 'NO FUEL LEAK',
        sensed: false,
        condition: true,
      },
      {
        name: 'CROSSFEED 1',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'CROSSFEED 2',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'TRIM TK FEED',
        sensed: true,
        labelNotCompleted: 'AUTO',
        level: 1,
      },
      {
        name: 'OUTR TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
      {
        name: 'TRIM TK XFR',
        sensed: true,
        labelNotCompleted: 'FWD',
        level: 1,
      },
      {
        name: 'INR TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
      {
        name: 'MID TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
    ],
  },
  281800025: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 3 LEVEL LO',
    sensed: true,
    items: [
      {
        name: 'NO FUEL LEAK',
        sensed: false,
        condition: true,
      },
      {
        name: 'CROSSFEED 3',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'CROSSFEED 4',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'TRIM TK FEED',
        sensed: true,
        labelNotCompleted: 'AUTO',
        level: 1,
      },
      {
        name: 'OUTR TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
      {
        name: 'TRIM TK XFR',
        sensed: true,
        labelNotCompleted: 'FWD',
        level: 1,
      },
      {
        name: 'INR TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
      {
        name: 'MID TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
    ],
  },
  281800026: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 4 LEVEL LO',
    sensed: true,
    items: [
      {
        name: 'NO FUEL LEAK',
        sensed: false,
        condition: true,
      },
      {
        name: 'CROSSFEED 3',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'CROSSFEED 4',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'TRIM TK FEED',
        sensed: true,
        labelNotCompleted: 'AUTO',
        level: 1,
      },
      {
        name: 'OUTR TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
      {
        name: 'TRIM TK XFR',
        sensed: true,
        labelNotCompleted: 'FWD',
        level: 1,
      },
      {
        name: 'INR TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
      {
        name: 'MID TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
    ],
  },
  281800027: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 1 MAIN + STBY PMPs FAULT',
    sensed: true,
    items: [],
  },
  281800028: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 2 MAIN + STBY PMPs FAULT',
    sensed: true,
    items: [],
  },
  281800029: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 3 MAIN + STBY PMPs FAULT',
    sensed: true,
    items: [],
  },
  281800030: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 4 MAIN + STBY PMPs FAULT',
    sensed: true,
    items: [],
  },
  281800031: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 1 MAIN PMP FAULT',
    sensed: true,
    items: [],
  },
  281800032: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 2 MAIN PMP FAULT',
    sensed: true,
    items: [],
  },
  281800033: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 3 MAIN PMP FAULT',
    sensed: true,
    items: [],
  },
  281800034: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 4 MAIN PMP FAULT',
    sensed: true,
    items: [],
  },
  281800035: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 1 STBY PMP FAULT',
    sensed: true,
    items: [],
  },
  281800036: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 2 STBY PMP FAULT',
    sensed: true,
    items: [],
  },
  281800037: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 3 STBY PMP FAULT',
    sensed: true,
    items: [],
  },
  281800038: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 4 STBY PMP FAULT',
    sensed: true,
    items: [],
  },
  281800039: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 1 TEMP HI',
    sensed: true,
    items: [],
  },
  281800040: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 2 TEMP HI',
    sensed: true,
    items: [],
  },
  281800041: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 3 TEMP HI',
    sensed: true,
    items: [],
  },
  281800042: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 4 TEMP HI',
    sensed: true,
    items: [],
  },
  281800043: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FQDC 1 FAULT',
    sensed: true,
    items: [],
  },
  281800044: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FQDC 2 FAULT',
    sensed: true,
    items: [],
  },
  281800045: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FQI FAULT',
    sensed: true,
    items: [],
  },
  281800046: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FQMS 1 FAULT',
    sensed: true,
    items: [],
  },
  281800047: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FQMS 2 FAULT',
    sensed: true,
    items: [],
  },
  281800048: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FQMS 1+2 FAULT',
    sensed: true,
    items: [],
  },
  281800049: {
    title: '\x1b<4m\x1b4mFUEL\x1bm GAUGING FAULT',
    sensed: true,
    items: [],
  },
  281800050: {
    title: '\x1b<4m\x1b4mFUEL\x1bm INR TK MAN XFR COMPLETED',
    sensed: true,
    items: [],
  },
  281800051: {
    title: '\x1b<4m\x1b4mFUEL\x1bm INR TKs QTY LO',
    sensed: true,
    items: [],
  },
  281800052: {
    title: '\x1b<4m\x1b4mFUEL\x1bm JETTISON',
    sensed: true,
    items: [],
  },
  281800053: {
    title: '\x1b<4m\x1b4mFUEL\x1bm JETTISON COMPLETED',
    sensed: true,
    items: [],
  },
  281800054: {
    title: '\x1b<4m\x1b4mFUEL\x1bm JETTISON FAULT',
    sensed: true,
    items: [],
  },
  281800055: {
    title: '\x1b<4m\x1b4mFUEL\x1bm JETTISON VLV NOT CLOSED',
    sensed: true,
    items: [],
  },
  281800056: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L INR TK FWD+AFT PMPs FAULT',
    sensed: true,
    items: [],
  },
  281800057: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R INR TK FWD+AFT PMPs FAULT',
    sensed: true,
    items: [],
  },
  281800058: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L INR TK AFT PMP FAULT',
    sensed: true,
    items: [],
  },
  281800059: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L MID TK AFT PMP FAULT',
    sensed: true,
    items: [],
  },
  281800060: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R INR TK AFT PMP FAULT',
    sensed: true,
    items: [],
  },
  281800061: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R MID TK AFT PMP FAULT',
    sensed: true,
    items: [],
  },
  281800062: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L MID TK FWD PMP FAULT',
    sensed: true,
    items: [],
  },
  281800063: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L INR TK FWD PMP FAULT',
    sensed: true,
    items: [],
  },
  281800064: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R MID TK FWD PMP FAULT',
    sensed: true,
    items: [],
  },
  281800065: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R INR TK FWD PMP FAULT',
    sensed: true,
    items: [],
  },
  281800066: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L MID TK FWD+AFT PMPs FAULT',
    sensed: true,
    items: [],
  },
  281800067: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R MID TK FWD+AFT PMPs FAULT',
    sensed: true,
    items: [],
  },
  281800068: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L OUTR TK PMP FAULT',
    sensed: true,
    items: [],
  },
  281800069: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R OUTR TK PMP FAULT',
    sensed: true,
    items: [],
  },
  281800070: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L WING FEED PMPs FAULT',
    sensed: true,
    items: [],
  },
  281800071: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R WING FEED PMPs FAULT',
    sensed: true,
    items: [],
  },
  281800072: {
    title: '\x1b<4m\x1b4mFUEL\x1bm LEAK DET FAULT',
    sensed: true,
    items: [],
  },
  281800073: {
    title: '\x1b<4m\x1b4mFUEL\x1bm LEAK DETECTED',
    sensed: true,
    items: [],
  },
  281800074: {
    title: '\x1b<4m\x1b4mFUEL\x1bm MAN XFR PROCEDURE',
    sensed: true,
    items: [],
  },
  281800075: {
    title: '\x1b<4m\x1b4mFUEL\x1bm MID TK MAN XFR COMPLETED',
    sensed: true,
    items: [],
  },
  281800076: {
    title: '\x1b<4m\x1b4mFUEL\x1bm NO ZFW OR ZFWCG DATA',
    sensed: true,
    items: [
      {
        name: 'FMS ZFW OR ZFWCG VALUES',
        sensed: false,
        labelNotCompleted: 'INITIALIZE',
        labelCompleted: 'INITIALIZED',
      },
    ],
  },
  281800077: {
    title: '\x1b<4m\x1b4mFUEL\x1bm NORM + ALTN XFR FAULT',
    sensed: true,
    items: [],
  },
  281800078: {
    title: '\x1b<4m\x1b4mFUEL\x1bm NORM XFR FAULT',
    sensed: true,
    items: [],
  },
  281800079: {
    title: '\x1b<4m\x1b4mFUEL\x1bm OUTR TK XFR FAULT',
    sensed: true,
    items: [],
  },
  281800080: {
    title: '\x1b<4m\x1b4mFUEL\x1bm OUTR TK MAN XFR COMPLETED',
    sensed: true,
    items: [],
  },
  281800081: {
    title: '\x1b<4m\x1b4mFUEL\x1bm PREDICTED CG OUT OF T.O RANGE',
    sensed: true,
    items: [],
  },
  281800082: {
    title: '\x1b<4m\x1b4mFUEL\x1bm REFUEL / DEFUEL SYS FAULT',
    sensed: true,
    items: [],
  },
  281800083: {
    title: '\x1b<4m\x1b4mFUEL\x1bm REFUEL DATA / FMS DISAGREE',
    sensed: true,
    items: [],
  },
  281800084: {
    title: '\x1b<4m\x1b4mFUEL\x1bm REFUEL FAULT',
    sensed: true,
    items: [],
  },
  281800085: {
    title: '\x1b<4m\x1b4mFUEL\x1bm SYS COMPONENT FAULT',
    sensed: true,
    items: [],
  },
  281800086: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TEMP LO',
    sensed: true,
    items: [],
  },
  281800087: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM & APU LINES FAULT',
    sensed: true,
    items: [],
  },
  281800088: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK GRVTY FWD XFR FAULT',
    sensed: true,
    items: [],
  },
  281800089: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK L PMP FAULT',
    sensed: true,
    items: [],
  },
  281800090: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK R PMP FAULT',
    sensed: true,
    items: [],
  },
  281800091: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK L+R PMPs FAULT',
    sensed: true,
    items: [],
  },
  281800092: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK MAN XFR COMPLETED',
    sensed: true,
    items: [],
  },
  281800093: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK OVERFLOW',
    sensed: true,
    items: [],
  },
  281800094: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK XFR FAULT',
    sensed: true,
    items: [],
  },
  281800095: {
    title: '\x1b<4m\x1b4mFUEL\x1bm WEIGHT & BALANCE BKUP FAULT',
    sensed: true,
    items: [],
  },
  281800096: {
    title: '\x1b<4m\x1b4mFUEL\x1bm WEIGHT DATA DISAGREE',
    sensed: true,
    items: [],
  },
  281800097: {
    title: '\x1b<4m\x1b4mFUEL\x1bm WING TK OVERFLOW',
    sensed: true,
    items: [],
  },
  281800098: {
    title: '\x1b<4m\x1b4mFUEL\x1bm WINGS BALANCED',
    sensed: true,
    items: [],
  },
  281800099: {
    title: '\x1b<4m\x1b4mFUEL\x1bm WINGS MAN BALANCING PROCEDURE',
    sensed: true,
    items: [],
  },
  281800100: {
    title: '\x1b<4m\x1b4mFUEL\x1bm WINGS NOT BALANCED',
    sensed: true,
    items: [],
  },
  281800101: {
    title: '\x1b<4m\x1b4mFUEL\x1bm ZFW OR ZFWCG FMS DISAGREE',
    sensed: true,
    items: [
      {
        name: 'FMS ZFW OR ZFWCG VALUES',
        sensed: false,
        labelNotCompleted: 'REENTER',
      },
    ],
  },
  281800102: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TKs 1+2 LEVEL LO',
    sensed: true,
    items: [
      {
        name: 'NO FUEL LEAK',
        sensed: false,
        condition: true,
      },
      {
        name: 'CROSSFEED 1+2+3+4',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'TRIM TK FEED', // If gravity transfer from trim tank in progress
        sensed: true,
        labelNotCompleted: 'AUTO',
        level: 1,
      },
      {
        name: 'OUTR TK XFR', // For transfer tanks containing fuel
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
      {
        name: 'TRIM TK XFR', // If at least one trim tank pump is running
        sensed: true,
        labelNotCompleted: 'FWD',
        level: 1,
      },
      {
        name: 'INR TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
      {
        name: 'MID TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
    ],
  },
  281800103: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TKs 3+4 LEVEL LO',
    sensed: true,
    items: [
      {
        name: 'NO FUEL LEAK',
        sensed: false,
        condition: true,
      },
      {
        name: 'CROSSFEED 1+2+3+4',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'TRIM TK FEED', // If gravity transfer from trim tank in progress
        sensed: true,
        labelNotCompleted: 'AUTO',
        level: 1,
      },
      {
        name: 'OUTR TK XFR', // For transfer tanks containing fuel
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
      {
        name: 'TRIM TK XFR', // If at least one trim tank pump is running
        sensed: true,
        labelNotCompleted: 'FWD',
        level: 1,
      },
      {
        name: 'INR TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
      {
        name: 'MID TK XFR',
        sensed: true,
        labelNotCompleted: 'MAN',
        level: 1,
      },
    ],
  },
  280900001: {
    title: '\x1b<4m\x1b4mFUEL\x1bm JETTISON (WIP)',
    sensed: false,
    items: [], // TODO
  },
  280900002: {
    // A380 FCOM PRO-ABN-ECAM-10-28 FUEL LEAK DETECTED (ABN PROC FUEL LEAK)
    title: '\x1b<4m\x1b4mFUEL\x1bm FUEL LEAK',
    sensed: false,
    items: [
      { name: 'ALL TKs QTY & FOB & FU', sensed: false, labelNotCompleted: 'CHECK' },
      { name: 'FOB+FU / BLOCK DISAGREE', sensed: false, condition: true },
      { name: 'ALL CROSSFEEDS', sensed: false, labelNotCompleted: 'OFF', level: 1 },
      { name: 'INR TKs PMPs', sensed: false, labelNotCompleted: 'OFF', level: 1 },
      { name: 'MID TKs PMPs', sensed: false, labelNotCompleted: 'OFF', level: 1 },
      { name: 'OUTR TKs PMPs', sensed: false, labelNotCompleted: 'OFF', level: 1 },
      { name: 'TRIM TK PMPs', sensed: false, labelNotCompleted: 'OFF', level: 1 },
      { name: 'EXPECT FUEL IMBALANCE', sensed: false, level: 1 },
      { name: 'FEED TK LEAK SUSPECTED', sensed: false, condition: true, level: 1 },
      { name: 'THR LEVER (AFFECTED)', sensed: false, labelNotCompleted: 'IDLE', level: 2 },
      { name: 'ENG (AFFECTED) MASTER', sensed: false, labelNotCompleted: 'OFF', level: 2 },
      { name: 'FEED TK PMPs (AFFECTED)', sensed: false, labelNotCompleted: 'OFF', level: 2 },
      { name: 'LEAK STOPS', sensed: false, condition: true, level: 2 },
      { name: 'ENG (AFFECTED) MASTER : KEEP OFF', sensed: false, level: 3 },
      { name: 'FEED TK PMPs (AFFECTED)', sensed: false, labelNotCompleted: 'ON', level: 3 },
      { name: 'FOR TK BALANCING : XFEED AS RQRD', sensed: false, level: 3 },
      { name: 'LEAK CONTINUES', sensed: false, condition: true, level: 2 },
      { name: 'FEED TK PMPs (AFFECTED)', sensed: false, labelNotCompleted: 'ON', level: 3 },
      { name: 'MIN FUEL USABLE : OTHER FEED TKs', sensed: false, level: 3 },
      { name: '(ALL OTHER FUEL MAYBE LOST)', sensed: false, level: 3 },
      { name: 'FOR TK BALANCING : XFEED AS RQRD', sensed: false, level: 3 },
      { name: 'FOR ENG RELIGHT :', sensed: true, style: ChecklistLineStyle.CenteredSubHeadline, level: 3 },
      { name: 'MAX GUARANTEED ALT : 30000 FT', sensed: false, level: 4 },
      { name: 'MIN SPD (WINDML RELIGHT) : 260 KT', sensed: false, level: 4 },
      { name: 'XBLEED', sensed: false, labelNotCompleted: 'OPEN', level: 4 },
      { name: 'WING A-ICE', sensed: false, labelNotCompleted: 'OFF', level: 4 },
      { name: 'ENG START SEL', sensed: false, labelNotCompleted: 'IGN START', level: 4 },
      { name: 'ENG (AFFECTED) MASTER', sensed: false, labelNotCompleted: 'ON', level: 4 },
      { name: 'ENG RELIGHT', sensed: false, labelNotCompleted: 'MONITOR', level: 4 },
      { name: 'WHEN IDLE REACHED (ENG AVAIL)', sensed: false, condition: true, level: 4 },
      { name: 'ENG START SEL', sensed: false, labelNotCompleted: 'NORM', level: 5 },
      { name: 'TCAS MODE', sensed: false, labelNotCompleted: 'TA/RA', level: 5 },
      { name: 'XBLEED', sensed: false, labelNotCompleted: 'AUTO', level: 5 },
      { name: 'A-ICE', sensed: false, labelNotCompleted: 'AS RQRD', level: 5 },
      { name: 'TRIM TK LEAK SUSPECTED', sensed: false, condition: true, level: 1 },
      { name: 'TRIM TK PARTLY NOT USABLE', sensed: false, level: 2 },
      { name: 'TRIM TK PMPs', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'TRIM TK XFR', sensed: false, labelNotCompleted: 'FWD', level: 2 },
      { name: 'OUTR TKs LEAK SUSPECTED', sensed: false, condition: true, level: 1 },
      { name: 'OUTR TKs PARTLY NOT USABLE', sensed: false, level: 2 },
      { name: 'OUTR TK XFR', sensed: false, labelNotCompleted: 'MAN', level: 2 },
      { name: 'INR / MID TKs LEAK SUSPECTED', sensed: false, condition: true, level: 1 },
      { name: 'LEAKING TK PARTLY NOT USABLE', sensed: false, level: 2 },
      { name: 'INR TKs PMPs', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'MID TKs PMPs', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'OUTR TKs PMPs', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'TRIM TK PMPs', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'REMAINING FUEL AT DEST', sensed: false, labelNotCompleted: 'CHECK', level: 1 },
      { name: 'REVERSERS : DO NOT USE', sensed: false },
    ],
    recommendation: 'LAND ANSA',
  },
  280900003: {
    // A380 FCOM PRO-ABN-ECAM-10-28 FUEL MAN BALANCING PROCEDURE
    title: '\x1b<4m\x1b4mFUEL\x1bm MAN BALANCING PROCEDURE',
    sensed: false,
    items: [
      { name: 'DELAY T.O', sensed: false },
      { name: 'FEED TKs NOT BALANCED', sensed: false, condition: true },
      { name: 'NO FUEL LEAK', sensed: false, condition: true, level: 1 },
      { name: 'FEED TKs 1 & 4 NOT BALANCED', sensed: false, condition: true, level: 1 },
      { name: 'FUEL CONSUMPT INCRSD', sensed: false, level: 2 },
      { name: 'FMS PRED DISREGARD', sensed: false, level: 2 },
      { name: 'CROSSFEED 1', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'CROSSFEED 4', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'FOR LIGHTER TK :', sensed: false, level: 2 },
      { name: 'FEED TK PMPs', sensed: false, labelNotCompleted: 'OFF', level: 3 },
      { name: 'WHEN FEED TKs 1 & 4 BALANCED', sensed: false, condition: true, level: 2 },
      { name: 'FEED TK PMPs', sensed: false, labelNotCompleted: 'ON', level: 3 },
      { name: 'CROSSFEED 1', sensed: false, labelNotCompleted: 'OFF', level: 3 },
      { name: 'CROSSFEED 4', sensed: false, labelNotCompleted: 'OFF', level: 3 },
      { name: 'FEED TKs 2 & 3 NOT BALANCED', sensed: false, condition: true, level: 1 },
      { name: 'FUEL CONSUMPT INCRSD', sensed: false, level: 2 },
      { name: 'FMS PRED DISREGARD', sensed: false, level: 2 },
      { name: 'CROSSFEED 2', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'CROSSFEED 3', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'FOR LIGHTER TK :', sensed: false, level: 2 },
      { name: 'FEED TK PMPs', sensed: false, labelNotCompleted: 'OFF', level: 3 },
      { name: 'WHEN FEED TKs 2 & 3 BALANCED', sensed: false, condition: true, level: 2 },
      { name: 'FEED TK PMPs', sensed: false, labelNotCompleted: 'ON', level: 3 },
      { name: 'CROSSFEED 2', sensed: false, labelNotCompleted: 'OFF', level: 3 },
      { name: 'CROSSFEED 3', sensed: false, labelNotCompleted: 'OFF', level: 3 },
      { name: 'FEED TK 2 LIGHTER THAN 1', sensed: false, condition: true, level: 1 },
      { name: 'AND FEED TK 3 LIGHTER THAN 4', sensed: false, level: 1 },
      { name: 'ALL CROSSFEEDS', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'FEED TK 2 PMPs', sensed: false, labelNotCompleted: 'OFF', level: 2 },
      { name: 'FEED TK 3 PMPs', sensed: false, labelNotCompleted: 'OFF', level: 2 },
      { name: 'WHEN FEED TKs BALANCED', sensed: false, condition: true, level: 2 },
      { name: 'FEED TK 2 PMPs', sensed: false, labelNotCompleted: 'ON', level: 3 },
      { name: 'FEED TK 3 PMPs', sensed: false, labelNotCompleted: 'ON', level: 3 },
      { name: 'ALL CROSSFEEDS', sensed: false, labelNotCompleted: 'OFF', level: 3 },
      { name: 'FEED TK 1 LIGHTER THAN 2', sensed: false, condition: true, level: 1 },
      { name: 'AND FEED TK 4 LIGHTER THAN 3', sensed: false, level: 1 },
      { name: 'ALL CROSSFEEDS', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'FEED TK 1 PMPs', sensed: false, labelNotCompleted: 'OFF', level: 2 },
      { name: 'FEED TK 4 PMPs', sensed: false, labelNotCompleted: 'OFF', level: 2 },
      { name: 'WHEN FEED TKs BALANCED', sensed: false, condition: true, level: 2 },
      { name: 'FEED TK 1 PMPs', sensed: false, labelNotCompleted: 'ON', level: 3 },
      { name: 'FEED TK 4 PMPs', sensed: false, labelNotCompleted: 'ON', level: 3 },
      { name: 'ALL CROSSFEEDS', sensed: false, labelNotCompleted: 'OFF', level: 3 },
      { name: 'INR TKs NOT BALANCED', sensed: false, condition: true },
      { name: 'TKs BALANCING : ONE PAIR AT A TIME', sensed: false, level: 1 },
      { name: 'FUEL CONSUMPT INCRSD', sensed: false, level: 1 },
      { name: 'FMS PRED DISREGARD', sensed: false, level: 1 },
      { name: 'CHECK FEED TKs QTY TO AVOID OVERFLOW', sensed: false, level: 1 },
      { name: 'FOR LIGHTER TK :', sensed: false, level: 1 },
      { name: 'INR TK AFT PMP', sensed: false, labelNotCompleted: 'OFF', level: 2 },
      { name: 'INR TK XFR', sensed: false, labelNotCompleted: 'MAN', level: 2 },
      { name: 'WHEN INR TKs BALANCED', sensed: false, condition: true, level: 1 },
      { name: 'INR TK XFR', sensed: false, labelNotCompleted: 'AUTO', level: 2 },
      { name: 'INR TK AFT PMP', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'MID TKs NOT BALANCED', sensed: false, condition: true },
      { name: 'TKs BALANCING : ONE PAIR AT A TIME', sensed: false, level: 1 },
      { name: 'FUEL CONSUMPT INCRSD', sensed: false, level: 1 },
      { name: 'FMS PRED DISREGARD', sensed: false, level: 1 },
      { name: 'CHECK FEED TKs QTY TO AVOID OVERFLOW', sensed: false, level: 1 },
      { name: 'FOR LIGHTER TK :', sensed: false, level: 1 },
      { name: 'MID TK AFT PMP', sensed: false, labelNotCompleted: 'OFF', level: 2 },
      { name: 'MID TK XFR', sensed: false, labelNotCompleted: 'MAN', level: 2 },
      { name: 'WHEN MID TKs BALANCED', sensed: false, condition: true, level: 1 },
      { name: 'MID TK XFR', sensed: false, labelNotCompleted: 'AUTO', level: 2 },
      { name: 'MID TK AFT PMP', sensed: false, labelNotCompleted: 'ON', level: 2 },
      { name: 'OUTR TKs MAN BALANCING NOT AVAIL', sensed: false },
    ],
  },
};
