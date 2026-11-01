// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FSComponent, Subject } from '@microsoft/msfs-sdk';
import { InputField, InteractionMode } from './InputField';

const trigger = vi.fn();

const dataEntryFormat = {
  maxDigits: 5,
  format: () => ['', null, null],
  parse: async (input: string) => input,
  reFormatTrigger: Subject.create(0),
};

function mountField(disabled: Subject<boolean>) {
  const ref = FSComponent.createRef<InputField<string>>();
  const consumer = { handle: () => undefined };
  FSComponent.render(
    <InputField<string>
      ref={ref}
      dataEntryFormat={dataEntryFormat as any}
      value={Subject.create<string | null>(null)}
      disabled={disabled}
      errorHandler={() => undefined}
      hEventConsumer={consumer as any}
      interactionMode={Subject.create(InteractionMode.Touchscreen)}
    />,
    document.body,
  );
  return ref.instance;
}

describe('InputField keyboard capture in touchscreen mode', () => {
  beforeEach(() => {
    trigger.mockClear();
    (globalThis as any).Coherent = { trigger };
    (globalThis as any).Utils = { generateGUID: () => 'test-guid' };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const unfocusCalls = () => trigger.mock.calls.filter((call) => call[0] === 'UNFOCUS_INPUT_FIELD');

  it('gives the keyboard back when the field is disabled while it is focused', () => {
    const disabled = Subject.create(false);
    const field = mountField(disabled);
    field.onFocus();
    expect(trigger.mock.calls.some((call) => call[0] === 'FOCUS_INPUT_FIELD')).toBe(true);

    (field as any).modifiedFieldValue.set('123');
    disabled.set(true);
    field.onBlur();

    expect(unfocusCalls().length).toBe(1);
    expect((field as any).modifiedFieldValue.get()).toBeNull();
  });

  it('keeps the keyboard when the text input loses the DOM focus', () => {
    const field = mountField(Subject.create(false));
    field.onFocus();
    field.textInputRef.instance.dispatchEvent(new Event('blur'));
    expect(unfocusCalls().length).toBe(0);
  });
});
