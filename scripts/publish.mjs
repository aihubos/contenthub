import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const run=(bin,args,stdio='pipe')=>execFileSync(bin,args,{cwd,encoding:'utf8',stdio});
if(run('git',['branch','--show-current']).trim()!=='main')throw new Error('Daily publishing requires main branch');
const remote=run('git',['remote','get-url','origin']).trim();
if(!['https://github.com/aihubos/youtubeos.git','https://github.com/aihubos/youtubeos','git@github.com:aihubos/youtubeos.git'].includes(remote))throw new Error('Unexpected remote');
const changed=[...run('git',['diff','--name-only']).trim().split('\n'),...run('git',['diff','--cached','--name-only']).trim().split('\n'),...run('git',['ls-files','--others','--exclude-standard']).trim().split('\n')].filter(Boolean);
if(changed.some(p=>!p.startsWith('public/data/')))throw new Error('Non-data changes present. Preserve user work; finish separately before daily publishing.');
run('npm',['run','check'],'inherit');
if(!changed.length){console.log('No data changes; no commit created.');process.exit(0);}
run('git',['add','--','public/data']);
run('git',['commit','-m','Refresh verified daily content recommendations'],'inherit');
run('git',['push','origin','main'],'inherit');
console.log('Pushed. Verify GitHub Pages workflow and public data/UI before reporting success.');
