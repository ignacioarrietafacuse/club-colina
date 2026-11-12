import { afterEach, describe, expect, it } from "vitest";
import { urlTest } from "./db";

describe("base de tests", () => {
  const original = process.env.TEST_DATABASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.TEST_DATABASE_URL;
    else process.env.TEST_DATABASE_URL = original;
  });

  it("solo acepta bases locales que terminan en _test", () => {
    process.env.TEST_DATABASE_URL = "postgres://club@localhost:5432/club_colina";
    expect(() => urlTest()).toThrow(/_test/);
    process.env.TEST_DATABASE_URL = "postgres://club@db.ejemplo.net:5432/x_test";
    expect(() => urlTest()).toThrow(/--produccion/);
    process.env.TEST_DATABASE_URL = "postgres://club@localhost:5432/club_colina_test";
    expect(urlTest()).toContain("club_colina_test");
  });
});
