import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shim = join(root, 'bin/altitude-copilot-hook.mjs');
const allow = {version:1,exitCode:0,action:'allow',context:[],session:{id:'chat-a'}};
const time = Date.parse('2026-09-25T04:00:00Z');
const iso = n => new Date(time+n).toISOString();
function events(cwd, host='cli', suffix='a', offset=0) {
  const event = (type,id,parentId,data,n) => ({type,id,parentId,data,timestamp:iso(offset+n)});
  return [
    event('session.start','start',null,{sessionId:'chat-a',version:1,producer:'copilot-agent',copilotVersion:'1.0.88',...(host==='cli'?{context:{cwd}}:{vscodeVersion:'1.138.0'})},0),
    event('user.message',`user-${suffix}`,'start',{content:'Explain this',...(host==='cli'?{messageId:`native-${suffix}`,turnId:'0'}:{})},20),
    event('assistant.turn_start',`turn-${suffix}`,`user-${suffix}`,{turnId:'0'},30),
    event('assistant.message',`answer-${suffix}`,`turn-${suffix}`,{content:`Question ${suffix}?`,messageId:`message-${suffix}`,toolRequests:[],...(host==='cli'?{turnId:'0',originatingMessageId:`native-${suffix}`}:{})},40),
    event('assistant.turn_end',`end-${suffix}`,`answer-${suffix}`,{turnId:'0'},50),
  ];
}
async function fixture(t, host='cli', response=allow, status=0) {
  const dir=await mkdtemp(join(tmpdir(),'altitude-copilot-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const cwd=join(dir,'project'); await mkdir(cwd);
  const capture=join(dir,'calls.jsonl'); const cli=join(dir,'cli.mjs');
  await writeFile(cli,`import fs from 'node:fs'; fs.appendFileSync(${JSON.stringify(capture)},JSON.stringify({args:process.argv.slice(2),input:JSON.parse(fs.readFileSync(0,'utf8'))})+'\\n'); process.stdout.write(${JSON.stringify(typeof response==='string'?response:JSON.stringify(response))}); process.exit(${status});`);
  const path=host==='cli'?join(dir,'session-state/chat-a/events.jsonl'):join(dir,'transcripts/chat-a.jsonl'); await mkdir(dirname(path),{recursive:true});
  const put=es=>writeFile(path,es.map(e=>JSON.stringify(e)).join('\n')+'\n');
  const payload=(action,extra={})=>host==='cli'?{sessionId:'chat-a',cwd,timestamp:time+(action==='stop'?100:10),...(action==='stop'?{transcriptPath:path,stopReason:'end_turn',stop_hook_active:false}:{}),...extra}:{session_id:'chat-a',cwd,timestamp:iso(action==='stop'?100:21),transcript_path:path,hook_event_name:action==='stop'?'Stop':action==='diff'?'PreToolUse':action==='session-start'?'SessionStart':'UserPromptSubmit',...(action==='stop'?{stop_hook_active:false}:{}),...extra};
  const run=(action,input=payload(action),env={})=>spawnSync(process.execPath,[shim,host,action],{input:JSON.stringify(input),encoding:'utf8',env:{...process.env,ALTITUDE_CLI_PATH:cli,ALTITUDE_COPILOT_STATE_DIR:join(dir,'state'),...env}});
  const calls=async()=>JSON.parse('['+(await readFile(capture,'utf8')).trim().split('\n').join(',')+']');
  const output=result=>{assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout)};
  return {dir,cwd,path,put,payload,run,calls,output,capture,cli};
}

test('Copilot native plugin shares seven skills and a single cross-host hook set',async()=>{
  const p=JSON.parse(await readFile(join(root,'.plugin/plugin.json'),'utf8'));
  assert.equal(p.name,'altitude'); assert.equal(p.version,JSON.parse(await readFile(join(root,'.claude-plugin/plugin.json'),'utf8')).version);
  const hooks=p.hooks;
  assert.equal(typeof hooks,'object'); // An external path also discovers Claude's default hooks/hooks.json in VS Code.
  assert.deepEqual(Object.keys(hooks).sort(),['SessionStart','UserPromptSubmit','PreToolUse','Stop','SessionEnd'].sort());
  for(const key of ['SessionStart','UserPromptSubmit','PreToolUse','Stop']) assert.ok(hooks[key]?.length);
  for(const entries of Object.values(hooks))for(const entry of entries) {
    assert.deepEqual(entry.env,{PLUGIN_ROOT:'${PLUGIN_ROOT}'});
    assert.doesNotMatch(entry.bash,/\$\{PLUGIN_ROOT\}/);
    assert.doesNotMatch(entry.powershell,/\$\{PLUGIN_ROOT\}/);
  }
  for(const name of ['begin','next-lesson','connect','status','start-project','plan-journey','adopt-project']) assert.match(await readFile(join(root,'skills',name,'SKILL.md'),'utf8'),/Copilot/);
  assert.match(await readFile(join(root,'skills/connect/SKILL.md'),'utf8'),/--agent copilot/);
});
for(const host of ['cli','vscode']) {
  test(`${host} prompt declares exact session and fresh generation without trusting origin`,async t=>{
    const f=await fixture(t,host); await f.put(events(f.cwd,host).slice(0,2));
    const out=f.output(f.run('user-prompt-submit',f.payload('user-prompt-submit',{prompt:'Explain this',prompt_origin:'learner'})));
    assert.match(JSON.stringify(out),/chat-a/);
    const [call]=await f.calls(); assert.equal(call.input.session_id,'chat-a');assert.equal(call.input.prompt_origin,'unknown');assert.ok(call.input.generation_id);
    assert.equal(call.args[call.args.indexOf('--agent')+1],'copilot');assert.equal(call.args[call.args.indexOf('--stop-policy')+1],'defer-to-prompt');
  });
  test(`${host} captures only completed response linked to current prompt`,async t=>{
    const f=await fixture(t,host);const es=events(f.cwd,host);await f.put(es.slice(0,2));
    f.output(f.run('user-prompt-submit',f.payload('user-prompt-submit',{prompt:'Explain this'})));await f.put(es);f.output(f.run('stop'));
    const calls=await f.calls();assert.equal(calls[1].input.generation_id,calls[0].input.generation_id);assert.equal(calls[1].input.stop_status,'completed');assert.equal(calls[1].input.last_assistant_message,'Question a?');
  });
  for(const variant of ['wrong session','wrong cwd','wrong producer','future schema','incomplete','tool-only','error','interrupted','broken parent','wrong user','changed path','missing receipt']) test(`${host} rejects ${variant} evidence`,async t=>{
    const f=await fixture(t,host);const es=events(f.cwd,host);await f.put(es.slice(0,2));
    if(variant!=='missing receipt') f.output(f.run('user-prompt-submit',f.payload('user-prompt-submit',{prompt:'Explain this'})));
    let stop=f.payload('stop');
    if(variant==='wrong session')es[0].data.sessionId='chat-b';
    if(variant==='wrong cwd') {if(host==='cli')es[0].data.context.cwd=f.dir;else stop.cwd=f.dir;}
    if(variant==='wrong producer')es[0].data.producer='another-host';
    if(variant==='future schema')es[0].data.version=2;
    if(variant==='incomplete')es.pop();
    if(variant==='tool-only'){es[3].data.toolRequests=[{name:'read_file'}];es[3].data.content='';}
    if(variant==='error')es.push({type:'session.error',id:'error',parentId:es.at(-1).id,timestamp:iso(60),data:{}});
    if(variant==='interrupted'){if(host==='cli')stop.stopReason='cancelled';else es.push({type:'abort',id:'abort',parentId:es.at(-1).id,timestamp:iso(60),data:{}});}
    if(variant==='broken parent')es[3].parentId='missing';
    if(variant==='wrong user'){if(host==='cli')es[3].data.originatingMessageId='another-user';else es[1].id='another-user';}
    if(variant==='changed path'){const next=join(f.dir,'other/chat-a.jsonl');await mkdir(dirname(next));await writeFile(next,es.map(JSON.stringify).join('\n'));stop.transcript_path=next;stop.transcriptPath=next;}
    await f.put(es);f.output(f.run('stop',stop));
    const calls=await f.calls().catch(()=>[]);for(const call of calls.filter(c=>c.args[1]==='stop')) {assert.ok(call.input.generation_id);assert.notEqual(call.input.stop_status,'completed');assert.equal(call.input.last_assistant_message,undefined);}
  });
  test(`${host} repeated turn ID and identical text do not reuse preceding question`,async t=>{
    const f=await fixture(t,host);const first=events(f.cwd,host);const second=events(f.cwd,host,'b',200).slice(1);second[0].parentId=first.at(-1).id;await f.put([...first,...second.slice(0,1)]);
    const prompt=f.payload('user-prompt-submit',{prompt:'Explain this',timestamp:host==='cli'?time+210:iso(221)});f.output(f.run('user-prompt-submit',prompt));
    await f.put([...first,...second]);f.output(f.run('stop',f.payload('stop',{timestamp:host==='cli'?time+300:iso(300)})));
    assert.equal((await f.calls()).at(-1).input.last_assistant_message,'Question b?');
  });
  test(`${host} missing identity skips core entirely`,async t=>{
    const f=await fixture(t,host);const p=f.payload('session-start');delete p.sessionId;delete p.session_id;assert.deepEqual(f.output(f.run('session-start',p)),{});await assert.rejects(readFile(f.capture),{code:'ENOENT'});
  });
  test(`${host} read tools do not run mutation gate`,async t=>{
    const f=await fixture(t,host);assert.deepEqual(f.output(f.run('diff',f.payload('diff',{toolName:'read_file',tool_name:'read_file'}))),{});await assert.rejects(readFile(f.capture),{code:'ENOENT'});
  });
  test(`${host} intentional mutation block preserves native permission policy on allow`,async t=>{
    const f=await fixture(t,host,{...allow,action:'block',exitCode:2,reason:'Review this change.'},2);
    const result=f.output(f.run('diff',f.payload('diff',{toolName:'edit',tool_name:'replace_string_in_file',toolArgs:JSON.stringify({path:'a.js'}),tool_input:{filePath:'a.js'}})));
    assert.match(JSON.stringify(result),/deny/);assert.match(JSON.stringify(result),/Review this change/);
  });
  for(const [label,response,status] of [['invalid JSON','oops',2],['wrong session',{...allow,session:{id:'chat-b'}},0],['crash',allow,1],['inconsistent block',{...allow,action:'block'},2]])test(`${host} ${label} fails open without pre-approving tools`,async t=>{
    const f=await fixture(t,host,response,status);assert.deepEqual(f.output(f.run('diff',f.payload('diff',{toolName:'edit',tool_name:'replace_string_in_file'}))),{});
  });
}


test('CLI final response becoming durable during stop is captured once',async t=>{
  const f=await fixture(t);const es=events(f.cwd);await f.put(es.slice(0,2));
  f.output(f.run('user-prompt-submit',f.payload('user-prompt-submit',{prompt:'Explain this'})));
  const child=spawn(process.execPath,[shim,'cli','stop'],{env:{...process.env,ALTITUDE_CLI_PATH:f.cli,ALTITUDE_COPILOT_STATE_DIR:join(f.dir,'state')},stdio:['pipe','pipe','pipe']});
  let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);
  const exit=new Promise(resolve=>child.on('close',resolve)); child.stdin.end(JSON.stringify(f.payload('stop')));
  await new Promise(resolve=>setTimeout(resolve,150)); await f.put(es);
  assert.equal(await exit,0,err);assert.deepEqual(JSON.parse(out),{});
  assert.equal((await f.calls()).at(-1).input.stop_status,'completed');
  f.output(f.run('stop'));assert.equal((await f.calls()).length,2);
});

