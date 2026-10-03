// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, ReactNode, useEffect, useRef, useState } from 'react';
import { CloudArrowDown, PeopleFill } from 'react-bootstrap-icons';
import { Units } from '@flybywiresim/fbw-sdk-react';
import { t } from '../../../Localization/translation';
import {
  M3ActionChip,
  M3Banner,
  M3Card,
  M3Chip,
  M3Page,
  M3Progress,
  M3Segmented,
  M3_STATUS_TONES,
} from '../../../UtilComponents/Material/Material';
import { formatPayload } from './PayloadElements';
import { PAYLOAD_CHART_MIN_HEIGHT, payloadChartFit } from './Chart/ChartFit';

const eyebrow = 'text-xs font-bold uppercase tracking-widest text-m3-muted';

/** The balance chart on its card: the canvas width, with room at the left for its weight axis labels */
export const PAYLOAD_CHART = { width: 390, marginLeft: 72 };

interface PayloadLayoutProps {
  /** The deck selector of an aircraft with two passenger decks */
  deckSwitch?: ReactNode;
  /** The cabin outline and the seat map over it, registered on the full width of the page */
  cabin: ReactNode;
  /** The colours of the seat map: outline, seat */
  seatColours: [string, string, string];
  /** The cargo holds */
  cargo: ReactNode;
  /** The planned and current load table, the per passenger weights */
  table: ReactNode;
  miscParams: ReactNode;
  showSimbrief: boolean;
  onSimbrief: () => void;
  /** GSX boards and deboards: the flyPad has no boarding controls */
  gsxSync: boolean;
  boardingStarted: boolean;
  totalPax: number;
  totalPaxDesired: number;
  /** The cargo, in kilograms */
  totalCargo: number;
  totalCargoDesired: number;
  /** The gross weight in kilograms and its centre of gravity in percent of the MAC */
  gw: number;
  gwCg: number;
  massUnit: string;
  boardingRate: string;
  setBoardingRate: (rate: string) => void;
  coldAndDark: boolean;
  /** The estimated boarding time left */
  remainingTime: string;
  /** The start, stop and deboard buttons */
  boarding: ReactNode;
  /** The balance chart, PAYLOAD_CHART.width wide, at the given height (it fills the height of its card) */
  chart: (height: number) => ReactNode;
}

/**
 * The Payload page: the cabin with its seats and holds on a full width card, then the load table, the boarding
 * controls and the balance chart.
 */
