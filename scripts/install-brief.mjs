// Validate a candidate against a temporary copy before updating the public index.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.argv[2]) throw new Error('Usage: node scripts/install-brief.mjs work/candidate.json');
const candidate=JSON.parse(fs.readFileSync(path.resolve(process.argv[2]),'utf8'));
if(!/^\d{4}-\d{2}-\d{2}$/.test(candidate.date)) throw new Error('Invalid date');
const expected=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
if(candidate.date!==expected) throw new Error(`Candidate must be for today in Korea: ${expected}`);
const data=path.join(root,'public/data');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'youtubeos-candidate-'));
try {
 fs.cpSync(data,temp,{recursive:true});
 const index=JSON.parse(fs.readFileSync(path.join(data,'index.json'),'utf8'));
 index.latest=candidate.date;index.lastSuccessAt=candidate.generatedAt;
 index.briefs=[{date:candidate.date,count:candidate.ideas.length},...index.briefs.filter(b=>b.date!==candidate.date)].sort((a,b)=>b.date.localeCompare(a.date));
 const briefText=JSON.stringify(candidate,null,2)+'\n',indexText=JSON.stringify(index,null,2)+'\n';
 fs.writeFileSync(path.join(temp,`briefs/${candidate.date}.json`),briefText);
 fs.writeFileSync(path.join(temp,'index.json'),indexText);
 execFileSync(process.execPath,['scripts/validate.mjs'],{cwd:root,env:{...process.env,YOUTUBE_OS_DATA_DIR:temp},stdio:'inherit'});
 for(const [name,text] of [[`briefs/${candidate.date}.json`,briefText],['index.json',indexText]]){fs.writeFileSync(path.join(data,name+'.tmp'),text);fs.renameSync(path.join(data,name+'.tmp'),path.join(data,name));}
 console.log(`Installed verified brief ${candidate.date}; deployment required before public success.`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
