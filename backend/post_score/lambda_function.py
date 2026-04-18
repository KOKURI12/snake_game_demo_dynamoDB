import json
import os
import boto3
import redis
from datetime import datetime, timezone
from decimal import Decimal
from boto3.dynamodb.conditions import Key

# ── DynamoDB クライアント（コンテナ再利用で接続コスト削減）
dynamodb = boto3.resource('dynamodb')
table    = dynamodb.Table(os.environ['TABLE_NAME'])

# ── Redis クライアント（コンテナ再利用で接続コスト削減）
redis_client = redis.Redis(
    host=os.environ['REDIS_HOST'],
    port=int(os.environ['REDIS_PORT']),
    decode_responses=True,  # bytes→str自動変換
)

CACHE_KEY = 'ranking:top10'           # Hot Key（TTLなし・LFUで保護）
CACHE_TTL = int(os.environ['CACHE_TTL'])  # 通常キャッシュのTTL（秒）

# ── GSI 設定（template.yaml 側で定義）
GSI_NAME     = os.environ['GSI_NAME']
GSI_PK_NAME  = os.environ['GSI_PK_NAME']
GSI_PK_VALUE = os.environ['GSI_PK_VALUE']

CORS_HEADERS = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': os.environ.get('ALLOW_ORIGIN', '*'),
}

# TEST DEPLOY TRIGGER (temporary):
# print('post_score lambda deployed for UI behavior verification')


def lambda_handler(event, context):
    try:
        body = json.loads(event.get('body') or '{}')

        player_name   = str(body.get('player_name', 'ANONYMOUS')).strip()[:20]
        new_score     = int(body.get('score', 0))
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
                'headers':    CORS_HEADERS,
                'body':       json.dumps({'rank': rank, 'updated': False}),
            }

        # 新しい最高スコアをDynamoDBに登録（Write Through: ① DB書き込み）
        # gsi_pk は固定値。GSI (gsi_pk, score) でランキング Query を可能にする
        created_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S')
        table.put_item(Item={
            'player_name':   player_name,
            'score':         Decimal(str(new_score)),
            'level_reached': Decimal(str(level_reached)),
            'created_at':    created_at,
            GSI_PK_NAME:     GSI_PK_VALUE,
        })

        # Write Through: ② Redisキャッシュを無効化（次のGET時にLazy Loadingで再構築）
        _invalidate_cache()

        rank = _get_rank(new_score)
        return {
            'statusCode': 201,
            'headers':    CORS_HEADERS,
            'body':       json.dumps({'rank': rank, 'updated': True}),
        }

    except Exception as e:
        print(f'ERROR: {e}')
        return {
            'statusCode': 500,
            'headers':    CORS_HEADERS,
            'body':       json.dumps({'error': 'Internal server error'}),
        }


def _get_rank(score: int) -> int:
    """GSI を Query して指定スコアより高いレコード数 + 1 を返す"""
    response = table.query(
        IndexName=GSI_NAME,
        KeyConditionExpression=(
            Key(GSI_PK_NAME).eq(GSI_PK_VALUE) & Key('score').gt(Decimal(str(score)))
        ),
        Select='COUNT',
    )
    return response.get('Count', 0) + 1


def _invalidate_cache():
    """ランキングキャッシュを無効化（スコア更新時に呼び出す）"""
    try:
        redis_client.delete(CACHE_KEY)
        print(f'Cache invalidated: {CACHE_KEY}')
    except Exception as e:
        # Redis障害時もDynamoDB書き込みは成功しているので処理継続
        print(f'Cache invalidation failed (non-fatal): {e}')