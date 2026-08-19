package storage_plugins

import (
	"fmt"
	"runtime"
)

var supportedPlatformKeys = []string{
	"windows-amd64",
	"darwin-amd64",
	"darwin-arm64",
	"linux-amd64",
	"linux-arm64",
}

// platformKey is the stable platform/architecture identifier used in plugin
// manifests. It intentionally does not expose the host's raw GOOS/GOARCH
// values to the renderer or to plugin authors.
func platformKey() (string, error) {
	return platformKeyFor(runtime.GOOS, runtime.GOARCH)
}

func platformKeyFor(goos, goarch string) (string, error) {
	key := ""
	switch {
	case goos == "windows" && goarch == "amd64":
		key = "windows-amd64"
	case goos == "darwin" && goarch == "amd64":
		key = "darwin-amd64"
	case goos == "darwin" && goarch == "arm64":
		key = "darwin-arm64"
	case goos == "linux" && goarch == "amd64":
		key = "linux-amd64"
	case goos == "linux" && goarch == "arm64":
		key = "linux-arm64"
	default:
		return "", &PluginError{Code: ErrorUnsupportedPlatform, Message: fmt.Sprintf("unsupported desktop platform %s/%s", goos, goarch)}
	}
	return key, nil
}
