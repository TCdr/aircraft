// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useState } from 'react';
import {
  NavigraphSubscriptionStatus,
  usePersistentNumberProperty,
  usePersistentProperty,
} from '@flybywiresim/fbw-sdk-react';
import { Route, Switch, useHistory } from 'react-router-dom';
import { toast } from 'react-toastify';
import { IconTrash } from '@tabler/icons';
import { Toggle } from '../../UtilComponents/Form/Toggle';
import { FullscreenSettingsPage, SettingItem, SettingsPage } from '../Settings';
import { t } from '../../Localization/translation';
import { NavigraphAuthUIWrapper, useNavigraphAuthInfo } from '../../Apis/Navigraph/Components/Authentication';
import { TooltipWrapper } from '../../UtilComponents/TooltipWrapper';
import { SimpleInput } from '../../UtilComponents/Form/SimpleInput/SimpleInput';
import { M3Button } from '../../UtilComponents/Material/Material';
// @ts-ignore
import NavigraphIcon from '../../Assets/navigraph-logo-alone.svg';
import { navigraphAuth } from '../../../navigraph';

/** A Material button sized for a settings row (as tall as the text fields next to it) */
const ROW_BUTTON = '!h-10 !rounded-xl !text-sm';

export const ThirdPartyOptionsPage = () => {
  const history = useHistory();
  const navigraphAuthInfo = useNavigraphAuthInfo();

  const [gsxFuelSyncEnabled, setGsxFuelSyncEnabled] = usePersistentNumberProperty('GSX_FUEL_SYNC', 0);
  const [gsxPayloadSyncEnabled, setGsxPayloadSyncEnabled] = usePersistentNumberProperty('GSX_PAYLOAD_SYNC', 0);
  const [gsxPowerSyncEnabled, setGsxPowerSyncEnabled] = usePersistentNumberProperty('GSX_POWER_SYNC', 0);

  const [overrideSimbriefUserID, setOverrideSimbriefUserID] = usePersistentProperty('CONFIG_OVERRIDE_SIMBRIEF_USERID');
  const [overrideSimbriefDisplay, setOverrideSimbriefDisplay] = useState(overrideSimbriefUserID);
  const [autoSimbriefImport, setAutoSimbriefImport] = usePersistentProperty('CONFIG_AUTO_SIMBRIEF_IMPORT', 'DISABLED');

  const getSimbriefUserData = async (value: string): Promise<any> => {
    const SIMBRIEF_URL = 'https://www.simbrief.com/api/xml.fetcher.php?json=1';

    if (!value) {
      throw new Error('No SimBrief username/pilot ID provided');
    }

    // The SimBrief API will try both username and pilot ID if either one
    // isn't valid, so request both if the input is plausibly a pilot ID.
    let apiUrl = `${SIMBRIEF_URL}&username=${value}`;
    if (/^\d{1,8}$/.test(value)) {
      apiUrl += `&userid=${value}`;
    }

    const response = await fetch(apiUrl);

    // 400 status means request was invalid, probably invalid username so preserve to display error properly
    if (!response.ok && response.status !== 400) {
      throw new Error(`Error when making fetch request to SimBrief API. Response status code: ${response.status}`);
    }

    return response.json();
  };

  const getSimbriefUserId = (value: string): Promise<any> =>
    new Promise((resolve, reject) => {
      if (!value) {
        reject(new Error('No SimBrief username/pilot ID provided'));
      }
      getSimbriefUserData(value)
        .then((data) => {
          if (data.fetch.status === 'Error: Unknown UserID') {
            reject(new Error('Error: Unknown UserID'));
          }
          resolve((data.fetch as { userid: any }).userid);
        })
        .catch((_error) => {
          reject(_error);
        });
    });

  const handleOverrideSimbriefIDInput = (value: string) => {
    getSimbriefUserId(value)
      .then((response) => {
        toast.success(`${t('Settings.ThirdPartyOptions.YourSimBriefPilotIdHasBeenValidatedAndUpdatedTo')} ${response}`);

        setOverrideSimbriefUserID(response);
        setOverrideSimbriefDisplay(response);
      })
      .catch(() => {
        setOverrideSimbriefDisplay(overrideSimbriefUserID);
        toast.error(
          t('Settings.ThirdPartyOptions.PleaseCheckThatYouHaveCorrectlyEnteredYourSimBriefUsernameOrPilotId'),
        );
      });
  };

  const handleOverrideSimBriefIDDelete = () => {
    setOverrideSimbriefUserID('');
    setOverrideSimbriefDisplay('');
  };

  const handleNavigraphAccountSuccessfulLink = () => {
    history.push('/settings/3rd-party-options');
  };

  const handleNavigraphAccountUnlink = () => {
    navigraphAuth.signOut();
  };

  return (
    <Switch>
      <Route exact path="/settings/3rd-party-options/navigraph-login">
        <FullscreenSettingsPage name={t('Settings.ThirdPartyOptions.NavigraphAccountLink.LoginPage.Title')}>
          <NavigraphAuthUIWrapper showLogin onSuccessfulLogin={handleNavigraphAccountSuccessfulLink} />
        </FullscreenSettingsPage>
      </Route>

      <Route exact path="/settings/3rd-party-options">
        <SettingsPage name={t('Settings.ThirdPartyOptions.Title')}>
          <SettingItem name={t('Settings.ThirdPartyOptions.NavigraphAccountLink.SettingTitle')}>
            {navigraphAuthInfo.loggedIn ? (
              <div className="flex flex-row items-center">
                <span className="mr-4 flex flex-row items-center">
                  <span className="text-base font-semibold text-m3-text">{navigraphAuthInfo.username}</span>
                  <img src={NavigraphIcon} className="mx-1.5 w-6" alt="Navigraph Icon" />
                  <span className="text-sm text-m3-muted">
                    {t(
                      `Settings.ThirdPartyOptions.NavigraphAccountLink.SubscriptionStatus.${NavigraphSubscriptionStatus[navigraphAuthInfo.subscriptionStatus]}`,
                    )}
                  </span>
                </span>

                <M3Button tone="danger" className={ROW_BUTTON} onClick={handleNavigraphAccountUnlink}>
                  {t('Settings.ThirdPartyOptions.NavigraphAccountLink.Unlink')}
                </M3Button>
              </div>
            ) : (
              <M3Button
                className={ROW_BUTTON}
                onClick={() => history.push('/settings/3rd-party-options/navigraph-login')}
              >
                {t('Settings.ThirdPartyOptions.NavigraphAccountLink.Link')}
              </M3Button>
            )}
          </SettingItem>

          <TooltipWrapper text={t('Settings.ThirdPartyOptions.TT.OverrideSimBriefUserID')}>
            <SettingItem name={t('Settings.ThirdPartyOptions.OverrideSimBriefUserID')}>
              <div className="flex flex-row items-center">
                <SimpleInput
                  className="w-30 mr-5 text-center"
                  value={overrideSimbriefDisplay}
                  onBlur={(value) => handleOverrideSimbriefIDInput(value.replace(/\s/g, ''))}
                  onChange={(value) => setOverrideSimbriefDisplay(value)}
                />

                <M3Button tone="danger" className={`${ROW_BUTTON} w-10 !px-0`} onClick={handleOverrideSimBriefIDDelete}>
                  <IconTrash size={20} />
                </M3Button>
              </div>
            </SettingItem>
          </TooltipWrapper>

          <SettingItem name={t('Settings.AtsuAoc.AutomaticallyImportSimBriefData')}>
            <Toggle
              value={autoSimbriefImport === 'ENABLED'}
              onToggle={(toggleValue) => setAutoSimbriefImport(toggleValue ? 'ENABLED' : 'DISABLED')}
            />
          </SettingItem>

          <SettingItem name={t('Settings.ThirdPartyOptions.GsxFuelEnabled')}>
            <Toggle
              value={gsxFuelSyncEnabled === 1}
              onToggle={(value) => {
                setGsxFuelSyncEnabled(value ? 1 : 0);
              }}
            />
          </SettingItem>

          <SettingItem name={t('Settings.ThirdPartyOptions.GsxPayloadEnabled')}>
            <Toggle
              value={gsxPayloadSyncEnabled === 1}
              onToggle={(value) => {
                setGsxPayloadSyncEnabled(value ? 1 : 0);
              }}
            />
          </SettingItem>

          <SettingItem name={t('Settings.ThirdPartyOptions.GsxPowerEnabled')}>
            <Toggle
              value={gsxPowerSyncEnabled === 1}
              onToggle={(value) => {
                setGsxPowerSyncEnabled(value ? 1 : 0);
              }}
            />
          </SettingItem>
        </SettingsPage>
      </Route>
    </Switch>
  );
};
