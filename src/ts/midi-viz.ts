import MidiInput from './midi-input';
import MidiMessageProcessor, {
  MidiMessageProcessorOptions,
} from './midi-message-processor';
import * as NoteSplasher from './note-splasher';
import { createJzzPlayer } from './jzz';
import options from './options';

function registerMidiMessageEventHandlers(processor: MidiMessageProcessor) {
  processor.on('note-on', NoteSplasher.noteOn);
  processor.on('note-off', NoteSplasher.noteOff);
  processor.on('control-change-hold', NoteSplasher.setHold);
  processor.on('control-change-sostenuto', NoteSplasher.setSostenuto);
  processor.on('control-change-all-sounds-off', NoteSplasher.allSoundsOff);
  processor.on('control-change-all-notes-off', NoteSplasher.allNotesOff);
  processor.on(
    'control-change-all-controllers-off',
    NoteSplasher.allControllersOff,
  );
  processor.on('sysex-realtime-reset', NoteSplasher.reset);
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
