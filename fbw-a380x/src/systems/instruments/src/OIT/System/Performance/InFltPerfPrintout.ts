// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AocPrintout } from '@shared/AocPrintout';
import {
  AtmoIsaInformation,
  AtmoWind,
  atmoIsaDeviation,
  atmoSat,
  formatAtmoTrueAltitude,
  formatAtmoWind,
  isDirectionSpeedWind,
} from '../InFltPerfAtmo';
import {
  ATMO_ALT_TYPES,
  ATMO_COMPUTATION_TYPES,
  ATMO_SPEED_TYPES,
  AtmoResultsView,
  InFltPerfAtmoSession,
  atmoMode,
} from '../InFltPerfAtmoSession';
import { PrintoutEntry, entry as printoutEntry } from './PerformancePrintouts';

/*
 * The IN-FLT PERF printout, for STORE. The FCOM shows no IN-FLT PERF snapshot, only that the document is named IFPA, so
 * it mirrors the panels of the ATMO page (the entries that count for the computation, then the RESULTS panel) in the
 * style of the T.O PERF and LDG PERF printouts.
 */

export const IN_FLT_PERF_TITLE = 'IN-FLT PERF';

const NOT_ENTERED = '---';

/**
 * @param value an entry
 * @param unit its unit
 * @param decimals the decimals shown
 * @returns the entry as a printout value
 */
function numberText(value: number | null, unit: string, decimals = 0): string {
  return value === null ? NOT_ENTERED : `${value.toFixed(decimals)} ${unit}`.trim();
}

/**
 * @param wind the WIND entry
 * @param courseDeg the CRS entry
 * @returns the entry as the page shows it
 */
function windText(wind: AtmoWind | null, courseDeg: number | null): string {
  return wind === null ? NOT_ENTERED : formatAtmoWind(wind, isDirectionSpeedWind(wind) ? courseDeg : null);
}

/**
 * @param session the entries of the ATMO page
 * @param weightUnit the unit of the GROSS WGHT entry
 * @returns the CONDITIONS and SPECIFIC DATA panels as shown for the computation of the page: the fields it hides are
 * not printed
 */
function entriesOf(
  session: InFltPerfAtmoSession,
  weightUnit: string,
): { conditions: PrintoutEntry[]; specificData: PrintoutEntry[] } {
  const mode = atmoMode(session.computationType.get(), session.altType.get());
  const altitude = session.indicatedAltitude.get();
  const isaDeviation = atmoIsaDeviation(session.temperature.get(), altitude);
  const sat = atmoSat(session.temperature.get(), altitude);
  const temperature: PrintoutEntry = [
    'TEMP',
    isaDeviation === null || sat === null
      ? NOT_ENTERED
      : `ISA ${isaDeviation >= 0 ? '+' : ''}${Math.round(isaDeviation)} C   SAT ${Math.round(sat)} C`,
  ];
  const specificData: PrintoutEntry[] = [['COMPUTATION', ATMO_COMPUTATION_TYPES[mode === 'SPEED' ? 0 : 1]]];
  const conditions: PrintoutEntry[] = [];

  if (mode === 'SPEED') {
    const speedIsIas = session.speedType.get() === 1;
    conditions.push(['WIND', windText(session.wind.get(), session.course.get())]);
    if (isDirectionSpeedWind(session.wind.get())) {
      conditions.push(['CRS', numberText(session.course.get(), 'DEG')]);
    }
    conditions.push(temperature, ['GROSS WGHT', numberText(session.grossWeight.get(), weightUnit, 1)]);
    specificData.push(
      ['SPD TYPE', ATMO_SPEED_TYPES[speedIsIas ? 1 : 0]],
      speedIsIas ? ['IAS', numberText(session.ias.get(), 'KT')] : ['MACH', numberText(session.mach.get(), '', 2)],
      ['INDICATED ALT', numberText(altitude, 'FT')],
    );
  } else if (mode === 'TRUE ALT') {
    conditions.push(temperature);
    specificData.push(['ALT TYPE', ATMO_ALT_TYPES[0]], ['INDICATED ALT', numberText(altitude, 'FT')]);
  } else {
    specificData.push(['ALT TYPE', ATMO_ALT_TYPES[1]], ['HGT AAL', numberText(session.heightAal.get(), 'FT')]);
  }
  specificData.push(['ARPT ELEVN', numberText(session.airportElevation.get(), 'FT')]);
  if (mode === 'LO ALT') {
    specificData.push(['ARPT TEMP', numberText(session.airportTemperature.get(), 'C')]);
  }
  return { conditions, specificData };
}

/**
 * @param view the RESULTS panel
 * @returns its lines, empty when there are no results
 */
function resultLines(view: AtmoResultsView): string[] {
  const rounded = (value: number, unit: string) => `${Math.round(value).toFixed(0)} ${unit}`;
  const isa = (results: AtmoIsaInformation) => [
    printoutEntry('PRESSURE', rounded(results.pressureHpa, 'HPA')),
    printoutEntry('DENSITY RATIO', results.densityRatio.toFixed(4)),
    printoutEntry('SPD OF SOUND', rounded(results.speedOfSoundKt, 'KT')),
    printoutEntry('SAT', rounded(results.satC, 'C')),
  ];
  if (view.kind === 'speed') {
    const r = view.results;
    return [
      'ATMOSPHERE INFORMATION',
      'CONVERSIONS',
      printoutEntry('IAS', rounded(r.iasKt, 'KT')),
      printoutEntry('MACH', r.mach.toFixed(2)),
      printoutEntry('TAS', rounded(r.tasKt, 'KT')),
      printoutEntry('GS', rounded(r.gsKt, 'KT')),
      printoutEntry('TRUE ALT', formatAtmoTrueAltitude(r.trueAltitudeFt)),
      'ISA INFORMATION',
      ...isa(r),
      printoutEntry('TAT', rounded(r.tatC, 'C')),
    ];
  }
  if (view.kind === 'true alt') {
    return [
      'ATMOSPHERE INFORMATION',
      'ISA INFORMATION',
      printoutEntry('TRUE ALT', formatAtmoTrueAltitude(view.results.trueAltitudeFt)),
      ...isa(view.results),
    ];
  }
  if (view.kind === 'lo alt') {
    return [
      'LOW ALTITUDE TEMPERATURE CORRECTIONS',
      printoutEntry('CORRECTION', `${view.results.correctionFt.toFixed(0)} FT`),
      printoutEntry('CORR HGT AAL', `${view.results.correctedHeightAalFt.toFixed(0)} FT`),
    ];
  }
  return [];
}

/**
 * @param session the entries and results of the ATMO page
 * @param weightUnit the unit of the GROSS WGHT entry
 * @returns the printout of the page as computed, null while the page shows no results
 */
export function inFltPerfPrintout(session: InFltPerfAtmoSession, weightUnit: string): AocPrintout | null {
  const results = resultLines(session.results.get());
  if (results.length === 0) {
    return null;
  }
  const { conditions, specificData } = entriesOf(session, weightUnit);
  const lines = ['ATMO', ''];
  if (conditions.length > 0) {
    lines.push('CONDITIONS', ...conditions.map(([label, value]) => printoutEntry(label, value)), '');
  }
  lines.push('SPECIFIC DATA', ...specificData.map(([label, value]) => printoutEntry(label, value)));
  lines.push('', 'RESULTS', ...results, '', 'END');
  return { title: IN_FLT_PERF_TITLE, text: lines.join('\n') };
}
