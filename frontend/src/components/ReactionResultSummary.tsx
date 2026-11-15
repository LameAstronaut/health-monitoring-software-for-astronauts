import type { ReactionResults } from "../reactionResults";

export function ReactionResultSummary({ result }: { result: ReactionResults }) {
  const sorted = [...result.responses].sort((a, b) => a - b);
  const average = sorted.length
    ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
    : null;
  const median = sorted.length
    ? Math.round(
        (sorted[Math.floor((sorted.length - 1) / 2)] +
          sorted[Math.floor(sorted.length / 2)]) /
          2,
      )
    : null;
  return (
    <>
      <dl className="detail-list">
        <div>
          <dt>Responses</dt>
          <dd>{sorted.length}</dd>
        </div>
        <div>
          <dt>Average reaction time</dt>
          <dd>{average === null ? "No responses" : `${average} ms`}</dd>
        </div>
        <div>
          <dt>Median reaction time</dt>
          <dd>{median === null ? "No responses" : `${median} ms`}</dd>
        </div>
        <div>
          <dt>Fastest response</dt>
          <dd>
            {sorted.length ? `${Math.round(sorted[0])} ms` : "No responses"}
          </dd>
        </div>
        <div>
          <dt>False starts</dt>
          <dd>{result.early}</dd>
        </div>
        <div>
          <dt>Missed cues</dt>
          <dd>{result.missed}</dd>
        </div>
      </dl>
      {!sorted.length && (
        <p>
          No reactions recorded. Press the spacebar when the cue appears on your
          next attempt.
        </p>
      )}
    </>
  );
}
