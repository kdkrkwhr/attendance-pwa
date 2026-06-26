/**
 * Google 시트 + Apps Script 웹앱
 * 시트 1행 헤더: 이름 | 날짜 | 출근 | 퇴근 | 퇴근예정 | 순근무(시간)
 */
const SHEET_NAME = '출퇴근';

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['이름', '날짜', '출근', '퇴근', '퇴근예정', '순근무']);
  }
  return sheet;
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const sheet = getSheet_();
    const rows = sheet.getDataRange().getValues();
    const name = String(body.name || '').trim();
    const date = String(body.date || '').trim();

    if (!name || !date) {
      return json_({ ok: false, error: 'name and date required' });
    }

    const rowData = [
      name,
      date,
      body.checkIn || '',
      body.checkOut || '',
      body.leavePlanned || '',
      body.netHours != null ? body.netHours : '',
    ];

    let updated = false;
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === name && String(rows[i][1]) === date) {
        sheet.getRange(i + 1, 1, 1, 6).setValues([rowData]);
        updated = true;
        break;
      }
    }
    if (!updated) {
      sheet.appendRow(rowData);
    }

    return json_({ ok: true, updated });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    const sheet = getSheet_();
    const rows = sheet.getDataRange().getValues();
    const weekStart = e.parameter.weekStart; // YYYY-MM-DD (월요일)

    const records = [];
    for (let i = 1; i < rows.length; i++) {
      const [name, date, checkIn, checkOut, leavePlanned, netHours] = rows[i];
      if (!name || !date) continue;
      if (weekStart && !isInWeek_(String(date), weekStart)) continue;
      records.push({
        name: String(name),
        date: String(date),
        checkIn: String(checkIn || ''),
        checkOut: String(checkOut || ''),
        leavePlanned: String(leavePlanned || ''),
        netHours: netHours === '' ? null : Number(netHours),
      });
    }

    return json_({ ok: true, records });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function isInWeek_(dateStr, weekStartStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const start = new Date(weekStartStr + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return d >= start && d <= end;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
