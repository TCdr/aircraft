// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { t } from '../../../Localization/translation';
import { Toggle } from '../../../UtilComponents/Form/Toggle';
import {
  GsxRemoteState,
  GsxService,
  GsxServiceId,
  GsxServiceLook,
  gsxRemote,
  gsxServiceLook,
  gsxServiceProgress,
} from './GsxRemote';

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

/** A GSX menu is shown on the panel once open this long: the menus service.trigger scripts open and close at once */
const MENU_SETTLE_MS = 1_500;

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

/**
 * The status line of a GSX service, shown under its button: what GSX does with it, and its progress
 * @param service the service, undefined when GSX does not list it
 * @returns the text (empty when idle) and the progress 0 to 1 (null without one)
 */
export function gsxServiceStatus(service: GsxService | undefined): { text: string; progress: number | null } {
  if (!service) {
    return { text: '', progress: null };
  }
  let text = '';
  if (service.waiting) {
    text = t('Ground.Services.Gsx.Status.Waiting');
  } else {
    switch (service.state) {
      case 'requested':
        text = t('Ground.Services.Gsx.Status.OnItsWay');
        break;
      case 'performing':
        text = service.stateText || t('Ground.Services.Gsx.Status.InProgress');
        break;
      case 'completing':
        text = t('Ground.Services.Gsx.Status.Leaving');
        break;
      case 'completed':
        text = t('Ground.Services.Gsx.Status.Done');
        break;
      default:
        break;
    }
  }
  if (service.progressText && (service.state === 'performing' || service.state === 'completing')) {
    text = text ? `${text} ${service.progressText}` : service.progressText;
  }
  return { text, progress: gsxServiceProgress(service) };
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
 * buttons request the GSX services through the GSX Remote API, the services with no button are here, and GSX is under
 * remote control (its menus and messages appear here instead of in the sim). The switch is greyed out until GSX is
 * found.
 */
export const GsxServicesPanel: FC<GsxServicesPanelProps> = ({ linked, onLinkChange, gsx, className }) => {
  const found = gsx.connected && gsx.gsxRunning;
  const ready = linked && found;

  // GSX under remote control while linked
  useEffect(() => {
    gsxRemote.setRemoteControl(ready);
  }, [ready]);

  // The GSX menu, once it stays open (a question GSX asks, e.g. the operator)
  const [menuSettled, setMenuSettled] = useState(false);
  useEffect(() => {
    if (!ready || !gsx.menuShown || gsx.menu.entries.length === 0) {
      setMenuSettled(false);
      return undefined;
    }
    const timer = setTimeout(() => setMenuSettled(true), MENU_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [ready, gsx.menuShown, gsx.menu]);

  let status: string;
  if (!gsx.connected) {
    status = t('Ground.Services.Gsx.NotConnected');
  } else if (!gsx.gsxRunning) {
    status = t('Ground.Services.Gsx.NotRunning');
  } else if (!linked) {
    status = t('Ground.Services.Gsx.Found');
  } else {
    status = t('Ground.Services.Gsx.Connected');
  }

  return (
    <div
      className={`flex flex-col space-y-2 rounded-xl border-2 border-theme-accent bg-theme-body px-4 py-2 ${className ?? ''}`}
    >
      <div className="flex flex-row items-center justify-between space-x-4">
        <span className="text-xl font-medium">{t('Ground.Services.Gsx.Link')}</span>
        <div className={found ? '' : 'opacity-40'}>
          <Toggle value={linked && found} onToggle={onLinkChange} disabled={!found} />
        </div>
      </div>
      <span className={ready ? 'text-utility-green' : found ? 'text-theme-unselected' : 'text-utility-amber'}>
        {status}
      </span>
      {ready && gsx.message.visible && gsx.message.text && (
        <span className="text-theme-highlight">{gsx.message.text}</span>
      )}
      {ready && menuSettled && (
        <div className="flex flex-col space-y-1 rounded-md border-2 border-theme-highlight p-2">
          <span className="font-medium">{gsx.menu.title}</span>
          {gsx.menu.entries.map((entry, index) => (
            <button
              key={`${index}-${entry}`}
              type="button"
              className={`rounded-md border-2 border-theme-accent px-2 py-1 text-left ${
                gsx.menu.disabled[index]
                  ? 'pointer-events-none opacity-30'
                  : 'hover:bg-theme-highlight hover:text-theme-secondary'
              }`}
              onClick={() => gsxRemote.pickMenu(index)}
            >
              {entry}
            </button>
          ))}
          <button
            type="button"
            className="self-end text-sm text-theme-unselected hover:text-theme-highlight"
            onClick={() => gsxRemote.closeMenu()}
          >
            {t('Ground.Services.Gsx.CloseMenu')}
          </button>
        </div>
      )}
      {ready && (
        <div className="grid grid-cols-2 gap-2">
          {PANEL_SERVICES.map((id) => {
            const service = gsx.services.find((s) => s.id === id);
            if (service === undefined) {
              return null;
            }
            const { text, progress } = gsxServiceStatus(service);
            return (
              <button
                key={id}
                type="button"
                className={`flex flex-col rounded-md border-2 px-2 py-1 text-left ${LOOK_STYLES[gsxServiceLook(service)]}`}
                onClick={() => triggerGsxService(id, service.displayName)}
              >
                <span>{service.displayName}</span>
                {text && <span className="text-sm">{text}</span>}
                {progress !== null && (
                  <div className="mt-1 h-1.5 w-full rounded bg-black/30">
                    <div className="h-1.5 rounded bg-current" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
