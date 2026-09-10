package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"mo-gallery-desktop/db"
)

func (a *App) ListDesignCanvasProjects() ([]string, error) {
	return db.ListLocalDesignCanvasProjects()
}

func (a *App) GetDesignCanvasProject(id string) (string, error) {
	return db.GetLocalDesignCanvasProject(id)
}

func (a *App) SaveDesignCanvasProject(projectJSON string) error {
	return db.SaveLocalDesignCanvasProject(projectJSON)
}

func (a *App) DeleteDesignCanvasProject(id string) error {
	return db.DeleteLocalDesignCanvasProject(id)
}

func (a *App) SaveDesignCanvasAssetBlob(id, dataURL string) error {
	mimeType, data, err := decodeDesignCanvasAssetDataURL(dataURL)
	if err != nil {
		return err
	}
	return db.SaveLocalDesignCanvasAsset(id, mimeType, data)
}

func (a *App) GetDesignCanvasAssetBlob(id string) (string, error) {
	asset, err := db.GetLocalDesignCanvasAsset(id)
	if err != nil || asset == nil {
		return "", err
	}
	return "data:" + asset.MimeType + ";base64," + base64.StdEncoding.EncodeToString(asset.Data), nil
}

func decodeDesignCanvasAssetDataURL(dataURL string) (string, []byte, error) {
	if !strings.HasPrefix(dataURL, "data:") {
		return "", nil, errors.New("design canvas asset must be a data URL")
	}
	separator := strings.IndexByte(dataURL, ',')
	if separator < 0 {
		return "", nil, errors.New("invalid design canvas asset data URL")
	}
	header := dataURL[len("data:"):separator]
	if !strings.HasSuffix(header, ";base64") {
		return "", nil, errors.New("design canvas asset data URL must use base64 encoding")
	}
	mimeType := strings.TrimSpace(strings.TrimSuffix(header, ";base64"))
	if mimeType == "" {
		return "", nil, errors.New("design canvas asset MIME type is required")
	}
	data, err := base64.StdEncoding.DecodeString(dataURL[separator+1:])
	if err != nil {
		return "", nil, fmt.Errorf("decode design canvas asset: %w", err)
	}
	if len(data) == 0 {
		return "", nil, errors.New("design canvas asset data is empty")
	}
	return mimeType, data, nil
}
