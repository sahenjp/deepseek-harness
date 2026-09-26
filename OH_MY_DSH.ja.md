# oh-my-dsh

`oh-my-dsh` は、このフォーク向けの少し強めに設定した DeepSeek Harness 起動レイヤーです。別の Harness ランタイムを持たず、既存の `dsh` を唯一のアプリケーションランチャーとして使い、小さな profile overlay を適用します。

[English](OH_MY_DSH.md) | 日本語

## 使い方

```sh
pnpm install

# Web UI
pnpm oh-my-dsh

# ブラウザを自動で開かない
pnpm oh-my-dsh -- --no-open

# headless で一発実行
pnpm oh-my-dsh ask "失敗しているテストを調べて修正して"

# 環境診断
pnpm oh-my-dsh doctor
```

## Web の既定設定

Web 起動時は、上流 DSH の既存機能を使って次を有効にします。

- 新しいセッションの既定 Agent preset を `ptc` に設定
- スケジュール機能を有効化
- セッション全文検索を有効化
- 全文検索用 SQLite を `$DSH_HOME/session-search.sqlite` に保存し、最初の検索時に開く

ユーザーが Web UI から保存した Agent preset の選択は、deployment 側の既定値より優先されます。

## headless の既定設定

`pnpm oh-my-dsh ask "..."` は、上流の `headless` profile を PTC presentation で起動します。

さらに以下を有効にします。

- Ralph
- profile plugin management tool
- PTC tool presentation

## 実装方針

独自の実行ランタイムや別の Agent loop は追加していません。

```text
oh-my-dsh
  └─ dsh
      ├─ web profile
      │   └─ scripts/oh-my-dsh/web.patch.yml
      └─ headless profile
          └─ scripts/oh-my-dsh/headless.patch.yml
```

上流 DSH の profile / patch 構成に乗ることで、本体更新を取り込みやすくし、フォーク固有の差分を小さく保つ方針です。

## Node.js

このリポジトリと同じく、次の Node.js を想定しています。

```text
^22.19.0 または >=24.0.0
```

`pnpm oh-my-dsh doctor` で Node.js、DSHソース、overlay、DeepSeek APIキーの状態を確認できます。

## ファイル

- `scripts/oh-my-dsh.ts` — 起動ラッパー
- `scripts/oh-my-dsh/web.patch.yml` — Web向け設定
- `scripts/oh-my-dsh/headless.patch.yml` — headless向け設定
- `scripts/oh-my-dsh.spec.ts` — ラッパーのテスト
- `OH_MY_DSH.md` — 英語ドキュメント
- `OH_MY_DSH.ja.md` — 日本語ドキュメント
