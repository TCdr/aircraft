// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { WindEntry, formatWeight, missingParameterErrors } from './PerformanceEntries';
import { TakeoffComputation, TakeoffThrustOption, takeoffThrustLabel } from './TakeoffPerformance';
import { LandingComputation } from './LandingPerformance';
import { PerformanceRunway } from './PerformanceRunways';

/*
 * MULTIPLE RWY COMPUTATION of T.O PERF and LDG PERF: the same conditions computed on each runway the crew ticked, and
 * the RWY list of the RESULTS panel that shows the result of each runway between brackets, sorted and colour-coded.
 */

/** The computation of one runway */
export interface RunwayComputation<C> {
  readonly ident: string;
  readonly computation: C;
}

export type RunwayResultColour = 'green' | 'amber' | 'red';

/** An item of the RWY list of the RESULTS panel */
export interface RunwayResultItem {
  readonly ident: string;
  /** e.g. 06(1354.3), 06(68C), 15R(TOGA), 33L(---) */
  readonly label: string;
  readonly colour: RunwayResultColour;
}

/** A computation of T.O PERF or LDG PERF: its results, or the errors that prevent them */
interface Computation<R> {
  readonly results: R | null;
  readonly errors: string[];
}

/**
 * COMPUTE of a MULTIPLE RWY COMPUTATION: the conditions on each ticked runway of the airport; the RESULTS panel shows
 * the first runway of the RWY list.
 * @param runways the runways of the airport
 * @param ticked the runways ticked in the table
 * @param wind the WIND entry
 * @param compute computes the conditions on one runway
 * @param sortItems the RWY list of the computations
 * @returns the computation shown, and the computation of each runway (null when none could be made)
 */
export function computeMultipleRunways<R>(
  runways: readonly PerformanceRunway[],
  ticked: readonly string[],
  wind: WindEntry | null,
  compute: (runway: PerformanceRunway) => Computation<R>,
  sortItems: (runs: readonly RunwayComputation<Computation<R>>[]) => RunwayResultItem[],
): { readonly shown: Computation<R>; readonly runs: readonly RunwayComputation<Computation<R>>[] | null } {
  const windError = multipleRunwayWindError(wind);
  if (windError !== null) {
    return { shown: { results: null, errors: [windError] }, runs: null };
  }
  const runs = runways
    .filter((runway) => ticked.includes(runway.ident))
    .map((runway) => ({ ident: runway.ident, computation: compute(runway) }));
  const first = sortItems(runs)[0];
  const shown = runs.find((run) => run.ident === first?.ident);
  return shown
    ? { shown: shown.computation, runs }
    : { shown: { results: null, errors: missingParameterErrors(['RWY']) }, runs: null };
}

/** The text between brackets of a runway without results */
const NO_RESULT = '---';

/**
 * A MULTIPLE RWY COMPUTATION needs the wind as a direction and a speed, to project it on each runway.
 * @param wind the WIND entry, null when empty
 * @returns the line of the ERROR list, null when the wind can be used
 */
export function multipleRunwayWindError(wind: WindEntry | null): string | null {
  return wind !== null && wind.kind === 'longitudinal'
    ? 'WIND: enter a direction/speed for a MULTIPLE RWY COMPUTATION'
    : null;
}

/**
 * Sorts in decreasing order, the missing values last
 * @param a a value, null when missing
 * @param b another value, null when missing
 * @returns the sort order
 */
function decreasing(a: number | null, b: number | null): number {
  if (a === null || b === null) {
    return a === null ? (b === null ? 0 : 1) : -1;
  }
  return b - a;
}

/**
 * The RWY list of T.O PERF. With TOGA or a derate the list shows the MTOW(perf), sorted by weight, green when it
 * permits the TOW. With FLEX it shows TFLEX (or TOGA), with OPTIMUM DERATE the thrust kind, sorted by temperature then
 * weight: green for a FLEX takeoff, amber for TOGA or a derate the TOW permits, red otherwise.
 * @param runways the computation of each runway
 * @param thrust the THRUST option of the computation
 * @param metric whether the weights are in tonnes (else klbs)
 * @returns the items, sorted
 */
export function takeoffRunwayItems(
  runways: readonly RunwayComputation<TakeoffComputation>[],
  thrust: TakeoffThrustOption,
  metric: boolean,
): RunwayResultItem[] {
  const byTemperature = thrust.kind === 'FLEX' || thrust.kind === 'OPTIMUM DERATE';
  const items = runways.map(({ ident, computation }) => {
    const results = computation.results;
    const mtow = results?.mtowPerf ?? null;
    const towPermitted = results !== null && mtow !== null && mtow >= results.tow && results.v1 !== null;
    const flex = results !== null && towPermitted && results.thrust.kind === 'FLEX' ? results.thrust.temperature : null;
    let text: string;
    let colour: RunwayResultColour;
    if (!byTemperature) {
      text = mtow !== null ? formatWeight(mtow, metric) : NO_RESULT;
      colour = towPermitted ? 'green' : 'red';
    } else if (results === null || (thrust.kind === 'OPTIMUM DERATE' && !towPermitted)) {
      text = NO_RESULT;
      colour = 'red';
    } else if (flex !== null) {
      text = thrust.kind === 'FLEX' ? `${flex.toFixed(0)}C` : 'FLEX';
      colour = 'green';
    } else {
      text = takeoffThrustLabel(results.thrust);
      colour = towPermitted ? 'amber' : 'red';
    }
    return { item: { ident, label: `${ident}(${text})`, colour }, flex, mtow };
  });
  items.sort((a, b) =>
    byTemperature ? decreasing(a.flex, b.flex) || decreasing(a.mtow, b.mtow) : decreasing(a.mtow, b.mtow),
  );
  return items.map((i) => i.item);
}

/**
 * The RWY list of LDG PERF: the MLW(perf) of each runway, sorted by weight, green when it permits the LW.
 * @param runways the computation of each runway
 * @param metric whether the weights are in tonnes (else klbs)
 * @returns the items, sorted
 */
export function landingRunwayItems(
  runways: readonly RunwayComputation<LandingComputation>[],
  metric: boolean,
): RunwayResultItem[] {
  const items = runways.map(({ ident, computation }) => {
    const results = computation.results;
    const mlw = results?.mlwPerf ?? null;
    const colour: RunwayResultColour = results !== null && mlw !== null && mlw >= results.lw ? 'green' : 'red';
    return { item: { ident, label: `${ident}(${mlw !== null ? formatWeight(mlw, metric) : NO_RESULT})`, colour }, mlw };
  });
  items.sort((a, b) => decreasing(a.mlw, b.mlw));
  return items.map((i) => i.item);
}
