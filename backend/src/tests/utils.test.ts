import assert from "node:assert/strict";
import test from "node:test";
import { parseDateOnly, rentalDays } from "../app/utils/dates.ts";
import { asBoolean, asPositiveNumber, nonEmptyString } from "../app/utils/strings.ts";

test("normaliza entradas simples", () => {
  assert.equal(nonEmptyString("  Vizin  "), "Vizin");
  assert.equal(nonEmptyString("   "), null);
  assert.equal(asBoolean("true"), true);
  assert.equal(asPositiveNumber("12.50"), 12.5);
});

test("calcula dias do aluguel", () => {
  assert.equal(rentalDays(parseDateOnly("2026-08-01"), parseDateOnly("2026-08-04")), 3);
});
