// Poll the ML service health endpoint until the pipeline reports fitted.
const t0 = Date.now();

function schedule(poll) {
  if (Date.now() - t0 > 300000) {
    console.log("TIMEOUT waiting for pipeline fit");
    process.exit(1);
  }
  setTimeout(poll, 10000);
}

function poll() {
  fetch("http://localhost:8000/health", { signal: AbortSignal.timeout(4000) })
    .then((r) => r.json())
    .then((j) => {
      console.log(Math.round((Date.now() - t0) / 1000) + "s:", JSON.stringify(j));
      if (j.fitted) return;
      schedule(poll);
    })
    .catch(() => {
      console.log(Math.round((Date.now() - t0) / 1000) + "s: not up yet");
      schedule(poll);
    });
}

poll();
