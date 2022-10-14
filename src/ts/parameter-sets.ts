import { AnimatableSimulationParameters } from './parameter-animator';

const parameterSets: AnimatableSimulationParameters[] = [
  {
    DENSITY_DISSIPATION: 2,
    VELOCITY_DISSIPATION: 1,
    PRESSURE: 0.8,
    CURL: 4,
    SPLAT_RADIUS: 0.15,
  },
  {
    DENSITY_DISSIPATION: 0.5897506166072897,
    VELOCITY_DISSIPATION: 0,
    PRESSURE: 0.8,
    CURL: 24,
    SPLAT_RADIUS: 0.0401397643189915,
  },
  {
    DENSITY_DISSIPATION: 2.027952863798301,
    VELOCITY_DISSIPATION: 0,
    PRESSURE: 1,
    CURL: 0,
    SPLAT_RADIUS: 0.012778843518772266,
  },
];

export default parameterSets;
