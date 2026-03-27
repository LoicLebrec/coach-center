/**
 * Workout Exporter — generates binary Garmin FIT workout files
 * from APEX coaching prescriptions.
 *
 * FIT file format: https://developer.garmin.com/fit/protocol/
 * Minimal workout encoder — supports time-based steps with
 * power or open targets.
 */

// ─── FIT CRC ────────────────────────────────────────────────
const CRC_TABLE = [
  0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
  0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400,
];

function fitCRC(bytes) {
  let crc = 0;
  for (const b of bytes) {
    let tmp = CRC_TABLE[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF;
    crc ^= tmp ^ CRC_TABLE[b & 0xF];
    tmp = CRC_TABLE[crc & 0xF];
    crc = (crc >> 4) & 0x0FFF;
    crc ^= tmp ^ CRC_TABLE[(b >> 4) & 0xF];
  }
  return crc;
}

// ─── Binary writer ───────────────────────────────────────────
class BufWriter {
  constructor() { this.buf = []; }
  u8(v)  { this.buf.push(v & 0xFF); }
  u16(v) { this.u8(v); this.u8(v >> 8); }
  u32(v) { this.u8(v); this.u8(v >> 8); this.u8(v >> 16); this.u8(v >> 24); }
  str(s, len) {
    const enc = new TextEncoder().encode(s);
    for (let i = 0; i < len; i++) this.u8(i < enc.length ? enc[i] : 0x00);
  }
  bytes() { return new Uint8Array(this.buf); }
  get length() { return this.buf.length; }
}

// ─── FIT message encoders ────────────────────────────────────

// Local mesg 0 = File ID (global 0)
function writeFileIdDef(w) {
  w.u8(0x40); // definition, local 0
  w.u8(0x00); // reserved
  w.u8(0x00); // little-endian
  w.u16(0);   // global mesg 0 = file_id
  w.u8(3);    // 3 fields
  // field 0: type ENUM
  w.u8(0); w.u8(1); w.u8(0x00);
  // field 1: manufacturer UINT16
  w.u8(1); w.u8(2); w.u8(0x84);
  // field 4: time_created UINT32
  w.u8(4); w.u8(4); w.u8(0x86);
}

function writeFileIdData(w) {
  // FIT epoch: seconds since 1989-12-31T00:00:00 UTC
  const fitEpoch = Math.floor(Date.now() / 1000) - 631065600;
  w.u8(0x00); // data, local 0
  w.u8(5);    // type = workout
  w.u16(0xFF); // manufacturer = unknown
  w.u32(fitEpoch >>> 0);
}

// Local mesg 1 = Workout (global 26)
function writeWorkoutDef(w) {
  w.u8(0x41); // definition, local 1
  w.u8(0x00);
  w.u8(0x00);
  w.u16(26);  // global mesg 26 = workout
  w.u8(3);    // 3 fields
  // field 4: num_valid_steps UINT16
  w.u8(4); w.u8(2); w.u8(0x84);
  // field 8: wkt_name STRING(20)
  w.u8(8); w.u8(20); w.u8(0x07);
  // field 5: sport ENUM
  w.u8(5); w.u8(1); w.u8(0x00);
}

function writeWorkoutData(w, name, numSteps, sport) {
  w.u8(0x01); // data, local 1
  w.u16(numSteps);
  w.str(name, 20);
  w.u8(sport); // 2=cycling, 1=running
}

// Local mesg 2 = Workout Step (global 27)
function writeWorkoutStepDef(w) {
  w.u8(0x42); // definition, local 2
  w.u8(0x00);
  w.u8(0x00);
  w.u16(27);  // global mesg 27 = workout_step
  w.u8(7);    // 7 fields
  // field 0: message_index UINT16
  w.u8(0); w.u8(2); w.u8(0x84);
  // field 7: wkt_step_name STRING(16)
  w.u8(7); w.u8(16); w.u8(0x07);
  // field 1: duration_type ENUM (0=time ms)
  w.u8(1); w.u8(1); w.u8(0x00);
  // field 2: duration_value UINT32
  w.u8(2); w.u8(4); w.u8(0x86);
  // field 3: target_type ENUM (0=speed,1=hr,3=power,6=open)
  w.u8(3); w.u8(1); w.u8(0x00);
  // field 4: target_value UINT32
  w.u8(4); w.u8(4); w.u8(0x86);
  // field 8: intensity ENUM (0=active,1=rest,2=warmup,3=cooldown)
  w.u8(8); w.u8(1); w.u8(0x00);
}

function writeWorkoutStepData(w, idx, step) {
  // step: { name, durationSec, targetType, targetValue, intensity }
  // targetType: 0=open, 3=power (targetValue in watts), 1=hr (zone 1-7)
  w.u8(0x02);
  w.u16(idx);
  w.str(step.name || '', 16);
  w.u8(0); // duration_type = time
  w.u32((step.durationSec * 1000) >>> 0); // ms
  w.u8(step.targetType ?? 6); // 6 = open
  w.u32((step.targetValue ?? 0) >>> 0);
  w.u8(step.intensity ?? 0); // 0=active
}

// ─── FIT file assembler ──────────────────────────────────────
function buildFitWorkout(workoutName, steps, sport = 2) {
  // Build the message data (no header yet)
  const data = new BufWriter();

  writeFileIdDef(data);
  writeFileIdData(data);
  writeWorkoutDef(data);
  writeWorkoutData(data, workoutName, steps.length, sport);
  writeWorkoutStepDef(data);
  steps.forEach((step, i) => writeWorkoutStepData(data, i, step));

  const dataBytes = data.bytes();
  const dataCRC = fitCRC(dataBytes);

  // Build full file: header + data + data CRC
  const header = new BufWriter();
  header.u8(14);        // header_size
  header.u8(0x10);      // protocol_version 1.0
  header.u16(2132);     // profile_version 21.32
  header.u32(dataBytes.length + 2); // data_size (includes data CRC)
  // ".FIT"
  header.u8(0x2E); header.u8(0x46); header.u8(0x49); header.u8(0x54);
  const headerBytes = header.bytes();
  const headerCRC = fitCRC(headerBytes);
  header.u16(headerCRC);

  // Assemble
  const fullHeader = header.bytes();
  const result = new Uint8Array(fullHeader.length + dataBytes.length + 2);
  result.set(fullHeader, 0);
  result.set(dataBytes, fullHeader.length);
  result[fullHeader.length + dataBytes.length] = dataCRC & 0xFF;
  result[fullHeader.length + dataBytes.length + 1] = (dataCRC >> 8) & 0xFF;

  return result;
}

// ─── Workout text parser ─────────────────────────────────────
// Extracts structured workout steps from an APEX prescription message.

const ZONE_PCT = {
  Z1: [0.45, 0.55], Z2: [0.56, 0.75], Z3: [0.76, 0.90],
  Z4: [0.91, 1.05], Z5: [1.06, 1.20], Z6: [1.21, 1.50], Z7: [1.51, 2.00],
};

function zoneWatts(zone, ftp) {
  const r = ZONE_PCT[zone.toUpperCase()];
  if (!r || !ftp) return null;
  return { lo: Math.round(r[0] * ftp), hi: Math.round(r[1] * ftp) };
}

function parseDuration(str) {
  // Returns seconds
  const hMatch = str.match(/(\d+(?:\.\d+)?)\s*h(?:our)?/i);
  const mMatch = str.match(/(\d+(?:\.\d+)?)\s*m(?:in)?/i);
  const sMatch = str.match(/(\d+)\s*s(?:ec)?/i);
  let total = 0;
  if (hMatch) total += parseFloat(hMatch[1]) * 3600;
  if (mMatch) total += parseFloat(mMatch[1]) * 60;
  if (sMatch) total += parseInt(sMatch[1]);
  return total > 0 ? Math.round(total) : null;
}

function parsePowerTarget(line, ftp) {
  // "@ 250W" or "@ 250-280W" → exact watts
  const wMatch = line.match(/@\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*W/i);
  if (wMatch) {
    return { lo: parseInt(wMatch[1]), hi: parseInt(wMatch[2] || wMatch[1]) };
  }
  // "@ 90-95% FTP" or "@ 105%FTP"
  const pMatch = line.match(/@\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*%\s*FTP/i);
  if (pMatch && ftp) {
    const lo = Math.round(parseInt(pMatch[1]) / 100 * ftp);
    const hi = Math.round(parseInt(pMatch[2] || pMatch[1]) / 100 * ftp);
    return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
  }
  // Zone reference Z1-Z7
  const zMatch = line.match(/\b(Z[1-7])\b/i);
  if (zMatch && ftp) return zoneWatts(zMatch[1], ftp);
  return null;
}

/**
 * Parse APEX text into flat workout steps.
 * Returns [] if nothing useful found.
 * @param {string} text - APEX message content
 * @param {number|null} ftp - athlete FTP in watts
 * @param {string} sport - 'cycling' or 'running'
 */
export function parseWorkoutSteps(text, ftp = null, sport = 'cycling') {
  const steps = [];
  const lines = text.split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const isWarmup   = /warm.?up/i.test(line);
    const isCooldown = /cool.?down/i.test(line);
    const isRecovery = /\b(recovery|recover|rest|easy)\b/i.test(line) && !isWarmup && !isCooldown;
    const isInterval = /\b(\d+)\s*[x×]\s*(\d+)/i.test(line);

    if (isWarmup || isCooldown) {
      const dur = parseDuration(line) || (isWarmup ? 1200 : 1200);
      const power = parsePowerTarget(line, ftp);
      steps.push({
        name: isWarmup ? 'Warmup' : 'Cooldown',
        durationSec: dur,
        targetType: power ? 3 : 6,
        targetValue: power ? Math.round((power.lo + power.hi) / 2) : 0,
        intensity: isWarmup ? 2 : 3,
      });
      continue;
    }

    if (isInterval) {
      const m = line.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*m(?:in)?/i);
      if (m) {
        const reps = parseInt(m[1]);
        const workSec = Math.round(parseFloat(m[2]) * 60);

        // Recovery duration from "/ Xmin" or "X min recovery"
        const recMatch = line.match(/\/\s*(\d+(?:\.\d+)?)\s*m(?:in)?|(\d+(?:\.\d+)?)\s*m(?:in)?\s*(?:recovery|rest)/i);
        const recSec = recMatch
          ? Math.round(parseFloat(recMatch[1] || recMatch[2]) * 60)
          : Math.round(workSec * 0.5);

        const power = parsePowerTarget(line, ftp);

        for (let i = 0; i < reps; i++) {
          steps.push({
            name: `Interval ${i + 1}/${reps}`,
            durationSec: workSec,
            targetType: power ? 3 : 6,
            targetValue: power ? Math.round((power.lo + power.hi) / 2) : 0,
            intensity: 0, // active
          });
          if (i < reps - 1 || recSec > 60) {
            steps.push({
              name: 'Recovery',
              durationSec: recSec,
              targetType: ftp ? 3 : 6,
              targetValue: ftp ? Math.round(ftp * 0.50) : 0,
              intensity: 1, // rest
            });
          }
        }
        continue;
      }
    }

    if (isRecovery) {
      const dur = parseDuration(line) || 300;
      steps.push({
        name: 'Recovery',
        durationSec: dur,
        targetType: ftp ? 3 : 6,
        targetValue: ftp ? Math.round(ftp * 0.50) : 0,
        intensity: 1,
      });
      continue;
    }

    // Generic step with duration
    const dur = parseDuration(line);
    if (dur && dur >= 60) {
      const power = parsePowerTarget(line, ftp);
      steps.push({
        name: line.slice(0, 15).replace(/[^\w\s]/g, '').trim() || 'Work',
        durationSec: dur,
        targetType: power ? 3 : 6,
        targetValue: power ? Math.round((power.lo + power.hi) / 2) : 0,
        intensity: 0,
      });
    }
  }

  // Always cap: if no warmup/cooldown found, add defaults
  if (steps.length > 0 && steps[0]?.intensity !== 2) {
    steps.unshift({ name: 'Warmup', durationSec: 600, targetType: 6, targetValue: 0, intensity: 2 });
  }
  if (steps.length > 0 && steps[steps.length - 1]?.intensity !== 3) {
    steps.push({ name: 'Cooldown', durationSec: 600, targetType: 6, targetValue: 0, intensity: 3 });
  }

  return steps;
}

