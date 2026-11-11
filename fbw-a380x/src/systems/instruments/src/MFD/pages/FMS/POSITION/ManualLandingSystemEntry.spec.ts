// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { describe, expect, it, vi } from 'vitest';
import { gbasAirports } from '../../../../../../../../../fbw-common/src/systems/shared/src/gbas/GbasApproachTable';
import { NXFictionalMessages, NXSystemMessages, TypeIMessage } from '../../../shared/NXSystemMessages';
import { ManualLandingSystemEntry, ManualLandingSystemEntryContext } from './ManualLandingSystemEntry';

const ILS_FACILITY = { ident: 'IFNW', databaseId: 'ILS-IFNW' };

const AUTO_TUNED = { manual: false, facility: undefined, gls: undefined, glsEntry: undefined };
const ILS_TUNED_BY_IDENT = { manual: true, facility: ILS_FACILITY, gls: undefined, glsEntry: undefined };
const ILS_TUNED_BY_FREQUENCY = { manual: true, facility: undefined, gls: undefined, glsEntry: undefined };

interface Scenario {
  /** what the MMR is tuned to before the entry */
  mmr?: object;
  destinationIdent?: string;
  /** the landing systems the database has for the ident the crew typed */
  ilsOfIdent?: object[];
}

function createEntry(scenario: Scenario = {}) {
  const messages: TypeIMessage[] = [];
  const navaidTuner = {
    isMmrTuningLocked: vi.fn(() => false),
    getMmrRadioTuningStatus: () => scenario.mmr ?? AUTO_TUNED,
    setManualIls: vi.fn(() => Promise.resolve()),
    setManualGls: vi.fn(),
  };
  const database = {
    getILSs: vi.fn(() => Promise.resolve(scenario.ilsOfIdent ?? [])),
    getAirports: vi.fn((idents: string[]) =>
      Promise.resolve(idents.map((ident) => ({ ident, location: { lat: 50, long: 8 } }))),
    ),
    getRunways: vi.fn(() => Promise.resolve([])),
  };
  const chooseFacility = vi.fn((facilities: object[]): Promise<object | undefined> => Promise.resolve(facilities[0]));
  const flightPlans = {
    hasActive: true,
    active: { destinationAirport: { ident: scenario.destinationIdent ?? 'EDDF' }, originAirport: undefined },
  };
  const context = {
    getNavaidTuner: () => navaidTuner,
    getFlightPlans: (): object => flightPlans,
    getPresentPosition: () => null,
    getDatabase: () => database,
    chooseFacility,
    showMessage: (message: TypeIMessage) => messages.push(message),
  };
  return {
    entry: new ManualLandingSystemEntry(context as unknown as ManualLandingSystemEntryContext),
    context,
    navaidTuner,
    database,
    chooseFacility,
    messages,
  };
}

