// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it } from 'vitest';
import { evaluatePseudoFwcExpression, expectCode, readSource } from './PseudoFwcSpecSource';

const source = readSource('PseudoFWC.ts');

const altitudeAlertInhibited = (conditions: {
  apFdTcasModeEngaged: boolean;
  tcasRaActive: boolean;
  onGround: boolean;
}) => evaluatePseudoFwcExpression(source, 'const groundOrTcasMode =', {}, conditions);

describe('the altitude alert C chord inhibition', () => {
  it('applies during a TCAS RA without the AP/FD TCAS mode', () => {
    expect(altitudeAlertInhibited({ apFdTcasModeEngaged: false, tcasRaActive: true, onGround: false })).toBe(true);
  });

  it('applies with the AP/FD TCAS mode and on the ground', () => {
    expect(altitudeAlertInhibited({ apFdTcasModeEngaged: true, tcasRaActive: false, onGround: false })).toBe(true);
    expect(altitudeAlertInhibited({ apFdTcasModeEngaged: false, tcasRaActive: false, onGround: true })).toBe(true);
  });

  it('does not apply without a TCAS RA, the AP/FD TCAS mode or the ground', () => {
    expect(altitudeAlertInhibited({ apFdTcasModeEngaged: false, tcasRaActive: false, onGround: false })).toBe(false);
  });

  it('reads the RA from the TCAS state', () => {
    expectCode(source, "SimVar.GetSimVarValue('L:A32NX_TCAS_STATE'");
  });
});
