---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: []
---

# index.html — 앱 전체 (단일 페이지)

Mode: Operate. 사용자는 JLPT N3를 준비하는 한국어 사용자이고, 주로 아이폰 PWA로 짧게 여러 번 쓴다. 과제는 오늘의 복습 처리, 일차 학습, 일차 시험이다. 제약: 빌드·외부 의존성·웹폰트 없음, 기능과 DOM id·JS 클래스 이름 유지, 테스트 4종 통과.

사용자가 자율 진행을 지시해 결정 페이지 확인은 생략했다. concept-seed는 네트워크 차단으로 degraded(도전자 없음)로 돌았다.

## Direction contract

THESIS: 표제어는 언제나 한자 연습장의 칸(田字格) 안에 앉는다. 그 밖의 모든 것은 괘선으로만 나뉜 조용하고 조밀한 공책 지면이다. 크림 바탕 위에 둥근 흰 카드와 색색의 모드 타일을 띄우는 배치를 거부한다.

OWN-WORLD: 차가운 흰 종이 바탕, 방안지의 청록 괘선(구분선·칸·진행 막대 바탕), 청흑색 잉크 글자, 남색은 행동·선택·포커스, 주홍(朱)은 오답·모름·삭제·복습 대기, 솔잎 녹색은 정답·앎·정착. 모서리는 4px 이하, 그림자는 겹침 레이어에만. 표제어는 일본어 명조·교과서체, 나머지는 한국어·일본어 시스템 고딕, 숫자는 고정폭 숫자.

STORY: 홈에서 오늘 할 일 하나를 보고 시작한다. 단어를 칸에서 보고, 떠올리고, 정답을 펼쳐 사전 항목처럼 읽는다. 시험은 문제지처럼 풀고, 채점 결과가 복습 일정으로 이어짐을 안다.

FIRST VIEWPORT: 상단에 田 칸 마크와 「매일 한 장」 워드마크, 그 아래 「오늘의 학습」 제목과 날짜, 한 줄 통계(오늘 복습·학습 진행·복습 중·완료), 남색 주 버튼 하나, 번호가 붙은 추천 순서 3행(괘선 목록). 넓은 화면에서는 오른쪽 열에 일차별 정착과 과정 목록.

FORM: 한자 연습장(방안 공책) — 근거 후보 목록의 6번째. seed:a416ab5c04e0750f. 시그니처: 표제어 글자마다 점선 십자 칸. 답을 펼칠 때만 한 번 움직인다.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
