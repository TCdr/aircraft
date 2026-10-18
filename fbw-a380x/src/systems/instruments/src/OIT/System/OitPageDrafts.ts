// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';

/**
 * What the crew typed or selected on the pages of the open applications of one OIT. The page of an application is drawn
 * again each time the crew returns to it (task bar, BACK, the folder tree): its entries live here, by page URI, until
 * the application closes.
 */
export class OitPageDrafts {
  private readonly fields = new Map<string, Subject<unknown>>();

  /**
   * @param page the page URI
   * @param name the name of the entry on the page
   * @param initial the value of a new entry
   * @returns the entry, the same one at each drawing of the page
   */
  public field<T>(page: string, name: string, initial: T): Subject<T> {
    const key = `${page}#${name}`;
    let field = this.fields.get(key);
    if (field === undefined) {
      field = Subject.create<unknown>(initial);
      this.fields.set(key, field);
    }
    return field as Subject<T>;
  }

  /**
   * @param page the page URI
   * @returns whether the page has entries from an earlier drawing
   */
  public has(page: string): boolean {
    const prefix = `${page}#`;
    for (const key of Array.from(this.fields.keys())) {
      if (key.startsWith(prefix)) {
        return true;
      }
    }
    return false;
  }

  /**
   * The applications closed since: their pages start empty at the next opening.
   * @param openApplications the URIs of the open applications
   */
  public keepApplications(openApplications: readonly string[]): void {
    for (const key of Array.from(this.fields.keys())) {
      if (
        !openApplications.some((application) => key.startsWith(`${application}/`) || key.startsWith(`${application}#`))
      ) {
        this.fields.delete(key);
      }
    }
  }

  /** Every page starts empty */
  public clear(): void {
    this.fields.clear();
  }
}
