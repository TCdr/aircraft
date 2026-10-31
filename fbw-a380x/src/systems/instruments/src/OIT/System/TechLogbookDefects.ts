// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The standard defect database of the technical logbook, used by the SYSTEM & FUNCTION, COCKPIT INTERFACE and KEYWORD
 * assistants. The real database is the operator's; design choice: a short list of common A380 cockpit and cabin
 * defects, each with its system, function, allocation, cockpit area and equipment zone.
 */

/** The cockpit areas of the COCKPIT INTERFACE assistant, from the overhead panel down to the side consoles */
export const COCKPIT_AREAS = [
  'OVERHEAD PANEL',
  'GLARESHIELD',
  'CAPT MAIN PANEL',
  'CENTER PANEL',
  'F/O MAIN PANEL',
  'PEDESTAL',
  'CAPT SIDE CONSOLE',
  'F/O SIDE CONSOLE',
  'COCKPIT AREA',
] as const;

export type CockpitArea = (typeof COCKPIT_AREAS)[number];

export interface StandardDefect {
  readonly title: string;
  readonly ata: string;
  readonly system: string;
  readonly function: string;
  readonly allocation: string;
  readonly area: CockpitArea;
  /** The equipment zone of the area, as drawn in the COCKPIT INTERFACE picture (see TechLogbookCockpit) */
  readonly zone: string;
}

