package local_library

import (
	"context"
	"strings"
	"sync"
)

type pathLockClass uint8

const (
	pathLockBackground pathLockClass = iota
	pathLockCommand
)

type pathLockRequest struct {
	paths []string
	class pathLockClass
}

// pathLockCoordinator allows background readers to overlap, while file commands
// exclusively lock the affected path subtrees. A queued command also blocks new
// conflicting background work so scans and previews cannot starve it.
type pathLockCoordinator struct {
	mu                sync.Mutex
	changed           chan struct{}
	activeCommands    map[*pathLockRequest]struct{}
	activeBackgrounds map[*pathLockRequest]struct{}
	waitingCommands   map[*pathLockRequest]struct{}
}

func newPathLockCoordinator() *pathLockCoordinator {
	return &pathLockCoordinator{
		changed:           make(chan struct{}),
		activeCommands:    make(map[*pathLockRequest]struct{}),
		activeBackgrounds: make(map[*pathLockRequest]struct{}),
		waitingCommands:   make(map[*pathLockRequest]struct{}),
	}
}

func canonicalLockPaths(paths ...string) []string {
	result := make([]string, 0, len(paths))
	seen := make(map[string]struct{}, len(paths))
	for _, path := range paths {
		_, key, err := normalizeRelative(path)
		if err != nil {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, key)
	}
	return result
}

func lockPathsConflict(left, right []string) bool {
	for _, a := range left {
		for _, b := range right {
			if a == "" || b == "" || a == b || strings.HasPrefix(a, b+"/") || strings.HasPrefix(b, a+"/") {
				return true
			}
		}
	}
	return false
}

func (c *pathLockCoordinator) acquire(ctx context.Context, class pathLockClass, paths ...string) (func(), error) {
	request := &pathLockRequest{paths: canonicalLockPaths(paths...), class: class}
	if len(request.paths) == 0 {
		request.paths = []string{""}
	}
	c.mu.Lock()
	if class == pathLockCommand {
		c.waitingCommands[request] = struct{}{}
	}
	for !c.canAcquire(request) {
		changed := c.changed
		c.mu.Unlock()
		select {
		case <-ctx.Done():
			c.mu.Lock()
			delete(c.waitingCommands, request)
			c.notifyLocked()
			c.mu.Unlock()
			return nil, ctx.Err()
		case <-changed:
		}
		c.mu.Lock()
	}
	delete(c.waitingCommands, request)
	if class == pathLockCommand {
		c.activeCommands[request] = struct{}{}
	} else {
		c.activeBackgrounds[request] = struct{}{}
	}
	c.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			c.mu.Lock()
			delete(c.activeCommands, request)
			delete(c.activeBackgrounds, request)
			c.notifyLocked()
			c.mu.Unlock()
		})
	}, nil
}

func (c *pathLockCoordinator) canAcquire(request *pathLockRequest) bool {
	for active := range c.activeCommands {
		if lockPathsConflict(request.paths, active.paths) {
			return false
		}
	}
	if request.class == pathLockCommand {
		for active := range c.activeBackgrounds {
			if lockPathsConflict(request.paths, active.paths) {
				return false
			}
		}
		return true
	}
	for waiting := range c.waitingCommands {
		if waiting != request && lockPathsConflict(request.paths, waiting.paths) {
			return false
		}
	}
	return true
}

func (c *pathLockCoordinator) notifyLocked() {
	close(c.changed)
	c.changed = make(chan struct{})
}
