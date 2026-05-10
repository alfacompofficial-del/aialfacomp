// File generators for Nexus agent: pdf, docx, txt, md, zip
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import JSZip from 'https://esm.sh/jszip@3.10.1';

export interface GenFileResult {
  bytes: Uint8Array;
  mime: string;
  ext: string;
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  zip: 'application/zip',
};

export async function generateFile(
  format: string,
  content: string,
  files?: { name: string; content: string }[],
): Promise<GenFileResult> {
  const fmt = format.toLowerCase();
  if (fmt === 'txt' || fmt === 'md') {
    return { bytes: new TextEncoder().encode(content || ''), mime: MIME[fmt], ext: fmt };
  }
  if (fmt === 'pdf') return { bytes: await makePdf(content || ''), mime: MIME.pdf, ext: 'pdf' };
  if (fmt === 'docx') return { bytes: await makeDocx(content || ''), mime: MIME.docx, ext: 'docx' };
  if (fmt === 'zip') return { bytes: await makeZip(files || [{ name: 'README.txt', content: content || '' }]), mime: MIME.zip, ext: 'zip' };
  throw new Error(`Unsupported format: ${format}`);
}

// ── PDF ───────────────────────────────────────────────
async function makePdf(md: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const W = 595, H = 842, margin = 50;
  const maxWidth = W - margin * 2;
  let page = pdf.addPage([W, H]);
  let y = H - margin;

  const lineHeight = (size: number) => size * 1.4;
  const addPage = () => { page = pdf.addPage([W, H]); y = H - margin; };

  // Sanitize: replace non-WinAnsi chars to avoid pdf-lib errors (cyrillic etc.)
  const sanitize = (s: string) => s.replace(/[^\x00-\xff]/g, (c) => {
    // Try to transliterate basic cyrillic → latin
    const map: Record<string, string> = {
      'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'E','Ж':'Zh','З':'Z','И':'I','Й':'Y',
      'К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F',
      'Х':'Kh','Ц':'Ts','Ч':'Ch','Ш':'Sh','Щ':'Sch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya',
      'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y',
      'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
      'х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
      '—':'-','–':'-','«':'"','»':'"','"':'"','"':'"',"'":"'","'":"'",'…':'...',
    };
    return map[c] ?? '?';
  });

  const wrap = (text: string, f: any, size: number): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (f.widthOfTextAtSize(test, size) > maxWidth) {
        if (cur) lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const drawLine = (text: string, f: any, size: number) => {
    const lh = lineHeight(size);
    for (const line of wrap(text, f, size)) {
      if (y - lh < margin) addPage();
      page.drawText(line, { x: margin, y: y - size, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      y -= lh;
    }
  };

  for (const raw of md.split('\n')) {
    const line = sanitize(raw);
    if (!line.trim()) { y -= 8; continue; }
    if (line.startsWith('# ')) { y -= 4; drawLine(line.slice(2), bold, 22); y -= 6; }
    else if (line.startsWith('## ')) { y -= 4; drawLine(line.slice(3), bold, 18); y -= 4; }
    else if (line.startsWith('### ')) { drawLine(line.slice(4), bold, 14); }
    else if (/^[-*]\s/.test(line)) { drawLine('• ' + line.replace(/^[-*]\s/, ''), font, 11); }
    else { drawLine(line, font, 11); }
  }

  return await pdf.save();
}

// ── DOCX (minimal Office Open XML via JSZip) ─────────
async function makeDocx(md: string): Promise<Uint8Array> {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const paragraphs = md.split('\n').map((raw) => {
    const line = raw.trimEnd();
    if (!line) return `<w:p/>`;
    let style = '';
    let text = line;
    if (line.startsWith('# ')) { style = 'Heading1'; text = line.slice(2); }
    else if (line.startsWith('## ')) { style = 'Heading2'; text = line.slice(3); }
    else if (line.startsWith('### ')) { style = 'Heading3'; text = line.slice(4); }
    else if (/^[-*]\s/.test(line)) { text = '• ' + line.replace(/^[-*]\s/, ''); }
    const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
    return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  }).join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="200" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style>
</w:styles>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.file('_rels/.rels', rels);
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', stylesXml);
  zip.file('word/_rels/document.xml.rels', docRels);
  return await zip.generateAsync({ type: 'uint8array' });
}

// ── ZIP ───────────────────────────────────────────────
async function makeZip(files: { name: string; content: string }[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.content);
  return await zip.generateAsync({ type: 'uint8array' });
}