export const STANDARD_DEFECTS: readonly StandardDefect[] = [
  {
    title: 'MAIN FEED TK 4 PMP P/BSW FAULT LEGEND ILLUMINATES ON OVERHEAD PANEL',
    ata: '28-21-00',
    system: 'FUEL',
    function: 'FEED PUMPS',
    allocation: 'FAULT LEGEND',
    area: 'OVERHEAD PANEL',
    zone: 'FUEL',
  },
  {
    title: 'STBY FEED TK 4 PMP P/BSW FAULT LEGEND ILLUMINATES ON OVERHEAD PANEL',
    ata: '28-21-00',
    system: 'FUEL',
    function: 'FEED PUMPS',
    allocation: 'FAULT LEGEND',
    area: 'OVERHEAD PANEL',
    zone: 'FUEL',
  },
  {
    title: 'MAIN/STANDBY FEED PUMP AMBER OFF ON OVERHEAD PANEL',
    ata: '28-21-00',
    system: 'FUEL',
    function: 'FEED PUMPS',
    allocation: 'INOP SYS',
    area: 'OVERHEAD PANEL',
    zone: 'FUEL',
  },
  {
    title: 'CROSSFEED VLV 4 P/BSW OPEN CAPTION ILLUMINATES ON OVERHEAD PANEL',
    ata: '28-23-00',
    system: 'FUEL',
    function: 'CROSSFEED',
    allocation: 'CAPTION',
    area: 'OVERHEAD PANEL',
    zone: 'FUEL',
  },
  {
    title: 'FUEL QUANTITY INDICATION FLUCTUATES ON SD FUEL PAGE',
    ata: '28-42-00',
    system: 'FUEL',
    function: 'QUANTITY INDICATION',
    allocation: 'INDICATION',
    area: 'CENTER PANEL',
    zone: 'SD',
  },
  {
    title: 'INOP SYS L+R WINDSHLDS HEATG',
    ata: '30-42-00',
    system: 'ICE & RAIN PROTECTION',
    function: 'WINDSHIELD HEATING',
    allocation: 'INOP SYS',
    area: 'OVERHEAD PANEL',
    zone: 'ICE & RAIN',
  },
  {
    title: 'A-ICE L WINDSHIELD HEATG FAULT',
    ata: '30-42-00',
    system: 'ICE & RAIN PROTECTION',
    function: 'WINDSHIELD HEATING',
    allocation: 'FAULT',
    area: 'OVERHEAD PANEL',
    zone: 'ICE & RAIN',
  },
  {
    title: 'WIPER CAPT INOPERATIVE',
    ata: '30-45-00',
    system: 'ICE & RAIN PROTECTION',
    function: 'WIPERS',
    allocation: 'INOPERATIVE',
    area: 'OVERHEAD PANEL',
    zone: 'ICE & RAIN',
  },
  {
    title: 'COCKPIT WINDOW CLEANING REQUEST',
    ata: '56-10-00',
    system: 'WINDOWS',
    function: 'COCKPIT WINDOWS',
    allocation: 'CLEANING',
    area: 'COCKPIT AREA',
    zone: 'WINDOWS',
  },
  {
    title: 'FAULT OF INTEGRAL LIGHTING OF SEVERAL PANELS VU',
    ata: '33-11-00',
    system: 'LIGHTS',
    function: 'INTEGRAL LIGHTING',
    allocation: 'FAULT',
    area: 'OVERHEAD PANEL',
    zone: 'LIGHTING',
  },
  {
    title: 'DOME LIGHT INOPERATIVE',
    ata: '33-12-00',
    system: 'LIGHTS',
    function: 'COCKPIT LIGHTING',
    allocation: 'INOPERATIVE',
    area: 'OVERHEAD PANEL',
    zone: 'LIGHTING',
  },
  {
    title: 'CAPT READING LIGHT INOPERATIVE',
    ata: '33-12-00',
    system: 'LIGHTS',
    function: 'COCKPIT LIGHTING',
    allocation: 'INOPERATIVE',
    area: 'CAPT SIDE CONSOLE',
    zone: 'READING LIGHT',
  },
  {
    title: 'LANDING LIGHT L INOPERATIVE',
    ata: '33-42-00',
    system: 'LIGHTS',
    function: 'EXTERIOR LIGHTING',
    allocation: 'INOPERATIVE',
    area: 'OVERHEAD PANEL',
    zone: 'EXTERIOR LIGHTS',
  },
  {
    title: 'STROBE LIGHTS INOPERATIVE',
    ata: '33-48-00',
    system: 'LIGHTS',
    function: 'EXTERIOR LIGHTING',
    allocation: 'INOPERATIVE',
    area: 'OVERHEAD PANEL',
    zone: 'EXTERIOR LIGHTS',
  },
  {
    title: 'ANNUNCIATOR LIGHT TEST: SEVERAL LEGENDS DO NOT ILLUMINATE',
    ata: '33-14-00',
    system: 'LIGHTS',
    function: 'ANNUNCIATOR LIGHTS',
    allocation: 'FAULT',
    area: 'OVERHEAD PANEL',
    zone: 'LIGHTING',
  },
  {
    title: 'FCU CAPT EFIS CONTROL PANEL BARO KNOB INOPERATIVE',
    ata: '22-81-00',
    system: 'AUTO FLIGHT',
    function: 'FCU',
    allocation: 'INOPERATIVE',
    area: 'GLARESHIELD',
    zone: 'CAPT EFIS',
  },
  {
    title: 'FCU ALT KNOB STIFF',
    ata: '22-81-00',
    system: 'AUTO FLIGHT',
    function: 'FCU',
    allocation: 'STIFF',
    area: 'GLARESHIELD',
    zone: 'FCU',
  },
  {
    title: 'FCU F/O EFIS CONTROL PANEL ND RANGE KNOB INOPERATIVE',
    ata: '22-81-00',
    system: 'AUTO FLIGHT',
    function: 'FCU',
    allocation: 'INOPERATIVE',
    area: 'GLARESHIELD',
    zone: 'F/O EFIS',
  },
  {
    title: 'AP 1 DOES NOT ENGAGE',
    ata: '22-11-00',
    system: 'AUTO FLIGHT',
    function: 'AUTOPILOT',
    allocation: 'INOPERATIVE',
    area: 'GLARESHIELD',
    zone: 'FCU',
  },
  {
    title: 'A/THR DOES NOT ENGAGE',
    ata: '22-31-00',
    system: 'AUTO FLIGHT',
    function: 'AUTOTHRUST',
    allocation: 'INOPERATIVE',
    area: 'GLARESHIELD',
    zone: 'FCU',
  },
  {
    title: 'CAPT PFD FLICKERS',
    ata: '31-61-00',
    system: 'INDICATING/RECORDING',
    function: 'CDS',
    allocation: 'DISPLAY',
    area: 'CAPT MAIN PANEL',
    zone: 'CAPT PFD',
  },
  {
    title: 'CAPT ND BLANK',
    ata: '31-61-00',
    system: 'INDICATING/RECORDING',
    function: 'CDS',
    allocation: 'DISPLAY',
    area: 'CAPT MAIN PANEL',
    zone: 'CAPT ND',
  },
  {
    title: 'F/O ND BLANK',
    ata: '31-61-00',
    system: 'INDICATING/RECORDING',
    function: 'CDS',
    allocation: 'DISPLAY',
    area: 'F/O MAIN PANEL',
    zone: 'F/O ND',
  },
  {
    title: 'F/O PFD FLICKERS',
    ata: '31-61-00',
    system: 'INDICATING/RECORDING',
    function: 'CDS',
    allocation: 'DISPLAY',
    area: 'F/O MAIN PANEL',
    zone: 'F/O PFD',
  },
  {
    title: 'EWD DISPLAY UNIT BRIGHTNESS LOW',
    ata: '31-61-00',
    system: 'INDICATING/RECORDING',
    function: 'CDS',
    allocation: 'DISPLAY',
    area: 'CENTER PANEL',
    zone: 'EWD',
  },
  {
    title: 'CLOCK CAPT INOPERATIVE',
    ata: '31-21-00',
    system: 'INDICATING/RECORDING',
    function: 'CLOCK',
    allocation: 'INOPERATIVE',
    area: 'CAPT MAIN PANEL',
    zone: 'CLOCK',
  },
  {
    title: 'ISIS INOPERATIVE',
    ata: '34-22-00',
    system: 'NAVIGATION',
    function: 'STANDBY INSTRUMENTS',
    allocation: 'INOPERATIVE',
    area: 'CENTER PANEL',
    zone: 'ISIS',
  },
  {
    title: 'WEATHER RADAR IMAGE NOT DISPLAYED ON ND',
    ata: '34-41-00',
    system: 'NAVIGATION',
    function: 'WEATHER RADAR',
    allocation: 'INOPERATIVE',
    area: 'PEDESTAL',
    zone: 'WXR',
  },
  {
    title: 'KCCU CAPT KEYS STICKING',
    ata: '31-63-00',
    system: 'INDICATING/RECORDING',
    function: 'KCCU',
    allocation: 'STIFF',
    area: 'PEDESTAL',
    zone: 'KCCU',
  },
  {
    title: 'RMP 1 DISPLAY INOPERATIVE',
    ata: '23-13-00',
    system: 'COMMUNICATIONS',
    function: 'RMP',
    allocation: 'DISPLAY',
    area: 'PEDESTAL',
    zone: 'RMP',
  },
  {
    title: 'VHF 1 NOISY RECEPTION',
    ata: '23-12-00',
    system: 'COMMUNICATIONS',
    function: 'VHF',
    allocation: 'NOISY',
    area: 'PEDESTAL',
    zone: 'RMP',
  },
  {
    title: 'COCKPIT PRINTER PAPER JAM',
    ata: '31-35-00',
    system: 'INDICATING/RECORDING',
    function: 'PRINTER',
    allocation: 'INOPERATIVE',
    area: 'PEDESTAL',
    zone: 'PRINTER',
  },
  {
    title: 'PARKING BRAKE HANDLE STIFF',
    ata: '32-42-00',
    system: 'LANDING GEAR',
    function: 'BRAKES',
    allocation: 'STIFF',
    area: 'PEDESTAL',
    zone: 'PARKING BRAKE',
  },
  {
    title: 'CAPT TILLER STIFF',
    ata: '32-51-00',
    system: 'LANDING GEAR',
    function: 'STEERING',
    allocation: 'STIFF',
    area: 'CAPT SIDE CONSOLE',
    zone: 'TILLER',
  },
  {
    title: 'OIT CAPT INOPERATIVE',
    ata: '46-21-00',
    system: 'INFORMATION SYSTEMS',
    function: 'OIT',
    allocation: 'INOPERATIVE',
    area: 'CAPT SIDE CONSOLE',
    zone: 'OIT',
  },
  {
    title: 'OIT F/O INOPERATIVE',
    ata: '46-21-00',
    system: 'INFORMATION SYSTEMS',
    function: 'OIT',
    allocation: 'INOPERATIVE',
    area: 'F/O SIDE CONSOLE',
    zone: 'OIT',
  },
  {
    title: 'OXYGEN MASK CAPT FLOW INDICATOR FAULTY',
    ata: '35-12-00',
    system: 'OXYGEN',
    function: 'CREW OXYGEN',
    allocation: 'FAULT',
    area: 'CAPT SIDE CONSOLE',
    zone: 'OXYGEN',
  },
  {
    title: 'CKPT SEAT CAPT LUMBAR REST ADJUSTMENT INOPERATIVE',
    ata: '25-11-00',
    system: 'EQUIPMENT/FURNISHINGS',
    function: 'CREW SEATS',
    allocation: 'INOPERATIVE',
    area: 'COCKPIT AREA',
    zone: 'SEATS',
  },
  {
    title: 'CKPT SEAT F/O ELECTRICAL ADJUSTMENT INOPERATIVE',
    ata: '25-11-00',
    system: 'EQUIPMENT/FURNISHINGS',
    function: 'CREW SEATS',
    allocation: 'INOPERATIVE',
    area: 'COCKPIT AREA',
    zone: 'SEATS',
  },
  {
    title: 'COCKPIT DOOR LOCKING SYSTEM FAULT',
    ata: '52-51-00',
    system: 'DOORS',
    function: 'COCKPIT DOOR',
    allocation: 'FAULT',
    area: 'PEDESTAL',
    zone: 'COCKPIT DOOR',
  },
  {
    title: 'COCKPIT TEMPERATURE TOO HIGH',
    ata: '21-61-00',
    system: 'AIR CONDITIONING',
    function: 'TEMPERATURE CONTROL',
    allocation: 'FAULT',
    area: 'OVERHEAD PANEL',
    zone: 'AIR COND',
  },
  {
    title: 'COCKPIT AIR OUTLET NOISY',
    ata: '21-21-00',
    system: 'AIR CONDITIONING',
    function: 'DISTRIBUTION',
    allocation: 'NOISY',
    area: 'COCKPIT AREA',
    zone: 'AIR OUTLETS',
  },
  {
    title: 'ENG 2 REVERSER FAULT',
    ata: '78-30-00',
    system: 'ENGINE',
    function: 'THRUST REVERSER',
    allocation: 'FAULT',
    area: 'PEDESTAL',
    zone: 'THRUST LEVERS',
  },
  {
    title: 'ENG 1 START VALVE SLOW TO OPEN',
    ata: '80-11-00',
    system: 'ENGINE',
    function: 'STARTING',
    allocation: 'FAULT',
    area: 'OVERHEAD PANEL',
    zone: 'ENG START',
  },
  {
    title: 'APU START FAULT',
    ata: '49-41-00',
    system: 'APU',
    function: 'STARTING',
    allocation: 'FAULT',
    area: 'OVERHEAD PANEL',
    zone: 'APU',
  },
  {
    title: 'HYD G+Y SYS PRESS LO',
    ata: '29-11-00',
    system: 'HYDRAULIC POWER',
    function: 'MAIN SYSTEMS',
    allocation: 'FAULT',
    area: 'OVERHEAD PANEL',
    zone: 'HYD',
  },
  {
    title: 'F/CTL SIDESTICK CAPT STIFF IN ROLL',
    ata: '27-92-00',
    system: 'FLIGHT CONTROLS',
    function: 'SIDESTICKS',
    allocation: 'STIFF',
    area: 'CAPT SIDE CONSOLE',
    zone: 'SIDESTICK',
  },
  {
    title: 'F/CTL SIDESTICK F/O STIFF IN PITCH',
    ata: '27-92-00',
    system: 'FLIGHT CONTROLS',
    function: 'SIDESTICKS',
    allocation: 'STIFF',
    area: 'F/O SIDE CONSOLE',
    zone: 'SIDESTICK',
  },
  {
    title: 'SPEED BRAKE LEVER STIFF',
    ata: '27-62-00',
    system: 'FLIGHT CONTROLS',
    function: 'SPEED BRAKES',
    allocation: 'STIFF',
    area: 'PEDESTAL',
    zone: 'SPEED BRAKE',
  },
  {
    title: 'FIRE TEST: APU FIRE LIGHT DOES NOT ILLUMINATE',
    ata: '26-15-00',
    system: 'FIRE PROTECTION',
    function: 'APU FIRE DETECTION',
    allocation: 'FAULT',
    area: 'OVERHEAD PANEL',
    zone: 'FIRE',
  },
  {
    title: 'STATIC DISCHARGER MISSING ON L WING TIP',
    ata: '23-61-00',
    system: 'COMMUNICATIONS',
    function: 'STATIC DISCHARGERS',
    allocation: 'MISSING PART',
    area: 'COCKPIT AREA',
    zone: 'OTHER',
  },
];

