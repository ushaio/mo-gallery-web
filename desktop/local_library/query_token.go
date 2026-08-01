package local_library

import (
	"crypto/rand"
	"encoding/base64"
	"strings"
	"time"
)

const queryTokenTTL = 10 * time.Minute

func newQueryToken() string {
	bytes := make([]byte, 24)
	if _, err := rand.Read(bytes); err != nil {
		return newID()
	}
	return base64.RawURLEncoding.EncodeToString(bytes)
}

func (m *Manager) CreateAssetQueryToken(query AssetQuery) (AssetQueryToken, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return AssetQueryToken{}, err
	}
	query.Cursor = ""
	ids, total, err := session.store.assetIDsForQuery(session.ctx, query)
	_ = ids
	if err != nil {
		return AssetQueryToken{}, err
	}
	now := time.Now().UTC()
	token := AssetQueryToken{Token: newQueryToken(), Total: total, ExpiresAt: now.Add(queryTokenTTL)}
	m.queryTokenMu.Lock()
	m.queryTokens[token.Token] = queryTokenRecord{SessionID: session.sessionID, Query: query, ExpiresAt: token.ExpiresAt}
	m.queryTokenMu.Unlock()
	return token, nil
}

func (m *Manager) queryFromToken(token string) (*librarySession, AssetQuery, error) {
	token = strings.TrimSpace(token)
	m.queryTokenMu.Lock()
	record, ok := m.queryTokens[token]
	if ok && time.Now().UTC().After(record.ExpiresAt) {
		delete(m.queryTokens, token)
		ok = false
	}
	m.queryTokenMu.Unlock()
	if !ok {
		return nil, AssetQuery{}, newError(ErrInvalidPath, "查询令牌无效或已过期", nil)
	}
	session, err := m.currentSession()
	if err != nil {
		return nil, AssetQuery{}, err
	}
	if session.sessionID != record.SessionID {
		return nil, AssetQuery{}, newError(ErrInvalidPath, "查询令牌不属于当前资源库会话", nil)
	}
	return session, record.Query, nil
}

func (m *Manager) BatchUpdateAssetOrganizationByQuery(token string, update BatchAssetOrganizationUpdate) error {
	session, query, err := m.queryFromToken(token)
	if err != nil {
		return err
	}
	ids, _, err := session.store.assetIDsForQuery(session.ctx, query)
	if err != nil {
		return err
	}
	update.AssetIDs = ids
	return m.BatchUpdateAssetOrganization(update)
}
