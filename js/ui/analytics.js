// Stats tab. Chart.js is loaded lazily the first time this tab is shown.
import { S, seasonById, nameOf } from '../store.js';
import { STATUS, seasonNights, viewPids, remapNight, careerSeasonStats } from '../logic/seasons.js';
import { seasonChipsHTML } from './history.js';
import { PLAYER_COLORS } from '../themes.js';
import { esc } from './dom.js';

let _charts = {};
let chartLib = null;
function loadChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartLib) chartLib = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload = () => resolve(window.Chart);
    s.onerror = e => { chartLib = null; reject(e); };
    document.head.appendChild(s);
  });
  return chartLib;
}

export function destroyCharts() {
  Object.values(_charts).forEach(c => { try { c.destroy(); } catch (e) {} });
  _charts = {};
}

// Selected scope: a season id or 'all' (UI only). Defaults to the current season.
let _scope = null, _seenCurrent = null; // resets to the current season when a new one starts
window._statsScope = id => { _scope = id; renderAnalytics(); };

const EXTRA_COLORS = ['#f08a5d', '#b83b5e', '#6a8caf', '#c9d6df', '#a3de83', '#f9ed69'];
const colorFor = i => PLAYER_COLORS()[i] || EXTRA_COLORS[(i - 4) % EXTRA_COLORS.length];
// One stable color per person (by when they joined the roster), used by every chart
const colorOfPid = pid => colorFor(Math.max(0, Object.keys(S.roster).indexOf(pid)));

