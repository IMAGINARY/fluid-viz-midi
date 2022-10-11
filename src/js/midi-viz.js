// eslint-disable-next-line max-classes-per-file
import * as JZZ from 'jzz';
import * as JZZSynthTiny from 'jzz-synth-tiny';
import * as JZZMidiSmf from 'jzz-midi-smf';
import * as JZZGuiPlayer from 'jzz-gui-player';
import * as Victor from 'victor';

import { splat, generateColor, config } from './script';

import MidiInput from '../ts/midi-input.ts';
import MidiMessageProcessor from '../ts/midi-message-processor.ts';

JZZSynthTiny(JZZ);
JZZMidiSmf(JZZ);
JZZGuiPlayer(JZZ);

class ADSREnvelope {
  static CURVE = {
    LINEAR: 'linear',
    EXPONENTIAL: 'expoential',
  };

  static curveLinear(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
  }

  static curveExponential(value, inMin, inMax, outMin, outMax) {
    return (outMax / outMin) ** ((value - inMin) / (inMax - inMin)) * outMin;
  }

  static DEFAULTS = {
    attackDuration: 0.1,
    attackCurve: ADSREnvelope.CURVE.LINEAR,
    peakLevel: 1.0,
    decayDuration: 1.0,
    decayCurve: ADSREnvelope.CURVE.LINEAR,
    sustainDuration: Infinity,
    sustainLevel: 0.5,
    releaseDuration: 0.1,
    releaseCurve: ADSREnvelope.CURVE.LINEAR,
  };

  static getCurveByName(name) {
    switch (name) {
      case ADSREnvelope.CURVE.LINEAR:
        return ADSREnvelope.curveLinear;
      case ADSREnvelope.CURVE.EXPONENTIAL:
        return ADSREnvelope.curveExponential;
      default:
        throw new Error(`Unknown curve "${name}"`);
    }
  }

  constructor(options) {
    this.options = { ...ADSREnvelope.DEFAULTS, ...options };
    const {
      attackDuration,
      attackCurve,
      peakLevel,
      decayDuration,
      decayCurve,
      sustainDuration,
      sustainLevel,
      releaseDuration,
      releaseCurve,
    } = this.options;
    this.attack = {
      duration: attackDuration,
      targetLevel: peakLevel,
      curve: ADSREnvelope.getCurveByName(attackCurve),
    };
    this.decay = {
      duration: decayDuration,
      targetLevel: sustainLevel,
      curve: ADSREnvelope.getCurveByName(decayCurve),
    };
    this.release = {
      duration: releaseDuration,
      targetLevel: 0,
      curve: ADSREnvelope.getCurveByName(releaseCurve),
    };
    this.gateDuration = attackDuration + decayDuration + sustainDuration;
  }

  _valueAtADS(elapsedTime) {
    if (elapsedTime <= 0.0) {
      // Note did not yet start
      return 0.0;
    }

    // Determine the volume level at releaseTime
    let timeInSection = elapsedTime;
    let sourceLevel = 0.0;
    [this.attack, this.decay].forEach(({ duration, targetLevel, curve }) => {
      if (timeInSection <= duration) {
        // The current section is the one we have to apply the curve to
        curve(timeInSection, 0, duration, sourceLevel, targetLevel);
        return;
      }
      timeInSection -= duration;
      sourceLevel = targetLevel;
    });
    return this.options.sustainLevel;
  }

  _valueAtR(elapsedTimeSinceRelease, levelAtReleaseTime) {
    const { duration, targetLevel, curve } = this.release;
    if (elapsedTimeSinceRelease < duration) {
      return curve(
        elapsedTimeSinceRelease,
        0,
        duration,
        levelAtReleaseTime,
        targetLevel,
      );
    }
    return targetLevel;
  }

  _minReleaseTime(releaseTime = Infinity) {
    return Math.min(releaseTime, this.gateDuration);
  }

  valueAt(elapsedTime, releaseTime = Infinity) {
    if (elapsedTime <= 0.0) {
      // Note did not yet start
      return 0.0;
    }

    const minReleaseTime = this._minReleaseTime(releaseTime);

    if (elapsedTime < minReleaseTime) {
      // Note has not yet been released
      return this._valueAtADS(elapsedTime);
    }

    const timeInReleaseSection = elapsedTime - minReleaseTime;
    const levelAtReleaseTime = this._valueAtADS(minReleaseTime);
    return this._valueAtR(timeInReleaseSection, levelAtReleaseTime);
  }

  isOver(elapsedTime, releaseTime = Infinity) {
    const minReleaseTime = this._minReleaseTime(releaseTime);
    const timeInReleaseSection = elapsedTime - minReleaseTime;
    const { duration } = this.release;
    return timeInReleaseSection > duration;
  }
}

