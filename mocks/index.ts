async function initMocks() {
  if (process.env.NEXT_RUNTIME) {
    const { edge } = await import("./edge");
    console.log("Mookcing Edge Function");
    edge.listen();
  } else if (typeof window === "undefined") {
    const { server } = await import("./server");
    console.log("Mookcing Sever Function");
    server.listen();
  } else {
    const { worker } = await import("./browser");
    console.log("Mookcing Browser Function");
    worker.start();
  }
}

initMocks();

export {};
