// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject, Subscribable } from '@microsoft/msfs-sdk';

import {
  addRequestFrame,
  createRequestFrame,
  isRequestComplete,
  removeRequestFrame,
  RequestFrame,
  RequestFrameId,
} from './RequestFrames';

/**
 * The frames of a message composed on an ATC COM page (REQUEST, OTHER REPORTS): up to five frames created with the page
 * menu, CANCEL and XFR TO MAILBOX (FCOM DSC-46-10-20-30 P 11-16, P 24-26).
 */
export class FrameComposer {
  private readonly _frames = Subject.create<readonly RequestFrame[]>([]);

  public readonly frames: Subscribable<readonly RequestFrame[]> = this._frames;

  /**
   * @param onLastMsgElement shows LAST MSG ELEMENT: five frames, or a frame that must be alone
   * @param defaults the values a new frame is completed with
   * @param transfer transfers the complete message to the mailbox, false when not possible
   */
  constructor(
    private readonly onLastMsgElement: () => void,
    private readonly defaults: (id: RequestFrameId) => Record<string, string | null>,
    private readonly transfer: (frames: readonly RequestFrame[]) => boolean,
  ) {}

  /**
   * Adds a frame from the menu
   * @param id the frame
   * @param label a label that depends on the flight (e.g. SID or STAR)
   */
  public add(id: RequestFrameId, label?: string): void {
    const frame = createRequestFrame(id, this.defaults(id));
    frame.label = label;
    const result = addRequestFrame(this._frames.get(), frame);
    if (result.frames) {
      this._frames.set(result.frames);
    } else if (result.error === 'LAST_MSG_ELEMENT') {
      this.onLastMsgElement();
    }
  }

  /** The delete symbol of a frame */
  public remove(index: number): void {
    this._frames.set(removeRequestFrame(this._frames.get(), index));
  }

  public setValue(index: number, key: string, value: string | null): void {
    const frames = [...this._frames.get()];
    if (frames[index]) {
      frames[index] = { ...frames[index], values: { ...frames[index].values, [key]: value } };
      this._frames.set(frames);
    }
  }

  /** CANCEL button: deletes the message */
  public cancel(): void {
    this._frames.set([]);
  }

  public isComplete(frames: readonly RequestFrame[]): boolean {
    return isRequestComplete(frames);
  }

  /** XFR TO MAILBOX button: the message goes to the mailbox and the page is cleared */
  public transferToMailbox(): void {
    const frames = this._frames.get();
    if (isRequestComplete(frames) && this.transfer(frames)) {
      this._frames.set([]);
    }
  }
}
