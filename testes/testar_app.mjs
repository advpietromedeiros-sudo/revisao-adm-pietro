// Teste de comportamento da Trilha de Revisão no Chrome/Edge headless (CDP), com conteúdo de exemplo fixo.
// Uso: node testes/testar_app.mjs [--real]   (--real: usa o conteudo.js de verdade e só confere carga e cada etapa)
//      node testes/testar_app.mjs --autoteste (planta defeitos e exige que o teste os acuse)
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(RAIZ, '.scratch', 'teste'); mkdirSync(TMP, { recursive: true });
const args = process.argv.slice(2), REAL = args.includes('--real'), AUTO = args.includes('--autoteste');
const original = readFileSync(join(RAIZ, 'index.html'), 'utf8');
const TAG = '<script src="conteudo.js"></script>';
if (!original.includes(TAG)) { console.log('FALHA: index.html sem a tag do conteudo.js'); process.exit(1); }

const q = {
  ce: (g) => ({ tipo: 'ce', enunciado: `Afirmação de exemplo com gabarito ${g}.`, gabarito: g, comentario: 'Comentário C/E.', base: 'CF, art. 37' }),
  me: { tipo: 'me', enunciado: 'Pergunta de exemplo de múltipla escolha?', alternativas: ['a1', 'a2', 'a3', 'a4', 'a5'], correta: 2, comentario: 'Comentário ME.', base: 'Tema 940' },
  la: { tipo: 'lacuna', enunciado: 'A responsabilidade do Estado é ___ na ação.', opcoes: ['objetiva', 'subjetiva', 'integral', 'nenhuma'], correta: 0, comentario: 'Comentário lacuna.', base: 'CF' },
  as: { tipo: 'associar', enunciado: 'Associe os temas.', pares: [['Tema 940', 'dupla garantia'], ['Tema 362', 'foragido'], ['Tema 592', 'detento']], comentario: 'Comentário associar.', base: 'STF' },
  ca: { tipo: 'caso', enunciado: 'Caso de exemplo.', pergunta: 'Quem responde?', resposta: 'O Estado responde objetivamente.', checklist: ['ponto 1', 'ponto 2'], base: 'CF' },
};
const etapa = (n) => ({ trilha: 'RC', n, titulo: `Etapa de exemplo ${n}`, objetivo: 'Objetivo de exemplo.', relampago: ['r1', 'r2', 'r3', 'r4'], questoes: [q.ce('C'), q.ce('E'), q.la, q.me, q.as, q.ca] });
const EXEMPLO = { RC: { nome: 'Trilha Exemplo', descricao: 'Descrição.', etapas: [etapa(1), etapa(2)] }, SP: { nome: 'Outra Trilha', descricao: 'D.', etapas: [etapa(1)] } };

const pagina = (nome, sabotar) => {
  let h = original.replace('<head>', `<head><base href="${pathToFileURL(RAIZ).href}/">`);
  if (!REAL) h = h.replace(TAG, `<script>window.TRILHAS=${JSON.stringify(EXEMPLO)};</script>`);
  if (sabotar) { const h2 = sabotar(h); if (h2 === h) throw new Error('não plantou: ' + nome); h = h2; }
  const arq = join(TMP, nome); writeFileSync(arq, h); return arq;
};
const SABOTAGENS = [
  ['etapa 2 sempre liberada', s => s.replace('const liberada=(k,i)=>S.livre||i===0||feita(k,etapas(k)[i-1].n);', 'const liberada=()=>true;')],
  ['acerto de C/E contado errado', s => s.replace("const ok=b.dataset.v===q.gabarito;", "const ok=b.dataset.v!==q.gabarito;")],
  ['erro não vai ao caderno', s => s.replace("if(!ok)x.erros.push(id);salvar()}\n $('fb')", "salvar()}\n $('fb')")],
];

