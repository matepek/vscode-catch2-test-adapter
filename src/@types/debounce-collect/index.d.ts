declare module 'debounce-collect' {
  function debounce<T1>(func: (aggregatedArgs: [T1][]) => void, wait: number, immediate?: boolean): (arg1: T1) => void;

  function debounce<T1, T2>(
    func: (aggregatedArgs: [T1, T2][]) => void,
    wait: number,
    immediate?: boolean,
  ): (arg1: T1, arg2: T2) => void;

  function debounce<T1, T2, T3>(
    func: (aggregatedArgs: [T1, T2, T3][]) => void,
    wait: number,
    immediate?: boolean,
  ): (arg1: T1, arg2: T2) => void;

  export = debounce;
}
