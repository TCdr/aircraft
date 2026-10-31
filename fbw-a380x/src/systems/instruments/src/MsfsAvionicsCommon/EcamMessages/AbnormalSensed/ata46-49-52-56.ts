// Copyright (c) 2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AbnormalProcedure, ChecklistLineStyle } from '../EcamProcedureTypes';

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
  // Raised by FwsDoorSystemAlerts.ts, from the doors and slides management system (DSMS) and the cockpit door
  520800035: {
    // The emergency buzzer and the OPEN light of the cockpit door panel are not simulated
    title: '\x1b<4m\x1b4mDOOR\x1bm CKPT DOOR EMER OPENING IN PROGRESS',
    sensed: true,
    items: [{ name: 'CKPT DOOR', sensed: false, labelNotCompleted: 'LOCK AS RQRD' }],
  },
  520800101: doorActuatorFault('MAIN 1L'),
  520800102: doorActuatorFault('MAIN 1R'),
  520800103: doorActuatorFault('MAIN 2L'),
  520800104: doorActuatorFault('MAIN 2R'),
  520800105: doorActuatorFault('MAIN 3L'),
  520800106: doorActuatorFault('MAIN 3R'),
  520800107: doorActuatorFault('MAIN 4L'),
  520800108: doorActuatorFault('MAIN 4R'),
  520800109: doorActuatorFault('MAIN 5L'),
  520800110: doorActuatorFault('MAIN 5R'),
  520800111: doorActuatorFault('UPPER 1L'),
  520800112: doorActuatorFault('UPPER 1R'),
  520800113: doorActuatorFault('UPPER 2L'),
  520800114: doorActuatorFault('UPPER 2R'),
  520800115: doorActuatorFault('UPPER 3L'),
  520800116: doorActuatorFault('UPPER 3R'),
  520800121: doorFlightLockFault('MAIN 1L'),
  520800122: doorFlightLockFault('MAIN 1R'),
  520800123: doorFlightLockFault('MAIN 2L'),
  520800124: doorFlightLockFault('MAIN 2R'),
  520800125: doorFlightLockFault('MAIN 3L'),
  520800126: doorFlightLockFault('MAIN 3R'),
  520800127: doorFlightLockFault('MAIN 4L'),
  520800128: doorFlightLockFault('MAIN 4R'),
  520800129: doorFlightLockFault('MAIN 5L'),
  520800130: doorFlightLockFault('MAIN 5R'),
  520800131: doorFlightLockFault('UPPER 1L'),
  520800132: doorFlightLockFault('UPPER 1R'),
  520800133: doorFlightLockFault('UPPER 2L'),
  520800134: doorFlightLockFault('UPPER 2R'),
  520800135: doorFlightLockFault('UPPER 3L'),
  520800136: doorFlightLockFault('UPPER 3R'),
  520800141: doorLatchMonitoringFault('MAIN 1L'),
  520800142: doorLatchMonitoringFault('MAIN 1R'),
  520800143: doorLatchMonitoringFault('MAIN 2L'),
  520800144: doorLatchMonitoringFault('MAIN 2R'),
  520800145: doorLatchMonitoringFault('MAIN 3L'),
  520800146: doorLatchMonitoringFault('MAIN 3R'),
  520800147: doorLatchMonitoringFault('MAIN 4L'),
  520800148: doorLatchMonitoringFault('MAIN 4R'),
  520800149: doorLatchMonitoringFault('MAIN 5L'),
  520800150: doorLatchMonitoringFault('MAIN 5R'),
  520800151: doorLatchMonitoringFault('UPPER 1L'),
  520800152: doorLatchMonitoringFault('UPPER 1R'),
  520800153: doorLatchMonitoringFault('UPPER 2L'),
  520800154: doorLatchMonitoringFault('UPPER 2R'),
  520800155: doorLatchMonitoringFault('UPPER 3L'),
  520800156: doorLatchMonitoringFault('UPPER 3R'),
  520800161: doorPosDetFault('MAIN 1L'),
  520800162: doorPosDetFault('MAIN 1R'),
  520800163: doorPosDetFault('MAIN 2L'),
  520800164: doorPosDetFault('MAIN 2R'),
  520800165: doorPosDetFault('MAIN 3L'),
  520800166: doorPosDetFault('MAIN 3R'),
  520800167: doorPosDetFault('MAIN 4L'),
  520800168: doorPosDetFault('MAIN 4R'),
  520800169: doorPosDetFault('MAIN 5L'),
  520800170: doorPosDetFault('MAIN 5R'),
  520800171: doorPosDetFault('UPPER 1L'),
  520800172: doorPosDetFault('UPPER 1R'),
  520800173: doorPosDetFault('UPPER 2L'),
  520800174: doorPosDetFault('UPPER 2R'),
  520800175: doorPosDetFault('UPPER 3L'),
  520800176: doorPosDetFault('UPPER 3R'),
  520800181: doorSlideFault('MAIN 1L'),
  520800182: doorSlideFault('MAIN 1R'),
  520800183: doorSlideFault('MAIN 2L'),
  520800184: doorSlideFault('MAIN 2R'),
  520800185: doorSlideFault('MAIN 3L'),
  520800186: doorSlideFault('MAIN 3R'),
  520800187: doorSlideFault('MAIN 4L'),
  520800188: doorSlideFault('MAIN 4R'),
  520800189: doorSlideFault('MAIN 5L'),
  520800190: doorSlideFault('MAIN 5R'),
  520800191: doorSlideFault('UPPER 1L'),
  520800192: doorSlideFault('UPPER 1R'),
  520800193: doorSlideFault('UPPER 2L'),
  520800194: doorSlideFault('UPPER 2R'),
  520800195: doorSlideFault('UPPER 3L'),
  520800196: doorSlideFault('UPPER 3R'),
  520800201: doorSlideLengtheningFault('MAIN 1L'),
  520800202: doorSlideLengtheningFault('MAIN 1R'),
  520800203: {
    title: '\x1b<4m\x1b4mDOOR\x1bm POS DET FAULT',
    sensed: true,
    items: [
      { name: 'PACK 1+2 & CAB PRESS NOT AVAIL', sensed: true, style: ChecklistLineStyle.Amber },
      // On ground, with the three DSMS channels lost
      ...residualDiffPressCheckItems(),
      // In flight, with the three DSMS channels or all the LDCs of one side lost
      ...abnormalCabinVsItems(),
    ],
  },
  520800204: {
    title: '\x1b<4m\x1b4mDOOR\x1bm RESIDUAL DIFF PRESS DET FAULT',
    sensed: true,
    items: residualDiffPressCheckItems(),
  },
};

