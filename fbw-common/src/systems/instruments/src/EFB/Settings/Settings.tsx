// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';

import { useHistory, useLocation } from 'react-router';
import { Link } from 'react-router-dom';

import { ArrowLeft } from 'react-bootstrap-icons';
import { t } from '../Localization/translation';
import { AboutPage } from './Pages/AboutPage';
import { ScrollableContainer } from '../UtilComponents/ScrollableContainer';
import { PageLink, PageRedirect, TabRoutes } from '../Utils/routing';
import { M3Card } from '../UtilComponents/Material/Material';
import { AircraftOptionsPinProgramsPage } from './Pages/AircraftOptionsPinProgramsPage';
import { SimOptionsPage } from './Pages/SimOptionsPage';
import { RealismPage } from './Pages/RealismPage';
import { AtsuAocPage } from './Pages/AtsuAocPage';
import { AudioPage } from './Pages/AudioPage';
import { FlyPadPage } from './Pages/FlyPadPage';
import { ThirdPartyOptionsPage } from './Pages/ThirdPartyOptionsPage';
import { SelectionTabs } from './SelectionTabs';

export type ButtonType = {
  name: string;
  setting: string;
};

export const Settings = () => {
  const tabs: PageLink[] = [
    {
      alias: t('Settings.AircraftOptionsPinPrograms.Title'),
      name: 'Aircraft Options / Pin Programs',
      component: <AircraftOptionsPinProgramsPage />,
    },
    { alias: t('Settings.SimOptions.Title'), name: 'Sim Options', component: <SimOptionsPage /> },
    { alias: t('Settings.Realism.Title'), name: 'Realism', component: <RealismPage /> },
    { alias: t('Settings.ThirdPartyOptions.Title'), name: '3rd Party Options', component: <ThirdPartyOptionsPage /> },
    { alias: t('Settings.AtsuAoc.Title'), name: 'ATSU / AOC', component: <AtsuAocPage /> },
    { alias: t('Settings.Audio.Title'), name: 'Audio', component: <AudioPage /> },
    { alias: t('Settings.flyPad.Title'), name: 'flyPad', component: <FlyPadPage /> },
    { alias: t('Settings.About.Title'), name: 'About', component: <AboutPage /> },
  ];

  // Two panes: the categories on the left, the open page on the right (the first category, or the last one seen,
  // when the section is opened)
  return (
    <div className="w-full">
      <h1 className="mb-4 font-bold">{t('Settings.Title')}</h1>
      <div className="flex h-content-section-reduced flex-row">
        <M3Card className="mr-4 w-[340px] shrink-0 p-2">
          <SelectionTabs tabs={tabs} />
        </M3Card>
        <div className="min-w-0 flex-1">
          <PageRedirect basePath="/settings" tabs={tabs} />
          <TabRoutes basePath="/settings" tabs={tabs} />
        </div>
      </div>
    </div>
  );
};

type SettingsPageProps = {
  name: string;
  backRoute?: string;
};

/** The title of a settings page, with a back button on the pages under a category (Troubleshooting...) */
const SettingsPageTitle = ({ name, backRoute }: SettingsPageProps) => {
  const history = useHistory();
  const location = useLocation();
  const nested = location.pathname.split('/').filter((part) => part !== '').length > 2;

  return (
    <div className="flex shrink-0 flex-row items-center px-6 pb-2 pt-5">
      {nested && (
        <Link
          to={backRoute ?? '/settings'}
          onClick={(e) => {
            if (!backRoute && history.length > 1) {
              e.preventDefault();
              history.goBack();
            }
          }}
          className="mr-3 flex h-10 w-10 items-center justify-center rounded-xl bg-m3-tile text-m3-text transition duration-100 hover:bg-m3-outline"
        >
          <ArrowLeft size={20} />
        </Link>
      )}
      <span className="text-2xl font-bold text-m3-text">{name}</span>
    </div>
  );
};

export const SettingsPage: FC<SettingsPageProps> = ({ name, backRoute, children }) => (
  <M3Card className="h-content-section-reduced w-full">
    <SettingsPageTitle name={name} backRoute={backRoute} />
    <div className="min-h-0 flex-1 px-6 pb-2">
      <ScrollableContainer height={48} innerClassName="h-full">
        <div className="h-full divide-y divide-m3-outline pr-5">{children}</div>
      </ScrollableContainer>
    </div>
  </M3Card>
);

export const FullscreenSettingsPage: FC<SettingsPageProps> = ({ name, backRoute, children }) => (
  <M3Card className="h-content-section-reduced w-full">
    <SettingsPageTitle name={name} backRoute={backRoute} />
    <div className="min-h-0 flex-1 px-6 pb-4">{children}</div>
  </M3Card>
);

// SettingsGroup wraps several SettingsItems into a group (no divider and closer together).<br/>
// The parent SettingItem should have groupType="parent", any dependent setting should have groupType="sub".
export const SettingGroup: FC = ({ children }) => <div className="py-4">{children}</div>;

type SettingItemProps = {
  name: string;
  unrealistic?: boolean;
  groupType?: 'parent' | 'sub';
  disabled?: boolean;
};

export const SettingItem: FC<SettingItemProps> = ({ name, unrealistic, groupType, disabled, children }) => {
  const UnrealisticHint = () => (
    <span className="ml-3 whitespace-nowrap rounded-full bg-m3-warn-container px-2 py-1 text-xs font-bold uppercase leading-none text-m3-on-warn">
      {t('Settings.Unrealistic')}
    </span>
  );

  return (
    <div
      className={`flex flex-row items-center justify-between ${(groupType === undefined && 'min-h-[60px] py-3') || 'h-12'}`}
    >
      {groupType === 'sub' ? (
        <span className="ml-8 flex flex-row items-center">
          <span className="mr-3 h-3 w-3 border-b-2 border-l-2 border-m3-outline" />
          <span className="text-base font-semibold text-m3-muted">{name}</span>
          {unrealistic && <UnrealisticHint />}
        </span>
      ) : (
        <span className="mr-4 flex flex-row items-center">
          <span className="text-base font-semibold text-m3-text">{name}</span>
          {unrealistic && <UnrealisticHint />}
        </span>
      )}

      <div className={`shrink-0 ${disabled && 'pointer-events-none opacity-40'}`}>{children}</div>
    </div>
  );
};
