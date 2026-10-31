// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FSComponent, Subject, VNode } from '@microsoft/msfs-sdk';
import { vi } from 'vitest';
import { AnsuOps } from './System/AnsuOps';
import { OitUiService } from './OitUiService';

/**
 * A stand-in for the parts of the OIT a spec does not care about: any property is another stand-in, and it can be
 * called, subscribed to or used as a component prop without throwing.
 */
export const ANYTHING: any = new Proxy(function () {}, {
  get: (_target, key) => (key === 'then' || typeof key === 'symbol' ? undefined : ANYTHING),
  apply: () => ANYTHING,
  construct: () => ANYTHING,
});

/**
 * @param own the properties the spec gives real values
 * @returns an object with those properties, and a stand-in (ANYTHING) for every other one
 */
export function withStandIns<T extends object>(own: T): T & any {
  return new Proxy(own, {
    get: (target, key) => (key in target ? (target as Record<string | symbol, unknown>)[key] : ANYTHING),
  });
}

/**
 * @returns the OIT UI service with the navigation of a page recorded and everything else a stand-in, and the recorder
 */
export function fakeUiService(): { uiService: OitUiService; navigateTo: ReturnType<typeof vi.fn> } {
  const navigateTo = vi.fn();
  const uiService = withStandIns({
    navigateTo,
    captOrFo: 'CAPT',
    activeUri: Subject.create({ uri: '', sys: '', page: '' }),
    backAvailable: Subject.create(false),
    forwardAvailable: Subject.create(false),
  });
  return { uiService: uiService as OitUiService, navigateTo };
}

/** A file of a menu tree */
export interface NavigatorFile {
  readonly name: string;
  /** The page the file opens, null when clicking it opens nothing */
  readonly target: string | null;
  readonly disabled: boolean;
}

/**
 * Renders a menu and clicks each of its files, as the crew does.
 * @param menu the menu, built with the UI service it is given
 * @returns the files of the menu in the order they are drawn, and the element the menu was rendered into
 */
export function clickNavigatorFiles(menu: (uiService: OitUiService) => VNode): {
  files: NavigatorFile[];
  /** The pages the files open, in the order they are drawn */
  targets: string[];
  root: HTMLElement;
  navigateTo: ReturnType<typeof vi.fn>;
} {
  const { uiService, navigateTo } = fakeUiService();
  const root = document.createElement('div');
  FSComponent.render(menu(uiService), root);

  const files = Array.from(root.querySelectorAll<HTMLElement>('.oit-avncs-navigator-file')).map((file) => {
    const nameElement = file.querySelector<HTMLElement>('.oit-avncs-navigator-file-name');
    navigateTo.mockClear();
    file.click();
    const target = navigateTo.mock.calls.length > 0 ? (navigateTo.mock.calls[0][0] as string) : null;
    navigateTo.mockClear();
    return {
      name: nameElement?.textContent ?? '',
      target,
      disabled: nameElement?.classList.contains('disabled') ?? false,
    };
  });
  const targets = files.map((file) => file.target).filter((target): target is string => target !== null);
  return { files, targets, root, navigateTo };
}

/**
 * @param unread the COMPANY COM messages not read yet
 * @param outbox the messages waiting in the Outbox
 * @returns the part of the ANSU the COMPANY COM menu reads (the mailbox counters), and the counters to change
 */
export function fakeCompanyComAnsu(unread = 0, outbox: unknown[] = []) {
  const unreadCount = Subject.create(unread);
  const outboxMessages = Subject.create(outbox);
  return {
    unreadCount,
    outboxMessages,
    ansu: {
      companyCom: { unreadCount },
      companyComDownlinks: { outbox: outboxMessages },
    } as unknown as AnsuOps,
  };
}
