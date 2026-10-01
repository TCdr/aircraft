// @ts-strict-ignore
// Copyright (c) 2023-2024 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { t } from '@flybywiresim/flypad';
import { CargoBar } from '../PayloadElements';

interface CargoStationInfo {
  name: string;
  weight: number;
  simVar: string;
  stationIndex: number;
  progressBarWidth: number;
  position: number;
}
interface SeatMapProps {
  cargo: number[];
  cargoDesired: number[];
  cargoMap: CargoStationInfo[];
  onClickCargo: (cargoStation: number, event: any) => void;
}

enum CargoStation {
  FwdBag,
  AftBag,
  AftBulk,
}

/** The holds under the cabin drawing: the forward hold under the forward fuselage, the aft holds under the aft */
export const CargoWidget: React.FC<SeatMapProps> = ({ cargo, cargoDesired, cargoMap, onClickCargo }) => (
  <>
    <div style={{ width: '14%' }} />
    <CargoBar
      cargoId={CargoStation.FwdBag}
      label={t('Ground.Payload.Holds.Fwd')}
      cargo={cargo}
      cargoDesired={cargoDesired}
      cargoMap={cargoMap}
      onClickCargo={onClickCargo}
    />
    <div className="grow" />
    <CargoBar
      cargoId={CargoStation.AftBag}
      label={t('Ground.Payload.Holds.Aft')}
      cargo={cargo}
      cargoDesired={cargoDesired}
      cargoMap={cargoMap}
      onClickCargo={onClickCargo}
    />
    <CargoBar
      className="ml-6"
      cargoId={CargoStation.AftBulk}
      label={t('Ground.Payload.Holds.Bulk')}
      cargo={cargo}
      cargoDesired={cargoDesired}
      cargoMap={cargoMap}
      onClickCargo={onClickCargo}
    />
    <div style={{ width: '14%' }} />
  </>
);
