import { useState } from "react";
import type { CrewMember } from "../services/api";

const PORTRAITS: Record<string, string> = {
  "DEMO-CREW-001": "/assets/crew/alex-morgan.png",
  "DEMO-CREW-002": "/assets/crew/jordan-lee.png",
  "DEMO-CREW-003": "/assets/crew/sam-rivera.png",
};

export function CrewAvatar({
  crew,
  large = false,
}: {
  crew: CrewMember;
  large?: boolean;
}) {
  const portrait = PORTRAITS[crew.id];
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className={`avatar ${large ? "large" : ""}`}>
      {portrait && failed !== portrait ? (
        <img
          src={portrait}
          alt={large ? `Synthetic portrait of ${crew.display_name}` : ""}
          width={large ? 104 : 42}
          height={large ? 104 : 42}
          decoding="async"
          onError={() => setFailed(portrait)}
        />
      ) : (
        crew.initials
      )}
    </span>
  );
}
