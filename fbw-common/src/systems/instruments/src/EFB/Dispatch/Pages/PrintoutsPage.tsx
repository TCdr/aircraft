// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect, useState } from 'react';
import { Printer, Trash } from 'react-bootstrap-icons';
import { t } from '@flybywiresim/flypad';

import { Printout, Printouts } from '../Printouts';
import { M3Button, M3Card, M3List } from '../../UtilComponents/Material/Material';

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
      <M3Card low className="h-content-section-reduced w-full items-center justify-center p-6">
        <h1 className="max-w-4xl text-center">{t('Dispatch.Printouts.NoPrintout')}</h1>
      </M3Card>
    );
  }

  return (
    <div className="flex h-content-section-reduced w-full flex-row overflow-hidden text-m3-text">
      <M3Card className="mr-4 h-full w-80 shrink-0 p-3">
        <div className="mb-2 flex shrink-0 flex-row items-center px-1">
          <span className="text-xs font-bold uppercase tracking-widest text-m3-muted">
            {t('Dispatch.Printouts.Title')}
          </span>
          <div className="grow" />
          <span className="rounded-full bg-m3-tile px-2 py-1 text-xs font-bold leading-none text-m3-muted">
            {printouts.length}
          </span>
        </div>
        <M3List>
          {printouts.map((p) => {
            const selectedRow = p.id === selectedId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`mb-1 flex min-h-[52px] w-full shrink-0 flex-row items-center rounded-xl px-3 py-2 text-left transition duration-100 ${
                  selectedRow ? 'bg-m3-primary-container' : 'bg-transparent hover:bg-m3-tile'
                }`}
              >
                <span
                  className={`mr-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    selectedRow ? 'bg-m3-primary text-m3-on-primary' : 'bg-m3-tile text-m3-muted'
                  }`}
                >
                  <Printer size={18} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className={`truncate text-base font-semibold leading-tight ${
                      selectedRow ? 'text-m3-on-primary-container' : 'text-m3-text'
                    }`}
                  >
                    {p.title}
                  </span>
                  <span className="text-xs leading-tight text-m3-muted">{`${hhmm(p.utcSeconds)}Z`}</span>
                </span>
              </button>
            );
          })}
        </M3List>
        <M3Button tone="danger" className="mt-3 !h-12 shrink-0" onClick={() => Printouts.clear()}>
          <Trash size={20} />
          <span className="text-base text-current">{t('Dispatch.Printouts.DeleteAll')}</span>
        </M3Button>
      </M3Card>
      {selected && (
        <div className="scrollbar relative h-full min-w-0 flex-1 overflow-y-auto rounded-2xl bg-white p-6">
          <button
            type="button"
            onClick={() => Printouts.remove(selected.id)}
            className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-xl border border-gray-400 bg-white text-black transition duration-100 hover:bg-utility-red hover:text-white"
          >
            <Trash size={20} />
          </button>
          <pre className="font-mono text-base leading-snug text-black">{selected.lines.join('\n')}</pre>
        </div>
      )}
    </div>
  );
};
