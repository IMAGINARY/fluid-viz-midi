import BaseAnimator, { AnimatorState } from './base-animator';

export default class Animator extends BaseAnimator {
  protected externalCallback: FrameRequestCallback;

  constructor(callback?: FrameRequestCallback) {
    super();
    this.externalCallback =
      typeof callback === 'undefined' ? () => {} : callback;
  }

  protected callback(timestamp: DOMHighResTimeStamp) {
    this.externalCallback(timestamp);
  }

  protected getCallback(): FrameRequestCallback {
    return this.externalCallback;
  }

  protected setCallback(callback: FrameRequestCallback): this {
    this.callback = callback;
    return this;
  }
}
export { AnimatorState };
