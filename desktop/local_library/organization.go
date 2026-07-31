package local_library

import (
	"context"
	"database/sql"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxOrganizationNameLength  = 200
	maxOrganizationNotesLength = 10000
)

func normalizeOrganizationName(value, kind string) (string, string, error) {
	name := strings.TrimSpace(value)
	if name == "" {
		return "", "", newError(ErrInvalidPath, kind+"名称不能为空", nil)
	}
	if !utf8.ValidString(name) || strings.ContainsRune(name, '\x00') {
		return "", "", newError(ErrInvalidPath, kind+"名称包含无效字符", nil)
	}
	if utf8.RuneCountInString(name) > maxOrganizationNameLength {
		return "", "", newError(ErrInvalidPath, kind+"名称过长", map[string]any{"maxLength": maxOrganizationNameLength})
	}
	return name, strings.ToLower(name), nil
}

func normalizeOrganizationNotes(value string) (string, error) {
	notes := strings.TrimSpace(value)
	if !utf8.ValidString(notes) || strings.ContainsRune(notes, '\x00') {
		return "", newError(ErrInvalidPath, "集合备注包含无效字符", nil)
	}
	if utf8.RuneCountInString(notes) > maxOrganizationNotesLength {
		return "", newError(ErrInvalidPath, "集合备注过长", map[string]any{"maxLength": maxOrganizationNotesLength})
	}
	return notes, nil
}

func normalizeTagColor(value string) (string, error) {
	color := strings.TrimSpace(value)
	if utf8.RuneCountInString(color) > 40 || strings.ContainsRune(color, '\x00') {
		return "", newError(ErrInvalidPath, "标签颜色无效", nil)
	}
	return color, nil
}

func (m *Manager) ListTags() ([]TagDTO, error) {
	session, err := m.currentSession()
	if err != nil {
		return nil, err
	}
	return session.store.listTags(session.ctx)
}

func (m *Manager) CreateTag(name, color string) (TagDTO, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return TagDTO{}, err
	}
	item, err := session.store.createTag(session.ctx, name, color)
	if err == nil {
		m.emitEvent("organization_updated")
	}
	return item, err
}

func (m *Manager) UpdateTag(id, name, color string) (TagDTO, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return TagDTO{}, err
	}
	item, err := session.store.updateTag(session.ctx, id, name, color)
	if err == nil {
		m.emitEvent("organization_updated")
	}
	return item, err
}

func (m *Manager) DeleteTag(id string) error {
	session, err := m.requireAvailableSession()
	if err != nil {
		return err
	}
	err = session.store.deleteTag(session.ctx, id)
	if err == nil {
		m.emitEvent("organization_updated")
	}
	return err
}

func (m *Manager) SetAssetTags(id AssetID, tagIDs []string) error {
	session, err := m.requireAvailableSession()
	if err != nil {
		return err
	}
	err = session.store.setAssetTags(session.ctx, id, tagIDs)
	if err == nil {
		m.emitEvent("asset_updated")
	}
	return err
}

func (m *Manager) BatchUpdateAssetOrganization(update BatchAssetOrganizationUpdate) error {
	session, err := m.requireAvailableSession()
	if err != nil {
		return err
	}
	err = session.store.batchUpdateAssetOrganization(session.ctx, update)
	if err == nil {
		m.emitEvent("asset_updated")
	}
	return err
}

func (m *Manager) ListCollectionGroups() ([]CollectionGroupDTO, error) {
	session, err := m.currentSession()
	if err != nil {
		return nil, err
	}
	return session.store.listCollectionGroups(session.ctx)
}

func (m *Manager) CreateCollectionGroup(parentID *string, name string) (CollectionGroupDTO, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return CollectionGroupDTO{}, err
	}
	item, err := session.store.createCollectionGroup(session.ctx, parentID, name)
	if err == nil {
		m.emitEvent("organization_updated")
	}
	return item, err
}

func (m *Manager) UpdateCollectionGroup(id string, parentID *string, name string, position int) (CollectionGroupDTO, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return CollectionGroupDTO{}, err
	}
	item, err := session.store.updateCollectionGroup(session.ctx, id, parentID, name, position)
	if err == nil {
		m.emitEvent("organization_updated")
	}
	return item, err
}

