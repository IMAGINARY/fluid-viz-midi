export default class Animator {
  protected func: (ts: number) => unknown;

  protected animationFrameId: ReturnType<typeof requestAnimationFrame> = 0;

  protected animationFrameHandler = this.animate.bind(this);

  constructor(func: (ts: number) => unknown) {
    this.func = func;
  }

  isRunning(): boolean {
    return this.animationFrameId !== 0;
  }

  start(): this {
    this.stop();
    this.animationFrameId = requestAnimationFrame(this.animationFrameHandler);
    return this;
  }

  startNow(timestamp: DOMHighResTimeStamp): this {
    this.start();
    this.func(timestamp);
    return this;
  }

  protected animate(timestamp: DOMHighResTimeStamp): this {
    if (this.isRunning()) {
      this.func(timestamp);
      requestAnimationFrame(this.animationFrameHandler);
    }
    return this;
  }

  stop() {
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = 0;
  }
}
