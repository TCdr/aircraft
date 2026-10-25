// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DashboardPhase } from './dashboardPhase';
import { crosswindKt, crosswindLimit } from './crosswind';
import { metarPresentWeather, parseMetarWind } from './metarTokens';
import { thunderstormAt } from './tafThunderstorm';

export type AdviceTone = 'warn' | 'busy' | 'active';

/** What an advice is about: the short tag in front of its message */
export type AdviceCategory = 'weather' | 'wind' | 'fms' | 'ground' | 'ofp' | 'failures' | 'fuel';

export interface Advice {
  id: string;
  tone: AdviceTone;
  category: AdviceCategory;
  /** Localisation key under Dashboard.Advice */
  messageKey: string;
  args?: Record<string, string>;
  /** Names of the args that hold a weight in kilograms: the UI converts them to the user's weight unit */
  kilogramArgs?: string[];
  /** Route path of the flyPad. Undefined when the target is an MCDU or MFD page */
  link?: string;
  /** Localisation key of the link label, or of the MCDU/MFD page name when there is no route */
  linkKey: string;
}

export interface StationWx {
  icao: string;
  metar?: string;
  taf?: string;
  runwayHeadingDeg: number | null;
  isDeparture: boolean;
}

export interface AdviceInput {
  aircraft: 'a32nx' | 'a380x';
  phase: DashboardPhase;
  hasOfp: boolean;
  minutesToTod: number | null;
  destQnh: number;
  mda: number;
  dh: number;
  /** The FMS holds a flight plan (not the LNAV guidance variable: that needs a flown leg) */
  fmsHasFlightPlan: boolean;
  /** Minutes by which the projected end of the turnaround is after the scheduled departure; negative when early */
  turnaroundLateMin: number | null;
  /** Average wind component along the route: positive for a tailwind, negative for a headwind */
  avgWindComponentKt: number | null;
  activeFailures: number;
  /** Fuel burned minus planned trip fuel, kg */
  fuelUsedDeltaKg: number | null;
  dep?: StationWx;
  dest?: StationWx;
  altn?: StationWx;
  etaUtc: Date | null;
}

/** The descent preparation is expected to be done by this long before the top of descent */
const APPR_PREPARATION_MIN = 15;

const AIRBORNE_PHASES: DashboardPhase[] = ['climb', 'cruise', 'descent', 'approach'];
/** Share of the limit from which a crosswind is worth a warning */
const CROSSWIND_ADVICE_FRACTION = 0.8;
/** Pushback needs a few minutes after boarding ends (doors, final paperwork), so a turnaround ending closer than this to the departure time is already late */
const TURNAROUND_LATE_MARGIN_MIN = 5;
/** A route-average wind component of this size changes block time and fuel noticeably (jet stream level) */
const STRONG_WIND_KT = 50;
/** Smaller differences are within what taxi, APU and rounding of the plan explain */
const FUEL_USED_DELTA_KG = 500;

const DEPARTURE_PHASES: DashboardPhase[] = ['atGate', 'taxiOut', 'takeoff'];
const ARRIVAL_PHASES: DashboardPhase[] = ['climb', 'cruise', 'descent', 'approach'];
const THUNDERSTORM_PHASES: DashboardPhase[] = [
  'atGate',
  'taxiOut',
  'takeoff',
  'climb',
  'cruise',
  'descent',
  'approach',
];
const STRONG_WIND_PHASES: DashboardPhase[] = ['cruise', 'descent'];

const TONE_ORDER: AdviceTone[] = ['warn', 'busy', 'active'];

const usable = (station: StationWx | undefined): station is StationWx => !!station && !!station.icao;

