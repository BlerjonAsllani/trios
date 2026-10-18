import { System } from './src/system.mjs';
import { ProgramDisk, Shell, STATUS } from './src/shell.mjs';
import { display, value } from './src/ternary.mjs';
import { REGISTERS, formatInstruction } from './src/isa.mjs';

const $ = id => document.getElementById(id);
let storage = null;
try { storage = window.localStorage; } catch { /* Memory-only disk remains usable. */ }
const disk = new ProgramDisk(storage);
let system, shell, running = false, selectedId = 'boot', editorFile = 'hello';
let memoryStart = 0, outputEntry = null, historyIndex = 0;
const commandHistory = [], drafts = new Map();
const terminal = $('terminal-log');

function scrollTerminal(wasAtBottom) {
  if (wasAtBottom) terminal.scrollTop = terminal.scrollHeight;
}

function append(text, kind = 'system') {
  const atBottom = terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 60;
  outputEntry = null;
  const node = document.createElement('div');
  node.className = `entry ${kind}`;
  node.textContent = text;
  terminal.append(node);
  while (terminal.childElementCount > 300) terminal.firstElementChild.remove();
  scrollTerminal(atBottom);
}

function output(event) {
  const atBottom = terminal.scrollHeight - terminal.scrollTop - terminal.clientHeight < 60;
  if (!outputEntry || outputEntry.pid !== event.pid || !outputEntry.node.isConnected) {
    const node = document.createElement('div');
    node.className = 'entry output';
    const tag = document.createElement('span');
    tag.className = 'pid-tag'; tag.textContent = `PID ${event.pid} / AUSGABE`;
    const text = document.createTextNode('');
    node.append(tag, text); terminal.append(node);
    outputEntry = { pid: event.pid, node, text };
  }
  outputEntry.text.appendData(event.text);
  // Bound a pathological output loop even when it emits into one DOM entry.
  if (outputEntry.text.length > 12_000) outputEntry.text.deleteData(0, outputEntry.text.length - 12_000);
  while (terminal.childElementCount > 300) terminal.firstElementChild.remove();
  scrollTerminal(atBottom);
}

function onEvent(event) {
  if (event.type === 'output') output(event);
  else {
    const overflow = event.type === 'finish' && system.get(event.pid)?.cpu.flags.overflow;
    append(`[${event.pid}] ${event.text}${overflow ? ' · Überlauf: Ergebnis modulo 729' : ''}`, event.type === 'fault' ? 'error' : 'system');
  }
}

function reboot() {
  running = false;
  system = new System({ onEvent });
  selectedId = 'boot';
  memoryStart = 0; $('memory-address').value = '0';
  shell = new Shell({ system, disk, onText: text => append(text, 'output'),
    onClear: () => { terminal.replaceChildren(); outputEntry = null; }, onReboot: reboot });
  terminal.replaceChildren(); outputEntry = null;
  append(system.bootOutput.trimEnd(), 'boot');
  append('Ternäre CPU bereit. Supervisor und Systemaufrufe geladen.');
  append('6 Trit pro Wort · −364 bis +364 · eigener Speicher pro Prozess\n');
  append('Willkommen. Starte mit run hello oder wähle ein Beispiel unten.\nMit help findest du alle Befehle.', 'output');
  if (disk.notice) append(disk.notice, 'error');
  render();
}

function spawnEditor(autoRun = true) {
  if (editorFile === 'kernel') throw new Error('Der Kernel ist bereits geladen. Öffne ein Benutzerprogramm.');
  const name = $('filename').value.trim() || 'unbenannt';
  const process = system.spawn(name, $('source').value);
  selectedId = process.id;
  memoryStart = 0; $('memory-address').value = '0';
  running = autoRun;
  render();
  return process;
}

function command(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  append(`trios ~ ❯ ${trimmed}`, 'command');
  commandHistory.push(trimmed);
  if (commandHistory.length > 100) commandHistory.shift();
  historyIndex = commandHistory.length;
  try {
    const result = shell.execute(trimmed);
    if (result.type === 'spawn') {
      selectedId = result.pid;
      memoryStart = 0; $('memory-address').value = '0';
      running = true;
    }
  } catch (error) { append(error.message, 'error'); }
  render();
}

function guard(action) {
  try { action(); } catch (error) { append(error.message, 'error'); render(); }
}

function fileOptions(selected = editorFile) {
  $('file-select').replaceChildren();
  const names = [...new Set([...disk.list(), ...drafts.keys(), selected, 'kernel'])];
  for (const name of names) {
    const option = document.createElement('option');
    option.value = name; option.textContent = `${name}.tri${name === 'kernel' ? ' · Supervisor' : ''}`;
    $('file-select').append(option);
  }
  $('file-select').value = selected;
}

