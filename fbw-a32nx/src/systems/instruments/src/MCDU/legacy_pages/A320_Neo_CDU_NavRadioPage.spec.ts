// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NXFictionalMessages, NXSystemMessages } from '../messages/NXSystemMessages';
import { Keypad } from '../legacy/A320_Neo_CDU_Keypad';
import { CDUNavRadioPage } from './A320_Neo_CDU_NavRadioPage';

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

const GLS_TUNING = {
  manual: false,
  gls: { channel: 31434, rpi: 'G25P', course: 249, slope: -3, definition: null },
  course: 249,
  courseManual: false,
};

const ILS_TUNING = { manual: true, gls: undefined, course: 249, courseManual: false, facility: {} };

function createScreen(tuning: object = ILS_TUNING) {
  return {
    page: { NavRadioPage: 'NavRadioPage', Current: 'NavRadioPage' },
    isMmrTuningLocked: vi.fn(() => false),
    getMmrTuningData: vi.fn(() => tuning),
    tuneManualGls: vi.fn(() => Promise.resolve('tuned')),
    setManualIls: vi.fn(() => Promise.resolve()),
    setIlsCourse: vi.fn(),
    getOrSelectILSsByIdent: vi.fn(),
    deselectedNavaids: [] as string[],
    setScratchpadMessage: vi.fn(),
    logTroubleshootingError: vi.fn(),
  } as any;
}

describe('the RADIO NAV page LS field entry', () => {
  let showPage: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    showPage = vi.spyOn(CDUNavRadioPage, 'ShowPage').mockImplementation(() => {});
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('tunes a 5 digit entry as a GLS channel and redraws', async () => {
    const screen = createScreen();

    CDUNavRadioPage.handleMmrLsk(screen, '31434', vi.fn());
    await flush();

    expect(screen.tuneManualGls).toHaveBeenCalledWith('31434', 'channel');
    expect(showPage).toHaveBeenCalled();
    expect(screen.setManualIls).not.toHaveBeenCalled();
  });

  it('does not bring the page back when the crew left it while the GLS was being resolved', async () => {
    const screen = createScreen();

    CDUNavRadioPage.handleMmrLsk(screen, '31434', vi.fn());
    screen.page.Current = 'FlightPlanPage';
    await flush();

    expect(screen.tuneManualGls).toHaveBeenCalledWith('31434', 'channel');
    expect(showPage).not.toHaveBeenCalled();
  });

  it('gives ENTRY OUT OF RANGE for a 5 digit entry that is no channel', async () => {
    const screen = createScreen();
    screen.tuneManualGls.mockResolvedValue('invalid');
    const keepEntry = vi.fn();

    CDUNavRadioPage.handleMmrLsk(screen, '12345', keepEntry);
    await flush();

    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXSystemMessages.entryOutOfRange);
    expect(keepEntry).toHaveBeenCalled();
    expect(showPage).not.toHaveBeenCalled();
  });

  it('tunes a reference path identifier as a GLS without looking up an ILS', async () => {
    const screen = createScreen();

    CDUNavRadioPage.handleMmrLsk(screen, 'G25P', vi.fn());
    await flush();

    expect(screen.tuneManualGls).toHaveBeenCalledWith('G25P', 'ident');
    expect(screen.getOrSelectILSsByIdent).not.toHaveBeenCalled();
    expect(showPage).toHaveBeenCalled();
  });

  it('looks an identifier up as an ILS when no GLS of the airport has it', async () => {
    const screen = createScreen();
    screen.tuneManualGls.mockResolvedValue('unknown-rpi');
    const ils = { ident: 'I', databaseId: 'ILS' };
    screen.getOrSelectILSsByIdent.mockImplementation((_ident: string, callback: (n: unknown) => void) => callback(ils));

    CDUNavRadioPage.handleMmrLsk(screen, 'G25P', vi.fn());
    await flush();

    expect(screen.setManualIls).toHaveBeenCalledWith(ils);
  });

  it('does not ask for a GLS when the identifier is not of the reference path identifier shape', async () => {
    const screen = createScreen();

    CDUNavRadioPage.handleMmrLsk(screen, 'IFRA', vi.fn());
    await flush();

    expect(screen.tuneManualGls).not.toHaveBeenCalled();
    expect(screen.getOrSelectILSsByIdent).toHaveBeenCalledWith('IFRA', expect.any(Function));
  });

  it('clears a manual selection, a typed GLS channel included', async () => {
    const screen = createScreen({ ...GLS_TUNING, manual: true });

    CDUNavRadioPage.handleMmrLsk(screen, Keypad.clrValue, vi.fn());
    await flush();

    expect(screen.setManualIls).toHaveBeenCalledWith(null);
    expect(showPage).toHaveBeenCalled();
  });

  it('refuses to clear what the FMS selected', async () => {
    const screen = createScreen(GLS_TUNING);
    const keepEntry = vi.fn();

    CDUNavRadioPage.handleMmrLsk(screen, Keypad.clrValue, keepEntry);
    await flush();

    expect(screen.setManualIls).not.toHaveBeenCalled();
    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXSystemMessages.notAllowed);
  });

  it('gives NOT ALLOWED and clears the entry when the tuning locks while a channel is being resolved', async () => {
    const screen = createScreen();
    screen.tuneManualGls.mockResolvedValue('locked');
    const keepEntry = vi.fn();

    CDUNavRadioPage.handleMmrLsk(screen, '31434', keepEntry);
    await flush();

    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXSystemMessages.notAllowed);
    expect(keepEntry).not.toHaveBeenCalled();
    expect(showPage).not.toHaveBeenCalled();
  });

  it('gives NOT ALLOWED and clears the entry when the tuning locks while an identifier is being resolved, with no ILS lookup', async () => {
    const screen = createScreen();
    screen.tuneManualGls.mockResolvedValue('locked');
    const keepEntry = vi.fn();

    CDUNavRadioPage.handleMmrLsk(screen, 'G25P', keepEntry);
    await flush();

    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXSystemMessages.notAllowed);
    expect(keepEntry).not.toHaveBeenCalled();
    expect(screen.getOrSelectILSsByIdent).not.toHaveBeenCalled();
  });

  it('keeps the entry of the other refusals: an ILS identifier not in the database, a channel out of range', async () => {
    const screen = createScreen();
    screen.tuneManualGls.mockResolvedValue('unknown-rpi');
    screen.getOrSelectILSsByIdent.mockImplementation((_ident: string, callback: (navaid: unknown) => void) =>
      callback(undefined),
    );
    const keepIdent = vi.fn();

    CDUNavRadioPage.handleMmrLsk(screen, 'IABC', keepIdent);
    await flush();

    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXSystemMessages.notInDatabase);
    expect(keepIdent).toHaveBeenCalled();

    screen.tuneManualGls.mockResolvedValue('invalid');
    const keepChannel = vi.fn();
    CDUNavRadioPage.handleMmrLsk(screen, '40123', keepChannel);
    await flush();

    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXSystemMessages.entryOutOfRange);
    expect(keepChannel).toHaveBeenCalled();
  });

  it('gives an internal error message and keeps the entry when the GLS lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const screen = createScreen();
    const failure = new Error('database');
    screen.tuneManualGls.mockRejectedValue(failure);
    const keepEntry = vi.fn();

    CDUNavRadioPage.handleMmrLsk(screen, '31434', keepEntry);
    await flush();

    expect(screen.logTroubleshootingError).toHaveBeenCalledWith(failure);
    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXFictionalMessages.internalError);
    expect(keepEntry).toHaveBeenCalled();
    expect(showPage).not.toHaveBeenCalled();
  });

  it('gives an internal error message when the lookup of a reference path identifier fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const screen = createScreen();
    screen.tuneManualGls.mockRejectedValue(new Error('database'));

    CDUNavRadioPage.handleMmrLsk(screen, 'G25P', vi.fn());
    await flush();

    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXFictionalMessages.internalError);
  });

  it('gives an internal error message when the ILS cannot be tuned', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const screen = createScreen();
    screen.setManualIls.mockRejectedValue(new Error('tuner'));

    CDUNavRadioPage.handleMmrLsk(screen, '110.10', vi.fn());
    await flush();

    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXFictionalMessages.internalError);
  });

  it('refuses any entry below 700 ft on approach and clears it', async () => {
    const screen = createScreen();
    screen.isMmrTuningLocked.mockReturnValue(true);
    const keepEntry = vi.fn();

    CDUNavRadioPage.handleMmrLsk(screen, '31434', keepEntry);
    await flush();

    expect(screen.tuneManualGls).not.toHaveBeenCalled();
    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXSystemMessages.notAllowed);
    expect(keepEntry).not.toHaveBeenCalled();
  });
});