func (m *Manager) DeleteCollectionGroup(id string, deleteContents bool) error {
	session, err := m.requireAvailableSession()
	if err != nil {
		return err
	}
	err = session.store.deleteCollectionGroup(session.ctx, id, deleteContents)
	if err == nil {
		m.emitEvent("organization_updated")
	}
	return err
}

func (m *Manager) ListCollections() ([]CollectionDTO, error) {
	session, err := m.currentSession()
	if err != nil {
		return nil, err
	}
	return session.store.listCollections(session.ctx)
}

func (m *Manager) CreateCollection(groupID *string, name, notes string) (CollectionDTO, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return CollectionDTO{}, err
	}
	item, err := session.store.createCollection(session.ctx, groupID, name, notes)
	if err == nil {
		m.emitEvent("organization_updated")
	}
	return item, err
}

func (m *Manager) UpdateCollection(id string, groupID *string, name, notes string, position int) (CollectionDTO, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return CollectionDTO{}, err
	}
	item, err := session.store.updateCollection(session.ctx, id, groupID, name, notes, position)
	if err == nil {
		m.emitEvent("organization_updated")
	}
	return item, err
}

func (m *Manager) DeleteCollection(id string) error {
	session, err := m.requireAvailableSession()
	if err != nil {
		return err
	}
	err = session.store.deleteCollection(session.ctx, id)
	if err == nil {
		m.emitEvent("organization_updated")
	}
	return err
}

func (m *Manager) SetAssetCollections(id AssetID, collectionIDs []string) error {
	session, err := m.requireAvailableSession()
	if err != nil {
		return err
	}
	err = session.store.setAssetCollections(session.ctx, id, collectionIDs)
	if err == nil {
		m.emitEvent("asset_updated")
	}
	return err
}

func (s *store) listTags(ctx context.Context) ([]TagDTO, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT t.id,t.name,t.color,COUNT(at.asset_id)
		FROM tags t LEFT JOIN asset_tags at ON at.tag_id=t.id
		GROUP BY t.id ORDER BY t.name COLLATE NOCASE,t.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []TagDTO{}
	for rows.Next() {
		var item TagDTO
		if err := rows.Scan(&item.ID, &item.Name, &item.Color, &item.AssetCount); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *store) createTag(ctx context.Context, rawName, rawColor string) (TagDTO, error) {
	name, key, err := normalizeOrganizationName(rawName, "标签")
	if err != nil {
		return TagDTO{}, err
	}
	color, err := normalizeTagColor(rawColor)
	if err != nil {
		return TagDTO{}, err
	}
	item := TagDTO{ID: newID(), Name: name, Color: color}
	_, err = s.db.ExecContext(ctx, `INSERT INTO tags(id,name,name_key,color,created_at) VALUES(?,?,?,?,?)`, item.ID, item.Name, key, item.Color, time.Now().UnixMilli())
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return TagDTO{}, newError(ErrOrganizationNameConflict, "已存在同名标签", map[string]any{"name": name})
		}
		return TagDTO{}, err
	}
	return item, nil
}

func (s *store) updateTag(ctx context.Context, id, rawName, rawColor string) (TagDTO, error) {
	name, key, err := normalizeOrganizationName(rawName, "标签")
	if err != nil {
		return TagDTO{}, err
	}
	color, err := normalizeTagColor(rawColor)
	if err != nil {
		return TagDTO{}, err
	}
	result, err := s.db.ExecContext(ctx, `UPDATE tags SET name=?,name_key=?,color=? WHERE id=?`, name, key, color, id)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return TagDTO{}, newError(ErrOrganizationNameConflict, "已存在同名标签", map[string]any{"name": name})
		}
		return TagDTO{}, err
	}
	if affected, _ := result.RowsAffected(); affected != 1 {
		return TagDTO{}, newError(ErrTagNotFound, "标签不存在", map[string]any{"id": id})
	}
	var item TagDTO
	if err := s.db.QueryRowContext(ctx, `SELECT t.id,t.name,t.color,COUNT(at.asset_id) FROM tags t LEFT JOIN asset_tags at ON at.tag_id=t.id WHERE t.id=? GROUP BY t.id`, id).Scan(&item.ID, &item.Name, &item.Color, &item.AssetCount); err != nil {
		return TagDTO{}, err
	}
	return item, nil
}