function loadFile(name) {
  if (editorFile !== 'kernel') drafts.set(editorFile, { source: $('source').value, name: $('filename').value });
  editorFile = name;
  const draft = drafts.get(name);
  $('source').value = draft?.source ?? (name === 'kernel' || disk.list().includes(name)
    ? disk.read(name) : 'LI a, 8\nADD a, #5\nSYS 1\nSYS 0\n');
  $('filename').value = draft?.name ?? name;
  const readonly = name === 'kernel';
  $('source').readOnly = readonly;
  $('filename').disabled = readonly;
  $('save-file').disabled = readonly;
  $('run-source').disabled = readonly;
  $('editor-note').textContent = readonly ? 'Geladener Supervisor · nur lesen' : 'Assembler';
  fileOptions(name);
  lineNumbers();
}

function lineNumbers() {
  const count = $('source').value.split('\n').length;
  $('line-numbers').textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
  $('line-numbers').scrollTop = $('source').scrollTop;
}

function render() {
  const process = selectedId === 'boot' ? null : system.get(selectedId);
  const cpu = process?.cpu || system.bootCPU;
  if (selectedId !== 'boot' && !process) selectedId = 'boot';
  const active = system.processes.filter(p => p.status === 'ready').length;
  if (!active) running = false;
  $('system-status').textContent = running ? 'System läuft' : active ? 'Pausiert' : 'Bereit';
  $('system-summary').textContent = active ? `${active} Prozess${active === 1 ? '' : 'e'} aktiv · ${system.totalInstructions.toLocaleString('de-CH')} Schritte` : 'Supervisor geladen · bereit für Programme';
  $('state-dot').className = `state-dot${running ? ' running' : active ? ' paused' : ''}`;
  $('toggle-run').innerHTML = running ? '<span aria-hidden="true">Ⅱ</span> Pause' : '<span aria-hidden="true">▶</span> Start';
  $('cpu-mode').textContent = cpu.mode === 'kernel' ? 'KERNEL' : 'BENUTZER';
  $('cpu-mode').className = `badge${cpu.mode === 'user' ? ' user' : ''}`;
  $('pc-value').textContent = cpu.pc;
  $('sign-value').textContent = cpu.flags.sign === 1 ? '+1' : cpu.flags.sign === -1 ? '−1' : '0';
  $('overflow-value').textContent = cpu.flags.overflow ? 'Ja · modulo 729' : 'Nein';
  $('overflow-value').className = cpu.flags.overflow ? 'overflow' : '';
  const last = cpu.last;
  $('last-instruction').textContent = last ? `${last.address}: ${formatInstruction(last)}` : 'Noch kein Befehl';

  $('registers').replaceChildren();
  for (const [index, trits] of cpu.registers.entries()) {
    const row = document.createElement('div'); row.className = 'register';
    const label = document.createElement('span'); label.className = 'register-label'; label.textContent = REGISTERS[index];
    const digits = document.createElement('span'); digits.className = 'trit-word';
    digits.setAttribute('aria-label', `Register ${REGISTERS[index]}: ${display(trits)}, Wert ${value(trits)}`);
    for (const d of [...trits].reverse()) {
      const cell = document.createElement('span');
      cell.className = `trit ${d === -1 ? 'negative' : d === 1 ? 'positive' : 'zero'}`;
      cell.textContent = d === -1 ? '−' : d === 1 ? '+' : '0';
      digits.append(cell);
    }
    const number = document.createElement('span'); number.className = 'register-value'; number.textContent = value(trits);
    row.append(label, digits, number); $('registers').append(row);
  }

  const signature = system.processes.map(p => `${p.id}:${p.status}`).join('|');
  if ($('process-select').dataset.signature !== signature) {
    $('process-select').replaceChildren(new Option('Supervisor · Boot', 'boot'));
    for (const p of system.processes) $('process-select').append(new Option(`PID ${p.id} · ${p.name} · ${STATUS[p.status]}`, String(p.id)));
    $('process-select').dataset.signature = signature;
  }
  $('process-select').value = String(selectedId);
  $('instruction-count').textContent = `${system.totalInstructions.toLocaleString('de-CH')} Instruktionen ausgeführt`;
  $('process-count').textContent = `${active} aktiv`;

  $('memory-grid').replaceChildren();
  for (let address = memoryStart; address < memoryStart + 12; address++) {
    const cell = document.createElement('div');
    cell.className = `memory-cell${address === cpu.pc ? ' current' : ''}`;
    const heading = document.createElement('div');
    const addr = document.createElement('span'); addr.textContent = address;
    const number = document.createElement('b'); const w = cpu.read(address); number.textContent = value(w);
    heading.append(addr, number);
    const trits = document.createElement('code'); trits.textContent = display(w);
    cell.title = `Adresse ${address} · Wert ${value(w)}${address < 0 ? ' · Supervisor' : ''}`;
    cell.append(heading, trits); $('memory-grid').append(cell);
  }
  $('user-memory').className = memoryStart >= 0 ? 'active' : '';
  $('kernel-memory').className = memoryStart < 0 ? 'active' : '';

  $('process-list').replaceChildren();
  if (!system.processes.length) {
    const empty = document.createElement('p'); empty.className = 'empty-state'; empty.textContent = 'Noch kein Programm gestartet.';
    $('process-list').append(empty);
  }
  for (const p of [...system.processes].reverse()) {
    const row = document.createElement('button'); row.className = `process-row${p.id === selectedId ? ' selected' : ''}`;
    row.title = p.error || `${p.name} beobachten`; row.setAttribute('aria-label', `PID ${p.id} ${p.name} beobachten`);
    for (const [className, text] of [['process-pid', `P${String(p.id).padStart(2, '0')}`], ['process-name', p.name],
      [`process-status ${p.status}`, STATUS[p.status]], ['process-cycles', p.instructions]]) {
      const span = document.createElement('span'); span.className = className; span.textContent = text; row.append(span);
    }
    row.addEventListener('click', () => { selectedId = p.id; render(); });
    $('process-list').append(row);
  }
}

