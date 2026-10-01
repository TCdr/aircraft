// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useState } from 'react';
import { useEventBus } from '@flybywiresim/flypad';
import { Broadcast, X } from 'react-bootstrap-icons';
import { t } from '../../../Localization/translation';
import { groupTaxiFrequencies, loadTaxiFrequencies, TaxiFrequenciesState } from './TaxiFrequencies';

interface TaxiFrequencyPanelProps {
  /** The airport of the taxi page */
  icao: string;
  /** The origin and destination of the flight plan (SimBrief), '' when not known */
  origin: string;
  destination: string;
}

const isIcao = (icao: string) => /^[A-Z0-9]{4}$/.test(icao);

/**
 * The ATC frequencies of the origin or the destination (or the airport of the taxi page) at the bottom left of the
 * taxi map, laid out as the frequency box of an airport chart: the chart label of each type, and its frequencies in
 * two columns.
 */
export const TaxiFrequencyPanel: FC<TaxiFrequencyPanelProps> = ({ icao, origin, destination }) => {
  const eventBus = useEventBus();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(icao);
  const [frequencies, setFrequencies] = useState<TaxiFrequenciesState | null>(null);

  // The airport of the taxi page when it changes
  useEffect(() => setShown(icao), [icao]);

  useEffect(() => {
    if (!open || !isIcao(shown)) {
      setFrequencies(null);
      return;
    }
    let current = true;
    setFrequencies({ state: 'loading' });
    loadTaxiFrequencies(eventBus, shown).then(
      (list) =>
        current && setFrequencies(list === null ? { state: 'not-found' } : { state: 'loaded', frequencies: list }),
    );
    return () => {
      current = false;
    };
  }, [open, shown, eventBus]);

  const airports = [
    { icao: origin, label: t('Ground.Taxi.Origin') },
    { icao: destination, label: t('Ground.Taxi.Destination') },
  ].filter((a) => isIcao(a.icao));
  if (isIcao(icao) && icao !== origin && icao !== destination) {
    airports.unshift({ icao, label: t('Ground.Taxi.Airport') });
  }

  if (!open) {
    return (
      <button
        type="button"
        className="absolute bottom-4 left-4 flex h-12 flex-row items-center space-x-2 rounded-xl border-2 border-utility-green bg-m3-ground px-4 text-sm font-semibold text-m3-text hover:text-utility-green"
        onClick={() => setOpen(true)}
      >
        <Broadcast size={18} />
        <span>{t('Ground.Taxi.Frequencies.Title')}</span>
      </button>
    );
  }

  const groups = frequencies?.state === 'loaded' ? groupTaxiFrequencies(frequencies.frequencies) : [];
  let status: string | null = null;
  if (!isIcao(shown)) {
    status = t('Ground.Taxi.Frequencies.NoAirport');
  } else if (frequencies?.state === 'loading') {
    status = t('Ground.Taxi.Frequencies.Loading');
  } else if (frequencies?.state === 'not-found') {
    status = t('Ground.Taxi.Frequencies.NotFound');
  } else if (frequencies?.state === 'loaded' && groups.length === 0) {
    status = t('Ground.Taxi.Frequencies.None');
  }

  // The rows keep their height (shrink-0): the box scrolls instead of squeezing them
  return (
    <div className="absolute bottom-4 left-4 flex max-h-[calc(100%-2rem)] w-80 flex-col rounded-xl border-2 border-utility-green bg-m3-ground">
      <div className="flex shrink-0 flex-row items-center justify-between px-3 pt-2">
        <span className="font-bold uppercase tracking-wider text-utility-green">
          {t('Ground.Taxi.Frequencies.Title')}
        </span>
        <button
          type="button"
          className="bg-transparent text-m3-text hover:text-utility-green"
          onClick={() => setOpen(false)}
        >
          <X size={24} />
        </button>
      </div>
      <div className="flex shrink-0 flex-row space-x-2 px-3 py-2">
        {airports.map((a) => (
          <button
            key={`${a.label}${a.icao}`}
            type="button"
            className={`h-8 flex-1 rounded-full border px-2 text-sm font-semibold ${
              shown === a.icao
                ? 'border-utility-green bg-utility-green text-m3-ground'
                : 'border-m3-outline bg-transparent text-m3-text hover:border-utility-green'
            }`}
            onClick={() => setShown(a.icao)}
          >
            {a.label} {a.icao}
          </button>
        ))}
      </div>
      <div className="min-h-0 overflow-y-auto px-3 pb-2">
        {status && <span className="text-sm text-m3-muted">{status}</span>}
        {/* rows, not a grid with gaps: the sim's rendering engine ignores the gap property */}
        {groups.map((g) => (
          <div key={g.label} className="flex flex-row py-0.5">
            <span className="w-[4.5rem] shrink-0 font-bold text-utility-green">{g.label}</span>
            <div className="flex min-w-0 flex-1 flex-row flex-wrap font-mono text-m3-text">
              {g.frequencies.map((frequency) => (
                <span key={frequency.mhz} className="w-1/2">
                  {frequency.mhz.toFixed(3)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
