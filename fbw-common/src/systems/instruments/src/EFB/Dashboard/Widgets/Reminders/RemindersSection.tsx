// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { ArrowRight } from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import { t } from '../../../Localization/translation';

interface RemindersSectionProps {
  title: string;
  pageLinkPath?: string;
  noLink?: boolean;
}

export const RemindersSection: FC<RemindersSectionProps> = ({ title, children, pageLinkPath, noLink }) => (
  <div className="flex flex-col rounded-2xl bg-m3-card px-4 py-3">
    <div className="mb-2 flex h-8 flex-row items-center">
      <span className="text-xs font-bold uppercase tracking-widest text-m3-muted">{title}</span>
      <div className="grow" />
      {!noLink && (
        <Link
          to={pageLinkPath}
          className="flex h-8 flex-row items-center rounded-full border border-m3-outline px-3 text-m3-text"
        >
          <span className="mr-1 text-xs font-semibold text-m3-text">
            {t('Dashboard.ImportantInformation.GoToPage')}
          </span>
          <ArrowRight className="fill-current" size={14} />
        </Link>
      )}
    </div>

    {children}
  </div>
);
