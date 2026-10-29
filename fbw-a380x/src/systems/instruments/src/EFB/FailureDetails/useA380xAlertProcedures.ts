// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useState } from 'react';
import { AlertProcedure } from '@flybywiresim/fbw-sdk';
import { useEventBus } from '@flybywiresim/flypad';
import type { ChecklistState, FwsEvents } from '../../MsfsAvionicsCommon/providers/FwsPublisher';
import { alertProcedures } from './a380xEwdMirror';

/**
 * Follows the procedures the FWS presents on the EWD; only call it while the detail view is mounted. It lives apart
 * from the mirror logic because importing the flyPad bundle makes the logic impossible to unit test.
 */
export function useA380xAlertProcedures(procedureIds: readonly string[]): AlertProcedure[] {
  const bus = useEventBus();
  const [presented, setPresented] = useState<ChecklistState[]>([]);

  useEffect(() => {
    const subscription = bus.getSubscriber<FwsEvents>().on('fws_abn_sensed_procedures').handle(setPresented);
    return () => subscription.destroy();
  }, [bus]);

  return alertProcedures(procedureIds, presented);
}
