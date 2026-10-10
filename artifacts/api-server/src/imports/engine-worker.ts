import {parentPort,workerData} from "node:worker_threads";
import {CellReadError} from "@workspace/calculation";
import {ImportError} from "./model";
import {cpuWork} from "./cpu-work";
try {
  // Decimal.toJSON emits exact decimal strings; no floating-point conversion.
  parentPort!.postMessage({json:JSON.stringify(cpuWork(workerData.action,workerData.files,workerData.mapping))});
} catch(error:any) {
  parentPort!.postMessage({error:{kind:error instanceof CellReadError?"cell":error instanceof ImportError?"import":"error",message:error.message,fields:{...error}}});
}
