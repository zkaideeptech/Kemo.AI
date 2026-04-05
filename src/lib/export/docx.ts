import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

function sanitizeFileName(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function lineToParagraph(line: string) {
  const trimmed = line.trim();

  if (!trimmed) {
    return new Paragraph({ spacing: { after: 120 } });
  }

  if (trimmed === "---") {
    return new Paragraph({ spacing: { after: 160, before: 160 } });
  }

  const headingMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
  if (headingMatch) {
    const [, hashes, text] = headingMatch;
    const levelMap = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
    } as const;
    return new Paragraph({
      text,
      heading: levelMap[hashes.length as 1 | 2 | 3],
      spacing: { before: 200, after: 120 },
    });
  }

  const emphasizedHeading = /^\*\*(.+)\*\*$/.exec(trimmed);
  if (emphasizedHeading) {
    return new Paragraph({
      text: emphasizedHeading[1],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 180, after: 120 },
    });
  }

  const bulletMatch = /^[-*]\s+(.+)$/.exec(trimmed);
  if (bulletMatch) {
    return new Paragraph({
      text: bulletMatch[1],
      bullet: { level: 0 },
      spacing: { after: 80 },
    });
  }

  return new Paragraph({
    children: [new TextRun({ text: trimmed })],
    spacing: { after: 120 },
  });
}

export async function buildDocxBuffer(params: {
  title: string;
  content: string;
}) {
  const lines = params.content.split(/\r?\n/);
  const paragraphs = [
    new Paragraph({
      text: params.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 240 },
    }),
    ...lines.map(lineToParagraph),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export function buildArtifactDocxFileName(title: string, date = new Date()) {
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const safeTitle = sanitizeFileName(title || "artifact");
  return `${safeTitle}_${stamp}.docx`;
}
