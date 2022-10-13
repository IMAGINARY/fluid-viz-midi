enum AnimatorState {
  STOPPED,
  PLAYING,
  PAUSED,
}

export default class Animator {
  protected callback: FrameRequestCallback;

  protected animationFrameId: ReturnType<typeof requestAnimationFrame> = 0;

  protected animationFrameHandler = this.animate.bind(this);

  protected startTimestamp: DOMHighResTimeStamp = 0;

  protected offset: DOMHighResTimeStamp = 0;

  protected pauseTimestamp: DOMHighResTimeStamp = 0;

  protected state: AnimatorState = AnimatorState.STOPPED;

  protected lastCallTimestamp: DOMHighResTimeStamp = 0;

  protected currentCallTimestamp: DOMHighResTimeStamp = 0;

  constructor(callback: FrameRequestCallback = () => {}) {
    this.callback = callback;
    this.stop();
  }

  elapsedTime(): DOMHighResTimeStamp {
    return this.currentCallTimestamp - this.offset - this.startTimestamp;
  }

  delta(): DOMHighResTimeStamp {
    return this.currentCallTimestamp - this.lastCallTimestamp;
  }

  getState(): AnimatorState {
    return this.state;
  }

  isStopped(): boolean {
    return this.getState() === AnimatorState.STOPPED;
  }

  isPlaying(): boolean {
    return this.getState() === AnimatorState.PLAYING;
  }

  isPaused(): boolean {
    return this.getState() === AnimatorState.PAUSED;
  }

  start(): this {
    this.stop();
    this.state = AnimatorState.PLAYING;
    this.animationFrameId = requestAnimationFrame(
      this.startNowNoStop.bind(this),
    );
    return this;
  }

  protected startNowNoStop(timestamp: DOMHighResTimeStamp): this {
    this.startTimestamp = timestamp;
    this.lastCallTimestamp = timestamp;
    this.currentCallTimestamp = timestamp;
    this.offset = 0;
    this.pauseTimestamp = timestamp;
    return this.playNowNoCheck(timestamp);
  }

  startNow(timestamp: DOMHighResTimeStamp): this {
    return this.stop().startNowNoStop(timestamp);
  }

  pause(): this {
    if (this.getState() === AnimatorState.PLAYING) {
      this.cancelAnimationFrame();
      this.pauseTimestamp = this.currentCallTimestamp;
      this.state = AnimatorState.PAUSED;
    }
    return this;
  }

  play(): this {
    if (this.getState() === AnimatorState.PAUSED) {
      this.state = AnimatorState.PLAYING;
      this.requestAnimationFrame(this.playNowNoCheck.bind(this));
    }
    return this;
  }

  playNowNoCheck(timestamp: DOMHighResTimeStamp): this {
    const pauseDuration = timestamp - this.pauseTimestamp;
    this.offset += pauseDuration;
    this.lastCallTimestamp += pauseDuration;
    this.currentCallTimestamp += pauseDuration;
    this.state = AnimatorState.PLAYING;
    this.animationFrameHandler(timestamp);
    return this;
  }

  playNow(timestamp: DOMHighResTimeStamp): this {
    if (this.getState() === AnimatorState.PAUSED)
      this.playNowNoCheck(timestamp);
    return this;
  }

  stop(): this {
    this.cancelAnimationFrame();
    this.startTimestamp = 0;
    this.lastCallTimestamp = 0;
    this.currentCallTimestamp = 0;
    this.offset = 0;
    this.pauseTimestamp = 0;
    this.state = AnimatorState.STOPPED;
    return this;
  }

  protected cancelAnimationFrame(): this {
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = 0;
    return this;
  }

  protected requestAnimationFrame(callback: FrameRequestCallback): this {
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = requestAnimationFrame(callback);
    return this;
  }

  protected animate(timestamp: DOMHighResTimeStamp): this {
    if (this.isPlaying()) {
      this.lastCallTimestamp = this.currentCallTimestamp;
      this.currentCallTimestamp = timestamp;
      this.callback(timestamp);
      this.requestAnimationFrame(this.animationFrameHandler);
    }
    return this;
  }

  protected getCallback(): FrameRequestCallback {
    return this.callback;
  }

  protected setCallback(callback: FrameRequestCallback): this {
    this.callback = callback;
    return this;
  }
}
