// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { useEffect, useRef, useState } from 'react';
import { useSimVar } from '@flybywiresim/fbw-sdk-react';
import { Tools } from 'react-bootstrap-icons';
import { t } from '../../../Localization/translation';
import { equipmentRow, ServiceRowSpec } from './ServicesLayout';
import { RAT_POSITION_VAR, RAT_STOW_FEEDBACK_MS, RAT_STOW_REQUEST_VAR, ratStowLook, ratStowStatusKey } from './ratStow';

/**
 * The maintenance "RAT stow" row of the ground equipment list (both aircraft): shown while the RAT is out, active
 * when the aircraft is stopped on the ground. The systems decide whether the stow is possible (on the ground, no
 * extension commanded), so a refused request just leaves the RAT out.
 * @param onGroundAndStopped whether the aircraft is on the ground and stationary
 * @returns the row, or null while the RAT is stowed
 */
export function useRatStowRow(onGroundAndStopped: boolean): ServiceRowSpec | null {
  const [ratPosition] = useSimVar(RAT_POSITION_VAR, 'number', 200);
  const [stowRequested, setStowRequested] = useState(false);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (feedbackTimer.current !== null) {
        clearTimeout(feedbackTimer.current);
      }
    },
    [],
  );

  const requestStow = () => {
    SimVar.SetSimVarValue(RAT_STOW_REQUEST_VAR, 'bool', true);
    setStowRequested(true);
    if (feedbackTimer.current !== null) {
      clearTimeout(feedbackTimer.current);
    }
    feedbackTimer.current = setTimeout(() => setStowRequested(false), RAT_STOW_FEEDBACK_MS);
  };

  const look = ratStowLook(ratPosition, stowRequested, onGroundAndStopped);
  if (look === 'hidden') {
    return null;
  }
  return equipmentRow('ratStow', t('Ground.Services.RatStow'), <Tools size={18} />, look, requestStow, {
    status: t(ratStowStatusKey(look)),
    action: t('Ground.Services.RatStowAction'),
  });
}