/**
 * Removes duplicates and keeps the first appearance order
 * @param values the values
 * @returns the values once each
 */
function unique(values: string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) === i);
}

/**
 * The SYSTEM drop-down list.
 * @returns the systems, sorted
 */
export function defectSystems(): string[] {
  return unique(STANDARD_DEFECTS.map((d) => d.system)).sort();
}

/**
 * The FUNCTION drop-down list of a system.
 * @param system the selected system
 * @returns the functions, sorted
 */
export function defectFunctions(system: string): string[] {
  return unique(STANDARD_DEFECTS.filter((d) => d.system === system).map((d) => d.function)).sort();
}

/**
 * The ALLOCATION drop-down list of a function.
 * @param system the selected system
 * @param fn the selected function
 * @returns the allocations, sorted
 */
export function defectAllocations(system: string, fn: string): string[] {
  return unique(
    STANDARD_DEFECTS.filter((d) => d.system === system && d.function === fn).map((d) => d.allocation),
  ).sort();
}

/**
 * The ITEM SELECTION list of the SYSTEM & FUNCTION assistant: it shrinks as the flight crew completes the fields.
 * @param system the selected system, null for all
 * @param fn the selected function, null for all
 * @param allocation the selected allocation, null for all
 * @returns the defects
 */
export function defectsBySystem(system: string | null, fn: string | null, allocation: string | null): StandardDefect[] {
  return STANDARD_DEFECTS.filter(
    (d) =>
      (system === null || d.system === system) &&
      (fn === null || d.function === fn) &&
      (allocation === null || d.allocation === allocation),
  );
}

