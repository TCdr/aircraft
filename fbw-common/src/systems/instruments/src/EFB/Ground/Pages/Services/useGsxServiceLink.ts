// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { useEffect, useRef } from 'react';
import { usePersistentNumberProperty } from '@flybywiresim/fbw-sdk-react';
import {
  GsxServiceId,
  gsxRefuelFuelKg,
  gsxRefuelProgress,
  gsxRequestable,
  gsxServiceLook,
  useGsxRemote,
} from './GsxRemote';
import { gsxServiceStatus, triggerGsxService } from './GsxServicesPanel';
import { RefuelTimeLeft } from './refuelTimeLeft';
import { equipmentStillThere, useReleasePending } from './releasePending';
import type { ServiceLook } from './ServicesLayout';

/** The GSX status line of a service row, and whether it may offer Request */
export interface GsxRowStatus {
  text: string;
  progress: number | null;
  requestable: boolean;
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

  const linkedService = (button: B) => (gsxReady ? links.serviceOf[button] : undefined);
  const serviceState = (id: GsxServiceId) => gsx.services.find((s) => s.id === id);

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

  /** The look of an equipment row, 'released' while its release is on its way */
  const equipmentLook = (button: B, simLook: ServiceLook): ServiceLook => {
    const releaseRow = links.releaseRowOf[button];
    return releaseRow === undefined
      ? shownLook(button, simLook)
      : releasePending.look(releaseRow, shownLook(button, simLook), equipmentThere(button, simLook), Date.now());
  };

  /** The GSX status line of an equipment row, none while its release is shown on its way (the row reads "Leaving") */
  const equipmentGsxStatus = (button: B, simLook: ServiceLook): GsxRowStatus =>
    equipmentLook(button, simLook) !== shownLook(button, simLook) ? NO_GSX_STATUS : gsxStatus(button);

  /** A Release press is remembered (a Request is not); the page then handles the press as usual */
  const rememberRelease = (button: B, simLook: ServiceLook) => {
    const releaseRow = links.releaseRowOf[button];
    if (releaseRow !== undefined) {
      releasePending.click(releaseRow, shownLook(button, simLook), Date.now());
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
