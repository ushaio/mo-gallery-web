package main

import (
	_ "embed"
	"encoding/json"
)

//go:embed wails.json
var wailsMetadata []byte

func desktopAppVersion() string {
	var metadata struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	if err := json.Unmarshal(wailsMetadata, &metadata); err != nil || metadata.Info.ProductVersion == "" {
		return "0.0.0"
	}
	return metadata.Info.ProductVersion
}
