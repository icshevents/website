import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBiginMembershipValidity, resolvePaidMembershipValidity } from '../lib/membership-validity.ts';

test('Bigin creation time produces a provisional twelve-calendar-month period', () => {
  assert.deepEqual(resolveBiginMembershipValidity({ createdTime: '2026-10-22T10:30:00+01:00' }, '2026-10-22'), {
    status: 'current', startDate: '2026-10-22', expiryDate: '2027-10-22', source: 'bigin_created_time', provisional: true,
  });
});

test('year-end membership expires on its next anniversary, not the current calendar year end', () => {
  const result = resolvePaidMembershipValidity('2026-12-31T12:00:00Z', '2027-06-01');
  assert.equal(result.status, 'current');
  assert.equal(result.startDate, '2026-12-31');
  assert.equal(result.expiryDate, '2027-12-31');
});

test('calendar anniversaries handle leap days and leap years without adding a fixed 365 days', () => {
  assert.equal(resolvePaidMembershipValidity('2024-02-29T12:00:00Z', '2024-03-01').expiryDate, '2025-02-28');
  assert.equal(resolvePaidMembershipValidity('2023-03-01T12:00:00Z', '2023-03-01').expiryDate, '2024-03-01');
  assert.equal(resolvePaidMembershipValidity('2023-02-28T12:00:00Z', '2023-02-28').expiryDate, '2024-02-28');
});

test('full timestamp offsets and London daylight saving determine the start date', () => {
  for (const [timestamp, date] of [
    ['2026-06-01T23:30:00Z', '2026-06-02'],
    ['2026-12-01T23:30:00Z', '2026-12-01'],
    ['2026-03-29T23:30:00Z', '2026-03-30'],
    ['2026-10-25T23:30:00Z', '2026-10-25'],
    ['2026-01-01T00:30:00+01:00', '2025-12-31'],
    ['2026-10-22T00:30:00+02:00', '2026-10-21'],
    ['2026-01-01T00:00:00.123456789Z', '2026-01-01'],
  ]) {
    assert.equal(resolveBiginMembershipValidity({ createdTime: timestamp }, date).startDate, date, timestamp);
    assert.equal(resolvePaidMembershipValidity(timestamp, date).startDate, date, timestamp);
  }
});

test('a valid corrected start takes precedence and immediately recomputes expiry', () => {
  const input = { createdTime: '2024-03-01T12:00:00Z', correctedStartDate: '2026-08-15' };
  assert.deepEqual(resolveBiginMembershipValidity(input, '2026-10-22'), {
    status: 'current', startDate: '2026-08-15', expiryDate: '2027-08-15', source: 'corrected_start_date', provisional: false,
  });
  const correctedAgain = resolveBiginMembershipValidity({ ...input, correctedStartDate: '2026-09-20' }, '2026-10-22');
  assert.equal(correctedAgain.startDate, '2026-09-20');
  assert.equal(correctedAgain.expiryDate, '2027-09-20');
  assert.equal(input.correctedStartDate, '2026-08-15');
  assert.equal(resolveBiginMembershipValidity({ correctedStartDate: '2026-09-20', createdTime: 'invalid' }, '2026-10-22').status, 'current');
});

test('blank or null corrections fall back, but invalid nonempty corrections fail closed', () => {
  for (const correctedStartDate of [undefined, null, '', '  \n']) {
    const result = resolveBiginMembershipValidity({ correctedStartDate, createdTime: '2026-03-01T12:00:00Z' }, '2026-10-22');
    assert.equal(result.source, 'bigin_created_time');
    assert.equal(result.provisional, true);
  }
  for (const correctedStartDate of ['2026-02-30', '22/10/2026', '2026-10-22T00:00:00Z', ' 2026-10-22 ', 20261022, false, {}]) {
    const result = resolveBiginMembershipValidity({ correctedStartDate, createdTime: '2026-03-01T12:00:00Z' }, '2026-10-22');
    assert.equal(result.status, 'unresolved', String(correctedStartDate));
    assert.ok(result.reason);
    assert.ok(!('startDate' in result));
  }
});

test('a newly verified payment creates a fresh term independently of old corrections', () => {
  const existing = resolveBiginMembershipValidity({ correctedStartDate: '2025-01-01' }, '2026-10-22');
  assert.equal(existing.status, 'expired');
  assert.deepEqual(resolvePaidMembershipValidity('2026-10-22T12:00:00Z', '2026-10-22'), {
    status: 'current', startDate: '2026-10-22', expiryDate: '2027-10-22', source: 'verified_payment', provisional: false,
  });
});

test('the start is inclusive and the renewal boundary is exclusive for all sources', () => {
  const resolvers = [
    on => resolveBiginMembershipValidity({ createdTime: '2026-10-22T12:00:00Z' }, on),
    on => resolveBiginMembershipValidity({ correctedStartDate: '2026-10-22' }, on),
    on => resolvePaidMembershipValidity('2026-10-22T12:00:00Z', on),
  ];
  for (const resolve of resolvers) {
    assert.equal(resolve('2026-10-21').status, 'not_started');
    assert.equal(resolve('2026-10-22').status, 'current');
    assert.equal(resolve('2027-10-21').status, 'current');
    assert.equal(resolve('2027-10-22').status, 'expired');
    assert.equal(resolve('2027-10-23').status, 'expired');
  }
  assert.equal(resolvePaidMembershipValidity('2024-02-29T12:00:00Z', '2025-02-28').status, 'expired');
});

test('missing, zoneless, impossible or noncanonical timestamps are unresolved', () => {
  for (const timestamp of [
    undefined, null, '', 1792670400, new Date('2026-10-22T12:00:00Z'), {},
    '2026-10-22', '2026-10-22T12:00:00', '2026-10-22 12:00:00Z', '2026-10-22T12:00Z',
    '2026-02-29T12:00:00Z', '2026-02-30T12:00:00Z', '2026-06-31T12:00:00Z',
    '2026-13-01T12:00:00Z', '2026-01-00T12:00:00Z', '2026-01-01T24:00:00Z',
    '2026-01-01T12:60:00Z', '2026-01-01T12:00:60Z', '2026-01-01T12:00:00+24:00',
    '2026-01-01T12:00:00+01:60', ' 2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z\n',
  ]) {
    assert.equal(resolveBiginMembershipValidity({ createdTime: timestamp }, '2026-10-22').status, 'unresolved', String(timestamp));
    assert.equal(resolvePaidMembershipValidity(timestamp, '2026-10-22').status, 'unresolved', String(timestamp));
  }
});

test('an invalid reference date cannot produce current validity', () => {
  for (const on of ['', null, '2026-02-30', '22/10/2026', '2026-10-22T00:00:00Z', '2026-1-1', '0000-01-01']) {
    assert.equal(resolveBiginMembershipValidity({ correctedStartDate: '2026-01-01' }, on).status, 'unresolved');
    assert.equal(resolvePaidMembershipValidity('2026-01-01T12:00:00Z', on).status, 'unresolved');
  }
});

test('unsupported anniversary ranges fail closed and date results do not assert identity or payment', () => {
  assert.equal(resolveBiginMembershipValidity({ correctedStartDate: '9999-01-01' }, '9999-01-01').status, 'unresolved');
  const result = resolvePaidMembershipValidity('2026-10-22T12:00:00Z', '2026-10-22');
  assert.deepEqual(Object.keys(result).sort(), ['expiryDate', 'provisional', 'source', 'startDate', 'status']);
});
