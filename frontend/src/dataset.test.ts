import { expect, it } from "vitest";
import { parseCSV } from "./dataset";
it("preserves quoted delimiters, escaped quotes, newlines, leading zeros and missing cells", () => {
  const result = parseCSV(
    '\uFEFFSubject,Note,Value\r\n001,"line one\nline ""two"", x",\r\n',
  );
  expect(result.rows).toEqual([
    { field_1: "001", field_2: 'line one\nline "two", x', field_3: "" },
  ]);
});
it("rejects malformed and oversized tables before preview", () => {
  for (const source of [
    "a,b\n1",
    'a\n"unfinished',
    'a\n"x"oops',
    "a,b\n1,2,3",
    "a\n" + "x".repeat(501),
    "a\n".repeat(502),
  ])
    expect(() => parseCSV(source)).toThrow();
});
