import os
import json
import argparse
import asyncio
from google.adk import Workflow, Event, Agent
from google.adk.apps import App
from google.adk.runners import InMemoryRunner
from pydantic import BaseModel

# 状態デカップリング用のヘルパー関数
def read_node_input(node_input: str) -> dict:
    """
    入力がファイルパスである場合は、JSONとして読み込み辞書を返します。
    ファイルパスでない、または読み込みに失敗した場合は、文字列を含めた辞書を返します。
    """
    if not node_input:
        return {}
    if os.path.exists(node_input):
        try:
            with open(node_input, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[Warning] Failed to read temporary file {node_input}: {e}")
    
    # フォールバック: 生の入力文字列を辞書化して返す
    return {"raw_input": node_input}

def write_node_output(data: dict, step_name: str) -> str:
    """
    出力データを一時JSONファイルに書き出し、その絶対パスを返します。
    """
    os.makedirs("./temp_workflow_data", exist_ok=True)
    temp_filepath = os.path.abspath(f"./temp_workflow_data/temp_{step_name}.json")
    with open(temp_filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return temp_filepath

# --- NODE DEFINITIONS START ---
# scaffold_workflow.pyによって生成された各ノードのコードが以下に挿入されます。
def requirement_analysis(node_input: str) -> Event:
    data = read_node_input(node_input)
    print("\n=== [Phase 1: Requirement Analysis] ===")
    print("大容量JSONデータを含むCSVファイルの閲覧・編集機能を分析中...")
    data["phase"] = "implementation"
    data["bugs"] = []
    data["test_results"] = "pending"
    data["iteration"] = 1
    out_path = write_node_output(data, "requirement_analysis")
    return Event(output=out_path)

def code_implementation(node_input: str) -> Event:
    data = read_node_input(node_input)
    print(f"\n=== [Phase 2: Code Implementation (Iteration {data.get('iteration', 1)})] ===")
    if data.get("bugs"):
        print(f"検出された不具合を修正中: {data['bugs']}")
        data["bugs"] = []
    else:
        print("新規コードの実装（拡張機能本体、Webview、大容量パースロジック）を実行中...")
    data["phase"] = "build_and_test"
    out_path = write_node_output(data, "code_implementation")
    return Event(output=out_path)

def build_and_test(node_input: str) -> Event:
    from google.adk.events import EventActions
    data = read_node_input(node_input)
    iteration = data.get("iteration", 1)
    print(f"\n=== [Phase 3: Build & Test (Iteration {iteration})] ===")
    print("拡張機能のビルド、自動テストの実行中...")
    if iteration == 1:
        data["test_results"] = "failed"
        data["bugs"] = ["大容量CSV of JSON読み込み時のフリーズ", "一部セルのパースエラー"]
        print("-> [TEST FAILED] テスト失敗。不具合を検出しました。")
        route_name = "fail"
    else:
        data["test_results"] = "passed"
        print("-> [TEST PASSED] ビルドおよびテストが正常に完了しました。")
        route_name = "pass"
    data["phase"] = "test_evaluation"
    out_path = write_node_output(data, "build_and_test")
    return Event(output=out_path, actions=EventActions(route=route_name))

def debug_and_fix(node_input: str) -> Event:
    data = read_node_input(node_input)
    print("\n=== [Phase 4: Debug & Fix] ===")
    print(f"不具合の原因を特定中: {data.get('bugs')}")
    print("仮想スクロールの導入、およびストリームパースエラーの例外処理を追加します。")
    data["iteration"] = data.get("iteration", 1) + 1
    data["phase"] = "implementation"
    out_path = write_node_output(data, "debug_and_fix")
    return Event(output=out_path)

def user_validation(node_input: str) -> Event:
    data = read_node_input(node_input)
    print("\n=== [Phase 5: User Validation] ===")
    print("ユーザーの要件（大容量データの快適な閲覧、編集、保存）との整合性を検証中...")
    data["phase"] = "completed"
    print("-> [SUCCESS] 拡張機能の開発がユーザー要件を満たしました。")
    out_path = write_node_output(data, "user_validation")
    return Event(output=out_path)
# --- NODE DEFINITIONS END ---

# --- WORKFLOW GRAPH START ---
# scaffold_workflow.pyによって有向エッジとWorkflowオブジェクトが定義されます。

root_agent = Workflow(
    name="iterative_development_workflow",
    edges=[
        ("START", requirement_analysis),
        (requirement_analysis, code_implementation),
        (code_implementation, build_and_test),
        (build_and_test, {'fail': debug_and_fix, 'pass': user_validation}),
        (debug_and_fix, code_implementation)
    ]
)

# --- WORKFLOW GRAPH END ---

app = App(
    name="iterative_development_workflow_app",
    root_agent=root_agent
)

async def run_main():
    parser = argparse.ArgumentParser(description="Run iterative-development-workflow workflow.")
    parser.add_argument("--input", required=True, help="Input raw text or path to input JSON file")
    parser.add_argument("--output", default="output.json", help="Output file path for the workflow results")
    args = parser.parse_args()
    
    runner = InMemoryRunner(app=app)
    
    try:
        # ワークフローの実行
        result = await runner.run_debug(args.input)
        print("Workflow completed successfully.")
        print(f"Final output pointer/result: {result}")
        
        # 最終結果が一時ファイルパスであれば、中身を読み取って出力ファイルに保存する
        output_data = {}
        if isinstance(result, str) and os.path.exists(result):
            output_data = read_node_input(result)
        else:
            output_data = {"result": str(result)}
            
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)
        print(f"Results written to: {args.output}")
            
    except Exception as e:
        print(f"Error during workflow execution: {e}")
        raise e

if __name__ == "__main__":
    asyncio.run(run_main())
