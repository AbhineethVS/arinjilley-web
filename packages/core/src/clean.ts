// Cleaning raw WhatsApp posts before they're stored or sent to the AI (SPEC §4.1, §10):
// no phone numbers, no other groups' invite links, no "join our group" promo lines.

const WHATSAPP_LINK =
  /https?:\/\/(?:chat\.whatsapp\.com|wa\.me|(?:www\.)?whatsapp\.com\/channel)\/[^\s)>\]]*/gi;
// Indian mobile numbers (+91 optional, 5+5 or 10 digits) and other international numbers with a + prefix.
const PHONE_IN = /(?:\+?91[\s-]?)?(?<![\d₹$,.])[6-9]\d{4}[\s-]?\d{5}(?![\d,])/g;
const PHONE_INTL = /\+\d{1,3}[\s-]?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}(?!\d)/g;
const URL = /https?:\/\/[^\s<>"'`*]+/gi;
const PROMO_LINE =
  /\b(join (?:our|the) (?:group|community|channel)|for more hackathons|more hackathons like this|follow this link to join)\b/i;
const WHATSAPP_MARKERS = /<(?:This message was edited|Media omitted)>/gi;

/** Removes trailing punctuation that is almost never part of a URL. */
function trimUrl(url: string): string {
  return url.replace(/[.,;:!?)\]}>]+$/, "");
}

/** All http(s) links in the text, in order, without duplicates and without WhatsApp invite links. */
export function extractUrls(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL)) {
    const url = trimUrl(m[0]);
    if (WHATSAPP_LINK.test(url)) {
      WHATSAPP_LINK.lastIndex = 0;
      continue;
    }
    WHATSAPP_LINK.lastIndex = 0;
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

export function stripPhoneNumbers(text: string): string {
  return text.replace(PHONE_IN, "").replace(PHONE_INTL, "");
}

/** Cleans a raw post: invite links, phone numbers, promo lines and WhatsApp markers removed. */
export function cleanMessage(text: string): string {
  const lines = text
    .replace(WHATSAPP_MARKERS, "")
    .replace(WHATSAPP_LINK, "")
    .split(/\r?\n/)
    .map((line) => stripPhoneNumbers(line).replace(/[ \t]+$/g, ""))
    .filter((line) => !PROMO_LINE.test(line))
    // drop lines that are now just a label, e.g. "📞 Himanshi:" after the number was removed
    .filter((line) => !/^\W*[\p{L} .]{1,30}:\s*$/u.test(line) || /[\d/]/.test(line));
  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Text without URLs and whitespace, used to decide whether a post is "thin" (mostly just a link). */
export function substantiveLength(text: string): number {
  return text.replace(URL, "").replace(/\s+/g, " ").trim().length;
}

// Emoji, flag letters, and the invisible joiners/selectors that glue emoji sequences together.
const EMOJI = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|\u{FE0F}|\u{200D}|\u{20E3}/gu;

/** Removes emojis (WhatsApp text and listings are emoji-free). */
export function stripEmoji(text: string): string {
  return text
    .replace(EMOJI, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
