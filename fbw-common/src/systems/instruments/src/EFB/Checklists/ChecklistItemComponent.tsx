// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useAppDispatch, useAppSelector } from '@flybywiresim/flypad';
import React, { useEffect, useState } from 'react';
import { usePersistentNumberProperty } from '@flybywiresim/fbw-sdk-react';
import { toast } from 'react-toastify';
import { CheckLg, Link45deg } from 'react-bootstrap-icons';
import { ChecklistItem } from '@flybywiresim/checklists';
import { getRelevantChecklistIndices } from './Checklists';
import { setChecklistCompletion, setChecklistItemCompletion } from '../Store/features/checklists';

interface ChecklistItemComponentProps {
  item: ChecklistItem;
  index: number;
}

export const ChecklistItemComponent = ({ item, index }: ChecklistItemComponentProps) => {
  const dispatch = useAppDispatch();
  const { selectedChecklistIndex, checklists } = useAppSelector((state) => state.trackingChecklists);

  const [checklistShake, setChecklistShake] = useState(false);
  const [autoFillChecklists] = usePersistentNumberProperty('EFB_AUTOFILL_CHECKLISTS', 0);

  const isItemCompleted = checklists[selectedChecklistIndex].items[index]?.completed;

  const firstIncompleteIdx = checklists[selectedChecklistIndex].items.findIndex((item) => {
    if (autoFillChecklists) return !item.completed && !item.hasCondition;
    return !item.completed;
  });

  // convenience variables to make the JSX more readable
  const isLine = item.type !== undefined && item.type === 'LINE';
  const isListItem = item.type === undefined || item.type === 'ITEM';
  const isSublistItem = item.type !== undefined && item.type === 'SUBLISTITEM';
  const isAnyItemType = isListItem || isSublistItem;
  const isSubListHeader = item.type !== undefined && item.type === 'SUBLISTHEADER';

  const itemCheckedAfterIncompleteItems = checklists[selectedChecklistIndex].items
    .slice(firstIncompleteIdx)
    .some((item) => item.completed && (autoFillChecklists ? !item.hasCondition : true));
  const itemImproperlyUnchecked = index === firstIncompleteIdx && itemCheckedAfterIncompleteItems;

  // done items step back (muted name, tonal result); an open item left behind done ones is red
  let color = 'text-white';
  if (isItemCompleted && !isLine) {
    color = 'text-m3-muted';
  } else if (itemImproperlyUnchecked && !isLine) {
    color = 'text-m3-on-error';
  }
  const resultColor = isItemCompleted && !isLine ? 'text-m3-on-primary-container' : 'text-current';
  const isAutoItem = !!autoFillChecklists && !!item.condition;

  // If the user interacts with an auto complete item 3 times in a row, show a toast message
  // to point out that autofill is enabled and the item cannot be interacted with.
  const [autoItemTouches, setAutoItemTouches] = useState(0);
  useEffect(() => {
    if (autoItemTouches === 3) {
      toast.info(
        'You cannot interact with this item because you have enabled the ' +
          'autofill checklist option in the Realism settings page.',
      );
      setAutoItemTouches(0);
    }
  }, [autoItemTouches]);

  const relevantChecklistIndices = getRelevantChecklistIndices(); // relevant for the current flight phase
  const firstRelevantUnmarkedIdx = checklists.findIndex(
    (cl, clIndex) => relevantChecklistIndices.includes(clIndex) && !cl.markedCompleted,
  );
  const autoCheckable = selectedChecklistIndex >= firstRelevantUnmarkedIdx && autoFillChecklists;

  const handleChecklistItemClick = () => {
    if (isLine) return; // lines are not clickable

    // If the item is auto-checkable and the user tries to interact with it, shake the checklist
    if (item.condition && autoCheckable) {
      setAutoItemTouches((old) => old + 1);
      setChecklistShake(true);
      setTimeout(() => {
        setChecklistShake(false);
      }, 1000);
      return;
    }

    // toggle completion of the item in the reducer state
    dispatch(
      setChecklistItemCompletion({
        checklistIndex: selectedChecklistIndex,
        itemIndex: index,
        completionValue: !isItemCompleted,
      }),
    );

    // if the item was completed, uncomplete the checklist in the reducer state
    if (isItemCompleted) {
      dispatch(setChecklistCompletion({ checklistIndex: selectedChecklistIndex, completion: false }));
    }
  };

  // if the item definition has an action, use that when the item is incomplete
  // otherwise, use the result string
  // example: action="CHECK" result="CHECKED"
  let actionResultString = item.result;
  if (!isItemCompleted && item.action !== undefined) {
    actionResultString = item.action;
  }

  return (
    <div
      className={`flex min-h-[48px] flex-row items-center py-1 ${isSublistItem ? 'pl-10' : 'pl-0'} ${color}`}
      onClick={handleChecklistItemClick}
    >
      {item.item && isAnyItemType && (
        <div
          className={`mr-4 box-border flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            isAutoItem
              ? isItemCompleted
                ? 'bg-m3-primary-container text-m3-on-primary-container'
                : 'border-2 border-m3-outline text-m3-muted'
              : isItemCompleted
                ? 'bg-m3-primary text-m3-on-primary'
                : 'border-2 border-current'
          }`}
        >
          {isAutoItem && (
            <Link45deg
              size={20}
              className={`${!autoCheckable && 'opacity-40'} ${checklistShake && 'shake text-m3-on-error'}`}
            />
          )}
          {isItemCompleted && !isAutoItem && <CheckLg size={20} />}
        </div>
      )}
      {isLine && <div className="my-3 h-0.5 w-full rounded-full bg-m3-outline" />}
      {isSubListHeader && (
        <div className="flex w-full flex-row items-end pt-3">
          <div className="whitespace-nowrap text-base font-bold tracking-widest text-m3-muted">{item.item}</div>
        </div>
      )}
      {!isLine && !isSubListHeader && (
        <div className="flex w-full flex-row items-center text-current">
          <div className="whitespace-nowrap text-lg font-bold text-current">{item.item}</div>
          <div className="mx-4 mt-3 min-w-[24px] grow border-b-2 border-dotted border-current opacity-50" />
          <div className={`whitespace-nowrap text-lg font-bold ${resultColor}`}>{actionResultString}</div>
        </div>
      )}
    </div>
  );
};
