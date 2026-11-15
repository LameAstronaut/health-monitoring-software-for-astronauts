import type { CompletedReactionTest } from "../reactionResults";
import { stamp, Status } from "./medical";

export function AverageReactionTime({
  result,
}: {
  result?: CompletedReactionTest | null;
}) {
  const average = result?.responses.length
    ? Math.round(
        result.responses.reduce((total, response) => total + response, 0) /
          result.responses.length,
      )
    : null;
  return (
    <div className="body-map-measurement" aria-label="Average reaction time">
      <strong>Average reaction time</strong>
      {average !== null ? (
        <>
          <b>
            {average} <small>ms</small>
          </b>
          <span>Browser practice · {stamp(result?.completedAt)}</span>
        </>
      ) : (
        <Status value="NOT_AVAILABLE" />
      )}
    </div>
  );
}