describe('an entry in the LS IDENT field', () => {
  it('tunes the ILS of the ident', async () => {
    const { entry, navaidTuner, messages } = createEntry({ ilsOfIdent: [ILS_FACILITY] });

    await expect(entry.enterIdent('IFNW')).resolves.toBe(true);

    expect(navaidTuner.setManualIls).toHaveBeenCalledWith(ILS_FACILITY);
    expect(messages).toEqual([]);
  });

  it('tunes the GLS of a reference path identifier of the destination, without an ILS lookup', async () => {
    const { entry, navaidTuner, database } = createEntry();

    await expect(entry.enterIdent('G25P')).resolves.toBe(true);

    expect(navaidTuner.setManualGls).toHaveBeenCalledWith(expect.objectContaining({ channel: 31434 }), 'ident');
    expect(database.getILSs).not.toHaveBeenCalled();
  });

  it('looks an identifier of that shape up as an ILS when no GLS of the destination has it', async () => {
    const { entry, navaidTuner } = createEntry({ ilsOfIdent: [ILS_FACILITY] });

    await expect(entry.enterIdent('G99X')).resolves.toBe(true);

    expect(navaidTuner.setManualGls).not.toHaveBeenCalled();
    expect(navaidTuner.setManualIls).toHaveBeenCalledWith(ILS_FACILITY);
  });

  it('refuses an ILS ident that the database does not have', async () => {
    const { entry, navaidTuner, messages } = createEntry();

    await expect(entry.enterIdent('IXYZ')).resolves.toBe(false);

    expect(messages).toEqual([NXSystemMessages.notInDatabase]);
    expect(navaidTuner.setManualIls).not.toHaveBeenCalled();
  });

  it('refuses a reference path identifier that neither a GLS nor an ILS has', async () => {
    const { entry, messages } = createEntry();

    await expect(entry.enterIdent('G99X')).resolves.toBe(false);

    expect(messages).toEqual([NXSystemMessages.notInDatabase]);
  });

  it('tunes nothing and shows no message when the crew cancels the choice between several ILS', async () => {
    const { entry, navaidTuner, chooseFacility, messages } = createEntry({
      ilsOfIdent: [ILS_FACILITY, { ...ILS_FACILITY, databaseId: 'ILS-IFNW-2' }],
    });
    chooseFacility.mockResolvedValue(undefined);

    await expect(entry.enterIdent('IFNW')).resolves.toBe(false);

    expect(navaidTuner.setManualIls).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
  });

  it('tunes nothing and shows no message when another lookup took the choice of the landing system over', async () => {
    const { entry, navaidTuner, chooseFacility, messages } = createEntry({
      ilsOfIdent: [ILS_FACILITY, { ...ILS_FACILITY, databaseId: 'ILS-IFNW-2' }],
    });
    chooseFacility.mockRejectedValue('A new request overrode this one!');

    await expect(entry.enterIdent('IFNW')).resolves.toBe(false);

    expect(navaidTuner.setManualIls).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
  });

  it('clears the ident the crew typed', async () => {
    const { entry, navaidTuner, messages } = createEntry({ mmr: ILS_TUNED_BY_IDENT });

    await expect(entry.enterIdent(null)).resolves.toBe(true);

    expect(navaidTuner.setManualIls).toHaveBeenCalledWith(null);
    expect(messages).toEqual([]);
  });

  it('refuses to clear an ident the crew did not type', async () => {
    for (const mmr of [AUTO_TUNED, ILS_TUNED_BY_FREQUENCY]) {
      const { entry, navaidTuner, messages } = createEntry({ mmr });

      await expect(entry.enterIdent(null)).resolves.toBe(false);

      expect(navaidTuner.setManualIls).not.toHaveBeenCalled();
      expect(messages).toEqual([NXSystemMessages.notAllowed]);
    }
  });

  it('refuses any entry while the tuning is locked', async () => {
    const { entry, navaidTuner, database, messages } = createEntry({ ilsOfIdent: [ILS_FACILITY] });
    navaidTuner.isMmrTuningLocked.mockReturnValue(true);

    await expect(entry.enterIdent('IFNW')).resolves.toBe(false);

    expect(database.getILSs).not.toHaveBeenCalled();
    expect(messages).toEqual([NXSystemMessages.notAllowed]);
  });

  it('refuses a reference path identifier when the tuning locks during its lookup, and looks up no ILS', async () => {
    const { entry, navaidTuner, database, messages } = createEntry();
    database.getRunways.mockImplementation(() => {
      navaidTuner.isMmrTuningLocked.mockReturnValue(true);
      return Promise.resolve([]);
    });

    await expect(entry.enterIdent('G25P')).resolves.toBe(false);

    expect(navaidTuner.setManualGls).not.toHaveBeenCalled();
    expect(database.getILSs).not.toHaveBeenCalled();
    expect(messages).toEqual([NXSystemMessages.notAllowed]);
  });

  it('refuses the entry with an internal error message when the database lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { entry, database, messages } = createEntry();
    database.getILSs.mockRejectedValue(new Error('database'));

    await expect(entry.enterIdent('IFNW')).resolves.toBe(false);

    expect(messages).toEqual([NXFictionalMessages.internalError]);
    vi.restoreAllMocks();
  });
});