func (s *store) deleteTag(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM tags WHERE id=?`, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected != 1 {
		return newError(ErrTagNotFound, "标签不存在", map[string]any{"id": id})
	}
	return nil
}

func uniqueIDs(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		id := strings.TrimSpace(value)
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}
	return result
}

func ensureAssetExists(ctx context.Context, tx *sql.Tx, id AssetID) error {
	var found string
	if err := tx.QueryRowContext(ctx, `SELECT id FROM assets WHERE id=?`, id).Scan(&found); err != nil {
		if err == sql.ErrNoRows {
			return newError(ErrAssetNotFound, "资产不存在", map[string]any{"id": id})
		}
		return err
	}
	return nil
}

func ensureIDsExist(ctx context.Context, tx *sql.Tx, table, errorMessage string, code ErrorCode, ids []string) error {
	for _, id := range ids {
		var found string
		if err := tx.QueryRowContext(ctx, `SELECT id FROM `+table+` WHERE id=?`, id).Scan(&found); err != nil {
			if err == sql.ErrNoRows {
				return newError(code, errorMessage, map[string]any{"id": id})
			}
			return err
		}
	}
	return nil
}

func (s *store) setAssetTags(ctx context.Context, id AssetID, tagIDs []string) error {
	tagIDs = uniqueIDs(tagIDs)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := ensureAssetExists(ctx, tx, id); err != nil {
		return err
	}
	if err := ensureIDsExist(ctx, tx, "tags", "标签不存在", ErrTagNotFound, tagIDs); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM asset_tags WHERE asset_id=?`, id); err != nil {
		return err
	}
	for _, tagID := range tagIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO asset_tags(asset_id,tag_id) VALUES(?,?)`, id, tagID); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func uniqueAssetIDs(values []AssetID) []AssetID {
	seen := make(map[AssetID]struct{}, len(values))
	result := make([]AssetID, 0, len(values))
	for _, value := range values {
		id := AssetID(strings.TrimSpace(string(value)))
		if id == "" {
			continue
		}
		if _, exists := seen[id]; exists {
			continue
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}
	return result
}

func validAssetColorLabel(value string) bool {
	switch value {
	case "", "red", "yellow", "green", "blue", "purple":
		return true
	default:
		return false
	}
}

func (s *store) batchUpdateAssetOrganization(ctx context.Context, update BatchAssetOrganizationUpdate) error {
	assetIDs := uniqueAssetIDs(update.AssetIDs)
	if len(assetIDs) == 0 {
		return newError(ErrAssetNotFound, "请至少选择一项资产", nil)
	}
	if update.Rating != nil && (*update.Rating < 0 || *update.Rating > 5) {
		return newError(ErrInvalidPath, "评分必须在 0 到 5 之间", nil)
	}
	if update.ColorLabel != nil && !validAssetColorLabel(*update.ColorLabel) {
		return newError(ErrInvalidPath, "不支持的颜色标记", map[string]any{"color": *update.ColorLabel})
	}
	addTagIDs := uniqueIDs(update.AddTagIDs)
	removeTagIDs := uniqueIDs(update.RemoveTagIDs)
	addCollectionIDs := uniqueIDs(update.AddCollectionIDs)
	removeCollectionIDs := uniqueIDs(update.RemoveCollectionIDs)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, id := range assetIDs {
		if err := ensureAssetExists(ctx, tx, id); err != nil {
			return err
		}
	}
	if err := ensureIDsExist(ctx, tx, "tags", "未找到标签", ErrTagNotFound, append(append([]string{}, addTagIDs...), removeTagIDs...)); err != nil {
		return err
	}
	if err := ensureIDsExist(ctx, tx, "collections", "未找到集合", ErrCollectionNotFound, append(append([]string{}, addCollectionIDs...), removeCollectionIDs...)); err != nil {
		return err
	}
	sets := []string{}
	args := []any{}
	if update.Rating != nil {
		sets = append(sets, "rating=?")
		args = append(args, *update.Rating)
	}
	if update.ColorLabel != nil {
		sets = append(sets, "color_label=?")
		args = append(args, *update.ColorLabel)
	}
	if update.IsFavorite != nil {
		sets = append(sets, "is_favorite=?")
		args = append(args, *update.IsFavorite)
	}
	if len(sets) > 0 {
		assetArgs := append([]any{}, args...)
		for _, id := range assetIDs {
			assetArgs = append(assetArgs, id)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE assets SET `+strings.Join(sets, ",")+` WHERE id IN (`+queryPlaceholders(len(assetIDs))+`)`, assetArgs...); err != nil {
			return err
		}
	}
	now := time.Now().UnixMilli()
	for _, assetID := range assetIDs {
		for _, tagID := range addTagIDs {
			if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO asset_tags(asset_id,tag_id) VALUES(?,?)`, assetID, tagID); err != nil {
				return err
			}
		}
		for _, tagID := range removeTagIDs {
			if _, err := tx.ExecContext(ctx, `DELETE FROM asset_tags WHERE asset_id=? AND tag_id=?`, assetID, tagID); err != nil {
				return err
			}
		}
		for _, collectionID := range addCollectionIDs {
			if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO collection_assets(collection_id,asset_id,added_at) VALUES(?,?,?)`, collectionID, assetID, now); err != nil {
				return err
			}
		}
		for _, collectionID := range removeCollectionIDs {
			if _, err := tx.ExecContext(ctx, `DELETE FROM collection_assets WHERE asset_id=? AND collection_id=?`, assetID, collectionID); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

func (s *store) listCollectionGroups(ctx context.Context) ([]CollectionGroupDTO, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,parent_id,name,position FROM collection_groups ORDER BY position,name COLLATE NOCASE,id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []CollectionGroupDTO{}
	for rows.Next() {
		var item CollectionGroupDTO
		var parent sql.NullString
		if err := rows.Scan(&item.ID, &parent, &item.Name, &item.Position); err != nil {
			return nil, err
		}
		if parent.Valid {
			item.ParentID = &parent.String
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func nullableString(value *string) any {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil
	}
	return strings.TrimSpace(*value)
}

func nextPosition(ctx context.Context, tx *sql.Tx, table, parentColumn string, parentID *string) (int, error) {
	var value sql.NullInt64
	query := `SELECT MAX(position) FROM ` + table + ` WHERE ` + parentColumn + ` IS NULL`
	args := []any{}
	if parentID != nil && strings.TrimSpace(*parentID) != "" {
		query = `SELECT MAX(position) FROM ` + table + ` WHERE ` + parentColumn + `=?`
		args = append(args, strings.TrimSpace(*parentID))
	}
	if err := tx.QueryRowContext(ctx, query, args...).Scan(&value); err != nil {
		return 0, err
	}
	if !value.Valid {
		return 0, nil
	}
	return int(value.Int64) + 1, nil
}

func ensureCollectionGroupExists(ctx context.Context, tx *sql.Tx, id *string) error {
	if id == nil || strings.TrimSpace(*id) == "" {
		return nil
	}
	var found string
	if err := tx.QueryRowContext(ctx, `SELECT id FROM collection_groups WHERE id=?`, strings.TrimSpace(*id)).Scan(&found); err != nil {
		if err == sql.ErrNoRows {
			return newError(ErrCollectionGroupNotFound, "集合组不存在", map[string]any{"id": *id})
		}
		return err
	}
	return nil
}

func ensureSiblingNameAvailable(ctx context.Context, tx *sql.Tx, table, parentColumn string, parentID *string, name, excludingID string) error {
	query := `SELECT id FROM ` + table + ` WHERE ` + parentColumn + ` IS NULL AND name=? COLLATE NOCASE`
	args := []any{name}
	if parentID != nil && strings.TrimSpace(*parentID) != "" {
		query = `SELECT id FROM ` + table + ` WHERE ` + parentColumn + `=? AND name=? COLLATE NOCASE`
		args = []any{strings.TrimSpace(*parentID), name}
	}
	if excludingID != "" {
		query += ` AND id<>?`
		args = append(args, excludingID)
	}
	var found string
	err := tx.QueryRowContext(ctx, query, args...).Scan(&found)
	if err == nil {
		return newError(ErrOrganizationNameConflict, "同一位置已存在同名项目", map[string]any{"name": name})
	}
	if err != sql.ErrNoRows {
		return err
	}
	return nil
}

func (s *store) createCollectionGroup(ctx context.Context, parentID *string, rawName string) (CollectionGroupDTO, error) {
	name, _, err := normalizeOrganizationName(rawName, "集合组")
	if err != nil {
		return CollectionGroupDTO{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return CollectionGroupDTO{}, err
	}
	defer tx.Rollback()
	if err := ensureCollectionGroupExists(ctx, tx, parentID); err != nil {
		return CollectionGroupDTO{}, err
	}
	if err := ensureSiblingNameAvailable(ctx, tx, "collection_groups", "parent_id", parentID, name, ""); err != nil {
		return CollectionGroupDTO{}, err
	}
	position, err := nextPosition(ctx, tx, "collection_groups", "parent_id", parentID)
	if err != nil {
		return CollectionGroupDTO{}, err
	}
	item := CollectionGroupDTO{ID: newID(), ParentID: parentID, Name: name, Position: position}
	if _, err := tx.ExecContext(ctx, `INSERT INTO collection_groups(id,parent_id,name,position) VALUES(?,?,?,?)`, item.ID, nullableString(parentID), item.Name, item.Position); err != nil {
		return CollectionGroupDTO{}, err
	}
	if err := tx.Commit(); err != nil {
		return CollectionGroupDTO{}, err
	}
	return item, nil
}

func (s *store) updateCollectionGroup(ctx context.Context, id string, parentID *string, rawName string, position int) (CollectionGroupDTO, error) {
	name, _, err := normalizeOrganizationName(rawName, "集合组")
	if err != nil {
		return CollectionGroupDTO{}, err
	}
	if parentID != nil && strings.TrimSpace(*parentID) == id {
		return CollectionGroupDTO{}, newError(ErrInvalidPath, "集合组不能移入自身", nil)
	}
	if position < 0 {
		position = 0
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return CollectionGroupDTO{}, err
	}
	defer tx.Rollback()
	var currentID string
	if err := tx.QueryRowContext(ctx, `SELECT id FROM collection_groups WHERE id=?`, id).Scan(&currentID); err != nil {
		if err == sql.ErrNoRows {
			return CollectionGroupDTO{}, newError(ErrCollectionGroupNotFound, "集合组不存在", map[string]any{"id": id})
		}
		return CollectionGroupDTO{}, err
	}
	if err := ensureCollectionGroupExists(ctx, tx, parentID); err != nil {
		return CollectionGroupDTO{}, err
	}
	if parentID != nil && strings.TrimSpace(*parentID) != "" {
		var cyclic int
		err := tx.QueryRowContext(ctx, `WITH RECURSIVE descendants(id) AS (
			SELECT id FROM collection_groups WHERE parent_id=?
			UNION ALL SELECT g.id FROM collection_groups g JOIN descendants d ON g.parent_id=d.id
		) SELECT 1 FROM descendants WHERE id=? LIMIT 1`, id, strings.TrimSpace(*parentID)).Scan(&cyclic)
		if err == nil {
			return CollectionGroupDTO{}, newError(ErrInvalidPath, "集合组不能移入自己的子组", nil)
		}
		if err != sql.ErrNoRows {
			return CollectionGroupDTO{}, err
		}
	}
	if err := ensureSiblingNameAvailable(ctx, tx, "collection_groups", "parent_id", parentID, name, id); err != nil {
		return CollectionGroupDTO{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE collection_groups SET parent_id=?,name=?,position=? WHERE id=?`, nullableString(parentID), name, position, id); err != nil {
		return CollectionGroupDTO{}, err
	}
	if err := tx.Commit(); err != nil {
		return CollectionGroupDTO{}, err
	}
	return CollectionGroupDTO{ID: id, ParentID: parentID, Name: name, Position: position}, nil
}

func (s *store) deleteCollectionGroup(ctx context.Context, id string, deleteContents bool) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var found string
	if err := tx.QueryRowContext(ctx, `SELECT id FROM collection_groups WHERE id=?`, id).Scan(&found); err != nil {
		if err == sql.ErrNoRows {
			return newError(ErrCollectionGroupNotFound, "集合组不存在", map[string]any{"id": id})
		}
		return err
	}
	var childCount int
	if err := tx.QueryRowContext(ctx, `SELECT
		(SELECT COUNT(*) FROM collection_groups WHERE parent_id=?)+
		(SELECT COUNT(*) FROM collections WHERE group_id=?)`, id, id).Scan(&childCount); err != nil {
		return err
	}
	if childCount > 0 && !deleteContents {
		return newError(ErrCollectionGroupNotEmpty, "集合组不是空的；确认后可连同子集合一起删除", map[string]any{"id": id})
	}
	if deleteContents {
		if _, err := tx.ExecContext(ctx, `WITH RECURSIVE subtree(id) AS (
			SELECT id FROM collection_groups WHERE id=?
			UNION ALL SELECT g.id FROM collection_groups g JOIN subtree s ON g.parent_id=s.id
		) DELETE FROM collections WHERE group_id IN (SELECT id FROM subtree)`, id); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM collection_groups WHERE id=?`, id); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *store) listCollections(ctx context.Context) ([]CollectionDTO, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT c.id,c.group_id,c.name,c.notes,c.position,COUNT(ca.asset_id)
		FROM collections c LEFT JOIN collection_assets ca ON ca.collection_id=c.id
		GROUP BY c.id ORDER BY c.position,c.name COLLATE NOCASE,c.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []CollectionDTO{}
	for rows.Next() {
		var item CollectionDTO
		var group sql.NullString
		if err := rows.Scan(&item.ID, &group, &item.Name, &item.Notes, &item.Position, &item.AssetCount); err != nil {
			return nil, err
		}
		if group.Valid {
			item.GroupID = &group.String
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *store) createCollection(ctx context.Context, groupID *string, rawName, rawNotes string) (CollectionDTO, error) {
	name, _, err := normalizeOrganizationName(rawName, "集合")
	if err != nil {
		return CollectionDTO{}, err
	}
	notes, err := normalizeOrganizationNotes(rawNotes)
	if err != nil {
		return CollectionDTO{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return CollectionDTO{}, err
	}
	defer tx.Rollback()
	if err := ensureCollectionGroupExists(ctx, tx, groupID); err != nil {
		return CollectionDTO{}, err
	}
	if err := ensureSiblingNameAvailable(ctx, tx, "collections", "group_id", groupID, name, ""); err != nil {
		return CollectionDTO{}, err
	}
	position, err := nextPosition(ctx, tx, "collections", "group_id", groupID)
	if err != nil {
		return CollectionDTO{}, err
	}
	now := time.Now().UnixMilli()
	item := CollectionDTO{ID: newID(), GroupID: groupID, Name: name, Notes: notes, Position: position}
	if _, err := tx.ExecContext(ctx, `INSERT INTO collections(id,group_id,name,notes,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`, item.ID, nullableString(groupID), item.Name, item.Notes, item.Position, now, now); err != nil {
		return CollectionDTO{}, err
	}
	if err := tx.Commit(); err != nil {
		return CollectionDTO{}, err
	}
	return item, nil
}

func (s *store) updateCollection(ctx context.Context, id string, groupID *string, rawName, rawNotes string, position int) (CollectionDTO, error) {
	name, _, err := normalizeOrganizationName(rawName, "集合")
	if err != nil {
		return CollectionDTO{}, err
	}
	notes, err := normalizeOrganizationNotes(rawNotes)
	if err != nil {
		return CollectionDTO{}, err
	}
	if position < 0 {
		position = 0
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return CollectionDTO{}, err
	}
	defer tx.Rollback()
	var found string
	if err := tx.QueryRowContext(ctx, `SELECT id FROM collections WHERE id=?`, id).Scan(&found); err != nil {
		if err == sql.ErrNoRows {
			return CollectionDTO{}, newError(ErrCollectionNotFound, "集合不存在", map[string]any{"id": id})
		}
		return CollectionDTO{}, err
	}
	if err := ensureCollectionGroupExists(ctx, tx, groupID); err != nil {
		return CollectionDTO{}, err
	}
	if err := ensureSiblingNameAvailable(ctx, tx, "collections", "group_id", groupID, name, id); err != nil {
		return CollectionDTO{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE collections SET group_id=?,name=?,notes=?,position=?,updated_at=? WHERE id=?`, nullableString(groupID), name, notes, position, time.Now().UnixMilli(), id); err != nil {
		return CollectionDTO{}, err
	}
	var count int64
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM collection_assets WHERE collection_id=?`, id).Scan(&count); err != nil {
		return CollectionDTO{}, err
	}
	if err := tx.Commit(); err != nil {
		return CollectionDTO{}, err
	}
	return CollectionDTO{ID: id, GroupID: groupID, Name: name, Notes: notes, Position: position, AssetCount: count}, nil
}

func (s *store) deleteCollection(ctx context.Context, id string) error {
	result, err := s.db.ExecContext(ctx, `DELETE FROM collections WHERE id=?`, id)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected != 1 {
		return newError(ErrCollectionNotFound, "集合不存在", map[string]any{"id": id})
	}
	return nil
}

func (s *store) setAssetCollections(ctx context.Context, id AssetID, collectionIDs []string) error {
	collectionIDs = uniqueIDs(collectionIDs)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := ensureAssetExists(ctx, tx, id); err != nil {
		return err
	}
	if err := ensureIDsExist(ctx, tx, "collections", "集合不存在", ErrCollectionNotFound, collectionIDs); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM collection_assets WHERE asset_id=?`, id); err != nil {
		return err
	}
	now := time.Now().UnixMilli()
	for _, collectionID := range collectionIDs {
		if _, err := tx.ExecContext(ctx, `INSERT INTO collection_assets(collection_id,asset_id,added_at) VALUES(?,?,?)`, collectionID, id, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *store) loadAssetOrganization(ctx context.Context, items []AssetDTO) error {
	if len(items) == 0 {
		return nil
	}
	placeholders := strings.TrimRight(strings.Repeat("?,", len(items)), ",")
	args := make([]any, len(items))
	index := make(map[AssetID]int, len(items))
	for i := range items {
		args[i] = items[i].ID
		index[items[i].ID] = i
		items[i].Tags = []TagDTO{}
		items[i].Collections = []AssetCollectionDTO{}
	}
	tagRows, err := s.db.QueryContext(ctx, `SELECT at.asset_id,t.id,t.name,t.color FROM asset_tags at JOIN tags t ON t.id=at.tag_id WHERE at.asset_id IN (`+placeholders+`) ORDER BY t.name COLLATE NOCASE`, args...)
	if err != nil {
		return err
	}
	for tagRows.Next() {
		var assetID AssetID
		var tag TagDTO
		if err := tagRows.Scan(&assetID, &tag.ID, &tag.Name, &tag.Color); err != nil {
			_ = tagRows.Close()
			return err
		}
		if i, ok := index[assetID]; ok {
			items[i].Tags = append(items[i].Tags, tag)
		}
	}
	if err := tagRows.Close(); err != nil {
		return err
	}
	collectionRows, err := s.db.QueryContext(ctx, `SELECT ca.asset_id,c.id,c.name FROM collection_assets ca JOIN collections c ON c.id=ca.collection_id WHERE ca.asset_id IN (`+placeholders+`) ORDER BY c.name COLLATE NOCASE`, args...)
	if err != nil {
		return err
	}
	defer collectionRows.Close()
	for collectionRows.Next() {
		var assetID AssetID
		var collection AssetCollectionDTO
		if err := collectionRows.Scan(&assetID, &collection.ID, &collection.Name); err != nil {
			return err
		}
		if i, ok := index[assetID]; ok {
			items[i].Collections = append(items[i].Collections, collection)
		}
	}
	return collectionRows.Err()
}
