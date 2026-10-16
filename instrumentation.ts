/** Runs once when the server boots: deletes expired files every few minutes. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { sweepExpired } = await import("./lib/collections");
  const tick = () => {
    try {
      const n = sweepExpired(true);
      if (n) console.log(`[templink] deleted ${n} expired link${n === 1 ? "" : "s"}`);
    } catch (e) {
      console.error("[templink] cleanup failed", e);
    }
  };
  tick();
  setInterval(tick, 5 * 60_000).unref();
}
