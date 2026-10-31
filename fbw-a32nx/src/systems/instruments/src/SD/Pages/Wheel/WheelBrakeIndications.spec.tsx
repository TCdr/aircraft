// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderSdPage, RenderedSdPage, SimVarValues, visibleTexts } from '../../Common/SdPageSpecHarness';
import { WheelBrakeInputs, wheelBrakeIndications } from './WheelBrakeIndications';
import { WheelPage } from './Wheel';

/** Everything working: green and yellow pressure, both BSCU channels, A/SKID & N/W STRG sw ON */
const NORMAL: WheelBrakeInputs = {
  bscu1Lost: false,
  bscu2Lost: false,
  alternateBrakingLost: false,
  normalBrakingFailed: false,
  autobrakeFailed: false,
  noseWheelSteeringFailed: false,
  antiSkidSwitchOff: false,
  greenLowPressure: false,
  yellowLowPressure: false,
};

const withInputs = (changes: Partial<WheelBrakeInputs>) => wheelBrakeIndications({ ...NORMAL, ...changes });

/* WHEEL page brake and steering legends */
describe('SD WHEEL brake and steering legends', () => {
  it('shows no legend when everything works', () => {
    expect(withInputs({})).toEqual({
      noseWheelSteering: false,
      antiSkid: null,
      failedBscuChannels: [false, false],
      normalBraking: null,
      alternateBraking: null,
      accumulatorOnly: false,
    });
  });

  describe('N/W STEERING', () => {
    it('shows on a nose wheel steering failure, with the anti skid switch ON', () => {
      expect(withInputs({ noseWheelSteeringFailed: true }).noseWheelSteering).toBe(true);
    });

    it('shows when both BSCU channels are lost', () => {
      expect(withInputs({ bscu1Lost: true, bscu2Lost: true }).noseWheelSteering).toBe(true);
    });

    it('shows on a yellow low pressure', () => {
      expect(withInputs({ yellowLowPressure: true }).noseWheelSteering).toBe(true);
    });

    it('shows with the A/SKID & N/W STRG switch OFF', () => {
      expect(withInputs({ antiSkidSwitchOff: true }).noseWheelSteering).toBe(true);
    });

    it('does not show with one BSCU channel lost', () => {
      expect(withInputs({ bscu1Lost: true }).noseWheelSteering).toBe(false);
    });
  });

  describe('ANTI SKID', () => {
    it('is amber with both BSCU channels lost, numbers 1 and 2 amber', () => {
      const legends = withInputs({ bscu1Lost: true, bscu2Lost: true });
      expect(legends.antiSkid).toBe('Amber');
      expect(legends.failedBscuChannels).toEqual([true, true]);
    });

    it('is amber with the A/SKID & N/W STRG switch OFF, no channel number', () => {
      const legends = withInputs({ antiSkidSwitchOff: true });
      expect(legends.antiSkid).toBe('Amber');
      expect(legends.failedBscuChannels).toEqual([false, false]);
    });

    it('is amber on a normal braking loss with a yellow low pressure (accumulator only)', () => {
      expect(withInputs({ greenLowPressure: true, yellowLowPressure: true }).antiSkid).toBe('Amber');
      expect(withInputs({ normalBrakingFailed: true, yellowLowPressure: true }).antiSkid).toBe('Amber');
    });

    it('is green on an autobrake failure with antiskid available', () => {
      expect(withInputs({ autobrakeFailed: true }).antiSkid).toBe('Green');
    });

    it('is green on a normal braking failure with antiskid available (alternate braking with antiskid)', () => {
      expect(withInputs({ normalBrakingFailed: true }).antiSkid).toBe('Green');
      expect(withInputs({ greenLowPressure: true }).antiSkid).toBe('Green');
    });

    it('is green on an alternate braking failure', () => {
      expect(withInputs({ alternateBrakingLost: true }).antiSkid).toBe('Green');
    });

    it('does not show for one BSCU channel lost alone', () => {
      expect(withInputs({ bscu2Lost: true }).antiSkid).toBeNull();
    });

    it('shows only the failed channel number in amber', () => {
      const legends = withInputs({ bscu2Lost: true, autobrakeFailed: true });
      expect(legends.antiSkid).toBe('Green');
      expect(legends.failedBscuChannels).toEqual([false, true]);
    });
  });

  describe('NORM BRK', () => {
    it('is amber on a green low pressure', () => {
      expect(withInputs({ greenLowPressure: true }).normalBraking).toBe('Amber');
    });

    it('is amber on a normal braking failure', () => {
      expect(withInputs({ normalBrakingFailed: true }).normalBraking).toBe('Amber');
    });

    it('is amber with both BSCU channels lost or the antiskid switched off', () => {
      expect(withInputs({ bscu1Lost: true, bscu2Lost: true }).normalBraking).toBe('Amber');
      expect(withInputs({ antiSkidSwitchOff: true }).normalBraking).toBe('Amber');
    });

    it('is green on an autobrake or alternate braking failure with normal braking available', () => {
      expect(withInputs({ autobrakeFailed: true }).normalBraking).toBe('Green');
      expect(withInputs({ alternateBrakingLost: true }).normalBraking).toBe('Green');
    });
  });

  describe('ALTN BRK', () => {
    it('is green in alternate mode (green low pressure), no ACCU ONLY with yellow pressure', () => {
      const legends = withInputs({ greenLowPressure: true });
      expect(legends.alternateBraking).toBe('Green');
      expect(legends.accumulatorOnly).toBe(false);
    });

    it('is green with ACCU ONLY when the yellow system is in low pressure too', () => {
      const legends = withInputs({ greenLowPressure: true, yellowLowPressure: true });
      expect(legends.alternateBraking).toBe('Green');
      expect(legends.accumulatorOnly).toBe(true);
    });

    it('is green on a normal braking or autobrake failure', () => {
      expect(withInputs({ normalBrakingFailed: true }).alternateBraking).toBe('Green');
      expect(withInputs({ autobrakeFailed: true }).alternateBraking).toBe('Green');
    });

    it('is amber when alternate braking is lost, without ACCU ONLY', () => {
      const legends = withInputs({ alternateBrakingLost: true, greenLowPressure: true, yellowLowPressure: true });
      expect(legends.alternateBraking).toBe('Amber');
      expect(legends.accumulatorOnly).toBe(false);
    });
  });
});

