package storage_plugins

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

type RuntimeResolver interface {
	Resolve(ctx context.Context, manifest Manifest, pluginDir string) (command string, args []string, env []string, err error)
}

type ExecutableRuntimeResolver struct{}

func (ExecutableRuntimeResolver) Resolve(ctx context.Context, manifest Manifest, pluginDir string) (string, []string, []string, error) {
	if err := contextError(ctx); err != nil {
		return "", nil, nil, err
	}
	if err := normalizeManifest(&manifest); err != nil {
		return "", nil, nil, err
	}
	key, err := platformKey()
	if err != nil {
		return "", nil, nil, err
	}
	if !manifestSupportsPlatform(manifest, key) {
		return "", nil, nil, &PluginError{Code: ErrorUnsupportedPlatform, Message: fmt.Sprintf("plugin %s does not support %s", manifest.ID, key)}
	}

	entry := manifest.Entry
	if len(manifest.Binaries) > 0 {
		entry = manifest.Binaries[key]
		if strings.TrimSpace(entry) == "" {
			return "", nil, nil, &PluginError{Code: ErrorUnsupportedPlatform, Message: fmt.Sprintf("plugin %s has no binary for %s", manifest.ID, key)}
		}
	}
	path, err := resolvePackagePath(pluginDir, entry)
	if err != nil {
		return "", nil, nil, &PluginError{Code: ErrorInvalidManifest, Message: "plugin executable path is invalid", Cause: err}
	}
	if err := validateExecutable(path); err != nil {
		return "", nil, nil, err
	}
	return path, append([]string(nil), manifest.Args...), nil, nil
}

type NodeRuntimeResolver struct {
	// RuntimeRoot is selected by the host/application bundle. It is never
	// accepted from a manifest or renderer request.
	RuntimeRoot string
	// VerifyBundle is enabled for the application resolver. The public
	// constructor remains lightweight for resolver unit tests that use a fake
	// runtime file without a release bundle manifest.
	VerifyBundle bool
	// AllowDevelopmentFallback permits a host-selected Node 22 executable when
	// a signed bundle is unavailable. Wails only enables this in dev builds.
	AllowDevelopmentFallback bool
}

func NewNodeRuntimeResolver(runtimeRoot string) NodeRuntimeResolver {
	return NodeRuntimeResolver{RuntimeRoot: runtimeRoot}
}

func NewVerifiedNodeRuntimeResolver(runtimeRoot string) NodeRuntimeResolver {
	return NodeRuntimeResolver{RuntimeRoot: runtimeRoot, VerifyBundle: true}
}

func NewDevelopmentNodeRuntimeResolver(runtimeRoot string) NodeRuntimeResolver {
	return NodeRuntimeResolver{
		RuntimeRoot: runtimeRoot, VerifyBundle: true, AllowDevelopmentFallback: true,
	}
}

func (r NodeRuntimeResolver) Resolve(ctx context.Context, manifest Manifest, pluginDir string) (string, []string, []string, error) {
	if err := contextError(ctx); err != nil {
		return "", nil, nil, err
	}
	if err := normalizeManifest(&manifest); err != nil {
		return "", nil, nil, err
	}
	if err := validateNodeRuntime(manifest); err != nil {
		return "", nil, nil, err
	}
	key, err := platformKey()
	if err != nil {
		return "", nil, nil, err
	}
	if !manifestSupportsPlatform(manifest, key) {
		return "", nil, nil, &PluginError{Code: ErrorUnsupportedPlatform, Message: fmt.Sprintf("plugin %s does not support %s", manifest.ID, key)}
	}
	entry, err := resolvePackagePath(pluginDir, manifest.Entry)
	if err != nil {
		return "", nil, nil, &PluginError{Code: ErrorInvalidManifest, Message: "node plugin entry is invalid", Cause: err}
	}
	if err := validateRegularFile(entry, "node plugin entry"); err != nil {
		return "", nil, nil, err
	}
	useDevelopmentNode := false
	if strings.TrimSpace(r.RuntimeRoot) == "" {
		if !r.AllowDevelopmentFallback {
			return "", nil, nil, &PluginError{Code: ErrorRuntimeMissing, Message: "bundled Node runtime directory is not configured"}
		}
		useDevelopmentNode = true
	}
	if r.VerifyBundle && !useDevelopmentNode {
		if err := verifyBundledNodeRuntime(r.RuntimeRoot); err != nil {
			if !r.AllowDevelopmentFallback {
				return "", nil, nil, err
			}
			useDevelopmentNode = true
		}
	}
	var nodePath string
	if useDevelopmentNode {
		nodePath, err = developmentNodeRuntimePath()
	} else {
		nodeName := "node"
		if runtime.GOOS == "windows" {
			nodeName += ".exe"
		}
		nodePath, err = resolvePackagePath(filepath.Join(r.RuntimeRoot, key), nodeName)
		if r.VerifyBundle {
			nodePath, err = nodeRuntimePath(r.RuntimeRoot, key)
		}
	}
	if err != nil {
		if useDevelopmentNode {
			return "", nil, nil, err
		}
		return "", nil, nil, &PluginError{Code: ErrorRuntimeMissing, Message: "bundled Node runtime path is invalid", Cause: err}
	}
	if err := validateExecutable(nodePath); err != nil {
		var pluginErr *PluginError
		if errors.As(err, &pluginErr) {
			pluginErr.Code = ErrorRuntimeMissing
			pluginErr.Message = "bundled Node runtime is unavailable"
			return "", nil, nil, pluginErr
		}
		return "", nil, nil, &PluginError{Code: ErrorRuntimeMissing, Message: "bundled Node runtime is unavailable", Cause: err}
	}
	if r.VerifyBundle && !useDevelopmentNode {
		if err := verifyBundledNodeRuntimeVersion(nodePath); err != nil {
			return "", nil, nil, err
		}
	}
	args := make([]string, 0, len(manifest.Args)+1)
	args = append(args, entry)
	args = append(args, manifest.Args...)
	env := []string{"MO_GALLERY_PLUGIN_RUNTIME=" + RuntimeNode22}
	return nodePath, args, env, nil
}