class Note {
  constructor(midiNote, midiVelocity, envelope) {
    this.midiNote = midiNote;
    this.midiVelocity = midiVelocity;
    this.envelope = envelope;
    this.startTime = performance.now() / 1000.0;
    this.releaseTime = Infinity;
    this.holdState = false;
    this.sustainState = false;
    this.shouldRelease = false;
  }

  elapsedTime() {
    return performance.now() / 1000.0 - this.startTime;
  }

  sustain(enable) {
    if (
      !enable &&
      this.sustainState &&
      this.shouldRelease &&
      !this.isHeld() &&
      !this.isOff()
    ) {
      this.forceOff();
    }
    this.holdState = enable;
  }

  isSustained() {
    return this.sustainState;
  }

  hold(enable) {
    if (
      !enable &&
      this.holdState &&
      this.shouldRelease &&
      !this.isSustained() &&
      !this.isOff()
    ) {
      this.forceOff();
    }
    this.holdState = enable;
  }

  isHeld() {
    return this.holdState;
  }

  isOff() {
    return this.releaseTime !== Infinity;
  }

  off() {
    this.shouldRelease = true;
    if (!this.isSustained() && !this.isHeld() && !this.isOff()) {
      this.forceOff();
    }
  }

  forceOff() {
    this.releaseTime = this.elapsedTime();
  }

  getVolume() {
    return (
      (this.midiVelocity / 127.0) * this.envelope.valueAt(this.elapsedTime())
    );
  }

  isOver() {
    return this.envelope.isOver(this.elapsedTime(), this.releaseTime);
  }
}

const adsrEnvelope = new ADSREnvelope({
  attackTime: 0.01,
  decayTime: 2,
  sustainDuration: 0,
  sustainLevel: 0.4,
  releaseTime: 0.7,
  attackCurve: ADSREnvelope.CURVE.LINEAR,
  decayCurve: ADSREnvelope.CURVE.EXPONENTIAL,
  releaseCurve: ADSREnvelope.CURVE.EXPONENTIAL,
});

const channelEnvelopes = Array(16).fill(adsrEnvelope);

class NoteEnvelopeSplash {
  static secondsPerRotation = 10;

  constructor(midiNote, midiVelocity, envelope) {
    this.note = new Note(midiNote, midiVelocity, envelope);
    this.angleOffset =
      (performance.now() * 0.001 * 2 * Math.PI) /
      NoteEnvelopeSplash.secondsPerRotation;

    this.color = generateColor();
    this.color.r *= 10;
    this.color.g *= 10;
    this.color.b *= 10;

    this.lastCoords = this.getPointerCoordinates();
    this.update();
  }

  getInterpolationParameter() {
    const t = this.note.elapsedTime();
    const speed = this.note.midiVelocity / 127.0;
    return 1.0 / (-1.0 - speed * t) ** 2.0 + 1.0;
  }

  getPointerCoordinates() {
    const radius = config.RADIUS;
    const splatRadius = Math.max(0.1, config.SPLAT_RADIUS) * 0.5;
    const center = new Victor(0.5, 0.5);

    const dir = new Victor(1, 0).rotate(
      this.angleOffset + (2 * Math.PI * this.note.midiNote) / 12,
    );
    const start = center
      .clone()
      .add(dir.clone().multiplyScalar(radius - splatRadius));
    const end = center;

    const t = this.getInterpolationParameter();
    const p = start.clone().mix(end, t);
    return p;
  }

  update() {
    const volume = this.note.getVolume();
    const factor = 100000.0 * volume;
    const p = this.getPointerCoordinates();
    const d = p
      .clone()
      .subtract(this.lastCoords)
      .multiply(new Victor(factor, factor));
    const attenuation = 40.0;
    const radius = config.SPLAT_RADIUS * (1.0 - (1.0 - volume) ** 8.0);
    splat(p.x, p.y, d.x, d.y, this.color, attenuation, radius);
    this.lastCoords = p;
  }
}

const channelNoteSplashLists = new Array(16).fill(null).map(() => []);
const channelHold = new Array(16).fill(false);

function setHold(midiChannel, midiControllerValue) {
  const hold = midiControllerValue >= 64;
  channelHold[midiChannel] = hold;
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.hold(hold));
}

function setSostenuto(midiChannel, midiControllerValue) {
  const sostenuto = midiControllerValue >= 64;
  channelNoteSplashLists[midiChannel].forEach((ns) =>
    ns.note.sustain(sostenuto),
  );
}

function allSoundsOff(midiChannel) {
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.forceOff());
}

function allNotesOff(midiChannel) {
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.off());
}

function allControllersOff(midiChannel) {
  channelHold[midiChannel] = false;
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.hold(false));
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.sustain(false));
}

