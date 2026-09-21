/**
 * Applies each rule's literal (non-regex) find/replace to `text` — every occurrence of `find` is
 * replaced with `replace` (which may be empty, to strip `find` entirely). `rules` is a plain
 * object (find -> replace) rather than an array of {find, replace} pairs specifically so it can
 * be exposed as a `type: "string"` setting (parsed via parseLineDelimitedPairs below) and still
 * get a usable native Settings UI editor — see PIPE_DELIMITER's doc comment for why. Applied via
 * split/join rather than a RegExp, so `find` never needs escaping and can't be misread as a
 * pattern.
 */
export function applyFindReplaceRules(text: string, rules: Record<string, string>): string {
  let result = text;
  for (const [find, replace] of Object.entries(rules)) {
    if (!find) {
      continue;
    }
    result = result.split(find).join(replace);
  }
  return result;
}

const PAIR_DELIMITER = "|";

/**
 * Parses a "find|replace" pair-per-line text block (as typed into a multiline `type: "string"`
 * setting) into a find -> replace map. Chosen over requiring JSON object syntax in that string
 * specifically because one malformed line only drops that one line, rather than a single typo
 * anywhere invalidating the entire setting the way one JSON syntax error would.
 *
 * Each line is split on the *first* occurrence of `|` only — everything before it is the find
 * text, everything after is the replace text, both taken verbatim with no trimming, so a find
 * string that itself needs a meaningful trailing space (e.g. "Logi Command Manager: ") is
 * captured exactly by ending the line right after that space, immediately followed by `|`. A
 * replace string may itself contain `|` safely, since only the first occurrence on the line
 * counts as the delimiter — the one real gap is find text that itself needs to contain `|`,
 * which this format can't represent.
 *
 * Blank lines and lines with no `|` at all are skipped silently (not counted as an error) — the
 * whole point of this format is that one bad or accidental line doesn't take down every other
 * rule in the setting.
 */
export function parseLineDelimitedPairs(text: string): Record<string, string> {
  const rules: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.trim().length === 0) {
      continue;
    }
    const delimiterIndex = rawLine.indexOf(PAIR_DELIMITER);
    if (delimiterIndex === -1) {
      continue;
    }
    const find = rawLine.slice(0, delimiterIndex);
    const replace = rawLine.slice(delimiterIndex + PAIR_DELIMITER.length);
    if (find.length === 0) {
      continue;
    }
    rules[find] = replace;
  }
  return rules;
}
