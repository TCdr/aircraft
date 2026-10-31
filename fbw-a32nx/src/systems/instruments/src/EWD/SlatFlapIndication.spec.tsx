// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Word, Arinc429SignStatusMatrix } from '@flybywiresim/fbw-sdk';
import { EventBus, FSComponent } from '@microsoft/msfs-sdk';
import { describe, expect, it } from 'vitest';
import { FadecEngineState } from './AvailIndication';
import { Slats } from './Slats';
import { isSlatFlapControlLost, slatFlapIndication, SlatFlapIndicationInputs } from './SlatFlapIndication';

const normal: SlatFlapIndicationInputs = {
  sfccInvalid: false,
  wingtipBrakesOn: false,
  controlLost: false,
  bothHydraulicSystemsLost: false,
  onGroundEnginesStopped: false,
};

/* Flaps and slats indication on the E/WD */
describe('E/WD S and F legends, slat and flap positions', () => {
  it('are white / green with a valid SFCC, pressurised hydraulics and no wingtip brake', () => {
    expect(slatFlapIndication(normal)).toEqual({ amber: false, locked: false });
  });

  it('turn amber when both relevant hydraulic systems fail', () => {
    expect(slatFlapIndication({ ...normal, bothHydraulicSystemsLost: true }).amber).toBe(true);
  });

  it('stay white with both hydraulic systems unpressurised on ground with both engines stopped', () => {
    expect(slatFlapIndication({ ...normal, bothHydraulicSystemsLost: true, onGroundEnginesStopped: true }).amber).toBe(
      false,
    );
  });

  it('turn amber with the S (F) LOCKED legend when the wingtip brakes are on', () => {
    expect(slatFlapIndication({ ...normal, wingtipBrakesOn: true })).toEqual({ amber: true, locked: true });
  });

  it('turn amber on a slats (flaps) fault, without the LOCKED legend', () => {
    expect(slatFlapIndication({ ...normal, controlLost: true })).toEqual({ amber: true, locked: false });
  });

  it('stay amber without a LOCKED legend when the SFCC data are invalid', () => {
    expect(slatFlapIndication({ ...normal, sfccInvalid: true, wingtipBrakesOn: true })).toEqual({
      amber: true,
      locked: false,
    });
  });
});

describe('E/WD slats (flaps) fault', () => {
  it('is the loss of both SFCC channels only', () => {
    expect(isSlatFlapControlLost(true, true)).toBe(true);
    expect(isSlatFlapControlLost(true, false)).toBe(false);
    expect(isSlatFlapControlLost(false, true)).toBe(false);
  });
});

