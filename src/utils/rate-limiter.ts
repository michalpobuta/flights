export class RateLimiter {
  private tokens: number;
  private last_refill: number;
  private readonly max_tokens: number;
  private readonly refill_rate: number; // tokens per second

  constructor(max_tokens: number, refill_rate: number) {
    this.max_tokens = max_tokens;
    this.tokens = max_tokens;
    this.refill_rate = refill_rate;
    this.last_refill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    // Wait until a token is available
    const wait_ms = ((1 - this.tokens) / this.refill_rate) * 1000;
    await new Promise((resolve) => setTimeout(resolve, wait_ms));
    this.refill();
    this.tokens -= 1;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed_s = (now - this.last_refill) / 1000;
    this.tokens = Math.min(this.max_tokens, this.tokens + elapsed_s * this.refill_rate);
    this.last_refill = now;
  }
}
