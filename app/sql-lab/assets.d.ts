declare module "*.wasm?url" {
  const url: string;
  export default url;
}

declare module "*?worker" {
  const WorkerConstructor: {
    new (options?: WorkerOptions): Worker;
  };
  export default WorkerConstructor;
}