describe('E/WD slat / flap indication (Slats component)', () => {
  const SLAT_FAULT_BIT = 11;
  const FLAP_FAULT_BIT = 12;
  const SLAT_WTB_ENGAGED_BIT = 15;
  const FLAP_WTB_ENGAGED_BIT = 16;

  const statusWord = (bits: number[], ssm = Arinc429SignStatusMatrix.NormalOperation) =>
    Arinc429Word.getRawWord(
      bits.reduce((word, bit) => word | (1 << (bit - 1)), 0),
      ssm,
    );

  interface Situation {
    sfcc1Bits?: number[];
    sfcc2Bits?: number[];
    sfcc1Ssm?: Arinc429SignStatusMatrix;
    sfcc2Ssm?: Arinc429SignStatusMatrix;
    green?: boolean;
    blue?: boolean;
    yellow?: boolean;
    engineState?: number;
    onGround?: boolean;
  }

  /** Renders the real Slats component and feeds it through the event bus like the SFCC and the simvar publisher do */
  function show(situation: Situation) {
    const bus = new EventBus();
    const container = document.createElement('div');
    FSComponent.render(
      <svg>
        <Slats bus={bus} />
      </svg>,
      container,
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const publisher = bus.getPublisher<any>();
    const publish = (topic: string, value: number | boolean) => publisher.pub(topic, value, false, false);
    publish('a32nx_sfcc_1_slats_flaps_status', statusWord(situation.sfcc1Bits ?? [], situation.sfcc1Ssm));
    publish('a32nx_sfcc_2_slats_flaps_status', statusWord(situation.sfcc2Bits ?? [], situation.sfcc2Ssm));
    publish('greenHydPressurised', situation.green ?? true);
    publish('blueHydPressurised', situation.blue ?? true);
    publish('yellowHydPressurised', situation.yellow ?? true);
    publish('engine1State', situation.engineState ?? FadecEngineState.On);
    publish('engine2State', situation.engineState ?? FadecEngineState.On);
    publish('left1LandingGear', situation.onGround ?? false);
    publish('right1LandingGear', situation.onGround ?? false);

    const legend = (text: string) => {
      const element = Array.from(container.querySelectorAll('text')).find((t) => t.textContent?.trim() === text);
      if (!element) {
        throw new Error(`no ${text} legend`);
      }
      return element;
    };
    return {
      slatsLegendAmber: legend('S').classList.contains('Amber'),
      flapsLegendAmber: legend('F').classList.contains('Amber'),
      slatsLockedShown: legend('S LOCKED').getAttribute('visibility') === 'visible',
      flapsLockedShown: legend('F LOCKED').getAttribute('visibility') === 'visible',
      // the slat position is the first path/line with the AmberStroke choice, the flap position the last
      slatsPositionAmber: container.querySelector('path.Path')?.classList.contains('AmberStroke'),
      flapsPositionAmber: Array.from(container.querySelectorAll('path.Path')).pop()?.classList.contains('AmberStroke'),
    };
  }

  it('shows S, F and the positions white / green with valid SFCCs and pressurised hydraulics', () => {
    const shown = show({});
    expect(shown.slatsLegendAmber).toBe(false);
    expect(shown.flapsLegendAmber).toBe(false);
    expect(shown.slatsPositionAmber).toBe(false);
    expect(shown.flapsPositionAmber).toBe(false);
    expect(shown.slatsLockedShown).toBe(false);
    expect(shown.flapsLockedShown).toBe(false);
  });

  it('colours S and the slat position amber and draws S LOCKED when the slat wingtip brakes are on, F untouched', () => {
    const shown = show({ sfcc1Bits: [SLAT_WTB_ENGAGED_BIT], sfcc2Bits: [SLAT_WTB_ENGAGED_BIT] });
    expect(shown.slatsLegendAmber).toBe(true);
    expect(shown.slatsPositionAmber).toBe(true);
    expect(shown.slatsLockedShown).toBe(true);
    expect(shown.flapsLegendAmber).toBe(false);
    expect(shown.flapsLockedShown).toBe(false);
  });

  it('colours F and the flap position amber and draws F LOCKED when the flap wingtip brakes are on, S untouched', () => {
    const shown = show({ sfcc1Bits: [FLAP_WTB_ENGAGED_BIT] });
    expect(shown.flapsLegendAmber).toBe(true);
    expect(shown.flapsPositionAmber).toBe(true);
    expect(shown.flapsLockedShown).toBe(true);
    expect(shown.slatsLegendAmber).toBe(false);
    expect(shown.slatsLockedShown).toBe(false);
  });

  it('colours only the slats amber when both SFCCs report the slat fault, without a LOCKED legend', () => {
    const shown = show({ sfcc1Bits: [SLAT_FAULT_BIT], sfcc2Bits: [SLAT_FAULT_BIT] });
    expect(shown.slatsLegendAmber).toBe(true);
    expect(shown.slatsLockedShown).toBe(false);
    expect(shown.flapsLegendAmber).toBe(false);
  });

  it('keeps the flaps normal with the flap fault bit in one SFCC only', () => {
    expect(show({ sfcc1Bits: [FLAP_FAULT_BIT] }).flapsLegendAmber).toBe(false);
  });

  it('uses the green and blue systems for the slats, the green and yellow systems for the flaps', () => {
    const blueAndGreenLost = show({ green: false, blue: false });
    expect(blueAndGreenLost.slatsLegendAmber).toBe(true);
    expect(blueAndGreenLost.flapsLegendAmber).toBe(false);

    const yellowAndGreenLost = show({ green: false, yellow: false });
    expect(yellowAndGreenLost.flapsLegendAmber).toBe(true);
    expect(yellowAndGreenLost.slatsLegendAmber).toBe(false);

    expect(show({ blue: false, yellow: false }).slatsLegendAmber).toBe(false);
  });

  it('stays white with the hydraulics lost on ground with both engines stopped', () => {
    const shown = show({ green: false, blue: false, yellow: false, onGround: true, engineState: FadecEngineState.Off });
    expect(shown.slatsLegendAmber).toBe(false);
    expect(shown.flapsLegendAmber).toBe(false);
  });

  it('turns both amber without a LOCKED legend when no SFCC word is valid', () => {
    const invalid = Arinc429SignStatusMatrix.FailureWarning;
    const shown = show({
      sfcc1Bits: [SLAT_WTB_ENGAGED_BIT],
      sfcc1Ssm: invalid,
      sfcc2Bits: [SLAT_WTB_ENGAGED_BIT],
      sfcc2Ssm: invalid,
    });
    expect(shown.slatsLegendAmber).toBe(true);
    expect(shown.flapsLegendAmber).toBe(true);
    expect(shown.slatsLockedShown).toBe(false);
  });
});
