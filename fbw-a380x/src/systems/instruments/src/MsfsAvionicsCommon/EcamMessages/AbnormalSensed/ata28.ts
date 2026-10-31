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

/**
 * The lines of the FUEL LEAK DETECTED procedure, shared by the alert of the FQMS leak detection (281800073) and the ABN
 * PROC FUEL LEAK (280900002).
 */
const FUEL_LEAK_PROCEDURE_ITEMS: AbnormalProcedure['items'] = [
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
];

/** The lines of FUEL_LEAK_PROCEDURE_ITEMS whose outcome (STATUS) depends on the leak behaviour */
export const FUEL_LEAK_STOPS_ITEM_INDEX = FUEL_LEAK_PROCEDURE_ITEMS.findIndex((item) => item.name === 'LEAK STOPS');
export const FUEL_LEAK_CONTINUES_ITEM_INDEX = FUEL_LEAK_PROCEDURE_ITEMS.findIndex(
  (item) => item.name === 'LEAK CONTINUES',
);

/**
 * FUEL COLLECTOR CELL 1(2)(3)(4) NOT FULL; FwsFuelTankAlerts collectorCellNotFullLines chooses the lines shown.
 * @param cell the collector cell, 1 to 4
 */
function collectorCellNotFullItems(cell: number): AbnormalProcedure['items'] {
  const opposite = 5 - cell;
  const items: AbnormalProcedure['items'] = [
    { name: 'NO FUEL LEAK', sensed: false, condition: true },
    { name: `FEED TK ${cell} MAIN PMP`, sensed: true, labelNotCompleted: 'ON', level: 1 },
    { name: `FEED TK ${cell} STBY PMP`, sensed: true, labelNotCompleted: 'ON', level: 1 },
    { name: `FEED TK ${opposite} MAIN PMP`, sensed: true, labelNotCompleted: 'ON', level: 1 },
    { name: `FEED TK ${opposite} STBY PMP`, sensed: true, labelNotCompleted: 'ON', level: 1 },
    { name: `CROSSFEED ${cell}`, sensed: true, labelNotCompleted: 'ON', level: 1 },
    { name: `CROSSFEED ${opposite}`, sensed: true, labelNotCompleted: 'ON', level: 1 },
  ];
  if (cell === 2 || cell === 3) {
    items.push({ name: `FEED TK ${cell} : 2000 KG MAX NOT USABLE`, sensed: false, style: ChecklistLineStyle.Cyan });
  }
  return items;
}

/**
 * FUEL FEED TK 1(2)(3)(4) TEMP HI: DELAY T.O on ground, the other lines in flight (FwsFuelTankAlerts
 * feedTankTempHiLines chooses them).
 * @param tank the feed tank, 1 to 4
 */
function feedTankTempHiItems(tank: number): AbnormalProcedure['items'] {
  return [
    { name: 'DELAY T.O', sensed: false, style: ChecklistLineStyle.Cyan },
    { name: `ENG ${tank} PARAMETERS`, sensed: false, labelNotCompleted: 'MONITOR' },
    { name: 'ABNORMAL', sensed: false, condition: true },
    { name: `THR LEVER ${tank}`, sensed: false, labelNotCompleted: 'IDLE', level: 1 },
  ];
}