/** IF ABNORM CAB V/S and its five lines (the FWS adds the MAX FL limitation once the condition is checked) */
function abnormalCabinVsItems(): AbnormalProcedure['items'] {
  return [
    { name: 'ABNORM CAB V/S', sensed: false, condition: true },
    { name: 'MAX FL : 100/MEA-MORA', sensed: false, level: 1 },
    { name: 'CABIN CREW', sensed: false, labelNotCompleted: 'ADVISE', level: 1 },
    { name: 'ATC', sensed: false, labelNotCompleted: 'NOTIFY', level: 1 },
    { name: 'DESCENT TO FL 100/MEA-MORA', sensed: false, labelNotCompleted: 'INITIATE', level: 1 },
    { name: 'FLT PLANNING', sensed: false, labelNotCompleted: 'REVIEW', level: 1 },
  ];
}

function residualDiffPressCheckItems(): AbnormalProcedure['items'] {
  return [
    { name: 'BEFORE OPENING ANY CABIN DOOR:', sensed: false },
    { name: 'RESIDUAL DIFF PRESS', sensed: false, labelNotCompleted: 'CHECK' },
    { name: 'CABIN CREW', sensed: false, labelNotCompleted: 'ADVISE' },
  ];
}

/**
 * DOOR MAIN 1(2)(3)(4)(5)L(R) / UPPER 1(2)(3)L(R) ACTUATOR FAULT: the opening/closing actuator is failed, the door is
 * not usable for evacuation.
 * @param door the door, e.g. 'MAIN 1L'
 */
