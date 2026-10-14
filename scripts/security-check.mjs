import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
export function scanText(text) {
  const findings = [];
  const rules = [
    ['token Mercado Livre', /\b(?:APP_USR|APP_USR-TEST)-[A-Za-z0-9-]{12,}|\bTG-[A-Za-z0-9-]{20,}/],
    ['credencial conhecida', /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16}|sk_live_[A-Za-z0-9]{20,})/],
    ['chave privada', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['senha em URL', /(?:postgres(?:ql)?|mysql):\/\/[^\s:@/]+:[^\s@]{3,}@/],
    ['segredo público', /NEXT_PUBLIC_(?:MELI_(?:CLIENT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN)|TOKEN_ENCRYPTION_KEY)/],
    ['segredo literal', /(?:MELI_CLIENT_SECRET|MELI_ACCESS_TOKEN|MELI_REFRESH_TOKEN|TOKEN_ENCRYPTION_KEY|client_secret|access_token|refresh_token)\s*[=:]\s*['"]([^'"\r\n]{8,})['"]/i],
  ];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [rule, pattern] of rules) {
      const match = pattern.exec(line);
      if (!match) continue;
      if (rule === 'segredo literal' && /^(?:SEU_|YOUR_|PLACEHOLDER|mock-|test-|fixture-|fake-|unit-)/i.test(match[1])) continue;
      findings.push({ line: index + 1, rule });
    }
  });
  return findings;
}
export function runSecurityCheck(root = process.cwd()) {
  const problems = [];
  let files;
  const staged = new Map();
  let repositoryFound = false;
  try {
    execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
    repositoryFound = true;
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
    for (const file of tracked) if (/(^|\/)\.env(?:\.|$)/.test(file) && file !== '.env.example') problems.push(`${file}: arquivo de ambiente rastreado`);
    const candidates = tracked.filter(file => /\.(?:[cm]?[jt]sx?|json|md|ya?ml|sql|txt|example)$/.test(file) && !/[\r\n]/.test(file));
    if (candidates.length) {
      // Inspect the actual Git index too: a clean working tree does not imply a clean staged commit.
      const batch = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: candidates.map(file => `:${file}\n`).join(''), maxBuffer: 16 * 1024 * 1024 });
      let offset = 0;
      for (const file of candidates) {
        const end = batch.indexOf(10, offset);
        if (end < 0) throw new Error('Git index inválido');
        const header = batch.subarray(offset, end).toString(); offset = end + 1;
        const size = Number(header.split(' ').at(-1));
        if (!Number.isSafeInteger(size) || size < 0) continue;
        staged.set(file, batch.subarray(offset, offset + size).toString('utf8'));
        offset += size + 1;
      }
    }
    files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
  } catch {
    if (repositoryFound) problems.push('Não foi possível inspecionar o índice Git; verificação bloqueada.');
    const excluded = new Set(['node_modules', '.next', '.git', '.vercel', 'work', 'coverage']);
    const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      if (excluded.has(entry.name) || entry.name.startsWith('.env') && entry.name !== '.env.example') return [];
      const full = resolve(dir, entry.name);
      return entry.isDirectory() ? walk(full) : entry.isFile() ? [relative(root, full)] : [];
    });
    files = walk(root);
  }
  for (const file of new Set(files)) {
    if (!existsSync(resolve(root, file)) || !/\.(?:[cm]?[jt]sx?|json|md|ya?ml|sql|txt|example)$/.test(file)) continue;
    for (const finding of scanText(readFileSync(resolve(root, file), 'utf8'))) problems.push(`${file}:${finding.line}: ${finding.rule}`);
  }
  for (const [file, content] of staged) {
    for (const finding of scanText(content)) problems.push(`${file}:${finding.line}: ${finding.rule} no conteúdo staged`);
    if (file === '.env.example' && content.split(/\r?\n/).some(line => /^[A-Z_]+=.+/.test(line))) problems.push('.env.example: valor preenchido no conteúdo staged');
  }
  const example = resolve(root, '.env.example');
  if (existsSync(example) && readFileSync(example, 'utf8').split(/\r?\n/).some(line => /^[A-Z_]+=.+/.test(line))) problems.push('.env.example: deve conter somente valores vazios');
  // Search built client output for configured secrets, without printing the values.
  const secrets = ['MELI_CLIENT_SECRET', 'MELI_ACCESS_TOKEN', 'MELI_REFRESH_TOKEN', 'TOKEN_ENCRYPTION_KEY', 'DATABASE_URL'].map(key => process.env[key]).filter(value => value && value.length >= 8);
  const built = resolve(root, '.next/static');
  if (existsSync(built)) {
    const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(dir, entry.name)) : [resolve(dir, entry.name)]);
    for (const file of walk(built).filter(file => /\.(?:js|map|html)$/.test(file))) {
      const content = readFileSync(file, 'utf8');
      if (secrets.some(secret => content.includes(secret))) problems.push(`${relative(root, file)}: segredo no bundle público`);
    }
  }
  if (problems.length) { problems.forEach(problem => console.error(problem)); return 1; }
  console.log(`Security check aprovado: ${new Set(files).size} arquivos candidatos; ambientes, padrões de credenciais e bundle público verificados.`);
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = runSecurityCheck();
