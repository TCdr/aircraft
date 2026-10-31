// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject } from '@microsoft/msfs-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withStandIns } from '../../../OitSpecSupport';
import { logbookPageProps as pageProps } from './LogbookSpecSupport';
import { InputField, InteractionMode } from '../../../../MsfsAvionicsCommon/UiWidgets/InputField';
import { FreeTextFormat } from '../../../../MFD/pages/common/DataEntryFormats';
import { OisIdentificationDialog } from '../../Common/OisIdentificationDialog';
import { OisDialog } from '../../../System/OisDialog';
import { OitPageDrafts } from '../../../System/OitPageDrafts';
import { LOGBOOK_DIALOG_DRAFTS, personalIdAfterButton, selectionIndex, storeTargetChoice } from './LogbookDrafts';
import { LOGBOOK_URI } from './LogbookFlows';
import { LogbookDefectStorePanel } from './LogbookDefectStorePanel';
import { OitAvncsLogbookAssistant } from './OitAvncsLogbookAssistant';
import { OitAvncsLogbookCabinOpenItems } from './OitAvncsLogbookCabinOpenItems';
import { OitAvncsLogbookCockpitInterface } from './OitAvncsLogbookCockpitInterface';
import { OitAvncsLogbookDeferredItems } from './OitAvncsLogbookDeferredItems';
import { OitAvncsLogbookFlightData } from './OitAvncsLogbookFlightData';
import { OitAvncsLogbookHistory } from './OitAvncsLogbookHistory';
import { OitAvncsLogbookOpenItems } from './OitAvncsLogbookOpenItems';
import { OitAvncsLogbookRelease } from './OitAvncsLogbookRelease';
import { OitAvncsLogbookTemporaryItems } from './OitAvncsLogbookTemporaryItems';

/** The entries of each logbook page that must outlive a drawing of the page */
const KEPT_ENTRIES: [string, new (props: any) => unknown, readonly string[]][] = [
  [
    'Assistant',
    OitAvncsLogbookAssistant,
    [
      'pilotComment',
      'storeTarget',
      'systemIndex',
      'functionIndex',
      'allocationIndex',
      'keywords',
      'searchedKeywords',
      'freeTextTitle',
      'selectedItem',
    ],
  ],
  [
    'Cockpit interface',
    OitAvncsLogbookCockpitInterface,
    ['area', 'stdDefectMode', 'selectedIndex', 'pilotComment', 'storeTarget'],
  ],
  ['Flight data', OitAvncsLogbookFlightData, ['panel']],
  ['Release', OitAvncsLogbookRelease, ['panel', 'selectedRef', 'servicedCategory']],
  ['Open items', OitAvncsLogbookOpenItems, ['unticked', 'selectedRef']],
  ['Deferred items', OitAvncsLogbookDeferredItems, ['panel', 'selectedRef']],
  ['Temporary items', OitAvncsLogbookTemporaryItems, ['selectedItemRef']],
  ['Cabin open items', OitAvncsLogbookCabinOpenItems, ['selectedRef']],
  ['History', OitAvncsLogbookHistory, ['selectedRef']],
];

/**
 * @param drafts the drafts of the OIT
 * @returns the names of the entries the pages took from the drafts
 */
function draftedNames(drafts: OitPageDrafts): string[] {
  const keys = Array.from((drafts as unknown as { fields: Map<string, unknown> }).fields.keys());
  return keys.map((key) => key.substring(key.indexOf('#') + 1));
}

