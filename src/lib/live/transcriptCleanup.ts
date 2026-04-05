function collapseRepeatedPunctuation(text: string) {
  return text.replace(/([，。！？、；：,.!?;:~—-])(?:\s*\1)+/gu, "$1");
}

function collapseRepeatedCharacters(text: string) {
  return text
    .replace(/([\p{Script=Han}])\1{2,}(?=[\p{Script=Han}])/gu, "$1")
    .replace(/([A-Za-z])\1{3,}/g, "$1");
}

function collapseStutteredPhrases(text: string) {
  let next = text;

  for (const size of [4, 3, 2]) {
    next = next.replace(new RegExp(`((?:[\\p{Script=Han}]{${size}}))\\1{1,}(?=[\\p{Script=Han}])`, "gu"), "$1");
  }

  return next;
}

function collapseRepeatedPhrases(text: string) {
  let next = text;

  for (const size of [6, 5, 4, 3, 2]) {
    next = next.replace(new RegExp(`((?:[\\p{Script=Han}A-Za-z0-9]{${size}}))(?:\\s*\\1){2,}`, "gu"), "$1");
  }

  return next;
}

function hasPathologicalRepetition(line: string) {
  return /([\p{Script=Han}])\1{2,}/u.test(line) || /((?:[\p{Script=Han}]{2,4}))(?:\1){2,}/u.test(line);
}

function collapseAggressiveRepeatedUnits(text: string) {
  return text
    .split("\n")
    .map((line) => {
      if (!hasPathologicalRepetition(line)) {
        return line;
      }

      let next = line;

      for (const size of [4, 3, 2]) {
        next = next.replace(new RegExp(`((?:[\\p{Script=Han}]{${size}}))(?:\\1)+`, "gu"), "$1");
      }

      return next.replace(/([\p{Script=Han}])\1+/gu, "$1");
    })
    .join("\n");
}

export function sanitizeTranscriptText(text: string) {
  let next = text.replace(/\r\n/g, "\n").replace(/\u3000/g, " ").trim();

  for (let index = 0; index < 4; index += 1) {
    const previous = next;
    next = collapseRepeatedPunctuation(next);
    next = collapseAggressiveRepeatedUnits(next);
    next = collapseRepeatedCharacters(next);
    next = collapseStutteredPhrases(next);
    next = collapseRepeatedPhrases(next);

    if (next === previous) {
      break;
    }
  }

  return next
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getOverlapLength(left: string, right: string) {
  const max = Math.min(left.length, right.length);

  for (let size = max; size > 0; size -= 1) {
    if (left.slice(-size) === right.slice(0, size)) {
      return size;
    }
  }

  return 0;
}

export function mergeTranscriptText(left: string, right: string, separator = "\n") {
  const base = sanitizeTranscriptText(left);
  const incoming = sanitizeTranscriptText(right);

  if (!base) return incoming;
  if (!incoming) return base;
  if (incoming.startsWith(base)) return incoming;
  if (base === incoming || base.endsWith(incoming)) return base;

  const overlapLength = getOverlapLength(base, incoming);
  if (overlapLength > 0) {
    return sanitizeTranscriptText(`${base}${incoming.slice(overlapLength)}`);
  }

  return sanitizeTranscriptText(`${base}${separator}${incoming}`);
}