describe('an entry in the LS FREQ/CHAN field', () => {
  it('tunes an ILS frequency', async () => {
    const { entry, navaidTuner, messages } = createEntry();

    await expect(entry.enterFrequencyOrChannel(110.3)).resolves.toBe(true);

    expect(navaidTuner.setManualIls).toHaveBeenCalledWith(110.3);
    expect(navaidTuner.setManualGls).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
  });

  it('tunes the GLS of a channel of the destination', async () => {
    const { entry, navaidTuner } = createEntry();

    await expect(entry.enterFrequencyOrChannel(31434)).resolves.toBe(true);

    expect(navaidTuner.setManualGls).toHaveBeenCalledWith(expect.objectContaining({ rpi: 'G25P' }), 'channel');
    expect(navaidTuner.setManualIls).not.toHaveBeenCalled();
  });

  it('refuses a five digit number that is no channel as out of range', async () => {
    const { entry, navaidTuner, messages } = createEntry();

    await expect(entry.enterFrequencyOrChannel(40000)).resolves.toBe(false);

    expect(navaidTuner.setManualGls).not.toHaveBeenCalled();
    expect(messages).toEqual([NXSystemMessages.entryOutOfRange]);
  });

  it('clears the frequency or channel the crew typed', async () => {
    const { entry, navaidTuner } = createEntry({ mmr: ILS_TUNED_BY_FREQUENCY });

    await expect(entry.enterFrequencyOrChannel(null)).resolves.toBe(true);

    expect(navaidTuner.setManualIls).toHaveBeenCalledWith(null);
  });

  it('refuses to clear a frequency the crew did not type', async () => {
    for (const mmr of [AUTO_TUNED, ILS_TUNED_BY_IDENT]) {
      const { entry, navaidTuner, messages } = createEntry({ mmr });

      await expect(entry.enterFrequencyOrChannel(null)).resolves.toBe(false);

      expect(navaidTuner.setManualIls).not.toHaveBeenCalled();
      expect(messages).toEqual([NXSystemMessages.notAllowed]);
    }
  });

  it('refuses any entry while the tuning is locked', async () => {
    const { entry, navaidTuner, messages } = createEntry();
    navaidTuner.isMmrTuningLocked.mockReturnValue(true);

    await expect(entry.enterFrequencyOrChannel(110.3)).resolves.toBe(false);

    expect(navaidTuner.setManualIls).not.toHaveBeenCalled();
    expect(messages).toEqual([NXSystemMessages.notAllowed]);
  });

  it('refuses a channel when the tuning locks while it is being resolved', async () => {
    const { entry, navaidTuner, database, messages } = createEntry();
    database.getRunways.mockImplementation(() => {
      navaidTuner.isMmrTuningLocked.mockReturnValue(true);
      return Promise.resolve([]);
    });

    await expect(entry.enterFrequencyOrChannel(31434)).resolves.toBe(false);

    expect(navaidTuner.setManualGls).not.toHaveBeenCalled();
    expect(messages).toEqual([NXSystemMessages.notAllowed]);
  });

  it('refuses the entry with an internal error message when the airports of the table cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { entry, database, messages } = createEntry();
    database.getAirports.mockRejectedValue(new Error('database'));

    await expect(entry.enterFrequencyOrChannel(31434)).resolves.toBe(false);

    expect(messages).toEqual([NXFictionalMessages.internalError]);
    vi.restoreAllMocks();
  });

  it('still tunes a channel while the FMS has no active flight plan', async () => {
    const { entry, context, navaidTuner } = createEntry();
    context.getFlightPlans = () => ({
      hasActive: false,
      get active(): never {
        throw new Error('no active flight plan');
      },
    });

    await expect(entry.enterFrequencyOrChannel(31434)).resolves.toBe(true);

    expect(navaidTuner.setManualGls).toHaveBeenCalledWith(expect.objectContaining({ channel: 31434 }), 'channel');
  });
});

describe('the airports of the GLS table, read for a channel entry', () => {
  it('are read from the database once when all of them arrived', async () => {
    const { entry, database } = createEntry();

    await entry.enterFrequencyOrChannel(31434);
    await entry.enterFrequencyOrChannel(31434);

    expect(database.getAirports).toHaveBeenCalledTimes(1);
    expect(database.getAirports).toHaveBeenCalledWith(gbasAirports());
  });

  it('are read again at the next entry when the database answered with a part of them', async () => {
    const { entry, database } = createEntry();
    database.getAirports.mockImplementationOnce((idents: string[]) =>
      Promise.resolve(idents.slice(0, 2).map((ident) => ({ ident, location: { lat: 50, long: 8 } }))),
    );

    await entry.enterFrequencyOrChannel(31434);
    await entry.enterFrequencyOrChannel(31434);
    await entry.enterFrequencyOrChannel(31434);

    expect(database.getAirports).toHaveBeenCalledTimes(2);
  });
});