describe('SD WHEEL page brake and steering legends', () => {
  let page: RenderedSdPage;
  afterEach(() => page?.unmount());

  /** Both hydraulic systems pressurised and the A/SKID & N/W STRG sw ON: the page state of the NORMAL inputs */
  const NORMAL_SIM_VARS: SimVarValues = {
    'L:A32NX_HYD_GREEN_SYSTEM_1_SECTION_PRESSURE_SWITCH': 1,
    'L:A32NX_HYD_YELLOW_SYSTEM_1_SECTION_PRESSURE_SWITCH': 1,
    'ANTISKID BRAKES ACTIVE': 1,
  };

  /** The legend texts of the page with their colour class, null when not shown. */
  const legendColours = () => {
    const colourOf = (text: string): string | null => {
      const element = visibleTexts(page, text)[0];
      if (!element) {
        return null;
      }
      return element.classList.contains('Amber') ? 'Amber' : 'Green';
    };
    return {
      noseWheelSteering: colourOf('N/W STEERING'),
      antiSkid: colourOf('ANTI SKID'),
      normalBraking: colourOf('NORM BRK'),
      alternateBraking: colourOf('ALTN BRK'),
      // the failed BSCU channel numbers beside ANTI SKID
      failedBscuChannels: ['171', '200'].map((x) => page.container.querySelector(`text[x="${x}"]`) !== null),
    };
  };

  it('shows no legend when everything works', () => {
    page = renderSdPage(<WheelPage />, NORMAL_SIM_VARS);

    expect(legendColours()).toEqual({
      noseWheelSteering: null,
      antiSkid: null,
      normalBraking: null,
      alternateBraking: null,
      failedBscuChannels: [false, false],
    });
  });

  // Each brake fault L:var of the a320_systems brake model, the hydraulic pressure switches and the A/SKID & N/W STRG sw
  // have to reach the matching input of wheelBrakeIndications
  const wiredInputs: [string, SimVarValues, Partial<WheelBrakeInputs>][] = [
    // one lost BSCU channel shows only beside ANTI SKID, which another failure brings up
    [
      'BSCU 1 fault with an alternate braking fault',
      { 'L:A32NX_BRAKES_BSCU_1_FAULT': 1, 'L:A32NX_BRAKES_ALTN_BRK_FAULT': 1 },
      { bscu1Lost: true, alternateBrakingLost: true },
    ],
    [
      'BSCU 2 fault with an alternate braking fault',
      { 'L:A32NX_BRAKES_BSCU_2_FAULT': 1, 'L:A32NX_BRAKES_ALTN_BRK_FAULT': 1 },
      { bscu2Lost: true, alternateBrakingLost: true },
    ],
    [
      'both BSCU channels faulted',
      { 'L:A32NX_BRAKES_BSCU_1_FAULT': 1, 'L:A32NX_BRAKES_BSCU_2_FAULT': 1 },
      { bscu1Lost: true, bscu2Lost: true },
    ],
    ['alternate braking fault', { 'L:A32NX_BRAKES_ALTN_BRK_FAULT': 1 }, { alternateBrakingLost: true }],
    ['normal braking fault', { 'L:A32NX_BRAKES_NORM_BRK_FAULT': 1 }, { normalBrakingFailed: true }],
    ['nose wheel steering fault', { 'L:A32NX_BRAKES_NW_STRG_FAULT': 1 }, { noseWheelSteeringFailed: true }],
    ['A/SKID & N/W STRG sw OFF', { 'ANTISKID BRAKES ACTIVE': 0 }, { antiSkidSwitchOff: true }],
    ['green low pressure', { 'L:A32NX_HYD_GREEN_SYSTEM_1_SECTION_PRESSURE_SWITCH': 0 }, { greenLowPressure: true }],
    ['yellow low pressure', { 'L:A32NX_HYD_YELLOW_SYSTEM_1_SECTION_PRESSURE_SWITCH': 0 }, { yellowLowPressure: true }],
  ];

  it.each(wiredInputs)('draws the legends of the %s', (_name, simVars, inputs) => {
    const expected = withInputs(inputs);
    // a case that changes no legend would prove no wiring
    expect(expected).not.toEqual(withInputs({}));

    page = renderSdPage(<WheelPage />, { ...NORMAL_SIM_VARS, ...simVars });

    expect(legendColours()).toEqual({
      noseWheelSteering: expected.noseWheelSteering ? 'Amber' : null,
      antiSkid: expected.antiSkid,
      normalBraking: expected.normalBraking,
      alternateBraking: expected.alternateBraking,
      failedBscuChannels: expected.failedBscuChannels,
    });
  });
});
