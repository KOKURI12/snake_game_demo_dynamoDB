"""
既存の snake-game-scores-dev テーブルアイテムに gsi_pk 属性を追加する backfill スクリプト。

GSI (RankingIndex) 追加時点で既存アイテムには gsi_pk が無いため、
Query で取得できない問題を解消する。

使い方:
    python scripts/backfill_gsi.py --dry-run    # 件数確認のみ
    python scripts/backfill_gsi.py              # 実行
"""
import argparse
import time
import boto3
from botocore.exceptions import ClientError

# ===== 設定 =====
TABLE_NAME = "snake-game-scores-dev"
GSI_PK_NAME = "gsi_pk"
GSI_PK_VALUE = "ALL"
REGION = "ap-northeast-1"
# throttling 対策: 1件ごとの sleep (秒)
SLEEP_BETWEEN_WRITES = 0.05


def get_all_items(table):
    """全件取得(ページネーション対応)"""
    items = []
    scan_kwargs = {}
    while True:
        response = table.scan(**scan_kwargs)
        items.extend(response.get("Items", []))
        if "LastEvaluatedKey" not in response:
            break
        scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]
    return items


def needs_backfill(item):
    """gsi_pk が未設定のアイテムだけ対象"""
    return GSI_PK_NAME not in item


def backfill_item(table, item):
    """条件付き UpdateItem で gsi_pk を追加
    attribute_not_exists で並行実行時の上書きを防止(楽観ロック)
    """
    try:
        table.update_item(
            Key={"player_name": item["player_name"]},
            UpdateExpression=f"SET {GSI_PK_NAME} = :v",
            ConditionExpression=f"attribute_not_exists({GSI_PK_NAME})",
            ExpressionAttributeValues={":v": GSI_PK_VALUE},
        )
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            # すでに gsi_pk が付いている = スキップ
            return False
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="件数確認のみ")
    args = parser.parse_args()

    dynamodb = boto3.resource("dynamodb", region_name=REGION)
    table = dynamodb.Table(TABLE_NAME)

    print(f"[INFO] Scanning {TABLE_NAME} ...")
    all_items = get_all_items(table)
    target_items = [i for i in all_items if needs_backfill(i)]

    print(f"[INFO] Total items:    {len(all_items)}")
    print(f"[INFO] Needs backfill: {len(target_items)}")

    if args.dry_run:
        print("[INFO] dry-run mode, no writes performed.")
        return

    if not target_items:
        print("[INFO] Nothing to backfill. All items already have gsi_pk.")
        return

    print(f"[INFO] Starting backfill ...")
    success = 0
    skipped = 0
    for idx, item in enumerate(target_items, start=1):
        updated = backfill_item(table, item)
        if updated:
            success += 1
        else:
            skipped += 1
        if idx % 10 == 0:
            print(f"[PROGRESS] {idx}/{len(target_items)} processed")
        time.sleep(SLEEP_BETWEEN_WRITES)

    print(f"[DONE] success={success}, skipped={skipped}")


if __name__ == "__main__":
    main()
