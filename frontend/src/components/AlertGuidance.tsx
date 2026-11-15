import { ALERT_GUIDANCE, FALLBACK_GUIDANCE } from "../alertGuidance";

export function AlertGuidance({ ruleId }: { ruleId: string }) {
  const guidance = ALERT_GUIDANCE[ruleId] ?? FALLBACK_GUIDANCE;
  return (
    <section className="alert-guidance" aria-label="Response guidance">
      <h3>What to do</h3>
      <p>
        <strong>{guidance.focus}</strong>
      </p>
      <ol>
        {guidance.steps.map((step, index) => (
          <li key={index}>{step.action}</li>
        ))}
      </ol>
    </section>
  );
}
