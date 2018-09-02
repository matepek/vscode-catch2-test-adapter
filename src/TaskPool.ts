export class TaskPool {
  /**
   *
   * @param availableSlot The available slot number. If -1 (negative) means no limit, acquire will always return true.
   */
  constructor(private availableSlot: number) {}

  acquire(): boolean {
    if (this.availableSlot < 0) return true;
    if (this.availableSlot == 0) return false;
    this.availableSlot -= 1;
    return true;
  }

  release(): void {
    if (this.availableSlot < 0) return;
    this.availableSlot += 1;
  }
}
