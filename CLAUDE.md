# 작업 규칙

웹/앱 개발 작업(컴포넌트·페이지 작성, UI 수정, 리팩터링, JSON 데이터 처리, 배포 준비)이면 별도 요청이 없어도 아래 6가지를 모두 적용한다.

1. **ponytail** (`ponytail:ponytail`, full): 요청을 완전히 해결하는 가장 작은 변경. 요청하지 않은 코드는 넣지 않는다.
2. **impeccable** (`impeccable:impeccable`): UI 작업은 context 설정 → craft floor → 실제 렌더링 확인(390px·1280px) → `impeccable detect` 순서를 따른다. 반응형·접근성 점검도 여기서 한다.
3. **Git 워크플로** (`commit-commands`): 시맨틱 커밋 메시지(`feat:`, `fix:`, `docs:` 등), 기능 브랜치에서 작업 후 푸시, PR은 요청 시 생성.
4. **JSON·데이터 검증**: JSON 파일은 `node -e "JSON.parse(require('fs').readFileSync(file,'utf8'))"`로 문법을 확인하고, 학습·시험 데이터는 `tests/exam-data-check.cjs`로 검증한다.
5. **Next.js·React 모범 사례** (`vercel` 플러그인의 `next-best-practices`, `react-best-practices`): Next.js/React 코드를 다룰 때만 적용한다. 이 저장소는 빌드 없는 Vanilla HTML/JS다.
6. **Vercel 배포 전 점검** (`vercel` 플러그인): `main` 푸시가 곧 운영 배포이므로, 병합·푸시 전에 테스트 3개 통과와 브라우저 렌더링 확인을 마친다.

## 프로젝트 원칙

- 사용자와는 한국어로 소통한다.
- 빌드 단계·외부 의존성 없이 유지한다. 변경 후 `node tests/check.cjs`, `node tests/exam-check.cjs`, `node tests/exam-data-check.cjs`를 모두 통과시킨다.
