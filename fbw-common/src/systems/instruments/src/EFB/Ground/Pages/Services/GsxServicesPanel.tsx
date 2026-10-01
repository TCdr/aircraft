// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC } from 'react';
import { toast } from 'react-toastify';
import { t } from '../../../Localization/translation';
import { Toggle } from '../../../UtilComponents/Form/Toggle';
import { GsxRemoteState, GsxServiceId, GsxServiceLook, gsxRemote, gsxServiceLook } from './GsxRemote';

/** The GSX services with no aircraft service button, shown on the GSX panel */
const PANEL_SERVICES: GsxServiceId[] = [
  GsxServiceId.Deboarding,
  GsxServiceId.Boarding,
  GsxServiceId.Departure,
  GsxServiceId.DeIce,
  GsxServiceId.Water,
  GsxServiceId.Lavatory,
  GsxServiceId.Cleaning,
];

const LOOK_STYLES: Record<GsxServiceLook, string> = {
  disabled: 'border-theme-accent opacity-30 pointer-events-none',
  inactive: 'border-theme-accent text-theme-text hover:bg-theme-highlight hover:text-theme-secondary',
  called: 'border-amber-600 bg-amber-600 text-white hover:bg-amber-400',
  active: 'border-green-700 bg-green-700 text-white hover:bg-green-500',
  released: 'border-amber-600 bg-amber-600 text-white pointer-events-none',
};

/**
 * Requests a GSX service; GSX refuses it when it cannot serve it now (e.g. boarding before the doors are open)
 * @param service the service id
 * @param name the name of the service, for the message
 */
export async function triggerGsxService(service: GsxServiceId, name: string): Promise<void> {
  const { ok, error } = await gsxRemote.trigger(service);
  if (!ok) {
    toast.error(`${t('Ground.Services.Gsx.NotAccepted').replace('{service}', name)} (${error})`);
  }
}

interface GsxServicesPanelProps {
  /** The service buttons call GSX */
  linked: boolean;
  onLinkChange: (linked: boolean) => void;
  gsx: GsxRemoteState;
  className?: string;
}

/**
 * The link of the Services page to GSX: off, the flyPad manages the services (sim ground vehicles); on, the service
 * buttons request the GSX services through the GSX Remote API, and the services with no button are here.
 */
export const GsxServicesPanel: FC<GsxServicesPanelProps> = ({ linked, onLinkChange, gsx, className }) => {
  let status: string;
  if (!gsx.connected) {
    status = t('Ground.Services.Gsx.NotConnected');
  } else if (!gsx.gsxRunning) {
    status = t('Ground.Services.Gsx.NotRunning');
  } else {
    status = t('Ground.Services.Gsx.Connected');
  }
  const ready = linked && gsx.connected && gsx.gsxRunning;

  return (
    <div
      className={`flex flex-col space-y-2 rounded-xl border-2 border-theme-accent bg-theme-body px-4 py-2 ${className ?? ''}`}
    >
      <div className="flex flex-row items-center justify-between space-x-4">
        <span className="text-xl font-medium">{t('Ground.Services.Gsx.Link')}</span>
        <Toggle value={linked} onToggle={onLinkChange} />
      </div>
      {linked && <span className={ready ? 'text-utility-green' : 'text-utility-amber'}>{status}</span>}
      {ready && (
        <div className="grid grid-cols-2 gap-2">
          {PANEL_SERVICES.map((id) => {
            const service = gsx.services.find((s) => s.id === id);
            if (service === undefined) {
              return null;
            }
            return (
              <button
                key={id}
                type="button"
                className={`flex flex-col rounded-md border-2 px-2 py-1 text-left ${LOOK_STYLES[gsxServiceLook(service)]}`}
                onClick={() => triggerGsxService(id, service.displayName)}
              >
                <span>{service.displayName}</span>
                {service.progressText && <span className="text-sm">{service.progressText}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
