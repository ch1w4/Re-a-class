# Re:a Class

> 対面授業をリアルタイムで補助するマルチテナント Web アプリケーション

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38bdf8?logo=tailwindcss)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)
![License](https://img.shields.io/badge/license-MIT-green)

講義中に発言しにくい環境でも、生徒が匿名でリアクション・アンケート回答を送れます。  
授業終了後は AI が教師向けフィードバックレポートを自動生成し、4 日後には生徒の「理解度チェック」を自動送信・集計して担当教師へ結果を届けます。  
複数の学校・教師・生徒をまとめて管理できるマルチテナント構成です。

---

## 機能一覧

### 教師側
- **ルーム作成・QR コード発行** — 生徒は QR を読むだけで参加（ルームID入力も可）
- **リアクションリアルタイム集計** — 5 種類（理解した / わからない / 質問あり / ゆっくり / 速く）
- **アンケート** — 授業中に作成・リアルタイム集計・締め切り
- **授業メモ** — 板書内容などを手動保存（生徒には見えない）
- **授業録音 → 書き起こし** — Groq Whisper（`whisper-large-v3-turbo`）で日本語テキストに変換（複数回録音は追記）
- **AI フィードバックレポート生成** — Groq Llama（`llama-3.3-70b-versatile`）が授業の振り返り・生徒の反応傾向・改善アドバイスを Markdown で出力（教師専用・生徒には非公開）
- **授業終了** — 以降は生徒からの入力を全ブロック。4 日後に理解度チェックを自動スケジュール
- **ルーム削除** — ホーム画面から不要なルームを物理削除（関連データもすべて削除）
- **理解度チェック結果の受信** — 集計後にアプリ内通知 + 教師ページで詳細確認

### 生徒側
- **ルーム参加** — ルーム ID 入力または QR スキャン（参加記録は自動保存）
- **リアクション送信** — 匿名・何度でも送信可
- **アンケート回答** — 受付中のみ回答可、結果はリアルタイム表示
- **匿名掲示板** — 授業終了後に感想・質問を投稿（授業画面の「掲示板」タブ。投稿者は匿名ラベルで表示）
- **理解度チェック** — 授業終了 4 日後に通知 → 当日中にスコア（1〜4）で回答
  - スコア 3/4（理解できなかった側）を選ぶと「何が理解できなかったか」入力欄が出現
  - 過半数が未理解の場合、コメントを AI が要約して教師に届く

### 学校管理者（SCHOOL_ADMIN）
- 教師・生徒のユーザー登録（1 人 or 改行区切りの一括入力）
- 開始 ID 番号の任意指定（省略時は最小未使用番号を自動採番）
- ユーザー削除・パスワードリセット（パスワードをユーザー ID に戻す）
- 授業後の匿名掲示板を実名表示で確認（`/board` ページ、管理者専用）

### サーバー管理者（SERVER_ADMIN）
- 学校の追加・削除（学校ごとにデータを完全分離）
- 学校管理者（SCHOOL_ADMIN）の作成

---

## 技術スタック

### フロントエンド
| 役割 | 技術 |
|---|---|
| フレームワーク | Next.js 14 (App Router) |
| UI ライブラリ | React 18 |
| 言語 | TypeScript 5 |
| スタイリング | Tailwind CSS 3（ユーティリティクラスを `className` に直書き） |

### バックエンド
| 役割 | 技術 |
|---|---|
| API | Next.js API Routes（フロントと同一プロセス） |
| ORM | Prisma 5 |
| データベース | PostgreSQL 16 |
| 認証 | 独自セッション（httpOnly Cookie + `crypto.scrypt` ハッシュ、7日有効） |
| 認可 | ロール（`Role`）+ ルームの所有者・参加状態・所属学校に基づくアクセス制御。API は `requireAuth`、ページ遷移は各ルートの `layout.tsx` + `requirePageRole` で保護 |
| リアルタイム更新 | HTTP ポーリング（授業画面: 2 秒間隔 / 掲示板・通知: 3〜10 秒間隔） |
| テスト | Vitest（`npm test`） — 認可ロジックと API ルートの単体テスト |

### AI・外部サービス
| 役割 | 技術 |
|---|---|
| AI クライアント | `openai` パッケージ（`baseURL` を Groq に向けて使用） |
| 音声書き起こし | Groq `whisper-large-v3-turbo`（無料枠） |
| テキスト生成 | Groq `llama-3.3-70b-versatile`（無料枠） |
| QR コード生成 | `qrcode` npm パッケージ（サーバーサイドで base64 画像生成） |

### インフラ
| 役割 | 技術 |
|---|---|
| コンテナ | Docker / Docker Compose |
| 起動スクリプト | `docker-entrypoint.sh`（マイグレーション + 管理者初期化を自動実行） |

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
- **セッション**: httpOnly Cookie（`session_id`）。有効期限は 7 日間

---

## システム構成

```
ブラウザ（教師・生徒・管理者）
       ↕ HTTP ポーリング（2 秒 / 10 秒）
┌────────────────────────────────────────┐
│        Next.js 14 (App Router)         │
│  ┌───────────────┐  ┌───────────────┐  │
│  │   React UI    │  │  API Routes   │  │
│  │  /teacher     │  │   /api/**     │  │
│  │  /student     │  └──────┬────────┘  │
│  │  /home        │         │           │
│  │  /board       │         │           │
│  │  /admin       │         │           │
│  │  /school-admin│         │           │
│  └───────────────┘         │           │
│    ↕ middleware (Cookie)   │           │
└───────────────────────────┼───────────┘
                             ↕ Prisma ORM
               ┌─────────────────────────┐
               │      PostgreSQL 16       │
               └─────────────────────────┘
                             ↕
               ┌─────────────────────────┐
               │       Groq API          │
               │  whisper-large-v3-turbo  │
               │  llama-3.3-70b-versatile │
               └─────────────────────────┘
```

---

## セットアップ

### 必要なもの
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Groq API キー（無料）— [console.groq.com](https://console.groq.com) で取得

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

`.env` を開いて各値を入力：
```env
DATABASE_URL="postgresql://reaclass:reaclass_pass@db:5432/reaclass"
SESSION_SECRET="ランダムな文字列（openssl rand -hex 32 など）"
CRON_SECRET="ランダムな文字列"
SERVER_ADMIN_ID="A00000001"
SERVER_ADMIN_PASS="初期パスワード"
SERVER_ADMIN_NAME="管理者名"
GROQ_API_KEY="gsk_..."   # https://console.groq.com で無料取得
```

**3. 起動**
```bash
docker compose up --build
```

起動時にデータベースのマイグレーションと初期管理者アカウントの作成が自動実行されます。

---

## 使い方

### 1. 学校を登録する（サーバー管理者）
1. `/admin` にログイン（初期パスワード = `.env` の `SERVER_ADMIN_PASS`）
2. 学校名と prefix（例: `A`）を入力して学校を追加
3. 「管理者を追加」で学校管理者を作成（初期パスワード = 発行された ID）

### 2. 教師・生徒を登録する（学校管理者）
1. `/school-admin` にログイン
2. ロール（教師/生徒）と氏名を入力してユーザーを追加
3. 一括追加は「一括追加タブ」で 1 行 1 人の形式で入力

### 3. 授業を開始する（教師）
1. `/home` で「授業を開始」から授業名を入力
2. 表示された QR コードまたはルーム ID を生徒に共有

### 4. 授業に参加する（生徒）
1. `/home` でルーム ID を入力して参加、または QR コードをスキャン

### 5. 授業中
- 生徒はリアクションをいつでも何回でも送信（匿名で教師に届く）
- 教師はアンケートをその場で作成・集計・締め切り
- 「録音開始」→「停止」で Whisper が自動書き起こし（複数回録音は追記）
- 「フィードバックを生成する」で AI が教師向けレポートを作成

### 6. 授業終了後
- 教師が「授業終了」ボタンを押すと生徒からの入力を全ブロック
- 生徒は匿名掲示板で感想・質問を投稿可能
- 4 日後に「理解度チェック」が自動配信される（当日中が提出期限）

---

## 理解度チェックの仕組み

```
授業終了
  ↓（即時）
UnderstandingCheck を 4 日後でスケジュール
  ↓（4 日後: cron/understanding-notify が毎時チェック）
参加した全生徒へ通知を送信（UNDERSTANDING_CHECK）
提出期限 = 通知当日の深夜 0 時（UTC）
  ↓（深夜 0 時以降: cron/understanding-tally が毎時チェック）
回答を集計 → 必ず担当教師へ結果通知を送信（UNDERSTANDING_RESULT）
  └── 回答者の 50% 超が score 3〜4（理解できなかった）の場合
      → score 3/4 の生徒の「何が理解できなかったか」コメントを
        AI（llama-3.3-70b-versatile）が要約して通知に追加
```

**スコア定義:**
| スコア | 意味 |
|---|---|
| 1 | 😄 よく理解できた |
| 2 | 🙂 だいたい理解できた |
| 3 | 😕 あまり理解できなかった（コメント欄が出現） |
| 4 | 😢 全然理解できなかった（コメント欄が出現） |

集計結果（スコア内訳 + AI 要約）は `UnderstandingCheck.resultBody` に保存され、教師ページの「📋 理解度チェック」カードで確認できます。

---

## 自動クリーンアップ（cron）

| エンドポイント | 処理内容 | 推奨実行間隔 |
|---|---|---|
| `/api/cron/cleanup` | 作成から **2 時間**経過したアクティブルームを自動終了 | 毎時 |
| `/api/cron/cleanup` | 終了から **1 週間**経過したルームと全関連データを削除 | 毎時 |
| `/api/cron/understanding-notify` | scheduledAt を過ぎた UnderstandingCheck の生徒に通知を送信 | 毎時 |
| `/api/cron/understanding-tally` | 提出期限を過ぎた UnderstandingCheck を集計・教師へ通知 | 毎時 |

cron エンドポイントは `x-cron-secret` ヘッダーで認証します：

```bash
curl -X POST https://your-domain/api/cron/cleanup \
  -H "x-cron-secret: your_cron_secret"

curl -X POST https://your-domain/api/cron/understanding-notify \
  -H "x-cron-secret: your_cron_secret"

curl -X POST https://your-domain/api/cron/understanding-tally \
  -H "x-cron-secret: your_cron_secret"
```

---

## デモ用: 時間スキップ機能

コンテスト発表など、理解度チェック機能をその場でデモする場合：

1. `/home` 画面の**右下**に「⏩ 時間をスキップ」ボタンが表示されています
2. **1 回目のクリック**: scheduledAt を現在時刻に前倒し → 生徒へ理解度チェック通知を即座に送信
3. **2 回目のクリック**: tallyAt を現在時刻に前倒し → 集計処理を実行 → 教師へ結果通知を送信

内部的には `/api/debug/advance-time` を呼び出しています（本番環境では削除または保護推奨）。

---

## 環境変数

| 変数名 | 必須 | 説明 |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL 接続 URL |
| `SESSION_SECRET` | ✅ | セッション Cookie の署名シークレット |
| `CRON_SECRET` | ✅ | cron エンドポイントの認証キー |
| `SERVER_ADMIN_ID` | ✅ | 初期サーバー管理者のユーザー ID |
| `SERVER_ADMIN_PASS` | ✅ | 初期サーバー管理者のパスワード |
| `SERVER_ADMIN_NAME` | ✅ | 初期サーバー管理者の表示名 |
| `GROQ_API_KEY` | — | Groq API キー（未設定時は AI 機能が無効、他機能は正常動作） |

---

## ディレクトリ構成

```
Re-a-class/
├── src/
│   ├── app/
│   │   ├── page.tsx                              # ルート → /home にリダイレクト
│   │   ├── login/page.tsx                        # ログインページ（全ロール共通）
│   │   ├── home/                                 # ダッシュボード（教師・生徒）+ デモボタン
│   │   │   ├── layout.tsx                        # ロールガード（TEACHER/STUDENT のみ）
│   │   │   └── page.tsx
│   │   ├── admin/                                # サーバー管理パネル（SERVER_ADMIN 専用）
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── school-admin/                         # 学校管理パネル（SCHOOL_ADMIN 専用）
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── teacher/[roomId]/                     # 教師用授業画面（録音・アンケート・理解度結果）
│   │   │   ├── layout.tsx                        # ロールガード（TEACHER のみ）
│   │   │   └── page.tsx
│   │   ├── student/[roomId]/                     # 生徒用授業画面（リアクション・掲示板・理解度チェック）
│   │   │   ├── layout.tsx                        # ロールガード（STUDENT のみ）
│   │   │   └── page.tsx
│   │   ├── board/[roomId]/                       # 学校管理者向け: 掲示板の実名確認ページ
│   │   │   ├── layout.tsx                        # ロールガード（SCHOOL_ADMIN のみ）
│   │   │   └── page.tsx                          # 生徒向けの掲示板は student ページ内のタブに統合済み
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts                # POST ログイン（Cookie セット）
│   │       │   ├── logout/route.ts               # POST ログアウト（Cookie 削除）
│   │       │   └── me/route.ts                   # GET ログイン中ユーザー情報
│   │       ├── rooms/
│   │       │   ├── route.ts                      # GET 一覧 / POST 作成
│   │       │   └── [roomId]/
│   │       │       ├── route.ts                  # GET 詳細 / DELETE 授業終了 or 物理削除
│   │       │       ├── qr/route.ts               # GET QR コード生成（base64 データ URL）
│   │       │       ├── reactions/route.ts        # POST リアクション送信
│   │       │       ├── notes/route.ts            # PATCH 授業メモ保存
│   │       │       ├── surveys/route.ts          # POST アンケート作成
│   │       │       ├── surveys/[id]/answer/      # POST アンケート回答
│   │       │       ├── surveys/[id]/close/       # POST アンケート締め切り
│   │       │       ├── transcribe/route.ts       # POST 音声書き起こし（Groq Whisper）
│   │       │       ├── summary/route.ts          # POST AI フィードバックレポート生成（教師専用）
│   │       │       ├── enroll/route.ts           # POST 入室登録（upsert）
│   │       │       ├── board/route.ts            # GET/POST 匿名掲示板
│   │       │       └── understanding/route.ts    # GET 状態・タイミング確認 / POST 回答送信
│   │       ├── notifications/route.ts            # GET 通知一覧（最新 50 件）
│   │       ├── notifications/[id]/route.ts       # PATCH 既読化
│   │       ├── school-admin/users/route.ts       # GET 一覧 / POST ユーザー作成（1人・一括）
│   │       ├── school-admin/users/[id]/          # DELETE 削除 / PATCH PW リセット
│   │       ├── server-admin/schools/route.ts     # GET 一覧 / POST 学校作成
│   │       ├── server-admin/schools/[id]/        # DELETE 学校削除 / POST 管理者作成
│   │       ├── cron/
│   │       │   ├── cleanup/route.ts              # 自動終了・削除（毎時 cron）
│   │       │   ├── understanding-notify/route.ts # 理解度チェック通知送信（毎時 cron）
│   │       │   └── understanding-tally/route.ts  # 理解度チェック集計・結果通知（毎時 cron）
│   │       └── debug/
│   │           └── advance-time/route.ts         # デモ用: 時間スキップ + cron 処理を即実行
│   ├── lib/
│   │   ├── prisma.ts                             # Prisma Client シングルトン
│   │   ├── auth.ts                               # scrypt ハッシュ・セッション管理
│   │   ├── requireAuth.ts                        # API 認証・ロールチェックヘルパー
│   │   ├── roomAuthorization.ts                  # ルーム単位の認可（所有者・参加済み生徒・同一学校管理者の判定）
│   │   ├── roomProjections.ts                    # ロール別に安全なフィールドだけを返す Prisma select 定義
│   │   ├── pageAuthorization.ts                  # ページごとのアクセス許可ロール定義（PAGE_ROLES）
│   │   ├── requirePageRole.ts                    # ページ（layout.tsx）用のロールガード + リダイレクト
│   │   ├── surveyOptions.ts                      # アンケート選択肢の表示順を安定させるユーティリティ
│   │   ├── userId.ts                             # ユーザー ID 自動採番（最小未使用番号）
│   │   ├── ai.ts                                 # Groq AI クライアント共通設定
│   │   └── authorization.test.ts                 # 認可ロジックの単体テスト（Vitest）
│   ├── components/icons/                         # 絵文字の代わりに使う SVG アイコンコンポーネント群
│   └── middleware.ts                             # 全リクエストのセッション認証 + /login リダイレクト
├── prisma/
│   ├── schema.prisma                             # DB スキーマ定義
│   └── migrations/                              # マイグレーション履歴
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
| `Session` | ログインセッション（7 日有効、期限切れはアクセス時に自動削除） |
| `Room` | 授業ルーム（notes / transcript / summary / endedAt を保持） |
| `Enrollment` | 生徒とルームの参加記録（userId + roomId でユニーク制約） |
| `Reaction` | リアクション（type 文字列で種別を保存、timestamp 付き） |
| `Survey` / `SurveyOption` | アンケートと選択肢（SurveyOption.votes でリアルタイム集計） |
| `SurveyResponse` | 生徒のアンケート回答記録（surveyId + userId でユニーク制約、重複回答を防止） |
| `BoardPost` | 匿名掲示板の投稿（表示時に SHA256(userId:roomId) で匿名ラベル生成） |
| `StudentNote` | 生徒の授業中メモ（userId + roomId でユニーク制約、本人にのみ表示） |
| `UnderstandingCheck` | 理解度チェックのスケジュール管理と集計結果（resultBody に内訳 + AI 要約を保存） |
| `UnderstandingCheckResponse` | 生徒の理解度チェック回答（score 1〜4 + comment） |
| `Notification` | アプリ内通知（UNDERSTANDING_CHECK / UNDERSTANDING_RESULT） |

---

## ライセンス

MIT
