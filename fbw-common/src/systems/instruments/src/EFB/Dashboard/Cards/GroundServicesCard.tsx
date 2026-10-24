// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { useHistory } from 'react-router-dom';
import { GsxServiceStates, useSimVar } from '@flybywiresim/fbw-sdk-react';
import { t } from '../../Localization/translation';
import { useAppSelector } from '../../Store/store';
import { M3Tone } from '../../UtilComponents/Material/Material';
import { JetBridgeStatus, jetBridgeStatus } from '../logic/aircraftState';
import { jetBridgeMovedSinceLoad } from '../useJetBridgeMoved';
import { CardButton, DashboardCard, InfoLine, StatusBox } from './CardParts';

const StatusChip: FC<{ tone: M3Tone; labelKey: string }> = ({ tone, labelKey }) => (
  <StatusBox tone={tone}>{t(labelKey)}</StatusBox>
);

const JET_BRIDGE_CHIPS: Record<JetBridgeStatus, { tone: M3Tone; labelKey: string }> = {
  connected: { tone: 'active', labelKey: 'Dashboard.GroundServices.Connected' },
  moving: { tone: 'busy', labelKey: 'Dashboard.GroundServices.Moving' },
  notConnected: { tone: 'idle', labelKey: 'Dashboard.GroundServices.NotConnected' },
};

/** The ground equipment at the aircraft; the jet bridge only once the flyPad moved it (see jetBridgeStatus) */
export const GroundServicesCard: FC<{ className?: string }> = ({ className }) => {
  const history = useHistory();
  const { jetWayButtonState } = useAppSelector((state) => state.groundServicePage);
  const [gpuAvailable] = useSimVar('L:A32NX_EXT_PWR_AVAIL:1', 'bool', 1_000);
  const [pushbackAttached] = useSimVar('Pushback Attached', 'enum', 1_000);
  const [gsxDeparture] = useSimVar('L:FSDT_GSX_DEPARTURE_STATE', 'number', 1_000);

  const jetBridge = jetBridgeStatus(jetWayButtonState, jetBridgeMovedSinceLoad());

  let pushback = { tone: 'idle' as M3Tone, labelKey: 'Dashboard.GroundServices.NotCalled' };
  if (pushbackAttached > 0 || gsxDeparture === GsxServiceStates.ACTIVE) {
    pushback = { tone: 'active', labelKey: 'Dashboard.GroundServices.Attached' };
  } else if (gsxDeparture === GsxServiceStates.REQUESTED) {
    pushback = { tone: 'busy', labelKey: 'Dashboard.GroundServices.Called' };
  }

  return (
    <DashboardCard
      title={t('Dashboard.GroundServices.Title')}
      section="cabin"
      className={className}
      footer={
        <CardButton onClick={() => history.push('/ground/services')}>{t('Dashboard.GroundServices.Open')}</CardButton>
      }
    >
      {jetBridge && (
        <InfoLine
          name={t('Dashboard.GroundServices.JetBridge')}
          value={<StatusChip {...JET_BRIDGE_CHIPS[jetBridge]} />}
        />
      )}
      <InfoLine
        name={t('Dashboard.GroundServices.Gpu')}
        value={
          <StatusChip
            tone={gpuAvailable > 0 ? 'active' : 'idle'}
            labelKey={gpuAvailable > 0 ? 'Dashboard.GroundServices.Connected' : 'Dashboard.GroundServices.NotConnected'}
          />
        }
      />
      <InfoLine name={t('Dashboard.GroundServices.Pushback')} value={<StatusChip {...pushback} />} />
    </DashboardCard>
  );
};
