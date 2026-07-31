package local_library

import (
	"context"
	"testing"
	"time"
)

func TestPathLockCoordinatorAllowsSiblingCommands(t *testing.T) {
	locks := newPathLockCoordinator()
	releaseA, err := locks.acquire(context.Background(), pathLockCommand, "albums/a")
	if err != nil {
		t.Fatal(err)
	}
	defer releaseA()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	releaseB, err := locks.acquire(ctx, pathLockCommand, "albums/b")
	if err != nil {
		t.Fatalf("sibling lock should not conflict: %v", err)
	}
	releaseB()
}

func TestPathLockCoordinatorParentBlocksChild(t *testing.T) {
	locks := newPathLockCoordinator()
	release, err := locks.acquire(context.Background(), pathLockCommand, "albums")
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, err := locks.acquire(ctx, pathLockBackground, "albums/a/photo.jpg"); err == nil {
		t.Fatal("parent command lock should block child background work")
	}
}

func TestPathLockCoordinatorQueuedCommandHasPriority(t *testing.T) {
	locks := newPathLockCoordinator()
	releaseBackground, err := locks.acquire(context.Background(), pathLockBackground, "albums/a.jpg")
	if err != nil {
		t.Fatal(err)
	}
	commandAcquired := make(chan func(), 1)
	go func() {
		release, acquireErr := locks.acquire(context.Background(), pathLockCommand, "albums")
		if acquireErr == nil {
			commandAcquired <- release
		}
	}()
	time.Sleep(20 * time.Millisecond)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, err := locks.acquire(ctx, pathLockBackground, "albums/b.jpg"); err == nil {
		t.Fatal("new background work jumped ahead of a queued command")
	}
	releaseBackground()
	select {
	case releaseCommand := <-commandAcquired:
		releaseCommand()
	case <-time.After(time.Second):
		t.Fatal("queued command did not acquire after background release")
	}
}
