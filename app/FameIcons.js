// 명예의 전당 / 불명예의 전당 부문 아이콘. 실제 게임 에셋(valorant-api.com)을 public/fame에
// 받아 두고 쓴다. 무기 킬피드 실루엣 · 요원 스킬 아이콘은 흰 그림이라 마스크로 무대 테마색을
// 입히고, 레디언트 랭크 아이콘은 원래 금색 그대로(명예 무대와 같은 색). 게임 에셋에 맞는 그림이 없는
// 둘은 직접 그렸다: 스파이크는 실제 스파이크 모형(넓은 머리 · 빛나는 세로 기둥 · 양옆 다리)을 따라,
// MVP 받고 진 판은 두 조각으로 깨진 MVP 별.
// r = 가로/세로 비율(여백 잘라 낸 그림 기준), h = 높이(em, 기본 1.1).
// 옆으로 긴 총 · 칼은 높이를 줄여 제목 글자보다 커 보이지 않게 한다.
const ICONS = {
  kills: { mask: 'vandal', r: 3.24, h: .72 }, // 밴달
  acs: { img: 'radiant' }, // 레디언트 랭크
  hs: { mask: 'sheriff', r: 2.02, h: .85 }, // 셰리프 (원탭 권총)
  firstKills: { mask: 'tailwind', r: 1.22 }, // 제트 순풍 (진입)
  plants: { svg: 'spike' },
  assists: { mask: 'wingman', r: 1.08 }, // 게코 윙맨 (도우미)
  kd: { mask: 'knife', r: 5.18, h: .5 }, // 전술 나이프
  deaths: { mask: 'resurrection', r: 1.02 }, // 세이지 부활 (살려 줘야 하는 사람)
  firstDeaths: { mask: 'runitback', r: 1.18 }, // 피닉스 역습 (먼저 죽고 다시 살아나기)
  lowKills: { mask: 'classic', r: 1.32 }, // 기본 권총 클래식
  mvpLoss: { svg: 'star' },
  lowAcs: { mask: 'nullcmd', r: 1.02 } // 케이/오 NULL/cmd (아래로 꺾인 갈매기)
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

// 지그재그 금을 따라 두 조각으로 갈라져 양옆으로 기운 별.
const BrokenStar = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path transform="translate(-.9 .3) rotate(-7 12 17)" d="M12 3 11 7.5 13 10.5 11.2 13.5 12 16.5 6.42 20.19 8.2 13.74 2.96 9.56 9.65 9.26Z" />
    <path transform="translate(.9 .3) rotate(7 12 17)" d="M12 3 14.35 9.26 21.04 9.56 15.8 13.74 17.58 20.19 12 16.5 11.2 13.5 13 10.5 11 7.5Z" />
  </svg>
);
const SVGS = { spike: Spike, star: BrokenStar };

export default function FameIcon({ k }) {
  const ic = ICONS[k];
  if (!ic) return null;
  if (ic.svg) { const Svg = SVGS[ic.svg]; return <span className={`psIcon svg ${ic.svg}`} aria-hidden="true"><Svg /></span>; }
  if (ic.img) return <img className="psIcon rank" src={`/fame/${ic.img}.png`} alt="" aria-hidden="true" />;
  const url = `url(/fame/${ic.mask}.png)`;
  const h = ic.h || 1.1;
  return <span className="psIcon mask" aria-hidden="true" style={{ height: `${h}em`, width: `${h * ic.r}em`, WebkitMaskImage: url, maskImage: url }} />;
}
