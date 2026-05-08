import { describe, expect, it } from "bun:test";
import { Value } from "@sinclair/typebox/value";
import { UserInsertSchema } from "./index";

describe("UserInsertSchema", () => {
  it("accepts a valid user", () => {
    const ok = Value.Check(UserInsertSchema, { email: "a@b.c", name: "alice" });
    expect(ok).toBe(true);
  });

  it("rejects missing email", () => {
    const ok = Value.Check(UserInsertSchema, { name: "alice" });
    expect(ok).toBe(false);
  });
});
