// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { CheckLg } from 'react-bootstrap-icons';
import { useSimVar } from '@flybywiresim/fbw-sdk-react';
import { t } from '../../../Localization/translation';
import {
  M3ActionChip,
  M3Banner,
  M3Card,
  M3Progress,
  M3SectionHeader,
  M3Switch,
  M3Tone,
  M3_STATUS_TONES,
} from '../../../UtilComponents/Material/Material';
import {
  GsxRemoteState,
  GsxService,
  GsxServiceId,
  GsxServiceLook,
  gsxRemote,
  gsxServiceLook,
  gsxServiceProgress,
} from './GsxRemote';

/** The turnaround steps of a departure (at the origin) and of an arrival (after landing), in order */
const DEPARTURE_TURNAROUND: GsxServiceId[] = [GsxServiceId.Catering, GsxServiceId.Boarding, GsxServiceId.Departure];
const ARRIVAL_TURNAROUND: GsxServiceId[] = [GsxServiceId.Deboarding, GsxServiceId.Catering];

/** The FMGC flight phase after landing (FmgcFlightPhase.Done) */
const FLIGHT_PHASE_DONE = 7;

/** The other GSX services, as chips */
const EXTRA_SERVICES: GsxServiceId[] = [
  GsxServiceId.DeIce,
  GsxServiceId.Water,
  GsxServiceId.Lavatory,
  GsxServiceId.Cleaning,
];

/** A GSX menu is shown on the panel once open this long: the menus service.trigger scripts open and close at once */
const MENU_SETTLE_MS = 1_500;

