# Codex Media

고급 영상 업스케일링 및 최적화 처리 서비스

## 🎯 프로젝트 개요

Codex Media는 Discord 봇을 통해 업로드된 영상을 자동으로 분석하고, 지능형 업스케일링과 오디오 향상을 통해 고품질 영상으로 변환하는 백엔드 서비스입니다. RabbitMQ 기반의 비동기 처리와 실시간 로그 관리를 통해 안정적이고 확장 가능한 영상 처리 파이프라인을 제공합니다.

## 🚀 핵심 기능

### 🎬 지능형 영상 처리

- **자동 해상도 최적화**: 영상 길이와 원본 해상도를 분석하여 최적의 출력 해상도 자동 결정
- **적응형 비트레이트**: 영상 길이와 해상도에 따른 동적 비트레이트 조절로 파일 크기 최적화
- **H.264 고효율 인코딩**: `libx264` 코덱과 최적화된 preset으로 빠르고 고품질 인코딩

### 🔊 자동 오디오 향상 및 최적화

- **자동 볼륨 분석**: FFmpeg `volumedetect` 필터를 통한 실시간 오디오 레벨 분석
- **지능형 볼륨 부스트**: 평균 볼륨이 -20dB 이하일 때 자동으로 최대 15dB까지 부스트
- **노이즈 제거**: `afftdn` 필터를 통한 배경 노이즈 자동 제거
- **라우드니스 정규화**: EBU R128 표준 기반 `loudnorm` 필터 적용

### 📊 실시간 로깅

- **단계별 처리 추적**: 검증, 분석, 인코딩, 업로드 각 단계별 상세 로그
- **성능 메트릭**: 처리 시간, 파일 크기, 압축률 등 실시간 성능 지표
- **에러 핸들링**: 자동 실패 감지 및 복구, 상세한 에러 분석

### ⚡ 비동기 큐 시스템

- **RabbitMQ**: 메시지 기반 비동기 처리로 높은 처리량과 안정성 보장
- **Pub/Sub 패턴**: 처리 완료 시 Discord 봇으로 자동 결과 전송
- **큐 기반 처리**: RabbitMQ를 통한 순차적 영상 처리 및 대기열 관리

## 🎛️ 영상 처리 파이프라인

### 1. 🔍 사전 검증 단계

```typescript
// 파일 크기 및 형식 검증 (최대 500MB)
const stats = await fs.stat(inputPath);
if (stats.size > 500 * 1024 * 1024) {
  throw new Error('파일 크기 초과');
}
```

### 2. 📈 영상 분석 단계

- **메타데이터 추출**: 해상도, 길이, 코덱 정보 분석
- **오디오 레벨 분석**: 5분 이하 영상에 대해 실시간 볼륨 분석
- **최적화 전략 결정**: 분석 결과 기반 처리 파라미터 자동 설정

### 3. 🎯 해상도 최적화 알고리즘

```typescript
// 영상 길이별 최적 해상도 결정
if (duration > 600) {
  // 10분 이상: 1280x720 (압축 우선)
  maxWidth = 1280;
  maxHeight = 720;
} else if (duration > 300) {
  // 5-10분: 1600x900 (균형)
  maxWidth = 1600;
  maxHeight = 900;
} else {
  // 5분 이하: 1920x1080 (품질 우선)
  maxWidth = 1920;
  maxHeight = 1080;
}
```

### 4. 🔧 고급 인코딩 설정

- **CRF 기반 품질 제어**: Constant Rate Factor로 일정한 품질 보장
- **Fast Start 최적화**: 웹 스트리밍을 위한 `movflags +faststart` 설정
- **픽셀 포맷 표준화**: `yuv420p`로 호환성 최대화

## 💾 MongoDB 기반 로그 시스템

### 로그 레벨 및 단계

- **info**: 일반 처리 진행 상황
- **warn**: 주의가 필요한 상황
- **error**: 처리 실패 및 오류

### 주요 로그 단계

```typescript
const importantSteps = [
  'validation_failed', // 파일 검증 실패
  'processing_start', // 처리 시작
  'processing_complete', // 처리 완료
  'processing_error', // 처리 중 오류
  'encoding_error', // 인코딩 오류
  'status_update', // 상태 변경
];
```

## ☁️ Google Cloud Platform 통합

### Cloud Storage 자동 업로드

- **버킷 기반 저장**: 처리된 영상을 GCP Storage에 자동 업로드
- **Signed URL 생성**: 안전한 파일 접근을 위한 서명된 URL 자동 생성
- **자동 정리**: 로컬 임시 파일 자동 삭제로 디스크 공간 관리

### Cloud Build CI/CD

- **자동 배포**: `master` 브랜치 푸시 시 자동 Docker 이미지 빌드
- **Container Registry**: 빌드된 이미지 자동 푸시 및 버전 관리

## 🔧 기술 스택

### Backend Framework

- **NestJS**: 확장 가능한 Node.js 프레임워크

### 영상 처리

- **FFmpeg**: 멀티미디어 처리 라이브러리
- **fluent-ffmpeg**: Node.js FFmpeg 래퍼

### 데이터베이스 및 메시징

- **MongoDB + Mongoose**: NoSQL 데이터베이스 및 ODM
- **RabbitMQ**: 고성능 메시지 브로커

### 클라우드 인프라

- **Google Cloud Storage**: 확장 가능한 객체 스토리지
- **Google Cloud Build**: 완전 관리형 CI/CD 플랫폼
- **Docker**: 컨테이너화 및 배포

## 📊 성능 지표

### 처리 성능

- **평균 처리 시간**: 1분 영상 기준 30-60초 (하드웨어에 따라 변동)
- **지원 포맷**: MP4, AVI, MOV, MKV 등 주요 영상 포맷
- **최대 파일 크기**: 500MB
- **동시 처리**: RabbitMQ 큐를 통한 멀티 영상 병렬 처리

### 품질 향상

- **해상도 업스케일**: 최대 2배까지 안전한 업스케일링
- **오디오 품질**: -16 LUFS 표준 라우드니스 정규화
- **압축 효율**: 품질 대비 30-50% 파일 크기 감소

## 🔗 연관 프로젝트

- **[Discord Bot](https://github.com/Dokbawi/discord-bot)** - 사용자 인터페이스 Discord 봇
- **[Winter Cat Video API](https://github.com/Dokbawi/winter-cat-video)** - 중간 API 서버 및 인증
- **[Discord Helm](https://github.com/Dokbawi/discord-video-helm)** - Kubernetes 배포 관리
