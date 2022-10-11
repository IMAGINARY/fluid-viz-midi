import MidiMessageProcessor, {
  MidiMessageProcessorOptions,
} from './midi-message-processor';

export type MidiInputOptions = MidiMessageProcessorOptions;

export default class MidiInput {
  protected readonly port: WebMidi.MIDIInput;

  protected readonly processor: MidiMessageProcessor;

  constructor(
    inputPort: WebMidi.MIDIInput,
    options: Partial<MidiInputOptions> = {},
  ) {
    this.processor = new MidiMessageProcessor(options);
    inputPort.addEventListener(
      'statechange',
      this.handlePortStateChange.bind(this),
    );
    inputPort.addEventListener('midimessage', this.processor);
    this.port = inputPort;
    this.handlePortStateChange();
  }

  static async createOnceAvailable(
    midiAccess: WebMidi.MIDIAccess,
    midiInputPortName: string,
    options: Partial<MidiInputOptions> = {},
  ) {
    const portFilterPredicate = ({ name }: WebMidi.MIDIInput) =>
      name === midiInputPortName;
    const midiPorts = [...midiAccess.inputs.values()].filter(
      portFilterPredicate,
    );
    if (midiPorts.length > 0) {
      return new MidiInput(midiPorts[0], options);
    }
    return new Promise((resolve) => {
      const handleStateChange = ({ port }: WebMidi.MIDIConnectionEvent) => {
        if (
          MidiInput.isInputPort(port) &&
          port.state === 'connected' &&
          portFilterPredicate(port)
        ) {
          midiAccess.removeEventListener(
            'statechange',
            handleStateChange as EventListener,
          );
          resolve(new MidiInput(port, options));
        }
      };
      midiAccess.addEventListener('statechange', handleStateChange);
    });
  }

  private static isInputPort(
    port: WebMidi.MIDIPort,
  ): port is WebMidi.MIDIInput {
    return port.type === 'input';
  }

  handlePortStateChange() {
    if (this.port.state !== 'connected') {
      void this.port.open();
    }
  }

  getProcessor() {
    return this.processor;
  }
}
