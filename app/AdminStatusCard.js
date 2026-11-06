'use client';
import { useEffect, useState } from 'react';

// 관리자 전용 카드 (통계 탭): HenrikDev 상태, 하루 한 벌 백업 되돌리기, 관리자 활동 기록.
const STATE = {
  ok: ['정상', '#C8F24C'],
  rate_limited: ['요청 한도 초과 (잠시 뒤 풀림)', '#E5C04C'],
  auth: ['API 키 오류 — HENRIKDEV_API_KEY 확인', '#E1424F'],
  error: ['응답 오류', '#E1424F'],
  no_key: ['API 키 없음 — HENRIKDEV_API_KEY 미설정', '#E1424F'],
  unknown: ['아직 조회 기록 없음 (서버 재시작 후)', '#8B949E']
};
const KEY_LABEL = {
  'roster:all': '인원 명단',
  'records:all': '전적',
  'records:savedKeys': '저장된 경기 목록',
  'records:excluded': '순위 제외 선수',
  'seasonstats:all': '시즌 기록',
  'seasonstats:tiers': '현재 티어',
  'clips:all': '클립',
  'clips:names': '클립 닉네임',
  'mappool:rotation': '맵풀'
};

const LOG_SHOW = 60;
const LOG_COLOR = {
  '로그인 실패': '#E5C04C', '로그인 잠김': '#E1424F', '선수 전적 삭제': '#E1424F', '경기 삭제': '#E1424F',
  '클립 삭제': '#E1424F', '클립 댓글 삭제': '#E1424F', '백업 되돌리기': '#E5C04C', '방 초기화': '#E5C04C'
};

const ago = (t) => {
  if (!t) return '—';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
  return `${Math.round(s / 86400)}일 전`;
};
const dayLabel = (d) => (d.startsWith('restore-') ? `되돌리기 직전 (${new Date(Number(d.slice(8))).toLocaleString('ko-KR')})` : `${d} 시작 시점`);

export default function AdminStatusCard({ adminHeaders, onRestored }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState('roster:all');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/admin/status', { headers: adminHeaders() });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || res.status);
      setData(d); setErr('');
    } catch (e) { setErr(`상태를 불러오지 못했습니다 (${e.message})`); }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  async function restore(key) {
    if (!window.confirm(`${KEY_LABEL[pick] || pick}을(를) 이 백업으로 되돌릴까요?\n지금 값도 따로 백업해 두니 다시 되돌릴 수 있습니다.`)) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/admin/status', { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminHeaders() }, body: JSON.stringify({ restore: key }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || res.status);
      setMsg('되돌렸습니다.');
      onRestored?.();
      load();
    } catch (e) { setMsg(`실패: ${e.message}`); }
    setBusy(false);
  }

  const h = data?.henrik;
  const [label, color] = STATE[h?.state] || STATE.unknown;
  const list = (data?.backups || []).filter((b) => b.of === pick);
  const kinds = [...new Set((data?.backups || []).map((b) => b.of))];

  return (
    <div style={{ background: '#14181D', border: '1px solid #2C333C', borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>서버 상태 · 백업 · 활동 기록 <span style={{ fontSize: 11, color: '#6B737C', fontWeight: 500 }}>(관리자만 보임)</span></div>
      {err && <div style={{ fontSize: 12, color: '#E5C04C' }}>{err}</div>}
      {data && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Tile label="라이엇 전적 API (HenrikDev)">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />{label}
              </span>
            </Tile>
            <Tile label="마지막 정상 응답">{ago(h.okAt)}</Tile>
            <Tile label="마지막 오류">{h.lastErrorAt ? `${ago(h.lastErrorAt)} · ${h.lastError}` : '—'}</Tile>
            <Tile label="한도 초과 횟수">{`${h.rateLimitCount}번 / 요청 ${h.total}번`}</Tile>
            <Tile label="서버 켜진 지">{ago(Date.now() - data.uptimeSec * 1000).replace(' 전', '')}</Tile>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: '#8B949E' }}>매일 그날 처음 바뀌기 직전의 값을 30일 동안 보관합니다. 잘못 지웠거나 덮어썼을 때 되돌리세요.</div>
            {data.backupError && <div style={{ fontSize: 12, color: '#E5C04C' }}>백업 목록 오류: {data.backupError}</div>}
            {!data.backups?.length && !data.backupError && <div style={{ fontSize: 12, color: '#6B737C' }}>아직 백업이 없습니다. 데이터가 처음 바뀔 때 만들어집니다.</div>}
            {!!kinds.length && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {kinds.map((k) => (
                  <button key={k} onClick={() => setPick(k)} style={{ background: pick === k ? 'rgba(200,242,76,.14)' : '#1B2027', color: pick === k ? '#C8F24C' : '#C8D0D8', border: `1px solid ${pick === k ? 'rgba(200,242,76,.4)' : '#333B45'}`, borderRadius: 999, padding: '5px 11px', fontSize: 11, cursor: 'pointer' }}>{KEY_LABEL[k] || k}</button>
                ))}
              </div>
            )}
            {list.slice(0, 12).map((b) => (
              <div key={b.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: '#1B2027', border: '1px solid #262C34', borderRadius: 10, padding: '7px 12px', fontSize: 12 }}>
                <span>{dayLabel(b.day)}</span>
                <button disabled={busy} onClick={() => restore(b.key)} style={{ background: 'transparent', color: '#E5C04C', border: '1px solid #E5C04C66', borderRadius: 8, padding: '3px 9px', fontSize: 11, cursor: busy ? 'default' : 'pointer' }}>되돌리기</button>
              </div>
            ))}
            {msg && <div style={{ fontSize: 12, color: msg.startsWith('실패') ? '#E1424F' : '#C8F24C' }}>{msg}</div>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>관리자 활동 기록 <span style={{ fontSize: 11, color: '#6B737C', fontWeight: 500 }}>최근 {LOG_SHOW}개 · 최대 300개 보관</span></div>
            {!data.log?.length && <div style={{ fontSize: 12, color: '#6B737C' }}>아직 기록이 없습니다.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
              {(data.log || []).slice(0, LOG_SHOW).map((e, i) => (
                <div key={`${e.at}-${i}`} style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 10, alignItems: 'baseline', fontSize: 12, padding: '5px 10px', background: '#1B2027', borderRadius: 8 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: 11, color: '#8B949E', whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ fontWeight: 700, whiteSpace: 'nowrap', color: LOG_COLOR[e.action] || '#E8EAEC' }}>{e.action}</span>
                  <span style={{ color: '#B8BEC6', minWidth: 0, overflowWrap: 'anywhere' }}>{e.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ label, children }) {
  return (
    <div style={{ minWidth: 150, flex: '1 1 150px', background: '#1B2027', border: '1px solid #262C34', borderRadius: 12, padding: '9px 12px' }}>
      <div style={{ fontSize: 10, color: '#8B949E', letterSpacing: '.04em' }}>{label}</div>
      <div style={{ fontSize: 12, marginTop: 4 }}>{children}</div>
    </div>
  );
}
