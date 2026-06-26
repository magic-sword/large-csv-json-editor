---
name: iterative-development-workflow
description: |
  VS Code拡張機能の開発において、コード実装、ビルド・テスト、デバッグ・不具合修正、ユーザー要件検証のフェーズを繰り返し、要件を満たすまで反復開発を行うワークフローです。
version: 1.0.0
license: MIT
allowed-tools:
  - write_to_file
  - replace_file_content
  - run_command
  - view_file
adk-version: 2.3.0
require-latest-adk-validation: true
---

## When to use
- VS Code拡張機能の開発において、コード実装から不具合修正、要件検証までの全体的なライフサイクルをループ処理したい場合に使用します。

## When NOT to use
- 個別のTypeScript実装やUI作成などの単一タスクを行う場合は使用しないでください。

## Workflow
1. `requirement_analysis` で要件を整理します。
2. `code_implementation` で機能の実装やバグ修正を行います。
3. `build_and_test` でビルドとテストを回し、結果によって `debug_and_fix` (失敗) または `user_validation` (成功) に分岐します。
4. `debug_and_fix` では不具合をデバッグし、コード実装フェーズにループバックします。
5. `user_validation` で要件定義との一致を確認し、完了します。