test('a late stop cannot attribute a new prompt to the preceding turn',async t=>{
  const f=await fixture(t);const es=events(f.cwd);await f.put(es);
  f.output(f.run('user-prompt-submit',f.payload('user-prompt-submit',{prompt:'Explain this',timestamp:time+210})));
  f.output(f.run('stop'));assert.equal((await f.calls()).length,1);
});

test('missing CLI and malformed input fail open without invoking a fallback',async t=>{
  const f=await fixture(t);assert.deepEqual(f.output(f.run('diff',f.payload('diff',{toolName:'edit'}),{ALTITUDE_CLI_PATH:join(f.dir,'missing.mjs')})),{});
  await assert.rejects(readFile(f.capture),{code:'ENOENT'});
});

test('compatibility callbacks share one context shape and raw patch normalization',async t=>{
  const f=await fixture(t);
  const run=(action,raw)=>spawnSync(process.execPath,[shim,'auto',action],{input:JSON.stringify(raw),encoding:'utf8',env:{...process.env,ALTITUDE_CLI_PATH:f.cli,ALTITUDE_COPILOT_STATE_DIR:join(f.dir,'state')}});
  const raw={session_id:'chat-a',timestamp:iso(10),cwd:f.cwd,hook_event_name:'SessionStart'};
  const output=f.output(run('session-start',raw));assert.equal(output.additionalContext,output.hookSpecificOutput.additionalContext);
  const patch='*** Begin Patch\n*** Add File: a.js\n+1\n*** End Patch';
  assert.deepEqual(f.output(run('diff',{...raw,hook_event_name:'PreToolUse',tool_name:'apply_patch',tool_input:patch})),{});
  assert.deepEqual((await f.calls()).at(-1).input.tool_input,{patch});
});

