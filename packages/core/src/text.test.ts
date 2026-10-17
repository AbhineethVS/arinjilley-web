import { describe, expect, it } from "vitest";
import { cleanMessage, extractUrls, stripEmoji, substantiveLength } from "./clean";
import { parseDateInput, parseList, parseTeamInput, parseUrlInput } from "./parse";
import { shortPrize } from "./prize";
import { formatIstInput, parseIst } from "./time";
import type { Hackathon } from "./types";
import { whatsappText } from "./whatsapp";

// Real posts from the group (phone numbers here are the ones that appeared in the export's promo footer format).
const HACK_ORBITAL = `🚀 HACK-ORBITAL 2026 | A RACE AGAINST TIME 🚀

🏆 ₹1,50,000 PRIZE POOL
📅 30th Oct -1st Nov, 2026
📍 IIST, Thiruvananthapuram

Registration Link:
https://www.conscientiaiist.org/events/hackorbitalteam

Queries:
📞Himanshi: 8983125415
📞Nilophor: 8096112777`;

const PERCEPTRON = `🚀 Perceptron Hackathon 2026 | Techfest, IIT Bombay
💰 INR 2,00,000 prize pool
🔗 Register: https://techfest.org/competitions/perceptron-hackathon

📲 For more hackathons, join our group: https://chat.whatsapp.com/HRgBh8m962qGtkhIbVu9WH?mode=gi_t <This message was edited>`;

describe("cleanMessage", () => {
  it("removes phone numbers and the label lines they leave behind", () => {
    const out = cleanMessage(HACK_ORBITAL);
    expect(out).not.toMatch(/8983125415|8096112777/);
    expect(out).not.toMatch(/Himanshi|Nilophor/);
    expect(out).toContain("₹1,50,000 PRIZE POOL"); // amounts are not phone numbers
    expect(out).toContain("30th Oct -1st Nov, 2026");
  });
  it("removes WhatsApp invite links, promo lines and edit markers", () => {
    const out = cleanMessage(PERCEPTRON);
    expect(out).not.toMatch(/chat\.whatsapp\.com|join our group|message was edited/i);
    expect(out).toContain("https://techfest.org/competitions/perceptron-hackathon");
  });
  it("handles +91 and spaced numbers", () => {
    expect(cleanMessage("Call +91 98474 89623 now")).toBe("Call  now");
    expect(cleanMessage("Contact 9847489623.")).toBe("Contact .");
  });
});

describe("extractUrls", () => {
  it("returns registration links but not WhatsApp invites, without trailing punctuation", () => {
    expect(extractUrls(`${PERCEPTRON}\nAlso see https://luma.com/ndjvmw7w?tk=3eZkh6.`)).toEqual([
      "https://techfest.org/competitions/perceptron-hackathon",
      "https://luma.com/ndjvmw7w?tk=3eZkh6",
    ]);
  });
  it("measures how much text is left without links", () => {
    expect(substantiveLength("https://luma.com/ndjvmw7w?tk=3eZkh6")).toBe(0);
  });
});

describe("stripEmoji", () => {
  it("removes emojis and flags", () => {
    expect(stripEmoji("🚀 Seva First 🇮🇳 Challenge ⚡️")).toBe("Seva First Challenge");
    expect(stripEmoji("₹1,00,000 · 2–4")).toBe("₹1,00,000 · 2–4");
  });
});

describe("shortPrize", () => {
  it.each([
    ["INR 2,00,000 prize pool", "₹2L"],
    ["₹1,50,000 PRIZE POOL", "₹1.5L"],
    ["₹1 Lakh+ and 4 special awards", "₹1L+"],
    ["₹5.4 Crore total prize pool", "₹5.4Cr"],
    ["Up to $25,000 for first place", "$25K"],
    ["$1,000,000 prize pool", "$1M"],
    ["$17,500 OpenAI API credit pool", "$17.5K"],
    ["₹45,000 · ₹35,000 · ₹25,000", "₹45K"],
    ["PlayStation 5 and a 3D printer", null],
  ])("%s → %s", (input, expected) => {
    expect(shortPrize(input)).toBe(expected);
  });
});

describe("parseDateInput", () => {
  const ref = parseIst("2026-10-17T12:00")!.at;
  const iso = (s: string) => {
    const r = parseDateInput(s, ref);
    return r && r !== "clear" ? formatIstInput(r) : r;
  };
  it.each([
    ["2026-10-25", "2026-10-25"],
    ["2026-10-25 23:59", "2026-10-25T23:59"],
    ["25 Oct", "2026-10-25"],
    ["25th October 2026", "2026-10-25"],
    ["25 Oct 11:59 PM", "2026-10-25T23:59"],
    ["Oct 25, 6pm", "2026-10-25T18:00"],
    ["25/10", "2026-10-25"],
    ["25/10/2026 18:00", "2026-10-25T18:00"],
    ["2 Mar", "2027-03-02"], // more than 60 days in the past → next year
    ["15 Oct", "2026-10-15"], // recent past stays this year
    ["none", "clear"],
    ["rolling", "clear"],
    ["next friday", null],
    ["25 Oct 6", null], // ambiguous time
    ["31 Feb", null],
  ])("%s → %s", (input, expected) => {
    expect(iso(input)).toBe(expected);
  });
});

