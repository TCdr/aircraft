// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

export type ServiceKind =
  | 'notStarted'
  | 'onTheWay'
  | 'refueling'
  | 'defueling'
  | 'boarding'
  | 'deboarding'
  | 'complete';

export interface ServiceStatus {
  kind: ServiceKind;
  /** 0..1, null while there is nothing to measure */
  progress: number | null;
  minutesLeft: number | null;
  /** Passengers boarded (or deboarded), null for fuel and for services that have not started */
  done: number | null;
  total: number | null;
}

/** GsxServiceStates of the shared package, repeated so this module stays free of SimVar imports */
const GSX_REQUESTED = 4;
const GSX_ACTIVE = 5;
const GSX_COMPLETED = 6;

const DEFAULT_TOLERANCE_KG = 1;
/** The Fuel pages count a tank load within 10 of the target as done: gallons on the A32NX, kilograms on the A380X */
const FUEL_PAGE_TOLERANCE = 10;

/** The fuel weight the Fuel page of the aircraft still counts as on target */
export const fuelToleranceKg = (isA380: boolean, kilogramsPerGallon: number): number =>
  isA380 ? FUEL_PAGE_TOLERANCE : FUEL_PAGE_TOLERANCE * kilogramsPerGallon;

export interface FuelServiceInput {
  gsxSync: boolean;
  gsxRefuelState: number;
  startedByUser: boolean;
  currentKg: number;
  targetKg: number;
  /** Fuel on board when the service started */
  startKg: number;
  minutesLeft: number | null;
  /** How close to the target counts as reached; the Ground page's own threshold goes here */
  toleranceKg?: number;
  /**
   * The refuel ran or the OFP fuel was imported since this OFP was loaded: an aircraft at an ordered target of 0 is then
   * done, while a cold aircraft that nobody fuelled is not
   */
  ordered?: boolean;
}

export interface PayloadServiceInput {
  gsxSync: boolean;
  gsxBoardingState: number;
  gsxDeboardingState: number;
  startedByUser: boolean;
  paxOnBoard: number;
  paxTarget: number;
  /** Passengers on board when the service started */
  paxStart: number;
  /** The boarding or deboarding ran or the OFP payload was imported since this OFP was loaded (see FuelServiceInput) */
  ordered?: boolean;
}

const NOT_STARTED: ServiceStatus = { kind: 'notStarted', progress: null, minutesLeft: null, done: null, total: null };

/** Share of the way from start to target, 0..1; null when start and target are the same */
const fractionDone = (current: number, start: number, target: number): number | null => {
  if (target === start) {
    return null;
  }
  return Math.min(Math.max((current - start) / (target - start), 0), 1);
};

export const fuelServiceStatus = (i: FuelServiceInput): ServiceStatus => {
  // A target equal to the fuel on board counts as defueling, as the Fuel page always showed it
  const direction = (): ServiceKind => (i.targetKg > i.currentKg ? 'refueling' : 'defueling');
  const running = (kind: ServiceKind): ServiceStatus => ({
    kind,
    progress: fractionDone(i.currentKg, i.startKg, i.targetKg),
    minutesLeft: i.minutesLeft,
    done: null,
    total: null,
  });
  const complete: ServiceStatus = { ...NOT_STARTED, kind: 'complete', progress: 1 };

  if (i.gsxSync && i.gsxRefuelState === GSX_ACTIVE) {
    return running(direction());
  }
  if (i.gsxSync && i.gsxRefuelState === GSX_REQUESTED) {
    return { ...NOT_STARTED, kind: 'onTheWay', minutesLeft: i.minutesLeft };
  }
  if (i.startedByUser) {
    return running(direction());
  }
  if (i.gsxSync && i.gsxRefuelState === GSX_COMPLETED) {
    return complete;
  }
  // A target of 0 nobody ordered is nothing done, not a finished refuel
  if ((i.targetKg > 0 || i.ordered) && Math.abs(i.currentKg - i.targetKg) < (i.toleranceKg ?? DEFAULT_TOLERANCE_KG)) {
    return complete;
  }
  return NOT_STARTED;
};

export const payloadServiceStatus = (i: PayloadServiceInput): ServiceStatus => {
  const deboarding = i.paxTarget < i.paxOnBoard;
  const running = (kind: ServiceKind): ServiceStatus => ({
    kind,
    progress: fractionDone(i.paxOnBoard, i.paxStart, i.paxTarget),
    minutesLeft: null,
    // Deboarding counts the passengers that have left the aircraft
    done: kind === 'deboarding' ? i.paxStart - i.paxOnBoard : i.paxOnBoard,
    total: kind === 'deboarding' ? i.paxStart - i.paxTarget : i.paxTarget,
  });
  const direction = (): ServiceKind => (deboarding ? 'deboarding' : 'boarding');
  const complete: ServiceStatus = {
    kind: 'complete',
    progress: 1,
    minutesLeft: null,
    done: i.paxOnBoard,
    total: i.paxTarget,
  };

  const gsxStates = i.gsxSync ? [i.gsxBoardingState, i.gsxDeboardingState] : [];
  if (gsxStates.includes(GSX_ACTIVE)) {
    // GSX deboarding is its own service, so it wins over the target comparison
    return running(i.gsxDeboardingState === GSX_ACTIVE ? 'deboarding' : direction());
  }
  if (gsxStates.includes(GSX_REQUESTED)) {
    return { ...NOT_STARTED, kind: 'onTheWay' };
  }
  if (i.startedByUser) {
    return running(direction());
  }
  // An empty cabin nobody boarded or planned is no finished boarding; a deboarding to 0 or a 0-passenger OFP is
  if (gsxStates.includes(GSX_COMPLETED) || (i.paxOnBoard === i.paxTarget && (i.paxTarget > 0 || i.ordered))) {
    return complete;
  }
  return NOT_STARTED;
};

export type RunService = 'fuel' | 'payload';

/**
 * The services seen running for an OFP, stored as "<ofp key>#fuel,payload". A new OFP starts an empty list, so the
 * services of the last turnaround never count for the next one.
 */
export const markServiceRan = (stored: string, ofpKey: string, service: RunService): string => {
  const [storedKey, list] = stored.split('#');
  const services = storedKey === ofpKey && list ? list.split(',') : [];
  if (services.indexOf(service) < 0) {
    services.push(service);
  }
  return `${ofpKey}#${services.join(',')}`;
};

export const serviceRan = (stored: string, ofpKey: string, service: RunService): boolean => {
  const [storedKey, list] = stored.split('#');
  return ofpKey !== '' && storedKey === ofpKey && !!list && list.split(',').indexOf(service) >= 0;
};
