// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The fuel flow in the FWD and AFT transfer galleries of the SD FUEL page, including the jettison flow.
 *
 * A380 FCOM DSC-28-40 Fuel Jettison (a380_fcom.txt l.60012-60031): "When fuel jettison is initiated: - All fuel transfers
 * stop - All transfer pumps run - The forward gallery connects to the aft gallery - The jettison valves open. There are
 * two jettison valves, that are on the aft gallery."
 *
 * The jettison itself is run by the FQMS of the systems host (CpiomF/FuelJettison), which takes the fuel out of the
 * transfer tanks directly (the MSFS fuel system has no overboard outlet) and opens the MSFS jettison valves 57 and 58;
 * the MSFS transfer pumps stay off. So, while the jettison runs, the page shows the transfer pumps running and the
 * galleries connected, as the FCOM describes, from L:A380X_FUEL_JETTISON_IN_PROGRESS.
 *
 * Not shown (left): the trim tank jettison path. The trim lines of the FUEL page are not wired to the fuel model at
 * all (normal transfers included), and the trim line valves stay closed in the model during a jettison.
 */

/** A point of a gallery: a pump (fuel source) or a valve or outlet (fuel way out) at abscissa x */
export interface GalleryFlowPoint {
  x: number;
  /** the pump runs, or the valve/outlet is open */
  active: boolean;
}

/** The part of a gallery the fuel flows through */
export interface GalleryFlowSpan {
  /** fuel flows: at least one way out of the gallery is open */
  flowing: boolean;
  /** abscissa of the first active point */
  firstX: number;
  /** abscissa of the last active point */
  lastX: number;
}

/**
 * The flowing part of a gallery: from the first to the last running pump or open valve/outlet, when at least one way
 * out (a transfer valve into a tank, or an outlet such as a jettison valve or the FWD-to-AFT gallery link) is open.
 * Without an outlet, this is the rule the FUEL page always had for its transfer valves.
 * @param pumps the pumps of the gallery
 * @param valves the transfer valves of the gallery into the tanks
 * @param outlets the other ways out of the gallery (jettison valves, link to the other gallery)
 */
export function galleryFlowSpan(
  pumps: readonly GalleryFlowPoint[],
  valves: readonly GalleryFlowPoint[],
  outlets: readonly GalleryFlowPoint[] = [],
): GalleryFlowSpan {
  const activeXs = [...pumps, ...valves, ...outlets].filter((point) => point.active).map((point) => point.x);
  return {
    flowing: valves.some((valve) => valve.active) || outlets.some((outlet) => outlet.active),
    firstX: activeXs.length > 0 ? Math.min(...activeXs) : Infinity,
    lastX: activeXs.length > 0 ? Math.max(...activeXs) : -Infinity,
  };
}

/** Whether the gallery line from x1 to x2 (x1 <= x2) carries fuel (green) */
export function isGallerySegmentActive(span: GalleryFlowSpan, x1: number, x2: number): boolean {
  return span.flowing && x1 >= span.firstX && x2 <= span.lastX;
}

/**
 * Inserts the outlets in the abscissa-sorted valve list, after the valves at the same abscissa, so that the gallery
 * line is split at each outlet.
 * @param valves the valves, sorted by x1
 * @param outlets the outlets as zero-length lines, sorted by x1
 */
export function insertOutletsByX<T extends { x1: number }>(valves: readonly T[], outlets: readonly T[]): T[] {
  const merged: T[] = [];
  let j = 0;
  for (const valve of valves) {
    while (j < outlets.length && outlets[j].x1 < valve.x1) {
      merged.push(outlets[j++]);
    }
    merged.push(valve);
  }
  while (j < outlets.length) {
    merged.push(outlets[j++]);
  }
  return merged;
}

/** What a fuel jettison adds to the gallery flow of the FUEL page */
export interface JettisonGalleryFlow {
  /** "All transfer pumps run" (l.60014): the wing transfer pumps are shown running */
  transferPumpsRun: boolean;
  /** "The forward gallery connects to the aft gallery" (l.60024): the FWD-to-AFT gallery line carries fuel */
  galleryLinkActive: boolean;
  /** The left jettison valve is a way out of the AFT gallery (l.60027-60029) */
  leftOutletActive: boolean;
  /** The right jettison valve is a way out of the AFT gallery */
  rightOutletActive: boolean;
}

/**
 * @param jettisonInProgress the FQMS runs a jettison (L:A380X_FUEL_JETTISON_IN_PROGRESS)
 * @param leftValveOpen the left jettison valve is open (MSFS valve 57)
 * @param rightValveOpen the right jettison valve is open (MSFS valve 58)
 * @param galleryAuxRefuelValveOpen a gallery aux refuel valve (MSFS valves 54/55, the FWD-to-AFT gallery link) is open
 */
export function jettisonGalleryFlow(
  jettisonInProgress: boolean,
  leftValveOpen: boolean,
  rightValveOpen: boolean,
  galleryAuxRefuelValveOpen: boolean,
): JettisonGalleryFlow {
  return {
    transferPumpsRun: jettisonInProgress,
    galleryLinkActive: galleryAuxRefuelValveOpen || jettisonInProgress,
    // An open jettison valve is a way out of the AFT gallery, also when it is abnormally open
    leftOutletActive: leftValveOpen,
    rightOutletActive: rightValveOpen,
  };
}

/**
 * Whether a wing transfer pump is shown running: running in the fuel model, or run by the FQMS for a jettison, unless
 * its pb-sw is OFF or it is failed.
 * @param modelRunning the pump runs in the fuel model (FQMS pump running word)
 * @param jettison the jettison flow (jettisonGalleryFlow)
 * @param switchOff the pump pb-sw is OFF
 * @param failed the pump is failed (pump fault light), false for the pumps without a fault output
 */
export function isTransferPumpRunning(
  modelRunning: boolean,
  jettison: JettisonGalleryFlow,
  switchOff: boolean,
  failed: boolean,
): boolean {
  return modelRunning || (jettison.transferPumpsRun && !switchOff && !failed);
}
