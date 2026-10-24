// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { Units } from '@flybywiresim/fbw-sdk-react';
import { t } from '../../Localization/translation';
import { M3Chip } from '../../UtilComponents/Material/Material';
import { Advice, AdviceCategory } from '../logic/advice';
import { adviceReplacements } from '../logic/dashboardFormat';
import { DashboardCard, HeaderNote } from './CardParts';

const MAX_ROWS = 3;

const CATEGORY_KEYS: Record<AdviceCategory, string> = {
  weather: 'Dashboard.Advice.Category.Weather',
  wind: 'Dashboard.Advice.Category.Wind',
  fms: 'Dashboard.Advice.Category.Fms',
  ground: 'Dashboard.Advice.Category.Ground',
  ofp: 'Dashboard.Advice.Category.Ofp',
  failures: 'Dashboard.Advice.Category.Failures',
  fuel: 'Dashboard.Advice.Category.Fuel',
};

const AdviceLine: FC<{ advice: Advice; last: boolean }> = ({ advice, last }) => {
  const history = useHistory();
  const message = t(advice.messageKey, adviceReplacements(advice.args, advice.kilogramArgs, Units.usingMetric));
  const link = t(advice.linkKey);

  return (
    <div className={`flex h-9 shrink-0 flex-row items-center ${last ? '' : 'border-b border-m3-outline'}`}>
      <M3Chip tone={advice.tone} className="!h-6 w-16 shrink-0 justify-center !rounded-sm !px-0 !text-xs !font-bold">
        {t(CATEGORY_KEYS[advice.category])}
      </M3Chip>
      <span className="ml-3 min-w-0 flex-1 truncate text-sm font-semibold text-m3-text">{message}</span>
      {advice.link ? (
        <button
          type="button"
          className="ml-3 flex h-full shrink-0 flex-row items-center bg-transparent"
          onClick={() => history.push(advice.link!)}
        >
          <span className="whitespace-nowrap text-xs font-extrabold uppercase tracking-wider text-m3-primary">
            {link}
          </span>
        </button>
      ) : (
        // The target is an MCDU or MFD page (or this page): named, not linked
        <span className="ml-3 shrink-0 whitespace-nowrap text-xs font-extrabold uppercase tracking-wider text-m3-muted">
          {link}
        </span>
      )}
    </div>
  );
};

/** The most important advice, red before amber before blue, one line each */
export const AdvicePanel: FC<{ advice: Advice[] }> = ({ advice }) => {
  const shown = advice.slice(0, MAX_ROWS);
  if (shown.length === 0) {
    return null;
  }
  return (
    <DashboardCard
      title={t('Dashboard.Advice.Title')}
      section="advisories"
      trailing={<HeaderNote>{t('Dashboard.Advice.ActiveCount', [{ count: String(advice.length) }])}</HeaderNote>}
      bodyClassName="px-3"
      className="mt-3 shrink-0"
    >
      {shown.map((item, index) => (
        <AdviceLine key={item.id} advice={item} last={index === shown.length - 1} />
      ))}
    </DashboardCard>
  );
};
