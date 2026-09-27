// Copilot wire transport only: correlate one host prompt with its completed reply.
// No lesson state, grading, question extraction or content lives in this module.
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const nonempty = value => typeof value === 'string' && value.trim().length > 0;
export function millis(value) {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Missing native hook timestamp.');
  return number;
}
export function canonical(path) {
  if (!nonempty(path) || !isAbsolute(path)) throw new Error('Missing absolute host path.');
  return realpathSync(path);
}
export function identity(raw, host) {
  if (!object(raw) || !['cli','vscode'].includes(host)) throw new Error('Unknown Copilot host.');
  const id = host === 'cli' ? raw.sessionId : raw.session_id;
  if (!nonempty(id) || /[/\\\0]/.test(id)) throw new Error('Missing exact Copilot session identity.');
  if ((raw.session_id !== undefined && raw.session_id !== id) || (raw.sessionId !== undefined && raw.sessionId !== id)) throw new Error('Conflicting Copilot identities.');
  const cwd = canonical(raw.cwd);
  if (!statSync(cwd).isDirectory()) throw new Error('Host workspace is not a directory.');
  return { session_id:id, cwd, host, timestamp:millis(raw.timestamp) };
}
// Native model.* records are ancillary telemetry, not the persisted chat chain.
// Their parents may be null or refer to IDs outside this transcript.
const modelTelemetry = event => event.type.startsWith('model.');
function transcript(path, who) {
  const actual = canonical(path);
  if (!statSync(actual).isFile() || statSync(actual).size > 32 * 1024 * 1024) throw new Error('Unsupported transcript size.');
  if (who.host === 'cli' ? basename(actual) !== 'events.jsonl' || basename(dirname(actual)) !== who.session_id : basename(actual) !== `${who.session_id}.jsonl`) throw new Error('Transcript path does not identify this chat.');
  const text = readFileSync(actual,'utf8');
  const events = text.trim().split('\n').map(line => JSON.parse(line));
  if (!events.length || events.length > 100000) throw new Error('Unsupported transcript.');
  const ids = new Set(); const canonicalIds = new Set();
  for (const e of events) {
    if (!object(e) || !object(e.data) || !nonempty(e.id) || ids.has(e.id) || !nonempty(e.type) || (e.parentId !== null && !nonempty(e.parentId))) throw new Error('Unknown transcript event schema.');
    // VS Code resumes a persisted chat by starting a new user.message
    // segment with parentId:null. Only that host/user boundary may be a
    // root: assistant/tool ancestry must still reach the exact pinned user.
    const localUserRoot = who.host === 'vscode' && e.type === 'user.message' && e.parentId === null;
    if (ids.size > 0 && (e.type === 'session.start' || (!modelTelemetry(e) && !localUserRoot && !canonicalIds.has(e.parentId)))) throw new Error('Transcript ancestry is disconnected or contains another session.');
    millis(e.timestamp); ids.add(e.id);
    if (!modelTelemetry(e)) canonicalIds.add(e.id);
  }
  const start = events[0];
  if (start.type !== 'session.start' || start.parentId !== null || start.data.sessionId !== who.session_id || start.data.version !== 1 || start.data.producer !== 'copilot-agent' || !nonempty(start.data.copilotVersion)) throw new Error('Unknown or mismatched Copilot transcript.');
  if (who.host === 'cli') {
    if (canonical(start.data.context?.cwd) !== who.cwd || start.data.vscodeVersion !== undefined) throw new Error('Transcript belongs to another workspace or host.');
  } else if (!nonempty(start.data.vscodeVersion)) throw new Error('Transcript is not from the editor.');
  return {path:actual,events};
}
function storage(who) {
  const root = process.env.ALTITUDE_COPILOT_STATE_DIR || join(homedir(),'.altitude','adapters','copilot','v1');
  if (!isAbsolute(root)) throw new Error('Copilot transport state directory must be absolute.');
  mkdirSync(root,{recursive:true,mode:0o700});
  return join(root,`${hash(JSON.stringify([who.host,who.session_id,who.cwd]))}.json`);
}
function read(path) { try { return JSON.parse(readFileSync(path,'utf8')); } catch { return undefined; } }
function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid,0); return true; } catch (error) { return error.code === 'EPERM'; }
}
function claim(lock, token) {
  const staged = `${lock}.${token}.tmp`;
  mkdirSync(staged,{mode:0o700});
  try {
    writeFileSync(join(staged,'owner.json'),JSON.stringify({pid:process.pid,token}),{mode:0o600,flag:'wx'});
    renameSync(staged,lock);
    return true;
  } catch (error) {
    if (['EEXIST','ENOTEMPTY','EPERM','EISDIR'].includes(error.code)) return false;
    throw error;
  } finally { rmSync(staged,{recursive:true,force:true}); }
}
function evictDead(lock) {
  const owner = read(join(lock,'owner.json'));
  if (owner && alive(owner.pid)) return;
  const tomb = `${lock}.${randomUUID()}.stale`;
  try { renameSync(lock,tomb); } catch { return; }
  if (read(join(tomb,'owner.json'))?.token === owner?.token) rmSync(tomb,{recursive:true,force:true});
  else try { renameSync(tomb,lock); } catch { rmSync(tomb,{recursive:true,force:true}); }
}
function locked(path, fn) {
  const lock = `${path}.lock`; const token = randomUUID();
  if (!claim(lock,token)) { evictDead(lock); if (!claim(lock,token)) throw new Error('Concurrent Copilot callback; evidence skipped.'); }
  try { return fn(); } finally { if (read(join(lock,'owner.json'))?.token === token) rmSync(lock,{recursive:true,force:true}); }
}
export function startReceipt(raw, who) {
  if (typeof raw.prompt !== 'string') throw new Error('Missing original learner prompt.');
  const receipt = {version:1,...who,generation_id:`copilot-${randomUUID()}`,prompt_hash:hash(raw.prompt)};
  if (who.host === 'vscode') {
    // Local writes user.message before firing this hook. Pin its unique native
    // event ID now, not a repeated turnId or a text-only match at Stop.
    const snap = transcript(raw.transcript_path,who);
    const userIndex = snap.events.findLastIndex(e=>e.type==='user.message');
    const user = snap.events[userIndex];
    if (!user || hash(user.data.content ?? '') !== receipt.prompt_hash || millis(user.timestamp) > who.timestamp || snap.events.slice(userIndex+1).some(e=>e.type.startsWith('assistant.'))) throw new Error('Editor prompt has no unambiguous native user boundary.');
    receipt.transcript_path = snap.path;
    receipt.user_event_id = user.id;
    receipt.user_event_hash = hash(JSON.stringify(user));
  }
  const path = storage(who);
  locked(path,()=>{
    const previous = read(path);
    if (previous && previous.timestamp >= receipt.timestamp) throw new Error('Duplicate or out-of-order prompt callback.');
    const temporary = `${path}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary,JSON.stringify(receipt),{mode:0o600,flag:'wx'});renameSync(temporary,path); }
    finally { rmSync(temporary,{force:true}); }
  });
  return receipt;
}
export function currentReceipt(who) {
  const receipt = read(storage(who));
  if (!receipt || receipt.version !== 1 || receipt.host !== who.host || receipt.session_id !== who.session_id || receipt.cwd !== who.cwd || !nonempty(receipt.generation_id) || !nonempty(receipt.prompt_hash) || !Number.isSafeInteger(receipt.timestamp) || receipt.timestamp > who.timestamp) throw new Error('No matching prompt receipt.');
  return receipt;
}
export function clearReceipt(who, receipt) {
  const path = storage(who);
  locked(path,()=>{ if (read(path)?.generation_id === receipt.generation_id) rmSync(path,{force:true}); });
}
export function completedReply(raw, who, receipt) {
  if (raw.stop_hook_active !== false || (who.host === 'cli' && raw.stopReason !== 'end_turn')) throw new Error('Host did not confirm an ordinary completed turn.');
  const snap = transcript(who.host === 'cli' ? raw.transcriptPath : raw.transcript_path,who);
  if (who.host === 'vscode' && snap.path !== receipt.transcript_path) throw new Error('Transcript path changed during the turn.');
  const users = snap.events.filter(e=>e.type === 'user.message');
  const matches = who.host === 'cli'
    ? users.filter(e=>millis(e.timestamp)>=receipt.timestamp && millis(e.timestamp)<=who.timestamp)
    : users.filter(e=>e.id===receipt.user_event_id && hash(JSON.stringify(e))===receipt.user_event_hash);
  if (matches.length !== 1 || matches[0] !== users.at(-1)) throw new Error('No unique current user boundary.');
  const user = matches[0];
  if (hash(user.data.content ?? '') !== receipt.prompt_hash || millis(user.timestamp)>who.timestamp) throw new Error('Current user boundary does not match the receipt.');
  if (who.host === 'cli' && (!nonempty(user.data.messageId) || users.filter(e=>e.data.messageId===user.data.messageId).length!==1)) throw new Error('Missing unique native user message identity.');
  const slice = snap.events.slice(snap.events.indexOf(user)+1);
  if (slice.some(e=>/error|abort|cancel|shutdown|resume/i.test(e.type))) throw new Error('Turn was interrupted or failed.');
  const last = slice.findLast(e=>e.type==='assistant.message');
  const end = slice.findLast(e=>e.type==='assistant.turn_end');
  const start = slice.findLast(e=>e.type==='assistant.turn_start');
  if (!last || !end || !start || slice.indexOf(end)<slice.indexOf(last) || slice.indexOf(start)>slice.indexOf(last) || !nonempty(last.data.content) || !Array.isArray(last.data.toolRequests) || last.data.toolRequests.length || !nonempty(last.data.messageId) || !nonempty(start.data.turnId) || start.data.turnId!==end.data.turnId) throw new Error('No completed final assistant response.');
  if (who.host === 'cli' && (last.data.originatingMessageId!==user.data.messageId || last.data.turnId!==end.data.turnId)) throw new Error('Assistant response belongs to another user message.');
  if (millis(end.timestamp)>who.timestamp || millis(last.timestamp)>millis(end.timestamp)) throw new Error('Completion occurred after this stop callback.');
  // Follow actual ancestry back to the pinned user. Matching a numeric turnId
  // is insufficient: the CLI restarts it at zero after resume.
  const byId = new Map(snap.events.filter(e=>!modelTelemetry(e)).map(e=>[e.id,e])); const visited = new Set();
  let cursor = end; let hasMessage=false; let hasStart=false;
  while (cursor && cursor !== user) {
    if (visited.has(cursor.id) || millis(cursor.timestamp)>who.timestamp) throw new Error('Invalid completion ancestry.');
    visited.add(cursor.id); hasMessage ||= cursor===last; hasStart ||= cursor===start;
    cursor = byId.get(cursor.parentId);
    if (cursor?.type==='user.message' && cursor!==user) throw new Error('Completion ancestry crosses another learner prompt.');
  }
  if (cursor!==user || !hasMessage || !hasStart) throw new Error('Completion ancestry is incomplete.');
  return last.data.content;
}
