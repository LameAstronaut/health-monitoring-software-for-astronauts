// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { Examinations } from "./examinations";
import { makeMission } from "../test/fixtures";

afterEach(cleanup);

it("requests the body-temperature examination using its thermometer", async () => {
  const action = vi.fn().mockResolvedValue(true);
  render(
    <Examinations
      mission={makeMission()}
      crewId="DEMO-CREW-001"
      busy={false}
      action={action}
      navigate={vi.fn()}
      selectCrew={vi.fn()}
    />,
  );
  await userEvent.click(
    screen.getByRole("radio", { name: /Body temperature/ }),
  );
  expect(
    screen.getByRole("combobox", { name: "Examination instrument" }),
  ).toHaveValue("DEMO-TEMP-001");
  await userEvent.click(
    screen.getByRole("button", { name: "Initiate simulated acquisition" }),
  );
  expect(action).toHaveBeenCalledWith(
    "examinations",
    {
      astronaut_id: "DEMO-CREW-001",
      kind: "BODY_TEMPERATURE",
      device_id: "DEMO-TEMP-001",
    },
    expect.any(String),
  );
});
