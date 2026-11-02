// DynamoDB-backed chat sessions and usage limits for the deployed site. One table, keyed by `pk`.
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { createHash } from 'node:crypto'
import type { Session } from './assistant'
import type { SessionStore } from './handler'

const DAY = 86_400
const now = () => Math.floor(Date.now() / 1000)

export function makeDynamo(table: string) {
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))

  const sessions: SessionStore = {
    async get(id) {
      const { Item } = await db.send(new GetCommand({ TableName: table, Key: { pk: `session#${id}` } }))
      return Item ? (JSON.parse(Item.data as string) as Session) : undefined
    },
    async put(id, s) {
      // Chats are kept 30 days (the footer says so); the table's TTL deletes them after that.
      // ponytail: a 20-turn chat is roughly 150 KB, under the 400 KB item limit; trim history if turns go up.
      await db.send(new PutCommand({ TableName: table, Item: { pk: `session#${id}`, data: JSON.stringify(s), expires: now() + 30 * DAY } }))
    },
  }

  /** Counts one turn against a daily cap. False once the cap is reached. */
  async function count(key: string, cap: number) {
    try {
      await db.send(
        new UpdateCommand({
          TableName: table,
          Key: { pk: key },
          UpdateExpression: 'ADD n :one SET expires = if_not_exists(expires, :exp)',
          ConditionExpression: 'attribute_not_exists(n) OR n < :cap',
          ExpressionAttributeValues: { ':one': 1, ':cap': cap, ':exp': now() + 2 * DAY },
        }),
      )
      return true
    } catch (e) {
      if ((e as Error).name === 'ConditionalCheckFailedException') return false
      throw e
    }
  }

  /** Per-visitor and whole-site daily caps. Returns a message to show when over, or null. */
  async function limit(ip: string, caps: { perVisitor: number; perDay: number }) {
    const date = new Date().toISOString().slice(0, 10)
    // Only a salted hash of the IP is stored, and it expires in 2 days.
    const visitor = createHash('sha256').update(`tonightly:${ip}`).digest('hex').slice(0, 16)
    if (!(await count(`limit#visitor#${visitor}#${date}`, caps.perVisitor))) return "You've reached today's limit for the assistant. Browsing still works."
    if (!(await count(`limit#site#${date}`, caps.perDay))) return 'The assistant is resting for today. Browsing still works.'
    return null
  }

  return { sessions, limit }
}
