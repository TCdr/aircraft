// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AocPrintout } from '@shared/AocPrintout';
import { formatLength, formatWeight, lengthUnitLabel, weightUnitLabel } from './PerformanceEntries';
import { TakeoffResults, takeoffFlapsLabel, takeoffThrustLabel } from './TakeoffPerformance';
import { LANDING_GO_AROUND_CONF_LABELS, LandingResults } from './LandingPerformance';
import { LandingConf } from '@flybywiresim/fbw-sdk';

/*
 * PRINT of T.O PERF and LDG PERF: the page as the crew sees it (the conditions as entered, the aircraft status and the
 * results of the shown runway) on the printer, under the title of the application.
 */

/** A labelled value of a printout, e.g. ['OAT', '15 °C'] */
export type PrintoutEntry = readonly [string, string];

/** What a T.O PERF or LDG PERF printout shows */
export interface PerformancePrintoutContent<R> {
  readonly flightNumber: string;
  /** The airport of the computation */
  readonly airport: string;
  /** The CONDITIONS panel as shown */
  readonly conditions: readonly PrintoutEntry[];
  /** The reminder area of the AIRCRAFT STATUS panel */
  readonly aircraftStatus: readonly string[];
  /** The MEL and CDL items the computation does not take into account */
  readonly notInComputation: readonly string[];
  readonly results: R;
  /** The ERROR list of the computation */
  readonly errors: readonly string[];
  /** The RWY list of a MULTIPLE RWY COMPUTATION, empty for a SINGLE RWY COMPUTATION */
  readonly runwayList: readonly string[];
  readonly metric: boolean;
}

const LABEL_WIDTH = 16;

/**
 * @param label the label of a line
 * @param value its value
 * @returns the line, the values in one column
 */
function entry(label: string, value: string): string {
  return `${label.padEnd(LABEL_WIDTH)}${value}`;
}

/**
 * @param knots a speed, null when the computation gives none
 * @returns the speed of a printout
 */
function speed(knots: number | null): string {
  return knots !== null ? `${knots.toFixed(0)} KT` : '---';
}

/**
 * @param kg a weight, null when the computation gives none
 * @param metric whether the weights are in tonnes (else klbs)
 * @returns the weight of a printout, with its unit
 */
function weightText(kg: number | null, metric: boolean): string {
  return kg !== null ? `${formatWeight(kg, metric)} ${weightUnitLabel(metric)}` : '---';
}

/**
 * @param metres a length, null when the computation gives none
 * @param metric whether the lengths are in metres (else feet)
 * @returns the length of a printout, with its unit
 */
function lengthText(metres: number | null, metric: boolean): string {
  return metres !== null ? `${formatLength(metres, metric)} ${lengthUnitLabel(metric)}` : '---';
}

/**
 * The lines every performance printout starts and ends with around its results.
 * @param content the printout content
 * @param results the result lines
 * @returns the text
 */
function printoutText(content: PerformancePrintoutContent<unknown>, results: readonly string[]): string {
  const lines = [entry('FLT', content.flightNumber), entry('AIRPORT', content.airport), '', 'CONDITIONS'];
  lines.push(...content.conditions.map(([label, value]) => entry(label, value)));
  lines.push('', 'AIRCRAFT STATUS', ...content.aircraftStatus);
  if (content.notInComputation.length > 0) {
    lines.push('NOT IN COMPUTATION - APPLY THE PENALTIES BY HAND:', ...content.notInComputation.map((t) => `  ${t}`));
  }
  if (content.runwayList.length > 0) {
    lines.push('', `MULTIPLE RWY COMPUTATION: ${content.runwayList.join(' ')}`);
  }
  lines.push('', 'RESULTS', ...results);
  if (content.errors.length > 0) {
    lines.push('', ...content.errors.map((error) => `*** ${error}`));
  }
  lines.push('', 'END');
  return lines.join('\n');
}

/**
 * @param content the T.O PERF page
 * @returns the printout, titled T.O PERF
 */
export function takeoffPerfPrintout(content: PerformancePrintoutContent<TakeoffResults>): AocPrintout {
  const r = content.results;
  return {
    title: 'T.O PERF',
    text: printoutText(content, [
      entry('RWY', r.runway),
      entry('TOW', weightText(r.tow, content.metric)),
      entry('MTOW(PERF)', weightText(r.mtowPerf, content.metric)),
      entry('THRUST', takeoffThrustLabel(r.thrust)),
      entry('V1', speed(r.v1)),
      entry('VR', speed(r.vr)),
      entry('V2', speed(r.v2)),
      entry('FLAPS', takeoffFlapsLabel(r.flaps)),
      entry('STOP MARGIN', lengthText(r.stopMargin, content.metric)),
      entry('T.O SHIFT', lengthText(r.takeoffShift, content.metric)),
      entry('EO ACCEL', `${r.engineOutAcceleration.toFixed(0)} FT`),
      r.reverseThrustCredit ? 'REVERSE THRUST CREDIT' : 'NO REVERSE THRUST CREDIT',
    ]),
  };
}

/**
 * @param content the LDG PERF page
 * @returns the printout, titled LDG PERF
 */
export function landingPerfPrintout(content: PerformancePrintoutContent<LandingResults>): AocPrintout {
  const r = content.results;
  const lines = [entry('RWY', r.runway)];
  if (r.overweight) {
    lines.push('OVERWEIGHT LANDING');
  }
  lines.push(
    entry('LW', weightText(r.lw, content.metric)),
    entry('MLW(PERF)', weightText(r.mlwPerf, content.metric)),
    entry('LIMITATION CODE', r.limitation ?? ''),
    entry('FLAPS', r.flaps === LandingConf.Conf3 ? '3' : 'FULL'),
    entry('VAPP', `VLS+${r.speedIncrement.toFixed(0)} KT (${r.vapp.toFixed(0)} KT)`),
    entry('LDG DIST', lengthText(r.landingDistance, content.metric)),
    entry('STOP MARGIN', lengthText(r.stopMargin, content.metric)),
    entry('GA SPEED', speed(r.goAroundSpeed)),
  );
  if (r.goAroundConf) {
    lines.push(entry('GA CONF', LANDING_GO_AROUND_CONF_LABELS[r.goAroundConf]));
  }
  lines.push(
    entry('GA GRADIENT', r.goAroundGradient !== null ? `${r.goAroundGradient.toFixed(3)} %` : '---'),
    entry('ACTUAL LDG DIST', lengthText(r.actualLandingDistance, content.metric)),
    entry('RWY LENGTH', lengthText(r.runwayLength, content.metric)),
    r.reverseThrustCredit ? 'REVERSE THRUST CREDIT' : 'NO REVERSE THRUST CREDIT',
  );
  return { title: 'LDG PERF', text: printoutText(content, lines) };
}