const NAV = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!NAV) { console.log('PULADO: nem Chrome nem Edge'); process.exit(2); }
const perfil = join(tmpdir(), 'trilha-' + Date.now()), porta = 9600 + Math.floor(Math.random() * 300);
const nav = spawn(NAV, ['--headless=new', `--remote-debugging-port=${porta}`, '--window-size=1280,900', '--no-first-run', '--allow-file-access-from-files', `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
const espera = ms => new Promise(r => setTimeout(r, ms));
let alvo; for (let i = 0; i < 60 && !alvo; i++) { await espera(250); try { alvo = (await (await fetch(`http://127.0.0.1:${porta}/json`)).json()).find(t => t.type === 'page'); } catch { } }
if (!alvo) { console.log('FALHA: navegador não respondeu'); nav.kill(); process.exit(1); }
const ws = new WebSocket(alvo.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0, erros = []; const pend = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') erros.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || '')) erros.push('log: ' + m.params.entry.text); });
const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const av = async e => { const r = await cdp('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.exceptionDetails ? { erro: r.result.exceptionDetails.exception?.description } : r.result?.result?.value; };
const abre = async arq => { await cdp('Page.navigate', { url: pathToFileURL(arq).href }); await espera(700); };
const res = []; let prefixo = '';
const confere = (n, ok, d = '') => { res.push(!!ok); console.log(`${ok ? 'OK   ' : 'FALHA'} ${prefixo}${n}${!ok && d ? ' · ' + d : ''}`); };
const clica = sel => av(`(function(){const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'sem '+${JSON.stringify(sel)};e.click();return 'ok'})()`);

async function suiteExemplo(arq) {
  erros = []; await abre(arq); await av("localStorage.clear()"); await abre(arq);
  const t1 = await av("({n:document.querySelectorAll('.trilha').length,txt:document.querySelector('.trilha')?.textContent})");
  confere('T1 · início com 2 trilhas e contagem de etapas/questões', t1.n === 2 && /2 etapas · 12 questões/.test(t1.txt), JSON.stringify(t1));
  await clica('.trilha');
  const t2 = await av("({b:[...document.querySelectorAll('.etapa-btn')].map(b=>b.disabled),des:document.querySelector('.extra').disabled})");
  confere('T2 · etapa 1 aberta, etapa 2 com cadeado, desafio final bloqueado', t2.b[0] === false && t2.b[1] === true && t2.des === true, JSON.stringify(t2));
  await clica('.etapa-btn'); await clica('#comecar');
  // q1 C/E (gabarito C): erra de propósito
  await clica('.op[data-v="E"]');
  const t3 = await av("({fb:document.querySelector('.fb')?.textContent,cad:JSON.parse(localStorage.getItem('trilha-adm:v1')).t.RC.erros})");
  confere('T3 · C/E: errar mostra gabarito, comentário e base, e manda ao caderno', /Errou\. Gabarito: CERTO/.test(t3.fb) && /Comentário C\/E/.test(t3.fb) && /CF, art\. 37/.test(t3.fb) && t3.cad.includes('1.0'), JSON.stringify(t3));
  await clica('#prox');
  // q2 C/E (gabarito E) pelo teclado
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'e', code: 'KeyE', text: 'e' }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'e', code: 'KeyE' }); await espera(100);
  const t4 = await av("document.querySelector('.fb')?.textContent||''");
  confere('T4 · atalho E responde e acerta', /Acertou/.test(t4), t4.slice(0, 80));
  await clica('#prox');
  await clica('.op[data-i="0"]');
  const t5 = await av("({lac:document.getElementById('lac').textContent,fb:document.querySelector('.fb').textContent})");
  confere('T5 · lacuna: a escolha preenche o espaço e acerta', t5.lac === 'objetiva' && /Acertou/.test(t5.fb), JSON.stringify(t5));
  await clica('#prox'); await clica('.op[data-i="2"]');
  const t6 = await av("document.querySelector('.fb').textContent");
  confere('T6 · múltipla escolha: acerto com letra e texto da resposta', /Acertou! Resposta: C\) a3/.test(t6), t6.slice(0, 80));
  await clica('#prox');
  await av(`(function(){const T=window.TRILHAS.RC.etapas[0].questoes[4];T.pares.forEach((p,j)=>{const s=document.getElementById('sel'+j);s.value=[...s.options].find(o=>o.textContent===p[1]).value});document.getElementById('conferir').click()})()`);
  const t7 = await av("({fb:document.querySelector('.fb').textContent,certas:document.querySelectorAll('.par.certa').length})");
  confere('T7 · associar: os 3 pares certos são reconhecidos', t7.certas === 3 && /Tudo certo/.test(t7.fb), JSON.stringify(t7));
  await clica('#prox'); await clica('#verModelo');
  const t8 = await av("({m:document.querySelector('.fb').textContent,ck:document.querySelectorAll('.check input').length})");
  await av("document.getElementById('ck0').click()"); await clica('.auto .sim');
  const t8b = await av("document.querySelector('.fb').textContent");
  confere('T8 · caso: resposta-modelo, checklist e autoavaliação', /Resposta-modelo/.test(t8.m) && t8.ck === 2 && /Marcado como acerto/.test(t8b) && /1 de 2 pontos/.test(t8b), JSON.stringify({ t8, t8b: t8b.slice(-80) }));
  await clica('#prox');
  const t9 = await av("({h:document.querySelector('h1').textContent,p:document.querySelector('.card p').textContent})");
  confere('T9 · resultado: 5 de 6 = 83% e etapa 2 liberada', /83% de acerto/.test(t9.h) && /etapa 2 está liberada/.test(t9.p), JSON.stringify(t9));
  await abre(arq); await clica('.trilha');
  const t10 = await av("({b:[...document.querySelectorAll('.etapa-btn')].map(b=>b.disabled),cad:document.querySelectorAll('.extra')[1].textContent})");
  confere('T10 · recarregar mantém o progresso: etapa 2 aberta e 1 erro no caderno', t10.b[1] === false && /\(1\)/.test(t10.cad), JSON.stringify(t10));
  await clica('.extra:nth-child(2)'); await clica('.op[data-v="C"]');
  const t11 = await av("JSON.parse(localStorage.getItem('trilha-adm:v1')).t.RC.erros.length");
  confere('T11 · caderno de erros: acertar tira a questão do caderno', t11 === 0, String(t11));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 760, deviceScaleFactor: 2, mobile: true });
  await abre(arq); await clica('.trilha'); await clica('.etapa-btn'); await clica('#comecar');
  const t12 = await av("({w:document.documentElement.scrollWidth,vw:innerWidth,bt:document.querySelector('.op').getBoundingClientRect().height})");
  await cdp('Emulation.clearDeviceMetricsOverride');
  confere('T12 · celular 360 px: sem rolagem lateral e botões com 48 px ou mais', t12.w <= t12.vw + 1 && t12.bt >= 48, JSON.stringify(t12));
  confere('T13 · nenhum erro de JavaScript', erros.length === 0, erros.slice(0, 3).join(' | '));
}

