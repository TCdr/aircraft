// Copyright (c) 2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AbnormalProcedure } from '..';

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
  // ATA 35 OXYGEN (A380 FCOM PRO-ABN-ECAM-10-35, a380_fcom.txt l.167419-167530), see FWS OxygenAlerts: no ECAM action
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
};
