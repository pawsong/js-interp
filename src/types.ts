export interface AsyncFunction {
  (...args: any[]): PromiseLike<any>
}
