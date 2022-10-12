import Victor from 'victor';

import Note from './note';
import ADSREnvelope from './adsr-envelope';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { splat, config } from '../js/script';

type Color = { r: number; g: number; b: number };
function isColor(value: unknown): value is Color {
  return (
    value !== null &&
    typeof value !== 'undefined' &&
    'r' in value &&
    'g' in value &&
    'b' in value
  );
}

export default class NoteEnvelopeSplash {
  static secondsPerRotation = 10;

  protected note: Note;

  protected angleOffset: number;

  protected color: (t: number) => Color;

  protected lastCoords: Victor;

  constructor(
    midiNote: number,
    midiVelocity: number,
    envelope: ADSREnvelope,
    color: Color | ((t: number) => Color),
  ) {
    this.note = new Note(midiNote, midiVelocity, envelope);
    this.angleOffset =
      (performance.now() * 0.001 * 2 * Math.PI) /
      NoteEnvelopeSplash.secondsPerRotation;

    this.color = isColor(color) ? () => color : color;

    this.lastCoords = this.getPointerCoordinates();
    this.update();
  }

  getInterpolationParameter() {
    const t = this.note.elapsedTime();
    const speed = this.note.midiVelocity / 127.0;
    return 1.0 / (-1.0 - speed * t) ** 2.0 + 1.0;
  }

  getPointerCoordinates(): Victor {
    const radius = config.RADIUS;
    const splatRadius = Math.max(0.1, config.SPLAT_RADIUS) * 0.5;
    const center = new Victor(0.5, 0.5);

    const dir = new Victor(1, 0).rotate(
      this.angleOffset + (2 * Math.PI * this.note.midiNote) / 12,
    );
    const start = center
      .clone()
      .add(dir.clone().multiplyScalar(radius - splatRadius));
    const end = center;

    const t = this.getInterpolationParameter();
    const p = start.clone().mix(end, t);
    return p;
  }

  update() {
    const volume = this.note.getVolume();
    const factor = 100000.0 * volume;
    const p = this.getPointerCoordinates();
    const d = p
      .clone()
      .subtract(this.lastCoords)
      .multiply(new Victor(factor, factor));
    const attenuation = 40.0;
    const color = this.color(this.note.elapsedTime());
    const radius = config.SPLAT_RADIUS * (1.0 - (1.0 - volume) ** 8.0);
    splat(p.x, p.y, d.x, d.y, color, attenuation, radius);
    this.lastCoords = p;
  }
}