export function renderAnalytics(){
  const el=document.getElementById('section-analytics');
  if(!_scope||(_scope!=='all'&&!seasonById(_scope))||_seenCurrent!==S.currentSeasonId){_scope=S.currentSeasonId;_seenCurrent=S.currentSeasonId;}
  const isAll=_scope==='all';
  const scopeSeason=isAll?null:seasonById(_scope);
  const scopeLabel=isAll?'All-Time':scopeSeason.name;
  const chips=seasonChipsHTML(_scope,'_statsScope',{allTime:true});

  // Translate every night into one index space of people (view index = pids position)
  const baseNights=isAll?(S.history||[]):seasonNights(S.history,_scope);
  const pids=viewPids(baseNights,isAll?S.playerIds:scopeSeason.playerIds);
  const hist=baseNights.map(n=>remapNight(n,pids));
  const K=pids.length;
  const zeros=()=>Array(K).fill(0);
  const pName=i=>players[i];

  const careerHTML=isAll?seasonCareerHTML():'';
  if(!hist.length){el.innerHTML=chips+careerHTML+`<div class="empty-state"><div class="big">📈</div><p>No nights in ${esc(scopeLabel)} yet.</p></div>`;return;}

  const nights=hist.length;
  const rawPlayers=pids.map(nameOf);
  const players=rawPlayers.map(p=>esc(p));
  const renderId=String(Date.now()+Math.random());

  // Aggregate data
  const allTimeTotal=zeros();
  const nightsPlayed=zeros();
  const nightWins=zeros();
  const bracketFinishes=Array.from({length:K},()=>[]); // per player, array of finish positions (0=1st)
  const gameWins={}; // { type: [w,w,w,w] }
  const gamePlayed={}; // { type: [p,p,p,p] }
  const gameCount={}; // { type: games played }
  const rrWins=zeros(),rrPlayed=zeros();
  const h2hW=Array.from({length:K},()=>zeros());
  // null for nights a player wasn't part of, so the line chart shows a gap
  const nightScores=hist.map(n=>n.scores.map((s,i)=>n.present.includes(i)?s:null));

  hist.forEach(n=>{
    (n.scores||[]).forEach((s,i)=>allTimeTotal[i]+=s);
    n.present.forEach(i=>nightsPlayed[i]++);
    if(n.placement.length)nightWins[n.placement[0]]++;
    // Bracket finishes
    (n.bracketPodium||[]).forEach((idx,r)=>bracketFinishes[idx].push(r));
    // Casual game wins
    (n.games||[]).forEach(g=>{
      if(!gameWins[g.type])gameWins[g.type]=zeros();
      if(!gamePlayed[g.type])gamePlayed[g.type]=zeros();
      gameCount[g.type]=(gameCount[g.type]||0)+1;
      (g.players||[]).forEach(i=>gamePlayed[g.type][i]++);
      if(g.winnerId!=null)gameWins[g.type][g.winnerId]++;
    });
    // RR
    (n.rrMatches||[]).forEach(m=>{
      if(m.winner!=null){
        rrWins[m.winner]++;
        rrPlayed[m.p1]++;rrPlayed[m.p2]++;
        // h2h
        const loser=m.p1===m.winner?m.p2:m.p1;
        h2hW[m.winner][loser]++;
      }
    });
  });

  let html=chips+careerHTML+`<div class="sec-label">${esc(scopeLabel)} Overview</div>`;

  // Summary stat boxes
  html+=`<div class="stat-grid">`;
  const ranked=[...Array(K).keys()].sort((a,b)=>allTimeTotal[b]-allTimeTotal[a]);
  const winsRanked=[...Array(K).keys()].sort((a,b)=>(nightWins[b]-nightWins[a])||(allTimeTotal[b]-allTimeTotal[a]));
  html+=`<div class="stat-box"><div class="sv">${pName(winsRanked[0])}</div><div class="sl">Most Night Wins (${nightWins[winsRanked[0]]})</div></div>`;
  html+=`<div class="stat-box"><div class="sv">${nights}</div><div class="sl">Nights Played</div></div>`;
  html+=`<div class="stat-box"><div class="sv">${pName(ranked[0])}</div><div class="sl">Points Leader</div></div>`;
  const bestRRRate=players.map((_,i)=>rrPlayed[i]>0?rrWins[i]/rrPlayed[i]:0);
  const rrKing=bestRRRate.indexOf(Math.max(...bestRRRate));
  html+=`<div class="stat-box"><div class="sv">${pName(rrKing)}</div><div class="sl">RR Leader</div></div>`;
  html+=`</div>`;

  // Points over time chart
  html+=`<div class="chart-wrap"><h4>Points Per Night</h4><canvas id="chartPts" height="200"></canvas></div>`;

  // Win rate by game type
  const gameTypes=Object.keys(gameWins);
  if(gameTypes.length){
    html+=`<div class="chart-wrap"><h4>Win Rate by Game Type</h4><canvas id="chartGames" height="220"></canvas></div>`;
  }

  // RR performance
  html+=`<div class="chart-wrap"><h4>Round Robin Win Rate</h4><canvas id="chartRR" height="180"></canvas></div>`;

  // Bracket avg finish
  html+=`<div class="chart-wrap"><h4>Avg Night Finish (bracket)</h4><canvas id="chartBracket" height="180"></canvas></div>`;

  // H2H table
  html+=`<div class="sec-label">Head to Head (RR)</div>`;
  html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;padding:10px;">`;
  html+=`<table class="h2h-table"><thead><tr><th>vs →</th>${players.map(p=>`<th>${p.split(' ')[0]}</th>`).join('')}</tr></thead><tbody>`;
  players.forEach((p,i)=>{
    html+=`<tr><td class="player-col">${p.split(' ')[0]}</td>`;
    players.forEach((_,j)=>{
      if(i===j){html+=`<td class="h2h-self">—</td>`;}
      else{
        const w=h2hW[i][j],l=h2hW[j][i];
        const cls=w>l?'h2h-win':w<l?'h2h-loss':'';
        html+=`<td class="${cls}">${w}-${l}</td>`;
      }
    });
    html+=`</tr>`;
  });
  html+=`</tbody></table></div>`;

  // All-time standings table
  html+=`<div class="sec-label" style="margin-top:14px;">${esc(scopeLabel)} Points</div>`;
  html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;"><table class="stbl">
    <thead><tr><th>#</th><th>Player</th><th class="ctr">Pts</th><th class="ctr">Avg</th><th class="ctr" title="Nights won (bracket wins)">Night W</th><th class="ctr">RR%</th></tr></thead><tbody>`;
  ranked.forEach((idx,r)=>{
    const bWins=nightWins[idx];
    const rrPct=rrPlayed[idx]>0?Math.round(rrWins[idx]/rrPlayed[idx]*100):0;
    html+=`<tr><td><strong style="${r===0?'color:var(--accent)':''}">${r+1}</strong></td><td class="bold">${pName(idx)}</td>
      <td class="ctr"><span class="pts-big">${allTimeTotal[idx]}</span></td>
      <td class="ctr" style="color:var(--muted)">${nightsPlayed[idx]>0?(allTimeTotal[idx]/nightsPlayed[idx]).toFixed(1):0}</td>
      <td class="ctr">${bWins}</td>
      <td class="ctr">${rrPct}%</td></tr>`;
  });
  html+=`</tbody></table></div>`;


  // ── Nemesis / Victim ──
  html+=`<div class="sec-label" style="margin-top:14px;">Nemesis & Victim (RR)</div>`;
  html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;padding:10px;">`;
  players.forEach((_,i)=>{
    let nemesis=-1,nemWins=0,victim=-1,victimWins=0;
    players.forEach((_,j)=>{
      if(i===j)return;
      if(h2hW[j][i]>nemWins){nemWins=h2hW[j][i];nemesis=j;}
      if(h2hW[i][j]>victimWins){victimWins=h2hW[i][j];victim=j;}
    });
    html+=`<div class="info-row"><span class="bold">${pName(i)}</span>
      <span style="font-size:0.78rem;color:var(--muted);">
        😈 ${nemesis>=0?pName(nemesis)+' ('+nemWins+'L)':'—'} &nbsp;·&nbsp;
        🎯 ${victim>=0?pName(victim)+' ('+victimWins+'W)':'—'}
      </span></div>`;
  });
  html+=`</div>`;

  // ── Best Night ──
  html+=`<div class="sec-label" style="margin-top:14px;">Best Night</div>`;
  html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;padding:10px;">`;
  players.forEach((_,i)=>{
    const scores=hist.map(n=>(n.scores||[])[i]||0);
    const best=Math.max(...scores);
    const bestNightIdx=scores.indexOf(best);
    const bestNightName=bestNightIdx>=0?(hist[bestNightIdx].name||hist[bestNightIdx].date||'Night '+(bestNightIdx+1)):'—';
    html+=`<div class="info-row"><span class="bold">${pName(i)}</span>
      <span style="font-size:0.78rem;color:var(--muted);">${best>0?best+' pts — '+esc(bestNightName):'No data'}</span></div>`;
  });
  html+=`</div>`;

  // ── Streak ──
  html+=`<div class="sec-label" style="margin-top:14px;">Current Win Streak (RR)</div>`;
  html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;padding:10px;">`;
  players.forEach((_,i)=>{
    // Walk all RR matches across all nights in order
    const allRR=[];
    hist.forEach(n=>(n.rrMatches||[]).forEach(m=>{if((m.p1===i||m.p2===i)&&m.winner!=null)allRR.push(m.winner===i);}));
    let streak=0;
    for(let k=allRR.length-1;k>=0;k--){if(allRR[k])streak++;else break;}
    let maxStreak=0,cur=0;
    allRR.forEach(w=>{cur=w?cur+1:0;if(cur>maxStreak)maxStreak=cur;});
    html+=`<div class="info-row"><span class="bold">${pName(i)}</span>
      <span style="font-size:0.78rem;color:var(--muted);">Current: ${streak} · Best: ${maxStreak}</span></div>`;
  });
  html+=`</div>`;

  // ── Game type popularity ──
  html+=`<div class="sec-label" style="margin-top:14px;">Game Type Popularity</div>`;
  html+=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden;padding:10px;">`;
  const totalPlayed=Object.entries(gameCount).map(([t,total])=>({t,total})).sort((a,b)=>b.total-a.total);
  const maxPlayed=totalPlayed[0]?.total||1;
  totalPlayed.forEach(({t,total})=>{
    const pct=Math.round(total/maxPlayed*100);
    html+=`<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:3px;"><span class="bold">${t}</span><span style="color:var(--muted);">${Math.round(total)} games</span></div>
      <div style="background:var(--surface2);border-radius:4px;height:6px;"><div style="background:var(--accent);height:6px;border-radius:4px;width:${pct}%;transition:width 0.4s;"></div></div>
    </div>`;
  });
  html+=`</div>`;

  el.innerHTML=html;
  el.dataset.renderId=renderId;
  destroyCharts();
  loadChart().then(Chart => {
    if (!el.isConnected || !el.classList.contains('active')) return;
    // A newer render may have replaced the canvases; only draw on the current ones
    if (el.dataset.renderId !== renderId) return;
    drawCharts(Chart, { pids, hist, players: rawPlayers, nightScores, gameTypes, gameWins, gamePlayed, rrWins, rrPlayed, bracketFinishes });
  }).catch(e => console.error('Chart.js failed to load', e));
}

