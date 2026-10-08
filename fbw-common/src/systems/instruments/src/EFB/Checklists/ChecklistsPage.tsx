// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { ScrollableContainer, t } from '@flybywiresim/flypad';
import { usePersistentNumberProperty } from '@flybywiresim/fbw-sdk-react';
import { useAppSelector } from '../Store/store';
import { ChecklistItemComponent } from './ChecklistItemComponent';
import { CompletionButton } from './CompletionButton';
import { getRelevantChecklistIndices } from './Checklists';
import { M3Card, M3Progress } from '../UtilComponents/Material/Material';

/** The open checklist: its name and progress, its items, the completion button */
export const ChecklistPage = () => {
  const { selectedChecklistIndex, aircraftChecklists, checklists } = useAppSelector(
    (state) => state.trackingChecklists,
  );
  const [autoFillChecklists] = usePersistentNumberProperty('EFB_AUTOFILL_CHECKLISTS', 0);

  const relevantChecklistIndices = getRelevantChecklistIndices();
  const firstRelevantUnmarkedIdx = checklists.findIndex(
    (cl, clIndex) => relevantChecklistIndices.includes(clIndex) && !cl.markedCompleted,
  );

  // the checklists file is read asynchronously: nothing to show until it is
  if (!aircraftChecklists[selectedChecklistIndex] || !checklists[selectedChecklistIndex]) {
    return <M3Card className="min-w-0 flex-1" />;
  }

  let done = 0;
  let total = 0;
  aircraftChecklists[selectedChecklistIndex].items.forEach((item, itemIdx) => {
    if (item.type === 'LINE' || item.type === 'SUBLISTHEADER') return;
    total++;
    if (checklists[selectedChecklistIndex].items[itemIdx]?.completed) done++;
  });

  return (
    <M3Card className="min-w-0 flex-1 px-6 pb-6 pt-5">
      <div className="flex shrink-0 flex-row items-center">
        <span className="text-2xl font-bold text-m3-text">{aircraftChecklists[selectedChecklistIndex].name}</span>
        {!!autoFillChecklists && selectedChecklistIndex === firstRelevantUnmarkedIdx && (
          <span className="ml-3 rounded-full bg-m3-primary-container px-2 py-1 text-xs font-bold uppercase leading-none text-m3-on-primary-container">
            {t('Checklists.CurrentFlightPhase')}
          </span>
        )}
        <div className="grow" />
        <span className="text-sm font-bold text-m3-muted">{`${done} / ${total} ${t('Checklists.ItemsDone')}`}</span>
      </div>
      <M3Progress className="mb-3 mt-3 shrink-0" value={total > 0 ? done / total : 0} />

      <div className="min-h-0 flex-1">
        <ScrollableContainer height={39}>
          {aircraftChecklists[selectedChecklistIndex].items.map((it, index) => (
            <ChecklistItemComponent key={it.item} item={it} index={index} />
          ))}
        </ScrollableContainer>
      </div>

      <div className="mt-3 shrink-0">
        <CompletionButton />
      </div>
    </M3Card>
  );
};
