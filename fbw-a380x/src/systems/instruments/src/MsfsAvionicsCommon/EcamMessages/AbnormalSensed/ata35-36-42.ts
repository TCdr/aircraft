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
};

/**
 * AIR ENG 1(2)(3)(4) BLEED FAULT, A380 FCOM PRO-ABN-ECAM-10-36 (a380_fcom.txt l.168016-168034, TDU 00023117). The
 * "HP VLV NOT CLOSED" line is not listed (no HP valve failed open in the model); "If the XBLEED valves do not open
 * automatically: Refer to AIR ABNORM BLEED CONFIG" is that alert (211800056).
 * @param engine the engine number
 * @returns the procedure
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
 * AIR L(R) INR WING LEAK / ENG 2(3) BLEED LEAK (a380_fcom.txt l.168524-168555) and AIR L(R) OUTR WING LEAK / ENG 1(4)
 * BLEED LEAK (l.168682-168716). The APU BLEED line is only shown for the left outer wing leak.
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
