// 명예의 전당 / 불명예의 전당 부문 아이콘. 실제 게임 에셋(valorant-api.com)을 public/fame에
// 받아 두고 쓴다. 무기 킬피드 실루엣 · 요원 스킬 아이콘은 흰 그림이라 마스크로 무대 테마색을
// 입히고, 랭크 아이콘(레디언트 · 아이언)은 원래 색 그대로. 스파이크는 게임 에셋에 단독 아이콘이
// 없어서 실제 스파이크 모형(넓은 머리 · 빛나는 세로 기둥 · 양옆 다리)을 따라 그렸다.
// r = 가로/세로 비율(여백 잘라 낸 그림 기준), h = 높이(em, 기본 1.3).
const ICONS = {
  kills: { mask: 'vandal', r: 3.24 }, // 밴달
  acs: { img: 'radiant' }, // 레디언트 랭크
  hs: { mask: 'sheriff', r: 2.02 }, // 셰리프 (원탭 권총)
  firstKills: { mask: 'tailwind', r: 1.22 }, // 제트 순풍 (진입)
  plants: { spike: true },
  assists: { mask: 'wingman', r: 1.08 }, // 게코 윙맨 (도우미)
  kd: { mask: 'knife', r: 5.18, h: .85 }, // 전술 나이프
  deaths: { mask: 'notdeadyet', r: 1.2 }, // 클로브 아직 안 죽었어
  firstDeaths: { mask: 'neuraltheft', r: 1.53 }, // 사이퍼 신경 절도 (먼저 쓰러진 몸)
  lowKills: { mask: 'classic', r: 1.32 }, // 기본 권총 클래식
  mvpLoss: { mask: 'empress', r: 1.01 }, // 레이나 여제
  lowAcs: { img: 'iron' } // 아이언 랭크
};

const Spike = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M10.6 2.8h2.8l.6 1.3h-4Z" />
    <path d="M10 4.1h4l5.2 3.5H4.8Z" />
    <path fillOpacity=".7" d="M4.8 7.6h14.4v1H4.8Z" />
    <path d="M4.8 8.6h14.4l-3.6 2.5H8.4Z" />
    <path fillOpacity=".55" d="M8.4 11.1h7.2v8.5l-1.2 1H9.6l-1.2-1Z" />
    <path fillOpacity=".8" d="M8.4 13.2H7l-.8.8v4.6h1.2v-4h1ZM15.6 13.2H17l.8.8v4.6h-1.2v-4h-1Z" />
    <path d="M5 18.4h3.2l.8 1v1.8H5ZM19 18.4h-3.2l-.8 1v1.8H19ZM10 20.6h4v1h-4Z" />
    <path className="glow" d="M12.2 11.9h1.3v7.5h-1.3Z" />
  </svg>
);

export default function FameIcon({ k }) {
  const ic = ICONS[k];
  if (!ic) return null;
  if (ic.spike) return <span className="psIcon spike" aria-hidden="true"><Spike /></span>;
  if (ic.img) return <img className="psIcon rank" src={`/fame/${ic.img}.png`} alt="" aria-hidden="true" />;
  const url = `url(/fame/${ic.mask}.png)`;
  return <span className="psIcon mask" aria-hidden="true" style={{ height: `${ic.h || 1.3}em`, width: `${(ic.h || 1.3) * ic.r}em`, WebkitMaskImage: url, maskImage: url }} />;
}
