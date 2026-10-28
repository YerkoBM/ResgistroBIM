declare module '*?worker&inline' {
  const WorkerConstructor: { new (options?: WorkerOptions): Worker };
  export default WorkerConstructor;
}

declare module "*?raw" { const text:string; export default text; }