export const PayloadLayout: FC<PayloadLayoutProps> = ({
  deckSwitch,
  cabin,
  seatColours,
  cargo,
  table,
  miscParams,
  showSimbrief,
  onSimbrief,
  gsxSync,
  boardingStarted,
  totalPax,
  totalPaxDesired,
  totalCargo,
  totalCargoDesired,
  gw,
  gwCg,
  massUnit,
  boardingRate,
  setBoardingRate,
  coldAndDark,
  remainingTime,
  boarding,
  chart,
}) => {
  // The balance chart fills the height of its card
  const chartAreaRef = useRef<HTMLDivElement>(null);
  const [chartAreaHeight, setChartAreaHeight] = useState(0);
  useEffect(() => {
    // Measured again every 500 ms: the page is not at its final size on its first frames (page transition), and
    // ResizeObserver is not relied on in the Coherent GT runtime. The state only changes when the height does.
    const measure = () => setChartAreaHeight(chartAreaRef.current?.clientHeight ?? 0);
    const frame = requestAnimationFrame(measure);
    const timer = setInterval(measure, 500);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
    };
  }, []);
  const chartFit = payloadChartFit(chartAreaHeight);

  const paxText = `${totalPax} / ${totalPaxDesired} ${t('Ground.Payload.Passengers')}`;
  const cargoText = `${formatPayload(Units.kilogramToUser(totalCargo))} / ${formatPayload(Units.kilogramToUser(totalCargoDesired))} ${massUnit}`;
  const loaded = totalPax === totalPaxDesired && Math.abs(totalCargo - totalCargoDesired) < 1;
  const legend = (look: React.CSSProperties, text: string) => (
    <span className="ml-2 inline-flex h-8 items-center rounded-lg border border-m3-outline px-3 text-xs text-m3-muted">
      <span className="mr-2 h-3 w-4 rounded-sm" style={look} />
      {text}
    </span>
  );

  return (
    <M3Page
      chips={
        <>
          <M3Chip tone={boardingStarted ? 'busy' : 'idle'} icon={<PeopleFill size={16} />}>
            {paxText}
          </M3Chip>
          <M3Chip tone="idle">
            {`${t('Ground.Payload.GW')} ${formatPayload(Units.kilogramToUser(gw))} ${massUnit} · ${gwCg.toFixed(1)} %`}
          </M3Chip>
          {gsxSync && <M3Chip tone="active">{t('Ground.Payload.GSXPayloadSyncEnabled')}</M3Chip>}
        </>
      }
    >
      {/* the cabin: the drawing spans the card, the seat map is registered on the page width */}
      <M3Card low className="mb-4 shrink-0">
        <div className="flex h-12 shrink-0 flex-row items-end px-4">
          {deckSwitch}
          <div className="grow" />
          {legend({ backgroundColor: seatColours[1] }, t('Ground.Payload.Legend.Boarded'))}
          {legend({ backgroundColor: seatColours[1], opacity: 0.4 }, t('Ground.Payload.Legend.Planned'))}
          {legend({ border: `1px solid ${seatColours[0]}` }, t('Ground.Payload.Legend.Empty'))}
        </div>
        <div className="relative -mt-2 flex shrink-0 flex-col">{cabin}</div>
        <div className="-mt-4 flex shrink-0 flex-row items-end px-4 pb-4">{cargo}</div>
      </M3Card>

      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <M3Card className="mr-4 h-full w-[420px] shrink-0 px-4 py-4">
          {/* the table carries the LOAD title on its PLANNED / CURRENT header row */}
          {table}
          {showSimbrief && (
            <M3ActionChip primary className="mt-3 !h-10 w-full !rounded-xl" onClick={onSimbrief}>
              <span className="flex flex-row items-center justify-center text-sm text-current">
                <CloudArrowDown size={18} className="mr-2" />
                {t('Ground.Payload.TT.FillPayloadFromSimbrief')}
              </span>
            </M3ActionChip>
          )}
          <div className="grow" />
          <div className="flex flex-row items-center border-t border-m3-tile pt-3">{miscParams}</div>
        </M3Card>

        <M3Card className="mr-4 h-full min-w-0 flex-1 px-4 py-4">
          <span className="text-base font-bold">{t('Ground.Payload.Boarding')}</span>
          <span className={`text-xs leading-tight ${M3_STATUS_TONES[boardingStarted ? 'busy' : 'idle']}`}>
            {`${paxText} · ${cargoText}`}
          </span>
          {totalPaxDesired > 0 && (
            <M3Progress
              className="mt-3"
              tone={boardingStarted ? 'busy' : 'active'}
              value={totalPax / totalPaxDesired}
            />
          )}
          {gsxSync ? (
            <M3Banner tone="active" className="mt-4">
              {t('Ground.Payload.GSXPayloadSyncEnabled')}
            </M3Banner>
          ) : (
            <>
              <div className="mb-2 mt-4 flex flex-row items-center">
                <span className={eyebrow}>{t('Ground.Payload.BoardingTime')}</span>
                <div className="grow" />
                {!loaded && <span className="text-xs text-m3-muted">{remainingTime}</span>}
              </div>
              <M3Segmented
                options={[
                  {
                    label: t('Settings.Instant'),
                    selected: boardingRate === 'INSTANT',
                    onClick: () => setBoardingRate('INSTANT'),
                  },
                  {
                    label: t('Settings.Fast'),
                    selected: boardingRate === 'FAST',
                    disabled: !coldAndDark,
                    onClick: () => setBoardingRate('FAST'),
                  },
                  {
                    label: t('Settings.Real'),
                    selected: boardingRate === 'REAL',
                    disabled: !coldAndDark,
                    onClick: () => setBoardingRate('REAL'),
                  },
                ]}
              />
              {!coldAndDark && (
                <span className="mt-2 text-xs leading-tight text-m3-muted">
                  {t('Ground.Payload.TT.AircraftMustBeColdAndDarkToChangeBoardingTimes')}
                </span>
              )}
              <div className="grow" />
              {boarding}
            </>
          )}
        </M3Card>

        <M3Card className="h-full shrink-0 px-4 py-4">
          <span className={eyebrow}>{t('Ground.Payload.Balance')}</span>
          <div
            ref={chartAreaRef}
            className="min-h-0 flex-1"
            style={{ width: `${PAYLOAD_CHART.marginLeft + PAYLOAD_CHART.width + 8}px` }}
          >
            {chartAreaHeight >= PAYLOAD_CHART_MIN_HEIGHT / 2 && (
              <div
                style={{
                  marginLeft: `${PAYLOAD_CHART.marginLeft}px`,
                  marginTop: `${chartFit.marginTop}px`,
                  width: `${PAYLOAD_CHART.width + 8}px`,
                }}
              >
                {chart(chartFit.height)}
              </div>
            )}
          </div>
        </M3Card>
      </div>
    </M3Page>
  );
};
