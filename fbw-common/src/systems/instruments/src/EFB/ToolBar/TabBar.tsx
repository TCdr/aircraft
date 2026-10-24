// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, ReactNode } from 'react';
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
import { NavLink, useLocation } from 'react-router-dom';
import { t } from '../Localization/translation';
import { isTabOpen, TAB_BAR_HEIGHT_REM, TabBarPosition } from './tabBarLayout';

// @ts-ignore
import FbwTail from '../Assets/FBW-Tail.svg';

const ICON_SIZE = 24;

const tabBarSections: { to: string; labelKey: string; icon: ReactNode }[] = [
  { to: '/dashboard', labelKey: 'Dashboard.Title', icon: <img className="w-[24px]" src={FbwTail} alt="FbwTail" /> },
  { to: '/dispatch', labelKey: 'Dispatch.Title', icon: <Clipboard size={ICON_SIZE} /> },
  { to: '/ground', labelKey: 'Ground.Title', icon: <Truck size={ICON_SIZE} /> },
  { to: '/performance', labelKey: 'Performance.Title', icon: <Calculator size={ICON_SIZE} /> },
  { to: '/navigation', labelKey: 'ToolBar.Navigation', icon: <Compass size={ICON_SIZE} /> },
  { to: '/atc', labelKey: 'ToolBar.Atc', icon: <BroadcastPin size={ICON_SIZE} /> },
  { to: '/failures', labelKey: 'Failures.Title', icon: <ExclamationDiamond size={ICON_SIZE} /> },
  { to: '/checklists', labelKey: 'Checklists.Title', icon: <JournalCheck size={ICON_SIZE} /> },
  { to: '/presets', labelKey: 'Presets.Title', icon: <Sliders size={ICON_SIZE} /> },
  { to: '/settings', labelKey: 'Settings.Title', icon: <Gear color="currentColor" size={ICON_SIZE} /> },
];

/**
 * One tab: the icon, and for the open section its name under it and a thin line on the edge that faces the page.
 * The open tab is rendered from the route rather than shown by CSS: the sim browser did not apply the
 * hidden/group-[.active]:block pair.
 */
const TabBarButton: FC<{ to: string; label: string; position: TabBarPosition; open: boolean }> = ({
  to,
  label,
  position,
  open,
  children,
}) => (
  <NavLink to={to} className="relative flex h-full flex-1 flex-col items-center justify-center">
    {open && (
      <span
        className={`absolute left-[22%] right-[22%] h-[3px] bg-m3-primary ${position === 'top' ? 'bottom-0' : 'top-0'}`}
      />
    )}
    <span
      className={`flex h-9 w-16 items-center justify-center transition duration-100 ${open ? 'text-m3-primary' : 'text-m3-muted hover:text-m3-text'}`}
    >
      {children}
    </span>
    {open && <span className="mt-0.5 text-xs font-extrabold uppercase tracking-wider text-m3-primary">{label}</span>}
  </NavLink>
);

interface TabBarProps {
  position: TabBarPosition;
  /** Status bar content that shares the bar row when the bar is at the top */
  children?: ReactNode;
}

export const TabBar: FC<TabBarProps> = ({ position, children }) => {
  const { pathname } = useLocation();
  return (
    <nav
      className={`fixed inset-x-0 z-30 flex w-full flex-row items-center bg-m3-ground ${position === 'top' ? 'top-0 border-b border-m3-outline' : 'bottom-0 border-t border-m3-outline'}`}
      style={{ height: `${TAB_BAR_HEIGHT_REM}rem` }}
    >
      <div className="flex h-full min-w-0 flex-1 flex-row items-center">
        {tabBarSections.map((section) => (
          <TabBarButton
            key={section.to}
            to={section.to}
            label={t(section.labelKey)}
            position={position}
            open={isTabOpen(pathname, section.to)}
          >
            {section.icon}
          </TabBarButton>
        ))}
      </div>
      {position === 'top' && children}
    </nav>
  );
};
