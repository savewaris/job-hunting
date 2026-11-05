import { beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '@/lib/sql';
import { getSettings, updateSettings } from '@/domain/settings/repo';
import { createTestDb } from '../helpers/testDb';

let sql: Sql;

beforeEach(async () => {
  sql = await createTestDb();
});

describe('settings', () => {
  it('getSettings returns off and 20', async () => {
    expect(await getSettings(sql)).toEqual({ scheduleEnabled: false, maxDailyDrafts: 20 });
  });

  it('updateSettings persists a valid maxDailyDrafts and never touches scheduleEnabled', async () => {
    const updated = await updateSettings(sql, { maxDailyDrafts: 50 });
    expect(updated).toEqual({ scheduleEnabled: false, maxDailyDrafts: 50 });
    expect(await getSettings(sql)).toEqual({ scheduleEnabled: false, maxDailyDrafts: 50 });
  });

  it('updateSettings accepts the bounds 1 and 200', async () => {
    expect((await updateSettings(sql, { maxDailyDrafts: 1 })).maxDailyDrafts).toBe(1);
    expect((await updateSettings(sql, { maxDailyDrafts: 200 })).maxDailyDrafts).toBe(200);
  });

  it('updateSettings rejects 0, 201 and 2.5', async () => {
    for (const bad of [0, 201, 2.5, NaN, Infinity, -3]) {
      await expect(updateSettings(sql, { maxDailyDrafts: bad })).rejects.toThrow(RangeError);
    }
    await expect(updateSettings(sql, { maxDailyDrafts: 0 })).rejects.toThrow(
      'maxDailyDrafts must be an integer between 1 and 200',
    );
    expect((await getSettings(sql)).maxDailyDrafts).toBe(20);
  });

  it('updateSettings rejects a non-number value', async () => {
    await expect(
      updateSettings(sql, { maxDailyDrafts: '5' as unknown as number }),
    ).rejects.toThrow(RangeError);
  });

  it('an empty patch returns the current settings unchanged', async () => {
    await updateSettings(sql, { maxDailyDrafts: 7 });
    expect(await updateSettings(sql, {})).toEqual({ scheduleEnabled: false, maxDailyDrafts: 7 });
  });
});