function doorActuatorFault(door: string): AbnormalProcedure {
  return {
    title: `\x1b<4m\x1b4mDOOR\x1bm ${door} ACTUATOR FAULT`,
    sensed: true,
    items: [{ name: 'CABIN CREW', sensed: false, labelNotCompleted: 'ADVISE' }],
  };
}

/**
 * DOOR MAIN 1(2)(3)(4)(5)L(R) / UPPER 1(2)(3)L(R) FLIGHT LOCK FAULT: FLIGHT LOCK ENGAGED and CABIN CREW ADVISE if the
 * actuator failed locked, FLIGHT LOCK NOT AVAIL on ground if it failed unlocked.
 * @param door the door, e.g. 'MAIN 1L'
 */
function doorFlightLockFault(door: string): AbnormalProcedure {
  return {
    title: `\x1b<4m\x1b4mDOOR\x1bm ${door} FLIGHT LOCK FAULT`,
    sensed: true,
    items: [
      { name: 'FLIGHT LOCK ENGAGED', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'CABIN CREW', sensed: false, labelNotCompleted: 'ADVISE' },
      { name: 'FLIGHT LOCK NOT AVAIL', sensed: false, style: ChecklistLineStyle.Green },
    ],
  };
}

/**
 * DOOR MAIN 1(2)(3)(4)(5)L(R) / UPPER 1(2)(3)L(R) LATCH MONITORING FAULT: crew awareness.
 * @param door the door, e.g. 'MAIN 1L'
 */
function doorLatchMonitoringFault(door: string): AbnormalProcedure {
  return {
    title: `\x1b<4m\x1b4mDOOR\x1bm ${door} LATCH MONITORING FAULT`,
    sensed: true,
    items: [],
  };
}

/**
 * DOOR MAIN 1(2)(3)(4)(5)L(R) / UPPER 1(2)(3)L(R) POS DET FAULT: PACK 1+2 & CAB PRESS NOT AVAIL in flight phases 1 to 3
 * if pressurization is not available, then in flight IF ABNORM CAB V/S.
 * @param door the door, e.g. 'MAIN 1L'
 */
function doorPosDetFault(door: string): AbnormalProcedure {
  return {
    title: `\x1b<4m\x1b4mDOOR\x1bm ${door} POS DET FAULT`,
    sensed: true,
    items: [
      { name: 'PACK 1+2 & CAB PRESS NOT AVAIL', sensed: true, style: ChecklistLineStyle.Amber },
      ...abnormalCabinVsItems(),
    ],
  };
}

/**
 * DOOR MAIN 1(2)(3)(4)(5)L(R) / UPPER 1(2)(3)L(R) SLIDE FAULT: PROTECTION LOST in flight phases 1 or 12 when the
 * protection against inadvertent slide inflation is lost, otherwise CABIN CREW ADVISE.
 * @param door the door, e.g. 'MAIN 1L'
 */
function doorSlideFault(door: string): AbnormalProcedure {
  return {
    title: `\x1b<4m\x1b4mDOOR\x1bm ${door} SLIDE FAULT`,
    sensed: true,
    items: [
      { name: 'PROTECTION LOST', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'CABIN CREW', sensed: false, labelNotCompleted: 'ADVISE' },
    ],
  };
}

/**
 * DOOR MAIN 1L(R) SLIDE LENGTHENING FAULT: the sill height sensors are failed, no slide extension.
 * @param door 'MAIN 1L' or 'MAIN 1R'
 */
function doorSlideLengtheningFault(door: string): AbnormalProcedure {
  return {
    title: `\x1b<4m\x1b4mDOOR\x1bm ${door} SLIDE LENGTHENING FAULT`,
    sensed: true,
    items: [{ name: 'CABIN CREW', sensed: false, labelNotCompleted: 'ADVISE' }],
  };
}
