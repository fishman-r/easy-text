/** Run user regexes off the UI thread and terminate pathological expressions. */
export function localSearch(request) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./search-worker.js", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("项目搜索超过 2 秒，已停止；请简化正则或缩小项目。"));
    }, 2000);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    worker.onmessage = (event) => {
      finish();
      event.data.error
        ? reject(new Error(event.data.error))
        : resolve(event.data);
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "搜索线程失败"));
    };
    worker.postMessage(request);
  });
}