$('command-form').addEventListener('submit', event => {
  event.preventDefault(); command($('command').value); $('command').value = ''; $('command').focus();
});
$('command').addEventListener('keydown', event => {
  if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  historyIndex = Math.max(0, Math.min(commandHistory.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
  $('command').value = commandHistory[historyIndex] || '';
});
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => command(button.dataset.command)));
$('clear-terminal').addEventListener('click', () => { terminal.replaceChildren(); outputEntry = null; });
$('reboot').addEventListener('click', reboot);
$('toggle-run').addEventListener('click', () => guard(() => {
  if (running) running = false;
  else if (system.hasWork()) running = true;
  else spawnEditor();
  render();
}));
$('step').addEventListener('click', () => guard(() => {
  running = false;
  let process = system.get(selectedId);
  if (!process || process.status !== 'ready') {
    process = system.processes.find(p => p.status === 'ready') || spawnEditor(false);
    selectedId = process.id;
  }
  system.step(process.id); render();
}));
$('process-select').addEventListener('change', () => { selectedId = $('process-select').value === 'boot' ? 'boot' : Number($('process-select').value); render(); });
$('file-select').addEventListener('change', () => loadFile($('file-select').value));
$('new-file').addEventListener('click', () => {
  let name = 'untitled', suffix = 2;
  const existing = new Set([...disk.list(), ...drafts.keys(), editorFile]);
  while (existing.has(name)) name = `untitled${suffix++}`;
  loadFile(name); $('filename').focus(); $('filename').select();
});
$('source').addEventListener('input', () => { lineNumbers(); $('editor-note').textContent = 'Ungespeicherter Entwurf'; });
$('source').addEventListener('scroll', () => { $('line-numbers').scrollTop = $('source').scrollTop; });
$('source').addEventListener('keydown', event => {
  if (event.key !== 'Tab' || $('source').readOnly) return;
  event.preventDefault();
  $('source').setRangeText('  ', $('source').selectionStart, $('source').selectionEnd, 'end');
  $('source').dispatchEvent(new Event('input'));
});
$('save-file').addEventListener('click', () => guard(() => {
  const result = disk.save($('filename').value.trim(), $('source').value);
  drafts.delete(editorFile);
  drafts.delete(result.name);
  editorFile = result.name;
  fileOptions(result.name);
  $('editor-note').textContent = result.persistent ? 'Im Browser gespeichert' : 'Für diese Sitzung gespeichert';
  append(`${result.name}.tri gespeichert${result.persistent ? ' · nach Neuladen wieder verfügbar.' : ' · nur für diese Sitzung; Browserspeicher nicht verfügbar.'}`);
}));
$('run-source').addEventListener('click', () => guard(() => spawnEditor()));
function setMemory(address) { memoryStart = address; $('memory-address').value = address; render(); }
$('user-memory').addEventListener('click', () => setMemory(0));
$('kernel-memory').addEventListener('click', () => setMemory(-256));
$('memory-address').addEventListener('change', () => {
  const number = Number($('memory-address').value);
  setMemory(Number.isFinite(number) ? Math.max(-364, Math.min(353, Math.trunc(number))) : 0);
});

// Keep every animation frame bounded; the guest can never monopolize the browser.
let lastFrame = 0;
function frame(time) {
  if (running && time - lastFrame >= 75) {
    system.tick(240);
    render(); lastFrame = time;
  }
  requestAnimationFrame(frame);
}
fileOptions();
// Initial load must not stash the empty textarea as a draft of hello.
editorFile = 'kernel';
loadFile('hello');
reboot();
requestAnimationFrame(frame);
