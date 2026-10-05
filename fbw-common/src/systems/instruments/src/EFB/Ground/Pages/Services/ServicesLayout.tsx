// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React, { FC, ReactNode } from 'react';
import { t } from '../../../Localization/translation';
import {
  M3ActionChip,
  M3Card,
  M3List,
  M3ListRow,
  M3Page,
  M3SectionHeader,
  M3Switch,
  M3Tone,
} from '../../../UtilComponents/Material/Material';
import { FuselagePlanform, PlanformDoor, PlanformTag } from './FuselagePlanform';
import { GsxRemoteState } from './GsxRemote';
import { GsxServicesPanel } from './GsxServicesPanel';

/** The look of a service button of the page (the ServiceButtonState of the aircraft pages, in their order) */
export type ServiceLook = 'hidden' | 'disabled' | 'inactive' | 'called' | 'active' | 'released';
export const SERVICE_LOOKS: ServiceLook[] = ['hidden', 'disabled', 'inactive', 'called', 'active', 'released'];

/** A row of the doors or the ground equipment list */
export interface ServiceRowSpec {
  key: string;
  name: string;
  icon: ReactNode;
  tone: M3Tone;
  status: string;
  statusTone?: M3Tone;
  trailing: ReactNode;
  progress?: number | null;
  disabled?: boolean;
}

/** The tone of a door for its state of opening */
export const doorTone = (open: number): M3Tone => (open >= 1 ? 'active' : open > 0 ? 'busy' : 'idle');

/** The status line of a door */
export const doorStatus = (open: number, detail?: string): string => {
  const base =
    open >= 1 ? t('Ground.Services.Open') : open > 0 ? t('Ground.Services.Moving') : t('Ground.Services.Closed');
  return detail ? `${base} · ${detail}` : base;
};

/** A door row: its switch toggles it */
export function doorRow(
  key: string,
  name: string,
  icon: ReactNode,
  open: number,
  look: ServiceLook,
  onToggle: () => void,
  detail?: string,
): ServiceRowSpec {
  const disabled = look === 'disabled' || look === 'hidden';
  return {
    key,
    name,
    icon,
    tone: doorTone(open),
    status: doorStatus(open, detail),
    trailing: <M3Switch value={open >= 0.5} onToggle={onToggle} disabled={disabled} aria-label={name} />,
    disabled,
  };
}

/**
 * A ground equipment row: its chip requests or releases the service; the status line is GSX's when the page is
 * linked to GSX, else the state of the sim service (or `status`, for rows that are not a sim service). `action` names
 * the request on the chip (default "Request").
 */
export function equipmentRow(
  key: string,
  name: string,
  icon: ReactNode,
  look: ServiceLook,
  onClick: () => void,
  options: {
    activeStatus?: string;
    gsxStatus?: string;
    status?: string;
    action?: string;
    progress?: number | null;
    detail?: string;
  } = {},
): ServiceRowSpec {
  const tone: M3Tone = look === 'active' ? 'active' : look === 'called' || look === 'released' ? 'busy' : 'idle';
  let status = options.gsxStatus || options.status || '';
  if (!status) {
    switch (look) {
      case 'active':
        status = options.activeStatus ?? t('Ground.Services.Connected');
        break;
      case 'called':
        status = t('Ground.Services.OnItsWay');
        break;
      case 'released':
        status = t('Ground.Services.Leaving');
        break;
      default:
        status = t('Ground.Services.NotRequested');
        break;
    }
  }
  if (options.detail) {
    status = `${status} · ${options.detail}`;
  }
  let action: string;
  switch (look) {
    case 'active':
      action = t('Ground.Services.Release');
      break;
    case 'called':
      action = t('Ground.Services.Called');
      break;
    case 'released':
      action = t('Ground.Services.Leaving');
      break;
    default:
      action = options.action ?? t('Ground.Services.Request');
      break;
  }
  const disabled = look === 'disabled' || look === 'hidden';
  return {
    key,
    name,
    icon,
    tone,
    status,
    trailing: (
      <M3ActionChip primary={look === 'inactive'} disabled={disabled || look === 'released'} onClick={onClick}>
        {action}
      </M3ActionChip>
    ),
    progress: options.progress,
    disabled,
  };
}

