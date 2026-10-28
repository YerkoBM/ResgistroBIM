import readWorkbook from 'read-excel-file/web-worker';
import { parseInventoryBuffer } from './inventory-parser';
import type { InventoryWorkerRequest, InventoryWorkerResponse } from './inventory-parser';

// Dedicated, bundled worker: File bytes never leave this browser.
const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<InventoryWorkerRequest>) => void) | null;
  postMessage: (message: InventoryWorkerResponse) => void;
};
workerScope.onmessage = event => {
  void parseInventoryBuffer(event.data.buffer, event.data.name, readWorkbook).then(
    result => workerScope.postMessage({ result }),
    error => workerScope.postMessage({ error: error instanceof Error ? error.message : 'No se pudo leer el inventario local.' }),
  );
};
