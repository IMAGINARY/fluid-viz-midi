# MIDI Fluid Vizualization

A fluid simulation that dances to your MIDI music. Play a MIDI file or a real
MIDI instrument and the notes will become visible in the fluid simulation.

Supported MIDI messages: Note on, Note off, Sustain pedal ("Hold"), Sostenuto
pedal, All notes off, All sounds off, all Controllers off, Reset

![Screenshot](./logo.png 'Fluid simulation screenshot')

## Options

Some options of the app can be configured via URL parameters:

- `midiPortName` (string; default: `undefined`): Name of the MIDI input port to
  grab the MIDI messages from. If not set, a MIDI file player will be made
  available.
- `midiChannelMask` (number; default: `1111111111111111`): Use the MIDI channels
  marked with `1`, ignore MIDI channels marked with `0`. Channel 1 corresponds
  to the leftmost character, Channel 16 to the rightmost.
- `pauseParameterAnimation` (boolean; default: `false`): Pause the built-in
  animation of the visualization parameters.
- `splatGroupSize` (number; default: `64`): Control how many notes are rendered
  together. For internal use, mostly.

## Credits

Created by [Christian Stussak](https://github.com/porst17) for IMAGINARY gGmbH,
based on the
[WebGL-based fluid simulation app by Pavel Dobryakov](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation).

[Aaron Montag](https://github.com/montaga).

## License

The code is available under the [MIT license](LICENSE).
