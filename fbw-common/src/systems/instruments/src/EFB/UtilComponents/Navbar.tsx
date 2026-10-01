// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { NavLink } from 'react-router-dom';
import { PageLink, pathify } from '../Utils/routing';

interface NavbarProps {
  tabs: PageLink[];
  onSelected?: (index: number) => void;
  className?: string;
  basePath: string;
}

/** The tabs of a flyPad section, as the segmented control of the Material kit */
export const Navbar = ({ tabs, className, onSelected, basePath }: NavbarProps) => (
  <nav className={`flex justify-between ${className}`}>
    <div className="flex flex-row divide-x divide-m3-outline overflow-hidden rounded-full border border-m3-outline">
      {tabs.map((tab, index) => (
        <NavLink
          onClick={() => onSelected?.(index)}
          to={`${basePath}/${pathify(tab.name)}`}
          className="flex h-10 items-center whitespace-nowrap bg-transparent px-5 text-base font-semibold text-m3-text transition duration-100 hover:bg-m3-tile"
          activeClassName="!bg-m3-primary-container font-bold !text-m3-on-primary-container"
          key={tab.name}
        >
          {tab.alias ?? tab.name}
        </NavLink>
      ))}
    </div>
  </nav>
);