test('outer bash wrapper returns empty decision when Node or adapter is unavailable',async t=>{
  const f=await fixture(t);const wrapper=join(root,'bin/altitude-copilot-hook.sh');
  for(const env of [{PATH:join(f.dir,'missing'),PLUGIN_ROOT:root},{PATH:dirname(process.execPath),PLUGIN_ROOT:join(f.dir,'missing')}]) {
    const result=spawnSync('/bin/bash',[wrapper,'diff'],{input:'{}',encoding:'utf8',env:{...process.env,...env}});
    assert.deepEqual(f.output(result),{});
  }
});

test('shell bootstrap treats plugin paths as data including shell punctuation',async t=>{
  const f=await fixture(t);const tricky=join(f.dir,'plugin \' quote " & $(touch INJECTED) `whoami`');await mkdir(join(tricky,'bin'),{recursive:true});
  await writeFile(join(tricky,'bin/altitude-copilot-hook.mjs'),"process.stdout.write(JSON.stringify({loaded:'correct'}))");
  const result=spawnSync('/bin/bash',[join(root,'bin/altitude-copilot-hook.sh'),'diff'],{input:'{}',encoding:'utf8',env:{...process.env,PLUGIN_ROOT:tricky}});
  assert.deepEqual(f.output(result),{loaded:'correct'});await assert.rejects(readFile(join(f.dir,'INJECTED')),{code:'ENOENT'});
});

