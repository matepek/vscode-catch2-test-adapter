export type PlatformType = NodeJS.Platform;

class Platform {
  public is(id: PlatformType): boolean {
    switch (id) {
      case 'darwin':
        return process.platform === 'darwin';
      case 'win32':
        return process.platform === 'win32';
      case 'linux':
        return process.platform === 'linux';
      default:
        return false;
    }
  }

  public getPlatformProperty<T>(obj: T): T | undefined {
    if (typeof obj !== 'object') throw Error('assert');

    if (process.platform in obj) {
      // eslint-disable-next-line
      return (obj as any)[process.platform] as T;
    }

    if (Array.isArray(alternativePlatformIds[process.platform]))
      for (const id of alternativePlatformIds[process.platform]!)
        if (id in obj)
          // eslint-disable-next-line
          return (obj as any)[id];

    return undefined;
  }
}

const alternativePlatformIds: { [id in PlatformType]?: string[] } = {
  win32: ['win', 'windows'],
  darwin: ['osx', 'mac', 'macos', 'macOS'],
};

export const platformUtil = new Platform();
