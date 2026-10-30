// @ts-strict-ignore
import React from 'react';
import ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const frameHandlers: (() => void)[] = [];
const stateSetterCalls = { count: 0 };

vi.mock('./hooks', () => ({
  useUpdate: (handler: () => void) => {
    frameHandlers.length = 0;
    frameHandlers.push(handler);
  },
  useInteractionEvents: () => {},
}));

// Counts the calls that reach React's state setters, because React drops an equal value silently after allocating the update
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const [state, setState] = actual.useState(initial);
      const countedSetState = actual.useCallback(
        (value: unknown) => {
          stateSetterCalls.count++;
          setState(value as never);
        },
        [setState],
      );
      return [state, countedSetState];
    },
  };
});

import { useGameVar, useGlobalVar, useInteractionSimVar, useSimVar, useSimVarList } from './simVars';

let container: HTMLDivElement;
let renderCount: number;
let latest: { value: unknown; setValue: (value: unknown) => void };

const Probe: React.FC<{ name: string; unit: string }> = ({ name, unit }) => {
  const [value, setValue] = useSimVar(name, unit as never);
  renderCount++;
  latest = { value, setValue };
  return <span>{String(value)}</span>;
};

const runFrame = () => act(() => frameHandlers.forEach((handler) => handler()));

describe('useSimVar', () => {
  let simValue: unknown;
  let byNameReads: number;
  let byIdReads: number;

  beforeEach(() => {
    simValue = 1;
    byNameReads = 0;
    byIdReads = 0;
    renderCount = 0;
    stateSetterCalls.count = 0;

    (global as any).SimVar = {
      GetRegisteredId: () => 7,
      GetSimVarValue: () => {
        byNameReads++;
        return simValue;
      },
      GetSimVarValueFastReg: () => {
        byIdReads++;
        return simValue;
      },
      SetSimVarValue: vi.fn((_name, _unit, value) => {
        simValue = value;
        return Promise.resolve();
      }),
    };

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  const mount = (unit = 'number') => act(() => void ReactDOM.render(<Probe name="L:TEST" unit={unit} />, container));

  it('does not set state or render again while the value is unchanged', () => {
    mount();
    const rendersAfterMount = renderCount;

    runFrame();
    runFrame();
    runFrame();

    expect(stateSetterCalls.count).toBe(0);
    expect(renderCount).toBe(rendersAfterMount);
  });

  it('renders once with the new value when the value changes', () => {
    mount();
    const rendersAfterMount = renderCount;

    simValue = 5;
    runFrame();
    runFrame();

    expect(latest.value).toBe(5);
    expect(stateSetterCalls.count).toBe(1);
    expect(renderCount).toBe(rendersAfterMount + 1);
  });

  it('does not loop on NaN', () => {
    simValue = NaN;
    mount();
    const rendersAfterMount = renderCount;

    runFrame();
    runFrame();

    expect(latest.value).toBeNaN();
    expect(stateSetterCalls.count).toBe(0);
    expect(renderCount).toBe(rendersAfterMount);
  });

  it('reads numeric units through the registered id', () => {
    mount('bool');
    byNameReads = 0;
    byIdReads = 0;

    runFrame();

    expect(byIdReads).toBe(1);
    expect(byNameReads).toBe(0);
  });

  it('reads string units by name', () => {
    simValue = 'ABC';
    mount('string');
    byNameReads = 0;
    byIdReads = 0;

    simValue = 'DEF';
    runFrame();

    expect(latest.value).toBe('DEF');
    expect(byNameReads).toBe(1);
    expect(byIdReads).toBe(0);
  });

  it('reads by name when the sim has no registered id reader', () => {
    delete (global as any).SimVar.GetSimVarValueFastReg;
    mount();
    byNameReads = 0;

    simValue = 3;
    runFrame();

    expect(latest.value).toBe(3);
    expect(byNameReads).toBe(1);
  });

  it('writes through the setter and shows the written value', () => {
    mount();

    act(() => latest.setValue(9));

    expect((global as any).SimVar.SetSimVarValue).toHaveBeenCalledWith('L:TEST', 'number', 9);
    expect(latest.value).toBe(9);
    expect(container.textContent).toBe('9');
  });

  it('passes the current value to a functional setter', () => {
    simValue = 4;
    mount();

    act(() => latest.setValue((old: number) => old + 1));

    expect(latest.value).toBe(5);
  });
});

describe('the other SimVar hooks', () => {
  let simValues: unknown[];
  let renderCount: number;
  let latestValue: unknown;

  beforeEach(() => {
    simValues = [1, 2];
    renderCount = 0;
    stateSetterCalls.count = 0;

    (global as any).SimVar = {
      GetSimVarValue: (name: string) => simValues[name === 'L:TEST_A' ? 0 : 1],
      GetGlobalVarValue: () => simValues[0],
      GetGameVarValue: () => simValues[0],
      SetSimVarValue: vi.fn(() => Promise.resolve()),
    };

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
  });

  const hooks: [string, () => unknown][] = [
    ['useGlobalVar', () => useGlobalVar('TEST', 'number')],
    ['useGameVar', () => useGameVar('TEST', 'number')],
    ['useInteractionSimVar', () => useInteractionSimVar('L:TEST_A', 'number', 'H:TEST', 0)[0]],
  ];

  describe.each(hooks)('%s', (_, useHook) => {
    const HookProbe: React.FC = () => {
      latestValue = useHook();
      renderCount++;
      return null;
    };

    it('does not set state or render again while the value is unchanged, and renders once on a change', () => {
      act(() => void ReactDOM.render(<HookProbe />, container));
      const rendersAfterMount = renderCount;

      runFrame();
      runFrame();
      expect(stateSetterCalls.count).toBe(0);
      expect(renderCount).toBe(rendersAfterMount);

      simValues[0] = 8;
      runFrame();
      runFrame();
      expect(latestValue).toBe(8);
      expect(stateSetterCalls.count).toBe(1);
      expect(renderCount).toBe(rendersAfterMount + 1);
    });
  });

  describe('useSimVarList', () => {
    let latestList: unknown[];

    const ListProbe: React.FC = () => {
      [latestList] = useSimVarList(['L:TEST_A', 'L:TEST_B'], ['number', 'number'] as never);
      renderCount++;
      return null;
    };

    it('keeps the previous array and does not render while every value is unchanged', () => {
      act(() => void ReactDOM.render(<ListProbe />, container));
      const listAfterMount = latestList;
      const rendersAfterMount = renderCount;

      runFrame();
      runFrame();

      expect(latestList).toBe(listAfterMount);
      expect(renderCount).toBe(rendersAfterMount);
    });

    it('returns a new array and renders when one value changes', () => {
      act(() => void ReactDOM.render(<ListProbe />, container));
      const listAfterMount = latestList;

      simValues[1] = 5;
      runFrame();

      expect(latestList).not.toBe(listAfterMount);
      expect(latestList).toEqual([1, 5]);
      // React renders a component once more after a change, even when the next state is equal
      runFrame();
      const rendersWhenSettled = renderCount;

      runFrame();
      runFrame();
      expect(renderCount).toBe(rendersWhenSettled);
    });
  });
});
