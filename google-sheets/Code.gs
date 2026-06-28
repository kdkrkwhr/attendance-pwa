/**
 * Google 시트 + Apps Script 웹앱
 * 출퇴근 시트 1행: 이름 | 날짜 | 출근 | 퇴근 | 퇴근예정 | 순근무(시간)
 * AI채팅 시트 1행: 이름 | 역할 | 내용 | 시각
 */
const SHEET_NAME = '출퇴근';
const CHAT_SHEET_NAME = 'AI채팅';
const CHAT_MAX = 100;

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['이름', '날짜', '출근', '퇴근', '퇴근예정', '순근무']);
  }
  return sheet;
}

function getChatSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CHAT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CHAT_SHEET_NAME);
    sheet.appendRow(['이름', '역할', '내용', '시각']);
  }
  return sheet;
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'chat') return handleChatPost_(body);
    if (body.action === 'chatClear') return handleChatClear_(body);

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
    if (e.parameter.action === 'chat') return handleChatGet_(e.parameter);

    const sheet = getSheet_();
    const rows = sheet.getDataRange().getValues();
    const weekStart = e.parameter.weekStart;

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

function handleChatPost_(body) {
  const name = String(body.name || '').trim();
  const role = String(body.role || '').trim();
  const content = String(body.content || '').trim();
  const at = String(body.at || new Date().toISOString()).trim();

  if (!name || !role || !content) {
    return json_({ ok: false, error: 'name, role, content required' });
  }
  if (role !== 'user' && role !== 'assistant') {
    return json_({ ok: false, error: 'role must be user or assistant' });
  }

  const sheet = getChatSheet_();
  sheet.appendRow([name, role, content, at]);
  trimChatRows_(sheet, name);
  return json_({ ok: true });
}

function handleChatClear_(body) {
  const name = String(body.name || '').trim();
  if (!name) return json_({ ok: false, error: 'name required' });

  const sheet = getChatSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === name) sheet.deleteRow(i + 1);
  }
  return json_({ ok: true });
}

function handleChatGet_(params) {
  const name = String(params.name || '').trim();
  const limit = Math.min(parseInt(params.limit, 10) || CHAT_MAX, CHAT_MAX);
  if (!name) return json_({ ok: false, error: 'name required' });

  const sheet = getChatSheet_();
  const rows = sheet.getDataRange().getValues();
  const messages = [];
  for (let i = 1; i < rows.length; i++) {
    const [rowName, role, content, at] = rows[i];
    if (String(rowName) !== name) continue;
    if (!role || content === '') continue;
    messages.push({
      role: String(role),
      content: String(content),
      at: String(at || ''),
    });
  }

  messages.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return json_({ ok: true, messages: messages.slice(-limit) });
}

/** ponytail: per-user O(n) trim; fine for ≤100 rows */
function trimChatRows_(sheet, name) {
  const rows = sheet.getDataRange().getValues();
  const indices = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === name) indices.push(i + 1);
  }
  while (indices.length > CHAT_MAX) {
    sheet.deleteRow(indices.shift());
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
