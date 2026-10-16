import * as vscode from 'vscode';

export class ProgressReporter {
  constructor(private readonly progress: vscode.Progress<{ message?: string; increment?: number }>) {}

  private readonly subs: SubProgressReporter[] = [];
  private alreadySetCount = 0;
  private maxValue = 0;
  private currentValue = 0;
  private reportedPercent = 0;

  createSubProgressReporter(): SubProgressReporter {
    const s = new SubProgressReporter(this);
    this.subs.push(s);
    return s;
  }

  _setMax(_sub: SubProgressReporter, max: number): void {
    this.alreadySetCount++;
    this.maxValue += max;
  }

  _incrementBy1(_sub: SubProgressReporter): void {
    this.currentValue++;

    if (this.alreadySetCount === this.subs.length) {
      const currentPercent = Math.floor((100 * this.currentValue) / this.maxValue);
      if (currentPercent > this.reportedPercent) {
        this.progress.report({ increment: currentPercent - this.reportedPercent });
        this.reportedPercent = currentPercent;
      }
    }
  }
}

export class SubProgressReporter {
  constructor(private readonly parent: ProgressReporter) {}

  setMax(max: number): void {
    this.parent._setMax(this, max);
  }

  incrementBy1(): void {
    this.parent._incrementBy1(this);
  }
}
