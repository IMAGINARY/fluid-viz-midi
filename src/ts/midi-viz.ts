import MidiInput from './midi-input';
import MidiMessageProcessor, {
  MidiMessageProcessorOptions,
} from './midi-message-processor';
import ADSREnvelope from './adsr-envelope';
import NoteEnvelopeSplash from './note-envelope-splash';
import { HSVtoRGB } from './script';
import { createJzzPlayer } from './jzz';
import Note from './note';
import options from './options';

const adsrEnvelope = new ADSREnvelope({
  attackDuration: 0.01,
  decayDuration: 2,
  sustainDuration: 0,
  sustainLevel: 0.4,
  releaseDuration: 0.7,
  attackCurve: ADSREnvelope.CURVES.LINEAR,
  decayCurve: ADSREnvelope.CURVES.EXPONENTIAL,
  releaseCurve: ADSREnvelope.CURVES.EXPONENTIAL,
});

const channelEnvelopes: ADSREnvelope[] =
  Array<ADSREnvelope>(16).fill(adsrEnvelope);

const channelNoteSplashLists: NoteEnvelopeSplash[][] = new Array(16)
  .fill(null)
  .map(() => []);
const channelHold: boolean[] = new Array<boolean>(16).fill(false);

function setHold(midiChannel: number, midiControllerValue: number) {
  const hold = midiControllerValue >= 64;
  channelHold[midiChannel] = hold;
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.hold(hold));
}

function setSostenuto(midiChannel: number, midiControllerValue: number) {
  const sostenuto = midiControllerValue >= 64;
  channelNoteSplashLists[midiChannel].forEach((ns) =>
    ns.note.sustain(sostenuto),
  );
}

function allSoundsOff(midiChannel: number) {
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.forceOff());
}

function allNotesOff(midiChannel: number) {
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.off());
}

function allControllersOff(midiChannel: number) {
  channelHold[midiChannel] = false;
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.hold(false));
  channelNoteSplashLists[midiChannel].forEach((ns) => ns.note.sustain(false));
}

function releaseADSRNoteSplash(
  midiChannel: number,
  midiNote: number,
  force = false,
) {
  const noteSplashList = channelNoteSplashLists[midiChannel];
  const turnOff: (note: Note) => void = force
    ? (note) => note.forceOff()
    : (note) => note.off();
  noteSplashList
    .map(({ note }) => note)
    .filter((note) => note.midiNote === midiNote)
    .forEach(turnOff);
}

function addADSRNoteSplash(
  midiChannel: number,
  midiNote: number,
  midiVelocity: number,
) {
  releaseADSRNoteSplash(midiChannel, midiNote, true);

  const noteSplashList = channelNoteSplashLists[midiChannel];
  const adsr = channelEnvelopes[midiChannel];
  // FIXME: brightness should not be above 1.0; used here for backwards compatibility
  const brightness = 0.15 * 10.0;
  const color = HSVtoRGB(Math.random(), 1.0, brightness);
  const noteSplash = new NoteEnvelopeSplash(
    midiNote,
    midiVelocity,
    adsr,
    color,
  );
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

function noteOff(channel: number, note: number) {
  releaseADSRNoteSplash(channel, note);
}

function noteOn(channel: number, note: number, velocity: number) {
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

function registerMidiMessageEventHandlers(processor: MidiMessageProcessor) {
  processor.on('note-on', noteOn);
  processor.on('note-off', noteOff);
  processor.on('control-change-hold', setHold);
  processor.on('control-change-sostenuto', setSostenuto);
  processor.on('control-change-all-sounds-off', allSoundsOff);
  processor.on('control-change-all-notes-off', allNotesOff);
  processor.on('control-change-all-controllers-off', allControllersOff);
  processor.on('sysex-realtime-reset', reset);
}

async function setupMidiInput(
  midiPortName: string,
  midiProcessorOptions: MidiMessageProcessorOptions,
): Promise<MidiMessageProcessor> {
  /* eslint-disable no-console */
  const midiAccess = await navigator.requestMIDIAccess();
  console.log(`Trying to connect to MIDI input "${midiPortName}" ...`);
  const midiInput = await MidiInput.createOnceAvailable(
    midiAccess,
    midiPortName,
    midiProcessorOptions,
  );
  console.log('Connected to MIDI input!', midiInput);
  return midiInput.getProcessor();
  /* eslint-enable no-console */
}

async function setupMidiPlayer(
  midiProcessorOptions: MidiMessageProcessorOptions,
) {
  /* eslint-disable no-console */
  const playerContainerElementSelector = '#midi-player-container';
  const playerContainerElement = document.querySelector<HTMLDivElement>(
    playerContainerElementSelector,
  );
  if (playerContainerElement === null) {
    const errMsg = `No element matching query ${playerContainerElementSelector}.`;
    throw new Error(errMsg);
  }

  const midiProcessor = new MidiMessageProcessor(midiProcessorOptions);
  const midiDataCallback = midiProcessor.process.bind(midiProcessor);
  createJzzPlayer(playerContainerElement, midiDataCallback);

  let playerAutoHideTimeout = 0;

  const showPlayer = () => {
    playerContainerElement.style.opacity = '1.0';
    clearTimeout(playerAutoHideTimeout);
    playerAutoHideTimeout = setTimeout(() => {
      playerContainerElement.style.opacity = '0.0';
    }, 1000);
  };

  showPlayer();
  window.addEventListener('mousemove', showPlayer);

  console.log('Connected to built-in MIDI player.');

  return Promise.resolve(midiProcessor);
  /* eslint-enable no-console */
}

async function main() {
  const midiProcessorOptions = { channelMask: options.midiChannelMask };
  const { midiPortName } = options;
  let processor: MidiMessageProcessor;
  if (typeof midiPortName !== 'undefined') {
    processor = await setupMidiInput(midiPortName, midiProcessorOptions);
  } else {
    processor = await setupMidiPlayer(midiProcessorOptions);
  }
  registerMidiMessageEventHandlers(processor);
}

// eslint-disable-next-line no-console
main().catch((e) => console.error('Error during initialization.', e));

/**
 * TODO:
 *  - Prefer warm colors over cold colors
 *  - Loop through pre-defined sets of visualization parameters
 */
