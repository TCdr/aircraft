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
export const EcamAbnormalSensedAta46495256: { [n: number]: AbnormalProcedure } = {
  // ATA 46 INFORMATION SYSTEM. The alert logic is in systems-host CpiomC/FlightWarningSystem/CommunicationAlerts.ts
  // informationSystemAlerts.
  460800001: {
    // crew awareness
    title: '\x1b<4m\x1b4mCOM\x1bm ADS DATALINK FAULT',
    sensed: true,
    items: [],
  },
  460800002: {
    title: '\x1b<4m\x1b4mCOM\x1bm ATC DATALINK FAULT',
    sensed: true,
    items: [{ name: 'ATC COM VOICE ONLY', sensed: false, style: ChecklistLineStyle.Cyan }],
  },
  460800003: {
    // crew awareness
    title: '\x1b<4m\x1b4mCOM\x1bm NSS DATA TO AVNCS XFR FAULT',
    sensed: true,
    items: [],
  },
  460800004: {
    // crew awareness
    title: '\x1b<4m\x1b4mCOM\x1bm NSS/AVNCS DATA XFR FAULT',
    sensed: true,
    items: [],
  },
  // ATA 49 APU
  490800001: {
    // The lines shown are chosen by ApuFaultAlerts.ts apuFaultItemsToShow.
    title: '\x1b<4m\x1b4mAPU\x1bm FAULT',
    sensed: true,
    items: [
      { name: 'EMER SHUTDOWN', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'APU MASTER SW', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'AUTO SHUTDOWN', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'APU MASTER SW', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'IF APU START FAILED AND FL > 150', sensed: false, condition: true },
      { name: 'BELOW FL 150 : TRY A NEW APU START', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
      { name: 'IF APU NOT ABSOLUTELY RQRD', sensed: false, condition: true },
      { name: 'APU MASTER SW', sensed: true, labelNotCompleted: 'OFF', level: 1 },
    ],
  },
  490800002: {
    // Raised by ApuFaultAlerts.ts
    title: '\x1b<4m\x1b4mAPU\x1bm MACH LIMIT EXCEEDED',
    sensed: true,
    items: [
      { name: 'IF APU NOT ABSOLUTELY RQRD', sensed: false, condition: true },
      { name: 'APU MASTER SW', sensed: true, labelNotCompleted: 'OFF', level: 1 },
    ],
  },
  490800003: {
    // Crew awareness
    title: '\x1b<4m\x1b4mAPU\x1bm OIL FILTER CLOGGED',
    sensed: true,
    items: [],
  },
  // ATA 52 DOOR
  520800008: {
    title: '\x1b<4m\x1b4mDOOR\x1bm CKPT SLIDING WINDOW NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'CKPT SLIDING WINDOW',
        labelNotCompleted: 'CLOSE',
        sensed: true,
      },
    ],
  },
  520800017: {
    title: '\x1b<4m\x1b4mDOOR\x1bm MAIN 1L NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800018: {
    title: '\x1b<4m\x1b4mDOOR\x1bm MAIN 1R NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800019: {
    title: '\x1b<4m\x1b4mDOOR\x1bm MAIN 2L NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800020: {
    title: '\x1b<4m\x1b4mDOOR\x1bm MAIN 2R NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800021: {
    title: '\x1b<4m\x1b4mDOOR\x1bm MAIN 3L NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800022: {
    title: '\x1b<4m\x1b4mDOOR\x1bm MAIN 3R NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800023: {
    title: '\x1b<4m\x1b4mDOOR\x1bm MAIN 4L NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800024: {
    title: '\x1b<4m\x1b4mDOOR\x1bm MAIN 4R NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800025: {
    title: '\x1b<4m\x1b4mDOOR\x1bm MAIN 5L NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800026: {
    title: '\x1b<4m\x1b4mDOOR\x1bm MAIN 5R NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800027: {
    title: '\x1b<4m\x1b4mDOOR\x1bm UPPER 1L NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800028: {
    title: '\x1b<4m\x1b4mDOOR\x1bm UPPER 1R NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800029: {
    title: '\x1b<4m\x1b4mDOOR\x1bm UPPER 2L NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800030: {
    title: '\x1b<4m\x1b4mDOOR\x1bm UPPER 2R NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800031: {
    title: '\x1b<4m\x1b4mDOOR\x1bm UPPER 3L NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800032: {
    title: '\x1b<4m\x1b4mDOOR\x1bm UPPER 3R NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800033: {
    title: '\x1b<4m\x1b4mDOOR\x1bm FWD CARGO NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
  520800034: {
    title: '\x1b<4m\x1b4mDOOR\x1bm AFT CARGO NOT CLOSED',
    sensed: true,
    items: [
      {
        name: 'PACK 1+2 & CAB PRESS NOT AVAIL',
        sensed: true,
        style: ChecklistLineStyle.Amber,
      },
      {
        name: 'ABNORM CAB V/S',
        sensed: false,
        condition: true,
      },
      {
        name: 'MAX FL : 100/MEA-MORA',
        sensed: false,
        level: 1,
      },
      {
        name: 'CABIN CREW',
        labelNotCompleted: 'ADVISE',
        sensed: false,
        level: 1,
      },
      {
        name: 'ATC',
        labelNotCompleted: 'NOTIFY',
        sensed: false,
        level: 1,
      },
      {
        name: 'DESCENT TO FL 100/MEA-MORA',
        labelNotCompleted: 'INITIATE',
        sensed: false,
        level: 1,
      },
    ],
  },
};
