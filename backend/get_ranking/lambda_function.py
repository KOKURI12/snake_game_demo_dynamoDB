import json
import os
import boto3
import redis
from boto3.dynamodb.conditions import Key

# ── DynamoDB クライアント（コンテナ再利用で接続コスト削減）
dynamodb = boto3.resource('dynamodb')
table    = dynamodb.Table(os.environ['TABLE_NAME'])

# ── Redis クライアント（コンテナ再利用で接続コスト削減）
redis_client = redis.Redis(
    host=os.environ['REDIS_HOST'],
    port=int(os.environ['REDIS_PORT']),
    decode_responses=True,
)

CACHE_KEY     = 'ranking:top10'           # Hot Key（TTLなし・LFUで保護）
CACHE_TTL     = int(os.environ['CACHE_TTL'])
DEFAULT_LIMIT = 10
MAX_LIMIT     = 100

# ── GSI 設定（template.yaml 側で定義）
GSI_NAME     = os.environ['GSI_NAME']
GSI_PK_NAME  = os.environ['GSI_PK_NAME']
GSI_PK_VALUE = os.environ['GSI_PK_VALUE']

CORS_HEADERS = {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': os.environ.get('ALLOW_ORIGIN', '*'),
}


def lambda_handler(event, context):
    try:
        params = event.get('queryStringParameters') or {}
        limit  = min(int(params.get('limit', DEFAULT_LIMIT)), MAX_LIMIT)

        # ── Lazy Loading: まずRedisを確認
        cached = redis_client.get(CACHE_KEY)
        if cached:
            print('Cache HIT: ranking:top10')
            ranking = json.loads(cached)
            # limit分だけ切り出して返す
            return {
                'statusCode': 200,
                'headers':    CORS_HEADERS,
                'body':       json.dumps(ranking[:limit], ensure_ascii=False),
            }

        # ── Cache MISS: GSI を Query して Top N のみ取得
        print(f'Cache MISS: ranking:top10 → query GSI {GSI_NAME}')
        response = table.query(
            IndexName=GSI_NAME,
            KeyConditionExpression=Key(GSI_PK_NAME).eq(GSI_PK_VALUE),
            ScanIndexForward=False,   # score 降順
            Limit=MAX_LIMIT,
        )
        items = response.get('Items', [])

        # 同スコア内の順序は GSI では不定のため、created_at 昇順で安定化
        items.sort(
            key=lambda x: (-int(x['score']), x.get('created_at', ''))
        )

        ranking = [
            {
                'rank':          i,
                'player_name':   item['player_name'],
                'score':         int(item['score']),
                'level_reached': int(item.get('level_reached', 1)),
                'played_at':     item.get('created_at', ''),
            }
            for i, item in enumerate(items, start=1)
        ]

        # ── Redisに保存（TTL付きキャッシュ）
        redis_client.set(CACHE_KEY, json.dumps(ranking, ensure_ascii=False), ex=CACHE_TTL)
        print(f'Cache SET: ranking:top10 ({len(ranking)} items, TTL: {CACHE_TTL}s)')

        return {
            'statusCode': 200,
            'headers':    CORS_HEADERS,
            'body':       json.dumps(ranking[:limit], ensure_ascii=False),
        }

    except Exception as e:
        print(f'ERROR: {e}')
        return {
            'statusCode': 500,
            'headers':    CORS_HEADERS,
            'body':       json.dumps({'error': 'Internal server error'}),
        }