/**
 * The KEYWORD assistant search: the defects whose text contains every typed word.
 * @param keywords the typed words
 * @returns the defects, empty without a word
 */
export function searchDefects(keywords: string): StandardDefect[] {
  const words = keywords
    .toUpperCase()
    .split(/\s+/)
    .filter((w) => w !== '');
  if (words.length === 0) {
    return [];
  }
  return STANDARD_DEFECTS.filter((d) => {
    const text = `${d.title} ${d.system} ${d.function} ${d.allocation}`;
    return words.every((w) => text.includes(w));
  });
}

/**
 * The standard defect list of an equipment zone (COCKPIT INTERFACE assistant).
 * @param area the cockpit area
 * @param zone the zone of the area
 * @returns the defects
 */
export function defectsInZone(area: CockpitArea, zone: string): StandardDefect[] {
  return STANDARD_DEFECTS.filter((d) => d.area === area && d.zone === zone);
}

/** How the simulated ground maintenance defers an item: the DEFERRED ITEMS panel and the MEL or CDL data */
export interface GroundDeferralRule {
  readonly category: 'MEL' | 'CDL' | 'OTHER';
  /** MEL, MEL(o), MEL(m), MEL(o)(m), the CDL equivalents, empty for OTHER */
  readonly classification: string;
  /** The MEL rectification interval (B, C or D), empty without a time limit */
  readonly rectificationInterval: '' | 'B' | 'C' | 'D';
  readonly severity: string;
}

