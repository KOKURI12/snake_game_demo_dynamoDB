import json
import os
import boto3
from datetime import datetime, timezone
from decimal import Decimal

# DynamoDB クライアント（コンテナ再利用時の接続コスト削減）
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

CORS_HEADERS = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': os.environ.get('ALLOW_ORIGIN', '*'),
}


def lambda_handler(event, context):
    try:
        body = json.loads(event.get('body') or '{}')

        player_name  = str(body.get('player_name', 'ANONYMOUS')).strip()[:20]
        new_score    = int(body.get('score', 0))
        level_reached = int(body.get('level_reached', 1))

        if not player_name:
            player_name = 'ANONYMOUS'

        # 既存レコードを取得して最高スコアのみ保持
        existing = table.get_item(Key={'player_name': player_name}).get('Item')

        if existing and int(existing.get('score', 0)) >= new_score:
            # 既存スコアが同点以上 → 登録スキップ
            rank = _get_rank(new_score)
            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': json.dumps({'rank': rank, 'updated': False}),
            }

        # 新しい最高スコアを登録（上書き）
        created_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')
        table.put_item(Item={
            'player_name':   player_name,
            'score':         Decimal(str(new_score)),
            'level_reached': Decimal(str(level_reached)),
            'created_at':    created_at,
        })

        rank = _get_rank(new_score)
        return {
            'statusCode': 201,
            'headers': CORS_HEADERS,
            'body': json.dumps({'rank': rank, 'updated': True}),
        }

    except Exception as e:
        print(f'ERROR: {e}')
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': 'Internal server error'}),
        }


def _get_rank(score: int) -> int:
    """全件スキャンして指定スコアより高いレコード数 + 1 を返す"""
    response = table.scan(
        FilterExpression=boto3.dynamodb.conditions.Attr('score').gt(Decimal(str(score)))
    )
    return len(response.get('Items', [])) + 1
