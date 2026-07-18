import { strict as assert } from "assert";
import { isNewer, parseUpdateArgs } from "../daemon/cli/commands/update";

describe("codemore update: version comparison", () => {
  it("detects a newer patch/minor/major version", () => {
    assert.equal(isNewer("0.3.2", "0.3.1"), true);
    assert.equal(isNewer("0.4.0", "0.3.2"), true);
    assert.equal(isNewer("1.0.0", "0.3.2"), true);
  });

  it("is false when already current or ahead", () => {
    assert.equal(isNewer("0.3.2", "0.3.2"), false);
    assert.equal(isNewer("0.3.1", "0.3.2"), false);
  });

  it("handles uneven segment counts", () => {
    assert.equal(isNewer("0.3.2.1", "0.3.2"), true);
    assert.equal(isNewer("0.3", "0.3.0"), false);
  });
});

describe("codemore update: arg parsing", () => {
  it("defaults to checkOnly=false, --check flips it", () => {
    assert.equal(parseUpdateArgs([]).checkOnly, false);
    assert.equal(parseUpdateArgs(["--check"]).checkOnly, true);
  });
});
