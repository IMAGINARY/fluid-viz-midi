/* eslint-disable */
// @ts-nocheck
// This file contains the glue code to the original untyped simulation code

import * as untyped from '../js/script.js';
import { RGBColor } from './color';
import config from './config';

const splat: (
  x: number,
  y: number,
  dx: number,
  dy: number,
  color: RGBColor,
  attenuation = 1.0,
  radius = config.SPLAT_RADIUS,
) => void = untyped.splat;

export { splat };
