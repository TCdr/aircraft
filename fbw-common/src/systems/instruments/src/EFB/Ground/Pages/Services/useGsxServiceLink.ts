// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useRef, useState } from 'react';
import { usePersistentNumberProperty } from '@flybywiresim/fbw-sdk-react';
import { toast } from 'react-toastify';
import {
  GSX_STUCK_MS,
  GsxServiceId,
  gsxDocked,
  gsxRefuelFuelKg,
  gsxRefuelProgress,
  gsxRequestable,
  gsxRemote,
  gsxServiceLook,
  gsxStuck,
  gsxTriggerHoldMs,
  useGsxRemote,
} from './GsxRemote';
import { gsxServiceStatus, triggerGsxService } from './GsxServicesPanel';
import { RefuelTimeLeft } from './refuelTimeLeft';
import { GSX_REACTION_TIMEOUT_MS, GsxMoveSigns, equipmentStillThere, useReleasePending } from './releasePending';
import type { ServiceLook } from './ServicesLayout';
import { t } from '../../../Localization/translation';

/** The GSX status line of a service row, and whether it may offer Request */
export interface GsxRowStatus {
  text: string;
  progress: number | null;
  requestable: boolean;
  /** The label of the release chip in place of Release: Retry after GSX ignored a release, Force while GSX is stuck */
  releaseAction?: string;
}

const NO_GSX_STATUS: GsxRowStatus = { text: '', progress: null, requestable: true };

/** How the service buttons of one aircraft's Services page map onto GSX */
export interface GsxButtonLinks<B extends number> {
  /** The GSX service of a service button (GSX Remote API service ids) */
  serviceOf: Partial<Record<B, GsxServiceId>>;
  /** The ground equipment rows a Release press leaves 'released' until the equipment is gone (releasePending) */
  releaseRowOf: Partial<Record<B, string>>;
  /** The jet bridge, stairs and GPU: GSX is idle on them once their operation is done, the sim knows whether they are connected */
  connectable: readonly B[];
  /** The baggage truck: hidden while linked, GSX loads the baggage with the boarding (GSX panel) */
  baggage: B;
  /** The GPU: still there while it gives external power */
  gpu: B;
}

/**
 * The GSX link of a Services page, the same for both aircraft: the service buttons request the GSX services (GSX
 * Remote API) instead of the sim ground vehicles, and show the GSX state of their service.
 *
 * The page works with its button states; this hook works with their looks (ServicesLayout SERVICE_LOOKS, one look per
 * state, named as the GSX looks), so each page passes `SERVICE_LOOKS[state]` as the sim look of a button.
 * @param links the page's buttons that GSX serves
 * @param gpuPowered external power is available (a released GPU is gone only once it no longer powers the aircraft)
 * @param refuelTargetKg the total fuel of the flyPad refuel while it runs (GSX fuel sync), else null
 */
