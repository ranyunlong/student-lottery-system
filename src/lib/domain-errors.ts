export class UnavailableRoundError extends Error {
  constructor(message: string) { super(message); this.name = 'UnavailableRoundError'; }
}

export class RetryableRoundError extends Error {
  constructor() { super('抽奖操作冲突，请重试'); this.name = 'RetryableRoundError'; }
}
