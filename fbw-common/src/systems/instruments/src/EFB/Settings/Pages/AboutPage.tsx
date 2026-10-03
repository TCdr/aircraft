// @ts-strict-ignore
// Copyright (c) 2023-2025 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect, useState } from 'react';
import {
  usePersistentProperty,
  useSessionStorage,
  AircraftGithubVersionChecker,
  BuildInfo,
  SentryConsentState,
  SENTRY_CONSENT_KEY,
  useSimVar,
} from '@flybywiresim/fbw-sdk-react';
import { PageLink, pathify, t, TabRoutes } from '@flybywiresim/flypad';
import { SettingsPage } from '../Settings';
// @ts-ignore
import FbwTail from '../../Assets/FBW-Tail.svg';
import { useViewListenerEvent } from '../../Utils/listener';
import { Route, Switch, useHistory } from 'react-router-dom';
import { TroubleshootingPage } from './TroubleshootingPage';
import { M3Button, M3Card, M3SectionHeader } from '../../UtilComponents/Material/Material';

const baseAboutRoute = `/settings/${pathify('About')}`;

interface BuildInfoEntryProps {
  title: string;
  value?: string;
  /** The number of leading characters to highlight (the short SHA) */
  underline?: number;
}

interface CommunityPanelPlayerData {
  bCanSignOut: boolean;
  bDisable: boolean;
  sAvatar: string;
  sBuildVersion: string;
  sMoney: string;
  sCurrency: string;
  sName: string;
  sRichPresence: string;
  sStatus: string;
}

/** A row of the build info list: the label muted on the left, the value on the right (long values wrap) */
const BuildInfoEntry = ({ title, value, underline = 0 }: BuildInfoEntryProps) => {
  const first = value?.substring(0, underline);
  const last = value?.substring(underline);

  return (
    <div className="flex flex-row items-start py-2">
      <span className="w-56 shrink-0 text-sm font-semibold text-m3-muted">{title}</span>
      <span className="min-w-0 flex-1 break-all text-sm text-m3-text">
        {first && <span className="text-sm font-bold text-m3-on-primary-container underline">{first}</span>}
        {last}
      </span>
    </div>
  );
};

export const AboutPage = () => {
  const [title] = useSimVar('TITLE', 'string');
  const [buildInfo, setBuildInfo] = useState<BuildInfo | undefined>(undefined);
  const [sessionId] = usePersistentProperty('A32NX_SENTRY_SESSION_ID');
  const [version, setVersion] = useSessionStorage('SIM_VERSION', '');
  const [sentryEnabled] = usePersistentProperty(SENTRY_CONSENT_KEY, SentryConsentState.Refused);
  const history = useHistory();

  const subTabs: PageLink[] = [
    { alias: t('Settings.Troubleshooting.Title'), name: 'Troubleshooting', component: <TroubleshootingPage /> },
  ];

  // Callback function to set sBuildVersion from the community panel
  const onSetPlayerData = (data: CommunityPanelPlayerData) => {
    setVersion(data.sBuildVersion);
  };

  // Register the callback function to receive the build version from the community panel
  useViewListenerEvent('JS_LISTENER_COMMUNITY', 'SetGamercardInfo', onSetPlayerData);

  useEffect(() => {
    AircraftGithubVersionChecker.getBuildInfo(process.env.AIRCRAFT_PROJECT_PREFIX).then((info) => setBuildInfo(info));
  }, [process.env.AIRCRAFT_PROJECT_PREFIX]);

  return (
    <Switch>
      <Route exact path={baseAboutRoute}>
        <SettingsPage name={t('Settings.About.Title')}>
          {/* One block in the normal flow under the page title (a single child: no list divider inside it) */}
          <div className="pb-4 pt-2">
            <div className="flex flex-row items-center">
              <img className="w-[36px]" src={FbwTail} alt="" />
              <h1 className="font-manrope ml-4 text-3xl font-bold text-m3-text">flyPadOS 3</h1>
            </div>

            <p className="mt-3 text-base text-m3-text">
              Made with love by contributors in Québec, Germany, the United States, Singapore, Indonesia, New Zealand,
              Australia, Spain, the United Kingdom, France, the Netherlands, Sweden, and Switzerland!
            </p>
            <p className="mt-4 text-sm text-m3-muted">
              &copy; 2020-2025 FlyByWire Simulations and its contributors, all rights reserved.
            </p>
            <p className="text-sm text-m3-muted">Licensed under the GNU General Public License Version 3</p>

            <M3Card low className="mt-6">
              <M3SectionHeader title="Build Info" />
              <div className="divide-y divide-m3-outline px-4 pb-2">
                <BuildInfoEntry title="Sim Version" value={version} />
                <BuildInfoEntry title="Aircraft Version" value={buildInfo?.version} />
                <BuildInfoEntry title="Livery Title" value={title} />
                <BuildInfoEntry title="Built" value={buildInfo?.built} />
                <BuildInfoEntry title="Ref" value={buildInfo?.ref} />
                <BuildInfoEntry title="SHA" value={buildInfo?.sha} underline={7} />
                <BuildInfoEntry title="Event Name" value={buildInfo?.eventName} />
                <BuildInfoEntry title="Pretty Release Name" value={buildInfo?.prettyReleaseName} />
                {sentryEnabled === SentryConsentState.Given && (
                  <BuildInfoEntry title="Sentry Session ID" value={sessionId} />
                )}
              </div>
            </M3Card>

            <M3Button
              tone="tonal"
              className="mt-6 !h-12 w-64"
              onClick={() => history.push(`${baseAboutRoute}/${pathify('Troubleshooting')}`)}
            >
              {t('Settings.Troubleshooting.Title')}
            </M3Button>
          </div>
        </SettingsPage>
      </Route>
      <TabRoutes basePath={baseAboutRoute} tabs={subTabs} />
    </Switch>
  );
};
