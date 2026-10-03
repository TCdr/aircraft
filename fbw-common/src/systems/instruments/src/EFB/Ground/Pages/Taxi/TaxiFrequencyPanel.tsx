// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useState } from 'react';
import { useEventBus } from '@flybywiresim/flypad';
import { Broadcast, X } from 'react-bootstrap-icons';
import { t } from '../../../Localization/translation';
import { M3Card, M3SectionHeader, M3Segmented } from '../../../UtilComponents/Material/Material';
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
      // The look of the map buttons (TaxiMap)
      <button
        type="button"
        className="absolute bottom-4 left-4 flex h-12 flex-row items-center space-x-2 rounded-xl border border-m3-outline bg-m3-ground px-4 text-m3-text hover:bg-m3-tile"
        onClick={() => setOpen(true)}
      >
        <Broadcast size={18} />
        <span className="text-sm font-semibold text-current">{t('Ground.Taxi.Frequencies.Title')}</span>
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

  // A raised card over the map; the rows keep their height (shrink-0): the list scrolls instead of squeezing them
  return (
    <M3Card className="absolute bottom-4 left-4 max-h-[calc(100%-2rem)] w-96 border border-m3-outline shadow-lg">
      <M3SectionHeader
        title={t('Ground.Taxi.Frequencies.Title')}
        trailing={
          <button
            type="button"
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-transparent text-m3-muted hover:bg-m3-tile hover:text-m3-text"
            onClick={() => setOpen(false)}
          >
            <X size={22} />
          </button>
        }
      />
      {airports.length > 0 && (
        <div className="shrink-0 px-4 pb-2">
          <M3Segmented
            options={airports.map((a) => ({
              label: (
                <span className="min-w-0 truncate px-2 text-sm font-semibold text-current">{`${a.label} ${a.icao}`}</span>
              ),
              selected: shown === a.icao,
              onClick: () => setShown(a.icao),
            }))}
          />
        </div>
      )}
      <div className="scrollbar min-h-0 overflow-y-auto px-4 pb-3">
        {status && <span className="block py-1 text-sm text-m3-muted">{status}</span>}
        {/* rows, not a grid with gaps: the sim's rendering engine ignores the gap property */}
        {groups.map((g) => (
          <div key={g.label} className="flex shrink-0 flex-row py-1">
            <span className="w-[4.5rem] shrink-0 text-sm font-bold text-m3-on-primary-container">{g.label}</span>
            <div className="flex min-w-0 flex-1 flex-row flex-wrap">
              {g.frequencies.map((frequency) => (
                <span key={frequency.mhz} className="w-1/2 text-sm font-semibold text-m3-text">
                  {frequency.mhz.toFixed(3)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </M3Card>
  );
};
