import { EventEmitter } from 'events';
import TypedEmitter from 'typed-emitter';

export type MidiMessageProcessorOptions = { channelMask: number };

const defaultOptions: MidiMessageProcessorOptions = {
  channelMask: 0b1111111111111111,
};

type Tuple<
  T,
  N extends number,
  R extends readonly T[] = [],
> = R['length'] extends N ? R : Tuple<T, N, readonly [T, ...R]>;
type TypedListener<T, N extends number> = (...args: Tuple<T, N>) => unknown;

type MidiMessageProcessorEvents = {
  'note-on': TypedListener<number, 3>;
  'note-off': TypedListener<number, 3>;
  'control-change': (
    channel: number,
    data0?: number,
    data1?: number,
  ) => unknown;
  'control-change-hold': TypedListener<number, 2>;
  'control-change-sostenuto': TypedListener<number, 2>;
  'control-change-all-sounds-off': TypedListener<number, 2>;
  'control-change-all-notes-off': TypedListener<number, 2>;
  'control-change-all-controllers-off': TypedListener<number, 2>;
  'sysex-realtime-reset': TypedListener<number, 0>;
};

const eventNames: (keyof MidiMessageProcessorEvents)[] = [
  'note-on',
  'note-off',
  'control-change',
  'control-change-hold',
  'control-change-sostenuto',
  'control-change-all-sounds-off',
  'control-change-all-notes-off',
  'control-change-all-controllers-off',
  'sysex-realtime-reset',
];

export default class MidiMessageProcessor extends (EventEmitter as new () => TypedEmitter<MidiMessageProcessorEvents>) {
  public channelMask: number;

  constructor(options: Partial<MidiMessageProcessorOptions> = {}) {
    super();
    const { channelMask } = { ...defaultOptions, ...options };
    this.channelMask = channelMask;
  }

  // eslint-disable-next-line class-methods-use-this
  eventNames(): (keyof MidiMessageProcessorEvents)[] {
    return eventNames;
  }

  process(data: Uint8Array | number[]) {
    return this.handleMidiMessageData(data);
  }

  handleEvent(event: WebMidi.MIDIMessageEvent) {
    return this.handleMidiMessageEvent(event);
  }

  handleMidiMessageEvent({ data }: WebMidi.MIDIMessageEvent) {
    this.handleMidiMessageData(data);
  }

  protected handleMidiMessageData(data: Uint8Array | number[]) {
    /* eslint-disable no-bitwise */
    const status = data[0];
    //
    const type = status >> 4;
    if (type >= 0b1000 && type <= 0b1110) {
      // MIDI channel message
      const subtype = type & 0b0111;
      const channel = status & 0b00001111;
      this.handleMidiChannelMessage(subtype, channel, ...data.slice(1));
    } else {
      // MIDI system message
      const subtype = status & 0b00001111;
      this.handleMidiSystemMessage(subtype, ...data.slice(1));
    }
    /* eslint-enable no-bitwise */
  }

  protected channelMessageFunc1Map: {
    [key: number]: (channel: number, data0: number) => unknown;
  } = {}; // channel messages with 1 data byte

  protected channelMessageFunc2Map: {
    [key: number]: (channel: number, data0: number, data1: number) => unknown;
  } = {
    0b000: this.handleNoteOffMessage.bind(this),
    0b001: this.handleNoteOnMessage.bind(this),
    0b011: this.handleControlChangeMessage2.bind(this),
  }; // channel messages with 2 data bytes

  protected useChannel(channel: number) {
    /* eslint-disable no-bitwise */
    const channelBit = 0b1 << channel;
    return (this.channelMask & channelBit) !== 0b0;
    /* eslint-enable no-bitwise */
  }

  protected handleMidiChannelMessage(
    subtype: number,
    channel: number,
    ...data: number[]
  ) {
    if (!this.useChannel(channel)) return;

    if (data.length === 1) {
      const func = this.channelMessageFunc1Map[subtype];
      if (func) func(channel, data[0]);
    } else if (data.length === 2) {
      const func = this.channelMessageFunc2Map[subtype];
      if (func) func(channel, data[0], data[1]);
    }
  }

  protected systemMessageFuncMap: {
    [key: number]: (...data: number[]) => unknown;
  } = {
    0b1111: this.handleResetMessage.bind(this),
  };

  handleMidiSystemMessage(subtype: number, ...data: number[]) {
    const func = this.systemMessageFuncMap[subtype];
    if (func) func(...data);
  }

  handleMidiControlChangeMessage(
    channel: number,
    controller: number,
    value: number,
  ) {
    const controllerFunc = this.controllerFuncMap[controller];
    if (controllerFunc) controllerFunc(channel, value);
  }

  protected controllerFuncMap: {
    [key: number]: (channel: number, value: number) => unknown;
  } = {
    64: this.handleControlChangeHoldMessage.bind(this),
    66: this.handleControlChangeSostenutoMessage.bind(this),
    120: this.handleControlChangeAllSoundsOffMessage.bind(this),
    123: this.handleControlChangeAllNotesOffMessage.bind(this),
    127: this.handleControlChangeAllControllersOffMessage.bind(this),
  };

  handleNoteOffMessage(channel: number, note: number, velocity: number) {
    this.emit('note-off', channel, note, velocity);
  }

  handleNoteOnMessage(channel: number, note: number, velocity: number) {
    this.emit('note-on', channel, note, velocity);
  }

  handleControlChangeMessage2(
    channel: number,
    controller: number,
    value: number,
  ) {
    this.emit('control-change', channel, controller, value);
    const controllerFunc = this.controllerFuncMap[controller];
    if (controllerFunc) controllerFunc(channel, value);
  }

  handleControlChangeHoldMessage(channel: number, value: number) {
    this.emit('control-change-hold', channel, value);
  }

  handleControlChangeSostenutoMessage(channel: number, value: number) {
    this.emit('control-change-sostenuto', channel, value);
  }

  handleControlChangeAllSoundsOffMessage(channel: number, value: number) {
    this.emit('control-change-all-sounds-off', channel, value);
  }

  handleControlChangeAllNotesOffMessage(channel: number, value: number) {
    this.emit('control-change-all-notes-off', channel, value);
  }

  handleControlChangeAllControllersOffMessage(channel: number, value: number) {
    this.emit('control-change-all-controllers-off', channel, value);
  }

  handleResetMessage() {
    this.emit('sysex-realtime-reset');
  }
}
