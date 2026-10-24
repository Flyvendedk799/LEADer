import { describe, expect, it } from "vitest";
import { fundedWorkGate } from "./lanes";

describe("funded work gate", () => {
  it("drops grant programmes and application guides", () => {
    for (const text of [
      "innobooster: sådan får du tilskud til din virksomhed. ansøgningsfrist 1. marts",
      "smv:digital rådgiver – få hjælp til din ansøgning",
      "funding for startups in denmark: how to apply for non-dilutive grants",
    ]) {
      expect(fundedWorkGate(text)).toMatchObject({
        allowed: false,
        reason: "grant programme or application guide, not funded work",
      });
    }
  });

  it("keeps funded work where a buyer is asking suppliers to deliver", () => {
    for (const text of [
      "projektet er finansieret af innovationsfonden. vi søger en ekstern udvikler til platformen",
      "udbud af it-system, støttet af eu-midler https://udbud.dk/detaljevisning?noticeid=1",
      "the founders are hiring an external developer for an ai product funded by a grant",
    ]) {
      expect(fundedWorkGate(text).allowed).toBe(true);
    }
  });

  it("keeps a programme page only if it also asks suppliers for offers", () => {
    expect(
      fundedWorkGate("tilskudsordning: kommunen har fået bevilget midler og indhenter tilbud på softwareleverandør").allowed,
    ).toBe(true);
  });

  it("drops generic pages with no sign of funded work", () => {
    expect(fundedWorkGate("a copenhagen software studio offering mvp as a service").allowed).toBe(false);
  });
});