test('Copilot marketplace installs the same native plugin rather than copied skills',async()=>{
  const marketplace=JSON.parse(await readFile(join(root,'.github/plugin/marketplace.json'),'utf8'));
  assert.equal(marketplace.name,'altitude');assert.equal(marketplace.plugins.length,1);
  assert.equal(marketplace.plugins[0].name,'altitude');assert.equal(marketplace.plugins[0].source,'.');
});

for(const host of ['cli','vscode'])test(`manifest command transports ${host} fixture evidence with one core call per event`,async t=>{
  const f=await fixture(t,host);const es=events(f.cwd,host);await f.put(es.slice(0,2));
  const config=JSON.parse(await readFile(join(root,'.plugin/plugin.json'),'utf8')).hooks;
  const run=(name,extra={})=>{
    const action=name==='Stop'?'stop':'user-prompt-submit';const raw=f.payload(action,extra);
    if(host==='cli') {raw.session_id=raw.sessionId;delete raw.sessionId;raw.timestamp=new Date(raw.timestamp).toISOString();raw.hook_event_name=name;if(raw.transcriptPath){raw.transcript_path=raw.transcriptPath;delete raw.transcriptPath;}if(raw.stopReason){raw.stop_reason=raw.stopReason;delete raw.stopReason;}}
    return spawnSync('/bin/bash',['-c',config[name][0].bash],{input:JSON.stringify(raw),encoding:'utf8',env:{...process.env,PLUGIN_ROOT:root,ALTITUDE_CLI_PATH:f.cli,ALTITUDE_COPILOT_STATE_DIR:join(f.dir,'state')}});
  };
  f.output(run('UserPromptSubmit',{prompt:'Explain this'}));await f.put(es);f.output(run('Stop'));
  const calls=await f.calls();assert.equal(calls.length,2);assert.equal(calls[1].input.stop_status,'completed');assert.equal(calls[1].input.last_assistant_message,'Question a?');assert.equal(calls[0].input.generation_id,calls[1].input.generation_id);
});

