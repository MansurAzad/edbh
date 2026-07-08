import { describe, it, expect } from "vitest";
import { groupErrorsByRow, parseLegacyErrorString } from "../productImportErrors";

describe("groupErrorsByRow", () => {
  it("groups field errors by row and preserves field metadata", () => {
    const groups = groupErrorsByRow([
      { row: 2, field: "price", message: "must be positive" },
      { row: 2, field: "name", message: "required" },
      { row: 5, field: "sku", message: "duplicate" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({
      row: 2,
      messages: [
        { field: "price", message: "must be positive" },
        { field: "name", message: "required" },
      ],
    });
    expect(groups[1].row).toBe(5);
    expect(groups[1].messages[0].field).toBe("sku");
  });

  it("parses legacy error strings and merges without duplicating", () => {
    const groups = groupErrorsByRow(
      [{ row: 3, field: "price", message: "must be positive" }],
      [
        "রো 3 · price: must be positive", // duplicate → skipped
        "রো 3 · category: required",
        "রো 7: unexpected error",
      ],
    );
    const row3 = groups.find((g) => g.row === 3)!;
    expect(row3.messages).toHaveLength(2);
    expect(row3.messages.map((m) => m.field)).toEqual(["price", "category"]);
    const row7 = groups.find((g) => g.row === 7)!;
    expect(row7.messages[0].message).toBe("unexpected error");
  });

  it("puts unparseable errors under a null-row bucket sorted last", () => {
    const groups = groupErrorsByRow([], ["Network failure", "রো 4 · name: required"]);
    expect(groups[0].row).toBe(4);
    expect(groups[groups.length - 1].row).toBeNull();
  });

  it("parseLegacyErrorString handles the common formats", () => {
    expect(parseLegacyErrorString("রো 2 · price: bad")).toEqual({
      row: 2,
      field: "price",
      message: "bad",
    });
    expect(parseLegacyErrorString("রো 9: raw")).toEqual({ row: 9, message: "raw" });
    expect(parseLegacyErrorString("unrelated")).toEqual({ row: null, message: "unrelated" });
  });
});
