// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { DependencyList, useEffect, useRef, useState } from 'react';
import { isStructurallyEqual } from './logic/structuralEquality';

/**
 * Several sim values read together on one timer into one state object. A hook per value would render the dashboard
 * once per value (React 17 does not batch updates made outside event handlers), and a poll that finds the same values
 * keeps the previous object so it renders nothing.
 * @param read gives the current values; round them to what the page shows, so a change nobody can see renders nothing
 * @param deps what `read` depends on besides sim values: a change reads again at once
 */
export const usePolledReading = <T>(read: () => T, periodMs: number, deps: DependencyList = []): T => {
  const [reading, setReading] = useState(read);

  // The timer outlives the render that started it
  const latestRead = useRef(read);
  latestRead.current = read;

  useEffect(() => {
    const poll = () => setReading((previous) => keepPreviousIfEqual(previous, latestRead.current()));
    poll();
    const timer = window.setInterval(poll, periodMs);
    return () => window.clearInterval(timer);
  }, [periodMs, ...deps]);

  return reading;
};

const keepPreviousIfEqual = <T>(previous: T, next: T): T => (isStructurallyEqual(previous, next) ? previous : next);