test('a concatenated foreign chat cannot borrow the first transcript header',async t=>{
  const f=await fixture(t);const es=events(f.cwd);
  f.output(f.run('user-prompt-submit',f.payload('user-prompt-submit',{prompt:'Explain this'})));
  es.splice(1,0,{...es[0],id:'foreign-start',data:{...es[0].data,sessionId:'chat-b'}});
  await f.put(es);f.output(f.run('stop'));
  const stop=(await f.calls()).at(-1);assert.notEqual(stop.input.stop_status,'completed');assert.equal(stop.input.last_assistant_message,undefined);
});

test('CLI model telemetry with independent ancestry does not invalidate the canonical completed turn',async t=>{
  const f=await fixture(t);const es=events(f.cwd);
  f.output(f.run('user-prompt-submit',f.payload('user-prompt-submit',{prompt:'Explain this'})));
  // Native CLI1.0.88 also logs telemetry with null or external telemetry parents.
  // None of it supplies user identity, assistant text, or completion evidence.
  es.splice(2,0,
    {type:'model.turn_started',id:'telemetry-turn',parentId:null,timestamp:iso(22),data:{kind:'turn_started'}},
    {type:'model.model_call_started',id:'telemetry-call',parentId:'outside-telemetry-id',timestamp:iso(23),data:{kind:'model_call_started'}},
    {type:'model.response',id:'telemetry-response',parentId:'telemetry-call',timestamp:iso(24),data:{response:{content:'Never capture this telemetry response'}}},
  );
  await f.put(es);f.output(f.run('stop'));
  const stop=(await f.calls()).at(-1);assert.equal(stop.input.stop_status,'completed');assert.equal(stop.input.last_assistant_message,'Question a?');
});

for(const variant of ['null user parent','missing assistant parent','telemetry in canonical ancestry','duplicate telemetry identity','telemetry error'])test(`independent telemetry does not relax ${variant}`,async t=>{
  const f=await fixture(t);const es=events(f.cwd);
  f.output(f.run('user-prompt-submit',f.payload('user-prompt-submit',{prompt:'Explain this'})));
  const telemetry={type:'model.turn_started',id:'telemetry-turn',parentId:null,timestamp:iso(22),data:{}};
  if(variant==='null user parent')es[1].parentId=null;
  if(variant==='missing assistant parent')es[3].parentId='missing';
  if(variant==='telemetry in canonical ancestry'){telemetry.parentId=es[2].id;es[3].parentId=telemetry.id;}
  if(variant==='duplicate telemetry identity')telemetry.id=es[2].id;
  if(variant==='telemetry error')telemetry.type='model.error';
  es.splice(3,0,telemetry);await f.put(es);f.output(f.run('stop'));
  const stop=(await f.calls()).at(-1);assert.notEqual(stop.input.stop_status,'completed');assert.equal(stop.input.last_assistant_message,undefined);
});

