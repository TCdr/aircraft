// Copyright (c) 2023-2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Airplane,
  BroadcastPin,
  ChevronRight,
  InfoCircle,
  Plug,
  Sliders,
  Speedometer2,
  Tablet,
  VolumeUp,
} from 'react-bootstrap-icons';
import { PageLink, pathify } from '../Utils/routing';

interface SelectionTabsProps {
  tabs: PageLink[];
}

/** The icons of the categories, in the order of the tabs */
const SETTINGS_ICONS = [
  <Airplane key="aircraft" size={20} />,
  <Sliders key="sim" size={20} />,
  <Speedometer2 key="realism" size={20} />,
  <Plug key="third-party" size={20} />,
  <BroadcastPin key="atsu" size={20} />,
  <VolumeUp key="audio" size={20} />,
  <Tablet key="flypad" size={20} />,
  <InfoCircle key="about" size={20} />,
];

/**
 * The classes of the open category. An activeClassName replaces react-router's default `active` class, so it has to
 * name `active` itself: the children of the link are styled with `group-[.active]:...`.
 */
export const SETTINGS_TAB_ACTIVE_CLASS = 'active !bg-m3-primary-container !text-m3-on-primary-container';

/** The categories of the settings, the open one tonal (it stays so on the pages under it) */
export const SelectionTabs = ({ tabs }: SelectionTabsProps) => (
  <div className="space-y-1">
    {tabs.map((tab, index) => (
      <NavLink
        key={tab.name}
        to={`/settings/${pathify(tab.name)}`}
        className="group flex h-12 flex-row items-center rounded-xl px-3 text-m3-text transition duration-100 hover:bg-m3-tile"
        activeClassName={SETTINGS_TAB_ACTIVE_CLASS}
      >
        <span className="mr-3 flex text-m3-muted group-[.active]:text-m3-on-primary-container">
          {SETTINGS_ICONS[index]}
        </span>
        <span className="grow truncate text-base font-semibold text-current group-[.active]:font-bold">
          {tab.alias ?? tab.name}
        </span>
        <ChevronRight size={16} />
      </NavLink>
    ))}
  </div>
);
