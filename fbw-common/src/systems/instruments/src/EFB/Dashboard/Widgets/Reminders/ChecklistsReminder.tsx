// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useSimVar } from '@flybywiresim/fbw-sdk-react';
import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, ListCheck } from 'react-bootstrap-icons';
import { useHistory } from 'react-router-dom';
import { t } from '@flybywiresim/flypad';
import {
  areAllChecklistItemsCompleted,
  getChecklistCompletion,
  setSelectedChecklistIndex,
  TrackingChecklist,
} from '../../../Store/features/checklists';
import { RemindersSection } from './RemindersSection';
import { useAppDispatch, useAppSelector } from '../../../Store/store';
import { getRelevantChecklistIndices } from '../../../Checklists/Checklists';
import { M3ListRow, M3Tone } from '../../../UtilComponents/Material/Material';

interface ChecklistReminderCardProps {
  checklist: TrackingChecklist;
  checklistIndex: number;
}

/** A checklist of the flight phase: its progress, a tap opens it */
const ChecklistReminderCard = ({ checklist, checklistIndex }: ChecklistReminderCardProps) => {
  const dispatch = useAppDispatch();
  const history = useHistory();
  const completion = getChecklistCompletion(checklistIndex);

  // All items done but not marked completed: to confirm
  let tone: M3Tone = completion > 0 ? 'active' : 'idle';
  if (areAllChecklistItemsCompleted(checklistIndex)) {
    tone = checklist.markedCompleted ? 'active' : 'busy';
  }

  return (
    <M3ListRow
      icon={<ListCheck size={18} />}
      tone={tone}
      name={checklist.name}
      status={`${Math.round(completion * 100)} %`}
      progress={completion}
      trailing={
        checklist.markedCompleted ? (
          <Check className="text-m3-on-primary-container" size={24} />
        ) : (
          <ArrowRight className="text-m3-muted" size={18} />
        )
      }
      onClick={() => {
        dispatch(setSelectedChecklistIndex(checklistIndex));
        history.push('/checklists');
      }}
    />
  );
};

export const ChecklistsReminder = () => {
  const { checklists } = useAppSelector((state) => state.trackingChecklists);

  const relevantChecklistIndices = getRelevantChecklistIndices();
  const [relevantChecklists, setRelevantChecklists] = useState(
    [...checklists].filter((_, clIndex) => relevantChecklistIndices.includes(clIndex)),
  );

  const [flightPhase] = useSimVar('L:A32NX_FWC_FLIGHT_PHASE', 'Enum', 1000);

  useEffect(() => {
    setRelevantChecklists([...checklists].filter((_, clIndex) => relevantChecklistIndices.includes(clIndex)));
  }, [flightPhase]);

  return (
    <RemindersSection title={t('Dashboard.ImportantInformation.Checklists.Title')} pageLinkPath="/checklists">
      {relevantChecklists.length ? (
        <div className="-mx-4 flex flex-col">
          {relevantChecklists.map((checklist) => (
            <ChecklistReminderCard
              key={checklist.name}
              checklist={checklist}
              checklistIndex={checklists.findIndex((cl) => cl.name === checklist.name)}
            />
          ))}
        </div>
      ) : (
        <span className="my-2 text-center text-base text-m3-muted">
          {t('Dashboard.ImportantInformation.Checklists.NoRelevantChecklists')}
        </span>
      )}
    </RemindersSection>
  );
};
