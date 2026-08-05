import Foundation
import SQLite3

struct SourceOptions {
    var databasePath: String
    var sinceNanoseconds: Int64
    var limit: Int32
}

func optionValue(_ name: String, in arguments: [String]) -> String? {
    guard let index = arguments.firstIndex(of: name), arguments.indices.contains(index + 1) else {
        return nil
    }
    return arguments[index + 1]
}

func parseOptions() -> SourceOptions {
    let arguments = Array(CommandLine.arguments.dropFirst())
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    let defaultPath = home + "/Library/Messages/chat.db"
    let since = Int64(optionValue("--since-ns", in: arguments) ?? "0") ?? 0
    let limit = Int32(optionValue("--limit", in: arguments) ?? "500") ?? 500
    return SourceOptions(
        databasePath: optionValue("--db", in: arguments) ?? defaultPath,
        sinceNanoseconds: max(0, since),
        limit: min(max(1, limit), 5000)
    )
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

func decodeAttributedBody(_ data: Data) -> String? {
    let decoded = String(decoding: data, as: UTF8.self)
    let chunks = decoded.unicodeScalars.split(whereSeparator: { scalar in
        scalar.value < 0x20 || scalar.value == 0x7f || scalar.value == 0xfffd
    })
    return chunks
        .map { String(String.UnicodeScalarView($0)) }
        .filter { $0.count >= 8 }
        .max { $0.count < $1.count }
}

func columnString(_ statement: OpaquePointer?, _ index: Int32) -> String {
    guard let value = sqlite3_column_text(statement, index) else { return "" }
    return String(cString: value)
}

func isoDate(for rawValue: Int64) -> String {
    let referenceSeconds = rawValue > 10_000_000_000 ? Double(rawValue) / 1_000_000_000 : Double(rawValue)
    let date = Date(timeIntervalSinceReferenceDate: referenceSeconds)
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
}

func emit(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value),
          let line = String(data: data, encoding: .utf8) else {
        fail("Could not encode a Messages record as JSON")
    }
    print(line)
}

let options = parseOptions()
var database: OpaquePointer?
let openResult = sqlite3_open_v2(options.databasePath, &database, SQLITE_OPEN_READONLY, nil)
guard openResult == SQLITE_OK, let database else {
    fail("Messages database is not readable at " + options.databasePath)
}
defer { sqlite3_close(database) }

let query = """
SELECT m.guid, m.text, m.attributedBody, m.date, h.id
FROM message AS m
JOIN handle AS h ON h.ROWID = m.handle_id
WHERE m.is_from_me = 0
  AND m.is_system_message = 0
  AND m.item_type = 0
  AND (lower(h.id) LIKE '%alahly%' OR lower(h.id) = 'banque misr')
  AND m.date > ?
ORDER BY m.date ASC
LIMIT ?;
"""

var statement: OpaquePointer?
guard sqlite3_prepare_v2(database, query, -1, &statement, nil) == SQLITE_OK else {
    fail("Could not prepare the read-only Messages query")
}
defer { sqlite3_finalize(statement) }

sqlite3_bind_int64(statement, 1, options.sinceNanoseconds)
sqlite3_bind_int(statement, 2, options.limit)

while sqlite3_step(statement) == SQLITE_ROW {
    let guid = columnString(statement, 0)
    let text = columnString(statement, 1)
    let body: String
    if !text.isEmpty {
        body = text
    } else if let blob = sqlite3_column_blob(statement, 2) {
        let length = Int(sqlite3_column_bytes(statement, 2))
        body = decodeAttributedBody(Data(bytes: blob, count: length)) ?? ""
    } else {
        body = ""
    }

    guard !guid.isEmpty, !body.isEmpty else { continue }
    emit([
        "id": guid,
        "sender": columnString(statement, 4),
        "receivedAt": isoDate(for: sqlite3_column_int64(statement, 3)),
        "body": body
    ])
}