describe('logbook page drafts', () => {
  it.each(KEPT_ENTRIES)(
    'takes what the crew typed or selected on the %s page from the page drafts',
    (_name, Page, names) => {
      const drafts = new OitPageDrafts();
      // eslint-disable-next-line no-new
      new Page(pageProps(drafts));
      for (const name of names) {
        expect(draftedNames(drafts), name).toContain(name);
      }
    },
  );

  describe('identification', () => {
    const dialogProps = (drafts: OitPageDrafts) => ({
      dialog: Subject.create<OisDialog | null>(null),
      drafts,
      draftsPage: LOGBOOK_DIALOG_DRAFTS,
      keyboard: withStandIns({}),
      title: 'LOGBOOK',
    });

    it('keeps the personal ID of the identification in the page drafts', () => {
      const drafts = new OitPageDrafts();
      // eslint-disable-next-line no-new
      new OisIdentificationDialog(dialogProps(drafts));
      expect(draftedNames(drafts)).toContain('personalId');
    });

    it('never keeps the password of the identification', () => {
      const drafts = new OitPageDrafts();
      // eslint-disable-next-line no-new
      new OisIdentificationDialog(dialogProps(drafts));
      expect(draftedNames(drafts)).not.toContain('password');
    });
  });

  describe('with the sim utilities', () => {
    const trigger = vi.fn();

    beforeEach(() => {
      let guid = 0;
      vi.stubGlobal('Utils', { generateGUID: () => `guid-${++guid}` });
      vi.stubGlobal('Coherent', { trigger });
      trigger.mockClear();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('releases the previous input field before it announces the selected one to the sim', () => {
      const hEventConsumer = withStandIns({});
      const first = FSComponent.createRef<InputField<string>>();
      const second = FSComponent.createRef<InputField<string>>();
      const field = (ref: typeof first) => (
        <InputField<string>
          ref={ref}
          dataEntryFormat={new FreeTextFormat(8)}
          value={Subject.create<string | null>(null)}
          hEventConsumer={hEventConsumer}
          interactionMode={Subject.create(InteractionMode.Touchscreen)}
          errorHandler={() => {}}
        />
      );
      FSComponent.render(
        <div>
          {field(first)}
          {field(second)}
        </div>,
        document.createElement('div'),
      );

      first.instance.onFocus();
      trigger.mockClear();
      second.instance.onFocus();

      expect(trigger.mock.calls.map((call) => `${call[0]} ${call[1]}`)).toEqual([
        'UNFOCUS_INPUT_FIELD InputField-guid-1',
        'FOCUS_INPUT_FIELD InputField-guid-2',
      ]);
    });

    it('lets the STORE IN choice come from the page', () => {
      const target = Subject.create<number | null>(1);
      const props = {
        container: withStandIns({
          ansu: withStandIns({ techLogbook: withStandIns({ state: Subject.create('on-board') }) }),
        }),
        idPrefix: 'test',
        targets: ['open', 'temporary'],
        target,
        pilotComment: Subject.create<string | null>(null),
        hasDefect: Subject.create(false),
        onStore: () => {},
      };
      FSComponent.render(<LogbookDefectStorePanel {...(props as any)} />, document.createElement('div'));
      // the choice made on the page stays; a page without one starts on the first storage
      expect(target.get()).toBe(1);
      target.set(null);
      FSComponent.render(<LogbookDefectStorePanel {...(props as any)} />, document.createElement('div'));
      expect(target.get()).toBe(0);
    });
  });

  it('keeps the entries of the logbook pages until the LOGBOOK application closes', () => {
    const drafts = new OitPageDrafts();
    drafts.field<string | null>(`${LOGBOOK_URI.entry}/free-text`, 'freeTextTitle', null).set('CABIN DOOR SEAL');
    drafts.field<string | null>(LOGBOOK_DIALOG_DRAFTS, 'personalId', null).set('JDOE');

    drafts.keepApplications([LOGBOOK_URI.application, 'nss-avncs/company-com']);
    expect(drafts.field<string | null>(`${LOGBOOK_URI.entry}/free-text`, 'freeTextTitle', null).get()).toBe(
      'CABIN DOOR SEAL',
    );
    expect(drafts.field<string | null>(LOGBOOK_DIALOG_DRAFTS, 'personalId', null).get()).toBe('JDOE');

    drafts.keepApplications(['nss-avncs/company-com']);
    expect(drafts.has(`${LOGBOOK_URI.entry}/free-text`)).toBe(false);
    expect(drafts.has(LOGBOOK_DIALOG_DRAFTS)).toBe(false);
  });

  it('finds the selected item again after the list changed', () => {
    expect(selectionIndex(['12:01  ENG 1 FIRE', '11:58  HYD G SYS LO PR'], '11:58  HYD G SYS LO PR')).toBe(1);
    expect(
      selectionIndex(['12:05  BLEED 2 FAULT', '12:01  ENG 1 FIRE', '11:58  HYD G SYS LO PR'], '11:58  HYD G SYS LO PR'),
    ).toBe(2);
    expect(selectionIndex(['12:01  ENG 1 FIRE'], '11:58  HYD G SYS LO PR')).toBe(null);
    expect(selectionIndex(['12:01  ENG 1 FIRE'], null)).toBe(null);
  });

  it('defaults STORE IN to the first storage', () => {
    expect(storeTargetChoice(null)).toBe(0);
    expect(storeTargetChoice(1)).toBe(1);
  });

  it('keeps the personal ID for the next signature unless the identification is cancelled', () => {
    expect(personalIdAfterButton('PILOT1', 'OK')).toBe('PILOT1');
    expect(personalIdAfterButton('PILOT1', 'CANCEL')).toBe(null);
    expect(personalIdAfterButton(null, 'OK')).toBe(null);
  });
});
