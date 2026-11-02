import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import { CARD_HEIGHT, CARD_WIDTH } from "./card";

/** A4 at 72 dpi in PostScript points. */
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

const COLUMNS = 2;
const ROWS = 4;
export const CARDS_PER_SHEET = COLUMNS * ROWS;
const GAP = 12;
const MARGIN_X = (A4_WIDTH - COLUMNS * CARD_WIDTH - (COLUMNS - 1) * GAP) / 2;
const MARGIN_Y = (A4_HEIGHT - ROWS * CARD_HEIGHT - (ROWS - 1) * GAP) / 2;

interface Position {
  x: number;
  y: number;
}

function positionFor(index: number): Position {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  return {
    x: MARGIN_X + column * (CARD_WIDTH + GAP),
    y: A4_HEIGHT - MARGIN_Y - CARD_HEIGHT - row * (CARD_HEIGHT + GAP),
  };
}

/** Mirrored column for duplex printing (flip on the long edge). */
function mirroredPosition(index: number): Position {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  return positionFor(row * COLUMNS + (COLUMNS - 1 - column));
}

function drawCropMarks(page: PDFPage, position: Position): void {
  const length = 7;
  const offset = 1.6;
  const color = rgb(0.58, 0.64, 0.71);
  const { x, y } = position;
  const corners = [
    { x, y },
    { x: x + CARD_WIDTH, y },
    { x, y: y + CARD_HEIGHT },
    { x: x + CARD_WIDTH, y: y + CARD_HEIGHT },
  ];
  for (const corner of corners) {
    const horizontalSign = corner.x === x ? -1 : 1;
    const verticalSign = corner.y === y ? -1 : 1;
    page.drawLine({
      start: { x: corner.x + horizontalSign * offset, y: corner.y },
      end: { x: corner.x + horizontalSign * length, y: corner.y },
      thickness: 0.45,
      color,
    });
    page.drawLine({
      start: { x: corner.x, y: corner.y + verticalSign * offset },
      end: { x: corner.x, y: corner.y + verticalSign * length },
      thickness: 0.45,
      color,
    });
  }
}

/**
 * Compose CR80 front/back PDFs onto A4 sheets (2 columns × 4 rows = 8 cards).
 * Fronts are printed first, then backs mirrored for long-edge duplex printing.
 * Corner crop marks are drawn outside each card so no ink is wasted inside the trim.
 */
export async function renderCardsSheet(
  cardPdfs: Uint8Array[],
  options: { author?: string } = {},
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setTitle("Employee ID cards — A4 sheet");
  out.setAuthor(options.author ?? "Bremer");
  out.setSubject("Print-ready employee ID cards");
  out.setProducer("Bremer");
  out.setCreator("Bremer");
  out.setCreationDate(new Date());
  out.setModificationDate(new Date());

  for (let start = 0; start < cardPdfs.length; start += CARDS_PER_SHEET) {
    const group = cardPdfs.slice(start, start + CARDS_PER_SHEET);
    const frontPage = out.addPage([A4_WIDTH, A4_HEIGHT]);
    const backPage = out.addPage([A4_WIDTH, A4_HEIGHT]);

    for (let index = 0; index < group.length; index += 1) {
      const cardPdf = group[index]!;
      const source = await PDFDocument.load(cardPdf, { ignoreEncryption: true });
      const sourcePages = source.getPages();
      if (sourcePages.length < 2) throw new Error("Card PDF must contain a front and a back page");
      const [frontEmbedded, backEmbedded] = await out.embedPages([sourcePages[0]!, sourcePages[1]!]);

      const frontPosition = positionFor(index);
      frontPage.drawPage(frontEmbedded!, {
        x: frontPosition.x,
        y: frontPosition.y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      });
      drawCropMarks(frontPage, frontPosition);

      const backPosition = mirroredPosition(index);
      backPage.drawPage(backEmbedded!, {
        x: backPosition.x,
        y: backPosition.y,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      });
      drawCropMarks(backPage, backPosition);
    }
  }

  (out as unknown as { updateInfoDict: () => void }).updateInfoDict = () => {};
  return out.save();
}