async function suiteReal(arq) {
  erros = []; await abre(arq); await av("localStorage.clear()"); await abre(arq);
  const r = await av(`(function(){const T=window.TRILHAS;if(!T)return {sem:true};const out={};for(const k in T){out[k]=T[k].etapas.length}return out})()`);
  confere('R1 · conteudo.js real carrega as duas trilhas', r && r.RC >= 9 && r.SP >= 8, JSON.stringify(r));
  await av("(()=>{const s=JSON.parse(localStorage.getItem('trilha-adm:v1')||'{}');s.livre=true;localStorage.setItem('trilha-adm:v1',JSON.stringify(s))})()");
  let falhas = [];
  for (const k of ['RC', 'SP']) {
    const n = await av(`window.TRILHAS.${k}.etapas.length`);
    for (let i = 0; i < n; i++) {
      await abre(arq); await av(`ir('etapa','${k}',${i})`); await clica('#comecar');
      const tot = await av(`window.TRILHAS.${k}.etapas[${i}].questoes.length`);
      for (let j = 0; j < tot; j++) {
        const tipo = await av('sessao.qs[sessao.pos].q.tipo');
        if (tipo === 'ce' || tipo === 'me' || tipo === 'lacuna') await clica('.op');
        else if (tipo === 'associar') await clica('#conferir');
        else { await clica('#verModelo'); await clica('.auto .nao'); }
        const ok = await av("!!document.querySelector('.fb') && !document.getElementById('navq').hidden");
        if (!ok) falhas.push(`${k}${i + 1}.q${j + 1}`);
        await clica('#prox');
      }
      const fimOk = await av("/de acerto/.test(document.querySelector('h1')?.textContent||'')");
      if (!fimOk) falhas.push(`${k}${i + 1}:sem resultado`);
    }
  }
  confere('R2 · todas as questões reais respondem e mostram o comentário; toda etapa chega ao resultado', falhas.length === 0, falhas.slice(0, 8).join(', '));
  confere('R3 · nenhum erro de JavaScript no conteúdo real', erros.length === 0, erros.slice(0, 3).join(' | '));
}

await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Log.enable');
const fim = c => { try { ws.close(); } catch { } nav.kill(); setTimeout(() => { try { rmSync(perfil, { recursive: true, force: true }); } catch { } process.exit(c); }, 400); };
if (AUTO) {
  let todos = true;
  for (const [nome, f] of SABOTAGENS) { const ini = res.length; prefixo = `[sabotagem: ${nome}] `; await suiteExemplo(pagina('_sabotado.html', f));
    const acusou = res.slice(ini).some(x => !x); console.log(acusou ? `AUTOTESTE: "${nome}" ACUSADO` : `AUTOTESTE: "${nome}" PASSOU CALADO`); if (!acusou) todos = false; }
  console.log(todos ? 'AUTOTESTE OK' : 'AUTOTESTE FALHOU'); fim(todos ? 0 : 1);
} else {
  if (REAL) await suiteReal(pagina('_real.html')); else await suiteExemplo(pagina('_exemplo.html'));
  const ok = res.every(Boolean); console.log(ok ? `TUDO OK (${res.length})` : `REPROVADO (${res.filter(x => !x).length} de ${res.length})`); fim(ok ? 0 : 1);
}
