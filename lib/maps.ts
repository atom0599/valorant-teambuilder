import { MapInfo } from "./types";

// 패치마다 경쟁전 로테이션이 바뀝니다. defaultRotation 값은 방을 만들 때
// "경쟁전 로테이션" 프리셋의 기본 체크 상태로만 쓰이고, 방장이 밴픽 설정
// 화면에서 직접 켜고 끌 수 있습니다. 최신 로테이션에 맞게 이 배열을
// 수정해서 재배포하면 됩니다.
export const ALL_MAPS: MapInfo[] = [
  { id: "ascent", name: "어센트", defaultRotation: true },
  { id: "bind", name: "바인드", defaultRotation: false },
  { id: "haven", name: "헤이븐", defaultRotation: true },
  { id: "split", name: "스플릿", defaultRotation: true },
  { id: "icebox", name: "아이스박스", defaultRotation: true },
  { id: "lotus", name: "로터스", defaultRotation: true },
  { id: "sunset", name: "선셋", defaultRotation: true },
  { id: "pearl", name: "펄", defaultRotation: false },
  { id: "fracture", name: "프랙처", defaultRotation: false },
  { id: "breeze", name: "브리즈", defaultRotation: false },
  { id: "abyss", name: "어비스", defaultRotation: true },
];

export function mapById(id: string): MapInfo | undefined {
  return ALL_MAPS.find((m) => m.id === id);
}