const LOOK_TONES: Record<GsxServiceLook, M3Tone> = {
  disabled: 'idle',
  inactive: 'idle',
  called: 'busy',
  active: 'active',
  released: 'busy',
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

/** The tone of a GSX service for the kit */
export function gsxServiceTone(service: GsxService | undefined): M3Tone {
  return LOOK_TONES[gsxServiceLook(service)];
}

interface GsxServicesPanelProps {
  /** The service buttons call GSX */
  linked: boolean;
  onLinkChange: (linked: boolean) => void;
  gsx: GsxRemoteState;
  className?: string;
}

/** A step of the turnaround timeline */
const TurnaroundStep: FC<{ service: GsxService | undefined; last: boolean }> = ({ service, last }) => {
  if (!service) {
    return null;
  }
  const tone = gsxServiceTone(service);
  const { text, progress } = gsxServiceStatus(service);
  const done = service.state === 'completed';
  const look = gsxServiceLook(service);
  let action: string | null = null;
  if (look === 'inactive') {
    action = t('Ground.Services.Request');
  } else if (look === 'active' && service.canTrigger) {
    action = t('Ground.Services.Stop');
  }
  return (
    <div className={`flex flex-col ${last ? '' : 'mb-3'}`}>
      <div className="flex flex-row items-start">
        <div className="mr-3 flex shrink-0 flex-col items-center">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              done
                ? 'bg-m3-primary text-m3-on-primary'
                : tone === 'busy' || tone === 'active'
                  ? 'border-2 border-m3-on-warn bg-m3-warn-container'
                  : 'border-2 border-m3-outline-strong'
            }`}
          >
            {done && <CheckLg size={14} />}
          </span>
          {!last && <span className="mt-1 h-3 w-0.5 bg-m3-outline" />}
        </div>
        <div className="flex min-w-0 grow flex-col">
          <span className="text-base font-semibold leading-tight">{service.displayName}</span>
          <span className={`text-xs leading-tight ${M3_STATUS_TONES[done ? 'idle' : tone]}`}>
            {text || t('Ground.Services.NotRequested')}
          </span>
        </div>
        {action && (
          <M3ActionChip
            className="ml-3"
            primary={look === 'inactive'}
            onClick={() => triggerGsxService(service.id as GsxServiceId, service.displayName)}
          >
            {action}
          </M3ActionChip>
        )}
      </div>
      {progress !== null && <M3Progress value={progress} tone={tone} className="ml-9 mt-2 w-auto" />}
    </div>
  );
};

/**
 * The GSX card of the Services page: the link switch (greyed out until GSX is found), the turnaround timeline of the
 * departure (catering, boarding, pushback) or of the arrival (deboarding, catering), the other GSX services as chips,
 * and, with GSX under remote control, its questions and messages.
 */
export const GsxServicesPanel: FC<GsxServicesPanelProps> = ({ linked, onLinkChange, gsx, className }) => {
  const found = gsx.connected && gsx.gsxRunning;
  const ready = linked && found;
  const [flightPhase] = useSimVar('L:A32NX_FMGC_FLIGHT_PHASE', 'enum', 1000);
  const turnaround = flightPhase === FLIGHT_PHASE_DONE ? ARRIVAL_TURNAROUND : DEPARTURE_TURNAROUND;

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
  let statusTone: M3Tone;
  if (!gsx.connected) {
    status = t('Ground.Services.Gsx.NotConnected');
    statusTone = 'warn';
  } else if (!gsx.gsxRunning) {
    status = t('Ground.Services.Gsx.NotRunning');
    statusTone = 'busy';
  } else if (!linked) {
    status = t('Ground.Services.Gsx.Found');
    statusTone = 'idle';
  } else {
    status = t('Ground.Services.Gsx.Connected');
    statusTone = 'active';
  }
  const service = (id: GsxServiceId) => gsx.services.find((s) => s.id === id);

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className ?? ''}`}>
      <M3Card className="mb-4 shrink-0 px-4 py-4">
        <div className="flex flex-row items-center">
          <div className="mr-3 flex min-w-0 grow flex-col">
            <span className="text-base font-bold">{t('Ground.Services.Gsx.Link')}</span>
            <span className={`text-xs leading-tight ${M3_STATUS_TONES[statusTone]}`}>{status}</span>
          </div>
          <M3Switch value={linked && found} onToggle={onLinkChange} disabled={!found} aria-label="GSX services" />
        </div>
      </M3Card>

      {ready && (
        <M3Card className="min-h-0 flex-1">
          <M3SectionHeader title={t('Ground.Services.Turnaround')} />
          <div className="scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4">
            {turnaround.map((id, index) => (
              <TurnaroundStep key={id} service={service(id)} last={index === turnaround.length - 1} />
            ))}
            <div className="-m-1 mt-2 flex flex-row flex-wrap">
              {EXTRA_SERVICES.map((id) => {
                const s = service(id);
                if (!s) {
                  return null;
                }
                const look = gsxServiceLook(s);
                return (
                  <M3ActionChip
                    key={id}
                    className="m-1"
                    primary={look === 'active' || look === 'called'}
                    disabled={look === 'disabled' || look === 'released'}
                    onClick={() => triggerGsxService(id, s.displayName)}
                  >
                    {s.displayName}
                    {s.progressText ? ` ${s.progressText}` : ''}
                  </M3ActionChip>
                );
              })}
            </div>
            <div className="grow" />
            {gsx.message.visible && gsx.message.text && (
              <M3Banner tone="active" className="mt-4">
                {gsx.message.text}
              </M3Banner>
            )}
            {menuSettled && (
              <div className="mt-4 flex flex-col rounded-xl border border-m3-tonal bg-m3-card-low p-3">
                <span className="text-xs font-bold uppercase tracking-widest text-m3-on-primary-container">
                  {t('Ground.Services.Gsx.Asks')}
                </span>
                <span className="mt-1 text-sm font-semibold">{gsx.menu.title}</span>
                <div className="-m-1 mt-1 flex flex-row flex-wrap">
                  {gsx.menu.entries.map((entry, index) => (
                    <M3ActionChip
                      key={`${index}-${entry}`}
                      className="m-1"
                      primary={index === 0}
                      disabled={gsx.menu.disabled[index]}
                      onClick={() => gsxRemote.pickMenu(index)}
                    >
                      {entry}
                    </M3ActionChip>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-2 self-end bg-transparent text-xs text-m3-muted hover:text-m3-on-primary-container"
                  onClick={() => gsxRemote.closeMenu()}
                >
                  {t('Ground.Services.Gsx.CloseMenu')}
                </button>
              </div>
            )}
          </div>
        </M3Card>
      )}
    </div>
  );
};
