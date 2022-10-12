import ADSREnvelope from './adsr-envelope';

export default class Note {
  readonly midiNote: number;

  readonly midiVelocity: number;

  readonly envelope: ADSREnvelope;

  protected startTime: number;

  protected releaseTime: number;

  protected holdState: boolean;

  protected sustainState: boolean;

  protected shouldRelease: boolean;

  constructor(midiNote: number, midiVelocity: number, envelope: ADSREnvelope) {
    this.midiNote = midiNote;
    this.midiVelocity = midiVelocity;
    this.envelope = envelope;
    this.startTime = performance.now() / 1000.0;
    this.releaseTime = Infinity;
    this.holdState = false;
    this.sustainState = false;
    this.shouldRelease = false;
  }

  elapsedTime(): number {
    return performance.now() / 1000.0 - this.startTime;
  }

  sustain(enable: boolean) {
    if (
      !enable &&
      this.sustainState &&
      this.shouldRelease &&
      !this.isHeld() &&
      !this.isOff()
    ) {
      this.forceOff();
    }
    this.holdState = enable;
  }

  isSustained(): boolean {
    return this.sustainState;
  }

  hold(enable: boolean) {
    if (
      !enable &&
      this.holdState &&
      this.shouldRelease &&
      !this.isSustained() &&
      !this.isOff()
    ) {
      this.forceOff();
    }
    this.holdState = enable;
  }

  isHeld(): boolean {
    return this.holdState;
  }

  isOff(): boolean {
    return this.releaseTime !== Infinity;
  }

  off() {
    this.shouldRelease = true;
    if (!this.isSustained() && !this.isHeld() && !this.isOff()) {
      this.forceOff();
    }
  }

  forceOff() {
    this.releaseTime = this.elapsedTime();
  }

  getVolume(): number {
    return (
      (this.midiVelocity / 127.0) * this.envelope.valueAt(this.elapsedTime())
    );
  }

  isOver(): boolean {
    return this.envelope.isOver(this.elapsedTime(), this.releaseTime);
  }
}
