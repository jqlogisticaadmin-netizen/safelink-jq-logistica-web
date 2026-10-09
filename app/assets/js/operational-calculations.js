// Pure, deterministic SLA date normalization helpers.
// This module does not compute delivery targets or chain duration.

function validDateParts(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseDateOnly(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return validDateParts(year, month, day) ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
  }

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:$|[\sT])/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    return validDateParts(year, month, day) ? `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
  }
  return null;
}

function mostFrequentDate(counts) {
  let max = 0;
  let winners = [];
  for (const [date, count] of counts.entries()) {
    if (count > max) {
      max = count;
      winners = [date];
    } else if (count === max) {
      winners.push(date);
    }
  }
  return { date: winners.length === 1 ? winners[0] : null, tied: winners.length > 1, maxCount: max };
}

/**
 * Normalize the BW SLA reference date according to the approved v2.0 interpretation:
 * - mode (most frequent valid date) fills blank values;
 * - dates divergent from the mode are assigned to the explicitly supplied operation day;
 * - ties are never broken arbitrarily;
 * - original values are preserved in each result for auditability.
 */
export function normalizeSlaReferenceDates(rows, operationDateValue) {
  const operationDate = parseDateOnly(operationDateValue);
  const parsed = rows.map((row, index) => ({
    index,
    originalValue: row?.bwDate ?? null,
    originalDate: parseDateOnly(row?.bwDate)
  }));
  const counts = new Map();
  for (const row of parsed) {
    if (row.originalDate) counts.set(row.originalDate, (counts.get(row.originalDate) || 0) + 1);
  }
  const mode = mostFrequentDate(counts);

  if (mode.maxCount === 0) {
    return {
      modeDate: null,
      modeTied: false,
      operationDate,
      requiresReview: true,
      reason: "no_valid_reference_dates",
      rows: parsed.map((row) => ({
        ...row, normalizedDate: null,
        normalization: row.originalValue == null || String(row.originalValue).trim() === "" ? "blank_no_mode" : "invalid_reference_date",
        requiresReview: true
      }))
    };
  }

  if (mode.tied) {
    return {
      modeDate: null,
      modeTied: true,
      operationDate,
      requiresReview: true,
      reason: "mode_tie",
      rows: parsed.map((row) => ({
        ...row,
        normalizedDate: row.originalDate,
        normalization: row.originalDate ? "unchanged_mode_tie" : "blank_mode_tie",
        requiresReview: true
      }))
    };
  }

  const normalizedRows = parsed.map((row) => {
    if (!row.originalDate) {
      const blank = row.originalValue == null || String(row.originalValue).trim() === "";
      if (blank) {
        return { ...row, normalizedDate: mode.date, normalization: "filled_with_mode", requiresReview: false };
      }
      return { ...row, normalizedDate: null, normalization: "invalid_reference_date", requiresReview: true };
    }
    if (row.originalDate === mode.date) {
      return { ...row, normalizedDate: mode.date, normalization: "unchanged_mode", requiresReview: false };
    }
    if (!operationDate) {
      return { ...row, normalizedDate: null, normalization: "operation_date_required", requiresReview: true };
    }
    return { ...row, normalizedDate: operationDate, normalization: "adjusted_to_operation_day", requiresReview: false };
  });

  return {
    modeDate: mode.date,
    modeTied: false,
    operationDate,
    requiresReview: normalizedRows.some((row) => row.requiresReview),
    reason: normalizedRows.some((row) => row.requiresReview) ? "invalid_values_need_review" : null,
    rows: normalizedRows
  };
}

/** D+0 compares calendar dates only; source clock times are intentionally ignored. */
export function classifyD0(normalizedSlaDate, lastReadDate) {
  const slaDate = parseDateOnly(normalizedSlaDate);
  const readDate = parseDateOnly(lastReadDate);
  if (!slaDate || !readDate) return "unknown";
  return slaDate === readDate ? "D+0" : "not_D+0";
}