interface ServicesLayoutProps {
  /** The status chips of the title bar */
  chips: ReactNode;
  doors: ServiceRowSpec[];
  equipment: ServiceRowSpec[];
  /** The aircraft drawing */
  aircraft: string;
  variant: 'a380' | 'a320';
  planformDoors: PlanformDoor[];
  planformHolds: PlanformDoor[];
  planformTags: PlanformTag[];
  gsx: GsxRemoteState;
  gsxLinked: boolean;
  onGsxLinkChange: (linked: boolean) => void;
}

/**
 * The Services page: the doors and the ground equipment as scrolling lists on the left, the aircraft from above in
 * the middle, GSX on the right.
 */
export const ServicesLayout: FC<ServicesLayoutProps> = ({
  chips,
  doors,
  equipment,
  aircraft,
  variant,
  planformDoors,
  planformHolds,
  planformTags,
  gsx,
  gsxLinked,
  onGsxLinkChange,
}) => {
  const openDoors = doors.filter((d) => d.tone === 'active').length;
  const activeEquipment = equipment.filter((e) => e.tone === 'active').length;
  const rows = (specs: ServiceRowSpec[]) =>
    specs.map((row) => (
      <M3ListRow
        key={row.key}
        icon={row.icon}
        tone={row.tone}
        name={row.name}
        status={row.status}
        statusTone={row.statusTone}
        trailing={row.trailing}
        progress={row.progress}
        disabled={row.disabled}
      />
    ));

  return (
    <M3Page chips={chips}>
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <div className="flex h-full w-[400px] shrink-0 flex-col">
          <M3Card className="mb-4 shrink-0 pb-2" style={{ maxHeight: '45%' }}>
            <M3SectionHeader
              title={t('Ground.Services.Doors')}
              badge={`${openDoors} ${t('Ground.Services.Open').toLowerCase()} · ${doors.length}`}
            />
            <M3List>{rows(doors)}</M3List>
          </M3Card>
          <M3Card className="min-h-0 flex-1 pb-2">
            <M3SectionHeader
              title={t('Ground.Services.GroundEquipment')}
              badge={`${activeEquipment} ${t('Ground.Services.Active').toLowerCase()} · ${equipment.length}`}
            />
            <M3List>{rows(equipment)}</M3List>
          </M3Card>
        </div>

        <M3Card low className="relative mx-4 h-full min-w-0 flex-1 px-4 pb-4 pt-4">
          <div className="flex shrink-0 flex-row items-center">
            <span className="text-xs font-bold uppercase tracking-widest text-m3-muted">{aircraft}</span>
            <div className="grow" />
            <span className="text-xs text-m3-muted">{t('Ground.Services.PlanformHint')}</span>
          </div>
          <div className="min-h-0 flex-1">
            <FuselagePlanform variant={variant} doors={planformDoors} holds={planformHolds} tags={planformTags} />
          </div>
          <div className="flex shrink-0 flex-col pt-2 text-xs text-m3-muted">
            <span className="inline-flex items-center text-xs text-m3-muted">
              <span className="mr-2 h-2 w-2 rounded-full bg-m3-primary" />
              <span className="text-xs text-m3-muted">{t('Ground.Services.LegendActive')}</span>
            </span>
            <span className="mt-1 inline-flex items-center text-xs text-m3-muted">
              <span className="mr-2 h-2 w-2 rounded-full bg-m3-on-warn" />
              <span className="text-xs text-m3-muted">{t('Ground.Services.LegendBusy')}</span>
            </span>
            <span className="mt-1 inline-flex items-center text-xs text-m3-muted">
              <span className="mr-2 h-2 w-2 rounded-full border border-m3-outline-strong bg-m3-tile" />
              <span className="text-xs text-m3-muted">{t('Ground.Services.LegendIdle')}</span>
            </span>
          </div>
        </M3Card>

        <div className="flex h-full w-[340px] shrink-0 flex-col">
          <GsxServicesPanel linked={gsxLinked} onLinkChange={onGsxLinkChange} gsx={gsx} />
        </div>
      </div>
    </M3Page>
  );
};