/** All abnormal sensed procedures (alerts, via ECL) should be here. */
export const EcamAbnormalSensedAta28: { [n: number]: AbnormalProcedure } = {
  281800001: {
    title: '\x1b<4m\x1b4mFUEL\x1bm ABNORM AUTO REFUEL DISTRIBUTION',
    sensed: true,
    items: [
      { name: 'WHEN REFUEL COMPLETED (AUTO RCL)', sensed: true, condition: true },
      { name: 'AUTO GND XFR', sensed: true, labelNotCompleted: 'ON', level: 1 },
    ],
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
    items: [{ name: 'APU MASTER SW', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800004: {
    title: '\x1b<4m\x1b4mFUEL\x1bm APU FEED VLV NOT CLOSED',
    sensed: true,
    items: [],
  },
  281800005: {
    title: '\x1b<4m\x1b4mFUEL\x1bm AUTO GND XFR COMPLETED',
    sensed: true,
    items: [{ name: 'AUTO GND XFR', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800006: {
    title: '\x1b<4m\x1b4mFUEL\x1bm AUTO GND XFR FAULT',
    sensed: true,
    items: [
      // FwsFuelRefuelAlerts autoGndXfrFaultLines
      { name: 'TWO OR MORE ENGs RUNNING', sensed: true, condition: true },
      { name: 'INHIBITED BY SECOND ENG START', sensed: false, style: ChecklistLineStyle.Green, level: 1 },
      { name: 'GW & GWCG', sensed: false, labelNotCompleted: 'CHECK', level: 1 },
      { name: 'AUTO GND XFR', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'AUTO GND XFR FAILED', sensed: true, condition: true },
      { name: 'NO ZFW OR ZFWCG IN FMS', sensed: true, condition: true, level: 1 },
      { name: 'FMS ZFW OR ZFWCG VALUES', sensed: true, labelNotCompleted: 'INITIALIZE', level: 2 },
      { name: 'ALL TKs PMPs', sensed: true, labelNotCompleted: 'ON', level: 1 },
      { name: 'ALL CROSSFEEDS', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'OUTR TK XFR', sensed: true, labelNotCompleted: 'AUTO', level: 1 },
      { name: 'MID TK XFR', sensed: true, labelNotCompleted: 'AUTO', level: 1 },
      { name: 'INR TK XFR', sensed: true, labelNotCompleted: 'AUTO', level: 1 },
      { name: 'TRIM TK XFR', sensed: true, labelNotCompleted: 'AUTO', level: 1 },
      { name: 'TRIM TK FEED', sensed: true, labelNotCompleted: 'AUTO', level: 1 },
    ],
  },
  281800007: {
    title: '\x1b<4m\x1b4mFUEL\x1bm CG AT FWD LIMIT',
    sensed: true,
    // FwsFuelCgWeightAlerts cgAtFwdLimitLines
    items: [
      { name: 'NO TRIM TK COLD FUEL', sensed: true, condition: true },
      { name: 'TRIM TK XFR', sensed: true, labelNotCompleted: 'AUTO', level: 1 },
      { name: 'TRIM TK FEED', sensed: true, labelNotCompleted: 'ISOL', level: 1 },
      { name: 'WHEN CG ALLOWS TRIM TK FWD XFR', sensed: false, condition: true, level: 1 },
      // If a pumped manual transfer can be performed
      { name: 'TRIM TK FEED', sensed: false, labelNotCompleted: 'AUTO', level: 2 },
      { name: 'TRIM TK XFR', sensed: false, labelNotCompleted: 'FWD', level: 2 },
      // If only a gravity forward transfer is possible
      { name: 'PITCH ATT < 3° FOR GRVTY FWD XFR', sensed: false, style: ChecklistLineStyle.Cyan, level: 2 },
      { name: 'TRIM TK FEED', sensed: false, labelNotCompleted: 'OPEN', level: 2 },
    ],
  },
  281800008: {
    title: '\x1b<4m\x1b4mFUEL\x1bm CG DATA DISAGREE',
    sensed: true,
    items: [
      { name: 'ERROR > 8% DETECTED BY F/CTL', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'FMS ZFWCG VALUE', sensed: false, labelNotCompleted: 'CONFIRM' },
    ],
  },
  281800009: {
    title: '\x1b<4m\x1b4mFUEL\x1bm CG OUT OF RANGE',
    sensed: true,
    // FwsFuelCgWeightAlerts cgOutOfRangeLines
    items: [
      { name: 'DELAY ENG START', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'AUTO GND XFR', sensed: true, labelNotCompleted: 'ON' },
      { name: 'DELAY T.O', sensed: false, style: ChecklistLineStyle.Cyan },
    ],
  },
  281800010: {
    title: '\x1b<4m\x1b4mFUEL\x1bm COLLECTOR CELL 1 NOT FULL',
    sensed: true,
    items: collectorCellNotFullItems(1),
  },
  281800011: {
    title: '\x1b<4m\x1b4mFUEL\x1bm COLLECTOR CELL 2 NOT FULL',
    sensed: true,
    items: collectorCellNotFullItems(2),
  },
  281800012: {
    title: '\x1b<4m\x1b4mFUEL\x1bm COLLECTOR CELL 3 NOT FULL',
    sensed: true,
    items: collectorCellNotFullItems(3),
  },
  281800013: {
    title: '\x1b<4m\x1b4mFUEL\x1bm COLLECTOR CELL 4 NOT FULL',
    sensed: true,
    items: collectorCellNotFullItems(4),
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
    // Before takeoff
    items: [{ name: 'ENG 1 MASTER', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800019: {
    title: '\x1b<4m\x1b4mFUEL\x1bm ENG 2 LP VLV FAULT',
    sensed: true,
    // Before takeoff
    items: [{ name: 'ENG 2 MASTER', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800020: {
    title: '\x1b<4m\x1b4mFUEL\x1bm ENG 3 LP VLV FAULT',
    sensed: true,
    // Before takeoff
    items: [{ name: 'ENG 3 MASTER', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800021: {
    title: '\x1b<4m\x1b4mFUEL\x1bm ENG 4 LP VLV FAULT',
    sensed: true,
    // Before takeoff
    items: [{ name: 'ENG 4 MASTER', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800022: {
    title: '\x1b<4m\x1b4mFUEL\x1bm EXCESS AFT CG',
    sensed: true,
    // FwsFuelCgWeightAlerts excessAftCgLines
    items: [
      { name: 'TRIM TK FEED', sensed: true, labelNotCompleted: 'AUTO' }, // If the trim tank is isolated
      { name: 'TRIM TK XFR', sensed: true, labelNotCompleted: 'FWD' }, // If the trim tank is not empty
      { name: 'NOT SUCCESSFUL', sensed: false, condition: true },
      { name: 'TRIM TK XFR', sensed: false, labelNotCompleted: 'AUTO', level: 1 },
      { name: 'PITCH ATT < 3° FOR GRVTY FWD XFR', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
      { name: 'TRIM TK FEED', sensed: false, labelNotCompleted: 'OPEN', level: 1 },
      { name: 'NOT SUCCESSFUL', sensed: false, condition: true, level: 1 },
      { name: 'MAX FLT TIME : 4 HR', sensed: false, style: ChecklistLineStyle.Cyan, level: 2 },
      { name: 'TRIM TK NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan, level: 2 },
      { name: 'OUTR TK XFR', sensed: true, labelNotCompleted: 'MAN', level: 2 }, // If the outer tanks are not empty
      // If the trim tank is empty
      { name: 'MAX FLT TIME : 4 HR', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'OUTR TK XFR', sensed: true, labelNotCompleted: 'MAN' }, // If the outer tanks are not empty
    ],
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
    items: [
      { name: 'CROSSFEED 1', sensed: true, labelNotCompleted: 'ON' },
      { name: 'CROSSFEED 2', sensed: true, labelNotCompleted: 'ON' },
      { name: 'FEED TK 1 MAIN PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'FEED TK 1 STBY PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'AVOID NEG G LOAD', sensed: false, style: ChecklistLineStyle.Cyan },
    ],
  },
  281800028: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 2 MAIN + STBY PMPs FAULT',
    sensed: true,
    items: [
      { name: 'CROSSFEED 1', sensed: true, labelNotCompleted: 'ON' },
      { name: 'CROSSFEED 2', sensed: true, labelNotCompleted: 'ON' },
      { name: 'FEED TK 2 MAIN PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'FEED TK 2 STBY PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'AVOID NEG G LOAD', sensed: false, style: ChecklistLineStyle.Cyan },
    ],
  },
  281800029: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 3 MAIN + STBY PMPs FAULT',
    sensed: true,
    items: [
      { name: 'CROSSFEED 3', sensed: true, labelNotCompleted: 'ON' },
      { name: 'CROSSFEED 4', sensed: true, labelNotCompleted: 'ON' },
      { name: 'FEED TK 3 MAIN PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'FEED TK 3 STBY PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'AVOID NEG G LOAD', sensed: false, style: ChecklistLineStyle.Cyan },
    ],
  },
  281800030: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 4 MAIN + STBY PMPs FAULT',
    sensed: true,
    items: [
      { name: 'CROSSFEED 3', sensed: true, labelNotCompleted: 'ON' },
      { name: 'CROSSFEED 4', sensed: true, labelNotCompleted: 'ON' },
      { name: 'FEED TK 4 MAIN PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'FEED TK 4 STBY PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'AVOID NEG G LOAD', sensed: false, style: ChecklistLineStyle.Cyan },
    ],
  },
  281800031: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 1 MAIN PMP FAULT',
    sensed: true,
    items: [{ name: 'FEED TK 1 MAIN PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800032: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 2 MAIN PMP FAULT',
    sensed: true,
    items: [{ name: 'FEED TK 2 MAIN PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800033: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 3 MAIN PMP FAULT',
    sensed: true,
    items: [{ name: 'FEED TK 3 MAIN PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800034: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 4 MAIN PMP FAULT',
    sensed: true,
    items: [{ name: 'FEED TK 4 MAIN PMP', sensed: true, labelNotCompleted: 'OFF' }],
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
    items: feedTankTempHiItems(1),
  },
  281800040: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 2 TEMP HI',
    sensed: true,
    items: feedTankTempHiItems(2),
  },
  281800041: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 3 TEMP HI',
    sensed: true,
    items: feedTankTempHiItems(3),
  },
  281800042: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FEED TK 4 TEMP HI',
    sensed: true,
    items: feedTankTempHiItems(4),
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
    // FwsFuelManagementAlerts fqiFaultItemsToShow
    items: [
      { name: 'FUEL XFR : MAN ONLY', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'FOB COMPUTED FROM FU', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'GWCG FROM WBBC', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'GW FROM WBBC', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'LAND ANSA', sensed: true, style: ChecklistLineStyle.LandAnsa },
      { name: 'NO FQI AVAIL', sensed: true, condition: true },
      { name: 'INR TKs NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
      { name: 'MID TKs NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
      { name: 'TRIM TK NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
      { name: 'USE TRIM TK XFR FOR CG IF NECESSARY', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
      { name: 'OUTR TKs PMPs', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'OUTR TK XFR', sensed: true, labelNotCompleted: 'MAN', level: 1 },
    ],
  },
  281800046: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FQMS 1 FAULT',
    sensed: true,
    // FwsFuelManagementAlerts fuelManagementAbnormalItems
    items: [{ name: 'FQMS 1', sensed: false, labelNotCompleted: 'RESET' }],
  },
  281800047: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FQMS 2 FAULT',
    sensed: true,
    // FwsFuelManagementAlerts fuelManagementAbnormalItems
    items: [{ name: 'FQMS 2', sensed: false, labelNotCompleted: 'RESET' }],
  },
  281800048: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FQMS 1+2 FAULT',
    sensed: true,
    // FwsFuelManagementAlerts fuelManagementAbnormalItems
    items: [
      { name: 'FQMS 1+2 (ONE BY ONE)', sensed: false, labelNotCompleted: 'RESET' },
      { name: 'WAIT FOR 1 MIN AFTER RESET', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'ALERT PERSISTS', sensed: false, condition: true },
      { name: 'FQMS 1 RESET', sensed: false, labelNotCompleted: 'PULL', level: 1 },
      { name: 'ALERT PERSISTS', sensed: false, condition: true },
      { name: 'FQMS 1 RESET', sensed: false, labelNotCompleted: 'PUSH', level: 1 },
      { name: 'FQMS 2 RESET', sensed: false, labelNotCompleted: 'PULL', level: 1 },
      { name: 'ALERT PERSISTS', sensed: false, condition: true, level: 1 },
      { name: 'FQMS 2 RESET', sensed: false, labelNotCompleted: 'PUSH', level: 2 },
      { name: 'LOSS OF FUEL XFR INDICATIONS', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'ALTN GAUGING ONLY', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'FOB COMPUTED FROM FU', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'FUEL XFR : MAN ONLY', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'GW FROM WBBC', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'GWCG FROM WBBC', sensed: false, style: ChecklistLineStyle.Green },
    ],
  },
  281800049: {
    title: '\x1b<4m\x1b4mFUEL\x1bm GAUGING FAULT',
    sensed: true,
    // FwsFuelManagementAlerts fuelManagementAbnormalItems: shown on ground only
    items: [{ name: 'GAUGING MEDIUM DEGRADATION', sensed: false, style: ChecklistLineStyle.Green }],
  },
  281800050: {
    title: '\x1b<4m\x1b4mFUEL\x1bm INR TK MAN XFR COMPLETED',
    sensed: true,
    // FwsFuelTankAlerts manualTransferCompletedLines
    items: [{ name: 'INR TK XFR', sensed: true, labelNotCompleted: 'AUTO' }],
  },
  281800051: {
    title: '\x1b<4m\x1b4mFUEL\x1bm INR TKs QTY LO',
    sensed: true,
    items: [
      // the AUTO GND XFR pb-sw is INOP in the simulation: a crew check box
      {
        name: 'REFUEL NOT PLANNED',
        sensed: false,
        condition: true,
      },
      {
        name: 'AUTO GND XFR',
        sensed: false,
        labelNotCompleted: 'ON',
        level: 1,
      },
    ],
  },
  281800052: {
    title: '\x1b<4m\x1b4mFUEL\x1bm JETTISON',
    sensed: true,
    items: [],
  },
  281800053: {
    title: '\x1b<4m\x1b4mFUEL\x1bm JETTISON COMPLETED',
    sensed: true,
    items: [
      {
        name: 'JETTISON ACTIVE',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'JETTISON ARM',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
    ],
  },
  281800054: {
    title: '\x1b<4m\x1b4mFUEL\x1bm JETTISON FAULT',
    sensed: true,
    items: [
      { name: 'JETTISON L VLV FAULT', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'JETTISON R VLV FAULT', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'JETTISON NOT AVAIL', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'JETTISON ACTIVE', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'JETTISON ARM', sensed: true, labelNotCompleted: 'OFF' },
    ],
  },
  281800055: {
    title: '\x1b<4m\x1b4mFUEL\x1bm JETTISON VLV NOT CLOSED',
    sensed: true,
    items: [
      { name: 'JETTISON ACTIVE', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'JETTISON ARM', sensed: true, labelNotCompleted: 'OFF' },
    ],
  },
  281800056: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L INR TK FWD+AFT PMPs FAULT',
    sensed: true,
    items: [
      { name: 'L INR TK FWD PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'L INR TK AFT PMP', sensed: true, labelNotCompleted: 'OFF' },
    ],
  },
  281800057: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R INR TK FWD+AFT PMPs FAULT',
    sensed: true,
    items: [
      { name: 'R INR TK FWD PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'R INR TK AFT PMP', sensed: true, labelNotCompleted: 'OFF' },
    ],
  },
  281800058: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L INR TK AFT PMP FAULT',
    sensed: true,
    items: [{ name: 'L INR TK AFT PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800059: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L MID TK AFT PMP FAULT',
    sensed: true,
    items: [{ name: 'L MID TK AFT PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800060: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R INR TK AFT PMP FAULT',
    sensed: true,
    items: [{ name: 'R INR TK AFT PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800061: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R MID TK AFT PMP FAULT',
    sensed: true,
    items: [{ name: 'R MID TK AFT PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800062: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L MID TK FWD PMP FAULT',
    sensed: true,
    items: [{ name: 'L MID TK FWD PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800063: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L INR TK FWD PMP FAULT',
    sensed: true,
    items: [{ name: 'L INR TK FWD PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800064: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R MID TK FWD PMP FAULT',
    sensed: true,
    items: [{ name: 'R MID TK FWD PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800065: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R INR TK FWD PMP FAULT',
    sensed: true,
    items: [{ name: 'R INR TK FWD PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800066: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L MID TK FWD+AFT PMPs FAULT',
    sensed: true,
    items: [
      { name: 'L MID TK FWD PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'L MID TK AFT PMP', sensed: true, labelNotCompleted: 'OFF' },
    ],
  },
  281800067: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R MID TK FWD+AFT PMPs FAULT',
    sensed: true,
    items: [
      { name: 'R MID TK FWD PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'R MID TK AFT PMP', sensed: true, labelNotCompleted: 'OFF' },
    ],
  },
  281800068: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L OUTR TK PMP FAULT',
    sensed: true,
    items: [{ name: 'L OUTR TK PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800069: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R OUTR TK PMP FAULT',
    sensed: true,
    items: [{ name: 'R OUTR TK PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800070: {
    title: '\x1b<4m\x1b4mFUEL\x1bm L WING FEED PMPs FAULT',
    sensed: true,
    items: [
      // Before takeoff
      {
        name: 'FEED TK 1 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'FEED TK 1 STBY PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'FEED TK 2 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'FEED TK 2 STBY PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'FEED TK 1 : 1300 KG MAX NOT USABLE',
        sensed: false,
      },
      {
        name: 'FEED TK 2 : 2000 KG MAX NOT USABLE',
        sensed: false,
      },
      // After takeoff
      {
        name: 'ALL CROSSFEEDS',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'NO FUEL LEAK',
        sensed: false,
        condition: true,
      },
      {
        name: 'ALL CROSSFEEDS',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'FEED TK 1 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'FEED TK 1 STBY PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'FEED TK 2 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'FEED TK 2 STBY PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'FEED TK 1 : 1300 KG MAX NOT USABLE',
        sensed: false,
        level: 1,
      },
      {
        name: 'FEED TK 2 : 2000 KG MAX NOT USABLE',
        sensed: false,
        level: 1,
      },
      {
        name: 'WHEN INR & MID TKs EMPTY :',
        sensed: false,
        level: 1,
      },
      // If flight time above FL 300 since departure is greater than 30 min
      {
        name: 'DESCENT TO FL 280',
        sensed: false,
        labelNotCompleted: 'INITIATE',
        level: 2,
      },
      {
        name: 'MAX FL : 280',
        sensed: false,
        level: 2,
      },
      // If flight time above FL 300 since departure is less than 30 min
      {
        name: 'DESCENT TO FL 50/MEA',
        sensed: false,
        labelNotCompleted: 'INITIATE',
        level: 2,
      },
      {
        name: 'MAX FL : 50/MEA',
        sensed: false,
        level: 2,
      },
      {
        name: 'ENG START SEL',
        sensed: true,
        labelNotCompleted: 'IGN START',
        level: 2,
      },
      {
        name: 'ALL CROSSFEEDS',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 2,
      },
      {
        name: 'EXPECT NORM COLLECTOR CELL DEPLETION',
        sensed: false,
        style: ChecklistLineStyle.Green,
        level: 2,
      },
      {
        name: 'AVOID NEG G LOAD',
        sensed: false,
        level: 2,
      },
    ],
  },
  281800071: {
    title: '\x1b<4m\x1b4mFUEL\x1bm R WING FEED PMPs FAULT',
    sensed: true,
    items: [
      // Before takeoff
      {
        name: 'FEED TK 3 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'FEED TK 3 STBY PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'FEED TK 4 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'FEED TK 4 STBY PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'FEED TK 4 : 1300 KG MAX NOT USABLE',
        sensed: false,
      },
      {
        name: 'FEED TK 3 : 2000 KG MAX NOT USABLE',
        sensed: false,
      },
      // After takeoff
      {
        name: 'ALL CROSSFEEDS',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'NO FUEL LEAK',
        sensed: false,
        condition: true,
      },
      {
        name: 'ALL CROSSFEEDS',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'FEED TK 3 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'FEED TK 3 STBY PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'FEED TK 4 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'FEED TK 4 STBY PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'FEED TK 4 : 1300 KG MAX NOT USABLE',
        sensed: false,
        level: 1,
      },
      {
        name: 'FEED TK 3 : 2000 KG MAX NOT USABLE',
        sensed: false,
        level: 1,
      },
      {
        name: 'WHEN INR & MID TKs EMPTY :',
        sensed: false,
        level: 1,
      },
      // If flight time above FL 300 since departure is greater than 30 min
      {
        name: 'DESCENT TO FL 280',
        sensed: false,
        labelNotCompleted: 'INITIATE',
        level: 2,
      },
      {
        name: 'MAX FL : 280',
        sensed: false,
        level: 2,
      },
      // If flight time above FL 300 since departure is less than 30 min
      {
        name: 'DESCENT TO FL 50/MEA',
        sensed: false,
        labelNotCompleted: 'INITIATE',
        level: 2,
      },
      {
        name: 'MAX FL : 50/MEA',
        sensed: false,
        level: 2,
      },
      {
        name: 'ENG START SEL',
        sensed: true,
        labelNotCompleted: 'IGN START',
        level: 2,
      },
      {
        name: 'ALL CROSSFEEDS',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 2,
      },
      {
        name: 'EXPECT NORM COLLECTOR CELL DEPLETION',
        sensed: false,
        style: ChecklistLineStyle.Green,
        level: 2,
      },
      {
        name: 'AVOID NEG G LOAD',
        sensed: false,
        level: 2,
      },
    ],
  },
  281800072: {
    title: '\x1b<4m\x1b4mFUEL\x1bm LEAK DET FAULT',
    sensed: true,
    items: [],
  },
  281800073: {
    title: '\x1b<4m\x1b4mFUEL\x1bm LEAK DETECTED',
    sensed: true,
    items: FUEL_LEAK_PROCEDURE_ITEMS,
    recommendation: 'LAND ANSA',
  },
  281800074: {
    title: '\x1b<4m\x1b4mFUEL\x1bm MAN XFR PROCEDURE',
    sensed: true,
    // FwsFuelManagementAlerts manXfrProcedureItemsToShow
    items: [
      { name: 'WAIT FOR WINGS BALANCING COMPLETION', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'WHEN ANY FEED TK < 13000 KG', sensed: true, condition: true },
      { name: 'INR TK XFR', sensed: true, labelNotCompleted: 'MAN', level: 1 },
      { name: 'WHEN ANY FEED TK FULL', sensed: true, condition: true },
      { name: 'INR TK XFR', sensed: true, labelNotCompleted: 'AUTO', level: 1 },
      { name: 'L INR TK AFT PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'R INR TK AFT PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'WHEN ANY FEED TK < 13000 KG', sensed: true, condition: true },
      { name: 'MID TK XFR', sensed: true, labelNotCompleted: 'MAN', level: 1 },
      { name: 'WHEN ANY FEED TK FULL', sensed: true, condition: true },
      { name: 'MID TK XFR', sensed: true, labelNotCompleted: 'AUTO', level: 1 },
      { name: 'WHEN ANY FEED TK < 13000 KG', sensed: true, condition: true },
      { name: 'OUTR TK XFR', sensed: true, labelNotCompleted: 'MAN', level: 1 },
      { name: 'TRIM TK XFR', sensed: true, labelNotCompleted: 'FWD' },
    ],
  },
  281800075: {
    title: '\x1b<4m\x1b4mFUEL\x1bm MID TK MAN XFR COMPLETED',
    sensed: true,
    // FwsFuelTankAlerts manualTransferCompletedLines
    items: [{ name: 'MID TK XFR', sensed: true, labelNotCompleted: 'AUTO' }],
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
    // FwsFuelManagementAlerts fuelManagementAbnormalItems
    items: [
      { name: 'XFR PMPs OFF', sensed: false, condition: true },
      { name: 'ALL XFR PMPs', sensed: false, labelNotCompleted: 'RESELECT', level: 1 },
      { name: 'FQMS 1+2 (ONE BY ONE)', sensed: false, labelNotCompleted: 'RESET' },
      { name: 'INR TKs NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'MID TKs NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'TRIM TK NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'USE TRIM TK XFR FOR CG IF NECESSARY', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'FEED TK 1 + 4 < 15000 KG', sensed: true, condition: true },
      { name: 'EMER OUTR TK XFR', sensed: true, labelNotCompleted: 'ON', level: 1 },
      { name: 'EXPECT FEED TKS IMBALANCE', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
      { name: 'FUEL MAN BALANCING PROC', sensed: false, labelNotCompleted: 'CONSIDER', level: 1 },
    ],
  },
  281800078: {
    title: '\x1b<4m\x1b4mFUEL\x1bm NORM XFR FAULT',
    sensed: true,
    // FwsFuelManagementAlerts normXfrFaultItemsToShow
    items: [
      { name: 'FEED TK 1 FWD INLET VLV FAULT', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'FEED TK 1 AFT INLET VLV FAULT', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'FEED TK 1 + 4 < 15000 KG', sensed: true, condition: true },
      { name: 'EMER OUTR TK XFR', sensed: true, labelNotCompleted: 'ON', level: 1 },
      { name: 'EXPECT FEED TKS IMBALANCE', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
      { name: 'FUEL MAN BALANCING PROC', sensed: false, labelNotCompleted: 'CONSIDER', level: 1 },
    ],
  },
  281800079: {
    title: '\x1b<4m\x1b4mFUEL\x1bm OUTR TK XFR FAULT',
    sensed: true,
    // FwsFuelManagementAlerts fuelManagementAbnormalItems
    items: [
      { name: 'L OUTR TK PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'R OUTR TK PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'EXPECT FEED TKS IMBALANCE', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'FUEL MAN BALANCING PROC', sensed: false, labelNotCompleted: 'CONSIDER' },
    ],
  },
  281800080: {
    title: '\x1b<4m\x1b4mFUEL\x1bm OUTR TK MAN XFR COMPLETED',
    sensed: true,
    // FwsFuelTankAlerts manualTransferCompletedLines
    items: [
      { name: 'OUTR TK XFR', sensed: true, labelNotCompleted: 'AUTO' },
      { name: 'EMER OUTR TK XFR', sensed: true, labelNotCompleted: 'OFF' }, // If the emergency transfer valves are open
    ],
  },
  281800081: {
    title: '\x1b<4m\x1b4mFUEL\x1bm PREDICTED CG OUT OF T.O RANGE',
    sensed: true,
    items: [
      { name: 'WHEN REFUEL COMPLETED (AUTO RCL)', sensed: true, condition: true },
      { name: 'AUTO GND XFR', sensed: true, labelNotCompleted: 'ON', level: 1 },
    ],
  },
  281800082: {
    title: '\x1b<4m\x1b4mFUEL\x1bm REFUEL / DEFUEL SYS FAULT',
    sensed: true,
    items: [
      // The failed valve
      { name: 'REFUEL L ISOL VLV FAULT', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'REFUEL R ISOL VLV FAULT', sensed: false, style: ChecklistLineStyle.Green },
    ],
  },
  281800083: {
    title: '\x1b<4m\x1b4mFUEL\x1bm REFUEL DATA / FMS DISAGREE',
    sensed: true,
    items: [
      { name: 'REFUEL DATA', sensed: false, labelNotCompleted: 'CONFIRM' },
      { name: 'FMS FUEL & LOAD', sensed: false, labelNotCompleted: 'CONFIRM' },
    ],
  },
  281800084: {
    title: '\x1b<4m\x1b4mFUEL\x1bm REFUEL FAULT',
    sensed: true,
    items: [],
  },
  281800085: {
    title: '\x1b<4m\x1b4mFUEL\x1bm SYS COMPONENT FAULT',
    sensed: true,
    // FwsFuelManagementAlerts fuelManagementAbnormalItems
    items: [
      { name: 'FQDC 1 AGP FAULT', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'FQDC 2 AGP FAULT', sensed: false, style: ChecklistLineStyle.Green },
    ],
  },
  281800086: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TEMP LO',
    sensed: true,
    // FwsFuelTankAlerts fuelTempLoLines
    items: [
      { name: 'DELAY T.O', sensed: false, style: ChecklistLineStyle.Cyan }, // On ground
      { name: 'INR TK XFR', sensed: true, labelNotCompleted: 'AUTO' }, // If a manual inner tank transfer is selected
      { name: 'MID TK XFR', sensed: true, labelNotCompleted: 'AUTO' }, // If a manual mid tank transfer is selected
      { name: 'WHEN ANY FEED TK < 16000 KG', sensed: true, condition: true }, // An outer tank below -40 °C
      { name: 'OUTR TK XFR', sensed: true, labelNotCompleted: 'MAN', level: 1 },
      { name: 'TRIM TK XFR', sensed: true, labelNotCompleted: 'FWD' }, // The trim tank below -40 °C
      { name: 'FUEL FREEZE POINT', sensed: false, labelNotCompleted: 'CHECK' }, // A feed tank below -40 °C
      { name: 'TAT', sensed: false, labelNotCompleted: 'INCREASE' },
    ],
  },
  281800087: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM & APU LINES FAULT',
    sensed: true,
    // FwsFuelManagementAlerts fuelManagementAbnormalItems
    items: [
      { name: 'TRIM TK FEED', sensed: true, labelNotCompleted: 'ISOL' },
      { name: 'TRIM TK L PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'TRIM TK R PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'APU MASTER SW', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'TRIM TK NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan },
    ],
  },
  281800088: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK GRVTY FWD XFR FAULT',
    sensed: true,
    // FwsFuelManagementAlerts fuelManagementAbnormalItems
    items: [
      { name: 'EXCESS PITCH ATT', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'TRIM TK FEED', sensed: true, labelNotCompleted: 'AUTO' },
      { name: 'PITCH ATT < 3° FOR GRVTY FWD XFR', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'TRIM TK FEED', sensed: true, labelNotCompleted: 'OPEN' },
    ],
  },
  281800089: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK L PMP FAULT',
    sensed: true,
    items: [{ name: 'TRIM TK L PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800090: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK R PMP FAULT',
    sensed: true,
    items: [{ name: 'TRIM TK R PMP', sensed: true, labelNotCompleted: 'OFF' }],
  },
  281800091: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK L+R PMPs FAULT',
    sensed: true,
    items: [
      { name: 'TRIM TK L PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'TRIM TK R PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'PITCH ATT < 3° FOR GRVTY FWD XFR', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'TRIM TK FEED', sensed: false, labelNotCompleted: 'OPEN' },
      { name: 'TRIM TK : 2300 KG MAX NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan },
    ],
  },
  281800092: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK MAN XFR COMPLETED',
    sensed: true,
    // FwsFuelTankAlerts manualTransferCompletedLines
    items: [
      { name: 'TRIM TK XFR', sensed: true, labelNotCompleted: 'AUTO' },
      { name: 'TRIM TK FEED', sensed: true, labelNotCompleted: 'AUTO' },
    ],
  },
  281800093: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK OVERFLOW',
    sensed: true,
    items: [{ name: 'TRIM TK XFR', sensed: true, labelNotCompleted: 'FWD' }],
  },
  281800094: {
    title: '\x1b<4m\x1b4mFUEL\x1bm TRIM TK XFR FAULT',
    sensed: true,
    // FwsFuelManagementAlerts trimTkXfrFaultItemsToShow
    items: [
      { name: 'TRIM TK ISOL VLV FAULT', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'TRIM TK L PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'TRIM TK R PMP', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'TRIM TK XFR', sensed: true, labelNotCompleted: 'AUTO' },
      { name: 'PITCH ATT < 3° FOR GRVTY FWD XFR', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'TRIM TK FEED', sensed: true, labelNotCompleted: 'OPEN' },
      { name: 'TRIM TK : 2300 KG MAX NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'TRIM TK XFR', sensed: true, labelNotCompleted: 'AUTO' },
      { name: 'TRIM TK FEED', sensed: true, labelNotCompleted: 'ISOL' },
      { name: 'TRIM TK NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'DELAY T.O', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'INR TK XFR', sensed: true, labelNotCompleted: 'AUTO' },
      { name: 'MID TK XFR', sensed: true, labelNotCompleted: 'AUTO' },
      { name: 'TRIM TK XFR', sensed: true, labelNotCompleted: 'FWD' },
    ],
  },
  281800095: {
    title: '\x1b<4m\x1b4mFUEL\x1bm WEIGHT & BALANCE BKUP FAULT',
    sensed: true,
    items: [],
  },
  281800096: {
    title: '\x1b<4m\x1b4mFUEL\x1bm WEIGHT DATA DISAGREE',
    sensed: true,
    // 198 400 lb = 90 000 kg
    items: [
      { name: 'ERROR > 90000 KG DETECTED BY F/CTL', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'FMS ZFW VALUE', sensed: false, labelNotCompleted: 'CONFIRM' },
      { name: 'ECAM GW', sensed: false, labelNotCompleted: 'CHECK' },
      { name: 'ECAM GW NOT CORRECT', sensed: false, condition: true },
      { name: 'DATA NOT CORRECT :', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
      { name: 'VLS, VAPP, GREEN DOT, EFOB', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
      { name: 'LDG PERF AFFECTED', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
    ],
  },
  281800097: {
    title: '\x1b<4m\x1b4mFUEL\x1bm WING TK OVERFLOW',
    sensed: true,
    items: [
      // FwsFuelRefuelAlerts wingTkOverflowLines
      { name: 'DELAY T.O', sensed: false, style: ChecklistLineStyle.Cyan }, // On ground before takeoff
      { name: 'MAN XFR SELECTED', sensed: true, condition: true },
      { name: 'OUTR TK XFR', sensed: true, labelNotCompleted: 'AUTO', level: 1 },
      { name: 'EMER OUTR TK XFR', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'TRIM TK XFR', sensed: true, labelNotCompleted: 'AUTO', level: 1 },
      { name: 'INR TK XFR', sensed: true, labelNotCompleted: 'AUTO', level: 1 },
      { name: 'MID TK XFR', sensed: true, labelNotCompleted: 'AUTO', level: 1 },
      { name: 'NO MAN XFR SELECTED', sensed: true, condition: true },
      { name: 'FUEL XFR : MAN ONLY', sensed: false, style: ChecklistLineStyle.Green, level: 1 },
    ],
  },
  281800098: {
    title: '\x1b<4m\x1b4mFUEL\x1bm WINGS BALANCED',
    sensed: true,
    items: [
      // Feed tanks 1 and 4
      {
        name: 'FEED TK 1 & 4 BALANCED',
        sensed: false,
        style: ChecklistLineStyle.Green,
      },
      {
        name: 'FEED TK 1 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'ON',
      },
      {
        name: 'FEED TK 1 STBY PMP',
        sensed: true,
        labelNotCompleted: 'ON',
      },
      {
        name: 'FEED TK 4 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'ON',
      },
      {
        name: 'FEED TK 4 STBY PMP',
        sensed: true,
        labelNotCompleted: 'ON',
      },
      {
        name: 'CROSSFEED 1',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'CROSSFEED 4',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      // Feed tanks 2 and 3
      {
        name: 'FEED TK 2 & 3 BALANCED',
        sensed: false,
        style: ChecklistLineStyle.Green,
      },
      {
        name: 'FEED TK 2 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'ON',
      },
      {
        name: 'FEED TK 2 STBY PMP',
        sensed: true,
        labelNotCompleted: 'ON',
      },
      {
        name: 'FEED TK 3 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'ON',
      },
      {
        name: 'FEED TK 3 STBY PMP',
        sensed: true,
        labelNotCompleted: 'ON',
      },
      {
        name: 'CROSSFEED 2',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
      {
        name: 'CROSSFEED 3',
        sensed: true,
        labelNotCompleted: 'OFF',
      },
    ],
  },
  281800099: {
    title: '\x1b<4m\x1b4mFUEL\x1bm WINGS MAN BALANCING PROCEDURE',
    sensed: true,
    // FwsFuelManagementAlerts wingsManBalancingItemsToShow
    items: [
      { name: 'DELAY T.O', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'FEED TK 1 & 4 NOT BALANCED', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'TKS BALANCING : ONE PAIR AT A TIME', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'NO FUEL LEAK', sensed: false, condition: true },
      { name: 'CROSSFEED 1', sensed: true, labelNotCompleted: 'ON', level: 1 },
      { name: 'CROSSFEED 4', sensed: true, labelNotCompleted: 'ON', level: 1 },
      { name: 'FEED TK 1 STBY PMP', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'FEED TK 1 MAIN PMP', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'FEED TK 4 STBY PMP', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'FEED TK 4 MAIN PMP', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'FEED TK 2 & 3 NOT BALANCED', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'TKS BALANCING : ONE PAIR AT A TIME', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'NO FUEL LEAK', sensed: false, condition: true },
      { name: 'CROSSFEED 2', sensed: true, labelNotCompleted: 'ON', level: 1 },
      { name: 'CROSSFEED 3', sensed: true, labelNotCompleted: 'ON', level: 1 },
      { name: 'FEED TK 2 STBY PMP', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'FEED TK 2 MAIN PMP', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'FEED TK 3 STBY PMP', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'FEED TK 3 MAIN PMP', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'INR TKs NOT BALANCED', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'TKS BALANCING : ONE PAIR AT A TIME', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'NO FUEL LEAK', sensed: false, condition: true },
      { name: 'WHEN ANY FEED TK < 15000 KG', sensed: true, condition: true, level: 1 },
      { name: 'L INR TK AFT PMP', sensed: true, labelNotCompleted: 'OFF', level: 2 },
      { name: 'R INR TK AFT PMP', sensed: true, labelNotCompleted: 'OFF', level: 2 },
      { name: 'INR TK XFR', sensed: true, labelNotCompleted: 'MAN', level: 2 },
      { name: 'MID TKs NOT BALANCED', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'TKS BALANCING : ONE PAIR AT A TIME', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'NO FUEL LEAK', sensed: false, condition: true },
      { name: 'WHEN ANY FEED TK < 15000 KG', sensed: true, condition: true, level: 1 },
      { name: 'L MID TK AFT PMP', sensed: true, labelNotCompleted: 'OFF', level: 2 },
      { name: 'R MID TK AFT PMP', sensed: true, labelNotCompleted: 'OFF', level: 2 },
      { name: 'MID TK XFR', sensed: true, labelNotCompleted: 'MAN', level: 2 },
      { name: 'OUTR TKs NOT BALANCED', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'TKS BALANCING : ONE PAIR AT A TIME', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'NO FUEL LEAK', sensed: false, condition: true },
      { name: 'WHEN ANY FEED TK < 15000 KG', sensed: true, condition: true, level: 1 },
      { name: 'OUTR TK XFR', sensed: true, labelNotCompleted: 'MAN', level: 2 },
    ],
  },
  281800100: {
    title: '\x1b<4m\x1b4mFUEL\x1bm WINGS NOT BALANCED',
    sensed: true,
    items: [
      // On ground
      {
        name: 'T.O PLANNED',
        sensed: false,
        condition: true,
      },
      // Before the first engine start
      {
        name: 'AUTO GND XFR',
        sensed: false,
        labelNotCompleted: 'ON',
        level: 1,
      },
      // After the first engine start
      {
        name: 'WINGS IMBALANCE',
        sensed: false,
        labelNotCompleted: 'COMPENSATE',
        level: 1,
      },
      {
        name: 'DELAY T.O',
        sensed: false,
        style: ChecklistLineStyle.Cyan,
        level: 1,
      },
      // In flight, imbalance between feed tanks 1 and 4
      {
        name: 'FEED TK 1 & 4 NOT BALANCED',
        sensed: false,
        style: ChecklistLineStyle.Green,
      },
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
        name: 'CROSSFEED 4',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      // If feed tank 1 is the lighter side
      {
        name: 'FEED TK 1 STBY PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'FEED TK 1 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      // If feed tank 4 is the lighter side
      {
        name: 'FEED TK 4 STBY PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'FEED TK 4 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      // In flight, imbalance between feed tanks 2 and 3
      {
        name: 'FEED TK 2 & 3 NOT BALANCED',
        sensed: false,
        style: ChecklistLineStyle.Green,
      },
      {
        name: 'NO FUEL LEAK',
        sensed: false,
        condition: true,
      },
      {
        name: 'CROSSFEED 2',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      {
        name: 'CROSSFEED 3',
        sensed: true,
        labelNotCompleted: 'ON',
        level: 1,
      },
      // If feed tank 2 is the lighter side
      {
        name: 'FEED TK 2 STBY PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'FEED TK 2 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      // If feed tank 3 is the lighter side
      {
        name: 'FEED TK 3 STBY PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
      {
        name: 'FEED TK 3 MAIN PMP',
        sensed: true,
        labelNotCompleted: 'OFF',
        level: 1,
      },
    ],
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
    title: '\x1b<4m\x1b4mFUEL\x1bm JETTISON',
    sensed: false,
    items: [
      { name: 'FMS FUEL & LOAD PAGE', sensed: false, labelNotCompleted: 'SELECT' },
      { name: 'JETTISON GW', sensed: false, labelNotCompleted: 'ENTER' },
      { name: 'TRIM TK NOT EMPTY', sensed: false, condition: true },
      { name: 'NO FUEL TRIM & APU LINE FAULT', sensed: false, condition: true, level: 1 },
      { name: 'TRIM TK FEED', sensed: false, labelNotCompleted: 'AUTO', level: 2 },
      { name: 'JETTISON ARM', sensed: true, labelNotCompleted: 'ON' },
      { name: 'JETTISON ACTIVE', sensed: true, labelNotCompleted: 'ON' },
      { name: 'JETTISON & CG', sensed: false, labelNotCompleted: 'MONITOR' },
      { name: 'WHEN JETTISON COMPLETED (AUTO RCL)', sensed: false, condition: true },
      { name: 'JETTISON ACTIVE', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'JETTISON ARM', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'RQRD TO MANUALLY STOP JETTISON', sensed: false, condition: true },
      { name: 'JETTISON ACTIVE', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'JETTISON ARM', sensed: true, labelNotCompleted: 'OFF', level: 1 },
    ],
  },
  280900002: {
    title: '\x1b<4m\x1b4mFUEL\x1bm FUEL LEAK',
    sensed: false,
    items: FUEL_LEAK_PROCEDURE_ITEMS,
    recommendation: 'LAND ANSA',
  },
  280900003: {
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
