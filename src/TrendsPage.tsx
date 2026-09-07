import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import './trends.css';
import { chartScale } from './chart-scale';
import { Search, X } from 'lucide-react';

type Point = { date: string; value: number };
type Series = { label: string; points: Point[] };
type TrendItem = { id: string; title: string; category: string; rank: number | null; value: number | null; valueLabel: string; url: string; imageUrl?: string; publishedAt?: string; angle: string };
type Platform = { id: 'google' | 'naver' | 'youtube'; name: string; color: string; status: 'available' | 'partial' | 'unavailable'; metricLabel: string; description: string; period: string; sourceUrl: string; sourceLabel: string; checkedAt: string; notes: string[]; items: TrendItem[]; series: Series[] };
type Trends = { checkedAt: string; region: string; summary: string; platforms: Platform[] };

const labels: Record<string, string> = { google: 'Google Trends', naver: '네이버 데이터랩', youtube: 'YouTube 차트' };
const statusText: Record<string, string> = { available: '확인 완료', partial: '일부 확인', unavailable: '확인 불가' };

function formatDate(value?: string) { if (!value) return ''; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' }); }
function Chart({ platform }: { platform: Platform }) {
  const all = platform.series.flatMap(s => s.points.map(p => p.value));
  if (!platform.series.length || !all.length) { const numeric = platform.items.filter(i => i.value != null); if (!numeric.length) return <div className="trend-empty">그래프로 표시할 수 있는 수치 데이터가 없습니다.<a href={platform.sourceUrl} target="_blank" rel="noreferrer">공식 자료 열기 ↗</a></div>; const max = Math.max(...numeric.map(i => i.value as number), 1); return <div className="item-bars" aria-label={`${platform.name} 항목 수치`}>
    {numeric.slice(0, 8).map(i => <div className="item-bar" key={i.id}><span title={i.title}>{i.title}</span><b><i style={{ width: `${((i.value as number) / max) * 100}%` }} /></b><em>{i.valueLabel || i.value}</em></div>)}
  </div>; }
  const rank = platform.metricLabel.includes('순위');
  const scale = chartScale(platform.series.flatMap(s => s.points), rank);
  const {min,max} = scale, width = 620, height = 270, pad = 36;
  const x = (date: string) => pad + scale.x(date) * (width - pad * 2);
  const y = (value: number) => pad + scale.y(value) * (height - pad * 2);
  const colors = [platform.color, '#527bcc', '#b46b35'];
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${platform.name} 추이 그래프`}>
    <title>{platform.name} {platform.metricLabel} 추이</title>
    {[0, .5, 1].map(t => <g key={t}><line x1={pad} x2={width - pad} y1={pad + t * (height - pad * 2)} y2={pad + t * (height - pad * 2)} className="chart-grid" /><text x="3" y={pad + t * (height - pad * 2) + 3} className="chart-axis">{Math.round(rank ? min + t * (max - min) : max - t * (max - min))}</text></g>)}
    {platform.series.map((s, si) => { const path = s.points.map((p, i) => `${i===0 || Date.parse(p.date)-Date.parse(s.points[i-1].date)>86400000?'M':'L'}${x(p.date)},${y(p.value)}`).join(' '); return <g key={s.label}><path d={path} fill="none" stroke={colors[si % colors.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />{s.points.map((p, i) => <circle key={`${s.label}-${p.date}`} cx={x(p.date)} cy={y(p.value)} r="4" fill="white" stroke={colors[si % colors.length]} strokeWidth="2"><title>{`${s.label} · ${p.date}: ${p.value}`}</title></circle>)}</g>; })}
    <text x={pad} y={height - 5} className="chart-axis">{formatDate(new Date(scale.start).toISOString())}</text><text x={width - pad} y={height - 5} textAnchor="end" className="chart-axis">{formatDate(new Date(scale.end).toISOString())}</text>
  </svg><div className="chart-legend">{platform.series.map((s, i) => <span key={s.label}><i style={{ background: colors[i % colors.length] }} />{s.label}</span>)}</div><details className="chart-data"><summary>날짜별 수치표 보기</summary><div className="trend-table-wrap"><table className="trend-table"><caption className="sr-only">{platform.name} 그래프 원자료</caption><thead><tr><th>주제</th><th>날짜</th><th>순위</th></tr></thead><tbody>{platform.series.flatMap(s => s.points.map(p => <tr key={`${s.label}-${p.date}`}><td>{s.label}</td><td>{p.date}</td><td>{p.value}</td></tr>))}</tbody></table></div></details></div>;
}

export default function TrendsPage() {
  const [data, setData] = useState<Trends | null>(null); const [error, setError] = useState(''); const [tab, setTab] = useState<'all' | Platform['id']>('all'); const [query, setQuery] = useState('');
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}data/trends.json`, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('트렌드 자료를 불러오지 못했습니다.'); return r.json(); }).then(setData).catch(e => setError(e.message)); }, []);
  const platforms = useMemo(() => (data?.platforms || []).filter(p => tab === 'all' || p.id === tab).map(p => ({ ...p, items: p.items.filter(i => `${i.title} ${i.category} ${i.angle}`.toLowerCase().includes(query.toLowerCase())) })), [data, tab, query]);
  if (error) return <section className="trends-page is-trends"><div className="trends-error"><h1>트렌드를 불러오지 못했습니다</h1><p>{error}</p></div></section>;
  if (!data) return <section className="trends-page is-trends"><div className="trends-loading">트렌드 자료를 준비하고 있습니다…</div></section>;
  const lead = (p: Platform) => p.items.find(i => i.rank === 1) || p.items[0];
  return <section className="trends-page is-trends" aria-labelledby="trends-title">
    <div className="trends-hero"><div><p className="trend-eyebrow">SIGNAL DESK · {data.region}</p><h1 id="trends-title">사람들이 지금 찾는 것</h1><p className="trend-summary">{data.summary}</p></div><div className="checked"><span>자료 확인 · KST</span><strong>{new Date(data.checkedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' })}</strong><small>자료 기준일은 플랫폼별 카드에 표시됩니다</small></div></div>
    <div className="trend-highlights">{data.platforms.map(p => <div key={p.id} style={{ '--platform-color': p.color } as CSSProperties}><span>{p.name} · {p.id==='google'?'최근 등장':'확인 순위 1위'}</span><strong>{lead(p)?.title || '수치 미확인'}</strong><small>{lead(p)?.valueLabel || (p.items.length ? `${p.items.length}개 항목` : '공식 자료 확인 필요')}</small></div>)}</div>
    <div className="trend-controls"><div className="trend-tabs" role="group" aria-label="플랫폼 선택">{[['all', '전체'], ...Object.entries(labels)].map(([id, name]) => <button key={id} aria-pressed={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id as 'all' | Platform['id'])}>{name}</button>)}</div><div className="trend-search"><Search size={17} aria-hidden="true"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="키워드나 카테고리 검색" aria-label="키워드 검색" />{query&&<button type="button" aria-label="검색어 지우기" onClick={()=>setQuery('')}><X size={15}/></button>}</div></div>
    <div className={`platform-grid ${platforms.length===1?'single-platform':''}`}>{platforms.map(p => <article className="platform-card" key={p.id} style={{ '--platform-color': p.color } as CSSProperties}>
      <header className="platform-head"><div><span className="platform-dot" /><h2>{p.name}</h2><p>{p.description}</p></div><span className={`availability ${p.status}`}>{statusText[p.status]}</span></header>
      <div className="metric-line"><strong>{p.metricLabel}</strong><span>{p.period}</span></div><div className="platform-chart"><Chart platform={p} /><p className="chart-note">{p.series.length?'날짜별 확인값 · 빈 구간은 자료 없음':`목록 중 ${Math.min(p.items.length,8)}개 표시 · 전체 값은 아래 표`}</p></div>
      <div className="rank-head"><h3>주목할 항목 <span>{p.items.length}</span></h3><small>{p.items.some(i => i.rank != null) ? '순위는 낮을수록 상위' : '원문 표시 순서'}</small></div>
      {p.items.length ? <div className="trend-table-wrap"><table className="trend-table"><caption className="sr-only">{p.name} 주목할 항목</caption><thead><tr><th>{p.items.some(i=>i.rank!==null)?'순위':'—'}</th><th>주제</th><th>값</th></tr></thead><tbody>{p.items.map(i => <tr key={i.id}><td>{i.rank ?? '—'}</td><td>{i.imageUrl && <img className="trend-thumb" src={i.imageUrl} alt="" loading="lazy" />}<a href={i.url} target="_blank" rel="noreferrer">{i.title} ↗</a><small>{i.category}</small></td><td>{i.valueLabel || (i.value == null ? '수치 미확인' : i.value)}</td></tr>)}</tbody></table></div> : <div className="trend-empty">{query?'검색 조건에 맞는 항목이 없습니다.':'확인된 목록이 아직 없습니다.'}</div>}
      <section className="angles"><h3>콘텐츠로 이어보기 · 편집 제안</h3>{p.items.filter(i => i.angle).slice(0, 3).map(i => <p key={`angle-${i.id}`}><strong>{i.title}</strong> {i.angle}</p>)}</section><details className="notes"><summary>수집 메모 모두 보기</summary>{p.notes?.map(n => <p key={n}>{n}</p>)}</details><footer className="platform-foot"><span>확인 {formatDate(p.checkedAt)} KST</span><a href={p.sourceUrl} target="_blank" rel="noreferrer">{p.sourceLabel || '공식 출처'} ↗</a></footer>
    </article>)}</div>
    <div className="trend-method"><span className="method-mark">i</span><div><strong>읽는 법</strong><p>플랫폼마다 집계 방식과 단위가 달라 그래프는 서로 비교하지 않습니다. 값이 없는 항목은 임의로 0을 넣지 않고 ‘수치 미확인’으로 표시했습니다.</p></div></div>
  </section>;
}