for(const tool of ['Write','Edit'])test(`Copilot CLI compatibility ${tool} mutation reaches the diff gate and preserves native denial`,async t=>{
  const f=await fixture(t,'cli',{...allow,action:'block',exitCode:2,reason:'Review this mutation first.'},2);
  const raw={hook_event_name:'PreToolUse',session_id:'chat-a',timestamp:iso(10),cwd:f.cwd,tool_name:tool,tool_input:{path:join(f.cwd,'a.js'),file_text:'probe'}};
  const result=spawnSync(process.execPath,[shim,'auto','diff'],{input:JSON.stringify(raw),encoding:'utf8',env:{...process.env,ALTITUDE_CLI_PATH:f.cli,ALTITUDE_COPILOT_STATE_DIR:join(f.dir,'state')}});
  const out=f.output(result);assert.equal(out.permissionDecision,'deny');assert.equal(out.hookSpecificOutput.permissionDecision,'deny');
  const [call]=await f.calls();assert.equal(call.input.tool_name,tool);assert.deepEqual(call.input.tool_input,raw.tool_input);
});
for(const tool of ['Read','Bash','WriteShellStdin','MCP:Write','mcp__files__Edit'])test(`compatibility mutation aliases do not broaden gating to ${tool}`,async t=>{
  const f=await fixture(t);const raw={hook_event_name:'PreToolUse',session_id:'chat-a',timestamp:iso(10),cwd:f.cwd,tool_name:tool,tool_input:{}};
  const result=spawnSync(process.execPath,[shim,'auto','diff'],{input:JSON.stringify(raw),encoding:'utf8',env:{...process.env,ALTITUDE_CLI_PATH:f.cli,ALTITUDE_COPILOT_STATE_DIR:join(f.dir,'state')}});
  assert.deepEqual(f.output(result),{});await assert.rejects(readFile(f.capture),{code:'ENOENT'});
});

test('Copilot compatibility Edit carries native apply_patch text as data and reaches the diff denial',async t=>{
  const f=await fixture(t,'cli',{...allow,action:'block',exitCode:2,reason:'Review this patch first.'},2);
  const patch='*** Begin Patch\n*** Add File: gate-patch-probe.txt\n+probe\n*** End Patch\n';
  const raw={hook_event_name:'PreToolUse',session_id:'chat-a',timestamp:iso(10),cwd:f.cwd,tool_name:'Edit',tool_input:patch};
  const result=spawnSync(process.execPath,[shim,'auto','diff'],{input:JSON.stringify(raw),encoding:'utf8',env:{...process.env,ALTITUDE_CLI_PATH:f.cli,ALTITUDE_COPILOT_STATE_DIR:join(f.dir,'state')}});
  const out=f.output(result);assert.equal(out.permissionDecision,'deny');assert.equal(out.hookSpecificOutput.permissionDecision,'deny');
  const [call]=await f.calls();assert.equal(call.input.tool_name,'Edit');assert.deepEqual(call.input.tool_input,{patch});
});

test('compatibility Edit still parses structured JSON arguments and rejects arbitrary non-patch strings',async t=>{
  const f=await fixture(t);const raw={hook_event_name:'PreToolUse',session_id:'chat-a',timestamp:iso(10),cwd:f.cwd,tool_name:'Edit',tool_input:JSON.stringify({path:'a.js',old_str:'a',new_str:'b'})};
  const run=input=>spawnSync(process.execPath,[shim,'auto','diff'],{input:JSON.stringify(input),encoding:'utf8',env:{...process.env,ALTITUDE_CLI_PATH:f.cli,ALTITUDE_COPILOT_STATE_DIR:join(f.dir,'state')}});
  assert.deepEqual(f.output(run(raw)),{});assert.deepEqual((await f.calls())[0].input.tool_input,{path:'a.js',old_str:'a',new_str:'b'});
  for(const input of ['not a patch','*** Begin Patch\nmissing end','prefix\n*** Begin Patch\n*** End Patch\n']) assert.deepEqual(f.output(run({...raw,tool_input:input})),{});
  assert.equal((await f.calls()).length,1);
});

test('VS Code resume starts a new user-root segment and captures only its pinned completed reply',async t=>{
  const f=await fixture(t,'vscode');const first=events(f.cwd,'vscode');const resumed=events(f.cwd,'vscode','resumed',200).slice(1);resumed[0].parentId=null;
  await f.put([...first,resumed[0]]);
  f.output(f.run('user-prompt-submit',f.payload('user-prompt-submit',{prompt:'Explain this',timestamp:iso(221)})));
  await f.put([...first,...resumed]);f.output(f.run('stop',f.payload('stop',{timestamp:iso(300)})));
  const calls=await f.calls();assert.equal(calls.length,2);assert.equal(calls[1].input.generation_id,calls[0].input.generation_id);assert.equal(calls[1].input.stop_status,'completed');assert.equal(calls[1].input.last_assistant_message,'Question resumed?');
});

