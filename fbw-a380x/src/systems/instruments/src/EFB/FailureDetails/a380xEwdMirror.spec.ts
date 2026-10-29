// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { orderByEwd, plainEcamText } from '@flybywiresim/fbw-sdk';
import { EcamAbnormalProcedures } from '../../MsfsAvionicsCommon/EcamMessages';
import { alertProcedures, itemText, procedureExists } from './a380xEwdMirror';
import type { ChecklistState } from '../../MsfsAvionicsCommon/providers/FwsPublisher';
import type { ChecklistAction } from '../../MsfsAvionicsCommon/EcamMessages';

/*
 * The procedure tables import the enums of the EcamMessages index and the index imports the tables, so a test that
 * loads the index runs the tables before the enums exist. The index gets empty tables here, and the real one this spec
 * needs is put in afterwards.
 */
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata21-22-23', () => ({
  EcamAbnormalSensedAta212223: {},
  EcamDeferredProcAta212223: {},
}));
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata24', () => ({
  EcamAbnormalSensedAta24: {},
  EcamDeferredProcAta24: {},
}));
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata26', () => ({ EcamAbnormalSensedAta26: {} }));
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata27', () => ({
  EcamAbnormalSensedAta27: {},
  EcamDeferredProcAta27: {},
}));
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata28', () => ({ EcamAbnormalSensedAta28: {} }));
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata29-30', () => ({
  EcamAbnormalSensedAta2930: {},
  EcamDeferredProcAta2930: {},
}));
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata31-32-33', () => ({
  EcamAbnormalSensedAta313233: {},
  EcamDeferredProcAta313233: {},
}));
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata34', () => ({
  EcamAbnormalSensedAta34: {},
  EcamDeferredProcAta34: {},
}));
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata35-36-42', () => ({
  EcamAbnormalSensedAta353642: {},
}));
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata46-49-52-56', () => ({
  EcamAbnormalSensedAta46495256: {},
}));
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata70', () => ({
  EcamAbnormalSensedAta70: {},
  EcamDeferredProcAta70: {},
}));
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata80-rest', () => ({
  EcamAbnormalSensedAta80Rest: {},
  EcamDeferredProcAta80Rest: {},
}));
vi.mock('../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/secondary-failures', () => ({
  EcamAbnormalSecondaryFailures: {},
}));

beforeAll(async () => {
  const actual = await vi.importActual<{ EcamAbnormalSensedAta212223: typeof EcamAbnormalProcedures }>(
    '../../MsfsAvionicsCommon/EcamMessages/AbnormalSensed/ata21-22-23',
  );
  Object.assign(EcamAbnormalProcedures, actual.EcamAbnormalSensedAta212223);
});

const plain = (segments: { text: string }[]) => plainEcamText(segments.map((segment) => segment.text).join(''));

function presentedState(id: string, itemsToShow: boolean[], itemsChecked: boolean[]): ChecklistState {
  return { id, procedureActivated: true, itemsToShow, itemsChecked, itemsActive: itemsToShow };
}

describe('A380X EWD mirror', () => {
  it('knows which procedures exist', () => {
    expect(procedureExists('211800032')).toBe(true);
    expect(procedureExists('211899999')).toBe(false);
  });

  it('shows only the items the EWD shows', () => {
    const [procedure] = alertProcedures(['211800032'], [presentedState('211800032', [true, false], [false, false])]);
    expect(procedure.lines).toHaveLength(1);
    expect(procedure.lines[0].state).toBe('pending');
    const text = plain(procedure.lines[0].segments);
    expect(text.startsWith('CARGO TEMP')).toBe(true);
    expect(text.endsWith('MONITOR')).toBe(true);
    expect(procedure.ewdOrder).toBe(0);
  });

  it('reads a checked item as done', () => {
    const [procedure] = alertProcedures(['211800032'], [presentedState('211800032', [true, true], [true, false])]);
    expect(procedure.lines.map((line) => line.state)).toEqual(['done', 'pending']);
  });

  it('greys items the EWD shows inactive, or all of them while the procedure is not activated', () => {
    const inactiveItem: ChecklistState = {
      ...presentedState('211800032', [true, true], [false, false]),
      itemsActive: [true, false],
    };
    const [partly] = alertProcedures(['211800032'], [inactiveItem]);
    expect(partly.lines.map((line) => line.state)).toEqual(['pending', 'inactive']);

    const notActivated: ChecklistState = {
      ...presentedState('211800032', [true, true], [false, false]),
      procedureActivated: false,
    };
    const [none] = alertProcedures(['211800032'], [notActivated]);
    expect(none.lines.map((line) => line.state)).toEqual(['inactive', 'inactive']);
  });

  it('colours unchecked actions cyan and checked ones green', () => {
    const [procedure] = alertProcedures(['211800032'], [presentedState('211800032', [true, true], [true, false])]);
    expect(procedure.lines[0].segments[0].colour).toBe('green');
    expect(procedure.lines[1].segments[0].colour).toBe('cyan');
  });

  it('orders the procedures as the EWD presents them', () => {
    const procedures = alertProcedures(
      ['211800032', '211800033'],
      [
        presentedState('211800033', [true, true], [false, false]),
        presentedState('211800032', [true, true], [false, false]),
      ],
    );
    expect(orderByEwd(procedures).map((procedure) => procedure.alertId)).toEqual(['211800033', '211800032']);
  });

  it('lists every item of a procedure that is not presented as reference', () => {
    const [procedure] = alertProcedures(['211800032'], []);
    expect(procedure.ewdOrder).toBeUndefined();
    expect(procedure.lines).toHaveLength(2);
    expect(procedure.lines.every((line) => line.state === 'reference')).toBe(true);
  });

  it('writes conditions with their IF and checked actions with a colon', () => {
    expect(itemText({ name: 'HOT AIR 1', sensed: true, condition: true } as never, false)).toBe('.IF HOT AIR 1 :');
    expect(itemText({ name: 'HOT AIR 1', sensed: true, labelNotCompleted: 'ON' } as ChecklistAction, true)).toBe(
      'HOT AIR 1 : ON',
    );
  });

  it('skips an id with no procedure', () => {
    expect(alertProcedures(['211899999'], [])).toEqual([]);
  });
});