function drawCharts(Chart, { pids, hist, players, nightScores, gameTypes, gameWins, gamePlayed, rrWins, rrPlayed, bracketFinishes }) {
  destroyCharts();
  drawSeasonChart(Chart);
  const colorFor = i => colorOfPid(pids[i]);
  const nightLabels=hist.map(n=>n.name||n.date||'Night');

  // Points over time
  const ctxPts=document.getElementById('chartPts');
  if(ctxPts){
    _charts.pts=new Chart(ctxPts,{
      type:'line',
      data:{
        labels:nightLabels,
        datasets:players.map((p,i)=>({
          label:p,
          data:nightScores.map(s=>s[i]||0),
          borderColor:colorFor(i),
          backgroundColor:colorFor(i)+'33',
          tension:0.3,spanGaps:true,pointRadius:5,pointHoverRadius:7,borderWidth:2,fill:false
        }))
      },
      options:{responsive:true,plugins:{legend:{labels:{color:'#888',font:{size:11}}}},scales:{x:{ticks:{color:'#888'}},y:{ticks:{color:'#888'},beginAtZero:true}}}
    });
  }

  // Win rate by game type
  if(gameTypes.length){
    const ctxG=document.getElementById('chartGames');
    if(ctxG){
      _charts.games=new Chart(ctxG,{
        type:'bar',
        data:{
          labels:gameTypes,
          datasets:players.map((p,i)=>({
            label:p,
            data:gameTypes.map(t=>gamePlayed[t][i]>0?Math.round(gameWins[t][i]/gamePlayed[t][i]*100):0),
            backgroundColor:colorFor(i)+'bb',
            borderColor:colorFor(i),borderWidth:1
          }))
        },
        options:{responsive:true,plugins:{legend:{labels:{color:'#888',font:{size:11}}}},scales:{x:{ticks:{color:'#888'}},y:{ticks:{color:'#888',callback:v=>v+'%'},max:100,beginAtZero:true}}}
      });
    }
  }

  // RR win rate
  const ctxRR=document.getElementById('chartRR');
  if(ctxRR){
    _charts.rr=new Chart(ctxRR,{
      type:'bar',
      data:{
        labels:players,
        datasets:[{
          label:'RR Win %',
          data:players.map((_,i)=>rrPlayed[i]>0?Math.round(rrWins[i]/rrPlayed[i]*100):0),
          backgroundColor:players.map((_,i)=>colorFor(i)),borderWidth:1
        }]
      },
      options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#888'}},y:{ticks:{color:'#888',callback:v=>v+'%'},max:100,beginAtZero:true}}}
    });
  }

  // Bracket avg finish (lower = better)
  const ctxB=document.getElementById('chartBracket');
  if(ctxB){
    _charts.bracket=new Chart(ctxB,{
      type:'bar',
      data:{
        labels:players,
        datasets:[{
          label:'Avg Finish (1=best)',
          data:players.map((_,i)=>bracketFinishes[i].length>0?(bracketFinishes[i].reduce((a,b)=>a+b,0)/bracketFinishes[i].length+1).toFixed(1):0),
          backgroundColor:players.map((_,i)=>colorFor(i)),borderWidth:1
        }]
      },
      options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#888'}},y:{ticks:{color:'#888'},min:1,max:4,beginAtZero:false}}}
    });
  }
}

