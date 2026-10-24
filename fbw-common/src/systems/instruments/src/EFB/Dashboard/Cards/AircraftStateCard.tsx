// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useContext } from 'react';
import { t } from '../../Localization/translation';
import { AircraftContext } from '../../AircraftContext';
import { AircraftState } from '../useAircraftState';
import { PowerSource } from '../logic/aircraftState';
import { DashboardCard, Field, FieldRow } from './CardParts';

const POWER_KEYS: Record<PowerSource, string> = {
  extPwr: 'Dashboard.AircraftState.Power.ExtPwr',
  apu: 'Dashboard.AircraftState.Power.Apu',
  engineGen: 'Dashboard.AircraftState.Power.EngineGen',
  battery: 'Dashboard.AircraftState.Power.Battery',
  off: 'Dashboard.AircraftState.Power.Off',
};

const POWER_DETAIL_KEYS: Record<PowerSource, string> = {
  extPwr: 'Dashboard.AircraftState.Power.ExtPwrDetail',
  apu: 'Dashboard.AircraftState.Power.ApuDetail',
  engineGen: 'Dashboard.AircraftState.Power.EngineGenDetail',
  battery: 'Dashboard.AircraftState.Power.BatteryDetail',
  off: 'Dashboard.AircraftState.Power.OffDetail',
};

/** Power, doors, park brake, chocks (where the aircraft has them) and ADIRS: one row of equal tiles */
export const AircraftStateCard: FC<{ state: AircraftState }> = ({ state }) => {
  const { wheelChocks } = useContext(AircraftContext).settingsPages.sim;

  const powerDetail =
    state.power === 'extPwr' && state.extPwrAvailable > 1
      ? t('Dashboard.AircraftState.Power.ExtPwrUnits', [
          { online: String(state.extPwrOnline) },
          { available: String(state.extPwrAvailable) },
        ])
      : t(POWER_DETAIL_KEYS[state.power]);

  const doorCount = state.openDoors.length;
  const adirsValue = {
    off: t('Dashboard.AircraftState.AdirsOff'),
    aligning: t('Dashboard.AircraftState.AdirsAligning'),
    aligned: t('Dashboard.AircraftState.AdirsAligned'),
  }[state.adirs];
  const adirsDetail =
    state.adirs === 'aligning' && state.adirsMinutesLeft !== null
      ? t('Dashboard.AircraftState.AlignMinutes', [{ minutes: String(state.adirsMinutesLeft) }])
      : t(
          state.adirs === 'aligned'
            ? 'Dashboard.AircraftState.AdirsAlignedDetail'
            : 'Dashboard.AircraftState.AdirsOffDetail',
        );

  return (
    <DashboardCard title={t('Dashboard.AircraftState.Title')} section="aircraftState" className="shrink-0">
      <FieldRow>
        <Field
          label={t('Dashboard.AircraftState.Power.Title')}
          value={t(POWER_KEYS[state.power])}
          detail={powerDetail}
          tone={state.power === 'off' ? 'busy' : 'idle'}
        />
        <Field
          label={t('Dashboard.AircraftState.Doors')}
          value={
            doorCount === 0
              ? t('Dashboard.AircraftState.DoorsClosed')
              : t('Dashboard.AircraftState.DoorsOpen', [{ count: String(doorCount) }])
          }
          detail={doorCount === 0 ? t('Dashboard.AircraftState.DoorsClosedDetail') : state.openDoors.join(' · ')}
        />
        <Field
          label={t('Dashboard.AircraftState.ParkBrake')}
          value={t(state.parkBrakeOn ? 'Dashboard.AircraftState.On' : 'Dashboard.AircraftState.Off')}
          detail={t(state.parkBrakeOn ? 'Dashboard.AircraftState.Set' : 'Dashboard.AircraftState.Released')}
          tone={state.parkBrakeOn ? 'idle' : 'busy'}
        />
        {wheelChocks && (
          <Field
            label={t('Dashboard.AircraftState.Chocks')}
            value={t(state.chocksPlaced ? 'Dashboard.AircraftState.On' : 'Dashboard.AircraftState.Off')}
            detail={t(state.chocksPlaced ? 'Dashboard.AircraftState.Placed' : 'Dashboard.AircraftState.Removed')}
          />
        )}
        <Field
          label={t('Dashboard.AircraftState.Adirs')}
          value={adirsValue}
          detail={adirsDetail}
          tone={state.adirs === 'aligned' ? 'active' : 'idle'}
        />
      </FieldRow>
    </DashboardCard>
  );
};
