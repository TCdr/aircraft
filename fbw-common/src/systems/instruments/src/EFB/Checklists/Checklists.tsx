// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect } from 'react';
import { usePersistentNumberProperty } from '@flybywiresim/fbw-sdk-react';
import { CheckLg, Link45deg } from 'react-bootstrap-icons';
import { PromptModal, ScrollableContainer, t, useModals } from '@flybywiresim/flypad';
import { ChecklistJsonDefinition } from '@flybywiresim/checklists';
import { ChecklistPage } from './ChecklistsPage';
import {
  areAllChecklistItemsCompleted,
  setChecklistCompletion,
  setChecklistItemCompletion,
  setSelectedChecklistIndex,
} from '../Store/features/checklists';
import { RootState, store, useAppDispatch, useAppSelector } from '../Store/store';
import { M3Button, M3Card, M3Chip } from '../UtilComponents/Material/Material';

/**
 * @brief Get the relevant checklist indices based on the current flight phase.
 */
export const getRelevantChecklistIndices = () => {
  const { aircraftChecklists } = useAppSelector((state) => state.trackingChecklists);

  // | Value | Flight Phase     |
  // |-------|------------------|
  // | 0     |                  |
  // | 1     | ELEC PWR         |
  // | 2     | 1ST ENG STARTED  |
  // | 3     | 1ST ENG TO PWR   |
  // | 4     | 80 kt            |
  // | 5     | LIFTOFF          |
  // | 6     | 1500ft (in clb)  |
  // | 7     | 800 ft (in desc) |
  // | 8     | TOUCHDOWN        |
  // | 9     | 80 kt            |
  // | 10    | 2nd ENG SHUTDOWN |
  // | => 1  | 5 MIN AFTER      |
  // |--------------------------|
  const flightPhase = SimVar.GetSimVarValue('L:A32NX_FWC_FLIGHT_PHASE', 'Enum');

  const relevantChecklistIndices: number[] = [];

  // iterate over all checklists and check if they are relevant for the current flight phase
  aircraftChecklists.forEach((cl, clIndex) => {
    // check if the checklist is relevant for the previous or the current flight phase
    if (cl.flightphase && cl.flightphase <= flightPhase) {
      relevantChecklistIndices.push(clIndex);
    }
  });

  return relevantChecklistIndices;
};

/**
 * @brief Set the automatic item states based on the checklist item conditions.
 *
 * This is called every 1s from EFB.tsx and every time the selected checklist index changes.
 */
export const setAutomaticItemStates = (aircraftChecklists: ChecklistJsonDefinition[]) => {
  const checklists = (store.getState() as RootState).trackingChecklists.checklists;

  checklists.forEach((cl, currentChecklistIdx) => {
    // leave completed checklists alone - as otherwise they would be reset everytime an item becomes uncompleted
    // iterate over all non-completed checklists and check all auto-checkable items
    if (cl.markedCompleted) return;

    // check all items in the current checklist if they are auto completed
    aircraftChecklists[currentChecklistIdx].items.forEach((clItem, itemIdx) => {
      let isCompleted: boolean = false;

      // if the item is a line or subheader, mark it as completed as these do not have a relevant completion state
      if (clItem.type !== undefined && (clItem.type === 'LINE' || clItem.type === 'SUBLISTHEADER')) {
        isCompleted = true;
        // if the item has a condition, check if it is fulfilled
      } else if (clItem.condition && clItem.condition.length > 0) {
        isCompleted = clItem.condition.every((c) => {
          let comp: string = c.comp;
          if (comp === undefined) comp = 'EQ';
          switch (comp) {
            case 'NE':
              return SimVar.GetSimVarValue(c.varName, 'Number') !== c.result;
            case 'LT':
              return SimVar.GetSimVarValue(c.varName, 'Number') < c.result;
            case 'LE':
              return SimVar.GetSimVarValue(c.varName, 'Number') <= c.result;
            case 'EQ':
              return SimVar.GetSimVarValue(c.varName, 'Number') === c.result;
            case 'GE':
              return SimVar.GetSimVarValue(c.varName, 'Number') >= c.result;
            case 'GT':
              return SimVar.GetSimVarValue(c.varName, 'Number') > c.result;
            default:
              console.warn('Unknown EqualityType: ', comp);
              return false;
          }
        });
        // ignore items and subitems without a condition
      } else {
        return;
      }

      // check if there is a stored tracking item associated with the checklist item
      if (checklists[currentChecklistIdx].items[itemIdx]) {
        store.dispatch(
          setChecklistItemCompletion({
            checklistIndex: currentChecklistIdx,
            itemIndex: itemIdx,
            completionValue: isCompleted,
          }),
        );
      }
    });
  });
};

/**
 * @brief The flyPad's Checklists page component.
 */
