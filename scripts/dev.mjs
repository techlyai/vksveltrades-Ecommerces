import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const shell=process.platform==='win32';
const children=[spawn('npm',['run','dev','-w','@vks/web'],{stdio:'inherit',shell,env:{...process.env,PORT:process.env.WEB_PORT || '3000'}}),spawn('npm',['run','start:dev','-w','@vks/api'],{stdio:'inherit',shell})];
const stop=()=>children.forEach(child=>child.kill());
process.on('SIGINT',stop);process.on('SIGTERM',stop);
children.forEach(child=>child.on('exit',code=>{if(code){stop();process.exitCode=code}}));