/**
 * @param category the panel
 * @param classification the MEL or CDL classification
 * @param rectificationInterval the MEL rectification interval
 * @returns the rule, with the severity of its interval: the shorter the interval, the higher the severity
 */
function deferral(
  category: GroundDeferralRule['category'],
  classification: string,
  rectificationInterval: GroundDeferralRule['rectificationInterval'] = '',
): GroundDeferralRule {
  const severity = rectificationInterval === 'B' ? 'HIGH' : rectificationInterval === 'C' ? 'MEDIUM' : 'LOW';
  return { category, classification, rectificationInterval, severity };
}

/**
 * Design choice: the deferrals of the simulated ground maintenance, by ATA reference (chapter, or chapter-section where
 * the section decides). Redundant systems go to the MEL with a typical rectification interval, missing external parts to
 * the CDL, comfort and cleaning items to OTHER. What is not listed (flight controls, landing gear, engines, hydraulics)
 * is rectified before the next release.
 */
const GROUND_DEFERRALS: Readonly<Record<string, GroundDeferralRule>> = {
  '21': deferral('MEL', 'MEL(m)', 'C'),
  '22': deferral('MEL', 'MEL(o)', 'C'),
  '23': deferral('MEL', 'MEL(o)', 'C'),
  '23-61': deferral('CDL', 'CDL'),
  '25': deferral('OTHER', ''),
  '26': deferral('MEL', 'MEL(o)(m)', 'C'),
  '28': deferral('MEL', 'MEL(o)(m)', 'C'),
  '30': deferral('MEL', 'MEL(o)(m)', 'C'),
  '31': deferral('MEL', 'MEL', 'C'),
  '33': deferral('MEL', 'MEL(o)', 'C'),
  '33-11': deferral('MEL', 'MEL', 'D'),
  '33-12': deferral('MEL', 'MEL', 'D'),
  '33-14': deferral('MEL', 'MEL', 'D'),
  '34': deferral('MEL', 'MEL(o)(m)', 'C'),
  '35': deferral('MEL', 'MEL(o)(m)', 'B'),
  '46': deferral('MEL', 'MEL(o)', 'C'),
  '49': deferral('MEL', 'MEL(o)(m)', 'C'),
  '52': deferral('CDL', 'CDL(o)'),
  '52-51': deferral('MEL', 'MEL(o)(m)', 'C'),
  '56': deferral('OTHER', ''),
};

/**
 * What the simulated ground maintenance does with an item reported in a closed flight.
 * @param ata the ATA reference of the item (cc-ss-xx), empty when unknown
 * @returns the deferral, null when maintenance rectifies the item
 */
export function groundDeferralRule(ata: string): GroundDeferralRule | null {
  return GROUND_DEFERRALS[ata.substring(0, 5)] ?? GROUND_DEFERRALS[ata.substring(0, 2)] ?? null;
}
