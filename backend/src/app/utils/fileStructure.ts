import { inflateSync, inflateRawSync } from "node:zlib";
function crc32(b:Buffer) {let c=0xffffffff;for(const byte of b){c^=byte;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function png(b:Buffer) {
 if(!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return false;
 let offset=8, header=false,end=false; const data:Buffer[]=[];let width=0,height=0,depth=0,color=0;
 while(offset+12<=b.length) {
  const n=b.readUInt32BE(offset),type=b.toString("ascii",offset+4,offset+8);
  if(n>b.length-offset-12) return false;
  if(crc32(b.subarray(offset+4,offset+8+n))!==b.readUInt32BE(offset+8+n))return false;
  const chunk=b.subarray(offset+8,offset+8+n);
  if(!header && type!=="IHDR") return false;
  if(type==="IHDR") {if(header||n!==13)return false;header=true;width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);depth=chunk[8]!;color=chunk[9]!;if(!width||!height||width*height>40000000||chunk[10]!==0||chunk[11]!==0||chunk[12]!>1)return false;}
  if(type==="IDAT") data.push(chunk);
  offset+=n+12;
  if(type==="IEND") {if(n!==0)return false;end=true;break;}
 }
 if(!end||offset!==b.length||!data.length)return false;
 const raw=inflateSync(Buffer.concat(data),{maxOutputLength:200000000});
 const channels=({0:1,2:3,3:1,4:2,6:4} as Record<number,number>)[color];
 if(!channels||![1,2,4,8,16].includes(depth))return false;
 const passes=b[28]===0?[[0,0,1,1]]:[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]];
 let position=0;
 for(const [x,y,dx,dy]of passes){const w=Math.max(0,Math.ceil((width-x!)/dx!)),h=Math.max(0,Math.ceil((height-y!)/dy!));if(!w||!h)continue;const row=1+Math.ceil(w*channels*depth/8);for(let line=0;line<h;line++){if(position+row>raw.length||raw[position]!>4)return false;position+=row;}}
 if(position!==raw.length)return false;
 return raw.length>0;
}
function jpeg(b:Buffer) {
 if(b.length<20||b.readUInt16BE(0)!==0xffd8||b.readUInt16BE(b.length-2)!==0xffd9)return false;
 let i=2,frame=false,scan=false;
 while(i<b.length-2) {
  if(b[i++]!==255)return false;while(b[i]===255)i++;
  const marker=b[i++]!;
  if(marker===0xd9)break;
  if(marker===0x00||marker===0xd8)return false;
  if(marker>=0xd0&&marker<=0xd7)continue;
  if(i+2>b.length)return false;const size=b.readUInt16BE(i);if(size<2||i+size>b.length)return false;
  if([0xc0,0xc1,0xc2].includes(marker)){if(size<8||!b.readUInt16BE(i+3)||!b.readUInt16BE(i+5))return false;frame=true;}
  i+=size;
  if(marker===0xda) {scan=true;const start=i;while(i<b.length-2) {if(b[i]===255&&b[i+1]!==0&&!(b[i+1]!>=0xd0&&b[i+1]!<=0xd7))break;i+=b[i]===255?2:1;}if(i===start)return false;}
 }
 return frame&&scan&&i===b.length-2;
}
function gif(b:Buffer) {
 if(b.length<14||!/^GIF8[79]a/.test(b.toString("ascii",0,6))||!b.readUInt16LE(6)||!b.readUInt16LE(8))return false;
 let i=13+((b[10]!&128)?3*(1<<((b[10]!&7)+1)):0),images=0;
 const blocks=()=>{while(i<b.length){const size=b[i++]!;if(!size)return true;if(i+size>b.length)return false;i+=size;}return false;};
 while(i<b.length) {const tag=b[i++]!;if(tag===0x3b)return images>0&&i===b.length;if(tag===0x21){i++;if(!blocks())return false;}else if(tag===0x2c){if(i+9>b.length||!b.readUInt16LE(i+4)||!b.readUInt16LE(i+6))return false;const packed=b[i+8]!;i+=9;if(packed&128)i+=3*(1<<((packed&7)+1));if(i>=b.length||b[i]!<2||b[i]!>8)return false;i++;if(!blocks())return false;images++;}else return false;}
 return false;
}
function webp(b:Buffer) {
 if(b.length<26||b.toString("ascii",0,4)!=="RIFF"||b.toString("ascii",8,12)!=="WEBP"||b.readUInt32LE(4)+8!==b.length)return false;
 let i=12,image=false;
 while(i+8<=b.length){const type=b.toString("ascii",i,i+4),n=b.readUInt32LE(i+4);i+=8;if(n>b.length-i)return false;const c=b.subarray(i,i+n);if(type==="VP8 "){if(n<10||!c.subarray(3,6).equals(Buffer.from([157,1,42])))return false;image=true;}if(type==="VP8L"){if(n<6||c[0]!==47)return false;image=true;}if(type==="ANMF"){if(n<24)return false;image=true;}i+=n+(n%2);}
 return image&&i===b.length;
}
function mp4(b:Buffer) {
 let mediaBytes=0,sampleBytes=0,samples=0,movie=false,brand=false;
 const containers=new Set(["moov","trak","mdia","minf","stbl","edts","udta"]);
 function boxes(start:number,end:number,depth:number):boolean {
  if(depth>16)return false;let i=start;
  while(i+8<=end){let size=b.readUInt32BE(i),header=8;const type=b.toString("ascii",i+4,i+8);if(size===1){if(i+16>end)return false;const big=b.readBigUInt64BE(i+8);if(big>BigInt(end-i))return false;size=Number(big);header=16;}if(size===0)size=end-i;if(size<header||i+size>end)return false;const data=i+header,limit=i+size;
   if(type==="ftyp"){if(size<header+8)return false;brand=true;}
   if(type==="mdat")mediaBytes+=size-header;
   if(type==="mvhd"){if(size<header+100)return false;movie=true;}
   if(type==="stsz"){if(data+12>limit)return false;const fixed=b.readUInt32BE(data+4),count=b.readUInt32BE(data+8);if(count>10000000)return false;samples+=count;if(fixed)sampleBytes+=fixed*count;else{if(data+12+count*4>limit)return false;for(let k=0;k<count;k++)sampleBytes+=b.readUInt32BE(data+12+k*4);}}
   if(type==="stz2"){if(data+12>limit)return false;const bits=b[data+7]!,count=b.readUInt32BE(data+8);if(![4,8,16].includes(bits)||data+12+Math.ceil(count*bits/8)>limit)return false;samples+=count;for(let k=0;k<count;k++){const pos=data+12+Math.floor(k*bits/8);sampleBytes+=bits===16?b.readUInt16BE(pos):bits===8?b[pos]!:k%2?b[pos]!&15:b[pos]!>>4;}}
   if(containers.has(type)&&!boxes(data,limit,depth+1))return false;
   i=limit;
  }
  return i===end;
 }
 return boxes(0,b.length,0)&&brand&&movie&&mediaBytes>0&&(samples===0||sampleBytes<=mediaBytes);
}
function docx(b:Buffer) {
 const end=b.lastIndexOf(Buffer.from([80,75,5,6]));if(end<0||end+22>b.length||end+22+b.readUInt16LE(end+20)!==b.length)return false;
 const count=b.readUInt16LE(end+10),size=b.readUInt32LE(end+12),start=b.readUInt32LE(end+16);if(start+size!==end||!count||count>10000)return false;
 let i=start,total=0;const names=new Set<string>();
 for(let k=0;k<count;k++){if(i+46>end||b.readUInt32LE(i)!==0x02014b50)return false;const method=b.readUInt16LE(i+10),compressed=b.readUInt32LE(i+20),plain=b.readUInt32LE(i+24),n=b.readUInt16LE(i+28),extra=b.readUInt16LE(i+30),comment=b.readUInt16LE(i+32),local=b.readUInt32LE(i+42);if(i+46+n+extra+comment>end||local+30>start||b.readUInt32LE(local)!==0x04034b50)return false;const name=b.toString("utf8",i+46,i+46+n);names.add(name);const dataStart=local+30+b.readUInt16LE(local+26)+b.readUInt16LE(local+28);if(dataStart+compressed>start||plain>50000000||(total+=plain)>100000000)return false;const data=b.subarray(dataStart,dataStart+compressed);const raw=method===0?data:method===8?inflateRawSync(data,{maxOutputLength:50000000}):null;if(!raw||raw.length!==plain||crc32(raw)!==b.readUInt32LE(i+16))return false;i+=46+n+extra+comment;}
 return i===end&&["[Content_Types].xml","word/document.xml","_rels/.rels"].every(n=>names.has(n));
}
function webm(b:Buffer) {
 if(b.length<20||b.readUInt32BE(0)!==0x1a45dfa3)return false;
 let header=false,segment=false,tracks=false,cluster=false,nodes=0;
 const masters=new Set(["1a45dfa3","18538067","1549a966","1654ae6b","ae","e0","e1","1f43b675","a0","114d9b74","4dbb","1c53bb6b","bb","b7","1254c367","7373","67c8"]);
 function parse(start:number,end:number,depth:number):boolean {
  if(depth>16)return false;let i=start;
  while(i<end){if(++nodes>100000)return false;const first=b[i]!;let idLen=1;while(idLen<=4&&!(first&(1<<(8-idLen))))idLen++;if(idLen>4||i+idLen>=end)return false;const id=b.subarray(i,i+idLen).toString("hex");i+=idLen;const f=b[i]!;let len=1;while(len<=8&&!(f&(1<<(8-len))))len++;if(len>8||i+len>end)return false;let size=BigInt(f&((1<<(8-len))-1));for(let j=1;j<len;j++)size=(size<<8n)|BigInt(b[i+j]!);i+=len;const unknown=size===(1n<<BigInt(7*len))-1n;if(unknown&&!(["18538067","1f43b675"].includes(id)))return false;if(!unknown&&size>BigInt(end-i))return false;const limit=unknown?end:i+Number(size);
   if(id==="4282")header=b.toString("ascii",i,limit)==="webm";
   if(id==="18538067")segment=true;if(id==="1654ae6b")tracks=true;if(id==="1f43b675")cluster=limit>i;
   if(masters.has(id)&&!parse(i,limit,depth+1))return false;i=limit;
  }
  return i===end;
 }
 return parse(0,b.length,0)&&header&&segment&&tracks&&cluster;
}
export function validFileStructure(b:Buffer,mime:string):boolean {
 try {
 if(mime==="image/png")return png(b);if(mime==="image/jpeg")return jpeg(b);if(mime==="image/gif")return gif(b);if(mime==="image/webp")return webp(b);
 if(mime==="application/pdf") {
  const source=b.toString("latin1"),match=/startxref\s+(\d+)\s+%%EOF\s*$/.exec(source);if(b.length<40||!/^%PDF-(1\.[0-9]|2\.0)/.test(source)||!match||!source.includes("/Root"))return false;
  const offset=Number(match[1]);return offset>0&&offset<b.length&&(source.slice(offset).startsWith("xref")||/^\d+\s+\d+\s+obj[\s\S]*?\/Type\s*\/XRef/.test(source.slice(offset)));
 }
 if(mime==="video/mp4")return mp4(b);if(mime==="video/webm")return webm(b);
 if(mime.endsWith("wordprocessingml.document"))return docx(b);
 if(mime==="application/msword") {if(b.length<512||!b.subarray(0,8).equals(Buffer.from([208,207,17,224,161,177,26,225])))return false;const shift=b.readUInt16LE(30);if(![9,12].includes(shift)||b.length%(1<<shift)!==0||b.readUInt16LE(28)!==0xfffe)return false;const dir=b.readUInt32LE(48);return (dir+1)*(1<<shift)<b.length&&b.includes(Buffer.from("WordDocument","utf16le"));}
 return false;
 } catch {return false;}
}

export async function validFileContent(bytes:Buffer,mime:string):Promise<boolean> {
 if(!validFileStructure(bytes,mime))return false;
 if(!mime.startsWith("image/"))return true;
 try {
  const {default:sharp}=await import("sharp");
  // Decode every frame; metadata or magic-byte checks alone miss truncated compressed data.
  await sharp(bytes,{animated:true,failOn:"warning",limitInputPixels:40000000}).raw().toBuffer();
  return true;
 } catch {return false;}
}
