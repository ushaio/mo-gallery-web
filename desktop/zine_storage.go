package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"mo-gallery-desktop/db"
)

func (a *App) ListZineProjects() ([]string, error) {
	return db.ListLocalZineProjects()
}

func (a *App) GetZineProject(id string) (string, error) {
	return db.GetLocalZineProject(id)
}

func (a *App) SaveZineProject(projectJSON string) error {
	return db.SaveLocalZineProject(projectJSON)
}

func (a *App) DeleteZineProject(id string) error {
	return db.DeleteLocalZineProject(id)
}

func (a *App) SaveZineAssetBlob(id, dataURL string) error {
	mimeType, data, err := decodeZineAssetDataURL(dataURL)
	if err != nil {
		return err
	}
	return db.SaveLocalZineAsset(id, mimeType, data)
}

func (a *App) GetZineAssetBlob(id string) (string, error) {
	asset, err := db.GetLocalZineAsset(id)
	if err != nil || asset == nil {
		return "", err
	}
	return "data:" + asset.MimeType + ";base64," + base64.StdEncoding.EncodeToString(asset.Data), nil
}

func decodeZineAssetDataURL(dataURL string) (string, []byte, error) {
	const dataPrefix = "data:"
	if !strings.HasPrefix(dataURL, dataPrefix) {
		return "", nil, errors.New("Zine asset must be a data URL")
	}
	separator := strings.IndexByte(dataURL, ',')
	if separator < 0 {
		return "", nil, errors.New("invalid Zine asset data URL")
	}
	header := dataURL[len(dataPrefix):separator]
	if !strings.HasSuffix(header, ";base64") {
		return "", nil, errors.New("Zine asset data URL must use base64 encoding")
	}
	mimeType := strings.TrimSpace(strings.TrimSuffix(header, ";base64"))
	if mimeType == "" {
		return "", nil, errors.New("Zine asset MIME type is required")
	}
	data, err := base64.StdEncoding.DecodeString(dataURL[separator+1:])
	if err != nil {
		return "", nil, fmt.Errorf("decode Zine asset: %w", err)
	}
	if len(data) == 0 {
		return "", nil, errors.New("Zine asset data is empty")
	}
	return mimeType, data, nil
}
