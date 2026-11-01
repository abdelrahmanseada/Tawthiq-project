import "dotenv/config";
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { preparePdfText } from "./lib/pdf/arabic";

const FEATURES = { ccmp:false, mark:false, mkmk:false, rlig:false, liga:false, clig:false, calt:false, init:false, medi:false, fina:false, isol:false } as any;
function draw(page:any, text:string, x:number,y:number,size:number,font:any) {
  const prepared = preparePdfText(text);
  let cursor=x;
  for (const ch of Array.from(prepared)) { page.drawText(ch,{x:cursor,y,size,font,color:rgb(0,0,0)}); cursor += font.widthOfTextAtSize(ch,size); }
}
async function main(){
  const pdf=await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const reg=await pdf.embedFont(await readFile("assets/fonts/ibm-plex-sans-arabic-400.ttf"),{subset:false,features:FEATURES} as any);
  const bold=await pdf.embedFont(await readFile("assets/fonts/ibm-plex-sans-arabic-700.ttf"),{subset:false,features:FEATURES} as any);
  const inter=await pdf.embedFont(await readFile("assets/fonts/inter-400.ttf"),{subset:false,features:FEATURES} as any);
  const page=pdf.addPage([600,420]);
  const lines=["عبد الرحمن محمود","مهندس صيانة","العمليات","صالح حتى 1 نوفمبر 2027","شركة بريمر للمرافق"];
  lines.forEach((t,i)=>draw(page,t,40,360-i*50,20,i%2?reg:bold));
  page.drawText("Verified employee · Tawthiq · 2027",{x:40,y:80,size:16,font:inter});
  writeFileSync("tmp-font-ibm.pdf",await pdf.save());
}
main();
