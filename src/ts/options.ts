type Options = {
  midiPortName?: string;
  midiChannelMask: number;
};

function parseMidiChannelMask(mask: string | null, defaultMask: number) {
  if (mask === null) return defaultMask;

  if (!/^[01]{16}$/.test(mask)) {
    const errorMessage = `MIDI channel mask "${mask}" has invalid format. It must be 16 characters being either '0' or '1'. Channel 1 corresponds to the rightmost bit. Falling back to the default mask ${defaultMask.toString(
      2,
    )}.`;
    // eslint-disable-next-line no-console
    console.error(errorMessage);
    return defaultMask;
  }

  return Number.parseInt(mask, 2);
}

function getOptions(): Options {
  const searchParams = new URLSearchParams(window.location.search);

  const midiPortName = searchParams.get('midiPort');
  const defaultMask = 0b1111111111111111;
  const midiChannelMask = parseMidiChannelMask(
    searchParams.get('midiChannelMask'),
    defaultMask,
  );

  return {
    midiChannelMask,
    ...(midiPortName === null ? {} : { midiPortName }),
  };
}

const options: Readonly<Options> = getOptions();

export default options;
