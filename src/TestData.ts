import { Runnable } from './Runnable';

export abstract class TestData {
  // can have runnnable if it represents a Runnable/Executable, otherwise (custom grouping) it is meaningless and we cannot resolve anything anyway
  public readonly runnable: Runnable | undefined;
  public readonly isRunnable = true;
  public readonly isDebuggable = true;

  public constructor() {}
}