func developmentNodeRuntimePath() (string, error) {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return "", &PluginError{Code: ErrorRuntimeMissing, Message: "development Node runtime is unavailable in PATH", Cause: err}
	}
	nodePath, err = filepath.EvalSymlinks(nodePath)
	if err != nil {
		return "", &PluginError{Code: ErrorRuntimeMissing, Message: "development Node runtime path is invalid", Cause: err}
	}
	nodePath, err = filepath.Abs(nodePath)
	if err != nil {
		return "", &PluginError{Code: ErrorRuntimeMissing, Message: "development Node runtime path is invalid", Cause: err}
	}
	if err := validateExecutable(nodePath); err != nil {
		return "", &PluginError{Code: ErrorRuntimeMissing, Message: "development Node runtime is unavailable", Cause: err}
	}
	if err := verifyDevelopmentNodeRuntimeVersion(nodePath); err != nil {
		return "", err
	}
	return nodePath, nil
}

type defaultRuntimeResolver struct {
	executable ExecutableRuntimeResolver
	node       NodeRuntimeResolver
}

func (r defaultRuntimeResolver) Resolve(ctx context.Context, manifest Manifest, pluginDir string) (string, []string, []string, error) {
	if err := normalizeManifest(&manifest); err != nil {
		return "", nil, nil, err
	}
	if manifest.Type == PluginTypeNode {
		return r.node.Resolve(ctx, manifest, pluginDir)
	}
	return r.executable.Resolve(ctx, manifest, pluginDir)
}

func newDefaultRuntimeResolver(runtimeRoot string) RuntimeResolver {
	return defaultRuntimeResolver{
		executable: ExecutableRuntimeResolver{},
		node:       NewVerifiedNodeRuntimeResolver(runtimeRoot),
	}
}

func newDevelopmentRuntimeResolver(runtimeRoot string) RuntimeResolver {
	return defaultRuntimeResolver{
		executable: ExecutableRuntimeResolver{},
		node:       NewDevelopmentNodeRuntimeResolver(runtimeRoot),
	}
}

func defaultNodeRuntimeRoot() string {
	executable, err := os.Executable()
	if err != nil {
		return ""
	}
	base := filepath.Dir(executable)
	candidates := []string{
		filepath.Join(base, "resources", "runtimes", "node"),
		filepath.Join(base, "runtimes", "node"),
	}
	for _, candidate := range candidates {
		if info, statErr := os.Stat(candidate); statErr == nil && info.IsDir() {
			return candidate
		}
	}
	return candidates[0]
}

func contextError(ctx context.Context) error {
	if ctx == nil {
		return nil
	}
	select {
	case <-ctx.Done():
		return &PluginError{Code: ErrorRequestTimeout, Message: "plugin runtime resolution was canceled", Cause: ctx.Err()}
	default:
		return nil
	}
}

func validateExecutable(path string) error {
	if err := validateRegularFile(path, "plugin executable"); err != nil {
		return err
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(path)
		if err != nil {
			return &PluginError{Code: ErrorRuntimeMissing, Message: "plugin executable is unavailable", Cause: err}
		}
		if info.Mode().Perm()&0o111 == 0 {
			return &PluginError{Code: ErrorRuntimeMissing, Message: "plugin executable is not executable"}
		}
	}
	return nil
}

func validateRegularFile(path, label string) error {
	info, err := os.Lstat(path)
	if err != nil {
		return &PluginError{Code: ErrorRuntimeMissing, Message: label + " is missing", Cause: err}
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return &PluginError{Code: ErrorInvalidManifest, Message: label + " cannot be a symbolic link"}
	}
	if !info.Mode().IsRegular() {
		return &PluginError{Code: ErrorInvalidManifest, Message: label + " must be a regular file"}
	}
	return nil
}

func resolvePackagePath(root, relative string) (string, error) {
	relative = strings.TrimSpace(strings.ReplaceAll(relative, "\\", "/"))
	if relative == "" || strings.ContainsRune(relative, '\x00') || strings.HasPrefix(relative, "/") {
		return "", errors.New("path must be a non-empty relative path")
	}
	for _, segment := range strings.Split(relative, "/") {
		if segment == ".." {
			return "", errors.New("path must not contain parent segments")
		}
	}
	clean := filepath.Clean(filepath.FromSlash(relative))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) || filepath.IsAbs(clean) || filepath.VolumeName(clean) != "" {
		return "", errors.New("path must remain inside the plugin directory")
	}
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	resolved := filepath.Join(rootAbs, clean)
	relativeToRoot, err := filepath.Rel(rootAbs, resolved)
	if err != nil || relativeToRoot == ".." || strings.HasPrefix(relativeToRoot, ".."+string(filepath.Separator)) || filepath.IsAbs(relativeToRoot) {
		return "", errors.New("path escapes the plugin directory")
	}
	return resolved, nil
}