describe("parseTeamInput", () => {
  it.each([
    ["solo", { min: 1, max: 1 }],
    ["2-4", { min: 2, max: 4 }],
    ["2 to 4 members", { min: 2, max: 4 }],
    ["up to 6", { min: null, max: 6 }],
    ["1+", { min: 1, max: null }],
    ["any", { min: null, max: null }],
    ["3", { min: 3, max: 3 }],
    ["solo or team up to 4", { min: 1, max: 4 }],
    ["lots", null],
  ])("%s", (input, expected) => {
    expect(parseTeamInput(input)).toEqual(expected);
  });
});

describe("parseList / parseUrlInput", () => {
  it("splits lists", () => expect(parseList("AI, Web3,  AI\nFinTech")).toEqual(["AI", "Web3", "FinTech"]));
  it("accepts bare domains", () => expect(parseUrlInput("colossus3.tech")).toBe("https://colossus3.tech/"));
  it("rejects junk", () => expect(parseUrlInput("not a link")).toBeNull());
});

describe("whatsappText", () => {
  const h: Hackathon = {
    id: "x",
    slug: "colossus-3-0",
    status: "live",
    title: "COLOSSUS 3.0 | 24-Hour Hackathon 🔥",
    organiser: "Dr. Ambedkar Institute of Technology, Bengaluru",
    summary: "Build a real solution in 24 hours on campus, with mentors from industry and faculty.",
    howItWorks: [
      "Round 1 (online): submit your idea on the official template",
      "Round 2: top 60 teams build",
    ],
    mode: "offline",
    city: "Bengaluru",
    venue: "Dr. AIT, Bengaluru",
    deadline: parseIst("2026-10-25T23:59"),
    start: parseIst("2026-11-13"),
    end: parseIst("2026-11-14"),
    teamMin: 2,
    teamMax: 4,
    eligibility: "UG/PG students with a valid college ID",
    feeText: "Round 1 free, ₹800 per team for finalists",
    isFree: false,
    prizeText: "₹1 Lakh+",
    prizeShort: "₹1L+",
    themes: ["AgriTech", "FinTech"],
    registerUrl: "https://www.colossus3.tech",
    moreInfoUrl: null,
    brochureUrl: null,
    posterKind: "generated",
    posterStyle: 0,
    posterFileId: null,
    createdBy: null,
    createdAt: 0,
    updatedAt: 0,
    publishedAt: null,
  };
  const links = { siteUrl: "https://arinjilley.example/", groupUrl: "https://chat.whatsapp.com/abc" };

  it("matches the spec layout, without emojis", () => {
    expect(whatsappText(h, links)).toBe(
      [
        "*COLOSSUS 3.0 | 24-Hour Hackathon*",
        "Dr. Ambedkar Institute of Technology, Bengaluru",
        "",
        "Build a real solution in 24 hours on campus, with mentors from industry and faculty.",
        "",
        "*Registration closes:* Sun, 25 Oct, 11:59 PM",
        "*Hackathon:* 13–14 Nov, offline at Dr. AIT, Bengaluru",
        "*Team:* 2–4",
        "*Who can join:* UG/PG students with a valid college ID",
        "*Fee:* Round 1 free, ₹800 per team for finalists",
        "*Prize pool:* ₹1 Lakh+",
        "*Tracks:* AgriTech, FinTech",
        "",
        "*How it works*",
        "1. Round 1 (online): submit your idea on the official template",
        "2. Round 2: top 60 teams build",
        "",
        "Register: https://www.colossus3.tech",
        "Details: https://arinjilley.example/h/colossus-3-0",
        "Join our group: https://chat.whatsapp.com/abc",
      ].join("\n"),
    );
  });

  it("leaves out empty lines and handles rolling listings", () => {
    const text = whatsappText(
      {
        ...h,
        deadline: null,
        summary: null,
        howItWorks: [],
        eligibility: null,
        feeText: null,
        prizeText: null,
        themes: [],
        teamMin: null,
        teamMax: null,
        mode: "online",
      },
      links,
    );
    expect(text).toContain("*Registration:* open until seats fill, so apply early");
    expect(text).toContain("*Hackathon:* 13–14 Nov, online");
    expect(text).not.toMatch(/Team:|Fee:|Prize pool:|Tracks:|How it works/);
  });
});