const thunderstormAdvice = (input: AdviceInput): Advice[] => {
  if (!input.etaUtc || THUNDERSTORM_PHASES.indexOf(input.phase) < 0) {
    return [];
  }
  const advice: Advice[] = [];
  const stations: [string, StationWx | undefined][] = [
    ['dest', input.dest],
    ['altn', input.altn],
  ];
  for (const [role, station] of stations) {
    if (!usable(station)) {
      continue;
    }
    const outlook = thunderstormAt(station.taf, station.metar, input.etaUtc);
    if (outlook !== 'none') {
      advice.push({
        id: `thunderstorm-${role}`,
        category: 'weather',
        tone: outlook === 'likely' ? 'warn' : 'busy',
        messageKey:
          outlook === 'likely' ? 'Dashboard.Advice.ThunderstormLikely' : 'Dashboard.Advice.ThunderstormPossible',
        args: { icao: station.icao },
        // The weather card is on the dashboard the advice is shown on, so there is nothing to open
        linkKey: 'Dashboard.Advice.Link.Weather',
      });
    }
  }
  return advice;
};

const crosswindAdvice = (input: AdviceInput): Advice[] => {
  const advice: Advice[] = [];
  for (const station of [input.dep, input.dest]) {
    if (!usable(station) || !station.metar) {
      continue;
    }
    const relevantPhases = station.isDeparture ? DEPARTURE_PHASES : ARRIVAL_PHASES;
    if (relevantPhases.indexOf(input.phase) < 0) {
      continue;
    }
    const wind = parseMetarWind(station.metar);
    if (!wind) {
      continue;
    }
    const crosswind = crosswindKt(wind.dirDeg, wind.speedKt, wind.gustKt, station.runwayHeadingDeg);
    if (crosswind === null) {
      continue;
    }
    const { limitKt, kind } = crosswindLimit(input.aircraft, metarPresentWeather(station.metar));
    if (crosswind < CROSSWIND_ADVICE_FRACTION * limitKt) {
      continue;
    }
    // Only a certified value is a hard limit; demonstrated and recommended values stay a caution
    const exceeded = kind === 'certified' && crosswind > limitKt;
    advice.push({
      id: `crosswind-${station.isDeparture ? 'dep' : 'dest'}`,
      category: 'wind',
      tone: exceeded ? 'warn' : 'busy',
      messageKey: exceeded
        ? 'Dashboard.Advice.CrosswindExceeded'
        : `Dashboard.Advice.Crosswind.${kind === 'demonstrated' ? 'Demonstrated' : kind === 'recommended' ? 'Recommended' : 'Certified'}`,
      args: { icao: station.icao, crosswind: String(crosswind), limit: String(limitKt) },
      link: '/performance',
      linkKey: 'Dashboard.Advice.Link.Performance',
    });
  }
  return advice;
};

const apprDataAdvice = (input: AdviceInput): Advice[] => {
  // The planned top of descent decides when it is known: the FMS can enter its descent phase long before it
  const airborne = AIRBORNE_PHASES.indexOf(input.phase) >= 0;
  const inPreparationWindow =
    input.minutesToTod !== null ? airborne && input.minutesToTod <= APPR_PREPARATION_MIN : input.phase === 'descent';
  const missing = input.destQnh === 0 || (input.mda === 0 && input.dh === -1);
  if (!inPreparationWindow || !missing) {
    return [];
  }
  return [
    {
      id: 'appr-data',
      category: 'fms',
      tone: 'busy',
      messageKey: 'Dashboard.Advice.ApprDataMissing',
      linkKey: input.aircraft === 'a380x' ? 'Dashboard.Advice.Link.MfdPerfAppr' : 'Dashboard.Advice.Link.McduPerfAppr',
    },
  ];
};

const fmsNotInitialisedAdvice = (input: AdviceInput): Advice[] =>
  input.phase === 'atGate' && input.hasOfp && !input.fmsHasFlightPlan
    ? [
        {
          id: 'fms-not-initialised',
          category: 'fms',
          tone: 'busy',
          messageKey: 'Dashboard.Advice.FmsNotInitialised',
          linkKey: input.aircraft === 'a380x' ? 'Dashboard.Advice.Link.MfdInit' : 'Dashboard.Advice.Link.McduInit',
        },
      ]
    : [];