for(const variant of ['null assistant root','missing link','foreign session header','later unpinned user root','changed pinned user hash','changed transcript path','late completion'])test(`VS Code resumed segment rejects ${variant}`,async t=>{
  const f=await fixture(t,'vscode');const first=events(f.cwd,'vscode');const resumed=events(f.cwd,'vscode','resumed',200).slice(1);resumed[0].parentId=null;
  await f.put([...first,resumed[0]]);
  f.output(f.run('user-prompt-submit',f.payload('user-prompt-submit',{prompt:'Explain this',timestamp:iso(221)})));
  let all=[...first,...resumed];let stop=f.payload('stop',{timestamp:iso(300)});
  if(variant==='null assistant root')resumed[1].parentId=null;
  if(variant==='missing link')resumed[2].parentId='absent';
  if(variant==='foreign session header')all.splice(first.length,0,{...first[0],id:'foreign-header',data:{...first[0].data,sessionId:'another-chat'}});
  if(variant==='later unpinned user root')all.push({type:'user.message',id:'later-user',parentId:null,timestamp:iso(270),data:{content:'Explain this',attachments:[]}});
  if(variant==='changed pinned user hash')resumed[0].data.content='Changed learner words';
  if(variant==='late completion')resumed.at(-1).timestamp=iso(301);
  if(variant==='changed transcript path'){stop.transcript_path=join(f.dir,'replacement/chat-a.jsonl');await mkdir(dirname(stop.transcript_path));await writeFile(stop.transcript_path,all.map(JSON.stringify).join('\n'));}
  await f.put(all);f.output(f.run('stop',stop));
  const calls=await f.calls();assert.equal(calls.length,2);assert.ok(calls[1].input.generation_id);assert.notEqual(calls[1].input.stop_status,'completed');assert.equal(calls[1].input.last_assistant_message,undefined);
});
const lockCases={
  'never evicts a live owner, however old its lock directory is':{pid:()=>process.pid,acquired:()=>Date.now(),evicted:false},
  'recovers from a dead-owner lock left by a killed callback':{pid:()=>spawnSync(process.execPath,['-e','0']).pid,acquired:()=>Date.now(),evicted:true},
  'recovers when a stale owner PID was reused by a live process':{pid:()=>process.pid,acquired:()=>Date.now()-3600000,evicted:true},
  'recovers from a lock whose owner claims a future lease':{pid:()=>process.pid,acquired:()=>Date.now()+3600000,evicted:true},
  'recovers from an ownerless lock left by a killed callback':{evicted:true},
};
for(const [label,owner] of Object.entries(lockCases))test(`receipt lock ${label}`,async t=>{
  const f=await fixture(t,'cli');await f.put(events(f.cwd).slice(0,2));
  f.output(f.run('user-prompt-submit',f.payload('user-prompt-submit',{prompt:'Explain this'})));
  const state=join(f.dir,'state');const [receipt]=(await readdir(state)).filter(name=>name.endsWith('.json'));const lock=join(state,`${receipt}.lock`);
  await mkdir(lock);
  if(owner.pid)await writeFile(join(lock,'owner.json'),JSON.stringify({pid:owner.pid(),token:'held',acquired:owner.acquired()}));
  const old=new Date(time-3600000);await utimes(lock,old,old);
  f.output(f.run('user-prompt-submit',f.payload('user-prompt-submit',{prompt:'Explain this',timestamp:time+20})));
  const calls=await f.calls();
  if(!owner.evicted){assert.equal(calls.length,1);assert.equal(JSON.parse(await readFile(join(lock,'owner.json'),'utf8')).token,'held');}
  else{assert.equal(calls.length,2);assert.ok(calls[1].input.generation_id);assert.deepEqual((await readdir(state)).filter(name=>name.includes('.lock')),[]);}
});
