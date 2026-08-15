const pitches = /^[A-G](?:#|b)?[0-8]$/;
const durations = new Set(['whole', 'half', 'quarter', 'eighth', 'sixteenth']);
const barlines = new Set(['thin', 'final', 'repeat-start', 'repeat-end']);
const placements = new Set(['above', 'below']);

function validDots(dots) {
  return Number.isFinite(dots) && Number.isInteger(dots) && dots >= 0;
}

export function validateStaff(notation, location = 'staff') {
  const errors = [];
  if (!notation || notation.type !== 'staff') return errors;
  if (typeof notation.label !== 'string' || !notation.label.trim()) errors.push(`${location}: staff notation requires a label`);
  if (notation.clef !== undefined && notation.clef !== 'treble') errors.push(`${location}: unsupported clef "${notation.clef}"`);
  if (notation.time !== undefined && (!Array.isArray(notation.time) || notation.time.length !== 2 || notation.time.some(value => !Number.isInteger(value) || value < 1))) errors.push(`${location}: invalid time signature`);
  if (!Array.isArray(notation.elements) || notation.elements.length === 0) {
    errors.push(`${location}: staff elements must be non-empty`);
    return errors;
  }

  const notes = new Map();
  const beamCounts = new Map();
  for (const [index, element] of notation.elements.entries()) {
    const elementLocation = `${location}.elements[${index}]`;
    if (element.type === 'note') {
      if (!pitches.test(element.pitch)) errors.push(`${elementLocation}: invalid pitch "${element.pitch}"`);
      if (!durations.has(element.duration)) errors.push(`${elementLocation}: invalid duration "${element.duration}"`);
      if (element.dots !== undefined && !validDots(element.dots)) errors.push(`${elementLocation}: dots must be a finite non-negative integer`);
      if (element.id !== undefined) {
        if (typeof element.id !== 'string' || !element.id.trim()) errors.push(`${elementLocation}: note ID must be a non-empty string`);
        else if (notes.has(element.id)) errors.push(`${elementLocation}: duplicate note ID "${element.id}"`);
        else notes.set(element.id, element.pitch);
      }
      if (element.beam !== undefined) {
        if (typeof element.beam !== 'string' || !element.beam.trim()) errors.push(`${elementLocation}: beam ID must be a non-empty string`);
        else beamCounts.set(element.beam, (beamCounts.get(element.beam) ?? 0) + 1);
      }
    } else if (element.type === 'rest') {
      if (!durations.has(element.duration)) errors.push(`${elementLocation}: invalid rest duration "${element.duration}"`);
      if (element.dots !== undefined && !validDots(element.dots)) errors.push(`${elementLocation}: dots must be a finite non-negative integer`);
    } else if (element.type === 'barline') {
      if (!barlines.has(element.style)) errors.push(`${elementLocation}: invalid barline style "${element.style}"`);
    } else if (!['tie', 'slur', 'tuplet'].includes(element.type)) {
      errors.push(`${elementLocation}: unknown staff element type "${element.type}"`);
    }
  }

  for (const [index, element] of notation.elements.entries()) {
    if (!['tie', 'slur', 'tuplet'].includes(element.type)) continue;
    const elementLocation = `${location}.elements[${index}]`;
    const endpointsExist = notes.has(element.from) && notes.has(element.to);
    if (!endpointsExist) errors.push(`${elementLocation}: relation endpoints must reference existing note IDs`);
    if (element.from === element.to) errors.push(`${elementLocation}: relation requires distinct endpoints`);
    if (element.placement !== undefined && !placements.has(element.placement)) errors.push(`${elementLocation}: placement must be "above" or "below"`);
    if (element.type === 'tie' && endpointsExist && notes.get(element.from) !== notes.get(element.to)) errors.push(`${elementLocation}: tie endpoints must have equal pitch`);
    if (element.type === 'slur' && endpointsExist && notes.get(element.from) === notes.get(element.to)) errors.push(`${elementLocation}: slur endpoints must have different pitch`);
    if (element.type === 'tuplet' && (!Number.isInteger(element.number) || element.number < 2 || element.number > 9)) errors.push(`${elementLocation}: tuplet number must be an integer from 2 to 9`);
  }

  for (const [beam, count] of beamCounts) {
    if (count < 2) errors.push(`${location}: beam group "${beam}" must contain at least 2 notes`);
  }
  return errors;
}
