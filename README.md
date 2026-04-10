# Re:a Class

> 対面授業をリアルタイムで補助する Web アプリケーション

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38bdf8?logo=tailwindcss)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)
![License](https://img.shields.io/badge/license-MIT-green)

講義中に発言しにくい環境でも、生徒が匿名でリアクション・質問・チャットを送れます。  
授業終了後はAIが復習ノートを自動生成し、生徒がいつでも見返せます。

---

## 機能一覧

### 教師側
- ルーム作成・QR コード発行（生徒はQRを読むだけで参加）・QRコード画像ダウンロード
- リアクション集計のリアルタイム表示
- 生徒からの個人チャット受信（匿名ラベル：生徒A, 生徒B…Z, AA, AB…）
- アンケート作成・結果表示・締め切り
- 授業音声の録音 → Groq Whisperで書き起こし（無料・1日2時間まで）
- Groq AI（Llama 3.3）による生徒向け復習ノート生成・Markdownダウンロード
- 授業終了（終了後は生徒からの入力を全てブロック）

### 生徒側
- QR コード or ルームID で匿名参加
- 5種類のリアクション送信（理解した・わからない・質問あり・ゆっくり・速く）
- 先生だけに届く個人チャット（他の生徒には見えない）
- アンケート回答・結果閲覧
- 授業後の復習ノート閲覧（ポイント・用語・確認問題付き）

---

## 技術スタック

| 役割 | 技術 |
|---|---|
| フロントエンド | Next.js 14 (App Router) / React / TypeScript |
| スタイリング | Tailwind CSS |
| バックエンド | Next.js API Routes |
| データベース | PostgreSQL 16 |
| ORM | Prisma 5 |
| 音声書き起こし | Groq Whisper large-v3（無料・1日2時間まで） |
| AI 要約 | Groq API / Llama 3.3 70B（無料枠あり） |
| インフラ | Docker / Docker Compose |

---

## システム構成

```
ブラウザ (教師・生徒)
       ↕ HTTP polling (2秒)
┌──────────────────────────────┐
│     Next.js 14 (App Router)  │
│  ┌────────────┐ ┌──────────┐ │
│  │  React UI  │ │   API    │ │
│  │  /teacher  │ │ /api/**  │ │
│  │  /student  │ └────┬─────┘ │
│  └────────────┘      │       │
└─────────────────────┼────────┘
                      ↕ Prisma
               ┌──────────────┐
               │  PostgreSQL  │
               └──────────────┘
                      ↕
               ┌──────────────┐
               │   Groq API   │
               │  Whisper     │
               │  Llama 3.3   │
               └──────────────┘
```

---

## セットアップ

### 必要なもの
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Groq API キー（[console.groq.com](https://console.groq.com)）※無料・クレジットカード不要

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
DATABASE_URL="postgresql://reaclass:reaclass_pass@localhost:5432/reaclass"
GROQ_API_KEY="gsk_..."
CRON_SECRET="任意のランダム文字列"
```

**3. 起動**
```bash
docker compose up --build
```

起動時にデータベースのマイグレーションが自動実行されます。

**4. アクセス**

ブラウザで http://localhost:3000 を開く

---

## 使い方

### 授業の始め方
1. トップページで「**教師として開始**」を選択
2. 教師名・授業名を入力してルーム作成
3. 表示された **QR コードを画面に投影** → 生徒がスマホで読み取り参加（QR画像のダウンロードも可能）

### 授業中
- 教師画面でリアクションや質問をリアルタイムで確認
- 「**録音開始**」で音声を録音（途中で止めて再開も可能）
- 録音停止後に「**書き起こし開始**」でGroq Whisperが文字起こし
- 必要に応じてアンケートを作成・投票

### 授業の終わり
1. 「**要約を生成する**」で AI が書き起こし・アンケートをもとに生徒向け復習ノートを生成
2. 「**授業終了**」で生徒からの入力をブロック
3. 生徒は復習ノートをいつでも閲覧可能、Markdown でダウンロードも可能

---

## 環境変数

| 変数名 | 説明 |
|---|---|
| `DATABASE_URL` | PostgreSQL 接続 URL |
| `GROQ_API_KEY` | Groq API キー（Whisper書き起こし・Llama 3.3復習ノート生成に使用） |
| `CRON_SECRET` | cronエンドポイントの認証キー |

---

## ディレクトリ構成

```
Re-a-class/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # トップページ
│   │   ├── teacher/[roomId]/page.tsx   # 教師画面
│   │   ├── student/[roomId]/page.tsx   # 生徒画面
│   │   └── api/rooms/                  # API Routes
│   │       └── [roomId]/
│   │           ├── route.ts            # ルーム取得・終了
│   │           ├── chat/               # チャット
│   │           ├── reactions/          # リアクション
│   │           ├── surveys/            # アンケート
│   │           ├── transcribe/         # 書き起こし保存
│   │           ├── summary/            # AI復習ノート生成
│   │           └── qr/                 # QRコード生成
│   └── lib/
│       └── prisma.ts                   # Prisma Client
├── prisma/
│   ├── schema.prisma                   # DB スキーマ定義
│   └── migrations/                     # マイグレーション履歴
├── Dockerfile
├── docker-compose.yml
├── docker-entrypoint.sh
└── .env.example
```

---

## 自動クリーンアップ

| 処理 | タイミング |
|---|---|
| ルームの自動終了 | 作成から **2時間** 経過したアクティブなルームを自動終了 |
| ルームの自動削除 | 終了から **1週間** 経過したルームとその全データを自動削除 |

クリーンアップは `/api/cron/cleanup` への POST リクエストで実行されます。  
`CRON_SECRET` 環境変数で認証しているため、外部から直接叩くことはできません。  
サーバー側のcronなどで定期実行してください（例：1時間ごと）。

```bash
# 実行例
curl -X POST https://your-domain/api/cron/cleanup \
  -H "x-cron-secret: your_secret"
```

---

## ライセンス

MIT
