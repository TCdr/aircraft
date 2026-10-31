// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  wingTankLowLevelLines,
  WingTankLowLevelInputs,
  wingTankLowLevelStatus,
  wingTanksLowLevelLines,
  WingTanksLowLevelInputs,
} from './WingTankLowLevel';
import { formatEwdMessages } from '../../../../shared/src/EwdMessages';
import { formatStatusPage } from '../../../../shared/src/StatusMessages';
import { installFwcSimVarMocks, runFwc } from '../PseudoFwcTestBed';
import { failureItem, isAlertTriggered, shownText, startCruiseFwc } from '../FwcAlertProbe';

// Building the whole PseudoFWC takes a few seconds in the dev-env container
vi.setConfig({ testTimeout: 60_000 });

const KG_PER_GALLON = 3;
const FULL_WING_TANK_GALLONS = 1000;

let simvars: Map<string, number>;

beforeEach(() => {
  ({ simvars } = installFwcSimVarMocks());
});

const inputs: WingTankLowLevelInputs = {
  modeSelMan: false,
  centreTankEmpty: false,
  crossFeedOn: false,
  pump1On: true,
  pump2On: true,
};

const text = (prefix: string, lines: (number | null)[]) =>
  formatEwdMessages(
    lines
      .filter((line): line is number => line !== null)
      .map((line) => `${prefix}${(line + 1).toString().padStart(2, '0')}`),
  ).join(' | ');

/* FUEL L (R) WING TK LO LVL: FUEL MODE SEL MAN only with fuel in the centre tank. */
describe('FUEL L(R) WING TK LO LVL lines', () => {
  it.each(['2800130', '2800140'])('%s: FUEL MODE SEL MAN with fuel in the centre tank', (prefix) => {
    expect(text(prefix, wingTankLowLevelLines(inputs))).toContain('-FUEL MODE SEL......MAN');
  });

  it.each(['2800130', '2800140'])('%s: no FUEL MODE SEL line with an empty centre tank', (prefix) => {
    const lines = text(prefix, wingTankLowLevelLines({ ...inputs, centreTankEmpty: true }));
    expect(lines).not.toContain('MODE SEL');
    expect(lines).toContain('-FUEL X FEED.........ON');
  });

  it('no FUEL MODE SEL line once it is at MAN', () => {
    expect(text('2800130', wingTankLowLevelLines({ ...inputs, modeSelMan: true }))).not.toContain('MODE SEL');
  });

  it('hides the done actions', () => {
    const lines = text(
      '2800130',
      wingTankLowLevelLines({ ...inputs, crossFeedOn: true, pump1On: false, pump2On: false }),
    );
    expect(lines).not.toContain('X FEED');
    expect(lines).not.toContain('TK PUMP');
  });
});

/* FUEL L (R) WING TK LO LVL STATUS: INOP SYS TK PUMPS; with fuel in the centre tank: CTR TK FEED: MAN ONLY. */
describe('FUEL L(R) WING TK LO LVL STATUS', () => {
  it('INOP SYS L TK PUMPS and CTR TK FEED: MAN ONLY with fuel in the centre tank', () => {
    const status = wingTankLowLevelStatus('L', false);
    const page = formatStatusPage(status.info, status.inopSys);
    expect(page.left).toBe('\x1b<3mCTR TK FEED: MAN ONLY');
    expect(page.right).toContain('\x1b<4mL TK PUMPS');
  });

  it('no CTR TK FEED line with an empty centre tank; R side gives R TK PUMPS', () => {
    const status = wingTankLowLevelStatus('R', true);
    const page = formatStatusPage(status.info, status.inopSys);
    expect(page.left).toBe('');
    expect(page.right).toContain('\x1b<4mR TK PUMPS');
  });

  it.each([
    ['2800130', 'L', '2800140', 'LEFT'],
    ['2800140', 'R', '2800130', 'RIGHT'],
  ] as const)('the real FWC gives alert %s of the %s wing its STATUS', (key, side, otherKey, tank) => {
    const { fwc } = startCruiseFwc(simvars, () => {
      simvars.set('FUEL WEIGHT PER GALLON', KG_PER_GALLON);
      simvars.set('FUEL TANK LEFT MAIN QUANTITY', FULL_WING_TANK_GALLONS);
      simvars.set('FUEL TANK RIGHT MAIN QUANTITY', FULL_WING_TANK_GALLONS);
      simvars.set('FUEL TANK CENTER QUANTITY', FULL_WING_TANK_GALLONS);
      simvars.set(`FUEL TANK ${tank} MAIN QUANTITY`, 0);
    });
    runFwc(fwc, 31);
    expect(isAlertTriggered(fwc, key)).toBe(true);
    expect(isAlertTriggered(fwc, otherKey)).toBe(false);
    const item = failureItem(fwc, key);
    expect(item.inopSys?.()).toEqual(wingTankLowLevelStatus(side, false).inopSys);
    expect(item.statusInfo?.()).toEqual(wingTankLowLevelStatus(side, false).info);

    // an empty centre tank takes the CTR TK FEED line away
    simvars.set('FUEL TANK CENTER QUANTITY', 0);
    runFwc(fwc, 1);
    expect(item.statusInfo?.()).toEqual(wingTankLowLevelStatus(side, true).info);
  });
});

