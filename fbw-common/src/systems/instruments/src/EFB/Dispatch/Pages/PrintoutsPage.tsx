// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect, useState } from 'react';
import { Trash } from 'react-bootstrap-icons';
import { t } from '@flybywiresim/flypad';

import { Printout, Printouts } from '../Printouts';

const hhmm = (seconds: number) =>
  `${Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0')}:${Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0')}`;

/**
 * The pages printed by the FMS (A380X MFD DATA / PRINTER and SEC INDEX pages): the list of the printouts, newest first,
 * and the selected one on paper.
 */
export const PrintoutsPage = () => {
  const [printouts, setPrintouts] = useState<readonly Printout[]>(Printouts.get());
  const [selectedId, setSelectedId] = useState<number | null>(Printouts.get()[0]?.id ?? null);

  useEffect(
    () =>
      Printouts.subscribe(() => {
        const list = Printouts.get();
        setPrintouts(list);
        setSelectedId((id) => (list.some((p) => p.id === id) ? id : list[0]?.id ?? null));
      }),
    [],
  );

  const selected = printouts.find((p) => p.id === selectedId) ?? null;

  if (printouts.length === 0) {
    return (
      <div className="flex h-content-section-reduced w-full items-center justify-center rounded-lg border-2 border-theme-accent p-6">
        <h1 className="max-w-4xl text-center">{t('Dispatch.Printouts.NoPrintout')}</h1>
      </div>
    );
  }

  return (
    <div className="flex h-content-section-reduced w-full space-x-4 overflow-hidden rounded-lg border-2 border-theme-accent p-4">
      <div className="flex w-80 shrink-0 flex-col">
        <div className="flex-1 space-y-2 overflow-y-auto pr-2">
          {printouts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`w-full rounded-md border-2 px-3 py-2 text-left transition duration-100 ${
                p.id === selectedId
                  ? 'border-theme-highlight bg-theme-highlight text-theme-body'
                  : 'border-theme-accent hover:border-theme-highlight'
              }`}
            >
              <p className="font-bold">{p.title}</p>
              <p className="text-sm">{hhmm(p.utcSeconds)}Z</p>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => Printouts.clear()}
          className="mt-3 flex items-center justify-center space-x-2 rounded-md border-2 border-utility-red px-3 py-2 text-utility-red transition duration-100 hover:bg-utility-red hover:text-theme-body"
        >
          <Trash size={20} />
          <p>{t('Dispatch.Printouts.DeleteAll')}</p>
        </button>
      </div>
      {selected && (
        <div className="relative flex-1 overflow-y-auto rounded-md bg-white p-6">
          <button
            type="button"
            onClick={() => Printouts.remove(selected.id)}
            className="absolute right-4 top-4 rounded-md p-2 text-black transition duration-100 hover:bg-utility-red hover:text-white"
          >
            <Trash size={20} />
          </button>
          <pre className="font-mono text-base leading-snug text-black">{selected.lines.join('\n')}</pre>
        </div>
      )}
    </div>
  );
};
