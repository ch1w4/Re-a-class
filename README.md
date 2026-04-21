# Re:a Class

> 対面授業をリアルタイムで補助するマルチテナント Web アプリケーション

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38bdf8?logo=tailwindcss)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)
![License](https://img.shields.io/badge/license-MIT-green)

講義中に発言しにくい環境でも、生徒が匿名でリアクション・質問・チャットを送れます。  
授業終了後は AI が復習ノートを自動生成し、生徒がいつでも見返せます。  
複数の学校・教師・生徒をまとめて管理できるマルチテナント構成です。

---

## 機能一覧

### 教師側
- ルーム作成・QR コード発行（生徒は QR を読むだけで参加）
- 5 種類のリアクション（理解した / わからない / 質問あり / ゆっくり / 速く）をリアルタイム集計・グラフ表示
- 生徒からの個別チャット受信（送信前に AI が自動で敬語に変換）
- チャット受付のオン/オフ切り替え
- アンケート作成・リアルタイム集計・締め切り
- 授業メモ（板書内容等）の手動保存
- 授業音声の録音 → OpenAI Whisper（whisper-1）で日本語テキストに書き起こし（複数回録音を追記）
- AI 要約レポート生成（gpt-4o-mini）: 書き起こし・リアクション集計・アンケート結果をもとに Markdown で出力
- 要約レポートの `.md` ファイルダウンロード
- 授業終了（以降は生徒からの入力を全ブロック、4 日後に理解度チェックを自動スケジュール）

### 生徒側
- ルーム ID 入力 or QR コードスキャンで匿名参加・授業履歴の自動記録
- 5 種類のリアクション送信（匿名・何度でも）
- 先生だけに届く個別チャット（他の生徒には見えない）
- アンケート回答・リアルタイム集計結果の閲覧
- 教師が生成した AI 要約レポートの閲覧
- 授業終了後の匿名掲示板（感想・質問を投稿・閲覧）
- 授業終了 4 日後の「理解度チェック」通知（スコア 1〜4 + コメントで回答）

### 学校管理者（SCHOOL_ADMIN）
- 教師・生徒のユーザー登録（1 人 or 改行区切りの一括入力）
- 開始 ID 番号の指定（省略時は自動採番）
- ユーザー削除・パスワードリセット（パスワードをユーザー ID に戻す）
- 終了済み講義の掲示板を管理者モードで閲覧（投稿者の実名表示）

### サーバー管理者（SERVER_ADMIN）
- 学校の追加・削除（学校ごとにデータを完全分離）
- 学校管理者（SCHOOL_ADMIN）の作成

---

## 技術スタック

| 役割 | 技術 |
|---|---|
| フロントエンド | Next.js 14 (App Router) / React / TypeScript |
| スタイリング | Tailwind CSS |
| バックエンド | Next.js API Routes |
| データベース | PostgreSQL 16 |
| ORM | Prisma 5 |
| 認証 | セッション Cookie（httpOnly）+ scrypt パスワードハッシュ（salt:hash 形式） |
| リアルタイム更新 | HTTP ポーリング（授業画面: 2 秒間隔 / 通知: 10 秒間隔） |
| 音声書き起こし | OpenAI Whisper（whisper-1） |
| AI 機能 | OpenAI gpt-4o-mini（授業要約 / チャット敬語変換 / 理解度集計サマリー） |
| インフラ | Docker / Docker Compose |

---

## ロール構成

```
SERVER_ADMIN    ← サーバー全体の管理者（学校の追加・削除、学校管理者の作成）
  └─ SCHOOL_ADMIN  ← 学校ごとの管理者（ユーザー管理、掲示板閲覧）
       ├─ TEACHER   ← 授業を作成・進行する教師
       └─ STUDENT   ← 授業に参加する生徒
```

- **ユーザー ID**: `{学校 prefix}{8 桁連番}`（例: `A00000001`）
- **初期パスワード**: ユーザー ID と同一（学校管理者が発行後に本人がパスワード変更を推奨）
- **セッション**: httpOnly Cookie（`session_id`）。有効期限は 7 日間。

---

## システム構成

```
ブラウザ（教師・生徒・管理者）
       ↕ HTTP ポーリング（2 秒 / 10 秒）
┌────────────────────────────────────┐
│       Next.js 14 (App Router)      │
│  ┌──────────────┐  ┌─────────────┐ │
│  │   React UI   │  │  API Routes │ │
│  │  /teacher    │  │   /api/**   │ │
│  │  /student    │  └──────┬──────┘ │
│  │  /home       │         │        │
│  │  /board      │         │        │
│  │  /admin      │         │        │
│  │  /school-admin│        │        │
│  └──────────────┘         │        │
│    ↕ middleware           │        │
│   session_id Cookie       │        │
└───────────────────────────┼────────┘
                            ↕ Prisma ORM
              ┌───────────────────────┐
              │    PostgreSQL 16      │
              └───────────────────────┘
                            ↕
              ┌───────────────────────┐
              │     OpenAI API        │
              │  whisper-1（書き起こし）│
              │  gpt-4o-mini（AI機能） │
              └───────────────────────┘
```

---

## セットアップ

### 必要なもの
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- OpenAI API キー（[platform.openai.com](https://platform.openai.com)）

### 手順

**1. リポジトリをクローン**
```bash
git clone https://github.com/ch1w4/Re-a-class.git
cd Re-a-class
```

**2. 環境変数を設定**
```bash
cp .env.example .env
```

`.env` を開いて各キーを入力：
```env
DATABASE_URL="postgresql://reaclass:reaclass_pass@db:5432/reaclass"
OPENAI_API_KEY="sk-..."
CRON_SECRET="任意のランダム文字列"
```

**3. 起動**
```bash
docker compose up --build
```

起動時にデータベースのマイグレーションが自動実行されます。

**4. サーバー管理者を作成**

起動後、最初のサーバー管理者アカウントを作成します。
```bash
docker compose exec app npx ts-node scripts/create-server-admin.ts
```

---

## 使い方

### 1. 学校を登録する（サーバー管理者）
1. `/admin` にログイン
2. 学校名と prefix（例: `A`）を入力して学校を追加
3. 「管理者を追加」で学校管理者を作成（初期パスワード = 発行された ID）

### 2. 教師・生徒を登録する（学校管理者）
1. `/school-admin` にログイン
2. ロール（教師/生徒）と氏名を入力してユーザーを追加
3. 一括追加は「一括追加タブ」で 1 行 1 人の形式で入力

### 3. 授業を開始する（教師）
1. `/home` にログイン後「授業を開始」で授業名を入力
2. 表示された QR コードまたはルーム ID を生徒に共有

### 4. 授業に参加する（生徒）
1. `/home` でルーム ID を入力して参加
2. または QR コードをスキャン

### 5. 授業中
- 生徒はリアクションをいつでも何回でも送信（匿名で教師に届く）
- 生徒は教師だけに届く個別チャットを送信（送信前に AI が敬語に変換）
- 教師はチャット受付のオン/オフを切り替え可能
- 教師はアンケートをその場で作成・集計・締め切り
- 「録音開始」→「停止」で Whisper が自動書き起こし（複数回録音は追記）
- 「要約を生成する」で AI が Markdown 形式の復習ノートを作成

### 6. 授業終了後
- 教師が「授業終了」ボタンを押すと生徒からの入力を全ブロック
- 生徒は AI 要約と書き起こしを閲覧可能
- 生徒は匿名掲示板で感想・質問を投稿（他の生徒にも匿名で表示）
- 授業終了 4 日後に「理解度チェック」通知が届く（スコア + コメントで回答）
- 理解度チェック通知から 3 日後に集計が実行される

---

## 理解度チェックの仕組み

```
授業終了
  ↓（即時）
UnderstandingCheck を 4 日後の日時でスケジュール
  ↓（4 日後: cron/understanding-notify）
参加した全生徒へ通知を送信（UNDERSTANDING_CHECK）
tallyAt を 3 日後に設定
  ↓（3 日後: cron/understanding-tally）
回答を集計
  └── 回答者の 50% 超が score 3〜4（難しかった）の場合
      → gpt-4o-mini でコメントを集約
      → 担当教師へ結果通知を送信（UNDERSTANDING_RESULT）
```

**スコア定義:**
| スコア | 意味 |
|---|---|
| 1 | よく理解できた |
| 2 | だいたい理解できた |
| 3 | あまり理解できなかった |
| 4 | 全然理解できなかった |

---

## 自動クリーンアップ（cron）

| エンドポイント | 処理内容 | タイミング |
|---|---|---|
| `/api/cron/cleanup` | アクティブなルームを **作成から 2 時間後**に自動終了 | 毎時 |
| `/api/cron/cleanup` | 終了から **1 週間**経過したルームと全関連データを削除 | 毎時 |
| `/api/cron/understanding-notify` | scheduledAt を過ぎた UnderstandingCheck の対象生徒に通知 | 毎時 |
| `/api/cron/understanding-tally` | tallyAt を過ぎた UnderstandingCheck を集計・教師へ通知 | 毎時 |

cron エンドポイントは `x-cron-secret` ヘッダーで認証します。

```bash
# 実行例（サーバー上の crontab 等で毎時実行）
curl -X POST https://your-domain/api/cron/cleanup \
  -H "x-cron-secret: your_cron_secret"

curl -X POST https://your-domain/api/cron/understanding-notify \
  -H "x-cron-secret: your_cron_secret"

curl -X POST https://your-domain/api/cron/understanding-tally \
  -H "x-cron-secret: your_cron_secret"
```

---

## 環境変数

| 変数名 | 説明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 接続 URL |
| `OPENAI_API_KEY` | OpenAI API キー（Whisper 書き起こし / gpt-4o-mini 要約・チャット変換・理解度集計） |
| `CRON_SECRET` | cron エンドポイントの認証キー |

---

## ディレクトリ構成

```
Re-a-class/
├── src/
│   ├── app/
│   │   ├── page.tsx                           # ルート → /home にリダイレクト
│   │   ├── login/page.tsx                     # ログインページ（全ロール共通）
│   │   ├── home/page.tsx                      # ダッシュボード（教師・生徒）
│   │   ├── admin/page.tsx                     # サーバー管理パネル（SERVER_ADMIN）
│   │   ├── school-admin/page.tsx              # 学校管理パネル（SCHOOL_ADMIN）
│   │   ├── teacher/[roomId]/page.tsx          # 教師用授業画面
│   │   ├── student/[roomId]/page.tsx          # 生徒用授業画面
│   │   ├── board/[roomId]/page.tsx            # 授業後の匿名掲示板
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts             # POST ログイン（Cookie セット）
│   │       │   ├── logout/route.ts            # POST ログアウト（Cookie 削除）
│   │       │   └── me/route.ts                # GET ログイン中ユーザー情報
│   │       ├── rooms/
│   │       │   ├── route.ts                   # GET 一覧 / POST 作成
│   │       │   └── [roomId]/
│   │       │       ├── route.ts               # GET 詳細 / DELETE 授業終了
│   │       │       ├── qr/route.ts            # GET QR コード生成
│   │       │       ├── chat/route.ts          # POST チャット送信（AI 敬語変換）
│   │       │       ├── chat/toggle/route.ts   # POST チャット受付切り替え
│   │       │       ├── reactions/route.ts     # POST リアクション送信
│   │       │       ├── notes/route.ts         # PATCH 授業メモ保存
│   │       │       ├── surveys/route.ts       # POST アンケート作成
│   │       │       ├── surveys/[id]/answer/   # POST 回答
│   │       │       ├── surveys/[id]/close/    # POST 締め切り
│   │       │       ├── transcribe/route.ts    # POST 音声書き起こし（Whisper）
│   │       │       ├── summary/route.ts       # POST AI 要約生成
│   │       │       ├── enroll/route.ts        # POST 入室登録（upsert）
│   │       │       ├── board/route.ts         # GET/POST 匿名掲示板
│   │       │       └── understanding/route.ts # GET 状態確認 / POST 回答
│   │       ├── notifications/route.ts         # GET 通知一覧
│   │       ├── notifications/[id]/route.ts    # PATCH 既読化
│   │       ├── school-admin/users/route.ts    # GET 一覧 / POST 作成（1人・一括）
│   │       ├── school-admin/users/[id]/       # DELETE 削除 / PATCH PW リセット
│   │       ├── server-admin/schools/route.ts  # GET 一覧 / POST 作成
│   │       ├── server-admin/schools/[id]/     # DELETE 削除 / POST 管理者作成
│   │       └── cron/
│   │           ├── cleanup/route.ts           # ルーム自動終了・削除
│   │           ├── understanding-notify/      # 理解度チェック通知
│   │           └── understanding-tally/       # 理解度チェック集計
│   ├── lib/
│   │   ├── prisma.ts                          # Prisma Client シングルトン
│   │   ├── auth.ts                            # scrypt ハッシュ・セッション管理
│   │   ├── requireAuth.ts                     # API 認証チェックヘルパー
│   │   └── userId.ts                          # ユーザー ID 自動採番
│   └── middleware.ts                          # 全リクエストのセッション認証
├── prisma/
│   ├── schema.prisma                          # DB スキーマ定義
│   └── migrations/                            # マイグレーション履歴
├── scripts/
│   └── create-server-admin.ts                 # 初回サーバー管理者作成スクリプト
├── Dockerfile
├── docker-compose.yml
├── docker-entrypoint.sh
└── .env.example
```

---

## データベーススキーマ（主要テーブル）

| テーブル | 説明 |
|---|---|
| `School` | 学校（prefix でユーザー ID を分離） |
| `User` | ユーザー（全ロール共通、schoolId で所属学校を管理） |
| `Session` | ログインセッション（7 日有効、期限切れは自動削除） |
| `Room` | 授業ルーム（notes / transcript / summary を保持） |
| `Enrollment` | 生徒とルームの参加記録（userId + roomId でユニーク） |
| `ChatMessage` | 生徒→教師のチャット（content: AI 変換後、rawContent: 原文） |
| `Reaction` | リアクション（type 文字列で種別を保存） |
| `Survey` / `SurveyOption` | アンケートと選択肢（votes でリアルタイム集計） |
| `BoardPost` | 匿名掲示板の投稿（表示時に SHA256 で匿名ラベル生成） |
| `UnderstandingCheck` | 理解度チェックのスケジュール管理（scheduledAt / notifiedAt / tallyAt / talliedAt） |
| `UnderstandingCheckResponse` | 生徒の理解度チェック回答（score 1〜4 + comment） |
| `Notification` | アプリ内通知（UNDERSTANDING_CHECK / UNDERSTANDING_RESULT） |

---

## ライセンス

MIT
