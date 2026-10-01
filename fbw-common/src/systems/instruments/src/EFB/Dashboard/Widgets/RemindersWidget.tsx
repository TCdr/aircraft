// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect, useState } from 'react';
import { usePersistentProperty } from '@flybywiresim/fbw-sdk-react';
import { ArrowDown, ArrowUp, PencilFill } from 'react-bootstrap-icons';
import { t } from '../../Localization/translation';
import { TooltipWrapper } from '../../UtilComponents/TooltipWrapper';
import { WeatherReminder } from './Reminders/WeatherReminder';
import { PinnedChartsReminder } from './Reminders/PinnedChartsReminder';
import { MaintenanceReminder } from './Reminders/MaintenanceReminder';
import { ChecklistsReminder } from './Reminders/ChecklistsReminder';
import { ScrollableContainer } from '../../UtilComponents/ScrollableContainer';
import { M3IconButton } from '../../UtilComponents/Material/Material';

type ReminderKey = 'Weather' | 'Pinned Charts' | 'Maintenance' | 'Checklists';

const REMINDERS = new Map<ReminderKey, JSX.Element>([
  ['Weather', <WeatherReminder key="weather" />],
  ['Pinned Charts', <PinnedChartsReminder key="pinnedCharts" />],
  ['Maintenance', <MaintenanceReminder key="maintenance" />],
  ['Checklists', <ChecklistsReminder key="checklists" />],
]);

const TRANSLATIONS = new Map<ReminderKey, string>([
  ['Weather', 'Dashboard.ImportantInformation.Weather.Title'],
  ['Pinned Charts', 'Dashboard.ImportantInformation.PinnedCharts.Title'],
  ['Maintenance', 'Dashboard.ImportantInformation.Maintenance.Title'],
  ['Checklists', 'Dashboard.ImportantInformation.Checklists.Title'],
]);

interface ReminderKeyEditCardProps {
  reminderText: string;
  index: number;
  setter: (destIndex: number) => void;
  keyArrLen: number;
}

const ReminderKeyEditCard = ({ reminderText, setter, index, keyArrLen }: ReminderKeyEditCardProps) => (
  <div className="flex w-full flex-row items-center rounded-2xl bg-m3-card px-4 py-3">
    <span className="grow text-lg font-bold text-m3-text">{reminderText}</span>
    <M3IconButton
      aria-label="Up"
      className="ml-2 w-12 !flex-none"
      onClick={() => setter(index === 0 ? keyArrLen - 1 : index - 1)}
    >
      <ArrowUp size={22} />
    </M3IconButton>
    <M3IconButton
      aria-label="Down"
      className="ml-2 w-12 !flex-none"
      onClick={() => setter(index === keyArrLen - 1 ? 0 : index + 1)}
    >
      <ArrowDown size={22} />
    </M3IconButton>
  </div>
);

export const RemindersWidget = () => {
  const [orderedReminderKeys, setOrderedReminderKeys] = usePersistentProperty(
    'REMINDER_WIDGET_ORDERED_KEYS',
    [...REMINDERS.keys()].toString(),
  );
  const reminderKeyArr = orderedReminderKeys.split(',') as ReminderKey[];

  /**
   * Let's check for any missing keys in the saved list in case more widgets get added in the future.
   */
  useEffect(() => {
    [...REMINDERS.keys()].forEach((key) => {
      if (!reminderKeyArr.includes(key)) {
        setOrderedReminderKeys(`${orderedReminderKeys},${key}`);
      }
    });
  }, []);

  const [reorderMode, setReorderMode] = useState(false);

  const arrayMove = (element: ReminderKey, toIndex: number) => {
    reminderKeyArr.splice(reminderKeyArr.indexOf(element), 1);
    reminderKeyArr.splice(toIndex, 0, element);

    return reminderKeyArr.toString();
  };

  return (
    <div className="flex w-[34rem] shrink-0 flex-col text-m3-text">
      <div className="mb-4 flex flex-row items-center justify-between">
        <h1 className="font-bold">{t('Dashboard.ImportantInformation.Title')}</h1>
        <TooltipWrapper text={t('Dashboard.ImportantInformation.TT.RearrangeWidgets')}>
          <div>
            <M3IconButton
              aria-label="Rearrange"
              className="!h-9 w-12 !flex-none"
              selected={reorderMode}
              onClick={() => setReorderMode((old) => !old)}
            >
              <PencilFill size={18} />
            </M3IconButton>
          </div>
        </TooltipWrapper>
      </div>
      <div className="relative h-content-section-reduced w-full overflow-hidden">
        <ScrollableContainer height={54}>
          <div className="flex flex-col space-y-3">{reminderKeyArr.map((key) => REMINDERS.get(key))}</div>
        </ScrollableContainer>
        <div
          className={`absolute inset-0 z-30 transition duration-100 ${reorderMode ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <div className="absolute inset-0 bg-m3-ground opacity-90" />
          <div className="absolute inset-0">
            <ScrollableContainer innerClassName="space-y-3" height={54}>
              {reminderKeyArr.map((key, index) => (
                <ReminderKeyEditCard
                  reminderText={t(TRANSLATIONS.get(key)!)}
                  keyArrLen={reminderKeyArr.length}
                  setter={(index) => setOrderedReminderKeys(arrayMove(key, index))}
                  index={index}
                  key={key}
                />
              ))}
            </ScrollableContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