// ── Seasons (career) — shown in the All-time view ────────────────────────────
function seasonCareerHTML() {
  const career = careerSeasonStats(S.seasons, S.history);
  const rows = Object.values(career).filter(p => p.nights > 0);
  if (!rows.length) return '';
  rows.sort((a, b) => (b.regularTitles + b.playoffTitles) - (a.regularTitles + a.playoffTitles) || (a.avgSeasonFinish ?? 9) - (b.avgSeasonFinish ?? 9) || (b.placementPerNight ?? 0) - (a.placementPerNight ?? 0));
  const f1 = v => v == null ? '—' : v.toFixed(1);
  const finished = S.seasons.filter(x => x.status !== STATUS.REGULAR).length;
  let html = `<div class="sec-label">Seasons</div>
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow-x:auto;"><table class="stbl">
    <thead><tr><th>Player</th><th class="ctr" title="Seasons played">Szn</th><th class="ctr" title="Regular-season titles">👑</th><th class="ctr" title="Playoff titles">🏆</th><th class="ctr" title="Won both in the same season">2x</th><th class="ctr" title="Average final regular-season standing">Avg fin</th><th class="ctr" title="Average nightly finish">Night</th><th class="ctr" title="Placement points per night">Pts/N</th></tr></thead><tbody>
    ${rows.map(p => `<tr><td class="bold">${esc(nameOf(p.pid))}</td><td class="ctr">${p.seasonsPlayed}</td><td class="ctr">${p.regularTitles}</td><td class="ctr">${p.playoffTitles}</td><td class="ctr">${p.doubles}</td>
      <td class="ctr">${f1(p.avgSeasonFinish)}</td><td class="ctr">${f1(p.avgNightFinish)}</td><td class="ctr">${f1(p.placementPerNight)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="note" style="margin:6px 2px 12px;">Avg fin counts finished regular seasons only (${finished} so far).</div>`;
  const best = rows.filter(p => p.bestSeason);
  if (best.length) {
    html += `<div class="card">${best.map(p => `<div class="info-row"><span class="bold">${esc(nameOf(p.pid))}</span><span class="note">Best: #${p.bestSeason.rank} (S${p.bestSeason.season}) · Worst: #${p.worstSeason.rank} (S${p.worstSeason.season})</span></div>`).join('')}</div>`;
  }
  const playoff = rows.filter(p => p.playoffFinishes.length);
  if (playoff.length) {
    const fmt = v => v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1);
    html += `<div class="sec-label">Playoff vs Seed</div><div class="card">${playoff.map(p => `<div class="info-row"><span class="bold">${esc(nameOf(p.pid))}</span><span class="note">${p.playoffFinishes.map(f => `S${f.season}: seed #${f.seed} → ${f.finish}${['st', 'nd', 'rd', 'th'][f.finish - 1]}`).join(' · ')} &nbsp;(${fmt(p.avgPlayoffVsSeed)})</span></div>`).join('')}
      <div class="note" style="margin-top:6px;">+ means finished better than seeded.</div></div>`;
  }
  if (finished >= 2) html += `<div class="chart-wrap"><h4>Season Finish</h4><canvas id="chartSeasons" height="180"></canvas></div>`;
  return html;
}

function drawSeasonChart(Chart) {
  const ctx = document.getElementById('chartSeasons');
  if (!ctx) return;
  const seasons = S.seasons.filter(x => x.status !== STATUS.REGULAR);
  const pids = [...new Set(seasons.flatMap(x => x.standings.map(r => r.pid)))];
  _charts.seasons = new Chart(ctx, {
    type: 'line',
    data: {
      labels: seasons.map(x => x.name),
      datasets: pids.map((pid, i) => ({
        label: nameOf(pid),
        data: seasons.map(x => { const r = x.standings.find(r => r.pid === pid); return r ? r.rank : null; }),
        borderColor: colorOfPid(pid), backgroundColor: colorOfPid(pid) + '33', tension: 0.2, spanGaps: true, pointRadius: 5, borderWidth: 2, fill: false,
      })),
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#888', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#888' } }, y: { reverse: true, min: 1, max: 4, ticks: { color: '#888', stepSize: 1 } } } },
  });
}
