import { describe, expect, it } from "vitest";
import { ALIYUN_EMBEDDING_DIMENSIONS as clientDimensions } from "../../agent/embedding/aliyun/types.ts";
import { ALIYUN_EMBEDDING_DIMENSIONS as contractDimensions } from "../../../shared/contracts/settings/contracts.ts";

describe("Aliyun embedding contract", () => {
  it("uses the same dimensions in the client and the instance configuration", () => {
    expect([...contractDimensions]).toEqual([...clientDimensions]);
  });
});
