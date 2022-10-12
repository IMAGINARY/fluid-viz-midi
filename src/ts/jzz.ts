/* eslint-disable */
// @ts-nocheck
// This file contains the glue code to the untyped JZZ libraries
import JZZ from 'jzz';
import JZZSynthTiny from 'jzz-synth-tiny';
import JZZMidiSmf from 'jzz-midi-smf';
import JZZGuiPlayer from 'jzz-gui-player';

JZZSynthTiny(JZZ);
JZZMidiSmf(JZZ);
JZZGuiPlayer(JZZ);
JZZ.synth.Tiny.register('Tiny WebAudio synthesizer');

function createJzzPlayer(
  containerElement: HTMLDivElement,
  midiMessageCallback: (data: number[]) => unknown,
) {
  const midiPlayerOptions = {
    at: containerElement,
    ports: ['Tiny WebAudio synthesizer'],
    file: true,
  };
  const midiPlayer = new JZZ.gui.Player(midiPlayerOptions);
  midiPlayer.connect(midiMessageCallback);
}

export { createJzzPlayer };
