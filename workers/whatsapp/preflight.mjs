// No WhatsApp session, QR, credentials or outgoing messages are used by this check.
import {statfs,mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer';
if(Number(process.versions.node.split('.')[0])!==24)throw Error('NODE_24_REQUIRED');
const runtime=resolve(process.env.WHATSAPP_RUNTIME_DIRECTORY??'/run/croco');
const state=resolve(process.env.WHATSAPP_STATE_DIRECTORY??'/var/lib/croco');
if(runtime===state)throw Error('STATE_AND_RUNTIME_MUST_DIFFER');
await mkdir(runtime,{recursive:true,mode:0o700});await mkdir(state,{recursive:true,mode:0o700});
if(process.platform!=='linux'||Number((await statfs(runtime)).type)!==0x01021994)throw Error('RUNTIME_TMPFS_REQUIRED');
const probe=resolve(state,'.croco-write-probe');await writeFile(probe,'probe',{mode:0o600});if(await readFile(probe,'utf8')!=='probe')throw Error('PERSISTENT_WRITE_FAILED');await unlink(probe);
let browser;
try{browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium',userDataDir:resolve(runtime,'preflight'),args:[]});console.log('PREFLIGHT_OK_SANDBOX_ENABLED');}
catch{console.error('CHROMIUM_SANDBOX_PREFLIGHT_FAILED');process.exitCode=1;}
finally{await browser?.close();}
