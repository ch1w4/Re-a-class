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
- リアクション集計のリアルタイム表示（理解した / わからない / 質問あり / ゆっくり / 速く）
- 生徒からの個別チャット受信（送信前に AI が自動で敬語に変換）
- チャット受付のオン/オフ切り替え
- 授業メモ（板書内容等）のリアルタイム保存
- アンケート作成・結果表示・締め切り
- 授業音声の録音 → OpenAI Whisper で書き起こし
- AI 要約レポート生成（gpt-4o-mini）: 書き起こし・リアクション・アンケートをもとに Markdown 形式で出力
- 授業終了（終了後は生徒からの入力を全てブロック）

### 生徒側
- ルーム ID 入力で匿名参加・授業履歴の自動記録
- 5 種類のリアクション送信
- 先生だけに届く個別チャット（他の生徒には見えない）
- アンケート回答・結果閲覧
- 授業後の復習ノート閲覧（AI 要約 + 書き起こし）
- 授業後の匿名掲示板（感想・質問を投稿・閲覧）
- 授業終了 4 日後の「理解度チェック」（スコア 1〜4 + コメントで回答）

### 学校管理者
- 教師・生徒のユーザー登録（1 人 or CSV 形式一括）
- ユーザー削除・パスワードリセット
- 終了済み講義の掲示板を管理者モードで閲覧（実名表示）

### サーバー管理者
- 学校の追加・削除（学校単位でデータを完全分離）
- 学校管理者の作成

---

## 技術スタック

| 役割 | 技術 |
|---|---|
| フロントエンド | Next.js 14 (App Router) / React / TypeScript |
| スタイリング | Tailwind CSS |
| バックエンド | Next.js API Routes |
| データベース | PostgreSQL 16 |
| ORM | Prisma 5 |
| 認証 | セッション Cookie（httpOnly）+ scrypt パスワードハッシュ |
| 音声書き起こし | OpenAI Whisper (whisper-1) |
| AI 機能 | OpenAI API / gpt-4o-mini（要約・チャット敬語変換・理解度集計） |
| インフラ | Docker / Docker Compose |

---

## ロール構成

```
SERVER_ADMIN    ← サーバー全体の管理者（学校の追加・削除）
  └─ SCHOOL_ADMIN  ← 学校ごとの管理者（ユーザー管理）
       ├─ TEACHER   ← 授業を作成・進行する教師
       └─ STUDENT   ← 授業に参加する生徒
```

ユーザー ID は `{学校prefix}{8桁連番}`（例: `A00000001`）。  
初期パスワードはユーザー ID と同一。

---

## システム構成

