import { describe, it, expect } from 'vitest';
import { toDateStamp, getLastWorkingDayStamp, isValidDateStamp, dateStampToRange } from './dates';

describe('dates', () => {
  describe('toDateStamp', () => {
    it('formats a local date as YYYY-MM-DD with zero padding', () => {
      expect(toDateStamp(new Date(2026, 0, 5, 23, 59, 0))).toBe('2026-01-05');
    });
  });

  describe('getLastWorkingDayStamp', () => {
    it('returns last Friday when now is a Monday', () => {
      // 2026-07-13 is a Monday.
      expect(getLastWorkingDayStamp(new Date(2026, 6, 13, 9, 0, 0))).toBe('2026-07-10');
    });

    it('returns yesterday for any non-Monday day', () => {
      // 2026-07-09 is a Thursday.
      expect(getLastWorkingDayStamp(new Date(2026, 6, 9, 9, 0, 0))).toBe('2026-07-08');
    });
  });

  describe('isValidDateStamp', () => {
    it('accepts a real YYYY-MM-DD date', () => {
      expect(isValidDateStamp('2026-07-09')).toBe(true);
    });

    it('rejects a malformed string', () => {
      expect(isValidDateStamp('not-a-date')).toBe(false);
    });

    it('rejects an impossible calendar date', () => {
      expect(isValidDateStamp('2026-02-30')).toBe(false);
    });
  });

  describe('dateStampToRange', () => {
    it('returns local midnight of the day and local midnight of the next day', () => {
      const { from, to } = dateStampToRange('2026-07-09');
      expect(from).toEqual(new Date(2026, 6, 9, 0, 0, 0, 0));
      expect(to).toEqual(new Date(2026, 6, 10, 0, 0, 0, 0));
    });

    it('rolls over month boundaries correctly', () => {
      const { to } = dateStampToRange('2026-07-31');
      expect(to).toEqual(new Date(2026, 7, 1, 0, 0, 0, 0));
    });
  });
});