export function useGsxServiceLink<B extends number>(
  links: GsxButtonLinks<B>,
  gpuPowered: boolean,
  refuelTargetKg: number | null = null,
) {
  const [gsxLinkSetting, setGsxLinkSetting] = usePersistentNumberProperty('GSX_SERVICES_LINK', 0);
  const [, setGsxFuelSync] = usePersistentNumberProperty('GSX_FUEL_SYNC', 0);
  const [, setGsxPayloadSync] = usePersistentNumberProperty('GSX_PAYLOAD_SYNC', 0);
  const gsxLinked = gsxLinkSetting === 1;
  const gsx = useGsxRemote();
  const gsxReady = gsxLinked && gsx.connected && gsx.gsxRunning;
  // The Release presses on the GPU, jet bridge and stairs, shown until the equipment is gone (releasePending)
  const releasePending = useReleasePending();

  // Once GSX closes its menu (e.g. a release question answered), a jet bridge or stairs it still has not moved
  // GSX_REACTION_TIMEOUT_MS later offers Retry: draw the page again then, as nothing GSX reports would
  const [, setRedraws] = useState(0);
  const redraw = () => setRedraws((redraws) => redraws + 1);
  useEffect(() => {
    if (!gsx.menuClosedAt) {
      return undefined;
    }
    const timer = setTimeout(redraw, GSX_REACTION_TIMEOUT_MS + 500);
    return () => clearTimeout(timer);
  }, [gsx.menuClosedAt]);

  const linkedService = (button: B) => (gsxReady ? links.serviceOf[button] : undefined);
  const serviceState = (id: GsxServiceId) => gsx.services.find((s) => s.id === id);

  // GSX reports nothing new while it is stuck on a jet bridge or stairs: draw the page again once the same phase has
  // lasted GSX_STUCK_MS, so that the row offers Force
  const nextStuckAt = Math.min(
    ...[GsxServiceId.OperateJetways, GsxServiceId.OperateStairs].map((id) => {
      const service = serviceState(id);
      return service?.state === 'performing' && service.phaseSince !== undefined
        ? service.phaseSince + GSX_STUCK_MS
        : Infinity;
    }),
  );
  useEffect(() => {
    if (!Number.isFinite(nextStuckAt)) {
      return undefined;
    }
    const timer = setTimeout(redraw, Math.max(0, nextStuckAt - Date.now()) + 500);
    return () => clearTimeout(timer);
  }, [nextStuckAt]);

  /** GSX is stuck on the jet bridge or stairs of a button (gsxStuck): its row offers Force */
  const stuck = (button: B): boolean => {
    const id = linkedService(button);
    return id !== undefined && gsxStuck(serviceState(id), Date.now());
  };

  const refuelTimeLeft = useRef(new RefuelTimeLeft());
  const refuelFuel = gsxRefuelFuelKg(serviceState(GsxServiceId.Refueling));
  useEffect(() => {
    if (refuelFuel === null) {
      refuelTimeLeft.current.reset();
    } else {
      refuelTimeLeft.current.update(Date.now(), refuelFuel.nowKg);
    }
  }, [refuelFuel?.nowKg]);

  const flypadRefuel = (id: GsxServiceId) => {
    if (id !== GsxServiceId.Refueling || refuelTargetKg === null || refuelFuel === null) {
      return null;
    }
    const progress = gsxRefuelProgress(serviceState(id), refuelTargetKg);
    return progress === null
      ? null
      : { progress, minutesLeft: refuelTimeLeft.current.minutesLeft(refuelFuel.nowKg, refuelTargetKg) };
  };

  // Linking also turns on the flyPad's GSX fuel and payload syncs (Settings > 3rd party), so the fuel and the
  // passengers follow the GSX services
  const setGsxLink = (linked: boolean) => {
    setGsxLinkSetting(linked ? 1 : 0);
    if (linked) {
      setGsxFuelSync(1);
      setGsxPayloadSync(1);
    }
  };

  /** The status line of a GSX-linked button, and whether it may offer Request (not on a service GSX does not let be triggered, e.g. completed) */
  const gsxStatus = (button: B): GsxRowStatus => {
    const id = linkedService(button);
    if (id === undefined) {
      return NO_GSX_STATUS;
    }
    const service = serviceState(id);
    return { ...gsxServiceStatus(service, null, flypadRefuel(id)), requestable: gsxRequestable(service) };
  };

  /** How a button looks: the GSX state of its service while linked, otherwise its sim look */
  const shownLook = (button: B, simLook: ServiceLook): ServiceLook => {
    if (!gsxReady) {
      return simLook;
    }
    if (button === links.baggage) {
      return 'hidden';
    }
    const id = links.serviceOf[button];
    if (id === undefined) {
      return simLook;
    }
    const look = gsxServiceLook(serviceState(id));
    // a Request that waits for GSX to be ready (GsxRemote.trigger) looks requested until GSX reports its own state
    if (look === 'inactive' && gsx.heldTriggers?.includes(id)) {
      return 'called';
    }
    // GSX is idle on the jet bridge, stairs and GPU once their operation is done: the sim knows whether they are connected
    const simShowsIt = simLook !== 'hidden' && simLook !== 'disabled';
    if (links.connectable.includes(button) && (look === 'inactive' || look === 'disabled') && simShowsIt) {
      return simLook;
    }
    return look;
  };

  /**
   * Sends a button press to GSX when its service is linked
   * @returns whether GSX handles the press (the page then does nothing else)
   */
  const requestService = (button: B): boolean => {
    const id = linkedService(button);
    if (id === undefined) {
      return false;
    }
    if (stuck(button)) {
      gsxRemote.completeStuckService(id).then((completed) => {
        if (!completed) {
          toast.error(t('Ground.Services.Gsx.ForceFailed'));
        }
      });
      return true;
    }
    triggerGsxService(id, serviceState(id)?.displayName ?? id).then((accepted) => {
      // a release GSX did not accept: the row shows again what GSX says
      const releaseRow = links.releaseRowOf[button];
      if (!accepted && releaseRow !== undefined) {
        releasePending.cancel(releaseRow);
      }
    });
    return true;
  };

  // Released ground equipment (releasePending): GSX keeps a released GPU, jet bridge or stairs 'performing' until its
  // crew has removed it, so the row shows 'released' (amber, "Leaving", chip disabled) from the Release press until
  // GSX or the sim no longer reports the equipment there (for the GPU: no external power either), or the timeout
  const equipmentThere = (button: B, simLook: ServiceLook) =>
    equipmentStillThere(shownLook(button, simLook), button === links.gpu && gpuPowered);

  // Whether GSX has started moving its jet bridge or stairs, and its menu (a release question): a release it has not
  // reacted to in time was ignored (releasePending), the row then offers Retry
  const gsxMoveSigns = (button: B): GsxMoveSigns => {
    const id = linkedService(button);
    return {
      stillDocked: id !== undefined && gsxDocked(serviceState(id)),
      menuShown: gsx.menuShown,
      menuClosedAt: gsx.menuClosedAt ?? 0,
    };
  };

  /** The look of an equipment row, 'released' while its release is on its way, unless GSX got stuck on it */
  const equipmentLook = (button: B, simLook: ServiceLook): ServiceLook => {
    const releaseRow = links.releaseRowOf[button];
    return releaseRow === undefined || stuck(button)
      ? shownLook(button, simLook)
      : releasePending.look(
          releaseRow,
          shownLook(button, simLook),
          equipmentThere(button, simLook),
          Date.now(),
          gsxMoveSigns(button),
        );
  };

  /**
   * The GSX status line of an equipment row, none while its release is shown on its way (the row reads "Leaving"), a
   * pointer to the GSX question while GSX asks to confirm the release, the Retry offer once GSX ignored it, and the
   * Force offer while GSX is stuck on it
   */
  const equipmentGsxStatus = (button: B, simLook: ServiceLook): GsxRowStatus => {
    if (stuck(button)) {
      return { ...gsxStatus(button), releaseAction: t('Ground.Services.Force') };
    }
    const releaseRow = links.releaseRowOf[button];
    if (releaseRow !== undefined) {
      const stillThere = equipmentThere(button, simLook);
      const now = Date.now();
      const gsxSigns = gsxMoveSigns(button);
      if (releasePending.asking(releaseRow, stillThere, now, gsxSigns)) {
        return { text: t('Ground.Services.Gsx.AsksQuestion'), progress: null, requestable: true };
      }
      if (releasePending.ignored(releaseRow, stillThere, now, gsxSigns)) {
        return {
          text: t('Ground.Services.Gsx.NoReaction'),
          progress: null,
          requestable: true,
          releaseAction: t('Ground.Services.Retry'),
        };
      }
    }
    return equipmentLook(button, simLook) !== shownLook(button, simLook) ? NO_GSX_STATUS : gsxStatus(button);
  };

  /**
   * A Release press is remembered (a Request or a Force is not), watched for GSX starting to move a docked jet bridge
   * or stairs from the moment the trigger is sent, after its hold if any; the page then handles the press as usual
   */
  const rememberRelease = (button: B, simLook: ServiceLook) => {
    const releaseRow = links.releaseRowOf[button];
    if (releaseRow !== undefined && !stuck(button)) {
      const id = linkedService(button);
      const now = Date.now();
      const holdMs = id === undefined ? 0 : gsxTriggerHoldMs(serviceState(id), now);
      releasePending.click(releaseRow, shownLook(button, simLook), now, gsxMoveSigns(button).stillDocked, holdMs);
    }
  };

  /** Forgets the releases that are over, so that a later Request and connection show normally (call it in an effect) */
  const settleReleases = (rows: readonly [B, ServiceLook][]) => {
    const now = Date.now();
    rows.forEach(([button, simLook]) => {
      const releaseRow = links.releaseRowOf[button];
      if (releaseRow !== undefined) {
        releasePending.settle(releaseRow, equipmentThere(button, simLook), now);
      }
    });
  };

  return {
    gsx,
    gsxLinked,
    setGsxLink,
    gsxStatus,
    shownLook,
    requestService,
    equipmentLook,
    equipmentGsxStatus,
    rememberRelease,
    settleReleases,
  };
}