export const Checklists = () => {
  const { selectedChecklistIndex, checklists, aircraftChecklists } = useAppSelector(
    (state) => state.trackingChecklists,
  );

  const [autoFillChecklists] = usePersistentNumberProperty('EFB_AUTOFILL_CHECKLISTS', 0);

  const dispatch = useAppDispatch();
  const { showModal } = useModals();

  useEffect(() => {
    if (!autoFillChecklists) return;
    setAutomaticItemStates(aircraftChecklists);
  }, [selectedChecklistIndex, autoFillChecklists]);

  const relevantChecklistIndices = getRelevantChecklistIndices();
  const firstRelevantUnmarkedIdx = checklists.findIndex(
    (cl, clIndex) => relevantChecklistIndices.includes(clIndex) && !cl.markedCompleted,
  );

  /**
   * @brief Handles the click event for a checklist item.
   * @param index - The index of the checklist item being clicked.
   */
  const handleClick = (index: number) => {
    dispatch(setSelectedChecklistIndex(index));
  };

  /**
   * @brief The number of done items of a checklist and its number of items (lines and sub-list headers aside).
   * @param index - The index of the checklist.
   */
  const getItemCounts = (index: number) => {
    let done = 0;
    let total = 0;
    aircraftChecklists[index].items.forEach((item, itemIdx) => {
      if (item.type === 'LINE' || item.type === 'SUBLISTHEADER') return;
      total++;
      if (checklists[index].items[itemIdx]?.completed) done++;
    });
    return { done, total };
  };

  /**
   * @brief The mark of a checklist in the list: done (marked complete), all items done but not yet marked (amber),
   * the next one of the flight phase when autofill is on (link), or open.
   * @param index - The index of the checklist.
   */
  const getChecklistMark = (index: number) => {
    const isChecklistCompleted = areAllChecklistItemsCompleted(index);
    const isIndexRelevant = relevantChecklistIndices.includes(index);
    if (isChecklistCompleted && isIndexRelevant) {
      return (
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full ${
            checklists[index].markedCompleted ? 'bg-m3-primary text-m3-on-primary' : 'bg-m3-on-warn text-m3-on-primary'
          }`}
        >
          <CheckLg size={16} />
        </span>
      );
    }
    if (!!autoFillChecklists && firstRelevantUnmarkedIdx === index) {
      return (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-m3-primary text-m3-on-primary">
          <Link45deg size={18} />
        </span>
      );
    }
    return <span className="box-border h-6 w-6 rounded-full border-2 border-m3-outline" />;
  };

  /**
   * @brief Function to handle the confirmation to reset all checklists.
   * This function displays a confirmation modal with a warning message and a confirmation button.
   * If the user confirms the reset, it will set the completion value for all checklist items and checklists
   * to false.
   */
  const handleResetAllConfirmation = () => {
    showModal(
      <PromptModal
        title={t('Checklists.ChecklistResetWarning')}
        bodyText={t('Checklists.AreYouSureYouWantToResetChecklists')}
        onConfirm={() => {
          checklists.forEach((cl, clIndex) => {
            cl.items.forEach((_, itemIdx) => {
              if (autoFillChecklists && aircraftChecklists[clIndex].items[itemIdx].condition) {
                return;
              }
              dispatch(
                setChecklistItemCompletion({
                  checklistIndex: clIndex,
                  itemIndex: itemIdx,
                  completionValue: false,
                }),
              );
            });
            dispatch(setChecklistCompletion({ checklistIndex: clIndex, completion: false }));
          });
        }}
      />,
    );
  };

  /**
   * @brief Handles the reset of a single checklist.
   *
   * This function sets the completion of each checklist item to false and the completion
   * of the entire checklist to false.
   */
  const handleResetChecklist = () => {
    checklists[selectedChecklistIndex].items.forEach((_, itemIdx) => {
      if (autoFillChecklists && aircraftChecklists[selectedChecklistIndex].items[itemIdx].condition) {
        return;
      }
      dispatch(
        setChecklistItemCompletion({
          checklistIndex: selectedChecklistIndex,
          itemIndex: itemIdx,
          completionValue: false,
        }),
      );
    });
    dispatch(setChecklistCompletion({ checklistIndex: selectedChecklistIndex, completion: false }));
  };

  return (
    <>
      <div className="mb-4 flex flex-row items-center">
        <h1 className="grow font-bold">{t('Checklists.Title')}</h1>
        {!!autoFillChecklists && (
          <M3Chip tone="active" icon={<Link45deg size={18} />}>
            {t('Settings.Realism.AutofillChecklists')}
          </M3Chip>
        )}
      </div>
      <div className="flex h-content-section-reduced flex-row overflow-hidden">
        <div className="mr-4 flex w-[340px] shrink-0 flex-col">
          <M3Card className="min-h-0 flex-1 p-2">
            <ScrollableContainer innerClassName="space-y-1" height={46}>
              {aircraftChecklists.map((cl, index) => {
                const selected = index === selectedChecklistIndex;
                const counts = getItemCounts(index);
                const done = areAllChecklistItemsCompleted(index) && relevantChecklistIndices.includes(index);
                return (
                  <div
                    key={cl.name}
                    className={`flex h-12 w-full cursor-pointer flex-row items-center rounded-xl px-3 transition duration-100 ${
                      selected ? 'bg-m3-primary-container' : 'hover:bg-m3-tile'
                    }`}
                    onClick={() => handleClick(index)}
                  >
                    <span className="mr-3 flex w-7 shrink-0 justify-center">{getChecklistMark(index)}</span>
                    <span
                      className={`grow truncate text-sm font-bold ${
                        selected ? 'text-m3-on-primary-container' : done ? 'text-m3-muted' : 'text-m3-text'
                      }`}
                    >
                      {cl.name}
                    </span>
                    <span
                      className={`ml-2 text-xs font-bold ${selected ? 'text-m3-on-primary-container' : 'text-m3-muted'}`}
                    >
                      {`${counts.done}/${counts.total}`}
                    </span>
                  </div>
                );
              })}
            </ScrollableContainer>
          </M3Card>

          <div className="mt-3 flex shrink-0 flex-row">
            <M3Button tone="danger" className="!h-12 flex-1" onClick={handleResetChecklist}>
              <span className="text-base font-bold text-current">{t('Checklists.ResetChecklist')}</span>
            </M3Button>
            <M3Button tone="danger" className="ml-2 !h-12 flex-1" onClick={handleResetAllConfirmation}>
              <span className="text-base font-bold text-current">{t('Checklists.ResetAll')}</span>
            </M3Button>
          </div>
        </div>

        <ChecklistPage />
      </div>
    </>
  );
};
