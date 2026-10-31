// @ts-strict-ignore
import { UpdateThrottler } from '@flybywiresim/fbw-sdk';

class PeriodicSound {
  timeSinceLastPlayed: number;

  constructor(
    public sound: LegacySound,
    public period: number,
    public priority: number,
  ) {
    this.sound = sound;
    this.period = period;
    this.timeSinceLastPlayed = NaN;
  }
}

/** Periodic sound priorities, the higher one is played first when several are due and only one can play. */
export const SoundPriority = {
  GlideSlope: 1,
  SinkRate: 2,
  DontSink: 2,
  TooLow: 3,
  Terrain: 4,
  PullUp: 5,
};

export class LegacySoundManager {
  private updateThrottler = new UpdateThrottler(50);

  periodicList: PeriodicSound[];

  soundQueue: LegacySound[];

  playingSound: LegacySound;

  playingSoundRemaining: number;

  constructor() {
    this.periodicList = [];

    this.playingSound = null;
    this.playingSoundRemaining = NaN;
  }

  addPeriodicSound(sound: LegacySound, period = NaN, priority = 0) {
    if (!sound) {
      return;
    }

    let useLengthForPeriod = false;
    if (period < sound.length) {
      console.error(
        "A32NXSoundManager ERROR: Sound period can't be smaller than sound length. Using sound length instead.",
      );
      useLengthForPeriod = true;
    }

    let found = false;
    this.periodicList.forEach((element) => {
      if (element.sound.name === sound.name) {
        found = true;
      }
    });

    if (!found) {
      this.periodicList.push(new PeriodicSound(sound, useLengthForPeriod ? sound.length : period, priority));
    }
  }

  removePeriodicSound(sound: LegacySound) {
    if (!sound) {
      return;
    }

    for (let i = 0; i < this.periodicList.length; i++) {
      if (this.periodicList[i].sound.name === sound.name) {
        this.periodicList.splice(i, 1);
      }
    }
  }

  tryPlaySound(sound: LegacySound, retry = false, repeatOnce = false) {
    if (this.playingSound === null) {
      this.playingSound = sound;
      this.playingSoundRemaining = sound.length;

      Coherent.call('PLAY_INSTRUMENT_SOUND', sound.name).catch(console.error);
      if (repeatOnce) {
        this.soundQueue.push(sound);
      }
      return true;
    }
    if (retry) {
      this.soundQueue.push(sound);
      if (repeatOnce) {
        this.soundQueue.push(sound);
      }
      return false;
    }
    return false;
  }

  update(deltaTime: number) {
    const throttledT = this.updateThrottler.canUpdate(deltaTime);

    if (throttledT <= 0) {
      return;
    }

    if (this.playingSoundRemaining <= 0) {
      this.playingSound = null;
      this.playingSoundRemaining = NaN;
    } else if (this.playingSoundRemaining > 0) {
      this.playingSoundRemaining -= throttledT / 1000;
    }

    const deltaSeconds = throttledT / 1000;
    const isDue = (element: PeriodicSound) =>
      Number.isNaN(element.timeSinceLastPlayed) || element.timeSinceLastPlayed >= element.period;
    const secondsUntilDue = (element: PeriodicSound) =>
      isDue(element) ? 0 : element.period - element.timeSinceLastPlayed;

    this.periodicList.forEach((element) => {
      if (!isDue(element)) {
        element.timeSinceLastPlayed += deltaSeconds;
      }
    });

    // A due sound waits when a higher priority sound comes due before it would end, otherwise the gap between two
    // repeats of the high priority sound is long enough for the low priority one to take the channel again.
    let next: PeriodicSound = null;
    this.periodicList.forEach((element) => {
      if (!isDue(element) || (next !== null && element.priority <= next.priority)) {
        return;
      }
      const blocked = this.periodicList.some(
        (other) => other.priority > element.priority && secondsUntilDue(other) < element.sound.length,
      );
      if (!blocked) {
        next = element;
      }
    });

    if (next !== null && this.tryPlaySound(next.sound)) {
      next.timeSinceLastPlayed = 0;
    }
  }
}

// many lengths are approximate until we can get them accuratly (when boris re-makes them and we have the sources)
interface LegacySound {
  name: string;
  length: number;
}

export const soundList: Record<string, LegacySound> = {
  pull_up: {
    name: 'aural_pullup_new',
    length: 0.9,
  },
  sink_rate: {
    name: 'aural_sink_rate_new',
    length: 0.9,
  },
  dont_sink: {
    name: 'aural_dontsink_new',
    length: 0.9,
  },
  too_low_gear: {
    name: 'aural_too_low_gear',
    length: 0.8,
  },
  too_low_flaps: {
    name: 'aural_too_low_flaps',
    length: 0.8,
  },
  too_low_terrain: {
    name: 'aural_too_low_terrain',
    length: 0.9,
  },
  // The GPWS voices of the A32NX (A32NX_SoundManager.ts lengths), declared in the A380X sound.xml AvionicSounds
  terrain: {
    name: 'aural_terrain',
    length: 0.7,
  },
  glideslope_quiet: {
    name: 'aural_glideslope_quiet',
    length: 1.2,
  },
  glideslope_loud: {
    name: 'aural_glideslope_loud',
    length: 1.2,
  },
};