const turnaroundLateAdvice = (input: AdviceInput): Advice[] =>
  input.phase === 'atGate' && input.turnaroundLateMin !== null && input.turnaroundLateMin > -TURNAROUND_LATE_MARGIN_MIN
    ? [
        {
          id: 'turnaround-late',
          category: 'ground',
          tone: 'busy',
          messageKey: 'Dashboard.Advice.TurnaroundLate',
          link: '/ground',
          linkKey: 'Dashboard.Advice.Link.Ground',
        },
      ]
    : [];

const strongWindAdvice = (input: AdviceInput): Advice[] =>
  STRONG_WIND_PHASES.indexOf(input.phase) >= 0 &&
  input.avgWindComponentKt !== null &&
  Math.abs(input.avgWindComponentKt) >= STRONG_WIND_KT
    ? [
        {
          id: 'strong-wind',
          category: 'wind',
          tone: 'active',
          messageKey:
            input.avgWindComponentKt < 0 ? 'Dashboard.Advice.StrongHeadwind' : 'Dashboard.Advice.StrongTailwind',
          args: { wind: String(Math.round(Math.abs(input.avgWindComponentKt))) },
          linkKey: 'Dashboard.Advice.Link.Flight',
        },
      ]
    : [];

const noOfpAdvice = (input: AdviceInput): Advice[] =>
  input.hasOfp
    ? []
    : [
        {
          id: 'no-ofp',
          category: 'ofp',
          tone: 'active',
          messageKey: 'Dashboard.Advice.NoOfp',
          link: '/dispatch',
          linkKey: 'Dashboard.Advice.Link.ImportOfp',
        },
      ];

const activeFailuresAdvice = (input: AdviceInput): Advice[] =>
  input.activeFailures > 0
    ? [
        {
          id: 'active-failures',
          category: 'failures',
          tone: 'busy',
          messageKey: 'Dashboard.Advice.ActiveFailures',
          args: { count: String(input.activeFailures) },
          link: '/failures',
          linkKey: 'Dashboard.Advice.Link.Failures',
        },
      ]
    : [];

const fuelUsedAdvice = (input: AdviceInput): Advice[] => {
  if (
    input.phase !== 'arrived' ||
    input.fuelUsedDeltaKg === null ||
    Math.abs(input.fuelUsedDeltaKg) < FUEL_USED_DELTA_KG
  ) {
    return [];
  }
  return [
    {
      id: 'fuel-used',
      category: 'fuel',
      tone: 'active',
      messageKey: input.fuelUsedDeltaKg > 0 ? 'Dashboard.Advice.FuelUsedHigher' : 'Dashboard.Advice.FuelUsedLower',
      args: { delta: String(Math.round(Math.abs(input.fuelUsedDeltaKg))) },
      kilogramArgs: ['delta'],
      link: '/ground/fuel',
      linkKey: 'Dashboard.Advice.Link.Fuel',
    },
  ];
};

export const buildAdvice = (input: AdviceInput): Advice[] => {
  const inRuleOrder = [
    ...thunderstormAdvice(input),
    ...crosswindAdvice(input),
    ...apprDataAdvice(input),
    ...fmsNotInitialisedAdvice(input),
    ...turnaroundLateAdvice(input),
    ...strongWindAdvice(input),
    ...noOfpAdvice(input),
    ...activeFailuresAdvice(input),
    ...fuelUsedAdvice(input),
  ];
  // The index tie-break keeps rule order independent of whether the engine's sort is stable
  return inRuleOrder
    .map((advice, index) => ({ advice, index }))
    .sort((a, b) => TONE_ORDER.indexOf(a.advice.tone) - TONE_ORDER.indexOf(b.advice.tone) || a.index - b.index)
    .map((entry) => entry.advice);
};
