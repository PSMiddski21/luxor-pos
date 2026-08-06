import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  type Field,
  type SqlParameter,
} from '@aws-sdk/client-rds-data';

const client = new RDSDataClient({});

const resourceArn = process.env.CLUSTER_ARN!;
const secretArn = process.env.SECRET_ARN!;
const database = process.env.DATABASE_NAME!;

export type SqlValue = string | number | boolean | null;
export type SqlParams = Record<string, SqlValue>;

const toField = (value: SqlValue): Field => {
  if (value === null) return { isNull: true };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { longValue: value } : { doubleValue: value };
  return { stringValue: value };
};

const toSqlParameters = (params: SqlParams): SqlParameter[] =>
  Object.entries(params).map(([name, value]) => ({ name, value: toField(value) }));

const fieldToValue = (field: Field): unknown => {
  if (field.isNull) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  return null;
};

export interface QueryOptions {
  transactionId?: string;
}

// Runs one statement and returns rows as plain objects keyed by column name.
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: SqlParams = {},
  options: QueryOptions = {},
): Promise<T[]> {
  const result = await client.send(
    new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql,
      parameters: toSqlParameters(params),
      includeResultMetadata: true,
      transactionId: options.transactionId,
    }),
  );

  const columns = result.columnMetadata ?? [];
  return (result.records ?? []).map((record) => {
    const row: Record<string, unknown> = {};
    record.forEach((field, i) => {
      const name = columns[i]?.name ?? `col${i}`;
      row[name] = fieldToValue(field);
    });
    return row as T;
  });
}

// Runs `work` inside a Data API transaction, committing on success and
// rolling back on any thrown error.
export async function withTransaction<T>(
  work: (transactionId: string) => Promise<T>,
): Promise<T> {
  const { transactionId } = await client.send(
    new BeginTransactionCommand({ resourceArn, secretArn, database }),
  );
  if (!transactionId) throw new Error('Failed to start transaction');

  try {
    const result = await work(transactionId);
    await client.send(new CommitTransactionCommand({ resourceArn, secretArn, transactionId }));
    return result;
  } catch (err) {
    await client.send(new RollbackTransactionCommand({ resourceArn, secretArn, transactionId }));
    throw err;
  }
}
