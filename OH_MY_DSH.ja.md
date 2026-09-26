# oh-my-dsh

[English](OH_MY_DSH.md) | 日本語

`oh-my-dsh` は、このフォーク向けの terminal-first な DeepSeek Harness 拡張です。上流の `dsh` を唯一のアプリケーションランチャーとして維持し、その上に軽量TUI、独自Webプリセット、役割別の継続可能サブエージェント、モデルルーティングを追加します。

## すぐ使う

```sh
pnpm install

# TUI。引数なしの既定動作
pnpm oh-my-dsh

# Web UI
pnpm oh-my-dsh web --no-open

# headlessで一発実行
pnpm oh-my-dsh ask "失敗しているテストを調べて修正して"

# 環境診断
pnpm oh-my-dsh doctor
```

## TUI

`pnpm oh-my-dsh` は、DSH標準の headless JSON プロトコル上に軽量な対話UIを起動します。

各ターンは独立した短命headlessプロセスですが、同じ永続Session IDを引き継ぐため、別のAgent runtimeを作らずに会話を継続できます。ツール呼び出し・ツール結果・短縮したreasoningを端末内に表示します。

組み込みコマンド:

```text
/help
/new
/session
/routes
/route <role> <provider>/<model> [effort]
/route <role> inherit
/exit
```

`/new` で新しいセッションを始め、`/session` で現在のSession IDを確認できます。

## 独自プリセット

Webでは `oh-my-dsh` という独自Agent presetを既定にします。

PTCを使った通常のcoding環境に加えて、Workflow、Ralph、Cordis inspection、plugin management、役割別サブエージェントをまとめて有効にしています。

役割は次のとおりです。

- `scout` — 読み取り中心の高速調査。ファイル・シンボル・リスク・根拠を集める。
- `worker` — 実装担当。割り当てられた範囲を変更し、関連チェックまで実行する。
- `reviewer` — correctness / security / regression / test の観点から疑ってレビューする。
- `architect` — 境界、data flow、API、failure mode、性能、移行コストを見る。
- `subagent` — 汎用のfresh child。
- `subagent_fork` — 親の完了済み会話を引き継ぐchild。

各roleは continuable なので、DSHの既存subagent controlとWebのsubagent UIから継続・監視できます。

## モデルルーティング

roleごとに別モデルへ振れます。指定がなければ親Agentのモデルを継承します。

TUIから変更する例:

```text
/route worker openrouter/anthropic/claude-sonnet-4 high
/route reviewer openrouter/openai/gpt-5 high
/route scout inherit
```

Webやheadless起動前に環境変数で設定することもできます。

```sh
export OMDSH_MAIN_PROVIDER=deepseek-official
export OMDSH_MAIN_MODEL=deepseek-flash

export OMDSH_SCOUT_PROVIDER=openrouter
export OMDSH_SCOUT_MODEL=google/gemini-2.5-flash

export OMDSH_WORKER_PROVIDER=openrouter
export OMDSH_WORKER_MODEL=anthropic/claude-sonnet-4
export OMDSH_WORKER_EFFORT=high

export OMDSH_REVIEWER_PROVIDER=openrouter
export OMDSH_REVIEWER_MODEL=openai/gpt-5
export OMDSH_REVIEWER_EFFORT=high
```

利用できるprefixは次の5つです。

```text
OMDSH_MAIN_*
OMDSH_SCOUT_*
OMDSH_WORKER_*
OMDSH_REVIEWER_*
OMDSH_ARCHITECT_*
```

それぞれ `_PROVIDER`、`_MODEL`、任意の `_EFFORT` を使います。

指定するprovider routeはDSH側に登録済みである必要があります。OpenRouterなどは既存のModels / `llm-pi-ai` 設定をそのまま利用できます。

main routeの変更は新規Sessionに適用されます。TUIでmainを変えた場合は `/new` を実行してください。

## Web側の追加設定

独自presetに加えて、Webでは次も有効化します。

- Schedule
- 全文Session検索
- `$DSH_HOME/session-search.sqlite` への永続SQLite index

全文検索indexは最初の検索時に開きます。Web UIから保存したpreset選択はdeployment側の既定値より優先されます。

## 構成

```text
oh-my-dsh TUI
  └─ dsh --profile headless --json
      └─ 永続Session IDで会話継続

oh-my-dsh Web
  └─ dsh --profile web
      └─ oh-my-dsh preset
          ├─ scout
          ├─ worker
          ├─ reviewer
          └─ architect
```

独自Agent loopや別Harness runtimeは追加していません。フォーク固有差分を `scripts/oh-my-dsh/` に寄せ、上流変更を取り込みやすい状態を維持します。

## Node.js

このリポジトリと同じ要件です。

```text
^22.19.0 または >=24.0.0
```

`pnpm oh-my-dsh doctor` でNode.js、DSHソース、overlay、TUI、DeepSeek APIキーの状態を確認できます。

## 主なファイル

- `scripts/oh-my-dsh.ts` — 起動ディスパッチ
- `scripts/oh-my-dsh/tui.ts` — 対話TUI
- `scripts/oh-my-dsh/routes.ts` — role別モデルルーティング
- `scripts/oh-my-dsh/web.patch.yml` — 独自Web presetとWeb設定
- `scripts/oh-my-dsh/headless.patch.yml` — headless向けrole構成
- `scripts/oh-my-dsh.spec.ts` — launcher / routing / patchテスト
