export type Curve = (
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
) => number;

export type ADSREnvelopeOptions = {
  attackDuration: number;
  attackCurve: Curve;
  peakLevel: number;
  decayDuration: number;
  decayCurve: Curve;
  sustainDuration: number;
  sustainLevel: number;
  releaseDuration: number;
  releaseCurve: Curve;
};

type Segment = {
  duration: number;
  targetLevel: number;
  curve: Curve;
};

export default class ADSREnvelope {
  protected options: ADSREnvelopeOptions;

  protected attack: Segment;

  protected decay: Segment;

  protected release: Segment;

  protected gateDuration: number;

  static curveLinear: Curve = (value, inMin, inMax, outMin, outMax) =>
    ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;

  static curveExponential: Curve = (value, inMin, inMax, outMin, outMax) =>
    (outMax / outMin) ** ((value - inMin) / (inMax - inMin)) * outMin;

  static readonly CURVES: Readonly<{ [index: string]: Curve }> = {
    LINEAR: ADSREnvelope.curveLinear,
    EXPONENTIAL: ADSREnvelope.curveExponential,
  };

  static readonly DEFAULTS: ADSREnvelopeOptions = {
    attackDuration: 0.1,
    attackCurve: ADSREnvelope.CURVES.LINEAR,
    peakLevel: 1.0,
    decayDuration: 1.0,
    decayCurve: ADSREnvelope.CURVES.LINEAR,
    sustainDuration: Infinity,
    sustainLevel: 0.5,
    releaseDuration: 0.1,
    releaseCurve: ADSREnvelope.CURVES.LINEAR,
  };

  constructor(options?: Partial<ADSREnvelopeOptions>) {
    this.options = { ...ADSREnvelope.DEFAULTS, ...(options ?? {}) };
    const {
      attackDuration,
      attackCurve,
      peakLevel,
      decayDuration,
      decayCurve,
      sustainDuration,
      sustainLevel,
      releaseDuration,
      releaseCurve,
    } = this.options;
    this.attack = {
      duration: attackDuration,
      targetLevel: peakLevel,
      curve: attackCurve,
    };
    this.decay = {
      duration: decayDuration,
      targetLevel: sustainLevel,
      curve: decayCurve,
    };
    this.release = {
      duration: releaseDuration,
      targetLevel: 0,
      curve: releaseCurve,
    };
    this.gateDuration = attackDuration + decayDuration + sustainDuration;
  }

  protected _valueAtADS(elapsedTime: number) {
    if (elapsedTime <= 0.0) {
      // Note did not yet start
      return 0.0;
    }

    // Determine the volume level at releaseTime
    let timeInSection = elapsedTime;
    let sourceLevel = 0.0;
    [this.attack, this.decay].forEach(({ duration, targetLevel, curve }) => {
      if (timeInSection <= duration) {
        // The current section is the one we have to apply the curve to
        curve(timeInSection, 0, duration, sourceLevel, targetLevel);
        return;
      }
      timeInSection -= duration;
      sourceLevel = targetLevel;
    });
    return this.options.sustainLevel;
  }

  protected _valueAtR(
    elapsedTimeSinceRelease: number,
    levelAtReleaseTime: number,
  ) {
    const { duration, targetLevel, curve } = this.release;
    if (elapsedTimeSinceRelease < duration) {
      return curve(
        elapsedTimeSinceRelease,
        0,
        duration,
        levelAtReleaseTime,
        targetLevel,
      );
    }
    return targetLevel;
  }

  protected _minReleaseTime(releaseTime = Infinity) {
    return Math.min(releaseTime, this.gateDuration);
  }

  valueAt(elapsedTime: number, releaseTime = Infinity) {
    if (elapsedTime <= 0.0) {
      // Note did not yet start
      return 0.0;
    }

    const minReleaseTime = this._minReleaseTime(releaseTime);

    if (elapsedTime < minReleaseTime) {
      // Note has not yet been released
      return this._valueAtADS(elapsedTime);
    }

    const timeInReleaseSection = elapsedTime - minReleaseTime;
    const levelAtReleaseTime = this._valueAtADS(minReleaseTime);
    return this._valueAtR(timeInReleaseSection, levelAtReleaseTime);
  }

  isOver(elapsedTime: number, releaseTime = Infinity) {
    const minReleaseTime = this._minReleaseTime(releaseTime);
    const timeInReleaseSection = elapsedTime - minReleaseTime;
    const { duration } = this.release;
    return timeInReleaseSection > duration;
  }
}
