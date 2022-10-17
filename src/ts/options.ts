type Options = {
  midiPortName?: string;
  midiChannelMask: number;
  pauseParameterAnimation: boolean;
  splatGroupSize: number;
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

function parseSplatGroupSize(size: string | null, defaultSize: number) {
  if (size === null) return defaultSize;

  if (!/^[1-9][0-9]*$/.test(size)) {
    const errorMessage = `Splat group size "${size}" has invalid format. It must be a positive integer. Falling back to the default mask ${defaultSize}.`;
    // eslint-disable-next-line no-console
    console.error(errorMessage);
    return defaultSize;
  }

  return Number.parseInt(size, 10);
}

function getOptions(): Options {
  const searchParams = new URLSearchParams(window.location.search);

  const midiPortName = searchParams.get('midiPort');
  const defaultMask = 0b1111111111111111;
  const midiChannelMask = parseMidiChannelMask(
    searchParams.get('midiChannelMask'),
    defaultMask,
  );
  const pauseParameterAnimation = searchParams.has('pauseParameterAnimation');
  const splatGroupSize = parseSplatGroupSize(
    searchParams.get('splatGroupSize'),
    64,
  );

  return {
    midiChannelMask,
    ...(midiPortName === null ? {} : { midiPortName }),
    pauseParameterAnimation,
    splatGroupSize,
  };
}

const options: Readonly<Options> = getOptions();

export default options;