/* FUEL L + R WING TK LO LVL, jet pump variant: LAND ASAP (amber), FUEL MODE SEL MAN (with fuel in the centre tank),
   ALL TK PUMPS ON, CTR TK L+R XFR ON, IF NO FUEL LEAK: FUEL X FEED ON, IF GRVTY FEED: FUEL X FEED OFF. */
describe('FUEL L+R WING TK LO LVL lines', () => {
  const lrInputs: WingTanksLowLevelInputs = {
    modeSelMan: false,
    centreTankEmpty: false,
    leftPump1On: true,
    leftPump2On: true,
    rightPump1On: true,
    rightPump2On: true,
    centreLeftTransferOn: false,
    centreRightTransferOn: false,
  };

  it('asks for MODE SEL MAN and CTR TK L+R XFR ON, never for the CTR TK PUMPs of the other variant', () => {
    const lines = text('2800145', wingTanksLowLevelLines(lrInputs));
    expect(lines).toContain('-FUEL MODE SEL......MAN');
    expect(lines).toContain('-CTR TK L XFR........ON');
    expect(lines).toContain('-CTR TK R XFR........ON');
    expect(lines).not.toContain('CTR TK PUMP');
    expect(lines).toContain('-FUEL X FEED.........ON');
    expect(lines).toContain('-FUEL X FEED........OFF');
  });

  it('no MODE SEL line with an empty centre tank or once at MAN', () => {
    expect(text('2800145', wingTanksLowLevelLines({ ...lrInputs, centreTankEmpty: true }))).not.toContain('MODE SEL');
    expect(text('2800145', wingTanksLowLevelLines({ ...lrInputs, modeSelMan: true }))).not.toContain('MODE SEL');
  });

  it('drives the L and R transfer lines on their own pb-sw', () => {
    const lines = text('2800145', wingTanksLowLevelLines({ ...lrInputs, centreLeftTransferOn: true }));
    expect(lines).not.toContain('CTR TK L XFR');
    expect(lines).toContain('-CTR TK R XFR........ON');
  });

  it('asks for the wing tank pumps that are off only', () => {
    const lines = text('2800145', wingTanksLowLevelLines({ ...lrInputs, leftPump2On: false }));
    expect(lines).toContain('-L TK PUMP 2.........ON');
    expect(lines).not.toContain('L TK PUMP 1');
  });

  it('the real FWC uses these lines for L+R WING TK LO LVL, and the alert gives the amber LAND ASAP', () => {
    const { fwc } = startCruiseFwc(simvars, () => {
      simvars.set('FUEL WEIGHT PER GALLON', KG_PER_GALLON);
      simvars.set('FUEL TANK CENTER QUANTITY', FULL_WING_TANK_GALLONS);
      // both inner tanks empty
    });
    expect(fwc.ewdMessageMemos['0000360'].simVarIsActive.get()).toBe(false);
    runFwc(fwc, 31);
    expect(isAlertTriggered(fwc, '2800145')).toBe(true);
    expect(fwc.ewdMessageMemos['0000360'].simVarIsActive.get()).toBe(true);
    // the left and right alerts give way to the L+R alert
    expect(isAlertTriggered(fwc, '2800130')).toBe(false);
    expect(isAlertTriggered(fwc, '2800140')).toBe(false);
    expect(shownText(fwc, '2800145')).toContain('-L TK PUMP 1.........ON');

    simvars.set('L:A32NX_OVHD_FUEL_PUMP_2_PB_IS_ON', 1);
    runFwc(fwc, 1);
    expect(shownText(fwc, '2800145')).not.toContain('-L TK PUMP 1.........ON');
  });
});
