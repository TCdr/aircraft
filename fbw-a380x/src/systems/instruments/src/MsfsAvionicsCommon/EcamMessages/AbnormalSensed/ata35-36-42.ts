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
export const EcamAbnormalSensedAta353642: { [n: number]: AbnormalProcedure } = {
  // ATA 35 OXYGEN see FWS OxygenAlerts: no ECAM action
  350800001: {
    title: '\x1b<4m\x1b4mOXY\x1bm CABIN BOTTLE PRESS LO',
    sensed: true,
    items: [],
  },
  350800002: {
    // crew awareness
    title: '\x1b<4m\x1b4mOXY\x1bm CABIN VLV CLOSED',
    sensed: true,
    items: [],
  },
  350800003: {
    title: '\x1b<4m\x1b4mOXY\x1bm CKPT BOTTLE PRESS LO',
    sensed: true,
    items: [],
  },
  // ATA 36: BLEED AIR. The alert logic is in systems-host CpiomC/FlightWarningSystem/BleedMonitoringAlerts.ts.
  361800001: engineBleedFault(1),
  361800002: engineBleedFault(2),
  361800003: engineBleedFault(3),
  361800004: engineBleedFault(4),
  361800005: bleedLeak('ENG 1 BLEED LEAK', 1),
  361800006: bleedLeak('ENG 2 BLEED LEAK', 2),
  361800007: bleedLeak('ENG 3 BLEED LEAK', 3),
  361800008: bleedLeak('ENG 4 BLEED LEAK', 4),
  361800009: bleedLeak('L OUTR WING LEAK', 1),
  361800010: bleedLeak('L INR WING LEAK', 2),
  361800011: bleedLeak('R INR WING LEAK', 3),
  361800012: bleedLeak('R OUTR WING LEAK', 4),
  // The leak, valve and temperature alerts below: systems-host CpiomC/FlightWarningSystem/FwsBleedLeakAlerts.ts
  361800013: {
    title: '\x1b<4m\x1b4mAIR\x1bm APU BLEED LEAK',
    sensed: true,
    items: [
      // On ground, before any engine start
      { name: 'ENG 1 MASTER LEVER', sensed: false, labelNotCompleted: 'KEEP OFF' },
      { name: 'ENG 2 MASTER LEVER', sensed: false, labelNotCompleted: 'KEEP OFF' },
      { name: 'ENG 3 MASTER LEVER', sensed: false, labelNotCompleted: 'KEEP OFF' },
      { name: 'ENG 4 MASTER LEVER', sensed: false, labelNotCompleted: 'KEEP OFF' },
      // If the APU bleed valve, or the APU isolation valve did not close automatically
      { name: 'APU BLEED', sensed: true, labelNotCompleted: 'OFF' },
      // If two (or more) bleeds are inoperative
      { name: 'PACK 1', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'PACK 2', sensed: true, labelNotCompleted: 'OFF' },
      // In flight, if two bleeds on the same side are inoperative
      { name: 'WING A-ICE', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'ENGs A-ICE', sensed: false, labelNotCompleted: 'AS RQRD' },
      { name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan },
      // When the leak is isolated
      { name: 'AIR LEAK ISOLATED', sensed: false },
    ],
  },
  361800014: {
    title: '\x1b<2m\x1b4mAIR\x1bm BLEED LEAK',
    sensed: true,
    items: [{ name: 'XBLEED', sensed: true, labelNotCompleted: 'CLOSE' }],
  },
  361800015: engineBleedNotClosed(1),
  361800016: engineBleedNotClosed(2),
  361800017: engineBleedNotClosed(3),
  361800018: engineBleedNotClosed(4),
  361800019: {
    // crew awareness
    title: '\x1b<4m\x1b4mAIR\x1bm ENG 1 HP VLV NOT OPEN',
    sensed: true,
    items: [],
  },
  361800020: {
    // crew awareness
    title: '\x1b<4m\x1b4mAIR\x1bm ENG 2 HP VLV NOT OPEN',
    sensed: true,
    items: [],
  },
  361800021: {
    // crew awareness
    title: '\x1b<4m\x1b4mAIR\x1bm ENG 3 HP VLV NOT OPEN',
    sensed: true,
    items: [],
  },
  361800022: {
    // crew awareness
    title: '\x1b<4m\x1b4mAIR\x1bm ENG 4 HP VLV NOT OPEN',
    sensed: true,
    items: [],
  },
  361800023: engineBleedTempLo(1),
  361800024: engineBleedTempLo(2),
  361800025: engineBleedTempLo(3),
  361800026: engineBleedTempLo(4),
  361800027: hotAirDuctLeak('FWD CARGO DUCT LEAK', 1),
  361800028: hotAirDuctLeak('HOT AIR 1 LEAK', 1),
  361800029: hotAirDuctLeak('HOT AIR 2 LEAK', 2),
  361800030: {
    // crew awareness; the line of each duct whose leak detection is lost
    title: '\x1b<4m\x1b4mAIR\x1bm LEAK DET FAULT',
    sensed: true,
    items: [
      'ENG 1 BLEED',
      'ENG 2 BLEED',
      'ENG 3 BLEED',
      'ENG 4 BLEED',
      'L OUTR WING',
      'L INR WING',
      'R INR WING',
      'R OUTR WING',
      'APU BLEED',
      'PACK 1',
      'PACK 2',
      'HOT AIR 1',
      'HOT AIR 2',
      'FWD CARGO DUCT',
      'AFT CARGO DUCT',
    ].map((duct) => ({ name: `ON ${duct}`, sensed: true, style: ChecklistLineStyle.Amber })),
  },
  361800031: packLeak(1),
  361800032: packLeak(2),
  361800033: {
    title: '\x1b<4m\x1b4mAIR\x1bm XBLEED FAULT',
    sensed: true,
    items: [
      // If the automatic control of one (or more) XBLEED valve is lost
      { name: 'XBLEED MAN CTL ONLY', sensed: false, style: ChecklistLineStyle.Cyan },
      // If the manual control of one (or more) XBLEED valve is lost
      { name: 'XBLEED', sensed: true, labelNotCompleted: 'AUTO' },
    ],
  },
  // ATA 42 AVIONICS NETWORK. The alert logic is in systems-host CpiomC/FlightWarningSystem/AvionicsNetworkAlerts.ts.
  // The "(NETWORK DEGRADED)" / "(REDUNDANCY DEGRADED)" second title line is the first line of the procedure (the full
  // title does not fit the EWD line).
  420800001: {
    title: '\x1b<4m\x1b4mAVIONICS NETWORK\x1bm ALL SWITCHES FAULT',
    recommendation: 'LAND ANSA',
    sensed: true,
    // the "Depending on..." and DEFERRED PROC lines are not listed
    items: [
      { name: 'A/THR NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'ALL THR LEVERS', sensed: false, labelNotCompleted: 'MOVE' },
      { name: 'FMA NOT AVAIL', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'AP MODES AVAIL : LOC, G/S', sensed: false, style: ChecklistLineStyle.Green },
      // One line in the procedure, split in two: longer than an EWD line (WD_LINE_CHARACTERS)
      { name: 'CONSIDER BASIC AP MODES ONLY :', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'V/S, FPA, ALT', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
      { name: 'FOR NAV : STBY INSTRUMENTS ONLY', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'XPDR MODE A ONLY', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'ATC COM VOICE ONLY', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'ATC', sensed: false, labelNotCompleted: 'NOTIFY' },
      { name: 'CABIN CREW', sensed: false, labelNotCompleted: 'ADVISE' },
      { name: 'OVHD PNL', sensed: false, labelNotCompleted: 'MONITOR' },
      { name: 'CAB PRESS MAN MODES : DO NOT USE', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'IN DES : CAB ALT REGULATED TO 7000 FT', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'BELOW 7000 FT : CAB ALT = ACFT ALT', sensed: false, style: ChecklistLineStyle.Green },
      { name: 'BELOW 7000 FT : AVOID HI DES V/S', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'JETTISON NOT USABLE', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'L/G GRVTY EXTN ONLY', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'LDG DIST AFFECTED', sensed: false, style: ChecklistLineStyle.Cyan },
      { name: 'WHEN ANY FEED TK<13000 KG (AUTO RCL) :', sensed: false, condition: true },
      { name: 'OUTR TK XFR', sensed: false, labelNotCompleted: 'MAN', level: 1 },
    ],
  },
  420800002: {
    // crew awareness
    title: '\x1b<4m\x1b4mAVIONICS NETWORK\x1bm DOUBLE IOM FAULT',
    sensed: true,
    items: [],
  },
  420800003: {
    // crew awareness
    title: '\x1b<4m\x1b4mAVIONICS NETWORK\x1bm DOUBLE SWITCH FAULT',
    sensed: true,
    items: [],
  },
  420800004: {
    // its lines "Depending on the affected IOMs" are not simulated
    title: '\x1b<4m\x1b4mAVIONICS NETWORK\x1bm MULTIPLE IOM FAULT',
    sensed: true,
    items: [{ name: '(NETWORK DEGRADED)', sensed: true, style: ChecklistLineStyle.Amber }],
  },
  420800005: {
    // crew awareness
    title: '\x1b<4m\x1b4mAVIONICS NETWORK\x1bm MULTIPLE IOM FAULT',
    sensed: true,
    items: [{ name: '(REDUNDANCY DEGRADED)', sensed: true, style: ChecklistLineStyle.Amber }],
  },
  420800006: {
    // its lines "Depending on the affected switches" are not simulated
    title: '\x1b<4m\x1b4mAVIONICS NETWORK\x1bm MULTIPLE SWITCH FAULT',
    sensed: true,
    items: [{ name: '(NETWORK DEGRADED)', sensed: true, style: ChecklistLineStyle.Amber }],
  },
  420800007: {
    // crew awareness
    title: '\x1b<4m\x1b4mAVIONICS NETWORK\x1bm MULTIPLE SWITCH FAULT',
    sensed: true,
    items: [{ name: '(REDUNDANCY DEGRADED)', sensed: true, style: ChecklistLineStyle.Amber }],
  },
};

/**
 * AIR ENG 1(2)(3)(4) BLEED NOT CLOSED: the engine bleed valve is not closed during the APU bleed supply or the engine
 * start. The alert is recalled once the engine runs, so that the crew sets the bleed back ON.
 * @param engine the engine number, 1 to 4
 * @returns the procedure of that engine
 */
function engineBleedNotClosed(engine: number): AbnormalProcedure {
  return {
    title: `\x1b<4m\x1b4mAIR\x1bm ENG ${engine} BLEED NOT CLOSED`,
    sensed: true,
    items: [
      { name: `ENG ${engine} BLEED`, sensed: true, labelNotCompleted: 'OFF' },
      { name: `WHEN ENG ${engine} STARTED :`, sensed: true },
      { name: `ENG ${engine} BLEED`, sensed: true, labelNotCompleted: 'ON', level: 1 },
    ],
  };
}

/**
 * AIR ENG BLEED TEMP LO ON BLEED 1(2)(3)(4), one alert per bleed. The ENG BLEED OFF line is for one bleed LO TEMP,
 * the WING A-ICE lines for more than one.
 * @param engine the engine number, 1 to 4
 * @returns the procedure of that bleed
 */
function engineBleedTempLo(engine: number): AbnormalProcedure {
  return {
    title: `\x1b<4m\x1b4mAIR\x1bm ENG BLEED TEMP LO ON BLEED ${engine}`,
    sensed: true,
    items: [
      { name: 'ENG THRUST', sensed: false, labelNotCompleted: 'INCREASE' },
      { name: 'IF NOT SUCCESSFUL :', sensed: true },
      { name: `ENG ${engine} BLEED`, sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'WING A-ICE', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      { name: 'ENGs A-ICE', sensed: false, labelNotCompleted: 'AS RQRD', level: 1 },
      { name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan, level: 1 },
    ],
  };
}

/**
 * AIR HOT AIR 1(2) LEAK and AIR FWD CARGO DUCT LEAK (a leak of the ducts of the hot-air valve 1).
 * @param title the alert title after AIR
 * @param hotAir the hot-air valve of the leaking ducts
 * @returns the procedure
 */
function hotAirDuctLeak(title: string, hotAir: number): AbnormalProcedure {
  return {
    title: `\x1b<4m\x1b4mAIR\x1bm ${title}`,
    sensed: true,
    items: [
      // If the hot-air valve did not close automatically
      { name: `HOT AIR ${hotAir}`, sensed: true, labelNotCompleted: 'OFF' },
      // When the leak is isolated
      { name: 'AIR LEAK ISOLATED', sensed: false },
    ],
  };
}

/**
 * AIR PACK 1(2) LEAK
 * @param pack the pack number, 1 or 2
 * @returns the procedure
 */
function packLeak(pack: number): AbnormalProcedure {
  return {
    title: `\x1b<4m\x1b4mAIR\x1bm PACK ${pack} LEAK`,
    sensed: true,
    items: [
      // If the appropriate pack valves did not close automatically
      { name: `PACK ${pack}`, sensed: true, labelNotCompleted: 'OFF' },
      // In flight, if two bleeds on the same side are inoperative
      { name: 'WING A-ICE', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'ENGs A-ICE', sensed: false, labelNotCompleted: 'AS RQRD' },
      { name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan },
      // When the leak is isolated
      { name: 'AIR LEAK ISOLATED', sensed: false },
    ],
  };
}

/**
 * AIR ENG 1(2)(3)(4) BLEED FAULT. The "HP VLV NOT CLOSED" line is not listed (no HP valve failed open in the model);
 * the line sending the crew to AIR ABNORM BLEED CONFIG when the XBLEED valves do not open is that alert (211800056).
 * @param engine the engine number, 1 to 4
 * @returns the procedure of that engine
 */
function engineBleedFault(engine: number): AbnormalProcedure {
  return {
    title: `\x1b<4m\x1b4mAIR\x1bm ENG ${engine} BLEED FAULT`,
    sensed: true,
    items: [
      {
        // If the affected bleed valve does not close automatically
        name: `ENG ${engine} BLEED`,
        sensed: true,
        labelNotCompleted: 'OFF',
      },
    ],
  };
}

/**
 * AIR L(R) INR WING LEAK / ENG 2(3) BLEED LEAK and AIR L(R) OUTR WING LEAK / ENG 1(4) BLEED LEAK. The APU BLEED line is
 * only shown for the left outer wing leak.
 * @param title the alert title after AIR
 * @param engine the engine of the leak zone
 * @returns the procedure
 */
function bleedLeak(title: string, engine: number): AbnormalProcedure {
  return {
    title: `\x1b<4m\x1b4mAIR\x1bm ${title}`,
    sensed: true,
    items: [
      // On ground, before any engine start
      { name: 'ENG 1 MASTER : KEEP OFF', sensed: false },
      { name: 'ENG 2 MASTER : KEEP OFF', sensed: false },
      { name: 'ENG 3 MASTER : KEEP OFF', sensed: false },
      { name: 'ENG 4 MASTER : KEEP OFF', sensed: false },
      // When at least one engine is started, and the applicable bleed valve did not close automatically
      { name: `ENG ${engine} BLEED`, sensed: true, labelNotCompleted: 'OFF' },
      // If two (or more) bleeds are off
      { name: engine <= 2 ? 'PACK 1' : 'PACK 2', sensed: true, labelNotCompleted: 'OFF' },
      // If the appropriate XBLEED valves did not close automatically
      { name: 'XBLEED', sensed: true, labelNotCompleted: 'CLOSE' },
      // If there is a bleed leak on the left outer wing
      { name: 'APU BLEED', sensed: true, labelNotCompleted: 'OFF', level: 1 },
      // In flight (outer), in flight if two bleeds on the same side are inoperative (inner)
      { name: 'WING A-ICE', sensed: true, labelNotCompleted: 'OFF' },
      { name: 'ENGs A-ICE', sensed: false, labelNotCompleted: 'AS RQRD' },
      { name: 'AVOID ICING CONDs', sensed: false, style: ChecklistLineStyle.Cyan },
      // When the leak is isolated
      { name: 'AIR LEAK ISOLATED', sensed: false },
    ],
  };
}
