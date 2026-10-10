export interface ImportJobs {
  progress(id:string):number|undefined;
  run<T>(id:string,work:(progress:(n:number)=>void)=>Promise<T>):Promise<T>;
}
// Synchronous within configured upload limits. Replaceable with a worker queue;
// GET detail can observe progress while the request is awaiting storage.
const running=new Map<string,number>();
export const importJobs:ImportJobs={
  progress:id=>running.get(id),
  async run(id,work) {
    if(running.has(id)) throw new Error("JOB_RUNNING");
    running.set(id,1);
    try { return await work(n=>running.set(id,n)); }
    finally { running.delete(id); }
  },
};
