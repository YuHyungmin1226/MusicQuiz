import assert from 'node:assert/strict';
import test from 'node:test';

import { validateStaff } from './staff_integrity.mjs';

const note = (id, overrides = {}) => ({
  type: 'note',
  id,
  pitch: 'C4',
  duration: 'eighth',
  ...overrides
});

const staff = elements => ({
  type: 'staff',
  label: '검증용 오선보',
  elements
});

test('validateStaff accepts optional note IDs and resolves relations after collecting every note', () => {
  // Given: a relation appears before its referenced notes, while another note has no ID.
  const notation = staff([
    { type: 'tie', from: 'first', to: 'second', placement: 'below' },
    note(undefined, { pitch: 'D4', duration: 'quarter' }),
    note('first'),
    note('second')
  ]);

  // When: the staff is validated.
  const errors = validateStaff(notation, 'fixture');

  // Then: validation is order-independent and unreferenced IDs remain optional.
  assert.deepEqual(errors, []);
});

test('validateStaff rejects malformed IDs, relations, dots, placement, tuplets, and beams', () => {
  // Given: one focused malformed staff fixture for every release-blocking contract.
  const cases = [
    ['empty note ID', staff([note('')]), 'note ID must be a non-empty string'],
    ['non-string note ID', staff([note(4)]), 'note ID must be a non-empty string'],
    ['duplicate note ID', staff([note('same'), note('same')]), 'duplicate note ID "same"'],
    ['missing tie endpoint', staff([{ type: 'tie', from: 'missing', to: 'last' }, note('last')]), 'relation endpoints must reference existing note IDs'],
    ['missing slur endpoint', staff([{ type: 'slur', from: 'missing', to: 'last' }, note('last', { pitch: 'D4' })]), 'relation endpoints must reference existing note IDs'],
    ['missing tuplet endpoint', staff([{ type: 'tuplet', from: 'missing', to: 'last', number: 3 }, note('last')]), 'relation endpoints must reference existing note IDs'],
    ['invalid relation placement', staff([note('first'), note('last', { pitch: 'D4' }), { type: 'slur', from: 'first', to: 'last', placement: 'left' }]), 'placement must be "above" or "below"'],
    ['negative note dots', staff([note(undefined, { dots: -1 })]), 'dots must be a finite non-negative integer'],
    ['fractional rest dots', staff([{ type: 'rest', duration: 'quarter', dots: 1.5 }]), 'dots must be a finite non-negative integer'],
    ['NaN dots', staff([note(undefined, { dots: Number.NaN })]), 'dots must be a finite non-negative integer'],
    ['infinite dots', staff([{ type: 'rest', duration: 'quarter', dots: Number.POSITIVE_INFINITY }]), 'dots must be a finite non-negative integer'],
    ['invalid tuplet number', staff([note('first'), note('last'), { type: 'tuplet', from: 'first', to: 'last', number: 10 }]), 'tuplet number must be an integer from 2 to 9'],
    ['empty beam ID', staff([note(undefined, { beam: ' ' }), note(undefined, { beam: ' ' })]), 'beam ID must be a non-empty string'],
    ['one-note beam group', staff([note(undefined, { beam: 'solo' })]), 'beam group "solo" must contain at least 2 notes']
  ];

  // When / Then: each malformed fixture is rejected for its semantic contract.
  for (const [name, notation, expected] of cases) {
    assert.equal(validateStaff(notation, name).some(error => error.includes(expected)), true, name);
  }
});