/**
 * Detect if a message contains a workout prescription worth exporting.
 */
export function hasWorkoutContent(text) {
  return (
    /PRESCRIPTION[:\s]/i.test(text) ||
    /TODAY[''']?S WORKOUT/i.test(text) ||
    /\d+\s*[x×]\s*\d+\s*m(?:in)?/i.test(text) ||
    /(warm.?up|cool.?down).{0,60}(\d+\s*min)/i.test(text)
  );
}

/**
 * Generate a .fit file and trigger browser download.
 * @param {string} messageText - APEX prescription text
 * @param {number|null} ftp - athlete FTP
 * @param {string} sport - 'cycling' | 'running'
 * @param {string} label - workout label (date / name)
 */
export function exportWorkoutFit(messageText, ftp = null, sport = 'cycling', label = '') {
  const steps = parseWorkoutSteps(messageText, ftp, sport);
  if (!steps.length) {
    alert('Could not parse a structured workout from this message.');
    return;
  }

  const garminSport = sport === 'running' ? 1 : 2;
  const name = `APEX${label ? ' ' + label : ''}`;
  const fitBytes = buildFitWorkout(name, steps, garminSport);

  // Download
  const blob = new Blob([fitBytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `apex-workout-${label || new Date().toISOString().split('T')[0]}.fit`;
  a.click();
  URL.revokeObjectURL(url);
}
