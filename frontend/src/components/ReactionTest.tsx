import { useEffect, useRef, useState } from "react";
import type {
  CompletedReactionTest,
  ReactionResults,
} from "../reactionResults";
import { ReactionResultSummary } from "./ReactionResultSummary";
import { Panel } from "./medical";

type Phase = "idle" | "waiting" | "ready" | "finished" | "interrupted";
type Results = ReactionResults;
const emptyResults = (): Results => ({ responses: [], early: 0, missed: 0 });

export function ReactionTest({
  onComplete,
}: {
  onComplete?: (result: CompletedReactionTest) => void;
}) {
  const completionHandler = useRef(onComplete);
  useEffect(() => {
    completionHandler.current = onComplete;
  }, [onComplete]);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [remaining, setRemaining] = useState(30);
  const [results, setResults] = useState<Results>(emptyResults);
  const target = useRef<HTMLDivElement>(null);
  const respond = useRef<() => void>(() => {});
  const stop = useRef<() => void>(() => {});
  const held = useRef(false);

  useEffect(() => {
    if (!running) return;
    const started = performance.now();
    const deadline = started + 30_000;
    const collected = emptyResults();
    let readyAt: number | null = null;
    let nextCue = started + 1000 + Math.random() * 2000;
    let frame = 0;
    let ended = false;
    const finish = (interrupted: boolean) => {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(frame);
      held.current = false;
      setResults({ ...collected, responses: [...collected.responses] });
      setRemaining(
        interrupted
          ? Math.ceil(Math.max(0, deadline - performance.now()) / 1000)
          : 0,
      );
      setPhase(interrupted ? "interrupted" : "finished");
      setRunning(false);
      if (!interrupted)
        completionHandler.current?.({
          ...collected,
          responses: [...collected.responses],
          completedAt: new Date().toISOString(),
        });
    };
    const wait = (now: number) => {
      readyAt = null;
      nextCue = now + 1000 + Math.random() * 2000;
      setPhase("waiting");
    };
    respond.current = () => {
      const now = performance.now();
      if (ended) return;
      if (now >= deadline) {
        finish(false);
        return;
      }
      if (readyAt === null) {
        collected.early += 1;
        wait(now);
      } else {
        collected.responses.push(now - readyAt);
        wait(now);
      }
      setResults({ ...collected, responses: [...collected.responses] });
    };
    stop.current = () => finish(true);
    const tick = (now: number) => {
      if (ended) return;
      if (now >= deadline) {
        finish(false);
        return;
      }
      setRemaining(Math.ceil((deadline - now) / 1000));
      if (readyAt !== null && now - readyAt >= 2000) {
        collected.missed += 1;
        setResults({ ...collected, responses: [...collected.responses] });
        wait(now);
      } else if (readyAt === null && now >= nextCue) {
        readyAt = now;
        setPhase("ready");
      }
      frame = requestAnimationFrame(tick);
    };
    const hidden = () => {
      if (document.hidden) finish(true);
    };
    const blurred = () => finish(true);
    target.current?.focus();
    setPhase("waiting");
    frame = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", blurred);
    return () => {
      ended = true;
      cancelAnimationFrame(frame);
      held.current = false;
      respond.current = () => {};
      stop.current = () => {};
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", blurred);
    };
  }, [running]);

  return (
    <Panel title="30-second reaction test" className="reaction-test">
      <p>
        Wait for <strong>PRESS SPACE</strong>, then press and release the
        spacebar as quickly as you can. Repeat until the 30 seconds end.
        Pressing early counts as a false start; holding the key does not count
        as repeated responses.
      </p>
      <div
        onBlur={(event) => {
          if (running && !event.currentTarget.contains(event.relatedTarget))
            stop.current();
        }}
      >
        <div className="reaction-toolbar">
          <span role="timer" aria-label="Time remaining">
            {remaining} seconds remaining
          </span>
          {running ? (
            <button onClick={() => stop.current()}>Stop test</button>
          ) : (
            <button
              className="primary-button"
              onClick={() => {
                setResults(emptyResults());
                setRemaining(30);
                setRunning(true);
              }}
            >
              {phase === "idle" ? "Start reaction test" : "Try again"}
            </button>
          )}
        </div>
        <div
          ref={target}
          tabIndex={running ? 0 : -1}
          className={`reaction-target reaction-${phase}`}
          role="group"
          aria-label="Spacebar reaction test area"
          onKeyDown={(event) => {
            if (!running || event.code !== "Space") return;
            event.preventDefault();
            if (event.repeat || held.current) return;
            held.current = true;
            respond.current();
          }}
          onKeyUp={(event) => {
            if (event.code === "Space") {
              event.preventDefault();
              held.current = false;
            }
          }}
        >
          <strong role="status" aria-live="polite">
            {phase === "ready"
              ? "PRESS SPACE"
              : phase === "waiting"
                ? "WAIT FOR THE CUE"
                : phase === "finished"
                  ? "Test complete"
                  : phase === "interrupted"
                    ? "Test stopped"
                    : "Ready when you are"}
          </strong>
          <span>
            {phase === "ready"
              ? "● Respond now"
              : phase === "waiting"
                ? "Release the spacebar and stay ready"
                : "Keep this test focused while it runs"}
          </span>
        </div>
      </div>
      {phase === "interrupted" && (
        <p role="status">
          The test was stopped or lost focus. Start again to complete a full
          30-second test.
        </p>
      )}
      {phase === "finished" && (
        <div className="reaction-results" aria-label="Reaction test results">
          <h3>Your results</h3>
          <ReactionResultSummary result={results} />
        </div>
      )}
      <p className="caption">
        Browser practice test · The latest completed result is shown under Head
        & eyes and saved in this browser for this crew member. Display and
        keyboard latency affect timings; this is not a clinical assessment.
      </p>
    </Panel>
  );
}
