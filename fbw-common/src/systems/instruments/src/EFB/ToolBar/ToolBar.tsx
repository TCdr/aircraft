// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import {
  Clipboard,
  Truck,
  Compass,
  BroadcastPin,
  ExclamationDiamond,
  Gear,
  Calculator,
  JournalCheck,
  Sliders,
} from 'react-bootstrap-icons';
import { NavLink } from 'react-router-dom';
import { t } from '../Localization/translation';

// @ts-ignore
import FbwTail from '../Assets/FBW-Tail.svg';

interface ToolBarButtonProps {
  to: string;
  label: string;
}

/**
 * A destination of the navigation rail: the icon in a pill (tonal when the section is open) and its name under it.
 * NavLink marks the open section with the "active" class, which the group-[.active] variants read.
 */
const ToolBarButton: FC<ToolBarButtonProps> = ({ to, label, children }) => (
  <NavLink to={to} className="group flex w-24 flex-col items-center">
    <span className="flex h-9 w-16 items-center justify-center rounded-full text-m3-muted transition duration-100 hover:bg-m3-tile group-[.active]:bg-m3-primary-container group-[.active]:text-m3-on-primary-container">
      {children}
    </span>
    <span className="mt-1 text-xs font-semibold text-m3-muted group-[.active]:font-bold group-[.active]:text-m3-text">
      {label}
    </span>
  </NavLink>
);

const ICON_SIZE = 24;

export const ToolBar = () => (
  <nav className="flex w-32 shrink-0 flex-col items-center justify-between pb-6 pt-16">
    <div className="flex flex-col items-center space-y-3">
      <ToolBarButton to="/dashboard" label={t('Dashboard.Title')}>
        <img className="w-[24px]" src={FbwTail} alt="FbwTail" />
      </ToolBarButton>
      <ToolBarButton to="/dispatch" label={t('Dispatch.Title')}>
        <Clipboard size={ICON_SIZE} />
      </ToolBarButton>
      <ToolBarButton to="/ground" label={t('Ground.Title')}>
        <Truck size={ICON_SIZE} />
      </ToolBarButton>
      <ToolBarButton to="/performance" label={t('Performance.Title')}>
        <Calculator size={ICON_SIZE} />
      </ToolBarButton>
      <ToolBarButton to="/navigation" label={t('ToolBar.Navigation')}>
        <Compass size={ICON_SIZE} />
      </ToolBarButton>
      <ToolBarButton to="/atc" label={t('ToolBar.Atc')}>
        <BroadcastPin size={ICON_SIZE} />
      </ToolBarButton>
      <ToolBarButton to="/failures" label={t('Failures.Title')}>
        <ExclamationDiamond size={ICON_SIZE} />
      </ToolBarButton>
      <ToolBarButton to="/checklists" label={t('Checklists.Title')}>
        <JournalCheck size={ICON_SIZE} />
      </ToolBarButton>
      <ToolBarButton to="/presets" label={t('Presets.Title')}>
        <Sliders size={ICON_SIZE} />
      </ToolBarButton>
    </div>

    <div className="flex flex-col items-center">
      <div className="mb-3 h-px w-14 bg-m3-outline" />
      <ToolBarButton to="/settings" label={t('Settings.Title')}>
        <Gear color="currentColor" size={ICON_SIZE} />
      </ToolBarButton>
    </div>
  </nav>
);
