// eslint-disable-next-line max-classes-per-file
import * as JZZ from 'jzz';
import * as JZZSynthTiny from 'jzz-synth-tiny';
import * as JZZMidiSmf from 'jzz-midi-smf';
import * as JZZGuiPlayer from 'jzz-gui-player';

import MidiInput from '../ts/midi-input.ts';
import MidiMessageProcessor from '../ts/midi-message-processor.ts';
import ADSREnvelope from '../ts/adsr-envelope.ts';
import NoteEnvelopeSplash from '../ts/note-envelope-splash.ts';

JZZSynthTiny(JZZ);
JZZMidiSmf(JZZ);
JZZGuiPlayer(JZZ);

const adsrEnvelope = new ADSREnvelope({
  attackTime: 0.01,
  decayTime: 2,
  sustainDuration: 0,
  sustainLevel: 0.4,
  releaseTime: 0.7,
  attackCurve: ADSREnvelope.CURVES.LINEAR,
  decayCurve: ADSREnvelope.CURVES.EXPONENTIAL,
  releaseCurve: ADSREnvelope.CURVES.EXPONENTIAL,
});

const channelEnvelopes = Array(16).fill(adsrEnvelope);

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