```
ブラウザ (教師・生徒・管理者)
       ↕ HTTP polling (2秒)
┌─────────────────────────────────┐
│      Next.js 14 (App Router)    │
│  ┌─────────────┐  ┌───────────┐ │
│  │  React UI   │  │    API    │ │
│  │  /teacher   │  │  /api/**  │ │
│  │  /student   │  └─────┬─────┘ │
│  │  /home      │        │       │
│  │  /admin     │        │       │
│  └─────────────┘        │       │
│    ↕ middleware          │       │
│   session_id Cookie      │       │
└──────────────────────────┼───────┘
                           ↕ Prisma
               ┌──────────────────┐
               │   PostgreSQL 16  │
               └──────────────────┘
                           ↕
               ┌──────────────────┐
               │   OpenAI API     │
               │  Whisper         │
               │  gpt-4o-mini     │
               └──────────────────┘
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

**4. 初回セットアップ**

起動後、サーバー管理者アカウントを作成します。
```bash
docker compose exec app npx ts-node scripts/create-server-admin.ts
```
（または DB に直接 INSERT してください）

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
1. `/home` にログイン後「授業を開始」
2. 表示されたルーム ID を生徒に共有
3. 生徒は `/home` でルーム ID を入力して参加

### 4. 授業中
- 教師画面でリアクションや質問をリアルタイムで確認
- 「録音開始」→「停止」→「書き起こし開始」で Whisper が文字起こし
- 「要約を生成する」で AI が復習ノートを作成
- 「授業終了」で生徒からの入力をブロック

### 5. 授業終了後
- 生徒は復習ノートと書き起こしを閲覧可能
- 匿名掲示板に感想・質問を投稿可能
- 授業終了 4 日後に「理解度チェック」通知が届く（スコア + コメントで回答）

---

## 環境変数

| 変数名 | 説明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 接続 URL |
| `OPENAI_API_KEY` | OpenAI API キー（Whisper 書き起こし・gpt-4o-mini 要約・チャット変換・理解度集計） |
| `CRON_SECRET` | cron エンドポイントの認証キー |

---

## ディレクトリ構成

```
Re-a-class/
├── src/
│   ├── app/
│   │   ├── page.tsx                           # ルート → /home にリダイレクト
│   │   ├── login/page.tsx                     # ログインページ
│   │   ├── home/page.tsx                      # メインホーム（教師・生徒）
│   │   ├── admin/page.tsx                     # サーバー管理パネル
│   │   ├── school-admin/page.tsx              # 学校管理パネル
│   │   ├── teacher/[roomId]/page.tsx          # 教師用授業画面
│   │   ├── student/[roomId]/page.tsx          # 生徒用授業画面
│   │   ├── board/[roomId]/page.tsx            # 授業後の匿名掲示板
│   │   └── api/
│   │       ├── auth/                          # ログイン・ログアウト・ユーザー情報
│   │       ├── rooms/                         # ルーム CRUD・チャット・リアクション・アンケート等
│   │       │   └── [roomId]/
│   │       │       ├── route.ts               # ルーム取得・授業終了
│   │       │       ├── chat/                  # チャット送信・オン/オフ切り替え
│   │       │       ├── reactions/             # リアクション送信
│   │       │       ├── notes/                 # 教師メモ保存
│   │       │       ├── surveys/               # アンケート作成・回答・締め切り
│   │       │       ├── transcribe/            # 音声書き起こし
│   │       │       ├── summary/               # AI 要約生成
│   │       │       ├── enroll/                # 参加登録
│   │       │       ├── board/                 # 匿名掲示板
│   │       │       └── understanding/         # 理解度チェック
│   │       ├── notifications/                 # 通知一覧・既読化
│   │       ├── school-admin/users/            # 学校管理者用ユーザー管理
│   │       ├── server-admin/schools/          # サーバー管理者用学校管理
│   │       └── cron/                          # 定期実行エンドポイント
│   │           ├── cleanup/                   # ルーム自動終了・削除
│   │           ├── understanding-notify/      # 理解度チェック通知
│   │           └── understanding-tally/       # 理解度チェック集計
│   ├── lib/
│   │   ├── prisma.ts                          # Prisma Client シングルトン
│   │   ├── auth.ts                            # パスワードハッシュ・セッション管理
│   │   ├── requireAuth.ts                     # API 認証チェックヘルパー
│   │   └── userId.ts                          # ユーザー ID 自動採番
│   └── middleware.ts                          # 全リクエストのセッション認証
├── prisma/
│   ├── schema.prisma                          # DB スキーマ定義
│   └── migrations/                            # マイグレーション履歴
├── Dockerfile
├── docker-compose.yml
├── docker-entrypoint.sh
└── .env.example
```

---

## 自動クリーンアップ

| 処理 | タイミング |
|---|---|
| ルームの自動終了 | 作成から **2 時間** 経過したアクティブなルームを自動終了 |
| 理解度チェックスケジュール | 授業終了と同時に **終了 4 日後** に通知を予約 |
| 理解度チェック通知 | scheduledAt を過ぎた UnderstandingCheck の生徒全員に通知を送信 |
| 理解度チェック集計 | 通知から **3 日後** に回答を集計し、教師に結果を通知 |
| ルームの自動削除 | 終了から **1 週間** 経過したルームとその全データを削除 |

クリーンアップは各 cron エンドポイントへの POST で実行されます。  
`CRON_SECRET` 環境変数で認証しているため、外部から直接叩くことはできません。

```bash
# 実行例（サーバー上の crontab 等で定期実行）
# 毎時実行
curl -X POST https://your-domain/api/cron/cleanup \
  -H "x-cron-secret: your_secret"

curl -X POST https://your-domain/api/cron/understanding-notify \
  -H "x-cron-secret: your_secret"

curl -X POST https://your-domain/api/cron/understanding-tally \
  -H "x-cron-secret: your_secret"
```

---

## ライセンス

MIT
