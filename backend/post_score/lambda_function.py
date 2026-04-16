import json
import os
import boto3
from decimal import Decimal

# DynamoDB クライアント（コンテナ再利用時の接続コスト削減）
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

CORS_HEADERS = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': os.environ.get('ALLOW_ORIGIN', '*'),
}

DEFAULT_LIMIT = 10
MAX_LIMIT     = 100


def lambda_handler(event, context):
    try:
        params = event.get('queryStringParameters') or {}
        limit  = min(int(params.get('limit', DEFAULT_LIMIT)), MAX_LIMIT)

        # 全件スキャン → score 降順・同点は created_at 昇順でソート
        response = table.scan()
        items    = response.get('Items', [])

        # ページネーション対応（件数が多い場合）
        while 'LastEvaluatedKey' in response:
            response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
            items.extend(response.get('Items', []))

        # ソート：score 降順 → created_at 昇順（同点タイブレーク）
        items.sort(
            key=lambda x: (-int(x['score']), x.get('created_at', ''))
        )

        # ランキング付与・上位 N 件を返す
        ranking = []
        for i, item in enumerate(items[:limit], start=1):
            ranking.append({
                'rank':          i,
                'player_name':   item['player_name'],
                'score':         int(item['score']),
                'level_reached': int(item.get('level_reached', 1)),
                'played_at':     item.get('created_at', ''),
            })

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps(ranking, ensure_ascii=False),
        }

    except Exception as e:
        print(f'ERROR: {e}')
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': 'Internal server error'}),
        }
