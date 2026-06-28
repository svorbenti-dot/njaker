/* ics.js – ICS-Generator + geteilte Hilfsfunktionen */

function _pad(n) { return String(n).padStart(2, '0'); }

function _toICSDate(date) {
  const d = new Date(date);
  return `${d.getFullYear()}${_pad(d.getMonth() + 1)}${_pad(d.getDate())}`;
}

function _toICSDateTime(date) {
  const d = new Date(date);
  return `${d.getFullYear()}${_pad(d.getMonth() + 1)}${_pad(d.getDate())}`
       + `T${_pad(d.getHours())}${_pad(d.getMinutes())}00`;
}

function _uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}@njaker`;
}

function _escapeICS(str) {
  return String(str || '').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function generateICS({ title, date, description = '', rrule = '', allDay = true }) {
  const d = new Date(date);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NjaKer//NjaKer//DE',
    'BEGIN:VEVENT',
    `UID:${_uid()}`,
  ];

  if (allDay) {
    const dtstart = _toICSDate(d);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const dtend = _toICSDate(next);
    lines.push(
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${_escapeICS(title)}`,
      `DESCRIPTION:${_escapeICS(description)}`,
    );
    if (rrule) lines.push(`RRULE:${rrule}`);
    lines.push(
      'BEGIN:VALARM',
      `TRIGGER;VALUE=DATE-TIME:${dtstart}T180000`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${_escapeICS(title)}`,
      'END:VALARM',
    );
  } else {
    const start = _toICSDateTime(d);
    const endDate = new Date(d.getTime() + 60 * 60 * 1000);
    const end = _toICSDateTime(endDate);
    lines.push(
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${_escapeICS(title)}`,
      `DESCRIPTION:${_escapeICS(description)}`,
    );
    if (rrule) lines.push(`RRULE:${rrule}`);
    lines.push(
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${_escapeICS(title)}`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

function downloadICS(filename, icsString) {
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function _formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function _formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function _escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _needsReminder(startDate, endDate) {
  if (!startDate || !endDate) return false;
  const grenze = new Date(startDate);
  grenze.setFullYear(grenze.getFullYear() + 2);
  return new Date(endDate) >= grenze;
}

function _reminderDate(endDate) {
  const d = new Date(endDate);
  d.setMonth(d.getMonth() - 3);
  d.setDate(d.getDate() - 14);
  return d;
}
