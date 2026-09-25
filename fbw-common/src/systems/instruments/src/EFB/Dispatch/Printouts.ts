// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** A page printed by the FMS (A380X MFD DATA / PRINTER page), as sent with the A380X_FMS_PRINT Coherent event. */
export interface Printout {
  id: number;
  title: string;
  /** Sim UTC time of the print, in seconds of the day */
  utcSeconds: number;
  lines: string[];
}

/** The A380X cockpit printer has no paper: the flypad keeps the printed pages (newest first, at most 30). */
const MAX_PRINTOUTS = 30;

let printouts: Printout[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

export const Printouts = {
  get: (): readonly Printout[] => printouts,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  remove(id: number): void {
    printouts = printouts.filter((p) => p.id !== id);
    notify();
  },

  clear(): void {
    printouts = [];
    notify();
  },

  add(page: Omit<Printout, 'id'>): void {
    printouts = [{ ...page, id: nextId++ }, ...printouts].slice(0, MAX_PRINTOUTS);
    notify();
  },
};

if (typeof Coherent !== 'undefined') {
  Coherent.on('A380X_FMS_PRINT', (json: string) => {
    try {
      const page = JSON.parse(json);
      if (typeof page?.title === 'string' && Array.isArray(page.lines)) {
        Printouts.add({ title: page.title, utcSeconds: Number(page.utcSeconds) || 0, lines: page.lines.map(String) });
      }
    } catch (e) {
      console.warn('[flypad] invalid printout', e);
    }
  });
}
