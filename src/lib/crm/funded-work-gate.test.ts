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

  it("does not treat bare tender words, social posts or law PDFs as funded work", () => {
    for (const text of [
      "procureday blog: sådan bruger du offentlige indkøb og udbud i din virksomhed https://www.procureday.com/blog",
      "puljen on instagram: støttet af pukk https://www.instagram.com/p/abc",
      "retsinformation: virksomheder der modtager investeringsstøtte skal https://www.retsinformation.dk/api/pdf/243794",
      "få hjælp og vejledning til at drive virksomhed https://ehhs.dk/content/ydelser/tilskud-og-programforloeb/x",
    ]) {
      expect(fundedWorkGate(text).allowed).toBe(false);
    }
  });

  it("accepts a notice page on a tendering platform", () => {
    expect(
      fundedWorkGate("it-system til kommunen https://udbud.dk/detaljevisning?noticeid=abc").allowed,
    ).toBe(true);
    expect(
      fundedWorkGate("civilstyrelsen: udbud af kontrakt om softwareudvikling og modernisering").allowed,
    ).toBe(true);
  });

  it("recognises a notice page by the shape of its address, on any platform", () => {
    expect(fundedWorkGate("it-system til kommunen https://nyplatform.eu/tender/12345").allowed).toBe(true);
    expect(fundedWorkGate("software supplier https://example.org/notice/987?lang=da").allowed).toBe(true);
    expect(fundedWorkGate("a blog post about software https://example.org/blog/tender-tips-2024").allowed).toBe(false);
  });

  it("drops document attachments", () => {
    expect(
      fundedWorkGate("udbud analyse af cykelstrømme https://api.udbud.dk/udbud/vedhaeftning/06d7/analyse.pdf").allowed,
    ).toBe(false);
  });

  it("drops generic pages with no sign of funded work", () => {
    expect(fundedWorkGate("a copenhagen software studio offering mvp as a service").allowed).toBe(false);
  });
});
