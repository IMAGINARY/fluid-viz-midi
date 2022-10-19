import BaseAnimator from './animator/base-animator';

type AnimatableSimulationParameters = {
  DENSITY_DISSIPATION: number;
  VELOCITY_DISSIPATION: number;
  PRESSURE: number;
  CURL: number;
  SPLAT_RADIUS: number;
};

type SimulationParameters = AnimatableSimulationParameters &
  Record<string, unknown>;

type ParameterAnimatorOptions = {
  onUpdate: (p: SimulationParameters) => unknown;
  tweenDuration: number;
  stayDuration: number;
  initialize: boolean;
};

function filterParameters(
  p: SimulationParameters,
): AnimatableSimulationParameters {
  const {
    DENSITY_DISSIPATION,
    VELOCITY_DISSIPATION,
    PRESSURE,
    CURL,
    SPLAT_RADIUS,
  } = p;
  return {
    DENSITY_DISSIPATION,
    VELOCITY_DISSIPATION,
    PRESSURE,
    CURL,
    SPLAT_RADIUS,
  };
}

const defaultOptions: ParameterAnimatorOptions = {
  onUpdate: () => {},
  tweenDuration: 10 * 1000,
  stayDuration: 5 * 1000,
  initialize: true,
};

export default class ParameterAnimator extends BaseAnimator {
  protected parameters: SimulationParameters;

  protected parameterSets: Partial<AnimatableSimulationParameters>[];

  protected options: ParameterAnimatorOptions;

  protected currentIndex = -1;

  protected currentCycle = 0;

  protected source: AnimatableSimulationParameters;

  protected target: Partial<AnimatableSimulationParameters>;

  constructor(
    parameterSet: SimulationParameters,
    parameterSets: Partial<AnimatableSimulationParameters>[],
    options: Partial<ParameterAnimatorOptions> = {},
  ) {
    super();
    this.parameters = parameterSet;
    this.parameterSets = parameterSets;
    this.options = { ...defaultOptions, ...options };
    this.target = this.getNextParameterSet();
    if (this.options.initialize) {
      const tween = ParameterAnimator.tween(this.parameters, this.target, 1.0);
      Object.assign(this.parameters, tween);
    }
    this.source = { ...this.parameters };
  }

  protected callback(timestamp: DOMHighResTimeStamp) {
    const { stayDuration, tweenDuration } = this.options;
    const cycleDuration = stayDuration + tweenDuration;
    const cycle = Math.floor(timestamp / cycleDuration);
    const cycleTimestamp = timestamp % cycleDuration;
    if (this.currentCycle !== cycle) {
      // start the next cycle
      // make sure we reached the last target
      const tween = ParameterAnimator.tween(this.source, this.target, 1.0);
      Object.assign(this.parameters, tween);
      // set new target for this cycle
      this.source = filterParameters(this.parameters);
      this.target = this.getNextParameterSet();
      this.currentCycle = cycle;
    }
    if (cycleTimestamp <= stayDuration) {
      // do nothing
    } else {
      // animate the transition from source to target parameter set
      const tweenTimestamp = cycleTimestamp - stayDuration;
      const t = tweenTimestamp / tweenDuration;
      const tween = ParameterAnimator.tween(this.source, this.target, t);
      Object.assign(this.parameters, tween);
    }
  }

  protected static tween(
    source: AnimatableSimulationParameters,
    target: Partial<AnimatableSimulationParameters>,
    t: number,
  ): Partial<AnimatableSimulationParameters> {
    const tween = { ...source };
    (Object.entries(target) as [keyof typeof target, number][]).forEach(
      ([key, value]) => {
        tween[key] = tween[key] * (1 - t) + value * t;
      },
    );
    return tween;
  }

  getNextParameterSet(): Partial<AnimatableSimulationParameters> {
    const randomIndex = Math.floor(Math.random() * this.parameterSets.length);
    this.currentIndex =
      randomIndex !== this.currentIndex
        ? randomIndex
        : (randomIndex + 1) % this.parameterSets.length;
    return this.parameterSets[this.currentIndex];
  }
}

export {
  SimulationParameters,
  AnimatableSimulationParameters,
  filterParameters,
};