describe('the RADIO NAV page LS course entry', () => {
  beforeEach(() => {
    vi.spyOn(CDUNavRadioPage, 'ShowPage').mockImplementation(() => {});
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => callback());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('gives NOT ALLOWED for a course entered on a GLS', () => {
    const screen = createScreen(GLS_TUNING);
    const keepEntry = vi.fn();

    CDUNavRadioPage.handleMmrCrsLsk(screen, '250', keepEntry);

    expect(screen.setIlsCourse).not.toHaveBeenCalled();
    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXSystemMessages.notAllowed);
    expect(keepEntry).not.toHaveBeenCalled();
  });

  it('gives NOT ALLOWED for a front or back course switch on a GLS', () => {
    const screen = createScreen(GLS_TUNING);

    CDUNavRadioPage.handleMmrCrsLsk(screen, 'B', vi.fn());

    expect(screen.setIlsCourse).not.toHaveBeenCalled();
    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXSystemMessages.notAllowed);
  });

  it('keeps an ILS course entry out of range', () => {
    const screen = createScreen();
    const keepEntry = vi.fn();

    CDUNavRadioPage.handleMmrCrsLsk(screen, '400', keepEntry);

    expect(screen.setScratchpadMessage).toHaveBeenCalledWith(NXSystemMessages.entryOutOfRange);
    expect(keepEntry).toHaveBeenCalled();
  });

  it('still takes a course for an ILS', () => {
    const screen = createScreen();

    CDUNavRadioPage.handleMmrCrsLsk(screen, '250', vi.fn());

    expect(screen.setIlsCourse).toHaveBeenCalledWith(250, false);
  });
});
