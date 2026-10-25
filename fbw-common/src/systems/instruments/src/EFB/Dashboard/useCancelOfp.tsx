// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { NXDataStore } from '@flybywiresim/fbw-sdk-react';
import { PromptModal, useAppDispatch, useModals } from '@flybywiresim/flypad';
import { t } from '../Localization/translation';
import { clearSimbriefData } from '../Store/features/simBrief';
import { forgetOfpMemory } from './logic/cancelOfp';

/** Asks for confirmation, then removes the loaded OFP and what the dashboard remembered for it */
export const useCancelOfp = (): (() => void) => {
  const dispatch = useAppDispatch();
  const { showModal } = useModals();

  return () =>
    showModal(
      <PromptModal
        title={t('Dashboard.Strip.CancelOfpTitle')}
        bodyText={t('Dashboard.Strip.CancelOfpBody')}
        confirmText={t('Dashboard.Strip.CancelOfpConfirm')}
        cancelText={t('Dashboard.Strip.CancelOfpKeep')}
        onConfirm={() => {
          dispatch(clearSimbriefData());
          forgetOfpMemory((key) => NXDataStore.setLegacy(key, ''));
        }}
      />,
    );
};