function releaseADSRNoteSplash(midiChannel, midiNote, force = false) {
  const noteSplashList = channelNoteSplashLists[midiChannel];
  const turnOff = force ? (note) => note.forceOff() : (note) => note.off();
  noteSplashList
    .map(({ note }) => note)
    .filter((note) => note.midiNote === midiNote)
    .forEach(turnOff);
}

function addADSRNoteSplash(midiChannel, midiNote, midiVelocity) {
  releaseADSRNoteSplash(midiChannel, midiNote, true);

  const noteSplashList = channelNoteSplashLists[midiChannel];
  const adsr = channelEnvelopes[midiChannel];
  const noteSplash = new NoteEnvelopeSplash(midiNote, midiVelocity, adsr);
  noteSplash.note.hold(channelHold[midiChannel]);

  noteSplashList.push(noteSplash);
}

function updateADSRNoteSplashes() {
  channelNoteSplashLists.forEach((noteSplashList) => {
    for (let i = noteSplashList.length - 1; i >= 0; i -= 1) {
      const noteSplash = noteSplashList[i];
      noteSplash.update();
      if (noteSplash.note.isOver()) {
        noteSplashList.splice(i, 1);
      }
    }
  });
}

function parseMidiChannelMask(mask) {
  if (!/^[01]{16}$/.test(mask)) {
    // eslint-disable-next-line no-console
    console.error(
      `MIDI channel mask "${mask}" has invalid format. It must be 16 characters being either '0' or '1'. Channel 1 corresponds to the rightmost bit.`,
    );
  }
  return Number.parseInt(mask, 2);
}

const searchParams = new URLSearchParams(window.location.search);
const midiPortNames = searchParams.getAll('midiPort');
const midiChannelMask = parseMidiChannelMask(
  searchParams.get('midiChannelMask') ?? '1111111111111111',
);
const useMidiPlayer = searchParams.has('useMidiPlayer');

function noteOff(channel, note) {
  releaseADSRNoteSplash(channel, note);
}

function noteOn(channel, note, velocity) {
  addADSRNoteSplash(channel, note, velocity);
}

function reset() {
  for (let channel = 0; channel < 16; channel += 1) {
    allControllersOff(channel);
    allSoundsOff(channel);
  }
}

function animateSplashes() {
  requestAnimationFrame(animateSplashes);
  updateADSRNoteSplashes();
}
animateSplashes();

function registerMidiMessageEventHandlers(processor) {
  processor.on('note-on', noteOn);
  processor.on('note-off', noteOff);
  processor.on('control-change-hold', setHold);
  processor.on('control-change-sostenuto', setSostenuto);
  processor.on('control-change-all-sounds-off', allSoundsOff);
  processor.on('control-change-all-notes-off', allNotesOff);
  processor.on('control-change-all-controllers-off', allControllersOff);
  processor.on('sysex-realtime-reset', reset);
}

async function setupMidiInput(midiInputOptions) {
  const midiAccess = await navigator.requestMIDIAccess();
  const midiInput = await MidiInput.createOnceAvailable(
    midiAccess,
    midiPortNames[0],
    midiInputOptions,
  );
  console.log('Connected to MIDI input!', midiInput);
  return midiInput.getProcessor();
}

async function setupMidiPlayer(midiProcessorOptions) {
  const playerContainerElement = document.getElementById(
    'midi-player-container',
  );
  JZZ.synth.Tiny.register('Tiny WebAudio synthesizer');
  const midiPlayerOptions = {
    at: playerContainerElement,
    ports: ['Tiny WebAudio synthesizer'],
    file: true,
  };
  const midiProcessor = new MidiMessageProcessor(midiProcessorOptions);
  const midiPlayer = new JZZ.gui.Player(midiPlayerOptions);
  midiPlayer.connect(midiProcessor.process.bind(midiProcessor));
  registerMidiMessageEventHandlers(midiProcessor);

  let playerAutoHideTimeout = 0;

  function showPlayer() {
    playerContainerElement.style.opacity = '1.0';
    clearTimeout(playerAutoHideTimeout);
    playerAutoHideTimeout = setTimeout(() => {
      playerContainerElement.style.opacity = '0.0';
    }, 1000);
  }

  showPlayer();
  window.addEventListener('mousemove', showPlayer);

  return Promise.resolve(midiProcessor);
}

async function main() {
  const options = { channelMask: midiChannelMask };
  const initializer = useMidiPlayer ? setupMidiPlayer : setupMidiInput;
  const processor = await initializer(options);
  registerMidiMessageEventHandlers(processor);
}

main().catch((e) => console.log(e));

/**
 * TODO:
 *  - Prefer warm colors over cold colors
 *  - Loop through pre-defined sets of visualization parameters
 */
