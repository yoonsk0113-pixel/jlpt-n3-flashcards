# 작업 규칙

- 모든 웹/앱 제작, 코드 작성·수정·최적화·클린업·구조화 작업에는 별도 언급이 없어도 두 플러그인을 기본 적용한다.
  - ponytail (`ponytail:ponytail`, full): 요청을 완전히 해결하는 가장 작은 변경. 요청하지 않은 코드는 넣지 않는다.
  - impeccable (`impeccable:impeccable`): UI/프론트엔드 작업은 context 설정, craft floor, 렌더링 확인 절차를 따른다.
- 사용자와는 한국어로 소통한다.
- 빌드 단계·외부 의존성 없이 유지한다. 변경 후 `node tests/check.cjs`, `node tests/exam-check.cjs`, `node tests/exam-data-check.cjs`를 모두 통과시킨다.
