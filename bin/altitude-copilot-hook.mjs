#!/usr/bin/env node
// Transport only: host normalization and output. Lesson policy stays in core.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCli } from './altitude-cursor-hook.mjs';
import { identity, startReceipt, currentReceipt, clearReceipt, completedReply, object, nonempty } from './copilot-transcript.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const actions = {
  'session-start':['session-start','--print-context','--nudge','Run /next-lesson to continue (or /begin for your first session).'],
  'user-prompt-submit':['user-prompt-submit'],
  diff:['pre-tool-use','--gate','diff'],
  stop:['stop','--gate','retro'],
  'session-end':['session-end'],
};
// Exact native mutation tools only. Shell and MCP tool names do not imply a
// file edit and must retain their host's independent permission checks.
const mutations = {
  cli:new Set(['create','edit','apply_patch']),
  vscode:new Set(['create_file','replace_string_in_file','multi_replace_string_in_file','insert_edit_into_file','apply_patch','edit_notebook_file']),
};
// The CLI's PascalCase compatibility callbacks rename create/edit/apply_patch
// to Claude-style mutation names before sending stdin to the hook.
const compatibilityMutations = new Set(['Write','Edit']);
function resultFrom(child, session) {
  if (child.error || child.signal) throw new Error('Altitude CLI could not finish this hook.');
  const result = JSON.parse(child.stdout);
  if (!object(result) || result.version!==1 || ![0,2].includes(child.status) || result.exitCode!==child.status || result.action!==(child.status===2?'block':'allow') || !Array.isArray(result.context) || !result.context.every(x=>typeof x==='string') || (result.reason!==undefined && typeof result.reason!=='string') || (result.session!==undefined && (!object(result.session)||result.session.id!==session))) throw new Error('Altitude CLI returned an invalid hook result.');
  return result;
}
function context(result) {
  return [...(result.session ? ['Altitude current Copilot session metadata (JSON):\n'+JSON.stringify({session_id:result.session.id})+'\nUse this exact session_id for every Altitude --session argument in this conversation; it identifies the chat, not whether a lesson is bound.'] : []),...result.context].join('\n\n');
}
export async function main(host=process.argv[2],action=process.argv[3]) {
  let response={};
  try {
    if (!Object.hasOwn(actions,action)) throw new Error('Unknown Copilot hook action.');
    let text=''; process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {text+=chunk;if(text.length>1024*1024)throw new Error('Copilot hook input is too large.');}
    let raw=JSON.parse(text);
    const compatibility=host==='auto';
    if(compatibility) {
      if(!object(raw) || typeof raw.hook_event_name!=='string')throw new Error('Missing compatibility hook identity.');
      const expected={'session-start':'SessionStart','user-prompt-submit':'UserPromptSubmit',diff:'PreToolUse',stop:'Stop','session-end':'SessionEnd'};
      if(raw.hook_event_name!==expected[action])throw new Error('Unexpected native hook event.');
      host=typeof raw.transcript_path==='string' && !raw.transcript_path.replaceAll('\\','/').endsWith('/events.jsonl')?'vscode':'cli';
      if(host==='cli')raw={...raw,sessionId:raw.session_id,transcriptPath:raw.transcript_path,stopReason:raw.stop_reason,toolName:raw.tool_name,toolArgs:raw.tool_input};
    }
    const who=identity(raw,host);
    const input={session_id:who.session_id,cwd:who.cwd}; let receipt;
    if (action==='diff') {
      const tool=host==='cli'?raw.toolName:raw.tool_name;
      if (!(compatibility ? compatibilityMutations.has(tool)||mutations.cli.has(tool)||mutations.vscode.has(tool) : mutations[host].has(tool))) { process.stdout.write('{}\n');return; }
      input.tool_name=tool;
      const supplied=host==='cli'?raw.toolArgs:raw.tool_input;
      // Pascal compatibility renames apply_patch to Edit while retaining the
      // raw patch string. Ordinary Edit arguments are still objects or JSON.
      const patchAlias=compatibility && tool==='Edit' && typeof supplied==='string' && /^\*\*\* Begin Patch\r?\n[\s\S]*\r?\n\*\*\* End Patch(?:\r?\n)?$/.test(supplied);
      const args=typeof supplied==='string'?(tool==='apply_patch'||patchAlias?{patch:supplied}:JSON.parse(supplied)):supplied;
      if (args!==undefined && !object(args)) throw new Error('Malformed native tool arguments.');
      if (args) input.tool_input=args;
    }
    if (action==='user-prompt-submit') {
      receipt=startReceipt(raw,who);input.generation_id=receipt.generation_id;
      input.prompt=raw.prompt;input.prompt_origin='unknown';
    }
    if (action==='stop') {
      receipt=currentReceipt(who);input.generation_id=receipt.generation_id;input.stop_status='aborted';
      // CLI persists its final response concurrently with agentStop. Retry for
      // at most 800ms; no incomplete result enters legacy question capture.
      let diagnostic;
      for (let attempt=0;attempt<9;attempt++) {
        try { input.last_assistant_message=completedReply(raw,who,receipt);input.stop_status='completed';diagnostic=undefined;break; }
        catch(error) {diagnostic=error;}
        if(attempt<8)await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(diagnostic)process.stderr.write('Altitude Copilot response evidence skipped: '+diagnostic.message+'\n');
    }
    if(action==='session-end' && typeof raw.reason==='string')input.reason=raw.reason;
    const command=resolveCli();const [lifecycle,...extra]=actions[action];
    const child=spawnSync(command.file,[...command.args,'hook',lifecycle,'--agent','copilot','--mapping',join(root,'hooks/copilot-field-map.json'),'--output','json','--delivery','prompt-context','--stop-policy','defer-to-prompt',...extra],{shell:false,input:JSON.stringify(input),encoding:'utf8',timeout:25000,maxBuffer:1024*1024,windowsHide:true});
    const result=resultFrom(child,who.session_id);
    if(child.stderr)process.stderr.write(child.stderr);
    if(action==='stop')clearReceipt(who,receipt);
    if(result.action==='block' && action==='diff') {
      const reason=result.reason||'Altitude requested a workshop check before continuing.';
      response=compatibility?{permissionDecision:'deny',permissionDecisionReason:reason,hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:reason}}:host==='cli'?{permissionDecision:'deny',permissionDecisionReason:reason}:{hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:reason}};
    } else if(action==='session-start'||action==='user-prompt-submit') {
      const additionalContext=context(result);
      if(additionalContext)response=compatibility?{additionalContext,hookSpecificOutput:{hookEventName:action==='session-start'?'SessionStart':'UserPromptSubmit',additionalContext}}:host==='cli'?{additionalContext}:{hookSpecificOutput:{hookEventName:action==='session-start'?'SessionStart':'UserPromptSubmit',additionalContext}};
    }
    // No synthetic continuation and no explicit permission allow on open paths.
  } catch(error) {process.stderr.write('Altitude Copilot hook skipped: '+(error instanceof Error?error.message:'unexpected failure')+'\n');}
  process.stdout.write(JSON.stringify(response)+'\n');process.exitCode=0;
}
try {if(process.argv[1]&&realpathSync(process.argv[1])===realpathSync(fileURLToPath(import.meta.url)))await main();}catch(error){process.stderr.write('Altitude Copilot hook bootstrap unavailable.\n');process.stdout.write('{}\n');process.exitCode=0;}
