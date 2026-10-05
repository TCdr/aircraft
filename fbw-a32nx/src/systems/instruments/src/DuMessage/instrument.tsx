// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FSComponent } from '@microsoft/msfs-sdk';

import '../MsfsAvionicsCommon/common.scss';
import './style.scss';

/**
 * The "ECAM ON ND" message picture (A320 FCOM DSC-31-30, l.46862-46863): the lower ECAM DU shows it while the ECAM/ND
 * XFR selector puts the SD on an ND. A static picture on its own texture (DU_MESSAGE): the cockpit model shows it on the
 * lower ECAM DU glass while the DMC logic says so (L:A32NX_EIS_DU_LOWER_ECAM_PICTURE, see
 * shared/src/DisplayReconfiguration.ts). Design choice: drawn like the other DU messages (SELF TEST IN PROGRESS), the
 * FCOM gives no colour.
 */
// eslint-disable-next-line camelcase
class A32NX_DuMessage extends BaseInstrument {
  get templateID(): string {
    return 'A32NX_DuMessage';
  }

  public connectedCallback(): void {
    super.connectedCallback();

    const mount = document.getElementById('DuMessage_CONTENT');
    if (!mount) {
      return;
    }
    FSComponent.render(
      <svg class="SelfTest" viewBox="0 0 600 600">
        <rect class="SelfTestBackground" x="0" y="0" width="100%" height="100%" />
        <text class="SelfTestText" x="50%" y="50%">
          ECAM ON ND
        </text>
      </svg>,
      mount,
    );

    // Remove "instrument didn't load" text
    mount.querySelector(':scope > h1')?.remove();
  }
}

registerInstrument('a32nx-dumessage', A32NX_DuMessage);
