// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { useSimVar } from '@flybywiresim/fbw-sdk-react';
import { Plug } from 'react-bootstrap-icons';
import { t } from '../../../Localization/translation';
import { M3Switch } from '../../../UtilComponents/Material/Material';
import { ServiceRowSpec } from './ServicesLayout';
import {
  EXT_PWR_AVAIL_VAR,
  MAINT_BUS_SWITCH_VAR,
  maintBusRowState,
  maintBusStatusKey,
  maintBusToggled,
} from './maintBus';

/**
 * The A320 MAINT BUS switch row of the ground equipment list. The switch is in the forward entrance area, which the
 * cockpit model does not have: this row stands in for it. Its switch is greyed out without external power, as the
 * real switch only latches with external power available.
 * @returns the row
 */
export function useMaintBusRow(): ServiceRowSpec {
  const [switchOn] = useSimVar(MAINT_BUS_SWITCH_VAR, 'bool', 200);
  const [externalPowerAvailable] = useSimVar(EXT_PWR_AVAIL_VAR, 'bool', 200);
  const state = maintBusRowState(switchOn > 0, externalPowerAvailable > 0);
  const name = t('Ground.Services.MaintBus');
  const disabled = state === 'unavailable';

  return {
    key: 'maintBus',
    name,
    icon: <Plug size={18} />,
    tone: state === 'on' ? 'active' : 'idle',
    status: t(maintBusStatusKey(state)),
    trailing: (
      <M3Switch
        value={state === 'on'}
        onToggle={() => SimVar.SetSimVarValue(MAINT_BUS_SWITCH_VAR, 'bool', maintBusToggled(state))}
        disabled={disabled}
        aria-label={name}
      />
    ),
    disabled,
  };
}
