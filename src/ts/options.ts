type Options = {
  midiPortName?: string;
  midiChannelMask: number;
  midiVelocityOffset: number;
  midiVelocityFactor: number;
  pauseParameterAnimation: boolean;
  idleTimeout: number;
  splatGroupSize: number;
};

const defaultOptions: Options = {
  midiChannelMask: 0b1111111111111111,
  pauseParameterAnimation: false,
  splatGroupSize: 64,
  midiVelocityOffset: 0,
  midiVelocityFactor: 1.0,
  idleTimeout: 60,
};

function parseMidiChannelMask(mask: string | null) {
  if (mask === null) return defaultOptions.midiChannelMask;

  if (!/^[01]{16}$/.test(mask)) {
    const errorMessage = `MIDI channel mask "${mask}" has invalid format. It must be 16 characters being either '0' or '1'. Channel 1 corresponds to the rightmost bit. Falling back to the default mask ${defaultOptions.midiChannelMask.toString(
      2,
    )}.`;
    // eslint-disable-next-line no-console
    console.error(errorMessage);
    return defaultOptions.midiChannelMask;
  }

  return Number.parseInt(mask, 2);
}

function parseSplatGroupSize(size: string | null) {
  if (size === null) return defaultOptions.splatGroupSize;

  if (!/^[1-9][0-9]*$/.test(size)) {
    const errorMessage = `Splat group size "${size}" has invalid format. It must be a positive integer. Falling back to the default splat group size ${defaultOptions.splatGroupSize}.`;
    // eslint-disable-next-line no-console
    console.error(errorMessage);
    return defaultOptions.splatGroupSize;
  }

  return Number.parseInt(size, 10);
}

function parseMidiVelocityOffset(midiVelocityOffset: string | null) {
  if (midiVelocityOffset === null) return defaultOptions.midiVelocityOffset;

  const num = Number.parseFloat(midiVelocityOffset);
  if (
    !/^(([0-9]+)|([0-9]*\.[0-9]+))$/.test(midiVelocityOffset) ||
    num < 0.0 ||
    num > 127.0
  ) {
    const errorMessage = `MIDI velocity offset "${midiVelocityOffset}" has invalid format. It must be a non-negative decimal <= 127. Falling back to the default MIDI velocity offset ${defaultOptions.midiVelocityOffset}.`;
    // eslint-disable-next-line no-console
    console.error(errorMessage);
    return defaultOptions.midiVelocityOffset;
  }

  return num;
}

function parseMidiVelocityFactor(midiVelocityFactor: string | null) {
  if (midiVelocityFactor === null) return defaultOptions.midiVelocityFactor;

  const num = Number.parseFloat(midiVelocityFactor);
  if (!/^(([0-9]+)|([0-9]*\.[0-9]+))$/.test(midiVelocityFactor) || num <= 0.0) {
    const errorMessage = `MIDI velocity factor "${midiVelocityFactor}" has invalid format. It must be a positive decimal. Falling back to the default MIDI velocity factor ${defaultOptions.midiVelocityFactor}.`;
    // eslint-disable-next-line no-console
    console.error(errorMessage);
    return defaultOptions.midiVelocityFactor;
  }

  return num;
}

function parseIdleTimeout(seconds: string | null) {
  if (seconds === null) return defaultOptions.idleTimeout;

  if (!/^[1-9][0-9]*$/.test(seconds)) {
    const errorMessage = `Idle timeout "${seconds}" has invalid format. It must be a positive integer. Falling back to the default idle timeout ${defaultOptions.idleTimeout}.`;
    // eslint-disable-next-line no-console
    console.error(errorMessage);
    return defaultOptions.idleTimeout;
  }

  return Number.parseInt(seconds, 10);
}

function getOptions(): Options {
  const searchParams = new URLSearchParams(window.location.search);

  const midiPortName = searchParams.get('midiPortName');
  const midiChannelMask = parseMidiChannelMask(
    searchParams.get('midiChannelMask'),
  );
  const midiVelocityOffset = parseMidiVelocityOffset(
    searchParams.get('midiVelocityOffset'),
  );
  const midiVelocityFactor = parseMidiVelocityFactor(
    searchParams.get('midiVelocityFactor'),
  );
  const pauseParameterAnimation = searchParams.has('pauseParameterAnimation');
  const idleTimeout = parseIdleTimeout(searchParams.get('idleTimeout'));
  const splatGroupSize = parseSplatGroupSize(
    searchParams.get('splatGroupSize'),
  );

  return {
    midiChannelMask,
    ...(midiPortName === null ? {} : { midiPortName }),
    midiVelocityOffset,
    midiVelocityFactor,
    pauseParameterAnimation,
    idleTimeout,
    splatGroupSize,
  };
}

const options: Readonly<Options> = getOptions();

export default options;
