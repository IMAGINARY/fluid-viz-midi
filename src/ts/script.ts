/* eslint-disable */
// @ts-nocheck
// This file contains the glue code to the original untyped simulation code

import { Color } from './util';

import * as untyped from '../js/script.js';

const splat: (
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: Color,
  attenuation = 1.0,
  radius = config.SPLAT_RADIUS,
) => void = untyped.splat;

const HSVtoRGB: (h: number, s: number, v: number) => Color = untyped.HSVtoRGB;

type Config = { RADIUS: number; SPLAT_RADIUS: number };

const config: Config = untyped.config;

export { splat, HSVtoRGB, config };
