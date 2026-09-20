/** Shared iPhone leave/resume. Realtime games must pause; turn-based must freeze timers. Do not use window.blur — iOS fires it for Safari chrome. */
export function onLeaveApp(pause) {
  const onHide = () => {
    if (document.hidden) pause();
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", pause);
  return () => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", pause);
  };
}

export function resumeAudio(ctx) {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}
