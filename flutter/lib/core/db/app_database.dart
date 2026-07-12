import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

class AppDatabase {
  AppDatabase({DatabaseFactory? factory, String? path})
      : _factory = factory ?? databaseFactory,
        _path = path;

  final DatabaseFactory _factory;
  final String? _path;
  Database? _db;

  Future<Database> get database async {
    final existing = _db;
    if (existing != null) return existing;
    final dbPath = _path ?? p.join(await getDatabasesPath(), 'mo_gallery_mobile.db');
    final db = await _factory.openDatabase(
      dbPath,
      options: OpenDatabaseOptions(
        version: 1,
        onCreate: (db, version) async {
          await db.execute('''
CREATE TABLE upload_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  local_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  settings_json TEXT NOT NULL,
  photo_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
''');
          await db.execute(
            'CREATE INDEX idx_upload_tasks_status ON upload_tasks(status)',
          );
        },
      ),
    );
    _db = db;
    return db;
  }

  Future<void> close() async {
    final db = _db;
    if (db != null) {
      await db.close();
      _db = null;
    }
  }
}
